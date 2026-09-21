import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  bootstrapInitialPlatformOwner,
  assertNoPgEnvironment,
} from "./bootstrap-initial-platform-owner.mjs";

export const SUPABASE_PROJECT_REF = "ilujuwuzaqwcbpnqixen";
export const SUPABASE_POOLER_HOST = "aws-0-ap-northeast-1.pooler.supabase.com";
export const SUPABASE_DATABASE_NAME = "postgres";
export const SUPABASE_POOLER_PORT = 5432;
export const SUPABASE_CA_SHA256 = "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7";

function assertSupabaseStagingEnvironment({ deploymentEnvironment, vercelEnvironment }) {
  if (deploymentEnvironment !== "staging" || vercelEnvironment !== "preview") {
    throw new Error("Supabase owner bootstrap requires the fixed Staging Preview environment");
  }
}

function parseSupabaseProjectUrl(supabaseUrl) {
  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("invalid Supabase project URL");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== `${SUPABASE_PROJECT_REF}.supabase.co` || (parsed.pathname !== "" && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error("Supabase project URL does not match the fixed Tokyo validation project");
  }
  return parsed;
}

function readPinnedSupabaseCa(caPath) {
  if (typeof caPath !== "string" || !caPath.trim()) throw new Error("DATABASE_MIGRATION_CA_CERT_PATH is required");
  let ca;
  try {
    ca = readFileSync(caPath);
  } catch {
    throw new Error("Supabase CA certificate is unavailable");
  }
  if (!ca.includes("BEGIN CERTIFICATE") || createHash("sha256").update(ca).digest("hex") !== SUPABASE_CA_SHA256) {
    throw new Error("Supabase CA certificate fingerprint mismatch");
  }
  return ca;
}

export function buildSupabasePoolConfig({ connectionString, supabaseUrl, caPath }) {
  parseSupabaseProjectUrl(supabaseUrl);
  if (typeof connectionString !== "string" || connectionString.trim() !== connectionString || !/^(postgres|postgresql):\/\//.test(connectionString)) {
    throw new Error("invalid Supabase migration database target");
  }
  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error("invalid Supabase migration database target");
  }
  if (!["postgres:", "postgresql:"].includes(target.protocol) || target.search || target.hash || target.hostname !== SUPABASE_POOLER_HOST || Number(target.port || SUPABASE_POOLER_PORT) !== SUPABASE_POOLER_PORT) {
    throw new Error("Supabase migration database target does not match the fixed Tokyo pooler");
  }
  let user;
  let password;
  let database;
  try {
    user = decodeURIComponent(target.username);
    password = decodeURIComponent(target.password);
    database = decodeURIComponent(target.pathname.slice(1));
  } catch {
    throw new Error("invalid Supabase migration database target");
  }
  if (user !== `postgres.${SUPABASE_PROJECT_REF}` || database !== SUPABASE_DATABASE_NAME || !password) {
    throw new Error("Supabase migration database target does not match the fixed Tokyo project");
  }
  const ca = readPinnedSupabaseCa(caPath);
  return {
    host: SUPABASE_POOLER_HOST,
    port: SUPABASE_POOLER_PORT,
    database: SUPABASE_DATABASE_NAME,
    user,
    password,
    ssl: { ca, rejectUnauthorized: true },
    options: "-c search_path=pg_catalog,public",
    replication: "false",
    application_name: "broker-desk-supabase-owner-bootstrap",
    max: 1,
  };
}

export async function runSupabaseOwnerPreflight({ Pool, connectionString, supabaseUrl, caPath, deploymentEnvironment, vercelEnvironment }) {
  assertNoPgEnvironment();
  assertSupabaseStagingEnvironment({ deploymentEnvironment, vercelEnvironment });
  const pool = new Pool(buildSupabasePoolConfig({ connectionString, supabaseUrl, caPath }));
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query("SELECT current_database() AS database, current_user AS user_name, current_schema() AS schema, current_setting('transaction_read_only') AS transaction_read_only");
    await client.query("ROLLBACK");
    return result.rows[0];
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    throw new Error("Supabase owner preflight failed safely");
  } finally {
    if (client) client.release();
    await pool.end().catch(() => undefined);
  }
}

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
  const caPath = process.env.DATABASE_MIGRATION_CA_CERT_PATH?.trim();
  const preflight = process.argv.includes("--preflight");
  if (!databaseUrl || !url || (!preflight && !key)) throw new Error("DATABASE_MIGRATION_URL, Supabase URL and required Supabase credentials are required");
  if (!preflight && process.env.BROKER_DESK_SUPABASE_OWNER_BOOTSTRAP_APPROVED !== "true") {
    throw new Error("BROKER_DESK_SUPABASE_OWNER_BOOTSTRAP_APPROVED=true is required for controlled owner bootstrap");
  }
  assertSupabaseStagingEnvironment({ deploymentEnvironment: process.env.BROKER_DESK_DEPLOYMENT_ENV, vercelEnvironment: process.env.VERCEL_ENV });
  const { Pool } = await import("pg");
  const poolConfig = buildSupabasePoolConfig({ connectionString: databaseUrl, supabaseUrl: url, caPath });
  if (preflight) {
    const metadata = await runSupabaseOwnerPreflight({ Pool, connectionString: databaseUrl, supabaseUrl: url, caPath, deploymentEnvironment: process.env.BROKER_DESK_DEPLOYMENT_ENV, vercelEnvironment: process.env.VERCEL_ENV });
    console.log(`Supabase owner preflight passed for ${metadata.database}/${metadata.user_name}`);
    return;
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const pool = new Pool(poolConfig);
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
