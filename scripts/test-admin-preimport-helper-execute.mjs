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
const evidence = { localOnly: true, baseline: 44, checks: [] };
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
  const baseline = await runPostgresMigrations({ client: db, clientConfig: { host: root, port: 55447, database: 'postgres', user: 'postgres' }, prepareEmptyDatabase: true, stopAfter: '20260921_002_import_worker_rls_admin_policy.sql', log: () => {} });
  assert.equal(baseline.appliedCount, 44);
  // Existing provisioning ACL: helpers remain postgres-owned while the trigger is admin-owned.
  await db.query(`GRANT USAGE ON SCHEMA public, brokerdesk_private TO brokerdesk_admin;
    GRANT SELECT,INSERT,UPDATE ON users TO brokerdesk_admin;
    GRANT SELECT ON tenants TO brokerdesk_admin;
    GRANT UPDATE(updated_at) ON tenants TO brokerdesk_admin;
    GRANT SELECT,UPDATE ON tenant_memberships TO brokerdesk_admin;
    GRANT REFERENCES ON users,tenants TO brokerdesk_admin;`);
  const acl = async () => (await db.query(`SELECT p.proname,pg_get_userbyid(p.proowner) AS owner,
    has_function_privilege('brokerdesk_admin',p.oid,'EXECUTE') AS allowed
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='brokerdesk_private' AND p.proname IN ('can_access_tenant','current_user_id','current_external_auth_subject') ORDER BY p.proname`)).rows;
  evidence.before = await acl();
  assert.ok(evidence.before.every(x => x.owner === 'postgres' && !x.allowed));
  const trigger = (await db.query("SELECT pg_get_userbyid(proowner) AS owner,prosecdef,proconfig FROM pg_proc WHERE oid='brokerdesk_private.guard_preimport_source_reference()'::regprocedure")).rows[0];
  assert.equal(trigger.owner, 'brokerdesk_admin'); assert.equal(trigger.prosecdef, true);
  assert.ok(trigger.proconfig.includes('row_security=on')); evidence.trigger = trigger;
  await db.query(`INSERT INTO users(id,name,email,password_hash,external_auth_subject) VALUES
    ('actor','Synthetic','actor@example.invalid','non-login','supabase:synthetic-actor');
    INSERT INTO tenants(id,name,slug,status,purchased_seat_count) VALUES
    ('tenant-a','Synthetic A','synthetic-a','active',3),('tenant-b','Synthetic B','synthetic-b','active',3);
    INSERT INTO tenant_memberships(id,tenant_id,user_id,role,capability,status,invitation_status)
    VALUES ('member','tenant-a','actor','tenant_owner','company_owner','active','accepted');`);
  const runtime = await connect();
  await runtime.query('SET ROLE brokerdesk_runtime');
  const scoped = async (fn, subject = 'supabase:synthetic-actor') => {
    await runtime.query('BEGIN');
    try { await runtime.query("SELECT set_config('app.external_auth_subject',$1,true)", [subject]); const value = await fn(); await runtime.query('COMMIT'); return value; }
    catch (error) { await runtime.query('ROLLBACK'); throw error; }
  };
  async function job(id, tenant = 'tenant-a') {
    await db.query(`INSERT INTO import_jobs(id,tenant_id,user_id,source_type,title,target_entity,status,notes,upload_lifecycle_version)
      VALUES ($1,$2,'actor','excel','Synthetic upload','properties','queued',$3,1)`, [id, tenant, JSON.stringify({kind:'property_row_import',rows:[{'物件名':'Synthetic'}]})]);
  }
  async function source(id, tenant = 'tenant-a') {
    await runtime.query(`INSERT INTO attachments(id,tenant_id,user_id,target_type,target_id,file_name,file_type,storage_path)
      VALUES ($1,$2,'actor','import_job',$3,'synthetic.xlsx','application/octet-stream',$4)`, [`source-${id}`,tenant,id,`postgres-private://${tenant}/source-${id}`]);
    await runtime.query('INSERT INTO private_attachment_blobs(attachment_id,tenant_id,content,sha256) VALUES ($1,$2,$3,$4)', [`source-${id}`,tenant,Buffer.from('synthetic'),'synthetic']);
  }
  await job('red');
  await assert.rejects(scoped(() => source('red')), error => {
    evidence.red = { code: error.code, message: error.message };
    return error.code === '42501' && /can_access_tenant/.test(error.message);
  });
  assert.equal(Number((await db.query("SELECT count(*) FROM attachments WHERE target_id='red'")).rows[0].count),0);
  for (const fn of ['claim_property_row_import','delete_preimport_property_upload']) {
    await assert.rejects(scoped(() => runtime.query(`SELECT brokerdesk_private.${fn}('tenant-a','red')`)), error => error.code === '42501' && /current_user_id/.test(error.message));
  }
  evidence.checks.push('baseline claim/delete both reject missing current_user_id EXECUTE');
  const applied = await runPostgresMigrations({ client: db, clientConfig: { host: root, port: 55447, database: 'postgres', user: 'postgres' }, log: () => {} });
  assert.equal(applied.appliedCount,1); assert.equal(applied.skippedCount,44);
  evidence.after = await acl();
  for (const row of evidence.after) assert.equal(row.allowed, row.proname !== 'current_external_auth_subject');
  await scoped(() => source('red'));
  assert.equal(Number((await db.query("SELECT count(*) FROM attachments a JOIN private_attachment_blobs b ON b.attachment_id=a.id WHERE a.target_id='red'")).rows[0].count),1);
  evidence.checks.push('runtime scoped attachment + private blob transaction persists');
  await job('foreign','tenant-b');
  await assert.rejects(scoped(() => source('foreign','tenant-b')), {code:'42501'});
  await job('no-subject');
  await assert.rejects(scoped(() => source('no-subject'), ''), {code:'42501'});
  assert.equal(Number((await db.query("SELECT count(*) FROM attachments WHERE target_id IN ('foreign','no-subject')")).rows[0].count),0);
  evidence.checks.push('cross-tenant and absent subject source writes rejected');
  await db.query("UPDATE import_jobs SET status='mapped' WHERE id='red'");
  assert.equal((await scoped(() => runtime.query("SELECT brokerdesk_private.claim_property_row_import('tenant-b','foreign') AS ok"))).rows[0].ok,false);
  assert.equal((await scoped(() => runtime.query("SELECT brokerdesk_private.claim_property_row_import('tenant-a','red') AS ok"))).rows[0].ok,true);
  await job('delete'); await scoped(() => source('delete'));
  await db.query("UPDATE import_jobs SET status='mapped' WHERE id='delete'");
  const denied = await scoped(() => runtime.query("SELECT brokerdesk_private.delete_preimport_property_upload('tenant-b','foreign') AS result"));
  assert.equal(denied.rows[0].result, false);
  const deleted = await scoped(() => runtime.query("SELECT brokerdesk_private.delete_preimport_property_upload('tenant-a','delete') AS result"));
  evidence.deleteResult = deleted.rows[0].result;
  evidence.localIdentityTableOwners = (await db.query("SELECT relname,pg_get_userbyid(relowner) AS owner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('public.tenants'::regclass,'public.tenant_memberships'::regclass) ORDER BY relname")).rows;
  await db.query('BEGIN; SET LOCAL ROLE brokerdesk_admin');
  await db.query("SELECT set_config('app.external_auth_subject','supabase:synthetic-actor',true)");
  evidence.adminTenantReadCount = (await db.query("SELECT id FROM tenants WHERE id='tenant-a'")).rowCount;
  evidence.adminTenantLockCount = (await db.query("SELECT id FROM tenants WHERE id='tenant-a' FOR UPDATE")).rowCount;
  await db.query('ROLLBACK');
  assert.equal(deleted.rows[0].result, false);
  evidence.deleteAcceptance = 'UNVERIFIED: local postgres-owned identity tables have SELECT-only RLS; false return must preserve source/job. Cloud identity-table ownership not established by this test.';
  assert.equal(Number((await db.query("SELECT count(*) FROM import_jobs WHERE id='delete'")).rows[0].count),1);
  assert.equal(Number((await db.query("SELECT count(*) FROM private_attachment_blobs WHERE attachment_id='source-delete'")).rows[0].count),1);
  assert.equal(Number((await db.query("SELECT count(*) FROM audit_logs WHERE target_id='delete' AND action='preimport_property_upload_deleted'")).rows[0].count),0);
  evidence.checks.push('claim succeeds with current_user_id; foreign claim/delete denied; local delete false leaves job/blob intact and creates no deletion audit');
  const rerun = await runPostgresMigrations({ client: db, clientConfig: { host: root, port: 55447, database: 'postgres', user: 'postgres' }, log: () => {} });
  assert.equal(rerun.appliedCount,0); assert.equal(rerun.skippedCount,45);
  evidence.pass = true;
} catch (error) {
  evidence.pass = false; evidence.failure = { message: error.message, code: error.code, stack: error.stack };
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(c => c.end()));
  if (running) run('pg_ctl', ['-D',data,'-m','immediate','-w','stop']);
  fs.rmSync(root,{recursive:true,force:true});
  for (const link of temporaryLinks) fs.unlinkSync(link);
  fs.writeFileSync('/tmp/tokyo-p1-helper-pg17-result.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
