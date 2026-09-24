import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const envPath = resolve(process.cwd(), ".env.local");

if (existsSync(envPath) && !process.env.DATABASE_URL) {
  process.loadEnvFile(envPath);
}

const ownerConnectionString = (
  process.env.DATABASE_DEVELOPMENT_URL ?? process.env.DATABASE_URL ?? ""
).trim();

if (!ownerConnectionString) {
  throw new Error("DATABASE_URL or DATABASE_DEVELOPMENT_URL is required to provision runtime roles.");
}

const client = new Client({ connectionString: ownerConnectionString });
await client.connect();

try {
  const role = await client.query(
    "SELECT rolcreaterole, rolsuper FROM pg_roles WHERE rolname = current_user",
  );
  const owner = role.rows[0];
  if (!owner?.rolcreaterole && !owner?.rolsuper) {
    throw new Error("The current database connection cannot create constrained runtime roles.");
  }

  const runtimePassword = randomBytes(32).toString("base64url");
  const adminPassword = randomBytes(32).toString("base64url");

  await client.query("BEGIN");
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
        CREATE ROLE brokerdesk_runtime NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brokerdesk_admin') THEN
        CREATE ROLE brokerdesk_admin NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
    END $$;
  `);
  // base64url has no SQL quote characters. Keeping generated credentials in
  // this process avoids ever printing them or placing them in a shell command.
  await client.query(`ALTER ROLE brokerdesk_runtime LOGIN PASSWORD '${runtimePassword}'`);
  await client.query(`ALTER ROLE brokerdesk_admin LOGIN PASSWORD '${adminPassword}'`);
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('import_jobs', 'attachments', 'private_attachment_blobs', 'attachment_links', 'audit_logs')
          AND (pg_get_userbyid(c.relowner) <> 'brokerdesk_admin' OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
      ) THEN
        RAISE EXCEPTION 'runtime role setup requires brokerdesk_admin ownership and FORCE RLS on preimport tables' USING ERRCODE = '42501';
      END IF;
    END
    $$;
  `);
  await client.query("REVOKE ALL ON SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await client.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  // Reuse the immutable ACL baseline instead of a blanket table grant. This
  // keeps the programmatic provisioner aligned with the reviewed SQL role
  // setup and preserves identity reads plus tenant-scoped RLS boundaries.
  const aclBaseline = readFileSync(resolve(process.cwd(), "db/migrations/20260902_003_runtime_acl_baseline.sql"), "utf8");
  await client.query(aclBaseline);
  await client.query("GRANT USAGE ON SCHEMA public TO brokerdesk_runtime");
  // The lifecycle SECURITY DEFINER owner needs schema visibility plus only
  // the explicit relations touched by its current identity, import-claim,
  // synchronization, and preimport-delete paths. Keep this matrix narrow.
  await client.query("GRANT USAGE ON SCHEMA public TO brokerdesk_admin");
  await client.query("GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO brokerdesk_admin");
  await client.query("GRANT SELECT ON TABLE public.tenants TO brokerdesk_admin");
  await client.query("GRANT SELECT, UPDATE ON TABLE public.tenant_memberships TO brokerdesk_admin");
  await client.query("GRANT SELECT, UPDATE ON TABLE public.import_jobs TO brokerdesk_admin");
  await client.query("GRANT SELECT, DELETE ON TABLE public.attachments TO brokerdesk_admin");
  await client.query("GRANT SELECT, DELETE ON TABLE public.private_attachment_blobs TO brokerdesk_admin");
  await client.query("GRANT SELECT ON TABLE public.attachment_links TO brokerdesk_admin");
  await client.query("GRANT INSERT ON TABLE public.audit_logs TO brokerdesk_admin");
  await client.query("GRANT REFERENCES ON TABLE public.users, public.tenants TO brokerdesk_admin");
  await client.query("GRANT UPDATE (updated_at) ON TABLE public.tenants TO brokerdesk_admin");
  await client.query("GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime, brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.current_external_auth_subject() TO brokerdesk_runtime");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_runtime");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_runtime");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO brokerdesk_runtime");
  await client.query("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA brokerdesk_private FROM brokerdesk_admin");
  // Preserve the forward migration grants when resetting the admin function ACL.
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) TO brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) TO brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_next_import_jobs(INTEGER) TO brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_import_job_by_id(TEXT) TO brokerdesk_admin");
  await client.query("COMMIT");

  const url = new URL(ownerConnectionString);
  const runtimeUrl = new URL(ownerConnectionString);
  runtimeUrl.username = "brokerdesk_runtime";
  runtimeUrl.password = runtimePassword;
  const adminUrl = new URL(ownerConnectionString);
  adminUrl.username = "brokerdesk_admin";
  adminUrl.password = adminPassword;

  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const replacements = new Map([
    ["DATABASE_DEVELOPMENT_URL", url.toString()],
    ["DATABASE_URL", runtimeUrl.toString()],
    ["DATABASE_ADMIN_URL", adminUrl.toString()],
    ["BROKER_DESK_DATABASE_ROLES_PROVISIONED_AT", new Date().toISOString()],
  ]);
  let next = existing;
  for (const [name, value] of replacements) {
    const linePattern = new RegExp(`^${name}=.*$`, "m");
    next = linePattern.test(next)
      ? next.replace(linePattern, `${name}=${value}`)
      : `${next.trimEnd()}\n${name}=${value}\n`;
  }
  writeFileSync(envPath, next, { encoding: "utf8", mode: 0o600 });
  console.log("Provisioned restricted runtime and lifecycle roles. Credentials were written to .env.local only.");
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The statement may have failed before a transaction began.
  }
  throw error;
} finally {
  await client.end();
}
