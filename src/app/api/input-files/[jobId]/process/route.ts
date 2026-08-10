import { NextResponse } from "next/server";
import { listImportJobs, retryImportJobExecution } from "@/lib/data";
import { processExcelImportJob } from "@/lib/excel-import-processor";
import { processIdentityImportJob } from "@/lib/identity-import-processor";
import { getRequestId, logOperationalEvent } from "@/lib/operational-logging";
import {
  assertProductionDocumentReaderReady,
  assertProductionImportWorkerReady,
  isProductionRuntime,
  ProductionReadinessError,
} from "@/lib/production-readiness";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

async function getAccessibleImportJob(context: { params: Promise<{ jobId: string }> }) {
  const session = await requireTenantSession({ permission: "source.upload" });
  const { jobId } = await context.params;
  const job = (await listImportJobs(session.user.id, 500, session.tenant.id)).find((item) => item.id === jobId);
  return { session, jobId, job };
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { job, jobId } = await getAccessibleImportJob(context);
    if (!job) {
      return NextResponse.json({ ok: false, error: "import_job_not_found", jobId, requestId }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      jobId,
      status: job.status,
      errorCode: job.errorCode ?? null,
      errorSummary: job.errorSummary ?? null,
      requestId,
    });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code, requestId }, { status: error.status });
    }
    logOperationalEvent({ event: "import_job_status", requestId, outcome: "failed", detail: { code: "import_status_unavailable" } });
    return NextResponse.json({ ok: false, error: "import_status_unavailable", requestId }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { session, jobId, job } = await getAccessibleImportJob(context);
    if (!job) {
      return NextResponse.json({ ok: false, error: "import_job_not_found", jobId, requestId }, { status: 404 });
    }
    if (job.status === "failed") {
      await retryImportJobExecution({
        tenantId: session.tenant.id,
        userId: session.user.id,
        jobId,
      });
    }
    assertProductionImportWorkerReady();
    const isIdentityJob = job.sourceType === "scan";
    if (isIdentityJob) assertProductionDocumentReaderReady();
    if (job.sourceType !== "scan" && job.sourceType !== "excel") {
      return NextResponse.json({ ok: false, error: "unsupported_import_source", jobId, requestId }, { status: 422 });
    }
    if (isProductionRuntime()) {
      logOperationalEvent({
        event: "import_job_queued_for_worker",
        requestId,
        tenantId: session.tenant.id,
        userId: session.user.id,
        jobId,
        outcome: "accepted",
      });
      return NextResponse.json({ ok: true, status: "queued", jobId, requestId }, {
        status: 202,
        headers: { "x-request-id": requestId },
      });
    }
    const result = isIdentityJob
      ? await processIdentityImportJob({
          tenantId: session.tenant.id,
          userId: session.user.id,
          jobId,
        })
      : await processExcelImportJob({
          tenantId: session.tenant.id,
          userId: session.user.id,
          jobId,
        });
    logOperationalEvent({
      event: isIdentityJob ? "identity_import_process" : "excel_import_process",
      requestId,
      tenantId: session.tenant.id,
      userId: session.user.id,
      jobId,
      outcome: result.ok ? "ready" : "failed",
    });
    return NextResponse.json({ ...result, jobId, requestId }, {
      status: result.ok ? 200 : result.error === "import_job_not_found" ? 404 : 422,
      headers: { "x-request-id": requestId },
    });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code, requestId }, { status: error.status });
    }
    if (error instanceof ProductionReadinessError) {
      return NextResponse.json({ ok: false, error: error.code, requestId }, { status: 503 });
    }
    logOperationalEvent({ event: "import_job_process", requestId, outcome: "failed", detail: { code: "import_processing_unavailable" } });
    return NextResponse.json({ ok: false, error: "import_processing_unavailable", requestId }, { status: 503 });
  }
}
