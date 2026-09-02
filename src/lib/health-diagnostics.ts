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
};

function readErrorProperty(error: unknown, property: "name" | "code") {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[property];
  return typeof value === "string" ? value : undefined;
}

export function buildHealthFailureDetail({ requestId, phase, error }: HealthFailureDetailInput): HealthFailureDetail {
  const errorName = readErrorProperty(error, "name");
  const errorCode = readErrorProperty(error, "code");
  const errorClass = errorName && SAFE_ERROR_CLASSES.has(errorName) ? errorName : "UnknownError";
  const sqlState = errorCode && SQL_STATE_PATTERN.test(errorCode) ? errorCode : undefined;
  const appErrorCode = errorCode && SAFE_APPLICATION_ERROR_CODES.has(errorCode) ? errorCode : undefined;
  const digest = createHash("sha256")
    .update([phase, errorClass, sqlState ?? "", appErrorCode ?? ""].join("|"))
    .digest("hex")
    .slice(0, 16);

  return {
    requestId,
    phase,
    errorClass,
    ...(sqlState ? { sqlState } : {}),
    ...(appErrorCode ? { appErrorCode } : {}),
    digest,
  };
}
