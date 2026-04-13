import { NextResponse } from "next/server";
import { activeDataDriver, healthCheckDataDriver } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date().toISOString();
    const result = await healthCheckDataDriver();
    return NextResponse.json(
      {
        ...result,
        checkedAt: now,
        app: "broker-desk-web",
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json(
      {
        ok: false,
        driver: activeDataDriver,
        error: message,
        checkedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
