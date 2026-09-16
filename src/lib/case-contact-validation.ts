import type { Locale } from "@/lib/locale";

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

export function isValidCasePhone(value: string): boolean {
  const normalized = normalizeDigits(value.trim()).replaceAll("＋", "+");
  if (!normalized || !/^[0-9+＋()（）\-\sー‐‑–—]+$/u.test(normalized)) return false;
  if ((normalized.match(/\+/g) ?? []).length > 1 || (normalized.includes("+") && !normalized.startsWith("+"))) return false;
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
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
    return locale === "zh" ? "请输入有效的电话号码（至少7位数字），修改未保存。" : locale === "ko" ? "유효한 전화번호(숫자 7~15자리)를 입력해 주세요. 변경 사항은 저장되지 않았습니다." : "有効な電話番号（数字7～15桁）を入力してください。変更は保存されていません。";
  }
  return null;
}
