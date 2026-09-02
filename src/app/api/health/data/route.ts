import { NextResponse } from "next/server";
import { healthCheckDataDriver } from "@/lib/data";
import { buildHealthFailureDetail } from "@/lib/health-diagnostics";
import { getRequestId, logOperationalEvent } from "@/lib/operational-logging";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await healthCheckDataDriver();
    logOperationalEvent({ event: "data_health_check", requestId, outcome: "ready" });
    return NextResponse.json(
      {
        ok: true,
        status: "ready",
        checkedAt: new Date().toISOString(),
        app: "broker-desk-web",
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (error) {
    logOperationalEvent({
      event: "data_health_check",
      requestId,
      outcome: "failed",
      detail: buildHealthFailureDetail({ requestId, phase: "data_driver", error }),
    });
    return NextResponse.json(
      {
        ok: false,
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        app: "broker-desk-web",
      },
      { status: 503, headers: { "x-request-id": requestId } }
    );
  }
}
