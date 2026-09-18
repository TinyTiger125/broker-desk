import { uploadObjectAttachmentAction } from "@/app/actions";
import { ObjectAttachmentList, OBJECT_ATTACHMENT_CATEGORY_LABELS, OBJECT_ATTACHMENT_COPY } from "@/components/object-attachment-list";
import type { Locale } from "@/lib/locale";
import { OBJECT_ATTACHMENT_CATEGORIES, type ObjectAttachmentItem } from "@/lib/object-attachments";
import type { ObjectAttachmentTargetType } from "@/lib/data";

export { ObjectAttachmentList } from "@/components/object-attachment-list";
export { OBJECT_ATTACHMENT_CATEGORY_LABELS as CATEGORY_LABELS, OBJECT_ATTACHMENT_COPY as COPY } from "@/components/object-attachment-list";

export function ObjectAttachmentSection({
  locale, targetType, targetId, items, canWrite,
}: {
  locale: Locale;
  targetType: ObjectAttachmentTargetType;
  targetId: string;
  items: ObjectAttachmentItem[];
  canWrite: boolean;
}) {
  const text = OBJECT_ATTACHMENT_COPY[locale];
  const labels = OBJECT_ATTACHMENT_CATEGORY_LABELS[locale];
  return (
    <section id="object-attachments" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <h2 className="text-lg font-black text-slate-950">{text.title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{text.desc}</p>
      </div>
      <ObjectAttachmentList locale={locale} items={items} />
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
