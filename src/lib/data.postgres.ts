import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { normalizeDatabaseConnectionString } from "@/lib/database-connection";
import { cache } from "react";
import { computeQuote } from "@/lib/quote";
import {
  type AmlCheckStatus,
  type BrokerageContractType,
  type BudgetType,
  type ClientStage,
  type FollowUpType,
  type LoanPreApprovalStatus,
  type Purpose,
  type QuoteStatus,
  type TaskStatus,
  type Temperature,
} from "@/lib/domain";
import { buildFollowUpPriorityList } from "@/lib/followup-priority";
import type { Locale } from "@/lib/locale";
import { getStageLabel } from "@/lib/options";
import { buildComplianceAlertList, type ComplianceAlertType } from "@/lib/compliance-alerts";
import { StageTransitionBlockedError, validateStageTransition } from "@/lib/workflow-engine";
import {
  getDefaultOutputTemplateSettings,
  type OutputTemplateSettings,
  type OutputTemplateSettingsInput,
} from "@/lib/output-doc";
import { DEFAULT_TENANT_ID } from "@/lib/tenant-constants";
import {
  assertProductionDataStoreReady,
  isProductionRuntime,
  isPostgresDataStoreConfigured,
  ProductionReadinessError,
} from "@/lib/production-readiness";
import type {
  Attachment,
  AttachmentTargetType,
  Client,
  AuditLogFilter,
  ClientListFilter,
  ClientListSort,
  DashboardQuoteItem,
  FollowUp,
  GeneratedOutput,
  ImportJob,
  ImportJobStatus,
  ImportSourceType,
  ImportTargetEntity,
  BrokerageCase,
  BrokerageCaseStatus,
  BrokerageCaseType,
  CorrectionEvent,
  CorrectionEventChangeType,
  CorrectionEventScopeCandidate,
  CorrectionEventTrigger,
  AiExperienceDraft,
  AiExperienceDraftStatus,
  ExtractionReviewItem,
  ExtractionReviewStatus,
  GuaranteeApplicationDraft,
  GuaranteeApplicationDraftStatus,
  Property,
  Quotation,
  Task,
  Tenant,
  TenantAccountSummary,
  TenantMemberListItem,
  TenantMembership,
  TenantMembershipStatus,
  TenantStatus,
  User,
  AuditLog,
  CaseWorkbenchFieldRule,
  CaseWorkbenchFieldRuleInput,
  GuaranteeTemplateLayoutVersion,
  TenantGuaranteeTemplateInstall,
  OutputTemplateVersion,
  GuaranteeBlankForm,
  GuaranteeBlankFormVersion,
  GuaranteeCompanyMask,
  GuaranteeCompanyMaskVersion,
  GuaranteeMaskMatch,
  GuaranteePreviewConfirmation,
  GuaranteePreviewOutputInput,
  MemberVisibilityDefault,
} from "@/lib/data.memory";
import type { VisibleBrokerageCase } from "@/lib/data.memory";
import type { TenantRole, TenantCapabilityPreset } from "@/lib/tenant-permissions";
import type { LifecycleFilter, LifecycleStatus } from "@/lib/record-lifecycle";
import { getTenantDeploymentEnvironment } from "@/lib/tenant-bootstrap-policy";
import {
  normalizeOwnerResolutionStatus,
  normalizeVisibilityScope,
  type VisibilityObjectType,
  type VisibilityScope,
} from "@/lib/visibility-foundation";
import { assertNoForbiddenRecordInput } from "@/lib/record-input-guard";
import {
  resolveRecordVisibility,
  type RequestContext,
  type VisibilityRecord,
  type VisibilityRecordResult,
} from "@/lib/visibility-resolver";

export type TenantSessionLookup = {
  user: User;
  membership: TenantMembership;
  tenant: Tenant;
};

type BrokerDeskGlobal = typeof globalThis & {
  __brokerDeskPostgresPool?: Pool;
  __brokerDeskPostgresWarmup?: Promise<void> | null;
  __brokerDeskPostgresSchemaEnsured?: boolean;
  __brokerDeskPostgresSchemaEnsure?: Promise<void> | null;
};

type PostgresRequestScope = {
  externalAuthSubject: string;
};

const brokerDeskGlobal = globalThis as BrokerDeskGlobal;
let pool: Pool | null = brokerDeskGlobal.__brokerDeskPostgresPool ?? null;
let poolWarmupPromise: Promise<void> | null = brokerDeskGlobal.__brokerDeskPostgresWarmup ?? null;
let schemaEnsured = brokerDeskGlobal.__brokerDeskPostgresSchemaEnsured ?? false;
let schemaEnsurePromise: Promise<void> | null = brokerDeskGlobal.__brokerDeskPostgresSchemaEnsure ?? null;
const postgresRequestScope = new AsyncLocalStorage<PostgresRequestScope>();
let productionRuntimeRoleCheck: Promise<void> | null = null;

const REQUIRED_PRODUCTION_MIGRATIONS = [
  "20260727_000_baseline_schema.sql",
  "20260727_001_tenant_rls.sql",
  "20260729_002_force_tenant_rls.sql",
  "20260805_003_guarantee_template_layout_versions.sql",
  "20260805_004_tenant_guarantee_template_installs.sql",
  "20260808_001_record_lifecycle.sql",
  "20260809_001_external_auth_lifecycle_functions.sql",
  "20260809_002_force_tenant_template_installs_rls.sql",
  "20260809_003_private_attachment_blobs.sql",
  "20260809_004_import_job_execution_state.sql",
  "20260809_005_import_worker_claim.sql",
  "20260819_001_guarantee_slice1_objects.sql",
  "20260819_002_tenant_capabilities_invitation_contract.sql",
  "20260819_003_tenant_owner_create_path.sql",
  "20260819_004_invited_user_bootstrap.sql",
  "20260819_005_pending_invitations_read_function.sql",
  "20260819_006_fix_invitation_acceptance_scope.sql",
  "20260819_007_tenant_member_lifecycle_functions.sql",
  "20260819_008_current_user_membership_state_function.sql",
  "20260819_009_tenant_owner_lifecycle_lock.sql",
  "20260820_010_tenant_creation_idempotency.sql",
  "20260820_011_bind_invited_clerk_identity.sql",
  "20260820_012_current_tenant_member_read.sql",
  "20260821_013_fix_removed_invitation_return.sql",
  "20260824_001_visibility_foundation.sql",
  "20260824_002_visibility_record_rls.sql",
  "20260824_003_creator_immutability.sql",
] as const;

const OPEN_STAGES: ClientStage[] = ["lead", "contacted", "quoted", "viewing", "negotiating"];
const STAGE_JA_LABEL: Record<ClientStage, string> = {
  lead: "新規受付",
  contacted: "初回接触済み",
  quoted: "提案送付済み",
  viewing: "内見済み",
  negotiating: "申込・条件調整",
  won: "成約",
  lost: "見送り",
};

function getRawPool(): Pool {
  if (!pool) {
    // Local development uses the migration-owner connection so existing
    // fixtures and internal setup screens remain usable. Public runtimes must
    // use the restricted role from DATABASE_URL; RLS then enforces tenancy.
    const rawConnectionString = isProductionRuntime()
      ? process.env.DATABASE_URL
      : process.env.DATABASE_DEVELOPMENT_URL ?? process.env.DATABASE_URL;
    const connectionString = normalizeDatabaseConnectionString(rawConnectionString);
    pool = new Pool({
      connectionString,
      // Neon connection setup is materially slower than a normal indexed read.
      // Keep a small number of authenticated sessions alive so each route does
      // not fan out into a new cold connection for every independent query.
      max: 4,
      // Keep one development connection available while the local app is being
      // tested. Production can scale idle connections back to zero.
      min: process.env.NODE_ENV === "development" ? 1 : 0,
      idleTimeoutMillis: process.env.NODE_ENV === "development" ? 15 * 60 * 1000 : 60 * 1000,
      connectionTimeoutMillis: 10 * 1000,
      ssl: connectionString?.includes("supabase.co")
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    });
    brokerDeskGlobal.__brokerDeskPostgresPool = pool;
    // node-postgres emits this when the database closes an idle client. The
    // pool removes it itself; this listener prevents an automatic reconnect
    // from becoming an uncaught application error.
    pool.on("error", () => {});
  }
  return pool;
}

function getRequestScope(): PostgresRequestScope | undefined {
  return postgresRequestScope.getStore();
}

export async function withPostgresAuthContext<T>(
  externalAuthSubject: string,
  operation: () => Promise<T>,
): Promise<T> {
  const normalizedSubject = externalAuthSubject.trim();
  if (!normalizedSubject) {
    throw new ProductionReadinessError("production_tenant_scope_required");
  }

  // Nested repository calls from one server render must preserve the original
  // Clerk subject rather than creating competing request scopes.
  const currentScope = getRequestScope();
  if (currentScope?.externalAuthSubject === normalizedSubject) {
    return operation();
  }

  return postgresRequestScope.run({ externalAuthSubject: normalizedSubject }, operation);
}

function requireRequestScope(): PostgresRequestScope | undefined {
  const scope = getRequestScope();
  if (isProductionRuntime() && !scope?.externalAuthSubject) {
    throw new ProductionReadinessError("production_tenant_scope_required");
  }
  return scope;
}

async function applyRequestScope(client: PoolClient): Promise<boolean> {
  const scope = requireRequestScope();
  if (!scope) return false;
  // The caller must already have opened a transaction. A transaction-local
  // setting keeps the Clerk subject on the same Neon transaction as the
  // business query, even when the upstream pool uses transaction pooling.
  await client.query("SELECT set_config('app.external_auth_subject', $1, true)", [scope.externalAuthSubject]);
  return true;
}

async function queryWithinRequestScope(rawPool: Pool, args: unknown[]) {
  const client = await rawPool.connect();
  let transactionStarted = false;
  let releaseWithError = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await applyRequestScope(client);
    const result = await (client.query as (...queryArgs: unknown[]) => Promise<unknown>)(...args);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    releaseWithError = true;
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    if (transactionStarted) {
      releaseWithError = true;
    }
    client.release(releaseWithError);
  }
}

function getPool(): Pool {
  const rawPool = getRawPool();
  if (!isProductionRuntime()) return rawPool;

  // Pool.query does not keep a caller-selected connection. Use a proxy so the
  // session variable and business query always run on the same client, then
  // clear the variable before that client returns to Neon’s pool.
  return new Proxy(rawPool, {
    get(target, property, receiver) {
      if (property === "query") {
        return (...args: unknown[]) => queryWithinRequestScope(target, args);
      }
      return Reflect.get(target, property, receiver);
    },
  }) as Pool;
}

export function warmPostgresPool(): Promise<void> {
  if (!isPostgresDataStoreConfigured()) {
    return Promise.resolve();
  }
  if (!poolWarmupPromise) {
    // One warm connection is enough for the first request. Opening four
    // remote Neon connections in parallel makes cold navigation slower without
    // improving the first page render.
    poolWarmupPromise = getRawPool().query("SELECT 1")
      .then(() => undefined)
      .catch(() => {
        poolWarmupPromise = null;
        brokerDeskGlobal.__brokerDeskPostgresWarmup = null;
      });
    brokerDeskGlobal.__brokerDeskPostgresWarmup = poolWarmupPromise;
  }
  return poolWarmupPromise;
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function resolveTenantId(tenantId?: string): string {
  const resolvedTenantId = tenantId?.trim();
  if (resolvedTenantId) return resolvedTenantId;

  if (isProductionRuntime()) {
    throw new ProductionReadinessError("production_tenant_scope_required");
  }

  return DEFAULT_TENANT_ID;
}

/**
 * Mutations must not trust a caller-provided local user id when PostgreSQL has
 * already bound the request to a Clerk subject.  Non-production memory-style
 * harnesses may have no request GUC; production remains fail-closed.
 */
async function databaseActorMatches(
  client: Pool | PoolClient,
  actorUserId: string,
): Promise<boolean> {
  const result = await client.query(
    "SELECT brokerdesk_private.current_user_id() AS user_id",
  );
  const databaseActorId = String(result.rows[0]?.user_id ?? "").trim();
  if (!databaseActorId) return !isProductionRuntime();
  return databaseActorId === actorUserId;
}

async function resolveMemberVisibilityScope(
  tenantId: string,
  memberUserId: string,
  objectType: VisibilityObjectType,
  client: Pool | PoolClient = getPool(),
): Promise<VisibilityScope> {
  const result = await client.query(
    `SELECT d.visibility_scope
       FROM tenant_memberships m
       LEFT JOIN tenant_member_visibility_defaults d
         ON d.tenant_id = m.tenant_id
        AND d.membership_id = m.id
        AND d.member_user_id = m.user_id
        AND d.object_type = $3
      WHERE m.tenant_id = $1
        AND m.user_id = $2
        AND m.status = 'active'
      LIMIT 1`,
    [tenantId, memberUserId, objectType],
  );
  return normalizeVisibilityScope(result.rows[0]?.visibility_scope);
}

function mapMemberVisibilityDefault(row: Record<string, unknown>): MemberVisibilityDefault {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    membershipId: String(row.membership_id),
    memberUserId: String(row.member_user_id),
    objectType: String(row.object_type) as VisibilityObjectType,
    visibilityScope: normalizeVisibilityScope(row.visibility_scope),
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

export async function listMemberVisibilityDefaults(input: {
  tenantId?: string;
  actorUserId: string;
  memberUserId?: string;
}): Promise<MemberVisibilityDefault[]> {
  await ensureSchema();
  const tenantId = resolveTenantId(input.tenantId);
  const actorUserId = input.actorUserId.trim();
  if (!actorUserId || (input.memberUserId?.trim() && input.memberUserId.trim() !== actorUserId)) return [];
  const poolClient = getPool();
  if (!(await databaseActorMatches(poolClient, actorUserId))) return [];
  const result = await getPool().query(
    `SELECT * FROM tenant_member_visibility_defaults
      WHERE tenant_id = $1
        AND member_user_id = $2
        AND membership_id IN (
          SELECT id FROM tenant_memberships
           WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
        )
      ORDER BY object_type`,
    [tenantId, actorUserId],
  );
  return result.rows.map(mapMemberVisibilityDefault);
}

export async function setMemberVisibilityDefault(input: {
  tenantId?: string;
  membershipId?: string;
  memberUserId: string;
  actorUserId: string;
  objectType: VisibilityObjectType;
  visibilityScope: VisibilityScope;
}): Promise<MemberVisibilityDefault | null> {
  await ensureSchema();
  const tenantId = resolveTenantId(input.tenantId);
  const scope = normalizeVisibilityScope(input.visibilityScope);
  return withTransaction(async (client) => {
    if (!(await databaseActorMatches(client, input.actorUserId))) return null;
    const membership = await client.query(
      `SELECT id FROM tenant_memberships
        WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
          AND ($3::text IS NULL OR id = $3)
        LIMIT 1`,
      [tenantId, input.memberUserId, input.membershipId?.trim() || null],
    );
    const membershipId = String(membership.rows[0]?.id ?? "");
    if (!membershipId || input.actorUserId !== input.memberUserId) return null;
    const result = await client.query(
      `INSERT INTO tenant_member_visibility_defaults
         (id, tenant_id, membership_id, member_user_id, object_type, visibility_scope, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
       ON CONFLICT (tenant_id, membership_id, member_user_id, object_type)
       DO UPDATE SET visibility_scope = EXCLUDED.visibility_scope, updated_at = NOW()
       RETURNING *`,
      [genId("visibility_default"), tenantId, membershipId, input.memberUserId, input.objectType, scope],
    );
    await client.query(
      `INSERT INTO audit_logs
        (id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json, created_at)
       VALUES ($1,$2,$3,$3,'visibility_default_changed','tenant_membership',$4,$5,$6::jsonb,NOW())`,
      [
        genId("audit"),
        tenantId,
        input.actorUserId,
        membershipId,
        `资料默认可见范围已更新: ${input.objectType}`,
        JSON.stringify({ objectType: input.objectType, visibilityScope: scope }),
      ],
    );
    return result.rows[0] ? mapMemberVisibilityDefault(result.rows[0]) : null;
  });
}

export async function setRecordVisibilityScope(input: {
  tenantId?: string;
  objectType: VisibilityObjectType;
  recordId: string;
  actorUserId: string;
  visibilityScope: VisibilityScope;
}): Promise<Client | Property | BrokerageCase | null> {
  await ensureSchema();
  const tenantId = resolveTenantId(input.tenantId);
  const scope = normalizeVisibilityScope(input.visibilityScope);
  return withTransaction(async (client) => {
    if (!(await databaseActorMatches(client, input.actorUserId))) return null;
    const activeMembership = await client.query(
      "SELECT 1 FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1",
      [tenantId, input.actorUserId],
    );
    if (!activeMembership.rows[0]) return null;

    let result: { rows: Array<Record<string, unknown>> };
    if (input.objectType === "person") {
      result = await client.query(
        `UPDATE clients
            SET visibility_scope = $4, updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2
            AND current_owner_user_id = $3
            AND owner_resolution_status = 'resolved'
          RETURNING *`,
        [input.recordId, tenantId, input.actorUserId, scope],
      );
    } else if (input.objectType === "case") {
      result = await client.query(
        `UPDATE brokerage_cases
            SET visibility_scope = $4, updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2
            AND current_owner_user_id = $3
            AND owner_resolution_status = 'resolved'
          RETURNING *`,
        [input.recordId, tenantId, input.actorUserId, scope],
      );
    } else {
      result = await client.query(
        `UPDATE properties
            SET visibility_scope = $4, updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2
            AND current_owner_user_id = $3
            AND owner_resolution_status = 'resolved'
          RETURNING *`,
        [input.recordId, tenantId, input.actorUserId, scope],
      );
    }
    if (!result.rows[0]) return null;
    await client.query(
      `INSERT INTO audit_logs
        (id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json, created_at)
       VALUES ($1,$2,$3,$3,'visibility_scope_changed',$4,$5,$6,$7::jsonb,NOW())`,
      [
        genId("audit"),
        tenantId,
        input.actorUserId,
        input.objectType,
        input.recordId,
        "资料可见范围已更新",
        JSON.stringify({ visibilityScope: scope }),
      ],
    );
    if (input.objectType === "person") return mapClient(result.rows[0]);
    if (input.objectType === "case") return mapBrokerageCase(result.rows[0]);
    return mapProperty(result.rows[0]);
  });
}

/**
 * Invitation RPCs compare their actor argument with current_user_id(), which
 * is derived from the request's Clerk subject inside PostgreSQL. In the
 * production runtime, use that same database-bound identity instead of
 * trusting a caller-provided local user id.
 */
async function getAuthenticatedInvitationActorId(fallbackActorId?: string): Promise<string> {
  if (!isProductionRuntime()) {
    const fallback = fallbackActorId?.trim();
    if (!fallback) throw new Error("invitation actor is required");
    return fallback;
  }

  const result = await getPool().query(
    "SELECT brokerdesk_private.current_user_id() AS user_id",
  );
  const actorId = String(result.rows[0]?.user_id ?? "").trim();
  if (!actorId) throw new Error("authenticated invitation actor is required");
  return actorId;
}

export function isTenantAccessibleStatus(status: TenantStatus): boolean {
  return status === "trial" || status === "active";
}

function normalizePurchasedSeatCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.floor(count));
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    externalAuthSubject: row.external_auth_subject ? String(row.external_auth_subject) : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapTenant(row: Record<string, unknown>): Tenant {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    accountType: String(row.account_type ?? "company") as Tenant["accountType"],
    status: String(row.status ?? "active") as TenantStatus,
    purchasedSeatCount: Number(row.purchased_seat_count ?? 1),
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapTenantMembership(row: Record<string, unknown>): TenantMembership {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    role: String(row.role) as TenantMembership["role"],
    capability: row.capability ? String(row.capability) as TenantCapabilityPreset : undefined,
    status: String(row.status ?? "active") as TenantMembershipStatus,
    invitationProvider: String(row.invitation_provider ?? (row.status === "active" ? "manual" : "none")) as TenantMembership["invitationProvider"],
    invitationStatus: String(row.invitation_status ?? (row.status === "active" ? "accepted" : "not_sent")) as TenantMembership["invitationStatus"],
    providerInvitationId: row.provider_invitation_id ? String(row.provider_invitation_id) : undefined,
    invitationUrl: row.invitation_url ? String(row.invitation_url) : undefined,
    invitationSentAt: toDate(row.invitation_sent_at),
    invitationAcceptedAt: toDate(row.invitation_accepted_at),
    invitationError: row.invitation_error ? String(row.invitation_error) : undefined,
    invitedEmail: row.invited_email ? String(row.invited_email) : undefined,
    invitedByUserId: row.invited_by_user_id ? String(row.invited_by_user_id) : undefined,
    invitationExpiresAt: toDate(row.invitation_expires_at),
    invitationToken: row.invitation_token ? String(row.invitation_token) : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapClient(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    name: String(row.name),
    phone: String(row.phone),
    lineId: row.line_id ? String(row.line_id) : undefined,
    email: row.email ? String(row.email) : undefined,
    budgetMin: row.budget_min != null ? Number(row.budget_min) : undefined,
    budgetMax: row.budget_max != null ? Number(row.budget_max) : undefined,
    budgetType: (row.budget_type ? String(row.budget_type) : "total_price") as BudgetType,
    preferredArea: row.preferred_area ? String(row.preferred_area) : undefined,
    firstChoiceArea: row.first_choice_area ? String(row.first_choice_area) : undefined,
    secondChoiceArea: row.second_choice_area ? String(row.second_choice_area) : undefined,
    purpose: String(row.purpose) as Purpose,
    loanPreApprovalStatus: (row.loan_pre_approval_status ? String(row.loan_pre_approval_status) : "not_applied") as LoanPreApprovalStatus,
    desiredMoveInPeriod: row.desired_move_in_period ? String(row.desired_move_in_period) : undefined,
    stage: String(row.stage) as ClientStage,
    temperature: String(row.temperature) as Temperature,
    brokerageContractType: (row.brokerage_contract_type ? String(row.brokerage_contract_type) : "none") as BrokerageContractType,
    brokerageContractSignedAt: toDate(row.brokerage_contract_signed_at),
    brokerageContractExpiresAt: toDate(row.brokerage_contract_expires_at),
    importantMattersExplainedAt: toDate(row.important_matters_explained_at),
    contractDocumentDeliveredAt: toDate(row.contract_document_delivered_at),
    personalInfoConsentAt: toDate(row.personal_info_consent_at),
    amlCheckStatus: (row.aml_check_status ? String(row.aml_check_status) : "not_required") as AmlCheckStatus,
    nextFollowUpAt: toDate(row.next_follow_up_at),
    lastContactedAt: toDate(row.last_contacted_at),
    notes: row.notes ? String(row.notes) : undefined,
    ownerUserId: String(row.owner_user_id),
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : undefined,
    currentOwnerUserId: row.current_owner_user_id ? String(row.current_owner_user_id) : undefined,
    visibilityScope: normalizeVisibilityScope(row.visibility_scope),
    ownerResolutionStatus: normalizeOwnerResolutionStatus(row.owner_resolution_status ?? (row.current_owner_user_id ? "resolved" : "pending_confirmation")),
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
    lifecycleStatus: (row.lifecycle_status ?? "active") as LifecycleStatus,
    archivedAt: toDate(row.archived_at),
    archivedById: row.archived_by_id ? String(row.archived_by_id) : undefined,
  };
}

function mapProperty(row: Record<string, unknown>): Property {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    name: String(row.name),
    area: row.area ? String(row.area) : undefined,
    address: row.address ? String(row.address) : undefined,
    listingPrice: Number(row.listing_price ?? 0),
    sizeSqm: row.size_sqm != null ? Number(row.size_sqm) : undefined,
    managementFee: row.management_fee != null ? Number(row.management_fee) : undefined,
    repairFee: row.repair_fee != null ? Number(row.repair_fee) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : undefined,
    currentOwnerUserId: row.current_owner_user_id ? String(row.current_owner_user_id) : undefined,
    visibilityScope: normalizeVisibilityScope(row.visibility_scope),
    ownerResolutionStatus: normalizeOwnerResolutionStatus(row.owner_resolution_status ?? (row.current_owner_user_id ? "resolved" : "pending_confirmation")),
    createdAt: toDate(row.created_at) ?? new Date(),
    lifecycleStatus: (row.lifecycle_status ?? "active") as LifecycleStatus,
    archivedAt: toDate(row.archived_at),
    archivedById: row.archived_by_id ? String(row.archived_by_id) : undefined,
  };
}

function mapQuotation(row: Record<string, unknown>): Quotation {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    clientId: String(row.client_id),
    propertyId: row.property_id ? String(row.property_id) : undefined,
    quoteTitle: String(row.quote_title),
    listingPrice: Number(row.listing_price ?? 0),
    brokerageFee: Number(row.brokerage_fee ?? 0),
    taxFee: Number(row.tax_fee ?? 0),
    managementFee: Number(row.management_fee ?? 0),
    repairFee: Number(row.repair_fee ?? 0),
    otherFee: Number(row.other_fee ?? 0),
    downPayment: Number(row.down_payment ?? 0),
    loanAmount: Number(row.loan_amount ?? 0),
    interestRate: Number(row.interest_rate ?? 0),
    loanYears: Number(row.loan_years ?? 0),
    monthlyPaymentEstimate: Number(row.monthly_payment_estimate ?? 0),
    totalInitialCost: Number(row.total_initial_cost ?? 0),
    monthlyTotalCost: Number(row.monthly_total_cost ?? 0),
    summaryText: String(row.summary_text ?? ""),
    status: String(row.status ?? "draft") as QuoteStatus,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapFollowUp(row: Record<string, unknown>): FollowUp {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    clientId: String(row.client_id),
    type: String(row.type) as FollowUpType,
    content: String(row.content),
    nextAction: row.next_action ? String(row.next_action) : undefined,
    nextFollowUpAt: toDate(row.next_follow_up_at),
    createdById: String(row.created_by_id),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    clientId: row.client_id ? String(row.client_id) : undefined,
    title: String(row.title),
    dueAt: toDate(row.due_at),
    status: String(row.status) as Task["status"],
    createdById: String(row.created_by_id),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapAuditLog(row: Record<string, unknown>): AuditLog {
  const actorId = row.actor_id ? String(row.actor_id) : String(row.user_id);
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    actorId,
    userId: actorId,
    action: String(row.action),
    targetType: String(row.target_type) as AuditLog["targetType"],
    targetId: row.target_id ? String(row.target_id) : undefined,
    message: String(row.message),
    context:
      row.context_json && typeof row.context_json === "object"
        ? (row.context_json as Record<string, unknown>)
        : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapOutputTemplateSettings(row: Record<string, unknown>): OutputTemplateSettings {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    companyName: String(row.company_name ?? ""),
    department: String(row.department ?? ""),
    representative: String(row.representative ?? ""),
    licenseNumber: String(row.license_number ?? ""),
    postalAddress: String(row.postal_address ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    proposalTitle: String(row.proposal_title ?? "購入提案書"),
    estimateSheetTitle: String(row.estimate_sheet_title ?? "費用見積明細書"),
    fundingPlanTitle: String(row.funding_plan_title ?? "資金計画書（ローン試算）"),
    assumptionMemoTitle: String(row.assumption_memo_title ?? "試算前提条件説明書"),
    documentClassification: String(row.document_classification ?? "社外提出用（案）"),
    disclaimerLine1: String(
      row.disclaimer_line1 ?? "本書は媒介業務における説明補助資料であり、契約条項を確定するものではありません。"
    ),
    disclaimerLine2: String(
      row.disclaimer_line2 ?? "最終条件は重要事項説明書・売買契約書・金融機関提示条件をご確認ください。"
    ),
    disclaimerLine3: String(
      row.disclaimer_line3 ?? "本書の再配布時は最新版番号（文書番号・版数）をご確認ください。"
    ),
    showApprovalSection: Boolean(row.show_approval_section ?? true),
    showLegalStatusDigest: Boolean(row.show_legal_status_digest ?? true),
    showOutstandingBalanceTable: Boolean(row.show_outstanding_balance_table ?? true),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function toTemplateSettingsInput(settings: OutputTemplateSettings): OutputTemplateSettingsInput {
  return {
    companyName: settings.companyName,
    department: settings.department,
    representative: settings.representative,
    licenseNumber: settings.licenseNumber,
    postalAddress: settings.postalAddress,
    phone: settings.phone,
    email: settings.email,
    proposalTitle: settings.proposalTitle,
    estimateSheetTitle: settings.estimateSheetTitle,
    fundingPlanTitle: settings.fundingPlanTitle,
    assumptionMemoTitle: settings.assumptionMemoTitle,
    documentClassification: settings.documentClassification,
    disclaimerLine1: settings.disclaimerLine1,
    disclaimerLine2: settings.disclaimerLine2,
    disclaimerLine3: settings.disclaimerLine3,
    showApprovalSection: settings.showApprovalSection,
    showLegalStatusDigest: settings.showLegalStatusDigest,
    showOutstandingBalanceTable: settings.showOutstandingBalanceTable,
  };
}

function mapImportJob(row: Record<string, unknown>): ImportJob {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    sourceType: String(row.source_type) as ImportSourceType,
    title: String(row.title),
    targetEntity: String(row.target_entity) as ImportTargetEntity,
    status: String(row.status) as ImportJobStatus,
    notes: row.notes ? String(row.notes) : undefined,
    mappingJson: (row.mapping_json as Record<string, string> | null) ?? undefined,
    validationMessage: row.validation_message ? String(row.validation_message) : undefined,
    processingStartedAt: toDate(row.processing_started_at),
    completedAt: toDate(row.completed_at),
    failedAt: toDate(row.failed_at),
    attemptCount: Number(row.attempt_count ?? 0),
    errorCode: row.error_code ? String(row.error_code) : undefined,
    errorSummary: row.error_summary ? String(row.error_summary) : undefined,
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapBrokerageCase(row: Record<string, unknown>): BrokerageCase {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    caseType: String(row.case_type) as BrokerageCaseType,
    caseTitle: String(row.case_title),
    primaryPropertyId: row.primary_property_id ? String(row.primary_property_id) : undefined,
    status: String(row.status ?? "reviewed") as BrokerageCaseStatus,
    confirmedDataJson:
      row.confirmed_data_json && typeof row.confirmed_data_json === "object"
        ? (row.confirmed_data_json as Record<string, unknown>)
        : {},
    sourceImportJobIds: Array.isArray(row.source_import_job_ids)
      ? (row.source_import_job_ids as unknown[]).map(String)
      : [],
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : undefined,
    currentOwnerUserId: row.current_owner_user_id ? String(row.current_owner_user_id) : undefined,
    visibilityScope: normalizeVisibilityScope(row.visibility_scope),
    ownerResolutionStatus: normalizeOwnerResolutionStatus(row.owner_resolution_status ?? (row.current_owner_user_id ? "resolved" : "pending_confirmation")),
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
    lifecycleStatus: (row.lifecycle_status ?? "active") as LifecycleStatus,
    archivedAt: toDate(row.archived_at),
    archivedById: row.archived_by_id ? String(row.archived_by_id) : undefined,
  };
}

function mapExtractionReviewItem(row: Record<string, unknown>): ExtractionReviewItem {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    caseId: String(row.case_id),
    importJobId: String(row.import_job_id),
    fieldKey: String(row.field_key),
    label: String(row.label),
    extractedValue: String(row.extracted_value ?? ""),
    normalizedValue: String(row.normalized_value ?? ""),
    editedValue: row.edited_value ? String(row.edited_value) : undefined,
    finalValue: row.final_value ? String(row.final_value) : undefined,
    sourceSheet: String(row.source_sheet ?? ""),
    sourceCell: row.source_cell ? String(row.source_cell) : undefined,
    sourceRange: row.source_range ? String(row.source_range) : undefined,
    method: String(row.method ?? ""),
    confidence: Number(row.confidence ?? 0),
    reviewStatus: String(row.review_status ?? "suggested") as ExtractionReviewStatus,
    sourceFileHash: String(row.source_file_hash ?? ""),
    templateVersion: String(row.template_version ?? ""),
    reviewedById: row.reviewed_by_id ? String(row.reviewed_by_id) : undefined,
    reviewedAt: toDate(row.reviewed_at) ?? new Date(),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapCorrectionEvent(row: Record<string, unknown>): CorrectionEvent {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    caseId: String(row.case_id),
    trigger: String(row.trigger) as CorrectionEventTrigger,
    fieldKey: String(row.field_key),
    fieldLabel: String(row.field_label),
    aiValue: row.ai_value ? String(row.ai_value) : undefined,
    confirmedValue: row.confirmed_value ? String(row.confirmed_value) : undefined,
    changeType: String(row.change_type) as CorrectionEventChangeType,
    sourceImportJobId: row.source_import_job_id ? String(row.source_import_job_id) : undefined,
    sourceLocation: row.source_location ? String(row.source_location) : undefined,
    extractionMethod: row.extraction_method ? String(row.extraction_method) : undefined,
    confidenceBefore: row.confidence_before === null || row.confidence_before === undefined ? undefined : Number(row.confidence_before),
    templateId: row.template_id ? String(row.template_id) : undefined,
    scopeCandidate: String(row.scope_candidate ?? "case_only") as CorrectionEventScopeCandidate,
    sourceEvidenceJson:
      row.source_evidence_json && typeof row.source_evidence_json === "object"
        ? (row.source_evidence_json as Record<string, unknown>)
        : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapAiExperienceDraft(row: Record<string, unknown>): AiExperienceDraft {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    status: String(row.status ?? "draft") as AiExperienceDraftStatus,
    title: String(row.title ?? ""),
    bodyMarkdown: String(row.body_markdown ?? ""),
    eventIds: Array.isArray(row.event_ids) ? (row.event_ids as unknown[]).map(String) : [],
    fieldKey: row.field_key ? String(row.field_key) : undefined,
    templateId: row.template_id ? String(row.template_id) : undefined,
    changeType: String(row.change_type) as CorrectionEventChangeType,
    scopeCandidate: String(row.scope_candidate ?? "case_only") as CorrectionEventScopeCandidate,
    evidenceSummaryJson:
      row.evidence_summary_json && typeof row.evidence_summary_json === "object"
        ? (row.evidence_summary_json as Record<string, unknown>)
        : undefined,
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapGuaranteeApplicationDraft(row: Record<string, unknown>): GuaranteeApplicationDraft {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    caseId: String(row.case_id),
    templateId: String(row.template_id),
    companyCode: String(row.company_code ?? "friends_guarantee") as GuaranteeApplicationDraft["companyCode"],
    status: String(row.status ?? "draft") as GuaranteeApplicationDraftStatus,
    fieldValuesJson:
      row.field_values_json && typeof row.field_values_json === "object"
        ? (row.field_values_json as Record<string, unknown>)
        : {},
    fieldStatusesJson:
      row.field_statuses_json && typeof row.field_statuses_json === "object"
        ? (row.field_statuses_json as Record<string, string>)
        : {},
    lastReviewedAt: toDate(row.last_reviewed_at),
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    targetType: String(row.target_type) as AttachmentTargetType,
    targetId: String(row.target_id),
    fileName: String(row.file_name),
    fileType: row.file_type ? String(row.file_type) : undefined,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : undefined,
    storagePath: row.storage_path ? String(row.storage_path) : undefined,
    uploadedAt: toDate(row.uploaded_at) ?? new Date(),
  };
}

function mapGeneratedOutput(row: Record<string, unknown>): GeneratedOutput {
  const actorId = row.actor_id ? String(row.actor_id) : String(row.user_id);
  const quoteId = row.quote_id ? String(row.quote_id) : undefined;
  const sourceQuoteId = row.source_quote_id ? String(row.source_quote_id) : quoteId;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    actorId,
    userId: actorId,
    sourceQuoteId,
    quoteId,
    propertyId: row.property_id ? String(row.property_id) : undefined,
    partyId: row.party_id ? String(row.party_id) : undefined,
    outputType: String(row.output_type) as GeneratedOutput["outputType"],
    outputFormat: String(row.output_format) as GeneratedOutput["outputFormat"],
    language: String(row.language) as Locale,
    title: String(row.title),
    documentNumber: String(row.document_number ?? ""),
    templateVersionId: row.template_version_id ? String(row.template_version_id) : undefined,
    caseId: row.case_id ? String(row.case_id) : undefined,
    templateId: row.template_id ? String(row.template_id) : undefined,
    inputDataSnapshot: row.input_data_snapshot && typeof row.input_data_snapshot === "object" ? row.input_data_snapshot as Record<string, unknown> : undefined,
    draftValueSnapshot: row.draft_value_snapshot && typeof row.draft_value_snapshot === "object" ? row.draft_value_snapshot as Record<string, unknown> : undefined,
    fieldMappingSnapshot: row.field_mapping_snapshot && typeof row.field_mapping_snapshot === "object" ? row.field_mapping_snapshot as Record<string, unknown> : undefined,
    layoutSnapshot: row.layout_snapshot && typeof row.layout_snapshot === "object" ? row.layout_snapshot as Record<string, unknown> : undefined,
    generatedAt: toDate(row.generated_at) ?? new Date(),
    fileAttachmentId: row.file_attachment_id ? String(row.file_attachment_id) : undefined,
    fileSha256: row.file_sha256 ? String(row.file_sha256) : undefined,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : undefined,
    fileMimeType: row.file_mime_type ? String(row.file_mime_type) : undefined,
    fileStatus: row.file_status === "ready" ? "ready" : row.file_status === "unavailable" ? "unavailable" : undefined,
    blankFormVersionId: row.blank_form_version_id ? String(row.blank_form_version_id) : undefined,
    blankFormSha256: row.blank_form_sha256 ? String(row.blank_form_sha256) : undefined,
    companyMaskVersionId: row.company_mask_version_id ? String(row.company_mask_version_id) : undefined,
    fieldCatalogVersion: row.field_catalog_version ? String(row.field_catalog_version) : undefined,
    previewConfirmationId: row.preview_confirmation_id ? String(row.preview_confirmation_id) : undefined,
    caseInputSnapshotHash: row.case_input_snapshot_hash ? String(row.case_input_snapshot_hash) : undefined,
  };
}

function mapGuaranteeBlankForm(row: Record<string, unknown>): GuaranteeBlankForm {
  return { id: String(row.id), tenantId: String(row.tenant_id), name: String(row.name), recipientOrPurpose: row.recipient_or_purpose ? String(row.recipient_or_purpose) : undefined, activeVersionId: row.active_version_id ? String(row.active_version_id) : undefined, createdByUserId: String(row.created_by_user_id), createdAt: toDate(row.created_at) ?? new Date(), archivedAt: toDate(row.archived_at) };
}
function mapGuaranteeBlankFormVersion(row: Record<string, unknown>): GuaranteeBlankFormVersion {
  return { id: String(row.id), blankFormId: String(row.blank_form_id), tenantId: String(row.tenant_id), attachmentId: String(row.attachment_id), uploadedByUserId: String(row.uploaded_by_user_id), versionNumber: Number(row.version_number), sha256: String(row.sha256), fileSizeBytes: Number(row.file_size_bytes), mimeType: "application/pdf", pageCount: Number(row.page_count), pageWidth: Number(row.page_width), pageHeight: Number(row.page_height), status: String(row.status) as GuaranteeBlankFormVersion["status"], createdAt: toDate(row.created_at) ?? new Date(), statusChangedByUserId: row.status_changed_by_user_id ? String(row.status_changed_by_user_id) : undefined };
}
function mapGuaranteeCompanyMask(row: Record<string, unknown>): GuaranteeCompanyMask { return { id: String(row.id), tenantId: String(row.tenant_id), blankFormId: String(row.blank_form_id), activeVersionId: row.active_version_id ? String(row.active_version_id) : undefined, createdByUserId: String(row.created_by_user_id), createdAt: toDate(row.created_at) ?? new Date() }; }
function mapGuaranteeCompanyMaskVersion(row: Record<string, unknown>): GuaranteeCompanyMaskVersion { return { id: String(row.id), maskId: String(row.mask_id), tenantId: String(row.tenant_id), blankFormId: String(row.blank_form_id), blankFormVersionId: String(row.blank_form_version_id), sourcePlatformMaskId: row.source_platform_mask_id ? String(row.source_platform_mask_id) : undefined, versionNumber: Number(row.version_number), status: String(row.status) as GuaranteeCompanyMaskVersion["status"], fieldCatalogVersion: String(row.field_catalog_version), layoutSnapshot: (row.layout_snapshot as Record<string, unknown>) ?? {}, createdByUserId: String(row.created_by_user_id), publishedByUserId: row.published_by_user_id ? String(row.published_by_user_id) : undefined, testedByUserId: row.tested_by_user_id ? String(row.tested_by_user_id) : undefined, testedAt: toDate(row.tested_at), testedPdfSha256: row.tested_pdf_sha256 ? String(row.tested_pdf_sha256) : undefined, testedLayoutDigest: row.tested_layout_digest ? String(row.tested_layout_digest) : undefined, testConfirmedByUserId: row.test_confirmed_by_user_id ? String(row.test_confirmed_by_user_id) : undefined, testConfirmedAt: toDate(row.test_confirmed_at), createdAt: toDate(row.created_at) ?? new Date(), publishedAt: toDate(row.published_at) }; }
function mapGuaranteeMaskMatch(row: Record<string, unknown>): GuaranteeMaskMatch { return { id: String(row.id), tenantId: String(row.tenant_id), blankFormVersionId: String(row.blank_form_version_id), maskVersionId: String(row.mask_version_id), status: String(row.status) as GuaranteeMaskMatch["status"], evaluatedAt: toDate(row.evaluated_at), evaluatedByUserId: row.evaluated_by_user_id ? String(row.evaluated_by_user_id) : undefined, reason: row.reason ? String(row.reason) : undefined, blankFormSha256: row.blank_form_sha256 ? String(row.blank_form_sha256) : undefined, pageWidth: row.page_width == null ? undefined : Number(row.page_width), pageHeight: row.page_height == null ? undefined : Number(row.page_height) }; }
function mapGuaranteePreviewConfirmation(row: Record<string, unknown>): GuaranteePreviewConfirmation { return { id: String(row.id), tenantId: String(row.tenant_id), actorUserId: String(row.actor_user_id), caseId: String(row.case_id), caseInputSnapshotHash: String(row.case_input_snapshot_hash), blankFormVersionId: String(row.blank_form_version_id), blankFormSha256: String(row.blank_form_sha256), companyMaskVersionId: String(row.company_mask_version_id), fieldCatalogVersion: String(row.field_catalog_version), supplementSnapshot: (row.supplement_snapshot as Record<string, unknown>) ?? {}, supplementHash: String(row.supplement_hash), expiresAt: toDate(row.expires_at) ?? new Date(0), status: String(row.status) as GuaranteePreviewConfirmation["status"], processingExpiresAt: toDate(row.processing_expires_at), processingToken: row.processing_token ? String(row.processing_token) : undefined, generatedOutputId: row.generated_output_id ? String(row.generated_output_id) : undefined, createdAt: toDate(row.created_at) ?? new Date(), consumedAt: toDate(row.consumed_at) }; }

function mapOutputTemplateVersion(row: Record<string, unknown>): OutputTemplateVersion {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    versionNumber: Number(row.version_number ?? 0),
    versionLabel: String(row.version_label ?? ""),
    changeNote: row.change_note ? String(row.change_note) : undefined,
    settingsSnapshot: row.settings_snapshot as OutputTemplateSettingsInput,
    isActive: Boolean(row.is_active),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

function mapGuaranteeTemplateLayoutVersion(row: Record<string, unknown>): GuaranteeTemplateLayoutVersion {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    versionNumber: Number(row.version_number ?? 0),
    baselineVersion: String(row.baseline_version ?? ""),
    assetFingerprint: String(row.asset_fingerprint ?? ""),
    layoutSnapshot:
      row.layout_snapshot && typeof row.layout_snapshot === "object"
        ? (row.layout_snapshot as Record<string, unknown>)
        : {},
    changeNote: row.change_note ? String(row.change_note) : undefined,
    publishedByUserId: row.published_by_user_id ? String(row.published_by_user_id) : undefined,
    isActive: Boolean(row.is_active),
    createdAt: toDate(row.created_at) ?? new Date(),
    publishedAt: toDate(row.published_at) ?? new Date(),
  };
}

function mapTenantGuaranteeTemplateInstall(row: Record<string, unknown>): TenantGuaranteeTemplateInstall {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    templateId: String(row.template_id),
    sourceLayoutVersionId: String(row.source_layout_version_id),
    sourceVersionNumber: Number(row.source_version_number ?? 0),
    sourceAssetFingerprint: String(row.source_asset_fingerprint ?? ""),
    displayName: String(row.display_name ?? ""),
    layoutSnapshot:
      row.layout_snapshot && typeof row.layout_snapshot === "object"
        ? (row.layout_snapshot as Record<string, unknown>)
        : {},
    revisionNumber: Number(row.revision_number ?? 1),
    status: String(row.status) === "archived" ? "archived" : "active",
    installedByUserId: row.installed_by_user_id ? String(row.installed_by_user_id) : undefined,
    installedAt: toDate(row.installed_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function mapCaseWorkbenchFieldRule(row: Record<string, unknown>): CaseWorkbenchFieldRule {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? DEFAULT_TENANT_ID),
    userId: String(row.user_id),
    fieldKey: String(row.field_key),
    requirement: String(row.requirement) === "required" ? "required" : "optional",
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

async function assertProductionMigrationsApplied(db: Pool) {
  try {
    const result = await db.query("SELECT name FROM broker_desk_schema_migrations");
    const appliedMigrations = new Set(result.rows.map((row) => String(row.name)));
    const hasRequiredMigrations = REQUIRED_PRODUCTION_MIGRATIONS.every((name) => appliedMigrations.has(name));

    if (!hasRequiredMigrations) {
      throw new ProductionReadinessError("production_migrations_required");
    }
  } catch (error) {
    if (error instanceof ProductionReadinessError) throw error;
    throw new ProductionReadinessError("production_migrations_required");
  }
}

async function assertProductionRuntimeRoleSafe(db: Pool) {
  if (!isProductionRuntime()) return;

  if (!productionRuntimeRoleCheck) {
    productionRuntimeRoleCheck = db
      .query("SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user")
      .then((result) => {
        if (!result.rows[0] || Boolean(result.rows[0].rolbypassrls)) {
          throw new ProductionReadinessError("production_database_role_unsafe");
        }
      })
      .catch((error) => {
        productionRuntimeRoleCheck = null;
        if (error instanceof ProductionReadinessError) throw error;
        throw new ProductionReadinessError("production_database_role_unsafe");
      });
  }

  await productionRuntimeRoleCheck;
}

async function ensureSchema() {
  if (schemaEnsured) return;

  if (!schemaEnsurePromise) {
    schemaEnsurePromise = (async () => {
      assertProductionDataStoreReady();
      // A new Neon/Supabase connection can take materially longer than the
      // actual indexed query. Await the shared warmup before the first schema
      // check so parallel page data requests reuse ready connections.
      await warmPostgresPool();
      const db = getRawPool();

      // PostgreSQL schema changes are migration-owned in every environment.
      // Runtime DDL can race on concurrent requests and makes shared beta
      // environments drift from the migration ledger.
      await assertProductionMigrationsApplied(db);
      await assertProductionRuntimeRoleSafe(db);
      schemaEnsured = true;
      brokerDeskGlobal.__brokerDeskPostgresSchemaEnsured = true;
    })().catch((error) => {
      schemaEnsurePromise = null;
      brokerDeskGlobal.__brokerDeskPostgresSchemaEnsure = null;
      throw error;
    });
    brokerDeskGlobal.__brokerDeskPostgresSchemaEnsure = schemaEnsurePromise;
  }

  await schemaEnsurePromise;
}

// Kept temporarily only to read historical local databases during migration
// investigations. Runtime code exclusively calls ensureSchema(), which is
// migration-owned and never executes DDL. Remove this after the public-beta
// data migration window closes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function ensureSchemaLegacyForUnversionedDevelopment() {
  if (schemaEnsured) return;
  assertProductionDataStoreReady();
  await warmPostgresPool();
  const db = getRawPool();

  if (isProductionRuntime()) {
    await assertProductionMigrationsApplied(db);
    await assertProductionRuntimeRoleSafe(db);
    schemaEnsured = true;
    brokerDeskGlobal.__brokerDeskPostgresSchemaEnsured = true;
    return;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      external_auth_subject TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'company',
      status TEXT NOT NULL DEFAULT 'active',
      purchased_seat_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tenant_memberships (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      invitation_provider TEXT NOT NULL DEFAULT 'none',
      invitation_status TEXT NOT NULL DEFAULT 'not_sent',
      provider_invitation_id TEXT,
      invitation_url TEXT,
      invitation_sent_at TIMESTAMPTZ,
      invitation_accepted_at TIMESTAMPTZ,
      invitation_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      line_id TEXT,
      email TEXT,
      budget_min INTEGER,
      budget_max INTEGER,
      budget_type TEXT NOT NULL DEFAULT 'total_price',
      preferred_area TEXT,
      first_choice_area TEXT,
      second_choice_area TEXT,
      purpose TEXT NOT NULL,
      loan_pre_approval_status TEXT NOT NULL DEFAULT 'not_applied',
      desired_move_in_period TEXT,
      stage TEXT NOT NULL,
      temperature TEXT NOT NULL,
      brokerage_contract_type TEXT NOT NULL DEFAULT 'none',
      brokerage_contract_signed_at TIMESTAMPTZ,
      brokerage_contract_expires_at TIMESTAMPTZ,
      important_matters_explained_at TIMESTAMPTZ,
      contract_document_delivered_at TIMESTAMPTZ,
      personal_info_consent_at TIMESTAMPTZ,
      aml_check_status TEXT NOT NULL DEFAULT 'not_required',
      next_follow_up_at TIMESTAMPTZ,
      last_contacted_at TIMESTAMPTZ,
      notes TEXT,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      name TEXT NOT NULL,
      area TEXT,
      address TEXT,
      listing_price INTEGER NOT NULL,
      size_sqm DOUBLE PRECISION,
      management_fee INTEGER,
      repair_fee INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      client_id TEXT NOT NULL REFERENCES clients(id),
      property_id TEXT REFERENCES properties(id),
      quote_title TEXT NOT NULL,
      listing_price INTEGER NOT NULL,
      brokerage_fee INTEGER NOT NULL,
      tax_fee INTEGER NOT NULL,
      management_fee INTEGER NOT NULL,
      repair_fee INTEGER NOT NULL,
      other_fee INTEGER NOT NULL,
      down_payment INTEGER NOT NULL,
      loan_amount INTEGER NOT NULL,
      interest_rate DOUBLE PRECISION NOT NULL,
      loan_years INTEGER NOT NULL,
      monthly_payment_estimate INTEGER NOT NULL,
      total_initial_cost INTEGER NOT NULL,
      monthly_total_cost INTEGER NOT NULL,
      summary_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      client_id TEXT NOT NULL REFERENCES clients(id),
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      next_action TEXT,
      next_follow_up_at TIMESTAMPTZ,
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      client_id TEXT REFERENCES clients(id),
      title TEXT NOT NULL,
      due_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      actor_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      message TEXT NOT NULL,
      context_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS case_workbench_field_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      field_key TEXT NOT NULL,
      requirement TEXT NOT NULL DEFAULT 'optional',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, user_id, field_key)
    );

    CREATE TABLE IF NOT EXISTS output_template_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      company_name TEXT NOT NULL,
      department TEXT NOT NULL,
      representative TEXT NOT NULL,
      license_number TEXT NOT NULL,
      postal_address TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      proposal_title TEXT NOT NULL,
      estimate_sheet_title TEXT NOT NULL,
      funding_plan_title TEXT NOT NULL,
      assumption_memo_title TEXT NOT NULL,
      document_classification TEXT NOT NULL,
      disclaimer_line1 TEXT NOT NULL,
      disclaimer_line2 TEXT NOT NULL,
      disclaimer_line3 TEXT NOT NULL,
      show_approval_section BOOLEAN NOT NULL DEFAULT TRUE,
      show_legal_status_digest BOOLEAN NOT NULL DEFAULT TRUE,
      show_outstanding_balance_table BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS output_template_versions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      version_number INTEGER NOT NULL,
      version_label TEXT NOT NULL,
      change_note TEXT,
      settings_snapshot JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS guarantee_template_layout_versions (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      baseline_version TEXT NOT NULL,
      asset_fingerprint TEXT NOT NULL,
      layout_snapshot JSONB NOT NULL,
      change_note TEXT,
      published_by_user_id TEXT REFERENCES users(id),
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (template_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      source_type TEXT NOT NULL,
      title TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      notes TEXT,
      mapping_json JSONB,
      validation_message TEXT,
      processing_started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      error_summary TEXT,
      idempotency_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS brokerage_cases (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      case_type TEXT NOT NULL DEFAULT 'unit_sale',
      case_title TEXT NOT NULL,
      primary_property_id TEXT,
      status TEXT NOT NULL DEFAULT 'reviewed',
      confirmed_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      source_import_job_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS extraction_review_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
      import_job_id TEXT NOT NULL REFERENCES import_jobs(id),
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      extracted_value TEXT NOT NULL DEFAULT '',
      normalized_value TEXT NOT NULL DEFAULT '',
      edited_value TEXT,
      final_value TEXT,
      source_sheet TEXT NOT NULL DEFAULT '',
      source_cell TEXT,
      source_range TEXT,
      method TEXT NOT NULL DEFAULT '',
      confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
      review_status TEXT NOT NULL,
      source_file_hash TEXT NOT NULL DEFAULT '',
      template_version TEXT NOT NULL DEFAULT '',
      reviewed_by_id TEXT,
      reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS guarantee_application_drafts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL,
      company_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      field_values_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      field_statuses_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, user_id, case_id, template_id)
    );

    CREATE TABLE IF NOT EXISTS correction_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL,
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      ai_value TEXT,
      confirmed_value TEXT,
      change_type TEXT NOT NULL,
      source_import_job_id TEXT,
      source_location TEXT,
      extraction_method TEXT,
      confidence_before DOUBLE PRECISION,
      template_id TEXT,
      scope_candidate TEXT NOT NULL DEFAULT 'case_only',
      source_evidence_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_experience_drafts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'draft',
      title TEXT NOT NULL,
      body_markdown TEXT NOT NULL,
      event_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      field_key TEXT,
      template_id TEXT,
      change_type TEXT NOT NULL,
      scope_candidate TEXT NOT NULL DEFAULT 'case_only',
      evidence_summary_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT,
      file_size_bytes INTEGER,
      storage_path TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS generated_outputs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry',
      user_id TEXT NOT NULL REFERENCES users(id),
      actor_id TEXT REFERENCES users(id),
      quote_id TEXT REFERENCES quotations(id),
      source_quote_id TEXT,
      property_id TEXT,
      party_id TEXT,
      output_type TEXT NOT NULL,
      output_format TEXT NOT NULL DEFAULT 'pdf',
      language TEXT NOT NULL DEFAULT 'ja',
      title TEXT NOT NULL,
      document_number TEXT,
      template_version_id TEXT,
      case_id TEXT,
      template_id TEXT,
      input_data_snapshot JSONB,
      draft_value_snapshot JSONB,
      field_mapping_snapshot JSONB,
      layout_snapshot JSONB,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS guarantee_blank_forms (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, recipient_or_purpose TEXT, active_version_id TEXT, created_by_user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), archived_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS guarantee_blank_form_versions (id TEXT PRIMARY KEY, blank_form_id TEXT NOT NULL, tenant_id TEXT NOT NULL, attachment_id TEXT NOT NULL, uploaded_by_user_id TEXT NOT NULL, version_number INTEGER NOT NULL, sha256 TEXT NOT NULL, file_size_bytes INTEGER NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/pdf', page_count INTEGER NOT NULL, page_width DOUBLE PRECISION NOT NULL, page_height DOUBLE PRECISION NOT NULL, status TEXT NOT NULL DEFAULT 'uploaded', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), status_changed_by_user_id TEXT, UNIQUE(blank_form_id, version_number));
    CREATE TABLE IF NOT EXISTS guarantee_company_masks (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, blank_form_id TEXT NOT NULL, active_version_id TEXT, created_by_user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id, blank_form_id));
    CREATE TABLE IF NOT EXISTS guarantee_company_mask_versions (id TEXT PRIMARY KEY, mask_id TEXT NOT NULL, tenant_id TEXT NOT NULL, blank_form_id TEXT NOT NULL, blank_form_version_id TEXT NOT NULL, source_platform_mask_id TEXT, version_number INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft', field_catalog_version TEXT NOT NULL, layout_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, created_by_user_id TEXT NOT NULL, tested_by_user_id TEXT, tested_at TIMESTAMPTZ, tested_pdf_sha256 TEXT, tested_layout_digest TEXT, test_confirmed_by_user_id TEXT, test_confirmed_at TIMESTAMPTZ, published_by_user_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ, UNIQUE(mask_id, version_number));
    ALTER TABLE guarantee_company_mask_versions ADD COLUMN IF NOT EXISTS tested_by_user_id TEXT;
    ALTER TABLE guarantee_company_mask_versions ADD COLUMN IF NOT EXISTS tested_at TIMESTAMPTZ;
    ALTER TABLE guarantee_company_mask_versions ADD COLUMN IF NOT EXISTS tested_pdf_sha256 TEXT;
    ALTER TABLE guarantee_company_mask_versions ADD COLUMN IF NOT EXISTS tested_layout_digest TEXT;
    ALTER TABLE guarantee_company_mask_versions ADD COLUMN IF NOT EXISTS test_confirmed_by_user_id TEXT;
    ALTER TABLE guarantee_company_mask_versions ADD COLUMN IF NOT EXISTS test_confirmed_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS guarantee_mask_matches (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, blank_form_version_id TEXT NOT NULL, mask_version_id TEXT NOT NULL, status TEXT NOT NULL, evaluated_at TIMESTAMPTZ, evaluated_by_user_id TEXT, reason TEXT, blank_form_sha256 TEXT, page_width DOUBLE PRECISION, page_height DOUBLE PRECISION, UNIQUE(tenant_id, blank_form_version_id, mask_version_id));
    CREATE TABLE IF NOT EXISTS guarantee_preview_confirmations (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, case_id TEXT NOT NULL, case_input_snapshot_hash TEXT NOT NULL, blank_form_version_id TEXT NOT NULL, blank_form_sha256 TEXT NOT NULL, company_mask_version_id TEXT NOT NULL, field_catalog_version TEXT NOT NULL, supplement_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, supplement_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'issued', processing_expires_at TIMESTAMPTZ, processing_token TEXT, generated_output_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), consumed_at TIMESTAMPTZ);
    ALTER TABLE guarantee_preview_confirmations ADD COLUMN IF NOT EXISTS processing_token TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS file_attachment_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS file_sha256 TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS file_mime_type TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS file_status TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS blank_form_version_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS blank_form_sha256 TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS company_mask_version_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS field_catalog_version TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS preview_confirmation_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS case_input_snapshot_hash TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS guarantee_outputs_confirmation_unique ON generated_outputs(preview_confirmation_id) WHERE preview_confirmation_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS guarantee_outputs_file_unique ON generated_outputs(file_attachment_id) WHERE file_attachment_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_status ON tenant_memberships(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_role ON tenant_memberships(tenant_id, role);
    CREATE INDEX IF NOT EXISTS idx_clients_tenant_owner_stage ON clients(tenant_id, owner_user_id, stage);
    CREATE INDEX IF NOT EXISTS idx_properties_tenant_created ON properties(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotes_tenant_created ON quotations(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_clients_owner_stage ON clients(owner_user_id, stage);
    CREATE INDEX IF NOT EXISTS idx_clients_next_followup ON clients(next_follow_up_at);
    CREATE INDEX IF NOT EXISTS idx_quotes_client_created ON quotations(client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_followups_client_created ON follow_ups(client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_client_status_due ON tasks(client_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_case_workbench_field_rules_user ON case_workbench_field_rules(tenant_id, user_id, field_key);
    ALTER TABLE output_template_settings DROP CONSTRAINT IF EXISTS output_template_settings_user_id_key;
    DROP INDEX IF EXISTS idx_output_template_user;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_output_template_tenant_user ON output_template_settings(tenant_id, user_id);
    DROP INDEX IF EXISTS idx_output_template_version_user_number;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_output_template_version_tenant_user_number ON output_template_versions(tenant_id, user_id, version_number);
    CREATE INDEX IF NOT EXISTS idx_output_template_version_user_created ON output_template_versions(user_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_guarantee_template_layout_active
      ON guarantee_template_layout_versions(template_id) WHERE is_active;
    CREATE INDEX IF NOT EXISTS idx_guarantee_template_layout_versions_template
      ON guarantee_template_layout_versions(template_id, version_number DESC);
    CREATE TABLE IF NOT EXISTS tenant_guarantee_template_installs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      template_id TEXT NOT NULL,
      source_layout_version_id TEXT NOT NULL REFERENCES guarantee_template_layout_versions(id),
      source_version_number INTEGER NOT NULL,
      source_asset_fingerprint TEXT NOT NULL,
      display_name TEXT NOT NULL,
      layout_snapshot JSONB NOT NULL,
      revision_number INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      installed_by_user_id TEXT REFERENCES users(id),
      installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_guarantee_template_active
      ON tenant_guarantee_template_installs(tenant_id, template_id) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_tenant_guarantee_template_installs_tenant
      ON tenant_guarantee_template_installs(tenant_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_user_created ON import_jobs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_user_created ON import_jobs(tenant_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_status_created ON import_jobs(tenant_id, status, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_processing_started ON import_jobs(tenant_id, processing_started_at ASC)
      WHERE status = 'processing';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_import_jobs_tenant_idempotency_unique ON import_jobs(tenant_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_brokerage_cases_user_updated ON brokerage_cases(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_brokerage_cases_tenant_user_updated ON brokerage_cases(tenant_id, user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_extraction_review_case ON extraction_review_items(case_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_extraction_review_tenant_case ON extraction_review_items(tenant_id, case_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_extraction_review_import_job ON extraction_review_items(import_job_id);
    CREATE INDEX IF NOT EXISTS idx_guarantee_drafts_case_template ON guarantee_application_drafts(user_id, case_id, template_id);
    CREATE INDEX IF NOT EXISTS idx_guarantee_drafts_tenant_case_template ON guarantee_application_drafts(tenant_id, user_id, case_id, template_id);
    ALTER TABLE guarantee_application_drafts DROP CONSTRAINT IF EXISTS guarantee_application_drafts_user_id_case_id_template_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_guarantee_drafts_tenant_user_case_template_unique ON guarantee_application_drafts(tenant_id, user_id, case_id, template_id);
    CREATE INDEX IF NOT EXISTS idx_correction_events_case_created ON correction_events(user_id, case_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_correction_events_tenant_case_created ON correction_events(tenant_id, user_id, case_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_correction_events_change_type ON correction_events(change_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_experience_drafts_user_status_created ON ai_experience_drafts(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_experience_drafts_tenant_status_created ON ai_experience_drafts(tenant_id, user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_experience_drafts_scope ON ai_experience_drafts(scope_candidate, template_id, field_key);
    CREATE INDEX IF NOT EXISTS idx_attachments_user_target ON attachments(user_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_tenant_user_target ON attachments(tenant_id, user_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_user_created ON generated_outputs(user_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_tenant_user_created ON generated_outputs(tenant_id, user_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_actor_created ON generated_outputs(actor_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_outputs_quote ON generated_outputs(quote_id, generated_at DESC);

    ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE properties ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE case_workbench_field_rules ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE case_workbench_field_rules ADD COLUMN IF NOT EXISTS requirement TEXT NOT NULL DEFAULT 'optional';
    ALTER TABLE case_workbench_field_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE brokerage_cases ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE extraction_review_items ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE guarantee_application_drafts ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE correction_events ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE ai_experience_drafts ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_cherry';

    ALTER TABLE clients ADD COLUMN IF NOT EXISTS budget_type TEXT NOT NULL DEFAULT 'total_price';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_choice_area TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS second_choice_area TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS loan_pre_approval_status TEXT NOT NULL DEFAULT 'not_applied';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS desired_move_in_period TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS brokerage_contract_type TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS brokerage_contract_signed_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS brokerage_contract_expires_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS important_matters_explained_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_document_delivered_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS personal_info_consent_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS aml_check_status TEXT NOT NULL DEFAULT 'not_required';

    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS representative TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS license_number TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS postal_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS proposal_title TEXT NOT NULL DEFAULT '購入提案書';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS estimate_sheet_title TEXT NOT NULL DEFAULT '費用見積明細書';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS funding_plan_title TEXT NOT NULL DEFAULT '資金計画書（ローン試算）';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS assumption_memo_title TEXT NOT NULL DEFAULT '試算前提条件説明書';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS document_classification TEXT NOT NULL DEFAULT '社外提出用（案）';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS disclaimer_line1 TEXT NOT NULL DEFAULT '本書は媒介業務における説明補助資料であり、契約条項を確定するものではありません。';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS disclaimer_line2 TEXT NOT NULL DEFAULT '最終条件は重要事項説明書・売買契約書・金融機関提示条件をご確認ください。';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS disclaimer_line3 TEXT NOT NULL DEFAULT '本書の再配布時は最新版番号（文書番号・版数）をご確認ください。';
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS show_approval_section BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS show_legal_status_digest BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS show_outstanding_balance_table BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE output_template_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS version_label TEXT NOT NULL DEFAULT 'テンプレート改訂記録';
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS change_note TEXT;
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS settings_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE output_template_versions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS mapping_json JSONB;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS validation_message TEXT;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS error_code TEXT;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS error_summary TEXT;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_type TEXT;
    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;
    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS storage_path TEXT;
    ALTER TABLE attachments ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS output_format TEXT NOT NULL DEFAULT 'pdf';
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ja';
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS actor_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS property_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS party_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS source_quote_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS document_number TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS template_version_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS case_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS template_id TEXT;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS input_data_snapshot JSONB;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS draft_value_snapshot JSONB;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS field_mapping_snapshot JSONB;
    ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS layout_snapshot JSONB;
    ALTER TABLE generated_outputs ALTER COLUMN quote_id DROP NOT NULL;

    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id TEXT;
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS context_json JSONB;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'company';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS purchased_seat_count INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS invitation_provider TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS invitation_status TEXT NOT NULL DEFAULT 'not_sent';
    ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS provider_invitation_id TEXT;
    ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS invitation_url TEXT;
    ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;
    ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMPTZ;
    ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS invitation_error TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS external_auth_subject TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_auth_subject ON users(external_auth_subject);

    UPDATE generated_outputs SET source_quote_id = quote_id WHERE source_quote_id IS NULL;
    UPDATE generated_outputs SET actor_id = user_id WHERE actor_id IS NULL;
    UPDATE generated_outputs SET document_number = id WHERE document_number IS NULL;
    UPDATE audit_logs SET actor_id = user_id WHERE actor_id IS NULL;
    UPDATE audit_logs SET context_json = '{}'::jsonb WHERE context_json IS NULL;
    UPDATE tenant_memberships
       SET invitation_provider = 'manual',
           invitation_status = 'accepted',
           invitation_accepted_at = COALESCE(invitation_accepted_at, updated_at)
     WHERE status = 'active'
       AND invitation_status = 'not_sent';
    UPDATE users SET external_auth_subject = 'demo:user_demo' WHERE id = 'user_demo' AND external_auth_subject IS NULL;
    UPDATE users SET external_auth_subject = 'demo:user_ops' WHERE id = 'user_ops' AND external_auth_subject IS NULL;
  `);

  const userCount = await db.query("SELECT COUNT(*)::int AS count FROM users");
  const count = Number(userCount.rows[0]?.count ?? 0);
  if (count === 0) {
    await db.query(
      `INSERT INTO users (id, name, email, password_hash, external_auth_subject)
       VALUES
        ($1, $2, $3, $4, $5),
        ($6, $7, $8, $9, $10)`,
      [
        "user_demo",
        "デモ担当者",
        "demo@brokerdesk.local",
        "demo_password_hash",
        "demo:user_demo",
        "user_ops",
        "運用担当 佐伯",
        "ops@brokerdesk.local",
        "ops_demo_password_hash",
        "demo:user_ops",
      ]
    );
  }

  await db.query(
    `INSERT INTO users (id, name, email, password_hash, external_auth_subject)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
      external_auth_subject = COALESCE(users.external_auth_subject, EXCLUDED.external_auth_subject)`,
    ["user_ops", "運用担当 佐伯", "ops@brokerdesk.local", "ops_demo_password_hash", "demo:user_ops"]
  );

  await db.query(
    `INSERT INTO tenants (id, name, slug, account_type, status, purchased_seat_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      account_type = EXCLUDED.account_type,
      status = EXCLUDED.status,
      purchased_seat_count = GREATEST(tenants.purchased_seat_count, EXCLUDED.purchased_seat_count),
      updated_at = NOW()`,
    ["tenant_cherry", "Cherry Investment株式会社", "cherry-investment", "company", "active", 5]
  );
  await db.query(
    `INSERT INTO tenant_memberships (
       id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status, invitation_accepted_at
     )
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()),
      ($10, $11, $12, $13, $14, $15, $16, $17, NOW())
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET
      role = EXCLUDED.role,
      capability = EXCLUDED.capability,
      status = EXCLUDED.status,
      invitation_provider = EXCLUDED.invitation_provider,
      invitation_status = EXCLUDED.invitation_status,
      invitation_accepted_at = COALESCE(tenant_memberships.invitation_accepted_at, EXCLUDED.invitation_accepted_at),
      updated_at = NOW()`,
    [
      "membership_cherry_owner",
      "tenant_cherry",
      "user_demo",
      "tenant_owner",
      "company_owner",
      "active",
      "manual",
      "accepted",
      "membership_cherry_admin",
      "tenant_cherry",
      "user_ops",
      "tenant_admin",
      "ordinary_member",
      "active",
      "manual",
      "accepted",
    ]
  );

  const templateCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM output_template_settings WHERE user_id = $1",
    ["user_demo"]
  );
  if (Number(templateCount.rows[0]?.count ?? 0) === 0) {
    const defaults = getDefaultOutputTemplateSettings("user_demo");
    await db.query(
      `INSERT INTO output_template_settings (
        id, user_id, company_name, department, representative, license_number, postal_address, phone, email,
        proposal_title, estimate_sheet_title, funding_plan_title, assumption_memo_title,
        document_classification, disclaimer_line1, disclaimer_line2, disclaimer_line3,
        show_approval_section, show_legal_status_digest, show_outstanding_balance_table, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,$17,
        $18,$19,$20,$21
      )`,
      [
        defaults.id,
        defaults.userId,
        defaults.companyName,
        defaults.department,
        defaults.representative,
        defaults.licenseNumber,
        defaults.postalAddress,
        defaults.phone,
        defaults.email,
        defaults.proposalTitle,
        defaults.estimateSheetTitle,
        defaults.fundingPlanTitle,
        defaults.assumptionMemoTitle,
        defaults.documentClassification,
        defaults.disclaimerLine1,
        defaults.disclaimerLine2,
        defaults.disclaimerLine3,
        defaults.showApprovalSection,
        defaults.showLegalStatusDigest,
        defaults.showOutstandingBalanceTable,
        defaults.updatedAt,
      ]
    );
  }

  const versionCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM output_template_versions WHERE user_id = $1",
    ["user_demo"]
  );
  if (Number(versionCount.rows[0]?.count ?? 0) === 0) {
    const defaults = getDefaultOutputTemplateSettings("user_demo");
    await db.query(
      `INSERT INTO output_template_versions (
        id, user_id, version_number, version_label, change_note, settings_snapshot, is_active, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [
        "tplver_user_demo_001",
        "user_demo",
        1,
        "標準版 v1",
        "初期標準テンプレート",
        JSON.stringify(toTemplateSettingsInput(defaults)),
        true,
        defaults.updatedAt,
      ]
    );
  }

  const importCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM import_jobs WHERE user_id = $1",
    ["user_demo"]
  );
  if (Number(importCount.rows[0]?.count ?? 0) === 0) {
    await db.query(
      `INSERT INTO import_jobs (
        id, user_id, source_type, title, target_entity, status, notes, mapping_json, validation_message, created_at, updated_at
      ) VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$10),
      ($11,$2,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$19),
      ($20,$2,$21,$22,$23,$24,$25,NULL,NULL,$26,$26)`,
      [
        "import_001",
        "user_demo",
        "excel",
        "物件台帳_2026Q1.xlsx",
        "properties",
        "completed",
        "物件31件を保存",
        JSON.stringify({
          物件名: "name",
          所在地: "address",
          エリア: "area",
          売出価格: "listing_price",
        }),
        "必須項目を充足（4/4）",
        new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        "import_002",
        "pdf",
        "旧契約書一括登録（5件）",
        "contracts",
        "mapped",
        "契約種別の確認待ち",
        JSON.stringify({
          契約番号: "contract_number",
          契約種別: "contract_type",
          物件ID: "property_id",
        }),
        "必須項目が不足（署名日）",
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        "import_003",
        "manual",
        "修繕依頼履歴_手入力",
        "service_requests",
        "queued",
        null,
        new Date(Date.now() - 12 * 60 * 60 * 1000),
      ]
    );
  }

  const attachmentCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM attachments WHERE user_id = $1",
    ["user_demo"]
  );
  if (Number(attachmentCount.rows[0]?.count ?? 0) === 0) {
    await db.query(
      `INSERT INTO attachments (
        id, user_id, target_type, target_id, file_name, file_type, file_size_bytes, storage_path, uploaded_at
      ) VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9),
      ($10,$2,$11,$12,$13,$14,$15,$16,$17),
      ($18,$2,$19,$20,$21,$22,$23,$24,$25)`,
      [
        "att_prop_shibuya_floor",
        "user_demo",
        "property",
        "prop_shibuya",
        "渋谷駅徒歩8分マンション_間取り図.pdf",
        "application/pdf",
        842311,
        "demo/property/prop_shibuya/floorplan.pdf",
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        "att_contract_1",
        "contract",
        "quote_lin_a",
        "売買契約書ドラフト_高橋様.pdf",
        "application/pdf",
        1032022,
        "demo/contracts/quote_lin_a/draft.pdf",
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        "att_import_1",
        "import_job",
        "import_002",
        "旧契約書一括.zip",
        "application/zip",
        4245321,
        "demo/import/import_002/source.zip",
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      ]
    );
  }

  schemaEnsured = true;
  brokerDeskGlobal.__brokerDeskPostgresSchemaEnsured = true;
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getRawPool().connect();
  let transactionStarted = false;
  let releaseWithError = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await applyRequestScope(client);
    const result = await fn(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    releaseWithError = true;
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    if (transactionStarted) {
      releaseWithError = true;
    }
    client.release(releaseWithError);
  }
}

function isValidImportStatusTransition(from: ImportJobStatus, to: ImportJobStatus, allowRetry: boolean): boolean {
  if (from === to) return true;
  if (allowRetry && from === "failed" && to === "queued") return true;
  if (from === "queued" && to === "failed") return true;
  if (from === "queued" && to === "processing") return true;
  if (from === "processing" && (to === "mapped" || to === "failed")) return true;
  if (from === "mapped" && (to === "queued" || to === "completed" || to === "failed")) return true;
  return false;
}

export async function listUsers(limit = 50): Promise<User[]> {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM users ORDER BY created_at ASC LIMIT $1", [limit]);
  return result.rows.map(mapUser);
}

export async function getUserById(userId: string): Promise<User | null> {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function getUserByExternalAuthSubject(subject: string): Promise<User | null> {
  await ensureSchema();
  const normalized = subject.trim();
  if (!normalized) return null;
  const result = await getPool().query("SELECT * FROM users WHERE external_auth_subject = $1 LIMIT 1", [normalized]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

function fallbackEmailForExternalSubject(subject: string): string {
  const safeSubject = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";
  return `external-${safeSubject}@brokerdesk.local`;
}

export async function ensureUserForExternalAuth(input: {
  subject: string;
  email?: string;
  name?: string;
}): Promise<User | null> {
  await ensureSchema();
  const subject = input.subject.trim();
  if (!subject) return null;

  const email = input.email?.trim().toLowerCase();
  const fallbackEmail = fallbackEmailForExternalSubject(subject);
  const name = input.name?.trim() || email || subject;

  return withTransaction(async (client) => {
    const bySubject = await client.query("SELECT * FROM users WHERE external_auth_subject = $1 LIMIT 1", [subject]);
    if (bySubject.rows[0]) {
      const user = mapUser(bySubject.rows[0]);
      return user;
    }

    if (email) {
      const byEmail = await client.query("SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1", [email]);
      if (byEmail.rows[0]) {
        const user = mapUser(byEmail.rows[0]);
        if (user.externalAuthSubject && user.externalAuthSubject !== subject) {
          throw new Error("email is already linked to another external identity");
        }
        const linked = await client.query(
          `UPDATE users
           SET external_auth_subject = $1,
               name = CASE WHEN trim(name) = '' THEN $2 ELSE name END
           WHERE id = $3
           RETURNING *`,
          [subject, name, user.id],
        );
        const linkedUser = mapUser(linked.rows[0]);
        return linkedUser;
      }
    }

    const inserted = await client.query(
      `INSERT INTO users (id, name, email, password_hash, external_auth_subject)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (external_auth_subject) DO UPDATE SET
         name = CASE WHEN trim(users.name) = '' THEN EXCLUDED.name ELSE users.name END
      RETURNING *`,
      [genId("user"), name, email || fallbackEmail, "external_auth_user", subject],
    );
    const user = mapUser(inserted.rows[0]);
    return user;
  });
}

/**
 * Bind a Clerk identity only to an existing, valid pending invitation. The
 * restricted SQL function performs the email, expiry, tenant-status and
 * unbound-placeholder checks under one transaction; this adapter never
 * provisions an arbitrary user.
 */
export async function bindCurrentClerkIdentityToPendingInvitation(input: {
  subject: string;
  email?: string;
  name?: string;
}): Promise<User | null> {
  await ensureSchema();
  const subject = input.subject.trim();
  const email = input.email?.trim().toLowerCase();
  if (!subject || !email) return null;

  try {
    const result = await getPool().query(
      `SELECT brokerdesk_private.bind_current_clerk_identity_to_pending_invitation($1, $2, $3) AS user_id`,
      [subject, email, input.name?.trim() || null],
    );
    if (!result.rows[0]?.user_id) return null;
    return getUserByExternalAuthSubject(subject);
  } catch (error) {
    // The append-only function is intentionally not part of the currently
    // applied migration set. Until it is applied, retain the honest
    // no-binding result rather than turning an unconfigured invite path into
    // a generic page failure.
    if ((error as { code?: string })?.code === "42883") return null;
    throw error;
  }
}

export async function suspendUserForExternalAuthSubject(subject: string): Promise<{ userId?: string; suspendedMembershipCount: number }> {
  await ensureSchema();
  const normalized = subject.trim();
  if (!normalized) return { suspendedMembershipCount: 0 };
  return withTransaction(async (client) => {
    const found = await client.query("SELECT * FROM users WHERE external_auth_subject = $1 LIMIT 1", [normalized]);
    if (!found.rows[0]) return { suspendedMembershipCount: 0 };
    const user = mapUser(found.rows[0]);
    await client.query("UPDATE users SET external_auth_subject = NULL WHERE id = $1", [user.id]);
    const suspended = await client.query(
      `UPDATE tenant_memberships
       SET status = 'suspended',
           invitation_status = 'revoked',
           updated_at = NOW()
       WHERE user_id = $1
         AND status <> 'suspended'
       RETURNING id`,
      [user.id],
    );
    return { userId: user.id, suspendedMembershipCount: suspended.rowCount ?? 0 };
  });
}

export async function getDefaultUser(preferredUserId?: string) {
  await ensureSchema();
  if (preferredUserId) {
    const found = await getUserById(preferredUserId);
    if (found) return found;
  }
  const result = await getPool().query("SELECT * FROM users ORDER BY created_at ASC LIMIT 1");
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM tenants WHERE id = $1 LIMIT 1", [tenantId]);
  return result.rows[0] ? mapTenant(result.rows[0]) : null;
}

function mapTenantAccountSummary(row: Record<string, unknown>): TenantAccountSummary {
  const tenant = mapTenant(row);
  const activeSeatCount = Number(row.active_seat_count ?? 0);
  const invitedSeatCount = Number(row.invited_seat_count ?? 0);
  const usedSeatCount = activeSeatCount + invitedSeatCount;
  return {
    ...tenant,
    activeSeatCount,
    invitedSeatCount,
    usedSeatCount,
    availableSeatCount: Math.max(0, tenant.purchasedSeatCount - usedSeatCount),
    ownerMembers: [],
  };
}

function mapTenantMemberJoinedRow(row: Record<string, unknown>): TenantMemberListItem {
  const membership = mapTenantMembership(row);
  return {
    ...membership,
    tenantName: row.tenant_name ? String(row.tenant_name) : undefined,
    user: {
      id: membership.userId,
      name: String(row.user_name ?? ""),
      email: String(row.user_email ?? ""),
      externalAuthSubject: row.user_external_auth_subject ? String(row.user_external_auth_subject) : undefined,
      createdAt: toDate(row.user_created_at) ?? new Date(),
    },
  };
}

export async function listPlatformTenantAccounts(): Promise<TenantAccountSummary[]> {
  await ensureSchema();
  const db = getPool();
  const result = await db.query(
    `SELECT
       tenants.*,
       COUNT(*) FILTER (WHERE tenant_memberships.status = 'active')::int AS active_seat_count,
       COUNT(*) FILTER (WHERE tenant_memberships.status = 'invited')::int AS invited_seat_count
     FROM tenants
     LEFT JOIN tenant_memberships ON tenant_memberships.tenant_id = tenants.id
     GROUP BY tenants.id
     ORDER BY tenants.created_at ASC`,
  );
  const accounts = result.rows.map(mapTenantAccountSummary);
  const ownerResult = await db.query(
    `SELECT
       tenant_memberships.*,
       users.name AS user_name,
       users.email AS user_email,
       users.external_auth_subject AS user_external_auth_subject,
       users.created_at AS user_created_at
     FROM tenant_memberships
     JOIN users ON users.id = tenant_memberships.user_id
     WHERE tenant_memberships.role = 'tenant_owner'
     ORDER BY tenant_memberships.created_at ASC`,
  );
  const ownersByTenant = new Map<string, TenantAccountSummary["ownerMembers"]>();
  ownerResult.rows.forEach((row) => {
    const member = mapTenantMemberJoinedRow(row);
    const current = ownersByTenant.get(member.tenantId) ?? [];
    current.push({
      ...member,
      isBoundToExternalAuth: Boolean(member.user.externalAuthSubject),
    });
    ownersByTenant.set(member.tenantId, current);
  });
  return accounts.map((account) => ({
    ...account,
    ownerMembers: ownersByTenant.get(account.id) ?? [],
  }));
}

function slugifyTenantName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `tenant-${Date.now().toString(36)}`;
}

async function assertTenantHasSeatCapacity(
  client: Pool | PoolClient,
  tenantId: string,
  nextStatus: TenantMembershipStatus,
) {
  if (nextStatus === "suspended") return;
  const result = await client.query(
    `SELECT tenants.purchased_seat_count,
            COUNT(*) FILTER (WHERE tenant_memberships.status IN ('active', 'invited'))::int AS used_seat_count
     FROM tenants
     LEFT JOIN tenant_memberships ON tenant_memberships.tenant_id = tenants.id
     WHERE tenants.id = $1
     GROUP BY tenants.id`,
    [tenantId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("tenant not found");
  if (Number(row.used_seat_count ?? 0) >= Number(row.purchased_seat_count ?? 1)) {
    throw new Error("purchased seat count exceeded");
  }
}

export async function createTenantAccount(input: {
  name: string;
  slug?: string;
  accountType: Tenant["accountType"];
  status?: TenantStatus;
  purchasedSeatCount: number;
  ownerName: string;
  ownerEmail: string;
}): Promise<TenantAccountSummary> {
  await ensureSchema();
  const name = input.name.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!name) throw new Error("tenant name is required");
  if (!ownerEmail) throw new Error("owner email is required");

  return withTransaction(async (client) => {
    const baseSlug = slugifyTenantName(input.slug || name);
    let slug = baseSlug;
    let suffix = 2;
    while (true) {
      const slugResult = await client.query("SELECT id FROM tenants WHERE slug = $1 LIMIT 1", [slug]);
      if (!slugResult.rows[0]) break;
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const tenantResult = await client.query(
      `INSERT INTO tenants (id, name, slug, account_type, status, purchased_seat_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        genId("tenant"),
        name,
        slug,
        input.accountType,
        input.status ?? "trial",
        normalizePurchasedSeatCount(input.purchasedSeatCount),
      ],
    );
    const tenant = mapTenant(tenantResult.rows[0]);

    const userResult = await client.query("SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1", [ownerEmail]);
    let owner = userResult.rows[0] ? mapUser(userResult.rows[0]) : null;
    if (!owner) {
      const inserted = await client.query(
        `INSERT INTO users (id, name, email, password_hash, external_auth_subject)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [genId("user"), input.ownerName.trim() || ownerEmail, ownerEmail, "platform_invited_user", null],
      );
      owner = mapUser(inserted.rows[0]);
    }

    const membershipResult = await client.query(
      `INSERT INTO tenant_memberships (
         id, tenant_id, user_id, role, status, invitation_provider, invitation_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         invitation_provider = EXCLUDED.invitation_provider,
         invitation_status = EXCLUDED.invitation_status,
         updated_at = NOW()
       RETURNING *`,
      [genId("membership"), tenant.id, owner.id, "tenant_owner", "invited", "none", "not_sent"],
    );
    const ownerMembership = mapTenantMembership(membershipResult.rows[0]);

    return {
      ...tenant,
      activeSeatCount: 0,
      invitedSeatCount: 1,
      usedSeatCount: 1,
      availableSeatCount: Math.max(0, tenant.purchasedSeatCount - 1),
      ownerMembers: [{
        ...ownerMembership,
        user: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          externalAuthSubject: owner.externalAuthSubject,
          createdAt: owner.createdAt,
        },
        isBoundToExternalAuth: Boolean(owner.externalAuthSubject),
      }],
    };
  });
}

export async function updateTenantAccountLifecycle(input: {
  tenantId: string;
  status?: TenantStatus;
  purchasedSeatCount?: number;
}): Promise<TenantAccountSummary | null> {
  await ensureSchema();
  return withTransaction(async (client) => {
    const current = await client.query(
      `SELECT tenants.*,
              COUNT(*) FILTER (WHERE tenant_memberships.status = 'active')::int AS active_seat_count,
              COUNT(*) FILTER (WHERE tenant_memberships.status = 'invited')::int AS invited_seat_count
       FROM tenants
       LEFT JOIN tenant_memberships ON tenant_memberships.tenant_id = tenants.id
       WHERE tenants.id = $1
       GROUP BY tenants.id`,
      [input.tenantId],
    );
    if (!current.rows[0]) return null;

    const activeSeatCount = Number(current.rows[0].active_seat_count ?? 0);
    const invitedSeatCount = Number(current.rows[0].invited_seat_count ?? 0);
    const usedSeatCount = activeSeatCount + invitedSeatCount;
    const nextSeatCount =
      input.purchasedSeatCount == null
        ? Number(current.rows[0].purchased_seat_count ?? 1)
        : normalizePurchasedSeatCount(input.purchasedSeatCount);
    if (nextSeatCount < usedSeatCount) {
      throw new Error("purchased seat count cannot be lower than used seats");
    }

    const updated = await client.query(
      `UPDATE tenants
       SET status = COALESCE($2, status),
           purchased_seat_count = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [input.tenantId, input.status ?? null, nextSeatCount],
    );
    return {
      ...mapTenant(updated.rows[0]),
      activeSeatCount,
      invitedSeatCount,
      usedSeatCount,
      availableSeatCount: Math.max(0, nextSeatCount - usedSeatCount),
      ownerMembers: [],
    };
  });
}

/** Creates a company for the already-authenticated local user. */
export async function createTenantAccountForUser(input: {
  userId: string;
  name: string;
  slug?: string;
  accountType?: Tenant["accountType"];
  idempotencyKey: string;
}): Promise<{ tenant: Tenant; membership: TenantMembership }> {
  await ensureSchema();
  const name = input.name.trim();
  if (!name) throw new Error("tenant name is required");
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) throw new Error("tenant idempotency key is required");

  return withTransaction(async (client) => {
    await client.query(
      "SELECT set_config('app.broker_desk_deployment_env', $1, true)",
      [getTenantDeploymentEnvironment()],
    );
    const bootstrapResult = await client.query(
      `SELECT *
       FROM brokerdesk_private.create_tenant_for_current_user($1, $2, $3)`,
      [name, input.accountType ?? "company", idempotencyKey],
    );
    const bootstrap = bootstrapResult.rows[0] as Record<string, unknown> | undefined;
    if (!bootstrap) throw new Error("tenant bootstrap returned no membership");

    const tenantResult = await client.query("SELECT * FROM tenants WHERE id = $1 LIMIT 1", [bootstrap.tenant_id]);
    if (!tenantResult.rows[0]) throw new Error("tenant bootstrap could not load tenant");
    const membershipResult = await client.query(
      `SELECT * FROM tenant_memberships
       WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [bootstrap.membership_id, bootstrap.tenant_id],
    );
    if (!membershipResult.rows[0]) throw new Error("tenant bootstrap could not load membership");

    return {
      tenant: mapTenant(tenantResult.rows[0]),
      membership: mapTenantMembership(membershipResult.rows[0]),
    };
  });
}

export async function listTenantMemberships(userId: string): Promise<TenantMembership[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT membership_record AS membership
     FROM brokerdesk_private.list_tenant_session_lookups_for_current_user()
     WHERE membership_record->>'user_id' = $1
     ORDER BY (membership_record->>'created_at')::timestamptz ASC`,
    [userId],
  );
  return result.rows.map((row) => mapTenantMembership(row.membership as Record<string, unknown>));
}

export async function listPendingTenantInvitations(userId: string): Promise<TenantMemberListItem[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM brokerdesk_private.list_pending_tenant_invitations_for_current_user()`,
  );
  return result.rows.filter((row) => String(row.user_id) === userId).map(mapTenantMemberJoinedRow);
}

export async function acceptTenantInvitation(input: {
  userId: string;
  tenantId: string;
  membershipId: string;
  invitationToken: string;
}): Promise<TenantMemberListItem | null> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM brokerdesk_private.accept_tenant_invitation($1, $2, $3, $4)`,
    [input.tenantId, input.membershipId, input.userId, input.invitationToken.trim()],
  );
  if (!result.rows[0]) return null;
  return getTenantMemberById({ tenantId: input.tenantId, membershipId: input.membershipId });
}

export const listTenantSessionLookupsByExternalAuthSubject = cache(async function listTenantSessionLookupsByExternalAuthSubject(
  subject: string,
): Promise<TenantSessionLookup[]> {
  const normalized = subject.trim();
  if (!normalized) return [];

  // Keep the identity binding at this adapter boundary as well as in the
  // repository proxy. This prevents a cached or direct caller from relying on
  // an ambient scope that was established by a different request path.
  return withPostgresAuthContext(normalized, async () => {
    await ensureSchema();

    // The navigation shell and the route both need this triplet. The restricted
    // function also preserves suspended/removed membership states for the
    // current identity without exposing another user's tenant rows.
    const result = await getPool().query(
      `SELECT user_record AS user, membership_record AS membership, tenant_record AS tenant
       FROM brokerdesk_private.list_tenant_session_lookups_for_current_user()
       ORDER BY (membership_record->>'created_at')::timestamptz ASC`,
    );
    return result.rows.map((row) => ({
      user: mapUser(row.user as Record<string, unknown>),
      membership: mapTenantMembership(row.membership as Record<string, unknown>),
      tenant: mapTenant(row.tenant as Record<string, unknown>),
    }));
  });
});

export async function getTenantMembership(input: { userId: string; tenantId: string }): Promise<TenantMembership | null> {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT * FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2 LIMIT 1",
    [input.userId, input.tenantId],
  );
  return result.rows[0] ? mapTenantMembership(result.rows[0]) : null;
}

export async function listTenantsForUser(userId: string): Promise<Tenant[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT tenants.*
     FROM tenants
     JOIN tenant_memberships ON tenant_memberships.tenant_id = tenants.id
     WHERE tenant_memberships.user_id = $1
       AND tenant_memberships.status = 'active'
       AND tenants.status IN ('trial', 'active')
     ORDER BY tenants.created_at ASC`,
    [userId],
  );
  return result.rows.map(mapTenant);
}

export async function listTenantMembers(tenantId: string): Promise<TenantMemberListItem[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    `SELECT member_record AS member
     FROM brokerdesk_private.list_tenant_members_for_current_tenant($1)`,
    [scopeTenantId],
  );
  return result.rows.map((row) => mapTenantMemberJoinedRow(row.member as Record<string, unknown>));
}

export async function getTenantMemberById(input: {
  tenantId?: string;
  membershipId: string;
}): Promise<TenantMemberListItem | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `SELECT
       tenant_memberships.*,
       users.name AS user_name,
       users.email AS user_email,
       users.external_auth_subject AS user_external_auth_subject,
       users.created_at AS user_created_at
     FROM tenant_memberships
     JOIN users ON users.id = tenant_memberships.user_id
     WHERE tenant_memberships.id = $1
       AND tenant_memberships.tenant_id = $2
     LIMIT 1`,
    [input.membershipId, scopeTenantId],
  );
  return result.rows[0] ? mapTenantMemberJoinedRow(result.rows[0]) : null;
}

export async function updateTenantMemberInvitation(input: {
  tenantId?: string;
  membershipId: string;
  actorUserId?: string;
  invitationProvider: TenantMembership["invitationProvider"];
  invitationStatus: TenantMembership["invitationStatus"];
  providerInvitationId?: string;
  invitationUrl?: string;
  invitationError?: string;
  sentAt?: Date;
  acceptedAt?: Date;
  expiresAt?: Date;
}): Promise<TenantMemberListItem | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const actorUserId = await getAuthenticatedInvitationActorId(input.actorUserId);
  const result = await getPool().query(
    `SELECT * FROM brokerdesk_private.record_tenant_invitation_delivery(
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
     )`,
    [
      scopeTenantId,
      input.membershipId,
      actorUserId,
      input.invitationProvider,
      input.invitationStatus,
      input.providerInvitationId ?? null,
      input.invitationUrl ?? null,
      input.invitationError ?? null,
      input.sentAt ?? null,
      input.acceptedAt ?? null,
      input.expiresAt ?? null,
    ],
  );
  if (!result.rows[0]) return null;
  const memberResult = await getTenantMemberById({ tenantId: scopeTenantId, membershipId: input.membershipId });
  return memberResult;
}

export async function refreshTenantMemberInvitation(input: {
  tenantId?: string;
  membershipId: string;
  invitedByUserId?: string;
}): Promise<TenantMemberListItem | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const actorUserId = await getAuthenticatedInvitationActorId(input.invitedByUserId);
  const result = await getPool().query(
    `SELECT * FROM brokerdesk_private.refresh_tenant_invitation($1, $2, $3, $4)`,
    [scopeTenantId, input.membershipId, actorUserId, actorUserId],
  );
  if (!result.rows[0]) return null;
  return getTenantMemberById({ tenantId: scopeTenantId, membershipId: input.membershipId });
}

export async function inviteTenantMember(input: {
  tenantId?: string;
  name: string;
  email: string;
  role: TenantRole;
  status?: TenantMembershipStatus;
  capability?: TenantCapabilityPreset;
  invitedByUserId?: string;
}): Promise<TenantMemberListItem> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email;
  if (!email) throw new Error("member email is required");
  if ((input.status ?? "invited") !== "invited") {
    throw new Error("PostgreSQL invitations must start in invited state");
  }
  const actorUserId = await getAuthenticatedInvitationActorId(input.invitedByUserId);

  return withTransaction(async (client) => {
    const userResult = await client.query(
      `SELECT * FROM brokerdesk_private.create_tenant_invitation($1, $2, $3, $4, $5, $6)`,
      [scopeTenantId, actorUserId, email, name, input.role, input.capability ?? "ordinary_member"],
    );
    if (!userResult.rows[0]) throw new Error("invited user bootstrap returned no user");
    const row = userResult.rows[0] as Record<string, unknown>;
    const membership = mapTenantMembership({
      id: row.membership_id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      role: row.role,
      capability: row.capability,
      status: row.status,
      invitation_provider: row.invitation_provider,
      invitation_status: row.invitation_status,
      invitation_accepted_at: row.invitation_accepted_at,
      invited_email: row.invited_email,
      invited_by_user_id: row.invited_by_user_id,
      invitation_expires_at: row.invitation_expires_at,
      invitation_token: row.invitation_token,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    return {
      ...membership,
      user: {
        id: String(row.user_id),
        name: String(row.user_name),
        email: String(row.user_email),
        externalAuthSubject: row.user_external_auth_subject ? String(row.user_external_auth_subject) : undefined,
        createdAt: toDate(row.user_created_at) ?? new Date(),
      },
    };
  });
}

export async function updateTenantMemberRole(input: {
  tenantId?: string;
  membershipId: string;
  role: TenantRole;
  capability?: TenantCapabilityPreset;
  actorUserId?: string;
}): Promise<TenantMemberListItem | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const actorUserId = input.actorUserId?.trim();
  if (!actorUserId || !input.capability) throw new Error("member capability actor and preset are required");
  const result = await getPool().query(
    `SELECT * FROM brokerdesk_private.update_tenant_member_capability($1, $2, $3, $4, $5)`,
    [scopeTenantId, input.membershipId, actorUserId, input.role, input.capability],
  );
  const membership = result.rows[0] ? mapTenantMembership(result.rows[0]) : null;
  if (!membership) return null;
  const user = await getUserById(membership.userId);
  if (!user) return null;
  return {
    ...membership,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      externalAuthSubject: user.externalAuthSubject,
      createdAt: user.createdAt,
    },
  };
}

export async function updateTenantMemberStatus(input: {
  tenantId?: string;
  membershipId: string;
  status: TenantMembershipStatus;
  actorUserId?: string;
}): Promise<TenantMemberListItem | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const actorUserId = input.actorUserId?.trim();
  if (!actorUserId) throw new Error("member status actor is required");
  // Read the target through the restricted owner-authorized member-list
  // function before changing its status. A normal users-table read after the
  // update would be filtered by RLS for suspended/removed members and could
  // incorrectly turn a committed update into a null result.
  const existingMember = (await listTenantMembers(scopeTenantId)).find((member) => member.id === input.membershipId);
  if (!existingMember) return null;

  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT * FROM brokerdesk_private.update_tenant_member_status($1, $2, $3, $4)`,
      [scopeTenantId, input.membershipId, actorUserId, input.status],
    );
    const membership = result.rows[0] ? mapTenantMembership(result.rows[0]) : null;
    if (!membership) return null;
    return {
      ...membership,
      user: existingMember.user,
    };
  });
}

export async function listCaseWorkbenchFieldRules(userId: string, tenantId?: string): Promise<CaseWorkbenchFieldRule[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    `SELECT *
     FROM case_workbench_field_rules
     WHERE user_id = $1 AND tenant_id = $2
     ORDER BY field_key ASC`,
    [userId, scopeTenantId],
  );
  return result.rows.map(mapCaseWorkbenchFieldRule);
}

export async function updateCaseWorkbenchFieldRules(
  userId: string,
  input: CaseWorkbenchFieldRuleInput[],
  tenantId?: string,
): Promise<CaseWorkbenchFieldRule[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  await withTransaction(async (client) => {
    for (const rule of input) {
      await client.query(
        `INSERT INTO case_workbench_field_rules (
          id, tenant_id, user_id, field_key, requirement, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, NOW()
        )
        ON CONFLICT (tenant_id, user_id, field_key)
        DO UPDATE SET requirement = EXCLUDED.requirement, updated_at = NOW()`,
        [genId("casefieldrule"), scopeTenantId, userId, rule.fieldKey, rule.requirement],
      );
    }
  });
  return listCaseWorkbenchFieldRules(userId, scopeTenantId);
}

export async function getOutputTemplateSettings(userId: string, tenantId?: string): Promise<OutputTemplateSettings> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const db = getPool();
  const existingRes = await db.query(
    "SELECT * FROM output_template_settings WHERE user_id = $1 AND tenant_id = $2 LIMIT 1",
    [userId, scopeTenantId]
  );
  if (existingRes.rows[0]) {
    return mapOutputTemplateSettings(existingRes.rows[0]);
  }

  const defaults = getDefaultOutputTemplateSettings(userId, scopeTenantId);
  const insertedRes = await db.query(
    `INSERT INTO output_template_settings (
      id, tenant_id, user_id, company_name, department, representative, license_number, postal_address, phone, email,
      proposal_title, estimate_sheet_title, funding_plan_title, assumption_memo_title,
      document_classification, disclaimer_line1, disclaimer_line2, disclaimer_line3,
      show_approval_section, show_legal_status_digest, show_outstanding_balance_table, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,
      $15,$16,$17,$18,
      $19,$20,$21,$22
    )
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET updated_at = output_template_settings.updated_at
    RETURNING *`,
    [
      defaults.id,
      scopeTenantId,
      defaults.userId,
      defaults.companyName,
      defaults.department,
      defaults.representative,
      defaults.licenseNumber,
      defaults.postalAddress,
      defaults.phone,
      defaults.email,
      defaults.proposalTitle,
      defaults.estimateSheetTitle,
      defaults.fundingPlanTitle,
      defaults.assumptionMemoTitle,
      defaults.documentClassification,
      defaults.disclaimerLine1,
      defaults.disclaimerLine2,
      defaults.disclaimerLine3,
      defaults.showApprovalSection,
      defaults.showLegalStatusDigest,
      defaults.showOutstandingBalanceTable,
      defaults.updatedAt,
    ]
  );
  return mapOutputTemplateSettings(insertedRes.rows[0]);
}

export async function updateOutputTemplateSettings(
  userId: string,
  input: OutputTemplateSettingsInput,
  tenantId?: string,
): Promise<OutputTemplateSettings> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const current = await getOutputTemplateSettings(userId, scopeTenantId);
  const result = await getPool().query(
    `UPDATE output_template_settings
     SET
      company_name = $2,
      department = $3,
      representative = $4,
      license_number = $5,
      postal_address = $6,
      phone = $7,
      email = $8,
      proposal_title = $9,
      estimate_sheet_title = $10,
      funding_plan_title = $11,
      assumption_memo_title = $12,
      document_classification = $13,
      disclaimer_line1 = $14,
      disclaimer_line2 = $15,
      disclaimer_line3 = $16,
      show_approval_section = $17,
      show_legal_status_digest = $18,
      show_outstanding_balance_table = $19,
      updated_at = NOW()
     WHERE user_id = $1 AND tenant_id = $20
     RETURNING *`,
    [
      userId,
      input.companyName,
      input.department,
      input.representative,
      input.licenseNumber,
      input.postalAddress,
      input.phone,
      input.email,
      input.proposalTitle,
      input.estimateSheetTitle,
      input.fundingPlanTitle,
      input.assumptionMemoTitle,
      input.documentClassification,
      input.disclaimerLine1,
      input.disclaimerLine2,
      input.disclaimerLine3,
      input.showApprovalSection,
      input.showLegalStatusDigest,
      input.showOutstandingBalanceTable,
      scopeTenantId,
    ]
  );

  if (result.rows[0]) {
    return mapOutputTemplateSettings(result.rows[0]);
  }

  return {
    ...current,
    ...input,
    updatedAt: new Date(),
  };
}

export async function listOutputTemplateVersions(userId: string, limit = 20, tenantId?: string): Promise<OutputTemplateVersion[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    `SELECT * FROM output_template_versions
     WHERE user_id = $1 AND tenant_id = $2
     ORDER BY version_number DESC
     LIMIT $3`,
    [userId, scopeTenantId, limit]
  );
  return result.rows.map(mapOutputTemplateVersion);
}

export async function createOutputTemplateVersion(input: {
  tenantId?: string;
  userId: string;
  versionLabel?: string;
  changeNote?: string;
  settingsSnapshot?: OutputTemplateSettingsInput;
  activate?: boolean;
}): Promise<OutputTemplateVersion> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const settings = input.settingsSnapshot ?? toTemplateSettingsInput(await getOutputTemplateSettings(input.userId, scopeTenantId));
  const activate = input.activate ?? true;

  return withTransaction(async (client) => {
    const nextRes = await client.query(
      "SELECT COALESCE(MAX(version_number), 0)::int + 1 AS next FROM output_template_versions WHERE user_id = $1 AND tenant_id = $2",
      [input.userId, scopeTenantId]
    );
    const versionNumber = Number(nextRes.rows[0]?.next ?? 1);

    if (activate) {
      await client.query("UPDATE output_template_versions SET is_active = FALSE WHERE user_id = $1 AND tenant_id = $2", [
        input.userId,
        scopeTenantId,
      ]);
    }

    const inserted = await client.query(
      `INSERT INTO output_template_versions (
        id, tenant_id, user_id, version_number, version_label, change_note, settings_snapshot, is_active, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW())
      RETURNING *`,
      [
        genId("tplver"),
        scopeTenantId,
        input.userId,
        versionNumber,
        input.versionLabel?.trim() || `テンプレート v${versionNumber}`,
        input.changeNote?.trim() || null,
        JSON.stringify(settings),
        activate,
      ]
    );
    return mapOutputTemplateVersion(inserted.rows[0]);
  });
}

export async function getActiveGuaranteeTemplateLayoutVersion(
  templateId: string,
): Promise<GuaranteeTemplateLayoutVersion | null> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM guarantee_template_layout_versions
     WHERE template_id = $1 AND is_active = TRUE
     LIMIT 1`,
    [templateId],
  );
  return result.rows[0] ? mapGuaranteeTemplateLayoutVersion(result.rows[0]) : null;
}

export async function listGuaranteeTemplateLayoutVersions(
  templateId: string,
  limit = 20,
): Promise<GuaranteeTemplateLayoutVersion[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT * FROM guarantee_template_layout_versions
     WHERE template_id = $1
     ORDER BY version_number DESC
     LIMIT $2`,
    [templateId, limit],
  );
  return result.rows.map(mapGuaranteeTemplateLayoutVersion);
}

export async function publishGuaranteeTemplateLayoutVersion(input: {
  templateId: string;
  baselineVersion: string;
  assetFingerprint: string;
  layoutSnapshot: Record<string, unknown>;
  publishedByUserId: string;
  changeNote?: string;
}): Promise<GuaranteeTemplateLayoutVersion> {
  await ensureSchema();
  return withTransaction(async (client) => {
    const nextResult = await client.query(
      `SELECT COALESCE(MAX(version_number), 0)::int + 1 AS next
       FROM guarantee_template_layout_versions
       WHERE template_id = $1`,
      [input.templateId],
    );
    const versionNumber = Number(nextResult.rows[0]?.next ?? 1);
    await client.query(
      "UPDATE guarantee_template_layout_versions SET is_active = FALSE WHERE template_id = $1 AND is_active = TRUE",
      [input.templateId],
    );
    const inserted = await client.query(
      `INSERT INTO guarantee_template_layout_versions (
        id, template_id, version_number, baseline_version, asset_fingerprint,
        layout_snapshot, change_note, published_by_user_id, is_active, created_at, published_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,TRUE,NOW(),NOW())
      RETURNING *`,
      [
        genId("guarantee_layout"),
        input.templateId,
        versionNumber,
        input.baselineVersion,
        input.assetFingerprint,
        JSON.stringify(input.layoutSnapshot),
        input.changeNote?.trim() || null,
        input.publishedByUserId,
      ],
    );
    return mapGuaranteeTemplateLayoutVersion(inserted.rows[0]);
  });
}

export async function listTenantGuaranteeTemplateInstalls(input: {
  tenantId?: string;
  templateId?: string;
  includeArchived?: boolean;
}): Promise<TenantGuaranteeTemplateInstall[]> {
  await ensureSchema();
  const tenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `SELECT * FROM tenant_guarantee_template_installs
     WHERE tenant_id = $1
       AND ($2::text IS NULL OR template_id = $2)
       AND ($3::boolean = TRUE OR status = 'active')
     ORDER BY updated_at DESC`,
    [tenantId, input.templateId?.trim() || null, Boolean(input.includeArchived)],
  );
  return result.rows.map(mapTenantGuaranteeTemplateInstall);
}

export async function getActiveTenantGuaranteeTemplateInstall(input: {
  tenantId?: string;
  templateId: string;
}): Promise<TenantGuaranteeTemplateInstall | null> {
  const installs = await listTenantGuaranteeTemplateInstalls({
    tenantId: input.tenantId,
    templateId: input.templateId,
  });
  return installs[0] ?? null;
}

export async function installGuaranteeTemplateForTenant(input: {
  tenantId?: string;
  templateId: string;
  sourceLayoutVersionId: string;
  sourceVersionNumber: number;
  sourceAssetFingerprint: string;
  displayName: string;
  layoutSnapshot: Record<string, unknown>;
  installedByUserId?: string;
}): Promise<TenantGuaranteeTemplateInstall> {
  await ensureSchema();
  const tenantId = resolveTenantId(input.tenantId);
  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT * FROM tenant_guarantee_template_installs
       WHERE tenant_id = $1 AND template_id = $2 AND status = 'active'
       LIMIT 1 FOR UPDATE`,
      [tenantId, input.templateId],
    );
    const previous = existing.rows[0] ? mapTenantGuaranteeTemplateInstall(existing.rows[0]) : null;
    // Repeating an installation must never become an implicit tenant upgrade.
    // Upgrade will be a separate, explicitly confirmed operation.
    if (previous) return previous;
    const revisionNumber = 1;
    const installId = genId("tenant_guarantee_template");
    const result = await client.query(
      `INSERT INTO tenant_guarantee_template_installs (
        id, tenant_id, template_id, source_layout_version_id, source_version_number,
        source_asset_fingerprint, display_name, layout_snapshot, revision_number,
        status, installed_by_user_id, installed_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'active',$10,NOW(),NOW())
      RETURNING *`,
      [
        installId,
        tenantId,
        input.templateId,
        input.sourceLayoutVersionId,
        input.sourceVersionNumber,
        input.sourceAssetFingerprint,
        input.displayName.trim(),
        JSON.stringify(input.layoutSnapshot),
        revisionNumber,
        input.installedByUserId ?? null,
      ],
    );
    return mapTenantGuaranteeTemplateInstall(result.rows[0]);
  });
}

export async function archiveTenantGuaranteeTemplateInstall(input: {
  tenantId?: string;
  installId: string;
}): Promise<TenantGuaranteeTemplateInstall | null> {
  await ensureSchema();
  const tenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE tenant_guarantee_template_installs
     SET status = 'archived', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [input.installId, tenantId],
  );
  return result.rows[0] ? mapTenantGuaranteeTemplateInstall(result.rows[0]) : null;
}

export async function applyOutputTemplateVersion(input: {
  tenantId?: string;
  userId: string;
  versionId: string;
}): Promise<OutputTemplateSettings | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const versionRes = await client.query(
      "SELECT * FROM output_template_versions WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1 FOR UPDATE",
      [input.versionId, input.userId, scopeTenantId]
    );
    if (!versionRes.rows[0]) return null;

    const version = mapOutputTemplateVersion(versionRes.rows[0]);
    const result = await client.query(
      `UPDATE output_template_settings
       SET
        company_name = $2,
        department = $3,
        representative = $4,
        license_number = $5,
        postal_address = $6,
        phone = $7,
        email = $8,
        proposal_title = $9,
        estimate_sheet_title = $10,
        funding_plan_title = $11,
        assumption_memo_title = $12,
        document_classification = $13,
        disclaimer_line1 = $14,
        disclaimer_line2 = $15,
        disclaimer_line3 = $16,
        show_approval_section = $17,
        show_legal_status_digest = $18,
        show_outstanding_balance_table = $19,
        updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $20
       RETURNING *`,
      [
        input.userId,
        version.settingsSnapshot.companyName,
        version.settingsSnapshot.department,
        version.settingsSnapshot.representative,
        version.settingsSnapshot.licenseNumber,
        version.settingsSnapshot.postalAddress,
        version.settingsSnapshot.phone,
        version.settingsSnapshot.email,
        version.settingsSnapshot.proposalTitle,
        version.settingsSnapshot.estimateSheetTitle,
        version.settingsSnapshot.fundingPlanTitle,
        version.settingsSnapshot.assumptionMemoTitle,
        version.settingsSnapshot.documentClassification,
        version.settingsSnapshot.disclaimerLine1,
        version.settingsSnapshot.disclaimerLine2,
        version.settingsSnapshot.disclaimerLine3,
        version.settingsSnapshot.showApprovalSection,
        version.settingsSnapshot.showLegalStatusDigest,
        version.settingsSnapshot.showOutstandingBalanceTable,
        scopeTenantId,
      ]
    );

    await client.query("UPDATE output_template_versions SET is_active = FALSE WHERE user_id = $1 AND tenant_id = $2", [
      input.userId,
      scopeTenantId,
    ]);
    await client.query("UPDATE output_template_versions SET is_active = TRUE WHERE id = $1 AND user_id = $2 AND tenant_id = $3", [
      input.versionId,
      input.userId,
      scopeTenantId,
    ]);

    return result.rows[0] ? mapOutputTemplateSettings(result.rows[0]) : null;
  });
}

export async function getOutputTemplateVersionById(input: {
  tenantId?: string;
  userId: string;
  versionId: string;
}): Promise<OutputTemplateVersion | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    "SELECT * FROM output_template_versions WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1",
    [input.versionId, input.userId, scopeTenantId]
  );
  return result.rows[0] ? mapOutputTemplateVersion(result.rows[0]) : null;
}

export async function listImportJobs(userId: string, limit = 50, tenantId?: string): Promise<ImportJob[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    `SELECT * FROM import_jobs
     WHERE user_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, scopeTenantId, limit]
  );
  return result.rows.map(mapImportJob);
}

export async function getImportJobByIdempotencyKey(input: {
  tenantId?: string;
  userId: string;
  idempotencyKey: string;
}): Promise<ImportJob | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const normalizedKey = input.idempotencyKey.trim();
  if (!normalizedKey) return null;
  const result = await getPool().query(
    `SELECT * FROM import_jobs
     WHERE tenant_id = $1 AND user_id = $2 AND idempotency_key = $3
     LIMIT 1`,
    [scopeTenantId, input.userId, normalizedKey],
  );
  return result.rows[0] ? mapImportJob(result.rows[0]) : null;
}

export async function addImportJob(input: {
  tenantId?: string;
  userId: string;
  sourceType: ImportSourceType;
  title: string;
  targetEntity: ImportTargetEntity;
  status?: ImportJobStatus;
  notes?: string;
  idempotencyKey?: string;
}): Promise<ImportJob> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const sourceLabel: Record<ImportSourceType, string> = {
    excel: "Excel",
    pdf: "PDF",
    scan: "スキャン",
    manual: "手入力",
  };
  const targetLabel: Record<ImportTargetEntity, string> = {
    properties: "物件",
    parties: "関係者",
    contracts: "契約",
    service_requests: "対応履歴",
  };
  const result = await getPool().query(
    `INSERT INTO import_jobs (
      id, tenant_id, user_id, source_type, title, target_entity, status, notes, mapping_json, validation_message, idempotency_key, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,$9,NOW(),NOW())
    RETURNING *`,
    [
      genId("import"),
      scopeTenantId,
      input.userId,
      input.sourceType,
      input.title.trim() || `${sourceLabel[input.sourceType]}資料 - ${targetLabel[input.targetEntity]}`,
      input.targetEntity,
      input.status ?? "queued",
      input.notes?.trim() || null,
      input.idempotencyKey?.trim() || null,
    ]
  );
  return mapImportJob(result.rows[0]);
}

export async function updateImportJobMapping(input: {
  tenantId?: string;
  userId: string;
  jobId: string;
  mappingJson: Record<string, string>;
  validationMessage?: string;
  notes?: string;
  status?: ImportJobStatus;
  allowRetry?: boolean;
}): Promise<ImportJob | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  const currentRes = await getPool().query(
    "SELECT status FROM import_jobs WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1",
    [input.jobId, input.userId, scopeTenantId]
  );
  if (!currentRes.rows[0]) return null;
  const currentStatus = String(currentRes.rows[0].status) as ImportJobStatus;
  if (input.status && !isValidImportStatusTransition(currentStatus, input.status, Boolean(input.allowRetry))) {
    throw new Error(`資料読取記録の状態変更が不正です: ${currentStatus} -> ${input.status}`);
  }

  const result = await getPool().query(
    `UPDATE import_jobs
     SET
      mapping_json = $3::jsonb,
      validation_message = $4,
      notes = COALESCE($5, notes),
      status = COALESCE($6, status),
      updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND tenant_id = $7
     RETURNING *`,
    [
      input.jobId,
      input.userId,
      JSON.stringify(input.mappingJson),
      input.validationMessage?.trim() || null,
      input.notes?.trim() || null,
      input.status ?? null,
      scopeTenantId,
    ]
  );
  return result.rows[0] ? mapImportJob(result.rows[0]) : null;
}

export async function updateImportJobExecution(input: {
  tenantId?: string;
  userId: string;
  jobId: string;
  status: "processing" | "failed" | "completed";
  errorCode?: string;
  errorSummary?: string;
  allowRetry?: boolean;
}): Promise<ImportJob | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const currentRes = await getPool().query(
    "SELECT status FROM import_jobs WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1",
    [input.jobId, input.userId, scopeTenantId],
  );
  if (!currentRes.rows[0]) return null;
  const currentStatus = String(currentRes.rows[0].status) as ImportJobStatus;
  if (!isValidImportStatusTransition(currentStatus, input.status, Boolean(input.allowRetry))) {
    throw new Error(`資料読取記録の状態変更が不正です: ${currentStatus} -> ${input.status}`);
  }

  const result = await getPool().query(
    `UPDATE import_jobs
     SET status = $4,
         processing_started_at = CASE WHEN $4 = 'processing' THEN NOW() ELSE processing_started_at END,
         completed_at = CASE WHEN $4 = 'completed' THEN NOW() ELSE completed_at END,
         failed_at = CASE WHEN $4 = 'failed' THEN NOW() ELSE failed_at END,
         attempt_count = CASE WHEN $4 = 'processing' THEN attempt_count + 1 ELSE attempt_count END,
         error_code = CASE WHEN $4 = 'failed' THEN $5 ELSE NULL END,
         error_summary = CASE WHEN $4 = 'failed' THEN $6 ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND tenant_id = $3
     RETURNING *`,
    [input.jobId, input.userId, scopeTenantId, input.status, input.errorCode?.trim() || "import_failed", input.errorSummary?.trim() || "資料を読み取れませんでした。"],
  );
  return result.rows[0] ? mapImportJob(result.rows[0]) : null;
}

export async function retryImportJobExecution(input: {
  tenantId?: string;
  userId: string;
  jobId: string;
}): Promise<ImportJob | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE import_jobs
     SET status = 'queued',
         processing_started_at = NULL,
         error_code = NULL,
         error_summary = NULL,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND status = 'failed'
     RETURNING *`,
    [input.jobId, input.userId, scopeTenantId],
  );
  if (result.rows[0]) return mapImportJob(result.rows[0]);

  const existing = await getPool().query(
    "SELECT * FROM import_jobs WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1",
    [input.jobId, input.userId, scopeTenantId],
  );
  return existing.rows[0] ? mapImportJob(existing.rows[0]) : null;
}

export async function listBrokerageCases(
  userId: string,
  limit = 50,
  tenantId?: string,
  lifecycleStatus: LifecycleFilter = "active",
): Promise<BrokerageCase[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    `SELECT * FROM brokerage_cases
     WHERE user_id = $1 AND tenant_id = $2
       AND owner_resolution_status = 'resolved'
       AND current_owner_user_id IS NOT NULL
       AND ($3 = 'all' OR lifecycle_status = $3)
     ORDER BY updated_at DESC
     LIMIT $4`,
    [userId, scopeTenantId, lifecycleStatus, limit]
  );
  return result.rows.map(mapBrokerageCase);
}

export async function getBrokerageCaseById(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
}): Promise<BrokerageCase | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    "SELECT * FROM brokerage_cases WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND owner_resolution_status = 'resolved' AND current_owner_user_id IS NOT NULL LIMIT 1",
    [input.caseId, input.userId, scopeTenantId]
  );
  return result.rows[0] ? mapBrokerageCase(result.rows[0]) : null;
}

/** Case-page read path guarded by the authenticated RequestContext resolver. */
export async function listBrokerageCasesForContext(input: {
  context: RequestContext;
  limit?: number;
  lifecycleStatus?: LifecycleFilter;
}): Promise<VisibleBrokerageCase[]> {
  return withPostgresAuthContext(input.context.externalAuthSubject, async () => {
    await ensureSchema();
    const lifecycleStatus = input.lifecycleStatus ?? "active";
    const limitClause = input.limit === undefined ? "" : " LIMIT $3";
    const result = await getPool().query(
      `SELECT * FROM brokerage_cases
       WHERE tenant_id = $1
         AND owner_resolution_status = 'resolved'
         AND current_owner_user_id IS NOT NULL
         AND ($2 = 'all' OR lifecycle_status = $2)
       ORDER BY updated_at DESC
       ${limitClause}`,
      input.limit === undefined
        ? [input.context.tenantId, lifecycleStatus]
        : [input.context.tenantId, lifecycleStatus, Math.max(1, input.limit)],
    );
    return result.rows.flatMap((row) => {
      const brokerageCase = mapBrokerageCase(row);
      const resolution = resolveRecordVisibility(input.context, {
        ...brokerageCase,
        tenantId: row.tenant_id == null ? null : String(row.tenant_id),
        currentOwnerUserId: row.current_owner_user_id == null ? null : String(row.current_owner_user_id),
        visibilityScope: row.visibility_scope,
        ownerResolutionStatus: row.owner_resolution_status,
      });
      return resolution.canRead ? [{ brokerageCase, resolution }] : [];
    });
  });
}

export async function getBrokerageCaseByIdForContext(input: {
  context: RequestContext;
  caseId: string;
}): Promise<VisibleBrokerageCase> {
  return withPostgresAuthContext(input.context.externalAuthSubject, async () => {
    await ensureSchema();
    const result = await getPool().query(
      `SELECT * FROM brokerage_cases
       WHERE id = $1 AND tenant_id = $2
         AND owner_resolution_status = 'resolved'
         AND current_owner_user_id IS NOT NULL
       LIMIT 1`,
      [input.caseId, input.context.tenantId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    const brokerageCase = row ? mapBrokerageCase(row) : null;
    const resolution = resolveRecordVisibility(input.context, row ? {
      ...brokerageCase,
      tenantId: row.tenant_id == null ? null : String(row.tenant_id),
      currentOwnerUserId: row.current_owner_user_id == null ? null : String(row.current_owner_user_id),
      visibilityScope: row.visibility_scope,
      ownerResolutionStatus: row.owner_resolution_status,
    } : null);
    return {
      resolution,
      brokerageCase: resolution.canRead ? brokerageCase : null,
    };
  });
}

export async function getBrokerageCaseByImportJobId(input: {
  tenantId?: string;
  userId: string;
  importJobId: string;
}): Promise<BrokerageCase | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `SELECT * FROM brokerage_cases
     WHERE user_id = $1 AND $2 = ANY(source_import_job_ids)
       AND tenant_id = $3
       AND owner_resolution_status = 'resolved'
       AND current_owner_user_id IS NOT NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [input.userId, input.importJobId, scopeTenantId]
  );
  return result.rows[0] ? mapBrokerageCase(result.rows[0]) : null;
}

export async function updateBrokerageCaseConfirmedData(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  confirmedDataJson: Record<string, unknown>;
}): Promise<BrokerageCase | null> {
  assertNoForbiddenRecordInput(input, { allowTenantId: true });
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE brokerage_cases
     SET confirmed_data_json = $3, updated_at = NOW()
     WHERE id = $1 AND current_owner_user_id = $2 AND tenant_id = $4
       AND owner_resolution_status = 'resolved'
     RETURNING *`,
    [input.caseId, input.userId, JSON.stringify(input.confirmedDataJson), scopeTenantId],
  );
  return result.rows[0] ? mapBrokerageCase(result.rows[0]) : null;
}

export async function saveBrokerageCaseExtractionReview(input: {
  tenantId?: string;
  userId: string;
  caseId?: string;
  caseType: BrokerageCaseType;
  caseTitle: string;
  primaryPropertyId?: string;
  status?: BrokerageCaseStatus;
  confirmedDataJson: Record<string, unknown>;
  sourceImportJobIds: string[];
  reviewItems: Array<Omit<ExtractionReviewItem, "id" | "tenantId" | "userId" | "caseId" | "createdAt">>;
}): Promise<BrokerageCase> {
  await ensureSchema();
  const nowIso = new Date().toISOString();
  const caseId = input.caseId ?? genId("case");
  const tenantId = resolveTenantId(input.tenantId);
  const sourceImportJobIds = [...new Set(input.sourceImportJobIds)];
  const caseResult = await withTransaction(async (client) => {
    const visibilityScope = await resolveMemberVisibilityScope(tenantId, input.userId, "case", client);
    const existing = input.caseId
      ? await client.query("SELECT id FROM brokerage_cases WHERE id = $1 AND current_owner_user_id = $2 AND tenant_id = $3 AND owner_resolution_status = 'resolved' LIMIT 1", [
          input.caseId,
          input.userId,
          tenantId,
        ])
      : { rows: [] };
    const result =
      existing.rows.length > 0
        ? await client.query(
            `UPDATE brokerage_cases
             SET case_type = $4, case_title = $5, primary_property_id = $6, status = $7,
                 confirmed_data_json = $8, source_import_job_ids = $9, updated_at = NOW()
             WHERE id = $1 AND current_owner_user_id = $2 AND tenant_id = $3
               AND owner_resolution_status = 'resolved'
             RETURNING *`,
            [
              caseId,
              input.userId,
              tenantId,
              input.caseType,
              input.caseTitle.trim() || "抽出確認案件",
              input.primaryPropertyId ?? null,
              input.status ?? "reviewed",
              JSON.stringify(input.confirmedDataJson),
              sourceImportJobIds,
            ]
          )
        : await client.query(
            `INSERT INTO brokerage_cases (
              id, tenant_id, user_id, case_type, case_title, primary_property_id, status,
              confirmed_data_json, source_import_job_ids, created_by_user_id, current_owner_user_id,
              visibility_scope, owner_resolution_status, created_at, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
             RETURNING *`,
            [
              caseId,
              tenantId,
              input.userId,
              input.caseType,
              input.caseTitle.trim() || "抽出確認案件",
              input.primaryPropertyId ?? null,
              input.status ?? "reviewed",
              JSON.stringify(input.confirmedDataJson),
              sourceImportJobIds,
              input.userId,
              input.userId,
              visibilityScope,
              "resolved",
            ]
          );

    await client.query("DELETE FROM extraction_review_items WHERE case_id = $1 AND tenant_id = $2", [caseId, tenantId]);
    for (const item of input.reviewItems) {
      await client.query(
        `INSERT INTO extraction_review_items (
          id, tenant_id, user_id, case_id, import_job_id, field_key, label,
          extracted_value, normalized_value, edited_value, final_value,
          source_sheet, source_cell, source_range, method, confidence, review_status,
          source_file_hash, template_version, reviewed_by_id, reviewed_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          genId("review"),
          tenantId,
          input.userId,
          caseId,
          item.importJobId,
          item.fieldKey,
          item.label,
          item.extractedValue,
          item.normalizedValue,
          item.editedValue ?? null,
          item.finalValue ?? null,
          item.sourceSheet,
          item.sourceCell ?? null,
          item.sourceRange ?? null,
          item.method,
          item.confidence,
          item.reviewStatus,
          item.sourceFileHash,
          item.templateVersion,
          item.reviewedById ?? null,
          item.reviewedAt,
          nowIso,
        ]
      );
    }

    return result.rows[0];
  });
  return mapBrokerageCase(caseResult);
}

export async function mergeBrokerageCaseExtractionReview(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  confirmedDataJson: Record<string, unknown>;
  sourceImportJobIds: string[];
  replaceImportJobIds: string[];
  reviewItems: Array<Omit<ExtractionReviewItem, "id" | "tenantId" | "userId" | "caseId" | "createdAt">>;
}): Promise<BrokerageCase | null> {
  await ensureSchema();
  const nowIso = new Date().toISOString();
  const tenantId = resolveTenantId(input.tenantId);
  const sourceImportJobIds = [...new Set(input.sourceImportJobIds)];
  const replaceImportJobIds = [...new Set(input.replaceImportJobIds)];
  const caseResult = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE brokerage_cases
       SET confirmed_data_json = $3, source_import_job_ids = $4, updated_at = NOW()
       WHERE id = $1 AND current_owner_user_id = $2 AND tenant_id = $5
         AND owner_resolution_status = 'resolved'
       RETURNING *`,
      [input.caseId, input.userId, JSON.stringify(input.confirmedDataJson), sourceImportJobIds, tenantId],
    );
    if (!result.rows[0]) return null;

    if (replaceImportJobIds.length > 0) {
      await client.query(
        `DELETE FROM extraction_review_items
         WHERE case_id = $1 AND user_id = $2 AND tenant_id = $3 AND import_job_id = ANY($4)`,
        [input.caseId, input.userId, tenantId, replaceImportJobIds],
      );
    }

    for (const item of input.reviewItems) {
      await client.query(
        `INSERT INTO extraction_review_items (
          id, tenant_id, user_id, case_id, import_job_id, field_key, label,
          extracted_value, normalized_value, edited_value, final_value,
          source_sheet, source_cell, source_range, method, confidence, review_status,
          source_file_hash, template_version, reviewed_by_id, reviewed_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          genId("review"),
          tenantId,
          input.userId,
          input.caseId,
          item.importJobId,
          item.fieldKey,
          item.label,
          item.extractedValue,
          item.normalizedValue,
          item.editedValue ?? null,
          item.finalValue ?? null,
          item.sourceSheet,
          item.sourceCell ?? null,
          item.sourceRange ?? null,
          item.method,
          item.confidence,
          item.reviewStatus,
          item.sourceFileHash,
          item.templateVersion,
          item.reviewedById ?? null,
          item.reviewedAt,
          nowIso,
        ],
      );
    }

    return result.rows[0];
  });
  return caseResult ? mapBrokerageCase(caseResult) : null;
}

export async function rollbackBrokerageCaseMerge(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  restoredConfirmedDataJson: Record<string, unknown>;
  restoredSourceImportJobIds: string[];
  splitCaseTitle: string;
  splitCaseId?: string;
  splitConfirmedDataJson: Record<string, unknown>;
  splitSourceImportJobIds: string[];
  splitReviewItems: Array<Omit<ExtractionReviewItem, "id" | "tenantId" | "userId" | "caseId" | "createdAt">>;
  removeImportJobIds: string[];
}): Promise<{ restoredCase: BrokerageCase; splitCase: BrokerageCase } | null> {
  await ensureSchema();
  const nowIso = new Date().toISOString();
  const tenantId = resolveTenantId(input.tenantId);
  const splitCaseId = input.splitCaseId ?? genId("case");
  const removeImportJobIds = [...new Set(input.removeImportJobIds)];
  const result = await withTransaction(async (client) => {
    const restoredResult = await client.query(
      `UPDATE brokerage_cases
       SET confirmed_data_json = $3, source_import_job_ids = $4, updated_at = NOW()
       WHERE id = $1 AND current_owner_user_id = $2 AND tenant_id = $5
         AND owner_resolution_status = 'resolved'
       RETURNING *`,
      [
        input.caseId,
        input.userId,
        JSON.stringify(input.restoredConfirmedDataJson),
        [...new Set(input.restoredSourceImportJobIds)],
        tenantId,
      ],
    );
    if (!restoredResult.rows[0]) return null;

    if (removeImportJobIds.length > 0) {
      await client.query(
        `DELETE FROM extraction_review_items
         WHERE case_id = $1 AND user_id = $2 AND tenant_id = $3 AND import_job_id = ANY($4)`,
        [input.caseId, input.userId, tenantId, removeImportJobIds],
      );
    }

    const splitResult = await client.query(
      `INSERT INTO brokerage_cases (
        id, tenant_id, user_id, case_type, case_title, primary_property_id, status,
        confirmed_data_json, source_import_job_ids,
        created_by_user_id, current_owner_user_id, visibility_scope, owner_resolution_status,
        created_at, updated_at
       )
       SELECT $1, tenant_id, user_id, case_type, $5, primary_property_id, 'reviewed',
              $6, $7, created_by_user_id, current_owner_user_id, visibility_scope, owner_resolution_status,
              NOW(), NOW()
       FROM brokerage_cases
       WHERE id = $2 AND current_owner_user_id = $3 AND tenant_id = $4
         AND owner_resolution_status = 'resolved'
       RETURNING *`,
      [
        splitCaseId,
        input.caseId,
        input.userId,
        tenantId,
        input.splitCaseTitle.trim() || "分離した抽出確認案件",
        JSON.stringify(input.splitConfirmedDataJson),
        [...new Set(input.splitSourceImportJobIds)],
      ],
    );

    for (const item of input.splitReviewItems) {
      await client.query(
        `INSERT INTO extraction_review_items (
          id, tenant_id, user_id, case_id, import_job_id, field_key, label,
          extracted_value, normalized_value, edited_value, final_value,
          source_sheet, source_cell, source_range, method, confidence, review_status,
          source_file_hash, template_version, reviewed_by_id, reviewed_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          genId("review"),
          tenantId,
          input.userId,
          splitCaseId,
          item.importJobId,
          item.fieldKey,
          item.label,
          item.extractedValue,
          item.normalizedValue,
          item.editedValue ?? null,
          item.finalValue ?? null,
          item.sourceSheet,
          item.sourceCell ?? null,
          item.sourceRange ?? null,
          item.method,
          item.confidence,
          item.reviewStatus,
          item.sourceFileHash,
          item.templateVersion,
          item.reviewedById ?? null,
          item.reviewedAt,
          nowIso,
        ],
      );
    }

    return {
      restoredCase: restoredResult.rows[0],
      splitCase: splitResult.rows[0],
    };
  });
  return result
    ? {
        restoredCase: mapBrokerageCase(result.restoredCase),
        splitCase: mapBrokerageCase(result.splitCase),
      }
    : null;
}

export async function listExtractionReviewItems(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
}): Promise<ExtractionReviewItem[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `SELECT * FROM extraction_review_items
     WHERE user_id = $1 AND case_id = $2 AND tenant_id = $3
     ORDER BY created_at ASC`,
    [input.userId, input.caseId, scopeTenantId]
  );
  return result.rows.map(mapExtractionReviewItem);
}

export async function addCorrectionEvents(input: {
  tenantId?: string;
  userId: string;
  events: Array<Omit<CorrectionEvent, "id" | "tenantId" | "userId" | "createdAt">>;
}): Promise<CorrectionEvent[]> {
  await ensureSchema();
  if (input.events.length === 0) return [];
  const tenantId = resolveTenantId(input.tenantId);

  const result = await withTransaction(async (client) => {
    const rows: Record<string, unknown>[] = [];
    for (const event of input.events) {
      const insertResult = await client.query(
        `INSERT INTO correction_events (
          id, tenant_id, user_id, case_id, trigger, field_key, field_label,
          ai_value, confirmed_value, change_type, source_import_job_id, source_location,
          extraction_method, confidence_before, template_id, scope_candidate, source_evidence_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
        RETURNING *`,
        [
          genId("correction"),
          tenantId,
          input.userId,
          event.caseId,
          event.trigger,
          event.fieldKey,
          event.fieldLabel,
          event.aiValue ?? null,
          event.confirmedValue ?? null,
          event.changeType,
          event.sourceImportJobId ?? null,
          event.sourceLocation ?? null,
          event.extractionMethod ?? null,
          event.confidenceBefore ?? null,
          event.templateId ?? null,
          event.scopeCandidate,
          event.sourceEvidenceJson ? JSON.stringify(event.sourceEvidenceJson) : null,
        ],
      );
      rows.push(insertResult.rows[0]);
    }
    return rows;
  });

  return result.map(mapCorrectionEvent);
}

export async function listCorrectionEvents(input: {
  tenantId?: string;
  userId: string;
  caseId?: string;
  limit?: number;
}): Promise<CorrectionEvent[]> {
  await ensureSchema();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = input.caseId
    ? await getPool().query(
        `SELECT * FROM correction_events
         WHERE user_id = $1 AND case_id = $2 AND tenant_id = $3
         ORDER BY created_at DESC
         LIMIT $4`,
        [input.userId, input.caseId, scopeTenantId, limit],
      )
    : await getPool().query(
        `SELECT * FROM correction_events
         WHERE user_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [input.userId, scopeTenantId, limit],
      );
  return result.rows.map(mapCorrectionEvent);
}

export async function addAiExperienceDrafts(input: {
  tenantId?: string;
  userId: string;
  drafts: Array<
    Omit<AiExperienceDraft, "id" | "tenantId" | "userId" | "status" | "createdAt" | "updatedAt"> & {
      status?: AiExperienceDraftStatus;
    }
  >;
}): Promise<AiExperienceDraft[]> {
  await ensureSchema();
  if (input.drafts.length === 0) return [];
  const tenantId = resolveTenantId(input.tenantId);

  const result = await withTransaction(async (client) => {
    const rows: Record<string, unknown>[] = [];
    for (const draft of input.drafts) {
      const insertResult = await client.query(
        `INSERT INTO ai_experience_drafts (
          id, tenant_id, user_id, status, title, body_markdown, event_ids,
          field_key, template_id, change_type, scope_candidate, evidence_summary_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
        RETURNING *`,
        [
          genId("experience"),
          tenantId,
          input.userId,
          draft.status ?? "draft",
          draft.title,
          draft.bodyMarkdown,
          draft.eventIds,
          draft.fieldKey ?? null,
          draft.templateId ?? null,
          draft.changeType,
          draft.scopeCandidate,
          draft.evidenceSummaryJson ? JSON.stringify(draft.evidenceSummaryJson) : null,
        ],
      );
      rows.push(insertResult.rows[0]);
    }
    return rows;
  });

  return result.map(mapAiExperienceDraft);
}

export async function listAiExperienceDrafts(input: {
  tenantId?: string;
  userId: string;
  status?: AiExperienceDraftStatus;
  limit?: number;
}): Promise<AiExperienceDraft[]> {
  await ensureSchema();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = input.status
    ? await getPool().query(
        `SELECT * FROM ai_experience_drafts
         WHERE user_id = $1 AND status = $2 AND tenant_id = $3
         ORDER BY created_at DESC
         LIMIT $4`,
        [input.userId, input.status, scopeTenantId, limit],
      )
    : await getPool().query(
        `SELECT * FROM ai_experience_drafts
         WHERE user_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [input.userId, scopeTenantId, limit],
      );
  return result.rows.map(mapAiExperienceDraft);
}

export async function updateAiExperienceDraftStatus(input: {
  tenantId?: string;
  userId: string;
  draftId: string;
  status: AiExperienceDraftStatus;
}): Promise<AiExperienceDraft | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE ai_experience_drafts
     SET status = $3, updated_at = NOW()
     WHERE user_id = $1 AND id = $2 AND tenant_id = $4
     RETURNING *`,
    [input.userId, input.draftId, input.status, scopeTenantId],
  );
  return result.rows[0] ? mapAiExperienceDraft(result.rows[0]) : null;
}

export async function getGuaranteeApplicationDraft(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  templateId: string;
}): Promise<GuaranteeApplicationDraft | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `SELECT * FROM guarantee_application_drafts
     WHERE case_id = $1 AND template_id = $2
       AND tenant_id = $3
     ORDER BY updated_at DESC
     LIMIT 1`,
    [input.caseId, input.templateId, scopeTenantId],
  );
  return result.rows[0] ? mapGuaranteeApplicationDraft(result.rows[0]) : null;
}

export async function listGuaranteeApplicationDrafts(input: {
  tenantId?: string;
  userId: string;
  caseIds: string[];
  templateIds: string[];
}): Promise<GuaranteeApplicationDraft[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const caseIds = [...new Set(input.caseIds.map((value) => value.trim()).filter(Boolean))];
  const templateIds = [...new Set(input.templateIds.map((value) => value.trim()).filter(Boolean))];
  if (caseIds.length === 0 || templateIds.length === 0) return [];

  const result = await getPool().query(
    `SELECT * FROM guarantee_application_drafts
     WHERE tenant_id = $1
       AND case_id = ANY($2::text[])
       AND template_id = ANY($3::text[])
     ORDER BY updated_at DESC`,
    [scopeTenantId, caseIds, templateIds],
  );
  return result.rows.map(mapGuaranteeApplicationDraft);
}

export async function saveGuaranteeApplicationDraft(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  templateId: string;
  companyCode: GuaranteeApplicationDraft["companyCode"];
  status: GuaranteeApplicationDraftStatus;
  fieldValuesJson: Record<string, unknown>;
  fieldStatusesJson?: Record<string, string>;
  lastReviewedAt?: Date;
}): Promise<GuaranteeApplicationDraft> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  return withTransaction(async (client) => {
    // Serialize first-save races on the product ownership key. The record is
    // tenant + case + logical form; the latest user id is provenance only.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`guarantee-application:${scopeTenantId}:${input.caseId}:${input.templateId}`]);
    const existing = await client.query(
      `SELECT id FROM guarantee_application_drafts
       WHERE tenant_id = $1 AND case_id = $2 AND template_id = $3
       ORDER BY updated_at DESC LIMIT 1`,
      [scopeTenantId, input.caseId, input.templateId],
    );
    const id = `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const result = existing.rows[0]
      ? await client.query(
        `UPDATE guarantee_application_drafts
         SET user_id = $2, company_code = $3, status = $4,
             field_values_json = $5, field_statuses_json = $6,
             last_reviewed_at = $7, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $8
         RETURNING *`,
        [existing.rows[0].id, input.userId, input.companyCode, input.status, JSON.stringify(input.fieldValuesJson), JSON.stringify(input.fieldStatusesJson ?? {}), input.lastReviewedAt ?? null, scopeTenantId],
      )
      : await client.query(
      `INSERT INTO guarantee_application_drafts (
         id, tenant_id, user_id, case_id, template_id, company_code, status,
         field_values_json, field_statuses_json, last_reviewed_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        id,
        scopeTenantId,
        input.userId,
        input.caseId,
        input.templateId,
        input.companyCode,
        input.status,
        JSON.stringify(input.fieldValuesJson),
        JSON.stringify(input.fieldStatusesJson ?? {}),
        input.lastReviewedAt ?? null,
      ],
      );
    return mapGuaranteeApplicationDraft(result.rows[0]);
  });
}

export async function listAttachments(input: {
  tenantId?: string;
  userId: string;
  targetType?: AttachmentTargetType;
  targetId?: string;
  limit?: number;
}): Promise<Attachment[]> {
  await ensureSchema();
  const limit = input.limit ?? 100;
  const scopeTenantId = resolveTenantId(input.tenantId);
  const values: Array<string | number> = [input.userId, scopeTenantId];
  const filters: string[] = ["user_id = $1", "tenant_id = $2"];
  let idx = 3;
  if (input.targetType) {
    filters.push(`target_type = $${idx}`);
    values.push(input.targetType);
    idx += 1;
  }
  if (input.targetId) {
    filters.push(`target_id = $${idx}`);
    values.push(input.targetId);
    idx += 1;
  }
  values.push(limit);
  const result = await getPool().query(
    `SELECT * FROM attachments
     WHERE ${filters.join(" AND ")}
     ORDER BY uploaded_at DESC
     LIMIT $${idx}`,
    values
  );
  return result.rows.map(mapAttachment);
}

export async function getAttachmentById(input: {
  tenantId?: string;
  userId: string;
  id: string;
}): Promise<Attachment | undefined> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `SELECT * FROM attachments WHERE id = $1 AND user_id = $2 AND tenant_id = $3 LIMIT 1`,
    [input.id, input.userId, scopeTenantId],
  );
  return result.rows[0] ? mapAttachment(result.rows[0]) : undefined;
}

export async function addAttachment(input: {
  tenantId?: string;
  userId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  fileName: string;
  fileType?: string;
  fileSizeBytes?: number;
  storagePath?: string;
}): Promise<Attachment> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `INSERT INTO attachments (
      id, tenant_id, user_id, target_type, target_id, file_name, file_type, file_size_bytes, storage_path, uploaded_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    RETURNING *`,
    [
      genId("att"),
      scopeTenantId,
      input.userId,
      input.targetType,
      input.targetId,
      input.fileName.trim(),
      input.fileType?.trim() || null,
      input.fileSizeBytes ?? null,
      input.storagePath?.trim() || null,
    ]
  );
  return mapAttachment(result.rows[0]);
}

export async function addPrivateAttachment(input: {
  tenantId?: string;
  userId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  fileName: string;
  fileType?: string;
  content: Buffer;
}): Promise<Attachment> {
  await ensureSchema();
  if (input.content.length > 10 * 1024 * 1024) {
    throw new Error("private attachment exceeds the 10 MB public-beta limit");
  }
  const scopeTenantId = resolveTenantId(input.tenantId);
  const attachmentId = genId("att");
  return withTransaction(async (client) => {
    const attachmentResult = await client.query(
      `INSERT INTO attachments (
        id, tenant_id, user_id, target_type, target_id, file_name, file_type, file_size_bytes, storage_path, uploaded_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      RETURNING *`,
      [
        attachmentId,
        scopeTenantId,
        input.userId,
        input.targetType,
        input.targetId,
        input.fileName.trim(),
        input.fileType?.trim() || null,
        input.content.length,
        `postgres-private://${scopeTenantId}/${attachmentId}`,
      ],
    );
    await client.query(
      `INSERT INTO private_attachment_blobs (attachment_id, tenant_id, content, sha256)
       VALUES ($1,$2,$3,$4)`,
      [attachmentId, scopeTenantId, input.content, createHash("sha256").update(input.content).digest("hex")],
    );
    return mapAttachment(attachmentResult.rows[0]);
  });
}

export async function readPrivateAttachmentContent(input: {
  tenantId?: string;
  userId: string;
  id: string;
}): Promise<Buffer | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `SELECT blob.content
       FROM private_attachment_blobs blob
       JOIN attachments attachment ON attachment.id = blob.attachment_id
      WHERE attachment.id = $1
        AND attachment.user_id = $2
        AND attachment.tenant_id = $3
        AND blob.tenant_id = $3
      LIMIT 1`,
    [input.id, input.userId, scopeTenantId],
  );
  const content = result.rows[0]?.content;
  return Buffer.isBuffer(content) ? content : content ? Buffer.from(content) : null;
}

export async function readPrivateAttachmentContentForTenant(input: { tenantId?: string; id: string }): Promise<Buffer | null> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(`SELECT blob.content FROM private_attachment_blobs blob JOIN attachments attachment ON attachment.id=blob.attachment_id WHERE attachment.id=$1 AND attachment.tenant_id=$2 AND blob.tenant_id=$2 LIMIT 1`, [input.id, scopeTenantId]);
  const content = result.rows[0]?.content;
  return Buffer.isBuffer(content) ? content : content ? Buffer.from(content) : null;
}

export async function deletePrivateAttachmentForTenant(input: { tenantId?: string; id: string }): Promise<boolean> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(`DELETE FROM attachments WHERE id=$1 AND tenant_id=$2 RETURNING id`, [input.id, scopeTenantId]);
  return result.rowCount === 1;
}

export async function listGeneratedOutputs(input: {
  tenantId?: string;
  userId: string;
  quoteId?: string;
  limit?: number;
}): Promise<GeneratedOutput[]> {
  await ensureSchema();
  const limit = input.limit ?? 100;
  const scopeTenantId = resolveTenantId(input.tenantId);
  const values: Array<string | number> = [input.userId, scopeTenantId];
  const filters: string[] = ["user_id = $1", "tenant_id = $2"];
  let idx = 3;
  if (input.quoteId) {
    filters.push(`quote_id = $${idx}`);
    values.push(input.quoteId);
    idx += 1;
  }
  values.push(limit);
  const result = await getPool().query(
    `SELECT * FROM generated_outputs
     WHERE ${filters.join(" AND ")}
     ORDER BY generated_at DESC
     LIMIT $${idx}`,
    values
  );
  return result.rows.map(mapGeneratedOutput);
}

export async function getGeneratedOutputById(input: {
  tenantId?: string;
  userId: string;
  id: string;
}): Promise<GeneratedOutput | undefined> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `SELECT * FROM generated_outputs
     WHERE user_id = $1 AND id = $2 AND tenant_id = $3
     LIMIT 1`,
    [input.userId, input.id, scopeTenantId]
  );
  if (result.rows.length === 0) return undefined;
  return mapGeneratedOutput(result.rows[0]);
}

export async function listGuaranteeOutputsByCase(input: { tenantId: string; caseId: string; limit?: number }): Promise<GeneratedOutput[]> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT generated_outputs.*,
            CASE
              WHEN generated_outputs.file_status = 'ready'
               AND generated_outputs.file_attachment_id IS NOT NULL
               AND private_attachment_blobs.attachment_id IS NULL
              THEN 'unavailable'
              ELSE generated_outputs.file_status
            END AS file_status
       FROM generated_outputs
       LEFT JOIN private_attachment_blobs
         ON private_attachment_blobs.attachment_id = generated_outputs.file_attachment_id
        AND private_attachment_blobs.tenant_id = generated_outputs.tenant_id
      WHERE generated_outputs.tenant_id = $1
        AND generated_outputs.case_id = $2
        AND generated_outputs.output_type = 'guarantee_application'
      ORDER BY generated_outputs.generated_at DESC LIMIT $3`,
    [resolveTenantId(input.tenantId), input.caseId, input.limit ?? 50],
  );
  return result.rows.map(mapGeneratedOutput);
}

export async function addGeneratedOutput(input: {
  tenantId?: string;
  userId: string;
  actorId?: string;
  sourceQuoteId?: string;
  quoteId?: string;
  propertyId?: string;
  partyId?: string;
  outputType: GeneratedOutput["outputType"];
  outputFormat: GeneratedOutput["outputFormat"];
  language: Locale;
  title: string;
  documentNumber: string;
  templateVersionId?: string;
  caseId?: string;
  templateId?: string;
  inputDataSnapshot?: Record<string, unknown>;
  draftValueSnapshot?: Record<string, unknown>;
  fieldMappingSnapshot?: Record<string, unknown>;
  layoutSnapshot?: Record<string, unknown>;
  fileAttachmentId?: string;
  fileSha256?: string;
  fileSizeBytes?: number;
  fileMimeType?: string;
  blankFormVersionId?: string;
  blankFormSha256?: string;
  companyMaskVersionId?: string;
  fieldCatalogVersion?: string;
  previewConfirmationId?: string;
  caseInputSnapshotHash?: string;
}): Promise<GeneratedOutput> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const actorId = input.actorId ?? input.userId;
  const sourceQuoteId = input.sourceQuoteId ?? input.quoteId;
  const result = await getPool().query(
    `INSERT INTO generated_outputs (
      id, tenant_id, user_id, actor_id, quote_id, source_quote_id, property_id, party_id, output_type, output_format, language, title, document_number, template_version_id, case_id, template_id, input_data_snapshot, draft_value_snapshot, field_mapping_snapshot, layout_snapshot,
      file_attachment_id, file_sha256, file_size_bytes, file_mime_type, file_status, blank_form_version_id, blank_form_sha256, company_mask_version_id, field_catalog_version, preview_confirmation_id, case_input_snapshot_hash, generated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,NOW())
    RETURNING *`,
    [
      genId("out"),
      scopeTenantId,
      input.userId,
      actorId,
      input.quoteId,
      sourceQuoteId,
      input.propertyId ?? null,
      input.partyId ?? null,
      input.outputType,
      input.outputFormat,
      input.language,
      input.title.trim(),
      input.documentNumber.trim(),
      input.templateVersionId ?? null,
      input.caseId ?? null,
      input.templateId ?? null,
      input.inputDataSnapshot ? JSON.stringify(input.inputDataSnapshot) : null,
      input.draftValueSnapshot ? JSON.stringify(input.draftValueSnapshot) : null,
      input.fieldMappingSnapshot ? JSON.stringify(input.fieldMappingSnapshot) : null,
      input.layoutSnapshot ? JSON.stringify(input.layoutSnapshot) : null,
      input.fileAttachmentId ?? null,
      input.fileSha256 ?? null,
      input.fileSizeBytes ?? null,
      input.fileMimeType ?? null,
      input.fileAttachmentId ? "ready" : null,
      input.blankFormVersionId ?? null,
      input.blankFormSha256 ?? null,
      input.companyMaskVersionId ?? null,
      input.fieldCatalogVersion ?? null,
      input.previewConfirmationId ?? null,
      input.caseInputSnapshotHash ?? null,
    ]
  );
  return mapGeneratedOutput(result.rows[0]);
}

export async function finalizeGuaranteePreviewOutput(input: {
  confirmationId: string; processingToken: string; output: GuaranteePreviewOutputInput;
}): Promise<{ output: GeneratedOutput; confirmation: GuaranteePreviewConfirmation }> {
  await ensureSchema();
  const outputInput = input.output;
  const tenantId = resolveTenantId(outputInput.tenantId);
  return withTransaction(async (client) => {
    const confirmation = await client.query(
      `SELECT * FROM guarantee_preview_confirmations
       WHERE id=$1 AND tenant_id=$2 AND status='processing' AND processing_token=$3
       FOR UPDATE`,
      [input.confirmationId, tenantId, input.processingToken],
    );
    if (!confirmation.rows[0] || confirmation.rows[0].generated_output_id) throw new Error("generation_confirmation_commit_failed");
    const actorId = outputInput.actorId ?? outputInput.userId;
    const sourceQuoteId = outputInput.sourceQuoteId ?? outputInput.quoteId;
    const outputId = genId("out");
    const result = await client.query(
      `INSERT INTO generated_outputs (
        id, tenant_id, user_id, actor_id, quote_id, source_quote_id, property_id, party_id, output_type, output_format, language, title, document_number, template_version_id, case_id, template_id, input_data_snapshot, draft_value_snapshot, field_mapping_snapshot, layout_snapshot,
        file_attachment_id, file_sha256, file_size_bytes, file_mime_type, file_status, blank_form_version_id, blank_form_sha256, company_mask_version_id, field_catalog_version, preview_confirmation_id, case_input_snapshot_hash, generated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,NOW()) RETURNING *`,
      [
        outputId, tenantId, outputInput.userId, actorId, outputInput.quoteId ?? null, sourceQuoteId,
        outputInput.propertyId ?? null, outputInput.partyId ?? null, outputInput.outputType, outputInput.outputFormat,
        outputInput.language, outputInput.title.trim(), outputInput.documentNumber.trim(), outputInput.templateVersionId ?? null,
        outputInput.caseId ?? null, outputInput.templateId ?? null,
        outputInput.inputDataSnapshot ? JSON.stringify(outputInput.inputDataSnapshot) : null,
        outputInput.draftValueSnapshot ? JSON.stringify(outputInput.draftValueSnapshot) : null,
        outputInput.fieldMappingSnapshot ? JSON.stringify(outputInput.fieldMappingSnapshot) : null,
        outputInput.layoutSnapshot ? JSON.stringify(outputInput.layoutSnapshot) : null,
        outputInput.fileAttachmentId ?? null, outputInput.fileSha256 ?? null, outputInput.fileSizeBytes ?? null,
        outputInput.fileMimeType ?? null, outputInput.fileAttachmentId ? "ready" : null,
        outputInput.blankFormVersionId ?? null, outputInput.blankFormSha256 ?? null, outputInput.companyMaskVersionId ?? null,
        outputInput.fieldCatalogVersion ?? null, input.confirmationId, outputInput.caseInputSnapshotHash ?? null,
      ],
    );
    const consumed = await client.query(
      `UPDATE guarantee_preview_confirmations
       SET status='consumed',generated_output_id=$4,consumed_at=NOW(),processing_expires_at=NULL,processing_token=NULL
       WHERE id=$1 AND tenant_id=$2 AND status='processing' AND processing_token=$3
       RETURNING *`,
      [input.confirmationId, tenantId, input.processingToken, outputId],
    );
    if (!consumed.rows[0]) throw new Error("generation_confirmation_commit_failed");
    return { output: mapGeneratedOutput(result.rows[0]), confirmation: mapGuaranteePreviewConfirmation(consumed.rows[0]) };
  });
}

export async function createGuaranteeBlankForm(input: { tenantId: string; userId: string; name: string; recipientOrPurpose?: string }): Promise<GuaranteeBlankForm> {
  await ensureSchema(); const tenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(`INSERT INTO guarantee_blank_forms (id,tenant_id,name,recipient_or_purpose,created_by_user_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [genId("gblank"), tenantId, input.name.trim(), input.recipientOrPurpose?.trim() || null, input.userId]);
  return mapGuaranteeBlankForm(result.rows[0]);
}
export async function addGuaranteeBlankFormVersion(input: { tenantId: string; blankFormId: string; attachmentId: string; uploadedByUserId: string; sha256: string; fileSizeBytes: number; pageCount: number; pageWidth: number; pageHeight: number; status?: GuaranteeBlankFormVersion["status"] }): Promise<GuaranteeBlankFormVersion> {
  await ensureSchema(); const tenantId = resolveTenantId(input.tenantId);
  const next = await getPool().query(`SELECT COALESCE(MAX(version_number),0)+1 AS version FROM guarantee_blank_form_versions WHERE blank_form_id=$1 AND tenant_id=$2`, [input.blankFormId, tenantId]);
  const id = genId("gblankver");
  const result = await getPool().query(`INSERT INTO guarantee_blank_form_versions (id,blank_form_id,tenant_id,attachment_id,uploaded_by_user_id,version_number,sha256,file_size_bytes,mime_type,page_count,page_width,page_height,status,status_changed_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'application/pdf',$9,$10,$11,$12,$5) RETURNING *`, [id,input.blankFormId,tenantId,input.attachmentId,input.uploadedByUserId,Number(next.rows[0].version),input.sha256,input.fileSizeBytes,input.pageCount,input.pageWidth,input.pageHeight,input.status ?? "ready"]);
  await getPool().query(`UPDATE guarantee_blank_forms SET active_version_id=$1 WHERE id=$2 AND tenant_id=$3`, [id,input.blankFormId,tenantId]);
  return mapGuaranteeBlankFormVersion(result.rows[0]);
}
export async function getGuaranteeBlankForm(input: { tenantId: string; id: string }): Promise<GuaranteeBlankForm | undefined> { await ensureSchema(); const result=await getPool().query(`SELECT * FROM guarantee_blank_forms WHERE id=$1 AND tenant_id=$2`,[input.id,resolveTenantId(input.tenantId)]); return result.rows[0] ? mapGuaranteeBlankForm(result.rows[0]) : undefined; }
export async function listGuaranteeBlankForms(input: { tenantId: string }): Promise<GuaranteeBlankForm[]> { await ensureSchema(); const result=await getPool().query(`SELECT * FROM guarantee_blank_forms WHERE tenant_id=$1 AND archived_at IS NULL ORDER BY created_at DESC`,[resolveTenantId(input.tenantId)]); return result.rows.map(mapGuaranteeBlankForm); }
export async function deleteGuaranteeBlankFormForTenant(input: { tenantId: string; id: string }): Promise<boolean> { await ensureSchema(); const tenantId=resolveTenantId(input.tenantId); const result=await getPool().query(`DELETE FROM guarantee_blank_forms b WHERE b.id=$1 AND b.tenant_id=$2 AND NOT EXISTS (SELECT 1 FROM guarantee_blank_form_versions v WHERE v.blank_form_id=b.id) AND NOT EXISTS (SELECT 1 FROM guarantee_company_masks m WHERE m.blank_form_id=b.id) RETURNING b.id`,[input.id,tenantId]); return result.rowCount === 1; }
export async function getGuaranteeBlankFormVersion(input: { tenantId: string; id: string }): Promise<GuaranteeBlankFormVersion | undefined> { await ensureSchema(); const result = await getPool().query(`SELECT * FROM guarantee_blank_form_versions WHERE id=$1 AND tenant_id=$2`, [input.id,resolveTenantId(input.tenantId)]); return result.rows[0] ? mapGuaranteeBlankFormVersion(result.rows[0]) : undefined; }
export async function deleteGuaranteeBlankFormVersionForTenant(input: { tenantId: string; id: string }): Promise<boolean> { await ensureSchema(); const tenantId = resolveTenantId(input.tenantId); const result = await getPool().query(`WITH cleared AS (UPDATE guarantee_blank_forms SET active_version_id=NULL WHERE active_version_id=$1 AND tenant_id=$2) DELETE FROM guarantee_blank_form_versions WHERE id=$1 AND tenant_id=$2 RETURNING id`, [input.id, tenantId]); return result.rowCount === 1; }
export async function createGuaranteeCompanyMask(input: { tenantId: string; blankFormId: string; userId: string }): Promise<GuaranteeCompanyMask> { await ensureSchema(); const tenantId=resolveTenantId(input.tenantId); const result=await getPool().query(`INSERT INTO guarantee_company_masks (id,tenant_id,blank_form_id,created_by_user_id) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,blank_form_id) DO UPDATE SET blank_form_id=EXCLUDED.blank_form_id RETURNING *`,[genId("gmask"),tenantId,input.blankFormId,input.userId]); return mapGuaranteeCompanyMask(result.rows[0]); }
export async function getGuaranteeCompanyMask(input: { tenantId: string; id: string }): Promise<GuaranteeCompanyMask | undefined> { await ensureSchema(); const result=await getPool().query(`SELECT * FROM guarantee_company_masks WHERE id=$1 AND tenant_id=$2`,[input.id,resolveTenantId(input.tenantId)]); return result.rows[0] ? mapGuaranteeCompanyMask(result.rows[0]) : undefined; }
export async function getGuaranteeCompanyMaskForBlankForm(input: { tenantId: string; blankFormId: string }): Promise<GuaranteeCompanyMask | undefined> { await ensureSchema(); const result=await getPool().query(`SELECT * FROM guarantee_company_masks WHERE blank_form_id=$1 AND tenant_id=$2`,[input.blankFormId,resolveTenantId(input.tenantId)]); return result.rows[0] ? mapGuaranteeCompanyMask(result.rows[0]) : undefined; }
export async function getGuaranteeCompanyMaskVersion(input: { tenantId: string; id: string }): Promise<GuaranteeCompanyMaskVersion | undefined> { await ensureSchema(); const result=await getPool().query(`SELECT * FROM guarantee_company_mask_versions WHERE id=$1 AND tenant_id=$2`,[input.id,resolveTenantId(input.tenantId)]); return result.rows[0] ? mapGuaranteeCompanyMaskVersion(result.rows[0]) : undefined; }
export async function listPublishedGuaranteeCompanyMaskVersions(input: { tenantId: string }): Promise<GuaranteeCompanyMaskVersion[]> { await ensureSchema(); const result=await getPool().query(`SELECT * FROM guarantee_company_mask_versions WHERE tenant_id=$1 AND status='published' ORDER BY created_at DESC`,[resolveTenantId(input.tenantId)]); return result.rows.map(mapGuaranteeCompanyMaskVersion); }
export async function listGuaranteeCompanyMaskVersions(input: { tenantId: string }): Promise<GuaranteeCompanyMaskVersion[]> { await ensureSchema(); const result=await getPool().query(`SELECT * FROM guarantee_company_mask_versions WHERE tenant_id=$1 AND status IN ('draft','published') ORDER BY created_at DESC`,[resolveTenantId(input.tenantId)]); return result.rows.map(mapGuaranteeCompanyMaskVersion); }
export async function getGuaranteeOutputByCase(input: { tenantId: string; caseId: string; id: string }): Promise<GeneratedOutput | undefined> {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT generated_outputs.*,
            CASE
              WHEN generated_outputs.file_status = 'ready'
               AND generated_outputs.file_attachment_id IS NOT NULL
               AND private_attachment_blobs.attachment_id IS NULL
              THEN 'unavailable'
              ELSE generated_outputs.file_status
            END AS file_status
       FROM generated_outputs
       LEFT JOIN private_attachment_blobs
         ON private_attachment_blobs.attachment_id = generated_outputs.file_attachment_id
        AND private_attachment_blobs.tenant_id = generated_outputs.tenant_id
      WHERE generated_outputs.id=$1 AND generated_outputs.case_id=$2 AND generated_outputs.tenant_id=$3`,
    [input.id, input.caseId, resolveTenantId(input.tenantId)],
  );
  return result.rows[0] ? mapGeneratedOutput(result.rows[0]) : undefined;
}
export async function markGeneratedOutputFileUnavailable(input: { tenantId: string; caseId: string; id: string }): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE generated_outputs
        SET file_status='unavailable'
      WHERE id=$1 AND case_id=$2 AND tenant_id=$3 AND file_status='ready'
      RETURNING id`,
    [input.id, input.caseId, resolveTenantId(input.tenantId)],
  );
  return result.rowCount === 1;
}
export async function deleteGeneratedOutputForTenant(input: { tenantId: string; id: string }): Promise<boolean> { await ensureSchema(); const result=await getPool().query(`DELETE FROM generated_outputs WHERE id=$1 AND tenant_id=$2 RETURNING id`,[input.id,resolveTenantId(input.tenantId)]); return result.rowCount === 1; }
export async function addGuaranteeCompanyMaskVersion(input: { tenantId: string; maskId: string; blankFormVersionId: string; userId: string; fieldCatalogVersion: string; layoutSnapshot: Record<string, unknown>; status?: GuaranteeCompanyMaskVersion["status"]; sourcePlatformMaskId?: string }): Promise<GuaranteeCompanyMaskVersion> { await ensureSchema(); const tenantId=resolveTenantId(input.tenantId); if (input.status === "draft") { const existing = await getPool().query(`SELECT * FROM guarantee_company_mask_versions WHERE mask_id=$1 AND tenant_id=$2 AND status='draft' LIMIT 1`, [input.maskId, tenantId]); if (existing.rows[0]) { const updated = await getPool().query(`UPDATE guarantee_company_mask_versions SET blank_form_version_id=$1,field_catalog_version=$2,layout_snapshot=$3,tested_by_user_id=NULL,tested_at=NULL,tested_pdf_sha256=NULL,tested_layout_digest=NULL,test_confirmed_by_user_id=NULL,test_confirmed_at=NULL WHERE id=$4 AND tenant_id=$5 RETURNING *`, [input.blankFormVersionId, input.fieldCatalogVersion, JSON.stringify(input.layoutSnapshot), existing.rows[0].id, tenantId]); return mapGuaranteeCompanyMaskVersion(updated.rows[0]); } } const next=await getPool().query(`SELECT COALESCE(MAX(version_number),0)+1 AS version FROM guarantee_company_mask_versions WHERE mask_id=$1 AND tenant_id=$2`,[input.maskId,tenantId]); const result=await getPool().query(`INSERT INTO guarantee_company_mask_versions (id,mask_id,tenant_id,blank_form_id,blank_form_version_id,source_platform_mask_id,version_number,status,field_catalog_version,layout_snapshot,created_by_user_id) SELECT $1,m.id,m.tenant_id,m.blank_form_id,$3,$4,$5,$6,$7,$8,$9 FROM guarantee_company_masks m WHERE m.id=$2 AND m.tenant_id=$10 RETURNING *`,[genId("gmaskver"),input.maskId,input.blankFormVersionId,input.sourcePlatformMaskId ?? null,Number(next.rows[0].version),input.status ?? "draft",input.fieldCatalogVersion,JSON.stringify(input.layoutSnapshot),input.userId,tenantId]); return mapGuaranteeCompanyMaskVersion(result.rows[0]); }
export async function markGuaranteeCompanyMaskVersionTested(input: { tenantId: string; maskVersionId: string; userId: string; testPdfSha256: string; testedLayoutDigest: string }): Promise<GuaranteeCompanyMaskVersion | undefined> { await ensureSchema(); const result=await getPool().query(`UPDATE guarantee_company_mask_versions SET tested_by_user_id=$1,tested_at=NOW(),tested_pdf_sha256=$4,tested_layout_digest=$5,test_confirmed_by_user_id=NULL,test_confirmed_at=NULL WHERE id=$2 AND tenant_id=$3 AND status='draft' RETURNING *`,[input.userId,input.maskVersionId,resolveTenantId(input.tenantId),input.testPdfSha256,input.testedLayoutDigest]); return result.rows[0] ? mapGuaranteeCompanyMaskVersion(result.rows[0]) : undefined; }
export async function confirmGuaranteeCompanyMaskVersionTest(input: { tenantId: string; maskVersionId: string; userId: string; testPdfSha256: string }): Promise<GuaranteeCompanyMaskVersion | undefined> { await ensureSchema(); const result=await getPool().query(`UPDATE guarantee_company_mask_versions SET test_confirmed_by_user_id=$1,test_confirmed_at=NOW() WHERE id=$2 AND tenant_id=$3 AND status='draft' AND tested_at IS NOT NULL AND tested_pdf_sha256=$4 RETURNING *`,[input.userId,input.maskVersionId,resolveTenantId(input.tenantId),input.testPdfSha256]); return result.rows[0] ? mapGuaranteeCompanyMaskVersion(result.rows[0]) : undefined; }
export async function publishGuaranteeCompanyMaskVersion(input: { tenantId: string; maskVersionId: string; userId: string }): Promise<GuaranteeCompanyMaskVersion | undefined> { await ensureSchema(); const tenantId=resolveTenantId(input.tenantId); return withTransaction(async (client)=>{ const result=await client.query(`UPDATE guarantee_company_mask_versions SET status='published',published_by_user_id=$1,published_at=NOW() WHERE id=$2 AND tenant_id=$3 AND status='draft' AND tested_at IS NOT NULL AND test_confirmed_at IS NOT NULL AND EXISTS (SELECT 1 FROM guarantee_blank_forms b WHERE b.id=guarantee_company_mask_versions.blank_form_id AND b.tenant_id=$3 AND b.active_version_id=guarantee_company_mask_versions.blank_form_version_id) RETURNING *`,[input.userId,input.maskVersionId,tenantId]); if(!result.rows[0]) return undefined; await client.query(`UPDATE guarantee_company_masks SET active_version_id=$1 WHERE id=$2 AND tenant_id=$3`,[input.maskVersionId,result.rows[0].mask_id,tenantId]); return mapGuaranteeCompanyMaskVersion(result.rows[0]); }); }
export async function publishGuaranteeCompanyMaskVersionWithExactMatch(input: { tenantId: string; maskVersionId: string; userId: string; layoutDigest: string }): Promise<{ version: GuaranteeCompanyMaskVersion; match: GuaranteeMaskMatch } | undefined> { await ensureSchema(); const tenantId=resolveTenantId(input.tenantId); return withTransaction(async (client)=>{ const result=await client.query(`UPDATE guarantee_company_mask_versions SET status='published',published_by_user_id=$1,published_at=NOW() WHERE id=$2 AND tenant_id=$3 AND status='draft' AND tested_at IS NOT NULL AND test_confirmed_at IS NOT NULL AND tested_layout_digest=$4 AND EXISTS (SELECT 1 FROM guarantee_blank_forms b WHERE b.id=guarantee_company_mask_versions.blank_form_id AND b.tenant_id=$3 AND b.active_version_id=guarantee_company_mask_versions.blank_form_version_id) RETURNING *`,[input.userId,input.maskVersionId,tenantId,input.layoutDigest]); if(!result.rows[0]) return undefined; await client.query(`UPDATE guarantee_company_masks SET active_version_id=$1 WHERE id=$2 AND tenant_id=$3`,[input.maskVersionId,result.rows[0].mask_id,tenantId]); const matchResult=await client.query(`INSERT INTO guarantee_mask_matches (id,tenant_id,blank_form_version_id,mask_version_id,status,evaluated_at,evaluated_by_user_id,reason) VALUES ($1,$2,$3,$4,'exact',NOW(),$5,'admin-confirmed-test') ON CONFLICT (tenant_id,blank_form_version_id,mask_version_id) DO UPDATE SET status='exact',evaluated_at=NOW(),evaluated_by_user_id=EXCLUDED.evaluated_by_user_id,reason='admin-confirmed-test' RETURNING *`,[genId("gmatch"),tenantId,result.rows[0].blank_form_version_id,input.maskVersionId,input.userId]); return { version: mapGuaranteeCompanyMaskVersion(result.rows[0]), match: mapGuaranteeMaskMatch(matchResult.rows[0]) }; }); }
export async function rollbackGuaranteeCompanyMaskVersion(input: { tenantId: string; maskId: string; maskVersionId: string; userId: string }): Promise<GuaranteeCompanyMaskVersion | undefined> { await ensureSchema(); const tenantId=resolveTenantId(input.tenantId); return withTransaction(async (client)=>{ const result=await client.query(`SELECT * FROM guarantee_company_mask_versions WHERE id=$1 AND mask_id=$2 AND tenant_id=$3 AND status='published'`,[input.maskVersionId,input.maskId,tenantId]); if(!result.rows[0]) return undefined; await client.query(`UPDATE guarantee_company_masks SET active_version_id=$1 WHERE id=$2 AND tenant_id=$3`,[input.maskVersionId,input.maskId,tenantId]); return mapGuaranteeCompanyMaskVersion(result.rows[0]); }); }
export async function createGuaranteeMaskMatch(input: { tenantId: string; blankFormVersionId: string; maskVersionId: string; status: GuaranteeMaskMatch["status"]; userId: string; reason?: string }): Promise<GuaranteeMaskMatch> { await ensureSchema(); const result=await getPool().query(`INSERT INTO guarantee_mask_matches (id,tenant_id,blank_form_version_id,mask_version_id,status,evaluated_at,evaluated_by_user_id,reason) VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7) ON CONFLICT (tenant_id,blank_form_version_id,mask_version_id) DO UPDATE SET status=EXCLUDED.status,evaluated_at=NOW(),evaluated_by_user_id=EXCLUDED.evaluated_by_user_id,reason=EXCLUDED.reason RETURNING *`,[genId("gmatch"),resolveTenantId(input.tenantId),input.blankFormVersionId,input.maskVersionId,input.status,input.userId,input.reason ?? null]); return mapGuaranteeMaskMatch(result.rows[0]); }
export async function getGuaranteeMaskMatch(input: { tenantId: string; blankFormVersionId: string; maskVersionId: string }): Promise<GuaranteeMaskMatch | undefined> { await ensureSchema(); const result=await getPool().query(`SELECT * FROM guarantee_mask_matches WHERE tenant_id=$1 AND blank_form_version_id=$2 AND mask_version_id=$3`,[resolveTenantId(input.tenantId),input.blankFormVersionId,input.maskVersionId]); return result.rows[0] ? mapGuaranteeMaskMatch(result.rows[0]) : undefined; }
export async function createGuaranteePreviewConfirmation(input: Omit<GuaranteePreviewConfirmation, "id" | "status" | "createdAt">): Promise<GuaranteePreviewConfirmation> { await ensureSchema(); const result=await getPool().query(`INSERT INTO guarantee_preview_confirmations (id,tenant_id,actor_user_id,case_id,case_input_snapshot_hash,blank_form_version_id,blank_form_sha256,company_mask_version_id,field_catalog_version,supplement_snapshot,supplement_hash,expires_at,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'issued') RETURNING *`,[genId("gconfirm"),input.tenantId,input.actorUserId,input.caseId,input.caseInputSnapshotHash,input.blankFormVersionId,input.blankFormSha256,input.companyMaskVersionId,input.fieldCatalogVersion,JSON.stringify(input.supplementSnapshot),input.supplementHash,input.expiresAt]); return mapGuaranteePreviewConfirmation(result.rows[0]); }
export async function claimGuaranteePreviewConfirmation(input: { tenantId: string; id: string; actorUserId: string; leaseMs?: number }): Promise<GuaranteePreviewConfirmation | undefined> { await ensureSchema(); const tenantId=resolveTenantId(input.tenantId); const processingToken=genId("gclaim"); const result=await getPool().query(`UPDATE guarantee_preview_confirmations SET status='processing',processing_expires_at=NOW()+($4::text || ' milliseconds')::interval,processing_token=$5 WHERE id=$1 AND tenant_id=$2 AND actor_user_id=$3 AND expires_at>NOW() AND ((status='issued') OR (status='processing' AND processing_expires_at<NOW())) RETURNING *`,[input.id,tenantId,input.actorUserId,String(input.leaseMs ?? 60000),processingToken]); if(result.rows[0]) return mapGuaranteePreviewConfirmation(result.rows[0]); const existing=await getPool().query(`SELECT * FROM guarantee_preview_confirmations WHERE id=$1 AND tenant_id=$2 AND actor_user_id=$3`,[input.id,tenantId,input.actorUserId]); if(!existing.rows[0]) return undefined; if(String(existing.rows[0].status) === "consumed") return mapGuaranteePreviewConfirmation(existing.rows[0]); return undefined; }
export async function consumeGuaranteePreviewConfirmation(input: { tenantId: string; id: string; actorUserId: string; generatedOutputId: string; processingToken: string }): Promise<GuaranteePreviewConfirmation | undefined> { await ensureSchema(); const result=await getPool().query(`UPDATE guarantee_preview_confirmations SET status='consumed',generated_output_id=$5,consumed_at=NOW(),processing_expires_at=NULL,processing_token=NULL WHERE id=$1 AND tenant_id=$2 AND actor_user_id=$3 AND status='processing' AND processing_token=$4 RETURNING *`,[input.id,resolveTenantId(input.tenantId),input.actorUserId,input.processingToken,input.generatedOutputId]); return result.rows[0] ? mapGuaranteePreviewConfirmation(result.rows[0]) : undefined; }
export async function releaseGuaranteePreviewConfirmation(input: { tenantId: string; id: string; actorUserId: string; processingToken: string }): Promise<GuaranteePreviewConfirmation | undefined> { await ensureSchema(); const result=await getPool().query(`UPDATE guarantee_preview_confirmations SET status='issued',processing_expires_at=NULL,processing_token=NULL WHERE id=$1 AND tenant_id=$2 AND actor_user_id=$3 AND status='processing' AND processing_token=$4 AND generated_output_id IS NULL RETURNING *`,[input.id,resolveTenantId(input.tenantId),input.actorUserId,input.processingToken]); return result.rows[0] ? mapGuaranteePreviewConfirmation(result.rows[0]) : undefined; }

export async function getDashboardData(userId: string) {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM clients WHERE owner_user_id = $1", [userId]);
  const clients = result.rows.map(mapClient);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);

  const todayFollowUps = clients.filter(
    (item) =>
      item.nextFollowUpAt &&
      item.nextFollowUpAt >= startOfDay &&
      item.nextFollowUpAt < endOfDay &&
      OPEN_STAGES.includes(item.stage)
  ).length;

  const newClientsThisWeek = clients.filter((item) => item.createdAt >= sevenDaysAgo).length;
  const quotedCount = clients.filter((item) => item.stage === "quoted").length;
  const negotiatingCount = clients.filter((item) => item.stage === "negotiating").length;

  const followUpList = clients
    .filter((item) => item.nextFollowUpAt && item.nextFollowUpAt <= endOfDay && OPEN_STAGES.includes(item.stage))
    .sort((a, b) => {
      const aTime = a.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 8);
  const priorityList = buildFollowUpPriorityList(clients);
  const clientIds = clients.map((item) => item.id);
  const pendingTaskKeys = new Set<string>();
  if (clientIds.length > 0) {
    const taskRes = await getPool().query(
      `SELECT client_id, title
       FROM tasks
       WHERE status = 'pending' AND client_id = ANY($1)`,
      [clientIds]
    );
    taskRes.rows.forEach((row) => {
      pendingTaskKeys.add(`${String(row.client_id)}::${String(row.title)}`);
    });
  }

  const complianceAlerts = buildComplianceAlertList(clients).map((item) => ({
    ...item,
    isTaskCreated: pendingTaskKeys.has(`${item.clientId}::${item.title}`),
  }));
  const pendingTaskRes = clientIds.length > 0
    ? await getPool().query(
      `SELECT * FROM tasks
       WHERE status = 'pending' AND client_id = ANY($1)
       ORDER BY due_at ASC NULLS LAST
       LIMIT 20`,
      [clientIds]
    )
    : { rows: [] as Array<Record<string, unknown>> };
  const pendingTasks = pendingTaskRes.rows.map(mapTask);
  const notifications = [
    ...pendingTasks
      .filter((task) => task.dueAt && task.dueAt < startOfDay)
      .map((task) => ({
        id: `task-overdue-${task.id}`,
        level: "urgent" as const,
        title: "期限超過タスク",
        message: `${task.title}（期限 ${task.dueAt?.toLocaleDateString("ja-JP")}）`,
        clientId: task.clientId,
      })),
    ...pendingTasks
      .filter((task) => task.dueAt && task.dueAt >= startOfDay && task.dueAt < endOfDay)
      .map((task) => ({
        id: `task-today-${task.id}`,
        level: "info" as const,
        title: "本日期限タスク",
        message: task.title,
        clientId: task.clientId,
      })),
    ...complianceAlerts
      .filter((alert) => alert.level === "urgent")
      .map((alert) => ({
        id: `compliance-${alert.type}-${alert.clientId}`,
        level: "urgent" as const,
        title: "法定対応アラート",
        message: `${alert.clientName}: ${alert.title}`,
        clientId: alert.clientId,
      })),
  ]
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "urgent" ? -1 : 1;
      return a.title.localeCompare(b.title, "ja");
    })
    .slice(0, 8);

  const recentQuotes = await listQuotations(6);

  const staleClients = clients
    .filter(
      (item) => OPEN_STAGES.includes(item.stage) && (!item.lastContactedAt || item.lastContactedAt < sevenDaysAgo)
    )
    .sort((a, b) => (a.lastContactedAt?.getTime() ?? 0) - (b.lastContactedAt?.getTime() ?? 0))
    .slice(0, 6);

  const newUnquoted = clients
    .filter(
      (item) =>
        ["lead", "contacted"].includes(item.stage) &&
        item.createdAt >= threeDaysAgo &&
        !recentQuotes.some((q) => q.clientId === item.id)
    )
    .slice(0, 6);
  const auditRes = await getPool().query(
    "SELECT * FROM audit_logs WHERE actor_id = $1 OR user_id = $1 ORDER BY created_at DESC LIMIT 8",
    [userId]
  );
  const recentAuditLogs = auditRes.rows.map(mapAuditLog);

  return {
    kpis: {
      todayFollowUps,
      newClientsThisWeek,
      quotedCount,
      negotiatingCount,
    },
    followUpList,
    priorityList,
    notifications,
    complianceAlerts,
    recentAuditLogs,
    recentQuotes,
    staleClients,
    newUnquoted,
  };
}

export async function listAuditLogs(userId: string, filter: AuditLogFilter = {}): Promise<AuditLog[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(filter.tenantId);
  const values: Array<string | number> = [userId, scopeTenantId];
  const where: string[] = ["(actor_id = $1 OR user_id = $1)", "tenant_id = $2"];
  let index = 3;

  if (filter.actorId) {
    where.push(`actor_id = $${index}`);
    values.push(filter.actorId);
    index += 1;
  }
  if (filter.action) {
    where.push(`action = $${index}`);
    values.push(filter.action);
    index += 1;
  }
  if (filter.targetType && filter.targetType !== "all") {
    where.push(`target_type = $${index}`);
    values.push(filter.targetType);
    index += 1;
  }
  if (filter.from) {
    where.push(`created_at >= $${index}`);
    values.push(filter.from.toISOString());
    index += 1;
  }
  if (filter.to) {
    where.push(`created_at <= $${index}`);
    values.push(filter.to.toISOString());
    index += 1;
  }
  if (filter.query?.trim()) {
    where.push(`(message ILIKE $${index} OR action ILIKE $${index} OR target_type ILIKE $${index} OR COALESCE(target_id, '') ILIKE $${index})`);
    values.push(`%${filter.query.trim()}%`);
    index += 1;
  }

  const limit = filter.limit ?? 200;
  values.push(limit);
  const limitIndex = index;

  const result = await getPool().query(
    `SELECT * FROM audit_logs
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${limitIndex}`,
    values
  );
  return result.rows.map(mapAuditLog);
}

export async function listClients(userId: string, filter: ClientListFilter = {}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(filter.tenantId);
  const result = await getPool().query("SELECT * FROM clients WHERE owner_user_id = $1 AND tenant_id = $2 AND owner_resolution_status = 'resolved' AND current_owner_user_id IS NOT NULL", [
    userId,
    scopeTenantId,
  ]);
  let clients = result.rows.map(mapClient);

  if (filter.stage && filter.stage !== "all") {
    clients = clients.filter((item) => item.stage === filter.stage);
  }
  if (filter.purpose && filter.purpose !== "all") {
    clients = clients.filter((item) => item.purpose === filter.purpose);
  }
  if (filter.temperature && filter.temperature !== "all") {
    clients = clients.filter((item) => item.temperature === filter.temperature);
  }
  if (filter.lifecycleStatus && filter.lifecycleStatus !== "all") {
    clients = clients.filter((item) => (item.lifecycleStatus ?? "active") === filter.lifecycleStatus);
  }
  if (filter.query) {
    clients = clients.filter(
      (item) =>
        item.name.includes(filter.query!) ||
        item.phone.includes(filter.query!) ||
        (item.preferredArea?.includes(filter.query!) ?? false) ||
        (item.firstChoiceArea?.includes(filter.query!) ?? false) ||
        (item.secondChoiceArea?.includes(filter.query!) ?? false) ||
        (item.notes?.includes(filter.query!) ?? false)
    );
  }

  const sort: ClientListSort = filter.sort ?? "follow_up";
  clients.sort((a, b) => {
    if (sort === "recent_created") return b.createdAt.getTime() - a.createdAt.getTime();
    if (sort === "recent_contact") return (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0);
    const aTime = a.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  const ids = clients.map((item) => item.id);
  const quoteCountMap = new Map<string, number>();
  const followCountMap = new Map<string, number>();

  if (ids.length > 0) {
    const [quoteRes, followRes] = await Promise.all([
      getPool().query(
        "SELECT client_id, COUNT(*)::int AS count FROM quotations WHERE client_id = ANY($1) AND tenant_id = $2 GROUP BY client_id",
        [ids, scopeTenantId]
      ),
      getPool().query(
        "SELECT client_id, COUNT(*)::int AS count FROM follow_ups WHERE client_id = ANY($1) AND tenant_id = $2 GROUP BY client_id",
        [ids, scopeTenantId]
      ),
    ]);
    quoteRes.rows.forEach((row) => quoteCountMap.set(String(row.client_id), Number(row.count)));
    followRes.rows.forEach((row) => followCountMap.set(String(row.client_id), Number(row.count)));
  }

  return clients.map((item) => ({
    ...item,
    _count: {
      quotations: quoteCountMap.get(item.id) ?? 0,
      followUps: followCountMap.get(item.id) ?? 0,
    },
  }));
}

export async function getClientById(clientId: string, tenantId?: string) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 AND owner_resolution_status = 'resolved' AND current_owner_user_id IS NOT NULL LIMIT 1", [
    clientId,
    scopeTenantId,
  ]);
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function getClientDetail(clientId: string, tenantId?: string) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);

  const [clientRes, quoteRes, followRes, taskRes] = await Promise.all([
    getPool().query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 AND owner_resolution_status = 'resolved' AND current_owner_user_id IS NOT NULL LIMIT 1", [clientId, scopeTenantId]),
    getPool().query("SELECT * FROM quotations WHERE client_id = $1 AND tenant_id = $2 ORDER BY created_at DESC", [
      clientId,
      scopeTenantId,
    ]),
    getPool().query("SELECT * FROM follow_ups WHERE client_id = $1 AND tenant_id = $2 ORDER BY created_at DESC", [
      clientId,
      scopeTenantId,
    ]),
    getPool().query(
      `SELECT * FROM tasks
       WHERE client_id = $1 AND tenant_id = $2
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
         due_at ASC NULLS LAST,
         created_at DESC`,
      [clientId, scopeTenantId]
    ),
  ]);

  if (!clientRes.rows[0]) return null;
  const client = mapClient(clientRes.rows[0]);

  const propertyIds = quoteRes.rows.map((row) => row.property_id).filter(Boolean) as string[];
  const properties = new Map<string, Property>();
  if (propertyIds.length > 0) {
    const propRes = await getPool().query("SELECT * FROM properties WHERE id = ANY($1) AND tenant_id = $2", [
      propertyIds,
      scopeTenantId,
    ]);
    propRes.rows.forEach((row) => {
      const property = mapProperty(row);
      properties.set(property.id, property);
    });
  }

  const ownerRes = await getPool().query("SELECT * FROM users WHERE id = $1 LIMIT 1", [client.ownerUserId]);
  const owner = ownerRes.rows[0] ? mapUser(ownerRes.rows[0]) : await getDefaultUser();

  return {
    ...client,
    quotations: quoteRes.rows.map((row) => {
      const quote = mapQuotation(row);
      return {
        ...quote,
        property: quote.propertyId ? properties.get(quote.propertyId) : undefined,
      };
    }),
    followUps: followRes.rows.map(mapFollowUp),
    tasks: taskRes.rows.map(mapTask),
    ownerUser: owner!,
  };
}

export async function getBoardData(userId: string, tenantId?: string) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    "SELECT * FROM clients WHERE owner_user_id = $1 AND tenant_id = $2 AND owner_resolution_status = 'resolved' AND current_owner_user_id IS NOT NULL ORDER BY updated_at DESC",
    [userId, scopeTenantId],
  );
  const clients = result.rows.map(mapClient);

  return clients.reduce<Record<ClientStage, Client[]>>(
    (acc, client) => {
      acc[client.stage].push(client);
      return acc;
    },
    {
      lead: [],
      contacted: [],
      quoted: [],
      viewing: [],
      negotiating: [],
      won: [],
      lost: [],
    }
  );
}

export async function listQuoteFormData(tenantId?: string, lifecycleStatus: LifecycleFilter = "active") {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const [clientsRes, propertiesRes] = await Promise.all([
    getPool().query(
      "SELECT id, name, lifecycle_status FROM clients WHERE tenant_id = $1 AND owner_resolution_status = 'resolved' AND current_owner_user_id IS NOT NULL AND ($2 = 'all' OR lifecycle_status = $2) ORDER BY updated_at DESC",
      [scopeTenantId, lifecycleStatus],
    ),
    getPool().query(
      "SELECT id, name, area, listing_price, management_fee, repair_fee, lifecycle_status FROM properties WHERE tenant_id = $1 AND owner_resolution_status = 'resolved' AND current_owner_user_id IS NOT NULL AND ($2 = 'all' OR lifecycle_status = $2) ORDER BY created_at DESC",
      [scopeTenantId, lifecycleStatus],
    ),
  ]);

  return {
    clients: clientsRes.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      lifecycleStatus: (row.lifecycle_status ?? "active") as LifecycleStatus,
    })),
    properties: propertiesRes.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      area: row.area != null ? String(row.area) : null,
      listingPrice: Number(row.listing_price ?? 0),
      managementFee: row.management_fee != null ? Number(row.management_fee) : null,
      repairFee: row.repair_fee != null ? Number(row.repair_fee) : null,
      lifecycleStatus: (row.lifecycle_status ?? "active") as LifecycleStatus,
    })),
  };
}

export async function setBrokerageCaseLifecycleStatus(input: {
  tenantId?: string;
  userId: string;
  caseId: string;
  status: LifecycleStatus;
  archivedById?: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE brokerage_cases
        SET lifecycle_status = $4,
            archived_at = CASE WHEN $4 = 'archived' THEN NOW() ELSE NULL END,
            archived_by_id = CASE WHEN $4 = 'archived' THEN COALESCE($5, $2) ELSE NULL END,
            updated_at = NOW()
      WHERE id = $1 AND current_owner_user_id = $2 AND tenant_id = $3
        AND owner_resolution_status = 'resolved'
      RETURNING *`,
    [input.caseId, input.userId, scopeTenantId, input.status, input.archivedById ?? null],
  );
  return result.rows[0] ? mapBrokerageCase(result.rows[0]) : null;
}

export async function setClientLifecycleStatus(input: {
  tenantId?: string;
  userId: string;
  clientId: string;
  status: LifecycleStatus;
  archivedById?: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE clients
        SET lifecycle_status = $4,
            archived_at = CASE WHEN $4 = 'archived' THEN NOW() ELSE NULL END,
            archived_by_id = CASE WHEN $4 = 'archived' THEN COALESCE($5, $2) ELSE NULL END,
            updated_at = NOW()
      WHERE id = $1 AND owner_user_id = $2 AND tenant_id = $3
      RETURNING *`,
    [input.clientId, input.userId, scopeTenantId, input.status, input.archivedById ?? null],
  );
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function setPropertyLifecycleStatus(input: {
  tenantId?: string;
  propertyId: string;
  status: LifecycleStatus;
  archivedById?: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE properties
        SET lifecycle_status = $3,
            updated_at = NOW(),
            archived_at = CASE WHEN $3 = 'archived' THEN NOW() ELSE NULL END,
            archived_by_id = CASE WHEN $3 = 'archived' THEN $4 ELSE NULL END
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [input.propertyId, scopeTenantId, input.status, input.archivedById ?? null],
  );
  return result.rows[0] ? mapProperty(result.rows[0]) : null;
}

export async function addProperty(input: {
  tenantId?: string;
  createdByUserId?: string;
  currentOwnerUserId?: string;
  name: string;
  area?: string;
  address?: string;
  listingPrice: number;
  sizeSqm?: number;
  managementFee?: number;
  repairFee?: number;
  notes?: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const ownerUserId = input.currentOwnerUserId?.trim() || null;
  const visibilityScope = ownerUserId
    ? await resolveMemberVisibilityScope(scopeTenantId, ownerUserId, "property")
    : "private";
  const result = await getPool().query(
    `INSERT INTO properties (
      id, tenant_id, name, area, address, listing_price, size_sqm, management_fee, repair_fee, notes,
      created_by_user_id, current_owner_user_id, visibility_scope, owner_resolution_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      genId("prop"),
      scopeTenantId,
      input.name,
      input.area ?? null,
      input.address ?? null,
      input.listingPrice,
      input.sizeSqm ?? null,
      input.managementFee ?? null,
      input.repairFee ?? null,
      input.notes ?? null,
      input.createdByUserId?.trim() || null,
      ownerUserId,
      visibilityScope,
      ownerUserId ? "resolved" : "pending_confirmation",
    ]
  );
  return mapProperty(result.rows[0]);
}

export async function getPropertyById(propertyId: string, tenantId?: string) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    "SELECT * FROM properties WHERE id = $1 AND tenant_id = $2 AND owner_resolution_status = 'resolved' AND current_owner_user_id IS NOT NULL LIMIT 1",
    [propertyId, scopeTenantId],
  );
  return result.rows[0] ? mapProperty(result.rows[0]) : null;
}

export async function updateProperty(
  propertyId: string,
  input: {
    tenantId?: string;
    name: string;
    area?: string;
    address?: string;
    listingPrice: number;
    sizeSqm?: number;
    managementFee?: number;
    repairFee?: number;
    notes?: string;
  },
) {
  assertNoForbiddenRecordInput(input, { allowTenantId: true });
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `UPDATE properties
        SET name = $3,
            area = $4,
            address = $5,
            listing_price = $6,
            size_sqm = $7,
            management_fee = $8,
            repair_fee = $9,
            notes = $10
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [
      propertyId,
      scopeTenantId,
      input.name,
      input.area ?? null,
      input.address ?? null,
      input.listingPrice,
      input.sizeSqm ?? null,
      input.managementFee ?? null,
      input.repairFee ?? null,
      input.notes ?? null,
    ],
  );
  return result.rows[0] ? mapProperty(result.rows[0]) : null;
}

export async function listQuotations(limit?: number, tenantId?: string): Promise<DashboardQuoteItem[]> {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const hasLimit = typeof limit === "number";
  const quoteRes = hasLimit
    ? await getPool().query("SELECT * FROM quotations WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2", [
        scopeTenantId,
        limit,
      ])
    : await getPool().query("SELECT * FROM quotations WHERE tenant_id = $1 ORDER BY created_at DESC", [scopeTenantId]);

  const quotes = quoteRes.rows.map(mapQuotation);
  if (quotes.length === 0) return [];

  const clientIds = [...new Set(quotes.map((item) => item.clientId))];
  const propertyIds = [...new Set(quotes.map((item) => item.propertyId).filter(Boolean) as string[])];

  const [clientRes, propertyRes] = await Promise.all([
    getPool().query("SELECT * FROM clients WHERE id = ANY($1) AND tenant_id = $2", [clientIds, scopeTenantId]),
    propertyIds.length > 0
      ? getPool().query("SELECT * FROM properties WHERE id = ANY($1) AND tenant_id = $2", [propertyIds, scopeTenantId])
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
  ]);

  const clients = new Map(clientRes.rows.map((row) => {
    const client = mapClient(row);
    return [client.id, client] as const;
  }));

  const properties = new Map(propertyRes.rows.map((row) => {
    const property = mapProperty(row);
    return [property.id, property] as const;
  }));

  const items: DashboardQuoteItem[] = [];
  for (const quote of quotes) {
    const client = clients.get(quote.clientId);
    if (!client) continue;
    items.push({
      ...quote,
      client,
      property: quote.propertyId ? properties.get(quote.propertyId) : undefined,
    });
  }
  return items;
}

export async function getQuotationById(quoteId: string, tenantId?: string) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);

  const quoteRes = await getPool().query("SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
    quoteId,
    scopeTenantId,
  ]);
  const row = quoteRes.rows[0];
  if (!row) return null;

  const quote = mapQuotation(row);
  const [clientRes, propertyRes] = await Promise.all([
    getPool().query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1", [quote.clientId, scopeTenantId]),
    quote.propertyId
      ? getPool().query("SELECT * FROM properties WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
          quote.propertyId,
          scopeTenantId,
        ])
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
  ]);

  return {
    ...quote,
    client: clientRes.rows[0] ? mapClient(clientRes.rows[0]) : undefined,
    property: propertyRes.rows[0] ? mapProperty(propertyRes.rows[0]) : undefined,
  };
}

export async function addClient(input: {
  tenantId?: string;
  ownerUserId: string;
  name: string;
  phone: string;
  lineId?: string;
  email?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetType: BudgetType;
  preferredArea?: string;
  firstChoiceArea?: string;
  secondChoiceArea?: string;
  purpose: Purpose;
  loanPreApprovalStatus: LoanPreApprovalStatus;
  desiredMoveInPeriod?: string;
  stage: ClientStage;
  temperature: Temperature;
  brokerageContractType: BrokerageContractType;
  brokerageContractSignedAt?: Date;
  brokerageContractExpiresAt?: Date;
  importantMattersExplainedAt?: Date;
  contractDocumentDeliveredAt?: Date;
  personalInfoConsentAt?: Date;
  amlCheckStatus: AmlCheckStatus;
  nextFollowUpAt?: Date;
  notes?: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const id = genId("client");
  const visibilityScope = await resolveMemberVisibilityScope(scopeTenantId, input.ownerUserId, "person");

  const result = await getPool().query(
    `INSERT INTO clients (
      id, tenant_id, name, phone, line_id, email, budget_min, budget_max, budget_type, preferred_area,
      first_choice_area, second_choice_area, purpose, loan_pre_approval_status, desired_move_in_period,
      stage, temperature, brokerage_contract_type, brokerage_contract_signed_at, brokerage_contract_expires_at,
      important_matters_explained_at, contract_document_delivered_at, personal_info_consent_at, aml_check_status,
      next_follow_up_at, notes, owner_user_id, created_by_user_id, current_owner_user_id,
      visibility_scope, owner_resolution_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
    RETURNING *`,
    [
      id,
      scopeTenantId,
      input.name,
      input.phone,
      input.lineId ?? null,
      input.email ?? null,
      input.budgetMin ?? null,
      input.budgetMax ?? null,
      input.budgetType,
      input.preferredArea ?? null,
      input.firstChoiceArea ?? null,
      input.secondChoiceArea ?? null,
      input.purpose,
      input.loanPreApprovalStatus,
      input.desiredMoveInPeriod ?? null,
      input.stage,
      input.temperature,
      input.brokerageContractType,
      input.brokerageContractSignedAt ?? null,
      input.brokerageContractExpiresAt ?? null,
      input.importantMattersExplainedAt ?? null,
      input.contractDocumentDeliveredAt ?? null,
      input.personalInfoConsentAt ?? null,
      input.amlCheckStatus,
      input.nextFollowUpAt ?? null,
      input.notes ?? null,
      input.ownerUserId,
      input.ownerUserId,
      input.ownerUserId,
      visibilityScope,
      "resolved",
    ]
  );

  return mapClient(result.rows[0]);
}

export async function updateClient(
  clientId: string,
  input: {
    tenantId?: string;
    name: string;
    phone: string;
    lineId?: string;
    email?: string;
    budgetMin?: number;
    budgetMax?: number;
    budgetType: BudgetType;
    preferredArea?: string;
    firstChoiceArea?: string;
    secondChoiceArea?: string;
    purpose: Purpose;
    loanPreApprovalStatus: LoanPreApprovalStatus;
    desiredMoveInPeriod?: string;
    stage: ClientStage;
    temperature: Temperature;
    brokerageContractType: BrokerageContractType;
    brokerageContractSignedAt?: Date;
    brokerageContractExpiresAt?: Date;
    importantMattersExplainedAt?: Date;
    contractDocumentDeliveredAt?: Date;
    personalInfoConsentAt?: Date;
    amlCheckStatus: AmlCheckStatus;
    nextFollowUpAt?: Date;
    notes?: string;
  }
) {
  assertNoForbiddenRecordInput(input, { allowTenantId: true });
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  const result = await getPool().query(
    `UPDATE clients SET
      name = $2,
      phone = $3,
      line_id = $4,
      email = $5,
      budget_min = $6,
      budget_max = $7,
      budget_type = $8,
      preferred_area = $9,
      first_choice_area = $10,
      second_choice_area = $11,
      purpose = $12,
      loan_pre_approval_status = $13,
      desired_move_in_period = $14,
      stage = $15,
      temperature = $16,
      brokerage_contract_type = $17,
      brokerage_contract_signed_at = $18,
      brokerage_contract_expires_at = $19,
      important_matters_explained_at = $20,
      contract_document_delivered_at = $21,
      personal_info_consent_at = $22,
      aml_check_status = $23,
      next_follow_up_at = $24,
      notes = $25,
      updated_at = NOW()
    WHERE id = $1 AND tenant_id = $26
    RETURNING *`,
    [
      clientId,
      input.name,
      input.phone,
      input.lineId ?? null,
      input.email ?? null,
      input.budgetMin ?? null,
      input.budgetMax ?? null,
      input.budgetType,
      input.preferredArea ?? null,
      input.firstChoiceArea ?? null,
      input.secondChoiceArea ?? null,
      input.purpose,
      input.loanPreApprovalStatus,
      input.desiredMoveInPeriod ?? null,
      input.stage,
      input.temperature,
      input.brokerageContractType,
      input.brokerageContractSignedAt ?? null,
      input.brokerageContractExpiresAt ?? null,
      input.importantMattersExplainedAt ?? null,
      input.contractDocumentDeliveredAt ?? null,
      input.personalInfoConsentAt ?? null,
      input.amlCheckStatus,
      input.nextFollowUpAt ?? null,
      input.notes ?? null,
      scopeTenantId,
    ]
  );

  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function appendFollowUp(input: {
  tenantId?: string;
  clientId: string;
  createdById: string;
  type: FollowUpType;
  content: string;
  nextAction?: string;
  nextFollowUpAt?: Date;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const followId = genId("followup");
    const followRes = await client.query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        followId,
        scopeTenantId,
        input.clientId,
        input.type,
        input.content,
        input.nextAction ?? null,
        input.nextFollowUpAt ?? null,
        input.createdById,
      ]
    );

    await client.query(
      `UPDATE clients
       SET last_contacted_at = NOW(), next_follow_up_at = $2, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3`,
      [input.clientId, input.nextFollowUpAt ?? null, scopeTenantId]
    );

    return mapFollowUp(followRes.rows[0]);
  });
}

export async function createComplianceTaskFromAlert(input: {
  tenantId?: string;
  clientId: string;
  alertType: ComplianceAlertType;
  alertTitle: string;
  reason: string;
  dueAt?: Date;
  createdById?: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const clientRes = await client.query(
      "SELECT owner_user_id FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE",
      [input.clientId, scopeTenantId]
    );
    if (!clientRes.rows[0]) return null;

    const createdById = input.createdById ?? String(clientRes.rows[0].owner_user_id);

    const existingRes = await client.query(
      `SELECT * FROM tasks
       WHERE client_id = $1 AND tenant_id = $2 AND title = $3 AND status = 'pending'
       LIMIT 1`,
      [input.clientId, scopeTenantId, input.alertTitle]
    );
    if (existingRes.rows[0]) {
      return mapTask(existingRes.rows[0]);
    }

    const taskRes = await client.query(
      `INSERT INTO tasks (
        id, tenant_id, client_id, title, due_at, status, created_by_id
      ) VALUES ($1,$2,$3,$4,$5,'pending',$6)
      RETURNING *`,
      [genId("task"), scopeTenantId, input.clientId, input.alertTitle, input.dueAt ?? null, createdById]
    );

    await client.query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
      [
        genId("followup"),
        scopeTenantId,
        input.clientId,
        `法定対応タスクを作成: ${input.alertTitle}`,
        input.reason,
        input.dueAt ?? null,
        createdById,
      ]
    );

    await client.query("UPDATE clients SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2", [
      input.clientId,
      scopeTenantId,
    ]);
    await client.query(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        genId("audit"),
        scopeTenantId,
        createdById,
        createdById,
        "compliance_task_created",
        "task",
        String(taskRes.rows[0].id),
        `法定対応タスクを作成しました: ${input.alertTitle}`,
        JSON.stringify({ clientId: input.clientId, alertType: input.alertType }),
      ]
    );

    return mapTask(taskRes.rows[0]);
  });
}

export async function addTask(input: {
  tenantId?: string;
  clientId?: string;
  title: string;
  dueAt?: Date;
  status?: TaskStatus;
  createdById: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const result = await getPool().query(
    `INSERT INTO tasks (
      id, tenant_id, client_id, title, due_at, status, created_by_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`,
    [
      genId("task"),
      scopeTenantId,
      input.clientId ?? null,
      input.title,
      input.dueAt ?? null,
      input.status ?? "pending",
      input.createdById,
    ]
  );
  return mapTask(result.rows[0]);
}

export async function addAuditLog(input: {
  tenantId?: string;
  userId?: string;
  actorId?: string;
  action: string;
  targetType: AuditLog["targetType"];
  targetId?: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const actorId = input.actorId ?? input.userId;
  if (!actorId) {
    throw new Error("監査ログに必要な actorId が不足しています。");
  }
  const result = await getPool().query(
    `INSERT INTO audit_logs (
      id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING *`,
    [
      genId("audit"),
      scopeTenantId,
      actorId,
      actorId,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.message,
      JSON.stringify(input.context ?? {}),
    ]
  );
  return mapAuditLog(result.rows[0]);
}

export async function resolveComplianceAlert(input: {
  tenantId?: string;
  clientId: string;
  alertType: ComplianceAlertType;
  resolvedById: string;
  resolvedAt?: Date;
  extendDays?: number;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const currentRes = await client.query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE", [
      input.clientId,
      scopeTenantId,
    ]);
    if (!currentRes.rows[0]) return null;
    const current = mapClient(currentRes.rows[0]);

    const resolvedAt = input.resolvedAt ?? new Date();
    const updates: string[] = ["updated_at = NOW()"];
    const values: Array<string | Date | number | null> = [input.clientId, scopeTenantId];
    let idx = 3;
    let content = "法定対応を更新しました。";

    const pushSet = (column: string, value: string | Date | null) => {
      updates.push(`${column} = $${idx}`);
      values.push(value);
      idx += 1;
    };

    if (input.alertType === "missing_35") {
      pushSet("important_matters_explained_at", resolvedAt);
      content = "重要事項説明（35条）実施日を記録しました。";
    } else if (input.alertType === "missing_37") {
      pushSet("contract_document_delivered_at", resolvedAt);
      content = "契約書面交付（37条）日を記録しました。";
    } else if (input.alertType === "aml_pending") {
      pushSet("aml_check_status", "verified");
      content = "本人確認/AMLステータスを「確認済み」に更新しました。";
    } else if (input.alertType === "missing_pii_consent") {
      pushSet("personal_info_consent_at", resolvedAt);
      content = "個人情報利用目的の同意確認日を記録しました。";
    } else if (input.alertType === "brokerage_expired" || input.alertType === "brokerage_expiring") {
      const extendDays = input.extendDays && input.extendDays > 0 ? input.extendDays : 90;
      const nextExpire = new Date(resolvedAt.getTime() + extendDays * 24 * 60 * 60 * 1000);
      pushSet("brokerage_contract_signed_at", current.brokerageContractSignedAt ?? resolvedAt);
      pushSet("brokerage_contract_type", current.brokerageContractType === "none" ? "general" : current.brokerageContractType);
      pushSet("brokerage_contract_expires_at", nextExpire);
      content = `媒介契約の満了日を ${extendDays} 日延長して更新しました。`;
    }

    const updateRes = await client.query(
      `UPDATE clients
       SET ${updates.join(", ")}
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      values
    );

    await client.query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, created_by_id
      ) VALUES ($1,$2,$3,'note',$4,$5,$6)`,
      [
        genId("followup"),
        scopeTenantId,
        input.clientId,
        `法定対応を解消: ${content}`,
        "法定対応記録を再確認",
        input.resolvedById,
      ]
    );
    await client.query(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        genId("audit"),
        scopeTenantId,
        input.resolvedById,
        input.resolvedById,
        "compliance_resolved",
        "compliance",
        input.clientId,
        content,
        JSON.stringify({ alertType: input.alertType }),
      ]
    );

    return updateRes.rows[0] ? mapClient(updateRes.rows[0]) : null;
  });
}

export async function updateTaskStatus(input: {
  tenantId?: string;
  taskId: string;
  status: TaskStatus;
  updatedById: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const statusLabel = input.status === "done" ? "完了" : input.status === "canceled" ? "取消" : "未着手";

  return withTransaction(async (client) => {
    const taskRes = await client.query("SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE", [
      input.taskId,
      scopeTenantId,
    ]);
    if (!taskRes.rows[0]) return null;
    const task = mapTask(taskRes.rows[0]);

    const updatedRes = await client.query(
      "UPDATE tasks SET status = $2 WHERE id = $1 AND tenant_id = $3 RETURNING *",
      [input.taskId, input.status, scopeTenantId]
    );

    if (task.clientId) {
      await client.query(
        `INSERT INTO follow_ups (
          id, tenant_id, client_id, type, content, next_action, created_by_id
        ) VALUES ($1,$2,$3,'note',$4,$5,$6)`,
        [
          genId("followup"),
          scopeTenantId,
          task.clientId,
          `タスク状態を更新: ${task.title}（${statusLabel}）`,
          input.status === "done" ? "次の優先タスクを確認" : "必要に応じて再計画",
          input.updatedById,
        ]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        genId("audit"),
        scopeTenantId,
        input.updatedById,
        input.updatedById,
        "task_status_updated",
        "task",
        input.taskId,
        `${task.title} を ${statusLabel} に更新しました。`,
        JSON.stringify({ status: input.status }),
      ]
    );

    return mapTask(updatedRes.rows[0]);
  });
}

export async function rescheduleTask(input: {
  tenantId?: string;
  taskId: string;
  dueAt: Date;
  updatedById: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);

  return withTransaction(async (client) => {
    const taskRes = await client.query("SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE", [
      input.taskId,
      scopeTenantId,
    ]);
    if (!taskRes.rows[0]) return null;
    const task = mapTask(taskRes.rows[0]);

    const updatedRes = await client.query(
      "UPDATE tasks SET due_at = $2, status = 'pending' WHERE id = $1 AND tenant_id = $3 RETURNING *",
      [input.taskId, input.dueAt, scopeTenantId]
    );

    if (task.clientId) {
      await client.query(
        `INSERT INTO follow_ups (
          id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
        ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
        [
          genId("followup"),
          scopeTenantId,
          task.clientId,
          `タスク期限を変更: ${task.title}`,
          `新しい期限は ${input.dueAt.toLocaleDateString("ja-JP")}`,
          input.dueAt,
          input.updatedById,
        ]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, actor_id, action, target_type, target_id, message, context_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        genId("audit"),
        scopeTenantId,
        input.updatedById,
        input.updatedById,
        "task_rescheduled",
        "task",
        input.taskId,
        `${task.title} の期限を ${input.dueAt.toLocaleDateString("ja-JP")} に変更しました。`,
        JSON.stringify({ dueAt: input.dueAt.toISOString() }),
      ]
    );

    return mapTask(updatedRes.rows[0]);
  });
}

export async function setClientStage(clientId: string, stage: ClientStage, tenantId?: string) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const db = getPool();
  const beforeRes = await db.query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
    clientId,
    scopeTenantId,
  ]);
  if (!beforeRes.rows[0]) return null;
  const before = mapClient(beforeRes.rows[0]);
  const [quoteCountRes, followCountRes, viewingCountRes] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS count FROM quotations WHERE client_id = $1 AND tenant_id = $2", [
      clientId,
      scopeTenantId,
    ]),
    db.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND tenant_id = $2", [
      clientId,
      scopeTenantId,
    ]),
    db.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND tenant_id = $2 AND type = 'viewing'", [
      clientId,
      scopeTenantId,
    ]),
  ]);
  const blockers = validateStageTransition({
    from: before.stage,
    to: stage,
    quotationCount: Number(quoteCountRes.rows[0]?.count ?? 0),
    followUpCount: Number(followCountRes.rows[0]?.count ?? 0),
    hasViewingFollowUp: Number(viewingCountRes.rows[0]?.count ?? 0) > 0,
    importantMattersExplainedAt: before.importantMattersExplainedAt,
    personalInfoConsentAt: before.personalInfoConsentAt,
    amlCheckStatus: before.amlCheckStatus,
  });
  if (blockers.length > 0) {
    throw new StageTransitionBlockedError(blockers);
  }

  const result = await db.query("UPDATE clients SET stage = $2, updated_at = NOW() WHERE id = $1 AND tenant_id = $3 RETURNING *", [
    clientId,
    stage,
    scopeTenantId,
  ]);
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function setClientStageWithLog(input: {
  tenantId?: string;
  clientId: string;
  stage: ClientStage;
  createdById?: string;
  reason?: string;
  locale?: Locale;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const locale = input.locale ?? "ja";
  const stageLabel = getStageLabel(locale);

  return withTransaction(async (client) => {
    const beforeRes = await client.query("SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE", [
      input.clientId,
      scopeTenantId,
    ]);
    if (!beforeRes.rows[0]) return null;

    const before = mapClient(beforeRes.rows[0]);
    const [quoteCountRes, followCountRes, viewingCountRes] = await Promise.all([
      client.query("SELECT COUNT(*)::int AS count FROM quotations WHERE client_id = $1 AND tenant_id = $2", [
        input.clientId,
        scopeTenantId,
      ]),
      client.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND tenant_id = $2", [
        input.clientId,
        scopeTenantId,
      ]),
      client.query("SELECT COUNT(*)::int AS count FROM follow_ups WHERE client_id = $1 AND tenant_id = $2 AND type = 'viewing'", [
        input.clientId,
        scopeTenantId,
      ]),
    ]);
    const blockers = validateStageTransition({
      from: before.stage,
      to: input.stage,
      quotationCount: Number(quoteCountRes.rows[0]?.count ?? 0),
      followUpCount: Number(followCountRes.rows[0]?.count ?? 0),
      hasViewingFollowUp: Number(viewingCountRes.rows[0]?.count ?? 0) > 0,
      importantMattersExplainedAt: before.importantMattersExplainedAt,
      personalInfoConsentAt: before.personalInfoConsentAt,
      amlCheckStatus: before.amlCheckStatus,
      locale,
    });
    if (blockers.length > 0) {
      throw new StageTransitionBlockedError(blockers);
    }

    const updateRes = await client.query(
      "UPDATE clients SET stage = $2, updated_at = NOW() WHERE id = $1 AND tenant_id = $3 RETURNING *",
      [input.clientId, input.stage, scopeTenantId]
    );
    const updated = mapClient(updateRes.rows[0]);

    if (before.stage !== updated.stage) {
      await client.query(
        `INSERT INTO follow_ups (
          id, tenant_id, client_id, type, content, next_action, created_by_id
        ) VALUES ($1,$2,$3,'note',$4,$5,$6)`,
        [
          genId("followup"),
          scopeTenantId,
          input.clientId,
          locale === "zh"
            ? `阶段更新: ${stageLabel[before.stage]} -> ${stageLabel[updated.stage]}`
            : locale === "ko"
              ? `단계 업데이트: ${stageLabel[before.stage]} -> ${stageLabel[updated.stage]}`
              : `ステージ更新: ${stageLabel[before.stage]} -> ${stageLabel[updated.stage]}`,
          input.reason ??
            (locale === "zh"
              ? "进入下一阶段"
              : locale === "ko"
                ? "다음 단계로 진행"
                : "次のステージへ進める"),
          input.createdById ?? updated.ownerUserId,
        ]
      );
    }

    return updated;
  });
}

export async function addQuotation(input: {
  tenantId?: string;
  clientId: string;
  propertyId?: string;
  quoteTitle: string;
  listingPrice: number;
  brokerageFee: number;
  taxFee: number;
  managementFee: number;
  repairFee: number;
  otherFee: number;
  downPayment: number;
  interestRate: number;
  loanYears: number;
  summaryText: string;
}) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(input.tenantId);
  const computed = computeQuote(input);

  return withTransaction(async (client) => {
    const ownerRes = await client.query(
      "SELECT owner_user_id, stage, next_follow_up_at FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE",
      [input.clientId, scopeTenantId],
    );
    if (!ownerRes.rows[0]) {
      throw new Error("顧客が見つかりません。");
    }
    const ownerUserId = String(ownerRes.rows[0].owner_user_id);
    const beforeStage = String(ownerRes.rows[0].stage) as ClientStage;
    const nextFollowUpAt = ownerRes.rows[0].next_follow_up_at ?? null;

    const quoteId = genId("quote");
    const quoteRes = await client.query(
      `INSERT INTO quotations (
        id, tenant_id, client_id, property_id, quote_title,
        listing_price, brokerage_fee, tax_fee, management_fee,
        repair_fee, other_fee, down_payment, loan_amount,
        interest_rate, loan_years, monthly_payment_estimate,
        total_initial_cost, monthly_total_cost, summary_text, status
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,
        $17,$18,$19,'draft'
      ) RETURNING *`,
      [
        quoteId,
        scopeTenantId,
        input.clientId,
        input.propertyId ?? null,
        input.quoteTitle,
        input.listingPrice,
        input.brokerageFee,
        input.taxFee,
        input.managementFee,
        input.repairFee,
        input.otherFee,
        input.downPayment,
        computed.loanAmount,
        input.interestRate,
        input.loanYears,
        computed.monthlyPaymentEstimate,
        computed.totalInitialCost,
        computed.monthlyTotalCost,
        input.summaryText,
      ]
    );

    await client.query(
      "UPDATE clients SET stage = 'quoted', last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
      [input.clientId, scopeTenantId]
    );

    await client.query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
      [
        genId("followup"),
        scopeTenantId,
        input.clientId,
        `見積を作成: ${input.quoteTitle}（月々返済 ${computed.monthlyPaymentEstimate.toLocaleString("ja-JP")} 円）`,
        "見積を送付し、顧客フィードバックを回収",
        nextFollowUpAt,
        ownerUserId,
      ]
    );

    if (beforeStage !== "quoted") {
      await client.query(
        `INSERT INTO follow_ups (
          id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
        ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
        [
          genId("followup"),
          scopeTenantId,
          input.clientId,
          `ステージ提案: 「${STAGE_JA_LABEL.quoted}」へ自動反映しました。`,
          "頭金と月次支出の受容度を確認",
          nextFollowUpAt,
          ownerUserId,
        ]
      );
    }

    return mapQuotation(quoteRes.rows[0]);
  });
}

export async function duplicateQuotation(quoteId: string, tenantId?: string) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);

  const sourceRes = await getPool().query("SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
    quoteId,
    scopeTenantId,
  ]);
  if (!sourceRes.rows[0]) return null;
  const source = mapQuotation(sourceRes.rows[0]);

  const normalized = source.quoteTitle.replace(/\s+v\d+$/i, "").trim();
  const titleRes = await getPool().query("SELECT quote_title FROM quotations WHERE tenant_id = $1 AND quote_title ILIKE $2", [
    scopeTenantId,
    `${normalized}%`,
  ]);

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const versionRegex = new RegExp(`^${escaped}\\s+v(\\d+)$`, "i");

  const maxVersion = titleRes.rows.reduce((max, row) => {
    const title = String(row.quote_title ?? "");
    const match = title.match(versionRegex);
    if (!match) return max;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 1);

  const nextVersion = maxVersion + 1;
  const newTitle = `${normalized} v${nextVersion}`;

  const result = await getPool().query(
    `INSERT INTO quotations (
      id, tenant_id, client_id, property_id, quote_title,
      listing_price, brokerage_fee, tax_fee, management_fee,
      repair_fee, other_fee, down_payment, loan_amount,
      interest_rate, loan_years, monthly_payment_estimate,
      total_initial_cost, monthly_total_cost, summary_text, status
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,$12,$13,
      $14,$15,$16,
      $17,$18,$19,'draft'
    ) RETURNING *`,
    [
      genId("quote"),
      scopeTenantId,
      source.clientId,
      source.propertyId ?? null,
      newTitle,
      source.listingPrice,
      source.brokerageFee,
      source.taxFee,
      source.managementFee,
      source.repairFee,
      source.otherFee,
      source.downPayment,
      source.loanAmount,
      source.interestRate,
      source.loanYears,
      source.monthlyPaymentEstimate,
      source.totalInitialCost,
      source.monthlyTotalCost,
      source.summaryText,
    ]
  );

  const duplicated = mapQuotation(result.rows[0]);
  const clientRes = await getPool().query(
    "SELECT owner_user_id, next_follow_up_at FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    [duplicated.clientId, scopeTenantId]
  );
  if (clientRes.rows[0]) {
    await getPool().query(
      `INSERT INTO follow_ups (
        id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id
      ) VALUES ($1,$2,$3,'note',$4,$5,$6,$7)`,
      [
        genId("followup"),
        scopeTenantId,
        duplicated.clientId,
        `見積改訂: 新バージョン ${duplicated.quoteTitle} を作成。`,
        "差分確認後に顧客へ送付",
        clientRes.rows[0].next_follow_up_at ?? null,
        String(clientRes.rows[0].owner_user_id),
      ]
    );
  }

  return duplicated;
}

export async function updateQuotationStatus(quoteId: string, status: QuoteStatus, tenantId?: string) {
  await ensureSchema();
  const scopeTenantId = resolveTenantId(tenantId);
  const result = await getPool().query(
    "UPDATE quotations SET status = $2, updated_at = NOW() WHERE id = $1 AND tenant_id = $3 RETURNING *",
    [quoteId, status, scopeTenantId]
  );
  return result.rows[0] ? mapQuotation(result.rows[0]) : null;
}

export async function healthCheckPostgres() {
  await ensureSchema();
  // Health probes have no Clerk request scope by design. The readiness work
  // above still checks migrations and the restricted runtime role; this final
  // liveness query must not be routed through the business-query scope proxy.
  await getRawPool().query("SELECT 1");
  return { ok: true };
}

async function resolvePostgresVisibilityForContext<T extends VisibilityRecord>(input: {
  context: RequestContext;
  sql: string;
  values: unknown[];
  map: (row: Record<string, unknown>) => T;
}): Promise<VisibilityRecordResult<T>> {
  return withPostgresAuthContext(input.context.externalAuthSubject, async () => {
    await ensureSchema();
    return withTransaction(async (client) => {
      const result = await client.query(input.sql, input.values);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      // Existing mappers intentionally provide legacy compatibility defaults
      // for older page paths. The resolver cannot inherit those defaults:
      // unknown scope/owner status must remain unknown and fail closed.
      const record = row
        ? {
            ...input.map(row),
            tenantId: row.tenant_id == null ? null : String(row.tenant_id),
            currentOwnerUserId: row.current_owner_user_id == null ? null : String(row.current_owner_user_id),
            visibilityScope: row.visibility_scope,
            ownerResolutionStatus: row.owner_resolution_status,
          } as T
        : null;
      const resolution = resolveRecordVisibility(input.context, record);
      return { resolution, record: resolution.canRead ? record : null };
    });
  });
}

/** Foundation-only probes; no page, list, search, export, attachment or PDF path uses these yet. */
export async function resolveClientVisibilityForContext(input: {
  context: RequestContext;
  clientId: string;
}): Promise<VisibilityRecordResult<Client>> {
  return resolvePostgresVisibilityForContext({
    context: input.context,
    sql: "SELECT * FROM clients WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    values: [input.clientId, input.context.tenantId],
    map: mapClient,
  });
}

export async function resolvePropertyVisibilityForContext(input: {
  context: RequestContext;
  propertyId: string;
}): Promise<VisibilityRecordResult<Property>> {
  return resolvePostgresVisibilityForContext({
    context: input.context,
    sql: "SELECT * FROM properties WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    values: [input.propertyId, input.context.tenantId],
    map: mapProperty,
  });
}

export async function resolveCaseVisibilityForContext(input: {
  context: RequestContext;
  caseId: string;
}): Promise<VisibilityRecordResult<BrokerageCase>> {
  return resolvePostgresVisibilityForContext({
    context: input.context,
    sql: "SELECT * FROM brokerage_cases WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    values: [input.caseId, input.context.tenantId],
    map: mapBrokerageCase,
  });
}

export type {
  Attachment,
  AttachmentTargetType,
  GeneratedOutput,
  ClientListFilter,
  ClientListSort,
  Client,
  Property,
  Quotation,
  FollowUp,
  ImportJob,
  ImportJobStatus,
  ImportSourceType,
  ImportTargetEntity,
  BrokerageCase,
  BrokerageCaseStatus,
  BrokerageCaseType,
  ExtractionReviewItem,
  ExtractionReviewStatus,
  OutputTemplateVersion,
  Task,
  User,
  AuditLog,
  OutputTemplateSettings,
  OutputTemplateSettingsInput,
  GuaranteeBlankForm,
  GuaranteeBlankFormVersion,
  GuaranteeCompanyMask,
  GuaranteeCompanyMaskVersion,
  GuaranteeMaskMatch,
  GuaranteePreviewConfirmation,
};
