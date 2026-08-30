import Link from "next/link";
import { uploadObjectAttachmentAction } from "@/app/actions";
import type { Locale } from "@/lib/locale";
import { OBJECT_ATTACHMENT_CATEGORIES, type ObjectAttachmentItem } from "@/lib/object-attachments";
import type { ObjectAttachmentCategory, ObjectAttachmentTargetType } from "@/lib/data";

const CATEGORY_LABELS: Record<Locale, Record<ObjectAttachmentCategory, string>> = {
  ja: { identity: "本人確認", address: "住所証明", income_employment: "勤務・収入", property_registry: "登記資料", floor_plan: "間取り・図面", photo: "写真", contract: "契約資料", application: "申込資料", correspondence: "連絡資料", output: "出力資料", other: "その他" },
  zh: { identity: "身份证明", address: "住所证明", income_employment: "工作与收入", property_registry: "登记资料", floor_plan: "户型与图纸", photo: "照片", contract: "合同资料", application: "申请资料", correspondence: "往来资料", output: "输出资料", other: "其他" },
  ko: { identity: "신원 확인", address: "주소 증명", income_employment: "근무·소득", property_registry: "등기 자료", floor_plan: "도면", photo: "사진", contract: "계약 자료", application: "신청 자료", correspondence: "연락 자료", output: "출력 자료", other: "기타" },
};

const COPY = {
  ja: { title: "原資料・添付", desc: "読取に使用した原本と、この対象に追加した資料です。", empty: "添付資料はまだありません。", category: "分類", file: "ファイル", upload: "添付する", download: "開く・ダウンロード", hint: "PDF、画像、Excel／1ファイル10 MBまで" },
  zh: { title: "原始资料与附件", desc: "这里保留读取所用的原文件及之后补充的资料。", empty: "暂无附件。", category: "资料分类", file: "选择文件", upload: "添加附件", download: "打开或下载", hint: "支持 PDF、图片、Excel；单个文件不超过10 MB" },
  ko: { title: "원본 자료·첨부", desc: "판독에 사용한 원본과 이 대상에 추가한 자료입니다.", empty: "첨부 자료가 없습니다.", category: "분류", file: "파일", upload: "첨부", download: "열기·다운로드", hint: "PDF, 이미지, Excel / 파일당 10 MB 이하" },
} as const;

function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ObjectAttachmentSection({
  locale, targetType, targetId, items, canWrite,
}: {
  locale: Locale;
  targetType: ObjectAttachmentTargetType;
  targetId: string;
  items: ObjectAttachmentItem[];
  canWrite: boolean;
}) {
  const text = COPY[locale];
  const labels = CATEGORY_LABELS[locale];
  return (
    <section id="object-attachments" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <h2 className="text-lg font-black text-slate-950">{text.title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{text.desc}</p>
      </div>
      {items.length > 0 ? (
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
      ) : <p className="px-5 py-6 text-sm text-slate-500">{text.empty}</p>}
      {canWrite ? (
        <form action={uploadObjectAttachmentAction} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 p-5 md:grid-cols-[minmax(12rem,0.7fr)_minmax(16rem,1.3fr)_auto] md:items-end">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <label className="grid gap-1.5 text-sm font-bold text-slate-800">{text.category}
            <select name="category" defaultValue="other" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
              {OBJECT_ATTACHMENT_CATEGORIES.map((category) => <option key={category} value={category}>{labels[category]}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-800">{text.file}
            <input required name="attachmentFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.xlsx" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:font-bold" />
            <span className="text-xs font-medium text-slate-500">{text.hint}</span>
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-slate-950 px-5 text-sm font-black text-white hover:bg-blue-800 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.upload}</button>
        </form>
      ) : null}
    </section>
  );
}
