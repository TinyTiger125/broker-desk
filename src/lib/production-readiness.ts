type ProductionReadinessCode =
  | "production_database_required"
  | "production_release_not_approved"
  | "production_auth_required"
  | "production_attachment_storage_required"
  | "production_attachment_adapter_required"
  | "production_document_reader_required"
  | "production_migrations_required"
  | "production_tenant_scope_required";

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

export function assertProductionDataStoreReady() {
  if (!isProductionRuntime()) return;

  if (process.env.DATA_DRIVER?.toLowerCase() !== "postgres" || !process.env.DATABASE_URL) {
    throw new ProductionReadinessError("production_database_required");
  }

  // This explicit gate is only opened after the migration, RLS and restore
  // checks in the operations runbook have been carried out in the real cloud environment.
  if (process.env.BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED !== "true") {
    throw new ProductionReadinessError("production_release_not_approved");
  }

  assertProductionTenantScopeBindingReady();
}

export function assertProductionTenantScopeBindingReady() {
  if (!isProductionRuntime()) return;

  // The Postgres driver currently uses pool.query directly and does not bind
  // the authenticated Clerk subject with set_config inside the same request
  // transaction. Until that adapter exists and has been verified against RLS,
  // production data access must remain fail-closed.
  throw new ProductionReadinessError("production_tenant_scope_required");
}

export function assertProductionAuthReady() {
  if (!isProductionRuntime()) return;

  if (process.env.BROKER_DESK_AUTH_MODE !== "clerk" || !process.env.CLERK_SECRET_KEY) {
    throw new ProductionReadinessError("production_auth_required");
  }
}

export function assertProductionAttachmentStorageReady() {
  if (!isProductionRuntime()) return;

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
}
