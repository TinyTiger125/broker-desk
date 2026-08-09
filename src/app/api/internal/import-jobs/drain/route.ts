import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { claimQueuedImportJobs } from "@/lib/data.admin.postgres";
import { addAuditLog, updateImportJobExecution, withWorkerRepositoryIdentity } from "@/lib/data";
import { processExcelImportJob } from "@/lib/excel-import-processor";
import { processIdentityImportJob } from "@/lib/identity-import-processor";
import { getRequestId, logOperationalEvent } from "@/lib/operational-logging";
import { assertProductionDocumentReaderReady, assertProductionImportWorkerReady, ProductionReadinessError } from "@/lib/production-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidWorkerToken(request: Request) {
  const expected = process.env.BROKER_DESK_IMPORT_WORKER_TOKEN?.trim() ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (expected.length < 32 || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function normalizedLimit(value: unknown) {
  const candidate = typeof value === "number" ? value : Number(value);
  return Number.isFinite(candidate) ? Math.min(Math.max(Math.trunc(candidate), 1), 5) : 3;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  if (!hasValidWorkerToken(request)) {
    return NextResponse.json({ ok: false, error: "worker_unauthorized", requestId }, { status: 401 });
  }

  try {
    assertProductionImportWorkerReady();
    const body = await request.json().catch(() => ({}));
    const jobs = await claimQueuedImportJobs(normalizedLimit(body?.limit));
    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        if (job.sourceType === "scan") assertProductionDocumentReaderReady();
        const result = job.sourceType === "scan"
          ? await withWorkerRepositoryIdentity(job.externalAuthSubject, () =>
            processIdentityImportJob({ tenantId: job.tenantId, userId: job.userId, jobId: job.jobId }),
          )
          : await withWorkerRepositoryIdentity(job.externalAuthSubject, () =>
            processExcelImportJob({ tenantId: job.tenantId, userId: job.userId, jobId: job.jobId }),
          );
        if (result.ok) completed += 1;
        else failed += 1;
        logOperationalEvent({
          event: "import_worker_processed_job",
          requestId,
          tenantId: job.tenantId,
          userId: job.userId,
          jobId: job.jobId,
          outcome: result.ok ? "ready" : "failed",
        });
      } catch (error) {
        failed += 1;
        const errorCode = error instanceof ProductionReadinessError ? error.code : "import_worker_unhandled";
        await withWorkerRepositoryIdentity(job.externalAuthSubject, async () => {
          await updateImportJobExecution({
            tenantId: job.tenantId,
            userId: job.userId,
            jobId: job.jobId,
            status: "failed",
            errorCode,
            errorSummary: "资料读取未能完成，请重新提交或联系管理员。",
          });
          await addAuditLog({
            tenantId: job.tenantId,
            userId: job.userId,
            action: "import_worker_failed",
            targetType: "import_job",
            targetId: job.jobId,
            message: "后台资料读取失败",
            context: { errorCode },
          });
        });
        logOperationalEvent({ event: "import_worker_processed_job", requestId, tenantId: job.tenantId, userId: job.userId, jobId: job.jobId, outcome: "failed", detail: { errorCode } });
      }
    }

    return NextResponse.json({ ok: true, claimed: jobs.length, completed, failed, requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof ProductionReadinessError) {
      return NextResponse.json({ ok: false, error: error.code, requestId }, { status: 503 });
    }
    throw error;
  }
}
