import { NextResponse } from "next/server";
import { queueIdentityImportSources } from "@/lib/identity-import-queue";
import { getRequestId, logOperationalEvent } from "@/lib/operational-logging";
import {
  assertProductionDocumentReaderReady,
  assertProductionImportWorkerReady,
  ProductionReadinessError,
} from "@/lib/production-readiness";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const MAX_MULTIPART_REQUEST_BYTES = 61 * 1024 * 1024;

function queueErrorStatus(error: string) {
  if (error === "file_too_large" || error === "files_too_large") return 413;
  if (error === "source_persistence_failed") return 500;
  return 400;
}

/**
 * Accepts documents only after placing them in the private import queue.
 * Extraction happens through the same resumable process endpoint as Excel.
 */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    assertProductionImportWorkerReady();
    assertProductionDocumentReaderReady();
    const session = await requireTenantSession({ permission: "source.upload" });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_REQUEST_BYTES) {
      return NextResponse.json({ ok: false, error: "files_too_large", requestId }, { status: 413 });
    }

    const formData = await request.formData();
    const uploadMode = String(formData.get("identityUploadMode") ?? "same_person").trim() === "separate_people"
      ? "separate_people"
      : "same_person";
    const files = formData
      .getAll("identityDocumentFile")
      .filter((file): file is File => file instanceof File && file.size > 0);
    const result = await queueIdentityImportSources({
      tenantId: session.tenant.id,
      userId: session.user.id,
      files,
      uploadMode,
    });
    if (!result.ok) {
      logOperationalEvent({
        event: "identity_import_queue",
        requestId,
        tenantId: session.tenant.id,
        userId: session.user.id,
        outcome: "failed",
        detail: { code: result.error },
      });
      return NextResponse.json({ ...result, requestId }, { status: queueErrorStatus(result.error) });
    }

    const jobId = result.jobIds[0];
    logOperationalEvent({
      event: "identity_import_queue",
      requestId,
      tenantId: session.tenant.id,
      userId: session.user.id,
      jobId,
      outcome: result.deduplicated ? "deduplicated" : "accepted",
      detail: { fileCount: files.length, uploadMode, queuedJobs: result.jobIds.length },
    });
    return NextResponse.json({
      ok: true,
      jobId,
      jobIds: result.jobIds,
      reviewUrl: `/import-center?xlsxJob=${encodeURIComponent(jobId)}&flash=input_extraction_queued`,
      mode: uploadMode,
      deduplicated: result.deduplicated,
      requestId,
    }, { status: 202, headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code, requestId }, { status: error.status });
    }
    if (error instanceof ProductionReadinessError) {
      return NextResponse.json({ ok: false, error: error.code, requestId }, { status: 503 });
    }
    logOperationalEvent({ event: "identity_import_queue", requestId, outcome: "failed", detail: { code: "identity_import_unavailable" } });
    return NextResponse.json({ ok: false, error: "identity_import_unavailable", requestId }, { status: 503 });
  }
}
