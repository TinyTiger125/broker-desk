import Link from "next/link";
import type { Locale } from "@/lib/locale";
import type { ObjectAttachmentItem } from "@/lib/object-attachments";
import type { ObjectAttachmentCategory } from "@/lib/data";

export const OBJECT_ATTACHMENT_CATEGORY_LABELS: Record<Locale, Record<ObjectAttachmentCategory, string>> = {
  ja: { identity: "本人確認", address: "住所証明", income_employment: "勤務・収入", property_registry: "登記資料", floor_plan: "間取り・図面", photo: "写真", contract: "契約資料", application: "申込資料", correspondence: "連絡資料", output: "出力資料", other: "その他" },
  zh: { identity: "身份证明", address: "住所证明", income_employment: "工作与收入", property_registry: "登记资料", floor_plan: "户型与图纸", photo: "照片", contract: "合同资料", application: "申请资料", correspondence: "往来资料", output: "输出资料", other: "其他" },
  ko: { identity: "신원 확인", address: "주소 증명", income_employment: "근무·소득", property_registry: "등기 자료", floor_plan: "도면", photo: "사진", contract: "계약 자료", application: "신청 자료", correspondence: "연락 자료", output: "출력 자료", other: "기타" },
};

export const OBJECT_ATTACHMENT_COPY = {
  ja: { title: "原資料・添付", desc: "読取に使用した原本と、この対象に追加した資料です。", empty: "添付資料はまだありません。", category: "分類", file: "ファイル", upload: "添付する", download: "開く・ダウンロード", hint: "PDF、画像、Excel／1ファイル10 MBまで" },
  zh: { title: "原始资料与附件", desc: "这里保留读取所用的原文件及之后补充的资料。", empty: "暂无附件。", category: "资料分类", file: "选择文件", upload: "添加附件", download: "打开或下载", hint: "支持 PDF、图片、Excel；单个文件不超过10 MB" },
  ko: { title: "원본 자료·첨부", desc: "판독에 사용한 원본과 이 대상에 추가한 자료입니다.", empty: "첨부 자료가 없습니다.", category: "분류", file: "파일", upload: "첨부", download: "열기·다운로드", hint: "PDF, 이미지, Excel / 파일당 10 MB 이하" },
} as const;

function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ObjectAttachmentList({ locale, items }: { locale: Locale; items: ObjectAttachmentItem[] }) {
  const text = OBJECT_ATTACHMENT_COPY[locale];
  const labels = OBJECT_ATTACHMENT_CATEGORY_LABELS[locale];
  if (items.length === 0) return <p className="px-5 py-6 text-sm text-slate-500">{text.empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map(({ attachment, link }) => (
        <li key={link.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">{labels[link.category]}</span>
              <p className="break-all text-sm font-bold text-slate-950">{attachment.fileName}</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">{attachment.uploadedAt.toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP")} · {formatBytes(attachment.fileSizeBytes)}</p>
          </div>
          <Link href={`/api/attachments/${encodeURIComponent(attachment.id)}`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:border-blue-400 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
            {text.download}
          </Link>
        </li>
      ))}
    </ul>
  );
}
