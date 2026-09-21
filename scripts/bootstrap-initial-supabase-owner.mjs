import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  bootstrapInitialPlatformOwner,
  buildPoolConfig,
  runBootstrapWithPool,
  assertNoPgEnvironment,
} from "./bootstrap-initial-platform-owner.mjs";

/**
 * Server-only, controlled non-Production bootstrap. The Supabase user must
 * already exist; the database transaction remains the existing advisory-lock,
 * row-lock and single-commit bootstrap path. This command is intentionally
 * never called by a web route.
 */
export async function resolveExplicitSupabaseUser({ admin, userId, email }) {
  const normalizedId = userId?.trim();
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedId || !normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Supabase bootstrap requires explicit --user-id and --email");
  }
  const { data, error } = await admin.auth.admin.getUserById(normalizedId);
  if (error || !data.user || data.user.email?.trim().toLowerCase() !== normalizedEmail) {
    throw new Error("Supabase bootstrap user/email mismatch");
  }
  return { authUserId: data.user.id, email: data.user.email.trim().toLowerCase() };
}

export async function bootstrapInitialSupabaseOwner({ admin, client, userId, email, deploymentEnvironment, vercelEnvironment }) {
  const user = await resolveExplicitSupabaseUser({ admin, userId, email });
  const expectedSubject = `supabase:${user.authUserId}`;
  const scopedClient = {
    query: async (...args) => {
      const result = await client.query(...args);
      const sql = typeof args[0] === "string" ? args[0] : args[0]?.text;
      if (sql?.includes("/* bootstrap:resolve-user */") && result.rows.some((row) => row.external_auth_subject !== expectedSubject)) {
        throw new Error("Supabase bootstrap database mapping does not match the explicit Auth user");
      }
      return result;
    },
  };
  return bootstrapInitialPlatformOwner({
    client: scopedClient,
    email: user.email,
    deploymentEnvironment,
    vercelEnvironment,
  });
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function runFromCommandLine() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  assertNoPgEnvironment();
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!databaseUrl || !url || !key) throw new Error("DATABASE_MIGRATION_URL, Supabase URL and service role key are required");
  const { Pool } = await import("pg");
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const pool = new Pool(buildPoolConfig(databaseUrl));
  const client = await pool.connect();
  try {
    const result = await bootstrapInitialSupabaseOwner({
      admin,
      client,
      userId: readOption("--user-id"),
      email: readOption("--email"),
      deploymentEnvironment: process.env.BROKER_DESK_DEPLOYMENT_ENV,
      vercelEnvironment: process.env.VERCEL_ENV,
    });
    console.log(`Supabase platform owner bootstrap completed for membership ${result.membershipId}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runFromCommandLine();
}
