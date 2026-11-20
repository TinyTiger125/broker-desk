import type { Locale } from "@/lib/locale";

import { formatJapanesePhone, isJapanesePhone, normalizeJapanesePhone } from "@/lib/japanese-mobile-phone";

export function isValidCasePhone(value: string): boolean {
  return isJapanesePhone(value);
}

export function isValidCaseEmail(value: string): boolean {
  const normalized = value.trim();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(normalized);
}

export function getCaseContactValidationError(fieldKey: string, value: string, locale: Locale): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (fieldKey.endsWith(".email") && !isValidCaseEmail(normalized)) {
    return locale === "zh" ? "请输入有效的邮箱地址，修改未保存。" : locale === "ko" ? "유효한 이메일 주소를 입력해 주세요. 변경 사항은 저장되지 않았습니다." : "有効なメールアドレスを入力してください。変更は保存されていません。";
  }
  if ((fieldKey.endsWith(".phone") || fieldKey.includes("Phone") || fieldKey.includes("phone") || fieldKey.endsWith(".fax") || fieldKey.endsWith("Fax")) && !isValidCasePhone(normalized)) {
    return locale === "zh" ? "请输入有效的日本手机或座机号码，修改未保存。" : locale === "ko" ? "유효한 일본 휴대전화 또는 유선전화 번호를 입력해 주세요. 변경 사항은 저장되지 않았습니다." : "有効な日本の携帯電話または固定電話を入力してください。変更は保存されていません。";
  }
  return null;
}

export function normalizeCasePhoneValue(value: string): string {
  return formatJapanesePhone(normalizeJapanesePhone(value));
}
