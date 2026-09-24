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
const root = fs.mkdtempSync('/private/tmp/bd-case-lookup-pg17-');
const data = path.join(root, 'data');
const clients = [];
let running = false;
const temporaryLinks = [];
const sharePath = '/opt/homebrew/share/postgresql@17';
const libPath = '/opt/homebrew/lib/postgresql@17';
const evidence = { localOnly: true, baseline: 46, checks: [] };
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
  const baseline = await runPostgresMigrations({ client: db, clientConfig: { host: root, port: 55447, database: 'postgres', user: 'postgres' }, prepareEmptyDatabase: true, stopAfter: '20260924_002_admin_worker_identity_read.sql', log: () => {} });
  assert.equal(baseline.appliedCount, 46);

  await db.query('ALTER TABLE object_import_targets OWNER TO brokerdesk_admin');
  const policies=async()=>(await db.query("SELECT policyname,cmd,roles::text[],qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='object_import_targets' ORDER BY policyname")).rows;
  const beforePolicies=await policies();
  const adminAcl=async()=>(await db.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='object_import_targets' AND grantee='brokerdesk_admin' ORDER BY privilege_type")).rows;
  const beforeAdmin=await adminAcl();
  await db.query(`INSERT INTO users(id,name,email,password_hash,external_auth_subject) VALUES
    ('actor-a','Synthetic A','a@example.invalid','non-login','supabase:case-a'),
    ('actor-b','Synthetic B','b@example.invalid','non-login','supabase:case-b'),
    ('actor-c','Synthetic C','c@example.invalid','non-login','supabase:case-c');
    INSERT INTO tenants(id,name,slug,status,purchased_seat_count) VALUES ('tenant-a','Synthetic A','case-a','active',3),('tenant-b','Synthetic B','case-b','active',3);
    INSERT INTO tenant_memberships(id,tenant_id,user_id,role,capability,status,invitation_status) VALUES
    ('member-a','tenant-a','actor-a','broker','ordinary_member','active','accepted'),
    ('member-b','tenant-a','actor-b','broker','ordinary_member','active','accepted'),
    ('member-c','tenant-b','actor-c','broker','ordinary_member','active','accepted');`);
  for(const [suffix,tenant,user] of [['a','tenant-a','actor-a'],['b','tenant-a','actor-b'],['c','tenant-b','actor-c']]){
    await db.query("SELECT set_config('app.external_auth_subject',$1,false)",['supabase:case-'+suffix]);
    await db.query("INSERT INTO properties(id,tenant_id,name,listing_price,current_owner_user_id,owner_resolution_status,visibility_scope) VALUES ($1,$2,'Synthetic',1,$3,'resolved','private')",['property-'+suffix,tenant,user]);
    await db.query("INSERT INTO brokerage_cases(id,tenant_id,user_id,case_title,current_owner_user_id,owner_resolution_status,visibility_scope) VALUES ($1,$2,$3,'Synthetic',$3,'resolved','private')",['case-'+suffix,tenant,user]);
    await db.query("INSERT INTO import_jobs(id,tenant_id,user_id,source_type,title,target_entity,status) VALUES ($1,$2,$3,'excel','Synthetic','properties','queued')",['job-'+suffix,tenant,user]);
    await db.query("INSERT INTO attachments(id,tenant_id,user_id,target_type,target_id,file_name,file_type,storage_path) VALUES ($1,$2,$3,'import_job',$4,'synthetic.xlsx','application/octet-stream',$5)",['source-'+suffix,tenant,user,'job-'+suffix,'postgres-private://'+tenant+'/source-'+suffix]);
    await db.query("INSERT INTO object_import_targets(id,tenant_id,user_id,case_id,import_job_id,target_type,target_id,target_version,source_attachment_id,status,idempotency_key) VALUES ($1,$2,$3,$4,$5,'property',$6,'v1',$7,'queued',$1)",['target-'+suffix,tenant,user,'case-'+suffix,'job-'+suffix,'property-'+suffix,'source-'+suffix]);
  }
  const runtime=await connect();await runtime.query('SET ROLE brokerdesk_runtime');await runtime.query("SELECT set_config('app.external_auth_subject','supabase:case-a',false)");
  function extract(file,name){const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast);}
  function load(source,globals={}){const compiled={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiled,exports:compiled.exports,structuredClone,...globals});return compiled.exports;}
  const {getObjectImportCaseIdByJob:lookup}=load(extract('src/lib/data.postgres.ts','getObjectImportCaseIdByJob'),{getPool:()=>runtime});
  const scopeA={tenantId:'tenant-a',userId:'actor-a',importJobId:'job-a'};
  await assert.rejects(lookup(scopeA),{code:'42501'});evidence.checks.push('46 RED real lookup SQL denied 42501');
  const applied=await runPostgresMigrations({client:db,clientConfig:{host:root},stopAfter:'20260924_003_runtime_object_import_case_lookup.sql',log:()=>{}});assert.equal(applied.appliedCount,1);assert.equal(applied.skippedCount,46);
  assert.equal(await lookup(scopeA),'case-a');assert.equal(await lookup({...scopeA,importJobId:'missing'}),null);
  assert.equal(await lookup({...scopeA,tenantId:'tenant-b',userId:'actor-c',importJobId:'job-c'}),null);
  assert.equal(await lookup({...scopeA,userId:'actor-b',importJobId:'job-b'}),null);
  await runtime.query("SELECT set_config('app.external_auth_subject','',false)");assert.equal(await lookup(scopeA),null);
  await runtime.query("SELECT set_config('app.external_auth_subject','supabase:case-a',false)");
  await db.query("UPDATE tenant_memberships SET status='suspended' WHERE id='member-a'");assert.equal(await lookup(scopeA),null);await db.query("UPDATE tenant_memberships SET status='active' WHERE id='member-a'");
  for(const sql of ['SELECT id FROM object_import_targets','SELECT error_summary FROM object_import_targets','SELECT * FROM object_import_targets',"UPDATE object_import_targets SET case_id=case_id","DELETE FROM object_import_targets","INSERT INTO object_import_targets(tenant_id) VALUES ('tenant-a')"]){await assert.rejects(runtime.query(sql),{code:'42501'});}
  const columns=(await db.query("SELECT column_name,has_column_privilege('brokerdesk_runtime','public.object_import_targets',column_name,'SELECT') AS allowed FROM information_schema.columns WHERE table_schema='public' AND table_name='object_import_targets' ORDER BY column_name")).rows;
  assert.deepEqual(columns.filter(c=>c.allowed).map(c=>c.column_name),['case_id','import_job_id','tenant_id','user_id']);assert.deepEqual(await policies(),beforePolicies);assert.deepEqual(await adminAcl(),beforeAdmin);
  evidence.checks.push('47 GREEN scoped parent only; private cross-user/cross-tenant/no-subject/no-active-member denied; unrelated columns and all DML 42501; policies/admin unchanged');
  // Execute production memory implementation and W93 call sites, never a broad repository read.
  const {MemoryObjectImportRepository}=load(fs.readFileSync('src/lib/object-import-repository.memory.ts','utf8'));
  const memoryRepo=new MemoryObjectImportRepository([{id:'target-a',tenantId:'tenant-a',userId:'actor-a',importJobId:'job-a',caseId:'case-a'}],[]);
  const {getObjectImportCaseIdByJob:memory}=load(extract('src/lib/data.memory.ts','getObjectImportCaseIdByJob'),{objectImportRepository:()=>memoryRepo});
  assert.equal(await memory(scopeA),'case-a');assert.equal(await memory({...scopeA,userId:'actor-b'}),null);assert.equal(await memory({...scopeA,tenantId:'tenant-b'}),null);
  let narrowCalls=0;const attachment={id:'attachment',targetType:'import_job',targetId:'job-a',userId:'actor-a'};
  const stubs={getAttachmentByIdForTenant:async()=>attachment,getObjectImportCaseIdByJob:async input=>{assert.equal(input.importJobId,'job-a');assert.equal(input.tenantId,'tenant-a');assert.equal(input.userId,'actor-a');narrowCalls++;return null;},getBrokerageCaseByImportJobId:async()=>null,listAttachmentLinks:async()=>[]};
  const w93=load(fs.readFileSync('src/lib/w93-access.ts','utf8'),{require:name=>{assert.equal(name,'@/lib/data');return stubs;}});
  assert.equal(await w93.getW93AttachmentForContext({tenantId:'tenant-a',userId:'actor-a'},'attachment'),attachment);assert.equal(narrowCalls,2);
  stubs.getObjectImportCaseIdByJob=async()=> 'case-a';
  stubs.getBrokerageCaseByIdForContext=async input=>{assert.equal(input.caseId,'case-a');return {brokerageCase:{id:'case-a'},resolution:{canRead:true}};};
  assert.equal(await w93.getW93AttachmentForContext({tenantId:'tenant-a',userId:'actor-a'},'attachment'),attachment);
  stubs.getBrokerageCaseByIdForContext=async()=>({brokerageCase:null,resolution:{canRead:false}});
  assert.equal(await w93.getW93AttachmentForContext({tenantId:'tenant-a',userId:'actor-a'},'attachment'),null);
  stubs.getObjectImportCaseIdByJob=async()=> '';
  assert.equal(await w93.getW93AttachmentForContext({tenantId:'tenant-a',userId:'actor-a'},'attachment'),null);
  const facadeSource=fs.readFileSync('src/lib/data.ts','utf8');
  const facade=load(facadeSource.split('\n').find(line=>line.startsWith('export const getObjectImportCaseIdByJob:')),{repo:{getObjectImportCaseIdByJob:memory}});
  assert.equal(await facade.getObjectImportCaseIdByJob(scopeA),'case-a');

  assert(!fs.readFileSync('src/lib/w93-access.ts','utf8').includes('getObjectImportTargetByJob'));
  const grant='GRANT SELECT (tenant_id, user_id, import_job_id, case_id) ON public.object_import_targets TO brokerdesk_runtime';
  assert(fs.readFileSync('scripts/provision-postgres-runtime-roles.mjs','utf8').includes(grant));assert(fs.readFileSync('docs/engineering/postgres_runtime_roles.sql','utf8').includes(grant));
  await db.query('REVOKE SELECT (tenant_id,user_id,import_job_id,case_id) ON object_import_targets FROM brokerdesk_runtime');await assert.rejects(lookup(scopeA),{code:'42501'});await db.query(grant);assert.equal(await lookup(scopeA),'case-a');
  evidence.columns=columns;evidence.checks.push('memory and two W93 call sites use narrow lookup; provisioner and role SQL restore exact four columns');
  evidence.boundary='Local PostgreSQL17 only. Existing company_read policy semantics are unchanged; cross-user negative uses private owned objects. No worker/object DML authorization added.';evidence.pass=true;
} catch (error) {
  evidence.pass = false; evidence.failure = { message: error.message, code: error.code, stack: error.stack };
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(c => c.end()));
  if (running) run('pg_ctl', ['-D',data,'-m','immediate','-w','stop']);
  fs.rmSync(root,{recursive:true,force:true});
  for (const link of temporaryLinks) fs.unlinkSync(link);
  fs.writeFileSync('/tmp/tokyo-runtime-case47-pg17-result.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
