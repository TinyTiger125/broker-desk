type ProductionReadinessCode =
  | "production_database_required"
  | "production_release_not_approved"
  | "production_auth_required"
  | "production_attachment_storage_required"
  | "production_attachment_adapter_required"
  | "production_document_reader_required"
  | "production_document_reader_endpoint_invalid"
  | "production_document_reader_endpoint_not_allowed"
  | "production_migrations_required"
  | "production_tenant_scope_required"
  | "production_database_role_unsafe"
  | "production_admin_database_required"
  | "production_rate_limit_required"
  | "production_import_worker_required";

export class ProductionReadinessError extends Error {
  readonly code: ProductionReadinessCode;

  constructor(code: ProductionReadinessCode) {
    super("Production service configuration is incomplete.");
    this.name = "ProductionReadinessError";
    this.code = code;
  }
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

/**
 * NODE_ENV describes the optimized Next.js runtime. Preview and staging
 * deployments also run with NODE_ENV=production, so the formal release gate
 * must use the explicit Broker Desk deployment classification instead.
 * Missing or unknown classifications fail closed as formal production.
 */
export function isFormalProductionDeployment() {
  if (!isProductionRuntime()) return false;
  const deploymentEnvironment = process.env.BROKER_DESK_DEPLOYMENT_ENV?.trim().toLowerCase();
  return deploymentEnvironment !== "preview" && deploymentEnvironment !== "staging";
}

export function assertProductionDataStoreReady() {
  if (!isProductionRuntime()) return;

  if (process.env.DATA_DRIVER?.toLowerCase() !== "postgres" || !process.env.DATABASE_URL) {
    throw new ProductionReadinessError("production_database_required");
  }

  // This explicit gate is only opened after the migration, RLS and restore
  // checks in the operations runbook have been carried out in the real cloud environment.
  if (
    isFormalProductionDeployment() &&
    process.env.BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED !== "true"
  ) {
    throw new ProductionReadinessError("production_release_not_approved");
  }

  assertProductionTenantScopeBindingReady();
}

export function assertProductionTenantScopeBindingReady() {
  if (!isProductionRuntime()) return;

  // The Postgres repository binds the immutable Clerk subject on the same
  // connection as every business query. Its runtime role is verified by the
  // repository before the first production request.
}

export function assertProductionAuthReady() {
  if (!isProductionRuntime()) return;

  if (process.env.BROKER_DESK_AUTH_MODE !== "clerk" || !process.env.CLERK_SECRET_KEY) {
    throw new ProductionReadinessError("production_auth_required");
  }
}

export function assertProductionRateLimitReady() {
  if (!isProductionRuntime()) return;

  // The in-process limiter is intentionally only a fallback. A public service
  // must have an independently deployed, shared policy at its HTTPS edge.
  if (
    process.env.BROKER_DESK_EDGE_RATE_LIMIT_ENFORCED !== "true" ||
    !process.env.BROKER_DESK_EDGE_RATE_LIMIT_POLICY_ID?.trim()
  ) {
    throw new ProductionReadinessError("production_rate_limit_required");
  }
}

export function assertProductionAttachmentStorageReady() {
  if (!isProductionRuntime()) return;

  if (process.env.ATTACHMENT_STORAGE_MODE === "postgres_private") {
    return;
  }

  if (
    process.env.ATTACHMENT_STORAGE_MODE !== "object_private" ||
    !process.env.BROKER_DESK_ATTACHMENT_SIGNED_URL_ENDPOINT
  ) {
    throw new ProductionReadinessError("production_attachment_storage_required");
  }

  // The current repository only provides the local development adapter. Do not
  // let an environment variable make production uploads appear operational
  // before private object-storage upload, signed-download and deletion adapters
  // exist as one audited implementation.
  throw new ProductionReadinessError("production_attachment_adapter_required");
}

export function assertProductionDocumentReaderReady() {
  if (!isProductionRuntime()) return;

  if (
    process.env.DOCUMENT_READING_PROVIDER !== "remote" ||
    !process.env.DOCUMENT_READING_ENDPOINT ||
    !process.env.DOCUMENT_READING_API_TOKEN
  ) {
    throw new ProductionReadinessError("production_document_reader_required");
  }
  try {
    const endpoint = new URL(process.env.DOCUMENT_READING_ENDPOINT);
    if (endpoint.protocol !== "https:") throw new Error("HTTPS required");

    // The endpoint receives identity document bytes. Requiring an explicit
    // hostname allowlist avoids turning an environment typo into an SSRF path.
    const allowedHosts = (process.env.DOCUMENT_READING_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (!allowedHosts.includes(endpoint.hostname.toLowerCase())) {
      throw new ProductionReadinessError("production_document_reader_endpoint_not_allowed");
    }
  } catch (error) {
    if (error instanceof ProductionReadinessError) throw error;
    throw new ProductionReadinessError("production_document_reader_endpoint_invalid");
  }
}

export function assertProductionImportWorkerReady() {
  if (!isProductionRuntime()) return;

  // Requests only persist source files and enqueue jobs. A production system
  // must have a separate authenticated worker/scheduler to claim those jobs;
  // otherwise accepted uploads would silently remain queued.
  if (
    process.env.BROKER_DESK_IMPORT_WORKER_ENABLED !== "true" ||
    !process.env.BROKER_DESK_IMPORT_WORKER_SCHEDULE?.trim() ||
    (process.env.BROKER_DESK_IMPORT_WORKER_TOKEN?.trim().length ?? 0) < 32
  ) {
    throw new ProductionReadinessError("production_import_worker_required");
  }
}
