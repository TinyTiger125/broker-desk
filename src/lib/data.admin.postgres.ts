import "server-only";

import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "@/lib/database-connection";
import { isProductionRuntime, ProductionReadinessError } from "@/lib/production-readiness";

type AdminGlobal = typeof globalThis & {
  __brokerDeskPostgresAdminPool?: Pool;
};

const adminGlobal = globalThis as AdminGlobal;
let pool: Pool | null = adminGlobal.__brokerDeskPostgresAdminPool ?? null;
let roleCheck: Promise<void> | null = null;

function getAdminConnectionString(): string {
  const connectionString = (
    process.env.DATABASE_ADMIN_URL ??
    (isProductionRuntime() ? "" : process.env.DATABASE_DEVELOPMENT_URL ?? process.env.DATABASE_URL) ??
    ""
  ).trim();
  if (!connectionString) {
    throw new ProductionReadinessError("production_admin_database_required");
  }
  return normalizeDatabaseConnectionString(connectionString) ?? connectionString;
}

function getAdminPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getAdminConnectionString(),
      max: 2,
      min: 0,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 10_000,
    });
    adminGlobal.__brokerDeskPostgresAdminPool = pool;
    pool.on("error", () => {});
  }
  return pool;
}

async function assertAdminRoleSafe(): Promise<void> {
  if (!isProductionRuntime()) return;
  if (!roleCheck) {
    roleCheck = getAdminPool()
      .query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
      )
      .then((result) => {
        const role = result.rows[0];
        if (!role || role.rolsuper || role.rolbypassrls) {
          throw new ProductionReadinessError("production_database_role_unsafe");
        }
      })
      .catch((error) => {
        roleCheck = null;
        throw error;
      });
  }
  await roleCheck;
}

/**
 * This module is intentionally limited to identity-provider lifecycle events
 * and bounded worker job claims.
 * It must never be imported from pages, server actions, or tenant repositories.
 */
export async function syncExternalAuthUser(input: {
  subject: string;
  email?: string;
  name?: string;
}): Promise<{ userId?: string }> {
  const subject = input.subject.trim();
  if (!subject) return {};

  await assertAdminRoleSafe();

  const result = await getAdminPool().query<{ user_id: string }>(
    "SELECT brokerdesk_private.sync_external_auth_user($1, $2, $3) AS user_id",
    [subject, input.email?.trim().toLowerCase() || null, input.name?.trim() || null],
  );
  return { userId: result.rows[0]?.user_id };
}

export type ClaimedImportJob = {
  jobId: string;
  tenantId: string;
  userId: string;
  externalAuthSubject: string;
  sourceType: "excel" | "scan";
};

export async function claimQueuedImportJobs(limit = 3): Promise<ClaimedImportJob[]> {
  await assertAdminRoleSafe();
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit) || 3, 1), 5);
  const result = await getAdminPool().query<{
    job_id: string; tenant_id: string; user_id: string; external_auth_subject: string; source_type: string;
  }>("SELECT * FROM brokerdesk_private.claim_next_import_jobs($1)", [normalizedLimit]);
  return result.rows.flatMap((row) => {
    if (!row.job_id || !row.tenant_id || !row.user_id || !row.external_auth_subject || (row.source_type !== "excel" && row.source_type !== "scan")) return [];
    return [{ jobId: row.job_id, tenantId: row.tenant_id, userId: row.user_id, externalAuthSubject: row.external_auth_subject, sourceType: row.source_type }];
  });
}

export async function suspendExternalAuthUser(subject: string): Promise<{ userId?: string; suspendedMembershipCount: number }> {
  const normalized = subject.trim();
  if (!normalized) return { suspendedMembershipCount: 0 };

  await assertAdminRoleSafe();

  const result = await getAdminPool().query<{
    result: { userId?: string; suspendedMembershipCount?: number };
  }>("SELECT brokerdesk_private.suspend_external_auth_user($1) AS result", [normalized]);
  return {
    userId: result.rows[0]?.result?.userId,
    suspendedMembershipCount: result.rows[0]?.result?.suspendedMembershipCount ?? 0,
  };
}
