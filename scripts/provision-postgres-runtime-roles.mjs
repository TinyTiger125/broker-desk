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
  await client.query("REVOKE ALL ON SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await client.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM brokerdesk_runtime, brokerdesk_admin");
  await client.query("GRANT USAGE ON SCHEMA public TO brokerdesk_runtime");
  await client.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO brokerdesk_runtime
  `);
  await client.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO brokerdesk_runtime");
  await client.query("GRANT USAGE ON SCHEMA brokerdesk_private TO brokerdesk_runtime, brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.current_external_auth_subject() TO brokerdesk_runtime");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.current_user_id() TO brokerdesk_runtime");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO brokerdesk_runtime");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_user(TEXT) TO brokerdesk_runtime");
  await client.query("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA brokerdesk_private FROM brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) TO brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) TO brokerdesk_admin");
  await client.query("GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_next_import_jobs(INTEGER) TO brokerdesk_admin");
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
