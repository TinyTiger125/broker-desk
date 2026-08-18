"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { ClientFormActionState, ClientFormValues } from "@/app/actions";
import type { Locale } from "@/lib/locale";
import {
  getAmlCheckStatusOptions,
  getBrokerageContractTypeOptions,
  getBudgetTypeOptions,
  getLoanPreApprovalOptions,
  getPurposeOptions,
  getStageOptions,
  getTemperatureOptions,
} from "@/lib/options";

export type ClientFormDefaults = {
  clientId?: string;
  name?: string;
  phone?: string;
  lineId?: string;
  email?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetType?: string;
  preferredArea?: string;
  firstChoiceArea?: string;
  secondChoiceArea?: string;
  purpose?: string;
  loanPreApprovalStatus?: string;
  desiredMoveInPeriod?: string;
  stage?: string;
  temperature?: string;
  brokerageContractType?: string;
  brokerageContractSignedAt?: Date;
  brokerageContractExpiresAt?: Date;
  importantMattersExplainedAt?: Date;
  contractDocumentDeliveredAt?: Date;
  personalInfoConsentAt?: Date;
  nextFollowUpAt?: Date;
  amlCheckStatus?: string;
  notes?: string;
};

type ClientFormProps = {
  action: (previousState: ClientFormActionState, formData: FormData) => Promise<ClientFormActionState>;
  defaults?: ClientFormDefaults;
  mode: "create" | "edit";
  locale?: Locale;
  returnTo: string;
};

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100";

const copy = {
  ja: {
    basic: "基本情報", needs: "需求条件", management: "顧客管理", legal: "契約・法定情報", notes: "備考",
    name: "顧客名", phone: "電話番号", lineId: "LINE ID", email: "メールアドレス", budgetMin: "予算下限", budgetMax: "予算上限",
    preferredArea: "意向エリア", firstChoiceArea: "第1希望エリア", secondChoiceArea: "第2希望エリア", purpose: "用途", period: "入居/運用希望時期",
    loan: "ローン事前審査", stage: "ステージ", temperature: "温度感", nextFollowUpAt: "次回フォロー日", brokerage: "媒介契約", signedAt: "媒介契約締結日", expiresAt: "媒介契約満了日", matters35: "重要事項説明日（35条）", matters37: "契約書面交付日（37条）", consent: "個人情報利用目的同意確認日", aml: "本人確認/AML", notesPlaceholder: "顧客の要望や確認事項", save: "顧客を保存", saving: "保存中…", cancel: "キャンセル", back: "戻る", choose: "選択してください", optional: "任意", error: "入力内容を確認してください。", initialState: "作成時のシステム初期状態です。人工的な確認完了を示しません。",
  },
  zh: {
    basic: "基本信息", needs: "需求条件", management: "客户管理", legal: "合同与法定信息", notes: "备注",
    name: "客户姓名", phone: "电话号码", lineId: "LINE ID", email: "邮箱地址", budgetMin: "预算下限", budgetMax: "预算上限",
    preferredArea: "意向区域", firstChoiceArea: "第一意向区域", secondChoiceArea: "第二意向区域", purpose: "用途", period: "入住/运营期望时间",
    loan: "贷款预审", stage: "阶段", temperature: "温度", nextFollowUpAt: "下次跟进日期", brokerage: "媒介合同", signedAt: "媒介合同签订日", expiresAt: "媒介合同到期日", matters35: "重要事项说明日（35条）", matters37: "合同书面交付日（37条）", consent: "个人信息使用同意确认日", aml: "实名/AML", notesPlaceholder: "客户需求和确认事项", save: "保存客户", saving: "保存中…", cancel: "取消", back: "返回", choose: "请选择", optional: "选填", error: "请检查以下输入内容。", initialState: "创建时的系统初始状态，不表示人工核验完成。",
  },
  ko: {
    basic: "기본 정보", needs: "희망 조건", management: "고객 관리", legal: "계약 및 법정 정보", notes: "메모",
    name: "고객명", phone: "전화번호", lineId: "LINE ID", email: "이메일", budgetMin: "예산 하한", budgetMax: "예산 상한",
    preferredArea: "희망 지역", firstChoiceArea: "1순위 희망 지역", secondChoiceArea: "2순위 희망 지역", purpose: "용도", period: "입주/운용 희망 시기",
    loan: "대출 사전심사", stage: "단계", temperature: "온도", nextFollowUpAt: "다음 후속 날짜", brokerage: "중개 계약", signedAt: "중개 계약 체결일", expiresAt: "중개 계약 만료일", matters35: "중요사항 설명일(35조)", matters37: "계약서 교부일(37조)", consent: "개인정보 이용 동의 확인일", aml: "본인확인/AML", notesPlaceholder: "고객 요청과 확인 사항", save: "고객 저장", saving: "저장 중…", cancel: "취소", back: "돌아가기", choose: "선택해 주세요", optional: "선택", error: "다음 입력 내용을 확인해 주세요.", initialState: "작성 시 시스템 초기 상태이며, 수동 확인 완료를 뜻하지 않습니다.",
  },
} as const;

const emptyValues = (): ClientFormValues => ({
  clientId: "", name: "", phone: "", lineId: "", email: "", budgetMin: "", budgetMax: "", budgetType: "total_price", preferredArea: "", firstChoiceArea: "", secondChoiceArea: "", purpose: "", loanPreApprovalStatus: "not_applied", desiredMoveInPeriod: "", stage: "lead", temperature: "", brokerageContractType: "none", brokerageContractSignedAt: "", brokerageContractExpiresAt: "", importantMattersExplainedAt: "", contractDocumentDeliveredAt: "", personalInfoConsentAt: "", amlCheckStatus: "not_required", nextFollowUpAt: "", notes: "",
});

function dateValue(value?: Date | string): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function initialValues(defaults?: ClientFormDefaults): ClientFormValues {
  const values = emptyValues();
  if (!defaults) return values;
  return {
    ...values,
    ...Object.fromEntries(Object.entries(defaults).filter(([key]) => !key.endsWith("At") && key !== "budgetMin" && key !== "budgetMax" && key !== "clientId")) as Partial<ClientFormValues>,
    clientId: defaults.clientId ?? "",
    budgetMin: defaults.budgetMin == null ? "" : String(defaults.budgetMin),
    budgetMax: defaults.budgetMax == null ? "" : String(defaults.budgetMax),
    brokerageContractSignedAt: dateValue(defaults.brokerageContractSignedAt),
    brokerageContractExpiresAt: dateValue(defaults.brokerageContractExpiresAt),
    importantMattersExplainedAt: dateValue(defaults.importantMattersExplainedAt),
    contractDocumentDeliveredAt: dateValue(defaults.contractDocumentDeliveredAt),
    personalInfoConsentAt: dateValue(defaults.personalInfoConsentAt),
    nextFollowUpAt: dateValue(defaults.nextFollowUpAt),
  };
}

export function ClientForm({ action, defaults, mode, locale = "ja", returnTo }: ClientFormProps) {
  const text = copy[locale];
  const initial = initialValues(defaults);
  const [values, setValues] = useState<ClientFormValues>(initial);
  const [state, formAction, pending] = useActionState<ClientFormActionState, FormData>(action, { status: "idle", fieldErrors: {}, values: initial });
  const summaryRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const budgetTypeOptions = getBudgetTypeOptions(locale);
  const purposeOptions = getPurposeOptions(locale);
  const loanOptions = getLoanPreApprovalOptions(locale);
  const brokerageOptions = getBrokerageContractTypeOptions(locale);
  const amlOptions = getAmlCheckStatusOptions(locale);
  const stageOptions = getStageOptions(locale);
  const temperatureOptions = getTemperatureOptions(locale);

  useEffect(() => {
    if (state.status !== "error") return;
    setValues(state.values);
    summaryRef.current?.focus();
  }, [state.status, state.values]);
  const errorEntries = Object.entries(state.fieldErrors) as Array<[keyof ClientFormValues, string]>;
  const errorFor = (field: keyof ClientFormValues) => state.fieldErrors[field];
  const update = (field: keyof ClientFormValues, event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues((current) => ({ ...current, [field]: event.target.value }));
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
  };
  const focusField = (event: MouseEvent<HTMLAnchorElement>, field: keyof ClientFormValues) => {
    event.preventDefault();
    const target = document.getElementById(`client-${field}`);
    target?.focus();
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const fieldProps = (field: keyof ClientFormValues) => ({
    id: `client-${field}`, name: field, value: values[field], onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => update(field, event), onKeyDown,
    onCompositionStart: () => { composingRef.current = true; }, onCompositionEnd: () => { composingRef.current = false; },
    "aria-invalid": Boolean(errorFor(field)) || undefined, "aria-describedby": errorFor(field) ? `client-${field}-error` : undefined,
  });
  const errorText = (field: keyof ClientFormValues) => errorFor(field) ? <p id={`client-${field}-error`} className="text-xs font-semibold text-rose-700">{errorFor(field)}</p> : null;
  const label = (field: keyof ClientFormValues, content: string, required = false) => <label htmlFor={`client-${field}`} className="text-sm font-semibold text-slate-700">{content} {required ? <span className="text-rose-700">*</span> : <span className="text-xs font-normal text-slate-500">({text.optional})</span>}</label>;
  const select = (field: keyof ClientFormValues, options: ReadonlyArray<{ value: string; label: string }>, required = false) => (
    <select {...fieldProps(field)} required={required} aria-required={required || undefined} className={inputClass}>
      {required ? <option value="">{text.choose}</option> : null}
      {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  );
  const initialNote = mode === "create" ? <p className="mt-1 text-xs text-slate-500">{text.initialState}</p> : null;

  return (
    <form action={formAction} noValidate className="space-y-6 pb-10">
      <input type="hidden" name="returnTo" value={returnTo} />
      {values.clientId ? <input type="hidden" name="clientId" value={values.clientId} /> : null}
      {state.status === "error" ? <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><p className="font-bold">{state.message ?? text.error}</p><ul className="mt-2 list-disc space-y-1 pl-5">{errorEntries.map(([field, message]) => <li key={field}><a className="underline" href={`#client-${field}`} onClick={(event) => focusField(event, field)}>{message}</a></li>)}</ul></div> : null}

      <section aria-labelledby="client-basic-heading" className="space-y-4 border-b border-slate-200 pb-6"><h2 id="client-basic-heading" className="text-base font-bold text-slate-950">{text.basic}</h2><div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">{label("name", text.name, true)}<input {...fieldProps("name")} required aria-required="true" className={inputClass} />{errorText("name")}</div>
        <div className="space-y-1">{label("phone", text.phone, true)}<input {...fieldProps("phone")} required aria-required="true" className={inputClass} />{errorText("phone")}</div>
        <div className="space-y-1">{label("lineId", text.lineId)}<input {...fieldProps("lineId")} className={inputClass} />{errorText("lineId")}</div>
        <div className="space-y-1">{label("email", text.email)}<input {...fieldProps("email")} type="email" className={inputClass} />{errorText("email")}</div>
      </div></section>

      <section aria-labelledby="client-needs-heading" className="space-y-4 border-b border-slate-200 pb-6"><h2 id="client-needs-heading" className="text-base font-bold text-slate-950">{text.needs}</h2><div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">{label("budgetMin", text.budgetMin)}<input {...fieldProps("budgetMin")} type="number" min="0" step="any" inputMode="decimal" className={inputClass} />{errorText("budgetMin")}</div>
        <div className="space-y-1">{label("budgetMax", text.budgetMax)}<input {...fieldProps("budgetMax")} type="number" min="0" step="any" inputMode="decimal" className={inputClass} />{errorText("budgetMax")}</div>
        <div className="space-y-1">{label("budgetType", "予算タイプ")}{select("budgetType", budgetTypeOptions)}{errorText("budgetType")}</div>
        <div className="space-y-1">{label("preferredArea", text.preferredArea)}<input {...fieldProps("preferredArea")} className={inputClass} />{errorText("preferredArea")}</div>
        <div className="space-y-1">{label("firstChoiceArea", text.firstChoiceArea)}<input {...fieldProps("firstChoiceArea")} className={inputClass} />{errorText("firstChoiceArea")}</div>
        <div className="space-y-1">{label("secondChoiceArea", text.secondChoiceArea)}<input {...fieldProps("secondChoiceArea")} className={inputClass} />{errorText("secondChoiceArea")}</div>
        <div className="space-y-1">{label("purpose", text.purpose, true)}{select("purpose", purposeOptions, true)}{errorText("purpose")}</div>
        <div className="space-y-1">{label("desiredMoveInPeriod", text.period)}<input {...fieldProps("desiredMoveInPeriod")} className={inputClass} />{errorText("desiredMoveInPeriod")}</div>
        <div className="space-y-1">{label("loanPreApprovalStatus", text.loan)}{select("loanPreApprovalStatus", loanOptions)}{errorText("loanPreApprovalStatus")}</div>
      </div></section>

      <section aria-labelledby="client-management-heading" className="space-y-4 border-b border-slate-200 pb-6"><h2 id="client-management-heading" className="text-base font-bold text-slate-950">{text.management}</h2><div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">{label("stage", text.stage, true)}{select("stage", stageOptions, true)}{errorText("stage")}{initialNote}</div>
        <div className="space-y-1">{label("temperature", text.temperature, true)}{select("temperature", temperatureOptions, true)}{errorText("temperature")}</div>
        <div className="space-y-1">{label("nextFollowUpAt", text.nextFollowUpAt)}<input {...fieldProps("nextFollowUpAt")} type="date" className={inputClass} />{errorText("nextFollowUpAt")}</div>
      </div></section>

      <section aria-labelledby="client-legal-heading" className="space-y-4 border-b border-slate-200 pb-6"><h2 id="client-legal-heading" className="text-base font-bold text-slate-950">{text.legal}</h2><div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">{label("brokerageContractType", text.brokerage)}{select("brokerageContractType", brokerageOptions)}{errorText("brokerageContractType")}</div>
        <div className="space-y-1">{label("amlCheckStatus", text.aml)}{select("amlCheckStatus", amlOptions)}{errorText("amlCheckStatus")}</div>
        {(["brokerageContractSignedAt", "brokerageContractExpiresAt", "importantMattersExplainedAt", "contractDocumentDeliveredAt", "personalInfoConsentAt"] as const).map((field) => { const labels = { brokerageContractSignedAt: text.signedAt, brokerageContractExpiresAt: text.expiresAt, importantMattersExplainedAt: text.matters35, contractDocumentDeliveredAt: text.matters37, personalInfoConsentAt: text.consent }; return <div key={field} className="space-y-1">{label(field, labels[field])}<input {...fieldProps(field)} type="date" className={inputClass} />{errorText(field)}</div>; })}
      </div></section>

      <section aria-labelledby="client-notes-heading" className="space-y-3"><h2 id="client-notes-heading" className="text-base font-bold text-slate-950">{text.notes}</h2>{label("notes", text.notes)}<textarea {...fieldProps("notes")} rows={5} placeholder={text.notesPlaceholder} className={`${inputClass} resize-y`} />{errorText("notes")}</section>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-5"><Link href={returnTo} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.cancel}</Link><button type="submit" disabled={pending} className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{pending ? text.saving : text.save}</button></div>
      <div className="sr-only" aria-live="polite">{pending ? text.saving : ""}</div>
    </form>
  );
}
