"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { PropertyFormActionState, PropertyFormValues } from "@/app/actions";

type PropertyFormAction = (
  previousState: PropertyFormActionState,
  formData: FormData,
) => Promise<PropertyFormActionState>;

type PropertyResponsiveFormProps = {
  action: PropertyFormAction;
  locale: Locale;
  initialValues: PropertyFormValues;
  returnTo: string;
  propertyId?: string;
};

const copy = {
  ja: {
    basic: "基本情報",
    money: "価格・費用",
    detail: "面積・補足",
    name: "物件名",
    area: "エリア",
    address: "所在地",
    listingPrice: "価格",
    managementFee: "管理費",
    repairFee: "修繕積立金",
    sizeSqm: "専有面積",
    notes: "備考",
    yen: "円",
    sqm: "㎡",
    optional: "任意",
    save: "保存",
    cancel: "キャンセル",
    errorSummary: "入力内容を確認してください。",
    saving: "保存中…",
  },
  zh: {
    basic: "基本信息",
    money: "价格与费用",
    detail: "面积与补充说明",
    name: "物件名",
    area: "区域",
    address: "所在地／地址",
    listingPrice: "售价",
    managementFee: "管理费",
    repairFee: "修缮费",
    sizeSqm: "面积",
    notes: "备注",
    yen: "日元",
    sqm: "㎡",
    optional: "选填",
    save: "保存",
    cancel: "取消",
    errorSummary: "请检查以下输入内容。",
    saving: "保存中…",
  },
  ko: {
    basic: "기본 정보",
    money: "가격과 비용",
    detail: "면적과 보충 설명",
    name: "매물명",
    area: "에리어",
    address: "소재지／주소",
    listingPrice: "가격",
    managementFee: "관리비",
    repairFee: "수선 적립금",
    sizeSqm: "전용 면적",
    notes: "메모",
    yen: "엔",
    sqm: "㎡",
    optional: "선택",
    save: "저장",
    cancel: "취소",
    errorSummary: "다음 입력 내용을 확인해 주세요.",
    saving: "저장 중…",
  },
} as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100";
const initialState: PropertyFormActionState = { status: "idle", fieldErrors: {}, values: {
  name: "",
  area: "",
  address: "",
  sizeSqm: "",
  listingPrice: "",
  managementFee: "",
  repairFee: "",
  notes: "",
} };

export function PropertyResponsiveForm({ action, locale, initialValues, returnTo, propertyId }: PropertyResponsiveFormProps) {
  const text = copy[locale];
  const [values, setValues] = useState<PropertyFormValues>(initialValues);
  const [state, formAction, pending] = useActionState(action, { ...initialState, values: initialValues });
  const summaryRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  useEffect(() => {
    if (state.status === "error") {
      summaryRef.current?.focus();
    }
  }, [state]);

  const errorEntries = Object.entries(state.fieldErrors) as Array<[keyof PropertyFormValues, string]>;
  const updateValue = (field: keyof PropertyFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) {
      event.preventDefault();
    }
  };
  const fieldError = (field: keyof PropertyFormValues) => state.fieldErrors[field];
  const focusField = (event: React.MouseEvent<HTMLAnchorElement>, field: keyof PropertyFormValues) => {
    event.preventDefault();
    const target = document.getElementById(`property-${field}`);
    target?.focus();
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const fieldProps = (field: keyof PropertyFormValues, id: string) => ({
    id,
    name: field,
    value: values[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updateValue(field, event.target.value),
    onKeyDown,
    onCompositionStart: () => { composingRef.current = true; },
    onCompositionEnd: () => { composingRef.current = false; },
    "aria-invalid": Boolean(fieldError(field)) || undefined,
    "aria-describedby": fieldError(field) ? `${id}-error` : undefined,
  });

  return (
    <form action={formAction} noValidate className="space-y-6">
      <input type="hidden" name="returnTo" value={returnTo} />
      {propertyId ? <input type="hidden" name="propertyId" value={propertyId} /> : null}

      {state.status === "error" ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="property-form-error-summary"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <p id="property-form-error-summary" className="font-bold">{state.message ?? text.errorSummary}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errorEntries.map(([field, message]) => (
              <li key={field}>
                <a className="underline underline-offset-2" href={`#property-${field}`} onClick={(event) => focusField(event, field)}>{message}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section aria-labelledby="property-basic-heading" className="space-y-3 border-b border-slate-200 pb-6">
        <h2 id="property-basic-heading" className="text-base font-bold text-slate-950">{text.basic}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="property-name" className="text-sm font-semibold text-slate-700">{text.name}</label>
            <input {...fieldProps("name", "property-name")} required aria-required="true" className={inputClass} />
            {fieldError("name") ? <p id="property-name-error" className="text-xs font-semibold text-rose-700">{fieldError("name")}</p> : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="property-area" className="text-sm font-semibold text-slate-700">{text.area}</label>
            <input {...fieldProps("area", "property-area")} className={inputClass} />
            {fieldError("area") ? <p id="property-area-error" className="text-xs font-semibold text-rose-700">{fieldError("area")}</p> : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="property-address" className="text-sm font-semibold text-slate-700">{text.address}</label>
            <input {...fieldProps("address", "property-address")} className={inputClass} />
            {fieldError("address") ? <p id="property-address-error" className="text-xs font-semibold text-rose-700">{fieldError("address")}</p> : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="property-money-heading" className="space-y-3 border-b border-slate-200 pb-6">
        <h2 id="property-money-heading" className="text-base font-bold text-slate-950">{text.money}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {([
            ["listingPrice", text.listingPrice],
            ["managementFee", text.managementFee],
            ["repairFee", text.repairFee],
          ] as const).map(([field, label]) => {
            const id = `property-${field}`;
            return (
              <div key={field} className="space-y-1">
                <label htmlFor={id} className="text-sm font-semibold text-slate-700">{label}</label>
                <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[#0046ad] focus-within:ring-2 focus-within:ring-blue-100">
                  <input {...fieldProps(field, id)} type="number" inputMode="decimal" step="any" className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 outline-none" />
                  <span className="pr-3 text-xs font-semibold text-slate-500">{text.yen}</span>
                </div>
                {fieldError(field) ? <p id={`${id}-error`} className="text-xs font-semibold text-rose-700">{fieldError(field)}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="property-detail-heading" className="space-y-3">
        <h2 id="property-detail-heading" className="text-base font-bold text-slate-950">{text.detail}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="property-sizeSqm" className="text-sm font-semibold text-slate-700">{text.sizeSqm} <span className="text-xs font-normal text-slate-500">({text.optional})</span></label>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[#0046ad] focus-within:ring-2 focus-within:ring-blue-100">
              <input {...fieldProps("sizeSqm", "property-sizeSqm")} type="number" inputMode="decimal" step="0.01" className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 outline-none" />
              <span className="pr-3 text-xs font-semibold text-slate-500">{text.sqm}</span>
            </div>
            {fieldError("sizeSqm") ? <p id="property-sizeSqm-error" className="text-xs font-semibold text-rose-700">{fieldError("sizeSqm")}</p> : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="property-notes" className="text-sm font-semibold text-slate-700">{text.notes} <span className="text-xs font-normal text-slate-500">({text.optional})</span></label>
            <textarea {...fieldProps("notes", "property-notes")} rows={4} className={`${inputClass} resize-y`} />
            {fieldError("notes") ? <p id="property-notes-error" className="text-xs font-semibold text-rose-700">{fieldError("notes")}</p> : null}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-5">
        <Link href={returnTo} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.cancel}</Link>
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
          {pending ? text.saving : text.save}
        </button>
      </div>
      <div className="sr-only" aria-live="polite">{pending ? text.saving : ""}</div>
    </form>
  );
}
