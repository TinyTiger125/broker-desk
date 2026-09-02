import { createHash } from "node:crypto";

const SAFE_ERROR_CLASSES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "ProductionReadinessError",
]);

const SAFE_APPLICATION_ERROR_CODES = new Set([
  "production_database_required",
  "production_release_not_approved",
  "production_auth_required",
  "production_attachment_storage_required",
  "production_attachment_adapter_required",
  "production_document_reader_required",
  "production_document_reader_endpoint_invalid",
  "production_document_reader_endpoint_not_allowed",
  "production_migrations_required",
  "production_tenant_scope_required",
  "production_database_role_unsafe",
  "production_admin_database_required",
  "production_rate_limit_required",
  "production_import_worker_required",
]);

const SQL_STATE_PATTERN = /^[0-9A-Z]{5}$/;

type HealthFailurePhase = "readiness" | "data_driver" | "liveness";
type HealthFailureCausePhase = "ledger_query" | "required_set_compare";

type HealthFailureDetailInput = {
  requestId: string;
  phase: HealthFailurePhase;
  error: unknown;
};

export type HealthFailureDetail = {
  requestId: string;
  phase: HealthFailurePhase;
  errorClass: string;
  sqlState?: string;
  appErrorCode?: string;
  digest: string;
  causeErrorClass?: string;
  causePhase?: HealthFailureCausePhase;
  causeSqlState?: string;
  causeAppErrorCode?: string;
};

export type HealthFailureCause = {
  errorClass: string;
  phase: HealthFailureCausePhase;
  sqlState?: string;
  appErrorCode?: string;
};

function readErrorProperty(error: unknown, property: string) {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[property];
  return typeof value === "string" ? value : undefined;
}

function normalizeErrorClass(error: unknown) {
  const errorName = readErrorProperty(error, "name") ?? readErrorProperty(error, "errorClass");
  return errorName && SAFE_ERROR_CLASSES.has(errorName) ? errorName : "UnknownError";
}

function normalizeCausePhase(error: unknown, fallback: HealthFailureCausePhase) {
  const phase = readErrorProperty(error, "phase");
  return phase === "ledger_query" || phase === "required_set_compare" ? phase : fallback;
}

export function buildHealthFailureCause(
  error: unknown,
  fallbackPhase: HealthFailureCausePhase = "ledger_query"
): HealthFailureCause {
  const errorCode = readErrorProperty(error, "code");
  const explicitSqlState = readErrorProperty(error, "sqlState");
  const explicitAppErrorCode = readErrorProperty(error, "appErrorCode");
  const sqlStateCandidate = errorCode && SQL_STATE_PATTERN.test(errorCode) ? errorCode : explicitSqlState;
  const sqlState = sqlStateCandidate && SQL_STATE_PATTERN.test(sqlStateCandidate) ? sqlStateCandidate : undefined;
  const appErrorCandidate = errorCode && SAFE_APPLICATION_ERROR_CODES.has(errorCode) ? errorCode : explicitAppErrorCode;
  const appErrorCode = appErrorCandidate && SAFE_APPLICATION_ERROR_CODES.has(appErrorCandidate)
    ? appErrorCandidate
    : undefined;

  return {
    errorClass: normalizeErrorClass(error),
    phase: normalizeCausePhase(error, fallbackPhase),
    ...(sqlState ? { sqlState } : {}),
    ...(appErrorCode ? { appErrorCode } : {}),
  };
}

export function buildHealthFailureDetail({ requestId, phase, error }: HealthFailureDetailInput): HealthFailureDetail {
  const errorCode = readErrorProperty(error, "code");
  const errorClass = normalizeErrorClass(error);
  const sqlState = errorCode && SQL_STATE_PATTERN.test(errorCode) ? errorCode : undefined;
  const appErrorCode = errorCode && SAFE_APPLICATION_ERROR_CODES.has(errorCode) ? errorCode : undefined;
  const rawCause = error && typeof error === "object" ? (error as Record<string, unknown>).cause : undefined;
  const cause = rawCause && typeof rawCause === "object" ? buildHealthFailureCause(rawCause) : undefined;
  const digest = createHash("sha256")
    .update([
      phase,
      errorClass,
      sqlState ?? "",
      appErrorCode ?? "",
      cause?.errorClass ?? "",
      cause?.phase ?? "",
      cause?.sqlState ?? "",
      cause?.appErrorCode ?? "",
    ].join("|"))
    .digest("hex")
    .slice(0, 16);

  return {
    requestId,
    phase,
    errorClass,
    ...(sqlState ? { sqlState } : {}),
    ...(appErrorCode ? { appErrorCode } : {}),
    ...(cause ? { causeErrorClass: cause.errorClass } : {}),
    ...(cause ? { causePhase: cause.phase } : {}),
    ...(cause?.sqlState ? { causeSqlState: cause.sqlState } : {}),
    ...(cause?.appErrorCode ? { causeAppErrorCode: cause.appErrorCode } : {}),
    digest,
  };
}
