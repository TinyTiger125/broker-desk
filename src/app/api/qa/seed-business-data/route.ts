import { NextResponse } from "next/server";
import { activeDataDriver, seedBusinessDataForQa } from "@/lib/data";
import { isQaApiRequestAllowed, rejectQaApiRequest } from "@/lib/qa-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isQaApiRequestAllowed(request)) return rejectQaApiRequest();

  if (activeDataDriver !== "memory" || !seedBusinessDataForQa) {
    return NextResponse.json(
      { ok: false, error: "qa_seed_only_supports_memory_driver" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    driver: activeDataDriver,
    counts: seedBusinessDataForQa(),
  });
}
