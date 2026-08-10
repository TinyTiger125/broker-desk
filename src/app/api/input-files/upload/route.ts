import { NextResponse } from "next/server";
import { getExcelUploadLimitBytes, queueExcelImportSource } from "@/lib/excel-import-queue";
import { getRequestId, logOperationalEvent } from "@/lib/operational-logging";
import { assertProductionImportWorkerReady, ProductionReadinessError } from "@/lib/production-readiness";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    assertProductionImportWorkerReady();
    const session = await requireTenantSession({ permission: "source.upload" });
    const maxBytes = getExcelUploadLimitBytes();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes + MAX_MULTIPART_OVERHEAD_BYTES) {
      return NextResponse.json({ ok: false, error: "file_too_large", maxBytes, requestId }, { status: 413 });
    }
    const formData = await request.formData();
    const file = formData.get("excelFile");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "file_required", requestId }, { status: 400 });
    const targetCaseId = String(formData.get("targetCaseId") ?? "").trim() || undefined;
    const result = await queueExcelImportSource({ tenantId: session.tenant.id, userId: session.user.id, file, targetCaseId });
    if (!result.ok) {
      const status = result.error === "file_too_large" ? 413 : result.error === "source_persistence_failed" ? 500 : 400;
      return NextResponse.json({ ...result, requestId }, { status, headers: { "x-request-id": requestId } });
    }
    logOperationalEvent({ event: "excel_import", requestId, tenantId: session.tenant.id, userId: session.user.id, jobId: result.jobId, outcome: result.deduplicated ? "deduplicated" : "accepted" });
    return NextResponse.json({
      ...result,
      reviewUrl: `/import-center?xlsxJob=${encodeURIComponent(result.jobId)}&flash=input_extraction_queued${targetCaseId ? `&targetCaseId=${encodeURIComponent(targetCaseId)}` : ""}`,
      processUrl: `/api/input-files/${encodeURIComponent(result.jobId)}/process`,
      requestId,
    }, { status: result.status === "queued" ? 202 : 200, headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof TenantSessionError) return NextResponse.json({ ok: false, error: error.code, requestId }, { status: error.status });
    if (error instanceof ProductionReadinessError) {
      return NextResponse.json({ ok: false, error: error.code, requestId }, { status: 503 });
    }
    logOperationalEvent({ event: "excel_import", requestId, outcome: "failed", detail: { code: "excel_import_unavailable" } });
    return NextResponse.json({ ok: false, error: "excel_import_unavailable", requestId }, { status: 503 });
  }
}
