import { NextResponse } from "next/server";
import { isLocale, LOCALE_COOKIE_NAME } from "@/lib/locale";

type LocalePayload = {
  locale?: string;
};

export async function POST(request: Request) {
  let payload: LocalePayload = {};
  try {
    payload = (await request.json()) as LocalePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const locale = String(payload.locale ?? "").trim();
  if (!isLocale(locale)) {
    return NextResponse.json({ ok: false, error: "invalid_locale" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, locale });
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
