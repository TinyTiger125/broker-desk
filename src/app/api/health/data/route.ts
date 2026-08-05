import { NextResponse } from "next/server";
import { healthCheckDataDriver } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await healthCheckDataDriver();
    return NextResponse.json(
      {
        ok: true,
        status: "ready",
        checkedAt: new Date().toISOString(),
        app: "broker-desk-web",
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        app: "broker-desk-web",
      },
      { status: 503 }
    );
  }
}
