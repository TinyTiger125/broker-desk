import { Pool } from "pg";
import { existsSync } from "node:fs";

if (!process.env.DATABASE_MIGRATION_URL && !process.env.DATABASE_DEVELOPMENT_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

const email = readOption("--email")?.toLowerCase();
const useLatestClerkUser = process.argv.includes("--latest-clerk-user");
const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_DEVELOPMENT_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_MIGRATION_URL or DATABASE_DEVELOPMENT_URL is required");
}

if ((!email || !email.includes("@")) && !useLatestClerkUser) {
  throw new Error("Use --email with an existing Clerk user's email address, or --latest-clerk-user for a controlled initial bootstrap");
}

if (email && useLatestClerkUser) {
  throw new Error("Use either --email or --latest-clerk-user, not both");
}

const db = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

try {
  await db.query("BEGIN");

  const userResult = email
    ? await db.query(
      "SELECT id FROM users WHERE lower(email) = lower($1) AND external_auth_subject IS NOT NULL LIMIT 1",
      [email],
    )
    : await db.query(
      `SELECT id
       FROM users
       WHERE external_auth_subject IS NOT NULL
         AND email NOT LIKE '%@brokerdesk.local'
       ORDER BY created_at DESC
       LIMIT 2`,
    );
  if (useLatestClerkUser && userResult.rows.length !== 1) {
    throw new Error("Controlled bootstrap requires exactly one real Clerk user");
  }
  const user = userResult.rows[0];
  if (!user) {
    throw new Error("The owner must sign in through Clerk before platform bootstrap");
  }

  const existingOwner = await db.query(
    "SELECT id FROM tenant_memberships WHERE role = 'platform_owner' AND status = 'active' LIMIT 1",
  );
  if (existingOwner.rows[0]) {
    throw new Error("An active platform owner already exists; bootstrap is closed");
  }

  await db.query(
    `INSERT INTO tenants (id, name, slug, account_type, status, purchased_seat_count)
     VALUES ('tenant_broker_desk_internal', 'Broker Desk 内部工作区', 'broker-desk-internal', 'company', 'active', 5)
     ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = NOW()`,
  );
  await db.query(
    `INSERT INTO tenant_memberships (
       id, tenant_id, user_id, role, status, invitation_provider, invitation_status, invitation_accepted_at
     ) VALUES (
       'membership_broker_desk_platform_owner',
       'tenant_broker_desk_internal',
       $1,
       'platform_owner',
       'active',
       'manual',
       'accepted',
       NOW()
     )
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET
       role = 'platform_owner',
       status = 'active',
       invitation_provider = 'manual',
       invitation_status = 'accepted',
       invitation_accepted_at = NOW(),
       updated_at = NOW()`,
    [user.id],
  );
  await db.query(
    `INSERT INTO audit_logs (id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json)
     VALUES (
       'audit_initial_platform_owner',
       'tenant_broker_desk_internal',
       $1,
       $1,
       'platform.bootstrap',
       'tenant_membership',
       'membership_broker_desk_platform_owner',
       'Initial platform owner bootstrap completed',
       '{"source":"scripts/bootstrap-initial-platform-owner.mjs"}'::jsonb
     )
     ON CONFLICT (id) DO NOTHING`,
    [user.id],
  );

  await db.query("COMMIT");
  console.log("Initial platform owner bootstrap completed.");
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
