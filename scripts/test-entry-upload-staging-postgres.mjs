#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import ts from "typescript";
import { runPostgresMigrations } from "./run-postgres-migrations.mjs";

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postgresBin = "/opt/homebrew/opt/postgresql@16/bin";
const root = mkdtempSync(join(tmpdir(), "brokerdesk-entry-staging-pg-"));
const dataDirectory = join(root, "data");
const port = 55449;
const databaseName = "brokerdesk_entry_staging_test";
const bootstrapUrl = `postgresql://qa_initializer@127.0.0.1:${port}/postgres`;
const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`;
const runtimePassword = "entry-staging-runtime-test";
const runtimeUrl = `postgresql://brokerdesk_runtime:${runtimePassword}@127.0.0.1:${port}/${databaseName}`;
let running = false;

function runPostgresBinary(name, args) {
  return execFileSync(join(postgresBin, name), args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, PATH: `${postgresBin}:/usr/bin:/bin`, LANG: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function connect(url) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}

async function insertStaging(client, { id, tenantId, userId, expiresAt, fileName = `${id}.pdf` }) {
  const content = Buffer.from(`synthetic-${id}`);
  await client.query(
    `INSERT INTO public.entry_upload_staging
      (id, tenant_id, user_id, file_name, file_type, file_size_bytes, sha256,
       chunk_size_bytes, chunk_count, status, expires_at)
     VALUES ($1,$2,$3,$4,'application/pdf',$5,$6,1048576,1,'open',$7)`,
    [id, tenantId, userId, fileName, content.length, sha256(content), expiresAt],
  );
  await client.query(
    `INSERT INTO public.entry_upload_staging_chunks
      (staging_id, tenant_id, chunk_index, content, sha256, byte_size)
     VALUES ($1,$2,0,$3,$4,$5)`,
    [id, tenantId, content, sha256(content), content.length],
  );
}

async function loadPostgresAdapter() {
  process.env.NODE_ENV = "development";
  process.env.DATA_DRIVER = "postgres";
  process.env.DATABASE_URL = databaseUrl.replace("postgres@", `brokerdesk_runtime:${runtimePassword}@`);
  process.env.DATABASE_DEVELOPMENT_URL = process.env.DATABASE_URL;
  process.env.BROKER_DESK_AUTH_MODE = "demo";
  process.env.BROKER_DESK_TEST_REQUEST_SCOPE = "1";
  process.env.BROKER_DESK_LOCAL_RUNTIME = "1";
  const moduleCache = new Map();
  const resolveAlias = (request) => {
    const relative = request.slice(2);
    const candidates = [".ts", ".tsx", ".mjs", ".js", ".cjs"].map((extension) => path.resolve(repoRoot, "src", `${relative}${extension}`));
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  };
  const loadTs = (sourcePath) => {
    const absolutePath = path.resolve(repoRoot, sourcePath);
    if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
    const compiled = ts.transpileModule(readFileSync(absolutePath, "utf8"), {
      fileName: absolutePath,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const compiledModule = new Module(absolutePath);
    compiledModule.filename = absolutePath;
    compiledModule.paths = Module._nodeModulePaths(repoRoot);
    moduleCache.set(absolutePath, compiledModule);
    const originalRequire = compiledModule.require.bind(compiledModule);
    compiledModule.require = (request) => request.startsWith("@/") ? loadTs(resolveAlias(request)) : originalRequire(request);
    compiledModule._compile(compiled, absolutePath);
    return compiledModule.exports;
  };
  return loadTs("src/lib/data.postgres.ts");
}

try {
  runPostgresBinary("initdb", ["-D", dataDirectory, "-U", "qa_initializer", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=trust"]);
  runPostgresBinary("pg_ctl", ["-D", dataDirectory, "-o", `-F -p ${port} -h 127.0.0.1`, "-l", join(root, "postgres.log"), "-w", "start"]);
  running = true;

  const bootstrap = await connect(bootstrapUrl);
  await bootstrap.query("CREATE ROLE postgres LOGIN SUPERUSER CREATEDB CREATEROLE BYPASSRLS");
  await bootstrap.query(`CREATE DATABASE ${databaseName} OWNER postgres`);
  await bootstrap.end();

  await runPostgresMigrations({ databaseUrl, prepareEmptyDatabase: true, log: () => {} });

  const admin = await connect(databaseUrl);
  await admin.query(`ALTER ROLE brokerdesk_runtime LOGIN PASSWORD '${runtimePassword}'`);
  // Mirror both local/provisioner role resets: the migration ACL must survive
  // a blanket revoke followed by the narrow staging grants.
  await admin.query("REVOKE ALL ON SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await admin.query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await admin.query("GRANT USAGE ON SCHEMA public TO brokerdesk_runtime, brokerdesk_admin");
  await admin.query("GRANT SELECT, DELETE ON TABLE public.attachments, public.private_attachment_blobs TO brokerdesk_admin");
  await admin.query("GRANT SELECT ON TABLE public.broker_desk_schema_migrations TO brokerdesk_runtime");
  await admin.query("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.entry_upload_staging, public.entry_upload_staging_chunks TO brokerdesk_runtime");
  await admin.query("GRANT SELECT, UPDATE, DELETE ON TABLE public.entry_upload_staging TO brokerdesk_admin");
  await admin.query("GRANT SELECT, DELETE ON TABLE public.entry_upload_staging_chunks TO brokerdesk_admin");
  await admin.query(
    `INSERT INTO public.users (id, name, email, password_hash, external_auth_subject) VALUES
      ('staging_user_a', 'Synthetic staging user A', 'staging-a@example.test', 'synthetic', 'staging-subject-a'),
      ('staging_user_b', 'Synthetic staging user B', 'staging-b@example.test', 'synthetic', 'staging-subject-b'),
      ('staging_user_c', 'Synthetic staging user C', 'staging-c@example.test', 'synthetic', 'staging-subject-c')`,
  );
  await admin.query(
    `INSERT INTO public.tenants (id, name, slug, account_type, status, purchased_seat_count) VALUES
      ('staging_tenant_a', 'Synthetic staging tenant A', 'staging-tenant-a', 'company', 'active', 10),
      ('staging_tenant_b', 'Synthetic staging tenant B', 'staging-tenant-b', 'company', 'active', 10)`,
  );
  await admin.query(
    `INSERT INTO public.tenant_memberships
      (id, tenant_id, user_id, role, capability, status, invitation_provider,
       invitation_status, invitation_delivery_state, invited_by_user_id)
     VALUES
      ('staging_membership_a_a', 'staging_tenant_a', 'staging_user_a', 'tenant_owner', 'company_owner', 'active', 'manual', 'accepted', 'ready', 'staging_user_a'),
      ('staging_membership_a_b', 'staging_tenant_a', 'staging_user_b', 'broker', 'ordinary_member', 'active', 'manual', 'accepted', 'ready', 'staging_user_b'),
      ('staging_membership_a_c', 'staging_tenant_a', 'staging_user_c', 'broker', 'ordinary_member', 'active', 'manual', 'accepted', 'ready', 'staging_user_c'),
      ('staging_membership_b_b', 'staging_tenant_b', 'staging_user_b', 'broker', 'ordinary_member', 'active', 'manual', 'accepted', 'ready', 'staging_user_b')`,
  );

  const acl = (await admin.query(
    `SELECT
       has_table_privilege('brokerdesk_admin', 'public.entry_upload_staging', 'SELECT') AS parent_select,
       has_table_privilege('brokerdesk_admin', 'public.entry_upload_staging', 'UPDATE') AS parent_update,
       has_table_privilege('brokerdesk_admin', 'public.entry_upload_staging', 'DELETE') AS parent_delete,
       has_table_privilege('brokerdesk_admin', 'public.entry_upload_staging_chunks', 'SELECT') AS chunks_select,
       has_table_privilege('brokerdesk_admin', 'public.entry_upload_staging_chunks', 'DELETE') AS chunks_delete`,
  )).rows[0];
  assert.deepEqual(acl, { parent_select: true, parent_update: true, parent_delete: true, chunks_select: true, chunks_delete: true }, "admin cleanup role must lock/read/delete staging rows and cascade chunks");

  const runtimeA = await connect(runtimeUrl);
  await runtimeA.query("SELECT set_config('app.external_auth_subject', 'staging-subject-a', false)");
  await runtimeA.query("SET statement_timeout = '5000'");
  await runtimeA.query("BEGIN");
  await insertStaging(runtimeA, { id: "staging_parent_a", tenantId: "staging_tenant_a", userId: "staging_user_a", expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
  await runtimeA.query("COMMIT");
  const visibleA = await runtimeA.query("SELECT count(*)::int AS count FROM public.entry_upload_staging WHERE tenant_id='staging_tenant_a'");
  assert.equal(visibleA.rows[0].count, 1, "same-tenant staging row must be visible to its authenticated user");
  await insertStaging(admin, { id: "staging_parent_b_user_a", tenantId: "staging_tenant_b", userId: "staging_user_a", expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
  const crossTenant = await runtimeA.query("SELECT count(*)::int AS count FROM public.entry_upload_staging WHERE id='staging_parent_b_user_a'");
  assert.equal(crossTenant.rows[0].count, 0, "same user must not see staging from an unjoined tenant");
  const crossDelete = await runtimeA.query("DELETE FROM public.entry_upload_staging WHERE id='staging_parent_b_user_a'");
  assert.equal(crossDelete.rowCount, 0, "same user must not delete staging from an unjoined tenant");
  await runtimeA.end();

  const runtimeB = await connect(runtimeUrl);
  await runtimeB.query("SELECT set_config('app.external_auth_subject', 'staging-subject-b', false)");
  await insertStaging(admin, { id: "staging_parent_mismatch", tenantId: "staging_tenant_a", userId: "staging_user_b", expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
  await runtimeB.query("BEGIN");
  await assert.rejects(
    () => runtimeB.query(
      `INSERT INTO public.entry_upload_staging_chunks
        (staging_id, tenant_id, chunk_index, content, sha256, byte_size)
       VALUES ('staging_parent_mismatch', 'staging_tenant_b', 1, decode('61', 'hex'), $1, 1)`,
      [sha256(Buffer.from("a"))],
    ),
    /row-level security|policy/,
    "a staging insert must still be tenant-bound",
  );
  await runtimeB.query("ROLLBACK");
  await runtimeB.end();

  await insertStaging(admin, { id: "staging_expired_user", tenantId: "staging_tenant_a", userId: "staging_user_a", expiresAt: new Date(Date.now() - 1_000) });
  const runtimeCleanup = await connect(runtimeUrl);
  await runtimeCleanup.query("SELECT set_config('app.external_auth_subject', 'staging-subject-a', false)");
  const cleaned = await runtimeCleanup.query("SELECT brokerdesk_private.cleanup_expired_entry_upload_staging('staging_tenant_a', 'staging_user_a', 100) AS count");
  assert.equal(Number(cleaned.rows[0].count), 1, "authenticated TTL cleanup must delete only the actor tenant rows");
  const expiredChunks = await admin.query("SELECT count(*)::int AS count FROM public.entry_upload_staging_chunks WHERE staging_id='staging_expired_user'");
  assert.equal(expiredChunks.rows[0].count, 0, "TTL parent deletion must cascade chunks");
  await runtimeCleanup.end();

  await insertStaging(admin, { id: "staging_expired_system", tenantId: "staging_tenant_b", userId: "staging_user_a", expiresAt: new Date(Date.now() - 1_000) });
  await admin.query("SET ROLE brokerdesk_admin");
  const adminExpired = await admin.query("SELECT current_user AS role_name, count(*)::int AS count FROM public.entry_upload_staging WHERE expires_at <= NOW()");
  assert.equal(adminExpired.rows[0].role_name, "brokerdesk_admin");
  assert.ok(adminExpired.rows[0].count >= 1, "admin worker must see expired rows before cleanup");
  const cleanupOwner = await admin.query("SELECT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid = 'brokerdesk_private.cleanup_expired_entry_upload_staging_system(integer)'::regprocedure");
  assert.equal(cleanupOwner.rows[0].owner, "brokerdesk_admin");
  const directExpired = await admin.query("SELECT id FROM public.entry_upload_staging WHERE expires_at <= NOW() ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED");
  assert.ok(directExpired.rows.some((row) => row.id === "staging_expired_system"), "admin worker selector must lock the expired row");
  const systemCleaned = await admin.query("SELECT brokerdesk_private.cleanup_expired_entry_upload_staging_system(500) AS count");
  assert.ok(Number(systemCleaned.rows[0].count) >= 1, "worker cleanup must delete expired rows across tenants");
  await admin.query("RESET ROLE");

  await admin.query("DELETE FROM public.tenant_memberships WHERE tenant_id='staging_tenant_b'");
  await admin.query("DELETE FROM public.tenants WHERE id='staging_tenant_b'");
  const cascadeRows = await admin.query("SELECT count(*)::int AS count FROM public.entry_upload_staging WHERE tenant_id='staging_tenant_b'");
  const cascadeChunks = await admin.query("SELECT count(*)::int AS count FROM public.entry_upload_staging_chunks WHERE tenant_id='staging_tenant_b'");
  assert.equal(cascadeRows.rows[0].count, 0, "tenant deletion must cascade staging parents");
  assert.equal(cascadeChunks.rows[0].count, 0, "tenant deletion must cascade staging chunks");

  const adapter = await loadPostgresAdapter();
  const quotaInputs = Array.from({ length: 8 }, (_, index) => adapter.withPostgresAuthContext(
    "staging-subject-c",
    () => adapter.createEntryUploadStaging({
      tenantId: "staging_tenant_a",
      userId: "staging_user_c",
      fileName: `quota-${index}.pdf`,
      fileType: "application/pdf",
      fileSizeBytes: 1,
      sha256: sha256(Buffer.from([index])),
      chunkCount: 1,
    }),
  ));
  const quotaResults = await Promise.allSettled(quotaInputs);
  assert.equal(quotaResults.filter((result) => result.status === "fulfilled").length, 6, "concurrent init must allow at most six active files");
  assert.equal(quotaResults.filter((result) => result.status === "rejected" && String(result.reason?.message).includes("entry_upload_staging_quota_exceeded")).length, 2, "concurrent init must reject quota overflow");

  await admin.end();
  console.log("entry-upload staging PostgreSQL roles/RLS/TTL/cascade/concurrent quota: PASS");
} finally {
  if (running) {
    try { runPostgresBinary("pg_ctl", ["-D", dataDirectory, "-m", "immediate", "-w", "stop"]); } catch { /* best effort cleanup of this temporary cluster */ }
  }
  rmSync(root, { recursive: true, force: true });
}
