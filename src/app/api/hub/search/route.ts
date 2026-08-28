import { NextResponse } from "next/server";
import { createRequestContext } from "@/lib/visibility-resolver";
import { searchHubItems } from "@/lib/hub";
import type { Locale } from "@/lib/locale";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

function normalizeLocale(value: string | null): Locale {
  if (value === "zh" || value === "ko" || value === "ja") return value;
  return "ja";
}

export async function GET(request: Request) {
  const requestStartedAt = performance.now();
  let session;
  try {
    session = await requireTenantSession({ permission: "record.read" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "hub_search_unavailable" }, { status: 500 });
  }

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const locale = normalizeLocale(url.searchParams.get("locale"));
    const searchStartedAt = performance.now();
    const items = await searchHubItems(locale, q, 6, {
      requestContext: createRequestContext(session),
    });
    const response = NextResponse.json({ items });
    const searchDuration = performance.now() - searchStartedAt;
    const totalDuration = performance.now() - requestStartedAt;
    response.headers.set("Server-Timing", `search;dur=${searchDuration.toFixed(1)}, total;dur=${totalDuration.toFixed(1)}`);
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "hub_search_unavailable" }, { status: 500 });
  }
}
