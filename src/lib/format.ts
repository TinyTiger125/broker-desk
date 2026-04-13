import type { Locale } from "@/lib/locale";

const localeMap: Record<Locale, string> = {
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
};

function getIntlLocale(locale: Locale): string {
  return localeMap[locale] ?? localeMap.ja;
}

export function formatCurrency(value: number, locale: Locale = "ja"): string {
  const formatter = new Intl.NumberFormat(getIntlLocale(locale), {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  });
  return formatter.format(value);
}

export function formatDate(value?: Date | string | null, locale: Locale = "ja"): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  const formatter = new Intl.DateTimeFormat(getIntlLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function formatRelativeDays(value?: Date | null, locale: Locale = "ja"): string {
  if (!value) return "-";
  const today = new Date();
  const target = new Date(value);
  const startA = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const startB = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.floor((startB - startA) / 86400000);

  if (diffDays === 0) {
    if (locale === "zh") return "今天";
    if (locale === "ko") return "오늘";
    return "今日";
  }
  if (diffDays === 1) {
    if (locale === "zh") return "明天";
    if (locale === "ko") return "내일";
    return "明日";
  }
  if (diffDays === -1) {
    if (locale === "zh") return "昨天";
    if (locale === "ko") return "어제";
    return "昨日";
  }
  if (diffDays > 1) {
    if (locale === "zh") return `${diffDays}天后`;
    if (locale === "ko") return `${diffDays}일 후`;
    return `${diffDays}日後`;
  }
  const abs = Math.abs(diffDays);
  if (locale === "zh") return `${abs}天前`;
  if (locale === "ko") return `${abs}일 전`;
  return `${abs}日前`;
}
