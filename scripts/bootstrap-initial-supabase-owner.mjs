import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  bootstrapInitialPlatformOwner,
  buildPoolConfig,
  assertNoPgEnvironment,
} from "./bootstrap-initial-platform-owner.mjs";

/**
 * Server-only, explicitly approved owner bootstrap. The Supabase user must
 * already exist; the database transaction uses the advisory lock, identity
 * table lock and single-commit bootstrap path. This command is intentionally
 * never called by a web route.
 */
export async function resolveExplicitSupabaseUser({ admin, userId, email }) {
  const normalizedId = userId?.trim();
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedId) || !normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Supabase bootstrap requires explicit --user-id and --email");
  }
  const { data, error } = await admin.auth.admin.getUserById(normalizedId);
  if (error || !data.user || data.user.id !== normalizedId || data.user.email?.trim().toLowerCase() !== normalizedEmail) {
    throw new Error("Supabase bootstrap user/email mismatch");
  }
  return { authUserId: data.user.id, email: data.user.email.trim().toLowerCase() };
}

export async function bootstrapInitialSupabaseOwner({ admin, client, userId, email, deploymentEnvironment, vercelEnvironment, explicitApproval = false }) {
  const user = await resolveExplicitSupabaseUser({ admin, userId, email });
  return bootstrapInitialPlatformOwner({
    client,
    email: user.email,
    supabaseIdentity: user,
    explicitApproval,
    deploymentEnvironment,
    vercelEnvironment,
  });
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function runFromCommandLine() {
  assertNoPgEnvironment();
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!databaseUrl || !url || !key) throw new Error("DATABASE_MIGRATION_URL, Supabase URL and service role key are required");
  if (process.env.BROKER_DESK_SUPABASE_OWNER_BOOTSTRAP_APPROVED !== "true") {
    throw new Error("BROKER_DESK_SUPABASE_OWNER_BOOTSTRAP_APPROVED=true is required for controlled owner bootstrap");
  }
  const { Pool } = await import("pg");
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const pool = new Pool(buildPoolConfig(databaseUrl));
  let client;
  try {
    client = await pool.connect();
    const result = await bootstrapInitialSupabaseOwner({
      admin,
      client,
      userId: readOption("--user-id"),
      email: readOption("--email"),
      explicitApproval: true,
      deploymentEnvironment: process.env.BROKER_DESK_DEPLOYMENT_ENV,
      vercelEnvironment: process.env.VERCEL_ENV,
    });
    console.log(`Supabase platform owner bootstrap completed for membership ${result.membershipId}.`);
  } catch {
    throw new Error("Controlled Supabase owner bootstrap failed safely");
  } finally {
    if (client) client.release();
    await pool.end().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runFromCommandLine();
}
