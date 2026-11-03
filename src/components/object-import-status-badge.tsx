import type { ObjectImportStatus } from "@/lib/object-import-repository";
import type { Locale } from "@/lib/locale";
const statusCopy = {
  ja: { queued: "受付済み", processing: "読取中", needs_review: "確認待ち", completed: "確認済み", failed: "失敗", conflict: "要確認" },
  zh: { queued: "已提交", processing: "读取中", needs_review: "待确认", completed: "已确认", failed: "失败", conflict: "存在冲突" },
  ko: { queued: "접수됨", processing: "읽는 중", needs_review: "확인 대기", completed: "확인됨", failed: "실패", conflict: "확인 필요" },
} as const;
export function ObjectImportStatusBadge({ locale = "ja", status }: { locale?: Locale; status: ObjectImportStatus }) { return <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold">{statusCopy[locale][status]}</span>; }
export function ObjectImportFailureNotice({ locale, errorCode }: { locale: Locale; errorCode?: string | null }) {
  if (errorCode !== "identity_no_supported_fields" && errorCode !== "object_import_no_supported_fields" && errorCode !== "object_reader_no_readable_fields" && errorCode !== "object_reader_ambiguous_subject" && errorCode !== "object_import_permission_denied") return null;
  const message = locale === "zh"
    ? errorCode === "object_import_permission_denied"
      ? "读取结果已保留，但保存前的记录或原件权限已失效。当前未更新正式资料，请由有权限的用户处理。"
      : errorCode === "object_reader_ambiguous_subject"
      ? "无法确认资料属于哪个物件，正式物件资料未更新。请重新选择只包含一个物件的资料。"
      : errorCode === "identity_no_supported_fields"
      ? "未能从这份身份证明资料读取可用于客户记录的现有字段，正式客户资料未更新。请上传护照、在留卡、驾照或国民健康保险卡；原件已保留。"
      : "未能读取可填写的受支持内容，案件资料未更新。请重新选择受支持的资料。"
    : locale === "ko"
      ? errorCode === "object_import_permission_denied"
        ? "읽기 결과는 보존했지만 저장 전에 기록 또는 원본 권한이 만료되었습니다. 정식 자료는 변경하지 않았으며 권한 있는 사용자가 처리해야 합니다."
        : errorCode === "object_reader_ambiguous_subject"
        ? "자료가 어느 매물에 속하는지 확인할 수 없어 정식 매물 정보는 업데이트되지 않았습니다. 한 매물만 포함한 자료를 다시 선택해 주세요."
        : errorCode === "identity_no_supported_fields"
        ? "이 신분증 자료에서 고객 기록에 사용할 기존 항목을 읽지 못해 정식 고객 자료를 변경하지 않았습니다. 여권, 재류카드, 운전면허증 또는 국민건강보험증을 업로드해 주세요. 원본은 보존되어 있습니다."
        : "입력 가능한 지원 항목을 읽지 못했습니다. 안건 자료는 업데이트되지 않았습니다. 지원되는 자료를 다시 선택해 주세요."
      : errorCode === "object_import_permission_denied"
        ? "読取結果は保持しましたが、保存前に記録または原本の権限が失効しました。正式な資料は更新していないため、権限のあるユーザーが処理してください。"
        : errorCode === "object_reader_ambiguous_subject"
        ? "資料がどの物件に属するか確認できないため、正式な物件情報は更新していません。1物件だけの資料を選び直してください。"
        : errorCode === "identity_no_supported_fields"
        ? "この本人確認資料から顧客記録に使える既存項目を読み取れなかったため、正式な顧客資料は更新していません。パスポート、在留カード、運転免許証、または国民健康保険証を選び直してください。原本は保持されています。"
        : "入力可能な対応項目を読み取れませんでした。案件資料は更新されていません。対応する資料を選び直してください。";
  return <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">{message}</p>;
}
