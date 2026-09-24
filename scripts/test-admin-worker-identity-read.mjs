#!/usr/bin/env node
// Local Unix-socket-only PG17 regression. Never reads database URLs or dotenv.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { runPostgresMigrations } from './run-postgres-migrations.mjs';
const bin = '/opt/homebrew/opt/postgresql@17/bin';
const root = fs.mkdtempSync('/private/tmp/bd-helper-pg17-');
const data = path.join(root, 'data');
const clients = [];
let running = false;
const temporaryLinks = [];
const sharePath = '/opt/homebrew/share/postgresql@17';
const libPath = '/opt/homebrew/lib/postgresql@17';
const evidence = { localOnly: true, baseline: 45, checks: [] };
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
  const baseline = await runPostgresMigrations({ client: db, clientConfig: { host: root, port: 55447, database: 'postgres', user: 'postgres' }, prepareEmptyDatabase: true, stopAfter: '20260924_001_admin_preimport_helper_execute.sql', log: () => {} });
  assert.equal(baseline.appliedCount, 45);
  await db.query("ALTER FUNCTION brokerdesk_private.claim_import_job_by_id(text) OWNER TO brokerdesk_admin");
  evidence.identityTables=(await db.query("SELECT relname,pg_get_userbyid(relowner) AS owner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('users'::regclass,'tenants'::regclass) ORDER BY relname")).rows;
  assert(evidence.identityTables.every(r=>r.owner==='postgres'&&r.relrowsecurity&&!r.relforcerowsecurity));
  await db.query(`INSERT INTO users(id,name,email,password_hash,external_auth_subject) VALUES
    ('actor','Synthetic A','actor@example.invalid','non-login','supabase:synthetic-a'),
    ('actor-b','Synthetic B','actor-b@example.invalid','non-login','supabase:synthetic-b'),
    ('no-subject','Synthetic missing subject','none@example.invalid','non-login',NULL);
    INSERT INTO tenants(id,name,slug,status,purchased_seat_count) VALUES
    ('tenant-a','Synthetic A','synthetic-a','active',3),('tenant-b','Synthetic B','synthetic-b','active',3);
    INSERT INTO tenant_memberships(id,tenant_id,user_id,role,capability,status,invitation_status) VALUES
    ('member-a','tenant-a','actor','tenant_owner','company_owner','active','accepted'),
    ('member-b','tenant-b','actor-b','tenant_owner','company_owner','active','accepted');`);
  for(const [id,tenant,user] of [['job-a','tenant-a','actor'],['job-b','tenant-b','actor-b'],['job-no-subject','tenant-a','no-subject']])
    await db.query("INSERT INTO import_jobs(id,tenant_id,user_id,source_type,title,target_entity,status) VALUES ($1,$2,$3,'excel','Synthetic','properties','queued')",[id,tenant,user]);
  const admin=await connect();await admin.query('SET ROLE brokerdesk_admin');
  const claim=id=>admin.query('SELECT * FROM brokerdesk_private.claim_import_job_by_id($1)',[id]);
  await assert.rejects(claim('job-a'),e=>e.code==='42501'&&/table users/.test(e.message));
  evidence.checks.push('45 RED: permission denied for table users');
  // Show why both row policies and can_access_user are necessary, without persisting trial ACLs.
  await db.query('BEGIN');
  await db.query('GRANT SELECT(id,external_auth_subject) ON users TO brokerdesk_admin; GRANT SELECT(id,status,service_start_at,service_end_at) ON tenants TO brokerdesk_admin');
  await db.query('SET LOCAL ROLE brokerdesk_admin');
  await assert.rejects(db.query("SELECT * FROM brokerdesk_private.claim_import_job_by_id('job-a')"),e=>e.code==='42501'&&/can_access_user/.test(e.message));
  await db.query('ROLLBACK');
  const applied=await runPostgresMigrations({client:db,clientConfig:{host:root},stopAfter:'20260924_002_admin_worker_identity_read.sql',log:()=>{}});
  assert.equal(applied.appliedCount,1);assert.equal(applied.skippedCount,45);
  assert.equal((await db.query("SELECT has_function_privilege('brokerdesk_admin','brokerdesk_private.current_external_auth_subject()','EXECUTE') AS allowed")).rows[0].allowed,false);
  for(const table of ['users','tenants']) assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['brokerdesk_admin',table,'SELECT'])).rows[0].allowed,false);
  assert.equal((await admin.query('SELECT id,external_auth_subject FROM users')).rowCount,3);
  assert.equal((await admin.query('SELECT id,status,service_start_at,service_end_at FROM tenants')).rowCount,2);
  for(const sql of ['SELECT email FROM users','SELECT name FROM users','SELECT name FROM tenants']) await assert.rejects(admin.query(sql),{code:'42501'});
  const runtime=await connect();await runtime.query('SET ROLE brokerdesk_runtime');
  await runtime.query("SELECT set_config('app.external_auth_subject','supabase:synthetic-a',false)");
  assert.equal((await runtime.query("SELECT id FROM users WHERE id='actor-b'")).rowCount,0);
  assert.equal((await runtime.query("SELECT id FROM tenants WHERE id='tenant-b'")).rowCount,0);
  await assert.rejects(runtime.query("SELECT * FROM brokerdesk_private.claim_import_job_by_id('job-b')"),{code:'42501'});
  await db.query('CREATE ROLE local_unprivileged NOLOGIN');const other=await connect();await other.query('SET ROLE local_unprivileged');
  await assert.rejects(other.query('SELECT id FROM users'),{code:'42501'});
  await assert.rejects(other.query('SELECT id FROM tenants'),{code:'42501'});
  evidence.checks.push('six allowed columns only; raw-subject denied; runtime tenant isolation and unprivileged role unchanged');
  // Admin is a token-authorized background worker: it intentionally needs no request subject.
  assert.equal((await admin.query("SELECT current_setting('app.external_auth_subject',true) AS subject")).rows[0].subject,null);
  const first=await claim('job-a');assert.equal(first.rowCount,1);assert.equal(first.rows[0].job_id,'job-a');
  assert.equal((await db.query("SELECT status FROM import_jobs WHERE id='job-b'")).rows[0].status,'queued');
  assert.equal((await claim('job-a')).rowCount,0);
  assert.equal((await claim('job-no-subject')).rowCount,0);
  await admin.query("SELECT set_config('app.external_auth_subject','supabase:synthetic-a',false)");
  assert.equal((await claim('job-b')).rowCount,1); // Explicit B is allowed, not a forged cross-tenant rejection.
  evidence.checks.push('one specified queued job only; repeat/null-job-subject rejected; admin explicitly claims B even with A request subject');
  for(const [label,status,start,end] of [
    ['suspended','suspended',null,null],['cancelled','cancelled',null,null],['pending','pending_activation',null,null],
    ['future','active','2099-01-01','2099-12-31'],['expired','active','2000-01-01','2000-12-31']]){
    await db.query("UPDATE tenants SET status=$1,service_start_at=$2,service_end_at=$3 WHERE id='tenant-a'",[status,start,end]);
    await db.query("UPDATE import_jobs SET status='queued' WHERE id='job-a'");
    assert.equal((await claim('job-a')).rowCount,0,label);
  }
  await db.query("UPDATE tenants SET status='active',service_start_at=NULL,service_end_at=NULL WHERE id='tenant-a'");
  await admin.query("SELECT set_config('app.external_auth_subject','',false)");
  const mutations=[
    ['users_columns','REVOKE SELECT(id,external_auth_subject) ON users FROM brokerdesk_admin'],
    ['tenants_columns','REVOKE SELECT(id,status,service_start_at,service_end_at) ON tenants FROM brokerdesk_admin'],
    ['user_helper','REVOKE EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) FROM brokerdesk_admin'],
    ['users_policy','DROP POLICY brokerdesk_admin_worker_users_read ON users'],
    ['tenants_policy','DROP POLICY brokerdesk_admin_worker_tenants_read ON tenants'],
  ];
  evidence.necessity=[];
  for(const [label,sql] of mutations){
    await db.query('BEGIN');await db.query(sql);await db.query('SET LOCAL ROLE brokerdesk_admin');
    let outcome;
    try{const r=await db.query("SELECT * FROM brokerdesk_private.claim_import_job_by_id('job-a')");assert.equal(r.rowCount,0,label);outcome={claimed:0};}
    catch(e){assert.equal(e.code,'42501',label);outcome={code:e.code};}
    finally{await db.query('ROLLBACK');}
    evidence.necessity.push({label,...outcome});
  }
  assert.equal((await claim('job-a')).rowCount,1);
  evidence.checks.push('suspended/cancelled/pending/future/expired blocked; each privilege or policy removal restores denial or zero claim');
  evidence.authLifecycleFunctions=(await db.query("SELECT proname,pg_get_userbyid(proowner) AS owner,prosecdef FROM pg_proc WHERE oid IN ('brokerdesk_private.sync_external_auth_user(text,text,text)'::regprocedure,'brokerdesk_private.suspend_external_auth_user(text)'::regprocedure) ORDER BY proname")).rows;
  assert.equal(evidence.authLifecycleFunctions.length,2);
  assert(evidence.authLifecycleFunctions.every(r=>r.owner==='postgres'&&r.prosecdef));
  for(const privilege of ['INSERT','UPDATE']) assert.equal((await db.query("SELECT has_table_privilege('brokerdesk_admin','users',$1) AS allowed",[privilege])).rows[0].allowed,false);
  const synced=(await admin.query("SELECT brokerdesk_private.sync_external_auth_user('supabase:lifecycle','lifecycle@example.invalid','Synthetic lifecycle') AS id")).rows[0].id;
  assert(synced);
  assert.equal((await admin.query("SELECT brokerdesk_private.sync_external_auth_user('supabase:lifecycle','lifecycle@example.invalid','Synthetic lifecycle') AS id")).rows[0].id,synced);
  // Existing placeholder binding exercises the helper's users UPDATE branch too.
  assert.equal((await admin.query("SELECT brokerdesk_private.sync_external_auth_user('supabase:bound-placeholder','none@example.invalid','Synthetic placeholder') AS id")).rows[0].id,'no-subject');
  assert.equal((await db.query("SELECT external_auth_subject FROM users WHERE id='no-subject'")).rows[0].external_auth_subject,'supabase:bound-placeholder');
  await db.query("INSERT INTO tenant_memberships(id,tenant_id,user_id,role,capability,status,invitation_status) VALUES ('lifecycle-member','tenant-a',$1,'broker','ordinary_member','active','accepted')",[synced]);
  const suspended=(await admin.query("SELECT brokerdesk_private.suspend_external_auth_user('supabase:lifecycle') AS result")).rows[0].result;
  assert.equal(suspended.userId,synced);assert.equal(suspended.suspendedMembershipCount,1);
  assert.equal((await db.query('SELECT external_auth_subject FROM users WHERE id=$1',[synced])).rows[0].external_auth_subject,null);
  assert.equal((await db.query("SELECT status FROM tenant_memberships WHERE id='lifecycle-member'")).rows[0].status,'suspended');
  evidence.checks.push('postgres-owned SECURITY DEFINER sync inserts/binds idempotently and suspend clears identity/revokes membership without caller users INSERT/UPDATE');
  evidence.boundary='Database claim only; worker mapped/payload/audit and cloud remain unverified. Admin is explicitly cross-tenant, runtime is tenant-scoped.';
  evidence.pass=true;
} catch (error) {
  evidence.pass = false; evidence.failure = { message: error.message, code: error.code, stack: error.stack };
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(c => c.end()));
  if (running) run('pg_ctl', ['-D',data,'-m','immediate','-w','stop']);
  fs.rmSync(root,{recursive:true,force:true});
  for (const link of temporaryLinks) fs.unlinkSync(link);
  fs.writeFileSync('/tmp/tokyo-worker46-pg17-result.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
