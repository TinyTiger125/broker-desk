"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { PropertyFormActionState, PropertyFormValues } from "@/app/actions";
import { endSubmission, handleFormSubmit, type SubmissionLock } from "@/components/form-submission-lock";
import { Button } from "@/components/ui-foundation";
import { HelpHint } from "@/components/help-hint";
import { EntryFilePicker, replaceEntryFiles } from "@/components/entry-file-picker";
import { createEntryIntentId, EntryPreview } from "@/components/entry-preview";
import { useEntryDraft } from "@/components/use-entry-draft";
import { formatJapanesePostalCode, isValidJapanesePostalCode, normalizeJapanesePostalCode } from "@/lib/japanese-postal-code-validation";
import { validatePropertyReviewValue } from "@/lib/property-entry-review";

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
    basicHint: "物件の識別情報です。所在地や部屋番号は分かる範囲で入力します。",
    moneyHint: "価格・費用・面積は未確認なら空欄のまま保存できます。",
    detailHint: "補足事項を残します。",
    saveAndRead: "保存して読み取る",
    cancel: "キャンセル",
    errorSummary: "入力内容を確認してください。",
    saving: "保存中…",
    postalLookup: "郵便番号から住所を補完",
    postalSearch: "住所検索",
    postalLookupLoading: "住所を確認中…",
    postalLookupNotFound: "該当する郵便番号が見つかりません。詳細住所はそのまま入力してください。",
    postalLookupUnavailable: "郵便番号データを利用できません。詳細住所を確認してください。",
    postalLookupInvalid: "郵便番号は7桁で入力してください。",
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
    basicHint: "物件识别信息；所在地和房号只填写已确认的内容。",
    moneyHint: "价格、费用和面积未确认时可以留空保存。",
    detailHint: "记录补充说明。",
    saveAndRead: "保存后读取",
    cancel: "取消",
    errorSummary: "请检查以下输入内容。",
    saving: "保存中…",
    postalLookup: "从邮编补全地址",
    postalSearch: "查询地址",
    postalLookupLoading: "正在确认地址…",
    postalLookupNotFound: "未找到该邮编。请保留并补充详细地址。",
    postalLookupUnavailable: "邮编数据暂不可用，请确认详细地址。",
    postalLookupInvalid: "请输入7位邮编。",
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
    basicHint: "매물 식별 정보입니다. 확인된 소재지와 호수만 입력합니다.",
    moneyHint: "가격·비용·면적은 확인 전에는 비워 두고 저장할 수 있습니다.",
    detailHint: "추가 확인 사항을 기록합니다.",
    saveAndRead: "저장 후 읽기",
    cancel: "취소",
    errorSummary: "다음 입력 내용을 확인해 주세요.",
    saving: "저장 중…",
    postalLookup: "우편번호로 주소 보완",
    postalSearch: "주소 검색",
    postalLookupLoading: "주소 확인 중…",
    postalLookupNotFound: "해당 우편번호를 찾지 못했습니다. 상세 주소를 그대로 입력해 주세요.",
    postalLookupUnavailable: "우편번호 데이터를 사용할 수 없습니다. 상세 주소를 확인해 주세요.",
    postalLookupInvalid: "우편번호 7자리를 입력해 주세요.",
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
  hint,
  expanded,
  onToggle,
  filled,
  total,
  children,
}: {
  section: PropertyFormSectionKey;
  title: string;
  hint?: string;
  expanded: boolean;
  onToggle: () => void;
  filled: number;
  total: number;
  children: ReactNode;
}) {
  const headingId = `property-${section}-heading`;
  const contentId = `property-${section}-content`;
  return (
    <section aria-labelledby={headingId} className={`rounded-md ${expanded ? "border border-slate-300 bg-white p-3" : "bg-slate-100 px-3 py-2"}`}>
      <div className="flex min-w-0 items-center gap-2">
      <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={onToggle} className="group inline-flex min-h-7 min-w-0 cursor-pointer items-center justify-start gap-2 rounded-md text-left text-sm font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
        <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[20px] text-slate-500">{expanded ? "expand_more" : "chevron_right"}</span>
        <span id={headingId} role="heading" aria-level={2}>{title} ({filled}/{total})</span>
      </button>
      {hint ? <HelpHint id={`${headingId}-hint`} label={title}>{hint}</HelpHint> : null}
      </div>
      <div id={contentId} aria-labelledby={headingId} className={expanded ? "mt-3" : "hidden"}>
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
  const { values, setValues, hydrated } = useEntryDraft({ storageKey: entryDraftKey, serverValues: initialValues, appliedFields: entryAppliedFields });
  const [entryFiles, setEntryFiles] = useState<File[]>([]);
  const [entryIntentId] = useState(() => createEntryIntentId());
  const [entryReadFileKeys, setEntryReadFileKeys] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const entryFilesRef = useRef<File[]>([]);
  const entryReadFileKeysRef = useRef<string[]>([]);
  const handleEntryReadFileKeys = useCallback((keys: string[]) => {
    entryReadFileKeysRef.current = keys;
    setEntryReadFileKeys(keys);
  }, []);
  const updateEntryFiles = useCallback((files: File[]) => {
    entryFilesRef.current = files;
    setEntryFiles(files);
    entryReadFileKeysRef.current = [];
    setEntryReadFileKeys([]);
  }, []);
  const applyPropertyReviewValue = useCallback((key: string, value: string) => {
    if (!Object.prototype.hasOwnProperty.call(propertyFormSectionForField, key) || !validatePropertyReviewValue(key, value)) return false;
    const field = key as keyof PropertyFormValues;
    setValues((current) => ({ ...current, [field]: field === "postalCode" ? formatJapanesePostalCode(value) : value }));
    return true;
  }, [setValues]);
  const [expandedSections, setExpandedSections] = useState<Record<PropertyFormSectionKey, boolean>>({ basic: Boolean(initialValues.name || initialValues.area || initialValues.address || initialValues.furigana || initialValues.roomNumber || initialValues.postalCode || initialValues.usage), money: Boolean(initialValues.listingPrice || initialValues.listingRent || initialValues.listingCommonFee || initialValues.managementFee || initialValues.repairFee || initialValues.sizeSqm), detail: Boolean(initialValues.notes) });
  const openSectionForField = useCallback((field: keyof PropertyFormValues) => {
    const section = propertyFormSectionForField[field];
    setExpandedSections((current) => current[section] ? current : { ...current, [section]: true });
  }, []);
  const appliedFieldKey = entryAppliedFields.at(-1) ?? "";
  useEffect(() => {
    if (!hydrated || !appliedFieldKey || !(appliedFieldKey in propertyFormSectionForField)) return;
    const field = appliedFieldKey as keyof PropertyFormValues;
    const frame = window.requestAnimationFrame(() => {
      openSectionForField(field);
      const target = document.getElementById(`property-${field}`);
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [appliedFieldKey, hydrated, openSectionForField]);
  const toggleSection = (section: PropertyFormSectionKey) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };
  const entryAction = useCallback(async (previousState: PropertyFormActionState, formData: FormData) => {
    if (entryUpload) {
      replaceEntryFiles(formData, entryFilesRef.current);
      formData.set("entryReadFileKeys", JSON.stringify(entryReadFileKeysRef.current));
    }
    return action(previousState, formData);
  }, [action, entryUpload]);
  const [state, formAction, pending] = useActionState(entryAction, { ...initialState, values: initialValues });
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
    setValues((current) => ({ ...current, [field]: field === "postalCode" ? formatJapanesePostalCode(value) : value }));
  };
  const [postalLookupStatus, setPostalLookupStatus] = useState<"idle" | "loading" | "found" | "not_found" | "unavailable" | "invalid" | "error">("idle");
  const lookupPostalCode = useCallback(async (postalInput: string) => {
    const postalCode = normalizeJapanesePostalCode(postalInput);
    if (!isValidJapanesePostalCode(postalCode)) {
      setPostalLookupStatus("invalid");
      return;
    }
    setPostalLookupStatus("loading");
    try {
      const response = await fetch(`/api/postal-codes/lookup?postalCode=${encodeURIComponent(postalCode)}`, { method: "GET", cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; addressPrefix?: string; prefecture?: string; municipality?: string };
      if (response.status === 503 || payload.error === "postal_code_index_unavailable") {
        setPostalLookupStatus("unavailable");
        return;
      }
      if (!response.ok || !payload.ok || !payload.addressPrefix) {
        setPostalLookupStatus("not_found");
        return;
      }
      const administrativePrefix = `${payload.prefecture ?? ""}${payload.municipality ?? ""}`;
      setValues((current) => {
        if (normalizeJapanesePostalCode(current.postalCode) !== postalCode) return current;
        const currentAddress = current.address.trim();
        const nextAddress = !currentAddress
          ? payload.addressPrefix!
          : currentAddress.startsWith(payload.addressPrefix!) || (administrativePrefix && currentAddress.startsWith(administrativePrefix))
            ? currentAddress
            : /^(東京都|北海道|京都府|大阪府|.{2,3}県)/.test(currentAddress)
              ? currentAddress
              : `${payload.addressPrefix}${currentAddress}`;
        return { ...current, postalCode: formatJapanesePostalCode(postalCode), address: nextAddress };
      });
      setPostalLookupStatus("found");
    } catch {
      setPostalLookupStatus("error");
    }
  }, [setValues]);
  const sectionCounts = {
    basic: { filled: ["name", "area", "address", "furigana", "roomNumber", "postalCode", "usage"].filter((field) => String(values[field as keyof PropertyFormValues] ?? "").trim()).length, total: 7 },
    money: { filled: ["listingPrice", "listingRent", "listingCommonFee", "managementFee", "repairFee", "sizeSqm"].filter((field) => String(values[field as keyof PropertyFormValues] ?? "").trim()).length, total: 6 },
    detail: { filled: values.notes.trim() ? 1 : 0, total: 1 },
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
    value: field === "postalCode" ? formatJapanesePostalCode(values[field]) : values[field],
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
    <form ref={formRef} id={formId} action={formAction} onSubmit={handleSubmit} onInvalidCapture={handleInvalid} noValidate className="space-y-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      {onCreated ? <input type="hidden" name="caseDraftReturn" value="1" /> : null}
      {propertyId ? <input type="hidden" name="propertyId" value={propertyId} /> : null}
      {entryUpload ? <>
        <input type="hidden" name="entryIntentId" value={entryIntentId} />
        <div className="grid items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 md:grid-cols-2">
          <EntryFilePicker locale={locale} files={entryFiles} onFilesChange={updateEntryFiles} disabled={pending} compact />
          <EntryPreview files={entryFiles} kind="property" locale={locale} onConfirm={() => {}} onApplyPropertyCandidate={applyPropertyReviewValue} onReadFileKeys={handleEntryReadFileKeys} compact />
        </div>
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

      <PropertyFormSection section="basic" title={text.basic} hint={text.basicHint} expanded={expandedSections.basic} onToggle={() => toggleSection("basic")} {...sectionCounts.basic}>
        <div className="grid gap-3 md:grid-cols-2">
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
            <label htmlFor="property-postalCode" className="text-sm font-semibold text-slate-700">{text.postalCode}</label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input {...fieldProps("postalCode", "property-postalCode")} onChange={(event) => { updateValue("postalCode", event.target.value); setPostalLookupStatus("idle"); }} onBlur={() => { if (values.postalCode && !isValidJapanesePostalCode(values.postalCode)) setPostalLookupStatus("invalid"); }} inputMode="numeric" autoComplete="postal-code" className={inputClass} />
              <button type="button" onClick={() => void lookupPostalCode(values.postalCode)} disabled={postalLookupStatus === "loading"} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{text.postalSearch}</button>
            </div>
            {postalLookupStatus === "loading" ? <p role="status" className="text-xs font-semibold text-slate-600">{text.postalLookupLoading}</p> : postalLookupStatus === "found" ? <p role="status" className="text-xs font-semibold text-emerald-700">{text.postalLookup}</p> : postalLookupStatus === "not_found" ? <p role="status" className="text-xs font-semibold text-amber-700">{text.postalLookupNotFound}</p> : (postalLookupStatus === "unavailable" || postalLookupStatus === "error") ? <p role="alert" className="text-xs font-semibold text-amber-700">{text.postalLookupUnavailable}</p> : postalLookupStatus === "invalid" ? <p role="alert" className="text-xs font-semibold text-rose-700">{text.postalLookupInvalid}</p> : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="property-usage" className="text-sm font-semibold text-slate-700">{text.usage}</label>
            <input {...fieldProps("usage", "property-usage")} className={inputClass} />
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
        </div>
      </PropertyFormSection>

      <PropertyFormSection section="money" title={text.money} hint={text.moneyHint} expanded={expandedSections.money} onToggle={() => toggleSection("money")} {...sectionCounts.money}>
        <div className="grid gap-3 md:grid-cols-3">
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

      <PropertyFormSection section="detail" title={text.detail} hint={text.detailHint} expanded={expandedSections.detail} onToggle={() => toggleSection("detail")} {...sectionCounts.detail}>
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
        <Button type="submit" loading={pending} className="min-h-11 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
          {pending ? text.saving : entryUpload && entryFiles.length > entryReadFileKeys.length ? text.saveAndRead : text.save}
        </Button>
      </div>}
      <div className="sr-only" aria-live="polite">{pending ? text.saving : ""}</div>
    </form>
  );
}
