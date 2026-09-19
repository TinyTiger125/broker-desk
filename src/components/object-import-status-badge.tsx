import type { ObjectImportStatus } from "@/lib/object-import-repository";
import type { Locale } from "@/lib/locale";
export function ObjectImportStatusBadge({ status }: { status: ObjectImportStatus }) { return <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold">{status}</span>; }
export function ObjectImportFailureNotice({ locale, errorCode }: { locale: Locale; errorCode?: string | null }) {
  if (errorCode !== "object_import_no_supported_fields" && errorCode !== "object_reader_no_readable_fields") return null;
  const message = locale === "zh"
    ? "未能读取可填写的受支持内容，案件资料未更新。请重新选择受支持的资料。"
    : locale === "ko"
      ? "입력 가능한 지원 항목을 읽지 못했습니다. 안건 자료는 업데이트되지 않았습니다. 지원되는 자료를 다시 선택해 주세요."
      : "入力可能な対応項目を読み取れませんでした。案件資料は更新されていません。対応する資料を選び直してください。";
  return <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">{message}</p>;
}
