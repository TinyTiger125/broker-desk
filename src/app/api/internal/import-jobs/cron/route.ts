import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { POST as drainImportJobs } from "../drain/route";
import { getRequestId, logOperationalEvent } from "@/lib/operational-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (expected.length < 32 || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const startedAt = Date.now();
  if (!hasValidCronSecret(request)) {
    logOperationalEvent({ event: "import_worker_cron", requestId, outcome: "failed", detail: { reason: "cron_unauthorized" } });
    return NextResponse.json({ ok: false, error: "cron_unauthorized", requestId }, { status: 401 });
  }

  const workerToken = process.env.BROKER_DESK_IMPORT_WORKER_TOKEN?.trim() ?? "";
  if (workerToken.length < 32) {
    logOperationalEvent({ event: "import_worker_cron", requestId, outcome: "failed", detail: { reason: "worker_token_missing" } });
    return NextResponse.json({ ok: false, error: "worker_token_missing", requestId }, { status: 503 });
  }

  const response = await drainImportJobs(new Request(request.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${workerToken}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({ limit: 3 }),
  }));
  const payload = await response.clone().json().catch(() => ({}));
  logOperationalEvent({
    event: "import_worker_cron",
    requestId,
    outcome: response.ok ? "ready" : "failed",
    detail: {
      status: response.status,
      durationMs: Date.now() - startedAt,
      claimed: typeof payload.claimed === "number" ? payload.claimed : 0,
      completed: typeof payload.completed === "number" ? payload.completed : 0,
      failed: typeof payload.failed === "number" ? payload.failed : 0,
    },
  });
  return response;
}
