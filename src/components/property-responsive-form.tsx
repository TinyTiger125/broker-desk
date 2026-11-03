"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { PropertyFormActionState, PropertyFormValues } from "@/app/actions";
import { endSubmission, handleFormSubmit, type SubmissionLock } from "@/components/form-submission-lock";
import { Button } from "@/components/ui-foundation";
import { EntryFilePicker, replaceEntryFiles } from "@/components/entry-file-picker";
import { applyEntryPreviewCandidate, createEntryIntentId, EntryPreview, type EntryPreviewCandidate } from "@/components/entry-preview";
import { useEntryDraft } from "@/components/use-entry-draft";
import { fillAutoSavedEntryForm, type EntryPreviewState } from "@/lib/entry-preview";

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
  onCreated?: (record: { id: string; name: string }) => void;
  onSaved?: (record: { id: string; name: string; values: PropertyFormValues }) => void;
  onCancel?: () => void;
  formId?: string;
  hideActions?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onSubmitStart?: () => void;
  /** Enable the unified new-entry file picker. Files use the uploadFile protocol. */
  entryUpload?: boolean;
  /** Stable tenant/user/object sessionStorage key for edit drafts. */
  entryDraftKey?: string;
  /** Fields successfully confirmed by the document review redirect. */
  entryAppliedFields?: readonly string[];
};

const copy = {
  ja: {
    basic: "基本情報",
    money: "価格・費用・面積",
    detail: "補足情報",
    name: "物件名",
    furigana: "物件名かな",
    area: "エリア",
    address: "所在地",
    roomNumber: "部屋番号",
    postalCode: "郵便番号",
    usage: "用途",
    listingPrice: "価格",
    listingRent: "参考月額賃料",
    listingCommonFee: "参考共益費",
    managementFee: "管理費",
    repairFee: "修繕積立金",
    sizeSqm: "専有面積",
    notes: "備考",
    yen: "円",
    sqm: "㎡",
    optional: "任意",
    save: "保存",
    saveAndRead: "保存して読み取る",
    cancel: "キャンセル",
    errorSummary: "入力内容を確認してください。",
    saving: "保存中…",
  },
  zh: {
    basic: "基本信息",
    money: "价格、费用与面积",
    detail: "补充说明",
    name: "物件名",
    furigana: "物件名拼音/假名",
    area: "区域",
    address: "所在地／地址",
    roomNumber: "房号",
    postalCode: "邮编",
    usage: "用途",
    listingPrice: "售价",
    listingRent: "参考月租",
    listingCommonFee: "参考共益费",
    managementFee: "管理费",
    repairFee: "修缮费",
    sizeSqm: "面积",
    notes: "备注",
    yen: "日元",
    sqm: "㎡",
    optional: "选填",
    save: "保存",
    saveAndRead: "保存后读取",
    cancel: "取消",
    errorSummary: "请检查以下输入内容。",
    saving: "保存中…",
  },
  ko: {
    basic: "기본 정보",
    money: "가격·비용·면적",
    detail: "보충 설명",
    name: "매물명",
    furigana: "매물명 후리가나",
    area: "에리어",
    address: "소재지／주소",
    roomNumber: "호수",
    postalCode: "우편번호",
    usage: "용도",
    listingPrice: "가격",
    listingRent: "참고 월세",
    listingCommonFee: "참고 공익비",
    managementFee: "관리비",
    repairFee: "수선 적립금",
    sizeSqm: "전용 면적",
    notes: "메모",
    yen: "엔",
    sqm: "㎡",
    optional: "선택",
    save: "저장",
    saveAndRead: "저장 후 읽기",
    cancel: "취소",
    errorSummary: "다음 입력 내용을 확인해 주세요.",
    saving: "저장 중…",
  },
} as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100 sm:text-sm";

type PropertyFormSectionKey = "basic" | "money" | "detail";

const propertyFormSectionForField: Record<keyof PropertyFormValues, PropertyFormSectionKey> = {
  name: "basic",
  area: "basic",
  address: "basic",
  furigana: "basic",
  roomNumber: "basic",
  postalCode: "basic",
  usage: "basic",
  listingPrice: "money",
  listingRent: "money",
  listingCommonFee: "money",
  managementFee: "money",
  repairFee: "money",
  sizeSqm: "money",
  notes: "detail",
};

function PropertyFormSection({
  section,
  title,
  expanded,
  onToggle,
  children,
}: {
  section: PropertyFormSectionKey;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const headingId = `property-${section}-heading`;
  const contentId = `property-${section}-content`;
  return (
    <section aria-labelledby={headingId} className="space-y-4 border-b border-slate-200 pb-6">
      <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={onToggle} className="group flex w-full cursor-pointer items-center justify-start gap-2 rounded-md text-left text-base font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
        <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[20px] text-slate-500">{expanded ? "expand_more" : "chevron_right"}</span>
        <span id={headingId} role="heading" aria-level={2}>{title}</span>
      </button>
      <div id={contentId} aria-labelledby={headingId} className={expanded ? "" : "hidden"}>
        {children}
      </div>
    </section>
  );
}

const initialState: PropertyFormActionState = { status: "idle", fieldErrors: {}, values: {
  name: "",
  area: "",
  address: "",
  furigana: "",
  roomNumber: "",
  postalCode: "",
  usage: "",
  sizeSqm: "",
  listingPrice: "",
  listingRent: "",
  listingCommonFee: "",
  managementFee: "",
  repairFee: "",
  notes: "",
} };

export function PropertyResponsiveForm({ action, locale, initialValues, returnTo, propertyId, onCreated, onSaved, onCancel, formId, hideActions = false, onPendingChange, onSubmitStart, entryUpload = false, entryDraftKey, entryAppliedFields = [] }: PropertyResponsiveFormProps) {
  const text = copy[locale];
  const { values, setValues } = useEntryDraft({ storageKey: entryDraftKey, serverValues: initialValues, appliedFields: entryAppliedFields });
  const [entryFiles, setEntryFiles] = useState<File[]>([]);
  const [entryIntentId] = useState(() => createEntryIntentId());
  const [entryReadFileKeys, setEntryReadFileKeys] = useState<string[]>([]);
  const [autoSaving, startAutoSaving] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const autoSaveStartedRef = useRef(false);
  const entryFilesRef = useRef<File[]>([]);
  const entryReadFileKeysRef = useRef<string[]>([]);
  const handleEntryReadFileKeys = useCallback((keys: string[]) => {
    entryReadFileKeysRef.current = keys;
    setEntryReadFileKeys(keys);
  }, []);
  const updateEntryFiles = useCallback((files: File[]) => {
    autoSaveStartedRef.current = false;
    entryFilesRef.current = files;
    setEntryFiles(files);
    entryReadFileKeysRef.current = [];
    setEntryReadFileKeys([]);
  }, []);
  const confirmEntryCandidate = useCallback((candidate: EntryPreviewCandidate) => {
    setValues((current) => String(current[candidate.key as keyof PropertyFormValues] ?? "").trim() ? current : applyEntryPreviewCandidate(current, candidate));
  }, [setValues]);
  const [expandedSections, setExpandedSections] = useState<Record<PropertyFormSectionKey, boolean>>({ basic: true, money: true, detail: true });
  const openSectionForField = useCallback((field: keyof PropertyFormValues) => {
    const section = propertyFormSectionForField[field];
    setExpandedSections((current) => current[section] ? current : { ...current, [section]: true });
  }, []);
  const toggleSection = (section: PropertyFormSectionKey) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };
  const locateEntryCandidate = useCallback((candidate: EntryPreviewCandidate) => {
    const field = candidate.key as keyof PropertyFormValues;
    if (!Object.prototype.hasOwnProperty.call(initialValues, field)) return;
    openSectionForField(field);
    const focus = () => {
      const target = document.getElementById(`property-${field}`);
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    if (typeof window === "undefined") focus();
    else window.requestAnimationFrame(focus);
  }, [initialValues, openSectionForField]);
  const entryAction = useCallback(async (previousState: PropertyFormActionState, formData: FormData) => {
    if (entryUpload) {
      replaceEntryFiles(formData, entryFilesRef.current);
      formData.set("entryReadFileKeys", JSON.stringify(entryReadFileKeysRef.current));
    }
    return action(previousState, formData);
  }, [action, entryUpload]);
  const [state, formAction, pending] = useActionState(entryAction, { ...initialState, values: initialValues });
  const autoSaveReadResult = useCallback((preview: EntryPreviewState) => {
    if (!entryUpload || propertyId || autoSaveStartedRef.current || !formRef.current) return;
    const data = new FormData(formRef.current);
    const applied = fillAutoSavedEntryForm(data, preview);
    if (applied === 0 || !String(data.get("name") ?? "").trim()) return;
    entryReadFileKeysRef.current = preview.readFileKeys;
    setValues((current) => ({ ...current, ...Object.fromEntries([...data.entries()].filter(([key, value]) => key in current && typeof value === "string")) }));
    autoSaveStartedRef.current = true;
    startAutoSaving(() => formAction(data));
  }, [entryUpload, formAction, propertyId, setValues]);
  const summaryRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const notifiedCreatedId = useRef<string | undefined>(undefined);
  const submissionLockRef = useRef<SubmissionLock>({ current: false });

  useEffect(() => {
    if (state.status !== "error") return;
    setValues(state.values);
    const frame = window.requestAnimationFrame(() => {
      for (const field of Object.keys(state.fieldErrors) as Array<keyof PropertyFormValues>) openSectionForField(field);
      summaryRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openSectionForField, setValues, state.fieldErrors, state.status, state.values]);
  useEffect(() => {
    const record = state.createdRecord;
    if (!record || notifiedCreatedId.current === record.id) return;
    notifiedCreatedId.current = record.id;
    onCreated?.(record);
  }, [onCreated, state.createdRecord]);
  useEffect(() => {
    if (state.updatedRecord) onSaved?.(state.updatedRecord);
  }, [onSaved, state.updatedRecord]);
  useEffect(() => {
    if (!pending) endSubmission(submissionLockRef.current);
    onPendingChange?.(pending);
  }, [onPendingChange, pending]);

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
    openSectionForField(field);
    const focus = () => {
      const target = document.getElementById(`property-${field}`);
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    if (typeof window === "undefined") focus();
    else window.requestAnimationFrame(focus);
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
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    handleFormSubmit(event, submissionLockRef.current, onSubmitStart);
  };
  const handleInvalid = (event: FormEvent<HTMLFormElement>) => {
    const field = String((event.target as HTMLInputElement).name) as keyof PropertyFormValues;
    if (field in propertyFormSectionForField) openSectionForField(field);
  };

  return (
    <form ref={formRef} id={formId} action={formAction} onSubmit={handleSubmit} onInvalidCapture={handleInvalid} noValidate className="space-y-6">
      <input type="hidden" name="returnTo" value={returnTo} />
      {onCreated ? <input type="hidden" name="caseDraftReturn" value="1" /> : null}
      {propertyId ? <input type="hidden" name="propertyId" value={propertyId} /> : null}
      {entryUpload ? <>
        <input type="hidden" name="entryIntentId" value={entryIntentId} />
        <EntryFilePicker locale={locale} files={entryFiles} onFilesChange={updateEntryFiles} disabled={pending} />
        <EntryPreview files={entryFiles} kind="property" locale={locale} onConfirm={confirmEntryCandidate} onLocateCandidate={locateEntryCandidate} onReadFileKeys={handleEntryReadFileKeys} onReadComplete={autoSaveReadResult} />
        <input type="hidden" name="entryReadFileKeys" value={JSON.stringify(entryReadFileKeys)} />
      </> : null}

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

      <PropertyFormSection section="basic" title={text.basic} expanded={expandedSections.basic} onToggle={() => toggleSection("basic")}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="property-name" className="text-sm font-semibold text-slate-700">{text.name}</label>
            <input {...fieldProps("name", "property-name")} required aria-required="true" className={inputClass} />
            {fieldError("name") ? <p id="property-name-error" className="text-xs font-semibold text-rose-700">{fieldError("name")}</p> : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="property-furigana" className="text-sm font-semibold text-slate-700">{text.furigana}</label>
            <input {...fieldProps("furigana", "property-furigana")} className={inputClass} />
            {fieldError("furigana") ? <p id="property-furigana-error" className="text-xs font-semibold text-rose-700">{fieldError("furigana")}</p> : null}
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
          <div className="space-y-1">
            <label htmlFor="property-roomNumber" className="text-sm font-semibold text-slate-700">{text.roomNumber}</label>
            <input {...fieldProps("roomNumber", "property-roomNumber")} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label htmlFor="property-postalCode" className="text-sm font-semibold text-slate-700">{text.postalCode}</label>
            <input {...fieldProps("postalCode", "property-postalCode")} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label htmlFor="property-usage" className="text-sm font-semibold text-slate-700">{text.usage}</label>
            <input {...fieldProps("usage", "property-usage")} className={inputClass} />
          </div>
        </div>
      </PropertyFormSection>

      <PropertyFormSection section="money" title={text.money} expanded={expandedSections.money} onToggle={() => toggleSection("money")}>
        <div className="grid gap-4 md:grid-cols-3">
          {([
            ["listingPrice", text.listingPrice],
            ["listingRent", text.listingRent],
            ["listingCommonFee", text.listingCommonFee],
            ["managementFee", text.managementFee],
            ["repairFee", text.repairFee],
            ["sizeSqm", text.sizeSqm],
          ] as const).map(([field, label]) => {
            const id = `property-${field}`;
            return (
              <div key={field} className="space-y-1">
                <label htmlFor={id} className="text-sm font-semibold text-slate-700">{label}{field === "sizeSqm" ? <span className="text-xs font-normal text-slate-500"> ({text.optional})</span> : null}</label>
                <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[#0046ad] focus-within:ring-2 focus-within:ring-blue-100">
                  <input {...fieldProps(field, id)} type="number" inputMode="decimal" step={field === "sizeSqm" ? "0.01" : "any"} className="min-h-11 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-base text-slate-900 outline-none sm:text-sm" />
                  <span className="pr-3 text-xs font-semibold text-slate-500">{field === "sizeSqm" ? text.sqm : text.yen}</span>
                </div>
                {fieldError(field) ? <p id={`${id}-error`} className="text-xs font-semibold text-rose-700">{fieldError(field)}</p> : null}
              </div>
            );
          })}
        </div>
      </PropertyFormSection>

      <PropertyFormSection section="detail" title={text.detail} expanded={expandedSections.detail} onToggle={() => toggleSection("detail")}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="property-notes" className="text-sm font-semibold text-slate-700">{text.notes} <span className="text-xs font-normal text-slate-500">({text.optional})</span></label>
            <textarea {...fieldProps("notes", "property-notes")} rows={4} className={`${inputClass} resize-y`} />
            {fieldError("notes") ? <p id="property-notes-error" className="text-xs font-semibold text-rose-700">{fieldError("notes")}</p> : null}
          </div>
        </div>
      </PropertyFormSection>

      {hideActions ? null : <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-5">
        {onCancel ? <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{text.cancel}</button> : <Link href={returnTo} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.cancel}</Link>}
        <Button type="submit" loading={pending || autoSaving} className="min-h-11 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
          {pending || autoSaving ? text.saving : entryUpload && entryFiles.length > entryReadFileKeys.length ? text.saveAndRead : text.save}
        </Button>
      </div>}
      <div className="sr-only" aria-live="polite">{pending ? text.saving : ""}</div>
    </form>
  );
}
