#!/usr/bin/env node
// Local Unix-socket-only PG17 regression. Never reads database URLs or dotenv.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import vm from 'node:vm';
import ts from 'typescript';
import { runPostgresMigrations } from './run-postgres-migrations.mjs';
const bin = '/opt/homebrew/opt/postgresql@17/bin';
const root = fs.mkdtempSync('/private/tmp/bd-template-publish-pg17-');
const data = path.join(root, 'data');
const clients = [];
let running = false;
const temporaryLinks = [];
const sharePath = '/opt/homebrew/share/postgresql@17';
const libPath = '/opt/homebrew/lib/postgresql@17';
const evidence = { localOnly: true, baseline: 47, checks: [] };
const run = (name, args) => execFileSync(path.join(bin, name), args, { stdio: 'pipe', env: { PATH: `${bin}:/usr/bin:/bin`, LANG: 'C', HOME: process.env.HOME } });
async function connect() {
  const c = new pg.Client({ host: root, port: 55447, database: 'postgres', user: 'postgres', password: '' });
  c.on('error', () => {});
  await c.connect(); clients.push(c);
  await c.query("SET statement_timeout='10s'");
  return c;
}
try {
  // Existing Homebrew PG17 is unlinked; temporarily restore its compiled resource paths.
  for (const [target, source] of [[sharePath,path.join(bin,'../share/postgresql')],[libPath,path.join(bin,'../lib/postgresql')]]) {
    if (!fs.existsSync(target)) { fs.symlinkSync(source,target,'dir'); temporaryLinks.push(target); }
  }
  run('initdb', ['-D', data, '-L', path.join(bin,'../share/postgresql'), '-c', `dynamic_library_path=${path.join(bin,'../lib/postgresql')}`, '-U', 'postgres', '--no-locale', '--encoding=UTF8', '--auth-local=trust', '--auth-host=reject']);
  run('pg_ctl', ['-D', data, '-o', `-F -p 55447 -k ${root} -c listen_addresses='' -c unix_socket_permissions=0700`, '-l', path.join(root, 'postgres.log'), '-w', 'start']);
  running = true;
  const db = await connect();
  evidence.version = (await db.query('SHOW server_version')).rows[0].server_version;
  assert.match(evidence.version, /^17\./);

  const baseline = await runPostgresMigrations({ client: db, clientConfig: {host:root,port:55447,database:'postgres',user:'postgres'}, prepareEmptyDatabase:true, stopAfter:'20260924_003_runtime_object_import_case_lookup.sql',log:()=>{} });
  assert.equal(baseline.appliedCount,47);
  await db.query(`INSERT INTO users(id,name,email,password_hash,external_auth_subject) VALUES
    ('owner48','Owner','owner48@example.invalid','non-login','supabase:owner48'),
    ('member48','Member','member48@example.invalid','non-login','supabase:member48');
    INSERT INTO tenants(id,name,slug,status,purchased_seat_count) VALUES
    ('internal48','Internal','internal48','active',3),('tenant48','Accessible','tenant48','active',3),('foreign48','Foreign','foreign48','active',3);
    INSERT INTO tenant_memberships(id,tenant_id,user_id,role,capability,status,invitation_status) VALUES
    ('owner-member48','internal48','owner48','platform_owner','company_owner','active','accepted'),
    ('owner-access48','tenant48','owner48','broker','ordinary_member','active','accepted'),
    ('regular48','tenant48','member48','broker','ordinary_member','active','accepted');`);
  const runtime=await connect();await runtime.query('SET ROLE brokerdesk_runtime');
  const subject=async(c,s)=>c.query("SELECT set_config('app.external_auth_subject',$1,false)",[s]);
  await subject(runtime,'supabase:owner48');
  const template='zenhoren_individual_v1';
  const snapshot={templateId:template,baselineVersion:'local-test-v1',assetFingerprint:'local-synthetic',layoutOverrides:{field:{x:1}},deletedOverlayFieldKeys:[],customOverlayFields:[]};
  const args=['tenant48',template,snapshot.baselineVersion,snapshot.assetFingerprint,JSON.stringify(snapshot),'Synthetic local publish'];
  const sql='SELECT * FROM brokerdesk_private.publish_official_template_layout($1,$2,$3,$4,$5::jsonb,$6)';
  const direct=()=>runtime.query("UPDATE guarantee_template_layout_versions SET is_active=false WHERE template_id=$1",[template]);
  await assert.rejects(direct(),{code:'42501'});evidence.checks.push('47 RED real runtime publication UPDATE denied 42501');
  const applied=await runPostgresMigrations({client:db,clientConfig:{host:root},stopAfter:'20260924_004_official_template_publish.sql',log:()=>{}});
  assert.equal(applied.appliedCount,1);assert.equal(applied.skippedCount,47);
  const before=(await db.query('SELECT max(version_number)::int AS n FROM guarantee_template_layout_versions WHERE template_id=$1',[template])).rows[0].n;
  const first=(await runtime.query(sql,args)).rows[0];assert.equal(first.version_number,before+1);assert.equal(first.published_by_user_id,'owner48');
  const audit=()=>db.query("SELECT action,target_id,message,context_json,user_id,actor_id,tenant_id FROM audit_logs WHERE user_id='owner48' AND action IN ('guarantee_template_layout_published','guarantee_template_layout_saved') ORDER BY action,id");
  assert.equal((await audit()).rowCount,2);assert((await audit()).rows.every(r=>r.actor_id==='owner48'&&r.tenant_id==='tenant48'));
  evidence.checks.push('48 GREEN global owner publishes in separately accessible ordinary-member tenant with exactly two audits');
  for(const identity of ['', 'supabase:unknown48','supabase:member48']){await subject(runtime,identity);await assert.rejects(runtime.query(sql,args),{code:'42501'});}
  await subject(runtime,'supabase:owner48');await assert.rejects(runtime.query(sql,['foreign48',...args.slice(1)]),{code:'42501'});
  for(const member of ['owner-member48','owner-access48']){await db.query("UPDATE tenant_memberships SET status='suspended' WHERE id=$1",[member]);await assert.rejects(runtime.query(sql,args),{code:'42501'});await db.query("UPDATE tenant_memberships SET status='active' WHERE id=$1",[member]);}
  for(const [status,start,end] of [['suspended',null,null],['cancelled',null,null],['pending_activation',null,null],['active','2999-01-01',null],['active',null,'2000-01-01']]){
    await db.query('UPDATE tenants SET status=$1,service_start_at=$2,service_end_at=$3 WHERE id=\'tenant48\'',[status,start,end]);
    await assert.rejects(runtime.query(sql,args),{code:'42501'});
  }
  await db.query("UPDATE tenants SET status='active',service_start_at=NULL,service_end_at=NULL WHERE id='tenant48'");
  evidence.checks.push('no subject/unknown/ordinary user/foreign tenant/inactive owner or member/service invalid all denied 42501');
  for(const broken of [{...snapshot,templateId:'other'},{...snapshot,baselineVersion:'other'},{...snapshot,assetFingerprint:'other'},{...snapshot,layoutOverrides:[]},{...snapshot,deletedOverlayFieldKeys:null}]){
    await assert.rejects(runtime.query(sql,[...args.slice(0,4),JSON.stringify(broken),args[5]]),{code:'22023'});
  }
  await assert.rejects(runtime.query(sql,[args[0],'unknown',...args.slice(2)]),{code:'22023'});
  const state=async()=>({versions:(await db.query('SELECT * FROM guarantee_template_layout_versions WHERE template_id=$1 ORDER BY version_number',[template])).rows,audit:(await audit()).rows});
  const rollbackBefore=await state();
  await db.query(`CREATE FUNCTION public.test48_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='guarantee_template_layout_saved' THEN RAISE EXCEPTION 'local injected audit failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test48_audit_fail BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.test48_audit_fail();`);
  await assert.rejects(runtime.query(sql,args),{code:'P0001'});assert.deepEqual(await state(),rollbackBefore);
  await db.query('DROP TRIGGER test48_audit_fail ON public.audit_logs; DROP FUNCTION public.test48_audit_fail()');
  evidence.checks.push('second audit failure rolls back version, active flip, and first audit');
  const other=await connect();await other.query('SET ROLE brokerdesk_runtime');await subject(other,'supabase:owner48');
  const pair=await Promise.all([runtime.query(sql,args),other.query(sql,args)]);
  assert.deepEqual(pair.map(r=>r.rows[0].version_number).sort((a,b)=>a-b),[before+2,before+3]);
  const final=await state();assert.equal(final.versions.filter(v=>v.is_active).length,1);assert.equal(final.audit.length,6);
  evidence.checks.push('concurrent publications allocate consecutive versions, one active, and two audits each');
  await assert.rejects(direct(),{code:'42501'});
  await assert.rejects(runtime.query("INSERT INTO guarantee_template_layout_versions(id) VALUES ('forbidden48')"),{code:'42501'});
  const signature='brokerdesk_private.publish_official_template_layout(text,text,text,text,jsonb,text)';
  const acl=(await db.query("SELECT p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,has_function_privilege('brokerdesk_runtime',p.oid,'EXECUTE') AS runtime,has_function_privilege('brokerdesk_admin',p.oid,'EXECUTE') AS admin FROM pg_proc p WHERE p.oid=$1::regprocedure",[signature])).rows[0];
  assert.deepEqual(acl,{prosecdef:true,proconfig:['search_path=pg_catalog, public, pg_temp'],owner:'postgres',runtime:true,admin:false});
  // Exercise the exact post-REVOKE restoration statement without credentials or role provisioning.
  const grant='GRANT EXECUTE ON FUNCTION brokerdesk_private.publish_official_template_layout(TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) TO brokerdesk_runtime';
  for(const file of ['scripts/provision-postgres-runtime-roles.mjs','docs/engineering/postgres_runtime_roles.sql'])assert(fs.readFileSync(file,'utf8').includes(grant));
  await db.query(`REVOKE EXECUTE ON FUNCTION ${signature} FROM brokerdesk_runtime`);await assert.rejects(runtime.query(sql,args),{code:'42501'});await db.query(grant);
  assert.equal((await db.query('SELECT has_function_privilege(\'brokerdesk_runtime\',$1,\'EXECUTE\') AS ok',[signature])).rows[0].ok,true);
  evidence.checks.push('runtime direct DML remains denied; admin no RPC grant; exact grant restored after revoke');
  // Execute production repository code against PG; input actor cannot override request subject.
  const source=fs.readFileSync('src/lib/data.postgres.ts','utf8'),ast=ts.createSourceFile('repo.ts',source,ts.ScriptTarget.Latest,true);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='publishGuaranteeTemplateLayoutVersion').getText(ast);
  const module={exports:{}};vm.runInNewContext(ts.transpileModule(fn,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,ensureSchema:async()=>{},withTransaction:async callback=>{await runtime.query("BEGIN");try{await runtime.query("SELECT set_config('app.external_auth_subject','supabase:owner48',true)");const result=await callback(runtime);await runtime.query("COMMIT");return result;}catch(error){await runtime.query("ROLLBACK");throw error;}},mapGuaranteeTemplateLayoutVersion:r=>r});
  const mapped=await module.exports.publishGuaranteeTemplateLayoutVersion({tenantId:args[0],templateId:template,baselineVersion:args[2],assetFingerprint:args[3],layoutSnapshot:snapshot,publishedByUserId:'member48'});assert.equal(mapped.published_by_user_id,'owner48');
  const actions=fs.readFileSync('src/app/actions.ts','utf8');const branch=actions.slice(actions.indexOf('  if (layoutSaveScope === "template") {',actions.indexOf('async function saveGuaranteeApplicationPreviewWithScope')),actions.indexOf('  if (!brokerageCase || !caseId)'));
  assert(branch.includes('publishGuaranteeTemplateLayoutVersion({\n        tenantId,'));assert(!branch.includes('addAuditLog('));assert(!actions.includes('action: "guarantee_template_layout_saved"'));
  assert(source.includes('"20260924_004_official_template_publish.sql"'));
  evidence.checks.push('production repository uses scoped RPC; spoofed actor ignored; action adds no duplicate audit; required gate includes 48');
  evidence.pass=true;
} catch (error) {
  evidence.pass = false; evidence.failure = { message: error.message, code: error.code, stack: error.stack };
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(c => c.end()));
  if (running) run('pg_ctl', ['-D',data,'-m','immediate','-w','stop']);
  fs.rmSync(root,{recursive:true,force:true});
  for (const link of temporaryLinks) fs.unlinkSync(link);
  fs.writeFileSync('/tmp/official-template48-pg17-result.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
