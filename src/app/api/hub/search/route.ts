import { NextResponse } from "next/server";
import { searchHubItems } from "@/lib/hub";
import type { Locale } from "@/lib/locale";

function normalizeLocale(value: string | null): Locale {
  if (value === "zh" || value === "ko" || value === "ja") return value;
  return "ja";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const locale = normalizeLocale(url.searchParams.get("locale"));
    const items = await searchHubItems(locale, q, 6);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "hub search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

