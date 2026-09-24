/** Presentation/memory policy only. PostgreSQL rechecks actor, tenant and locks atomically. */
type UploadState = {
  sourceType: string;
  targetEntity: string;
  status: string;
  notes?: string;
  uploadLifecycleVersion?: number;
  finalImportStartedAt?: Date | string | null;
  sourceReferencedAt?: Date | string | null;
};

function isPropertyRowUpload(job: UploadState): boolean {
  if (job.sourceType !== "excel" || job.targetEntity !== "properties") return false;
  try {
    const payload: unknown = JSON.parse(job.notes ?? "");
    return Boolean(payload && typeof payload === "object" && (
      ("kind" in payload && payload.kind === "property_row_import") ||
      ((job.uploadLifecycleVersion ?? 0) === 0 && !("kind" in payload) && "rows" in payload && Array.isArray(payload.rows))
    ));
  } catch { return false; }
}

export function mayStartPropertyImport(job: UploadState): boolean {
  return job.status === "mapped" && !job.finalImportStartedAt && isPropertyRowUpload(job);
}

export function mayDeletePreimportUpload(job: UploadState, membership: {
  role: string; capability?: string; status: string;
}): boolean {
  const manager = membership.status === "active" && (
    (membership.role === "tenant_owner" && membership.capability === "company_owner") ||
    (membership.role === "manager" && membership.capability === "company_form_admin")
  );
  if (!manager || job.uploadLifecycleVersion !== 1 || job.sourceReferencedAt || !mayStartPropertyImport(job)) return false;
  // Even an empty case-binding key is conservative: this slice owns only unassigned row uploads.
  return !("targetCaseId" in JSON.parse(job.notes!));
}
