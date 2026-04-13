import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseClientIntakeMemo } from "@/lib/client-intake-parser";
import { isLocale, LOCALE_COOKIE_NAME, type Locale } from "@/lib/locale";

type ParseBody = {
  text?: string;
};

export async function POST(request: Request) {
  const store = await cookies();
  const localeRaw = store.get(LOCALE_COOKIE_NAME)?.value?.trim() ?? "";
  const locale: Locale = isLocale(localeRaw) ? localeRaw : "ja";

  const textByLocale = {
    ja: {
      invalidJson: "JSON形式が不正です。",
      textRequired: "text は必須です。",
    },
    zh: {
      invalidJson: "JSON 格式不正确。",
      textRequired: "text 为必填项。",
    },
    ko: {
      invalidJson: "JSON 형식이 올바르지 않습니다.",
      textRequired: "text 는 필수입니다.",
    },
  } as const;
  const tx = textByLocale[locale];

  let body: ParseBody;
  try {
    body = (await request.json()) as ParseBody;
  } catch {
    return NextResponse.json({ error: tx.invalidJson }, { status: 400 });
  }

  const text = String(body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: tx.textRequired }, { status: 400 });
  }

  const result = parseClientIntakeMemo(text, locale);
  return NextResponse.json({
    ok: true,
    locale,
    recommendedTemplate: result.recommendedTemplate,
    defaults: result.defaults,
    extracted: result.extracted,
  });
}
