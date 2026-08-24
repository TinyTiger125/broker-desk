"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { PartyProfileFormActionState, PartyProfileFormValues } from "@/app/actions";
import type { Locale } from "@/lib/locale";
import { getPartyProfileRoleOptions, getPartyProfileTypeOptions } from "@/lib/party-profile";

type PartyProfileFormAction = (
  previousState: PartyProfileFormActionState,
  formData: FormData,
) => Promise<PartyProfileFormActionState>;

export type PartyProfileFormDefaults = {
  partyId: string;
  name: string;
  phone: string;
  email?: string;
  lineId?: string;
  partyType?: "individual" | "corporate";
  partyRole?: string;
};

type PartyProfileFormProps = {
  action: PartyProfileFormAction;
  defaults: PartyProfileFormDefaults;
  locale: Locale;
  returnTo: string;
  relationTreeHref: string;
};

export type PartyProfileReadOnlyDefaults = Omit<PartyProfileFormDefaults, "partyId">;

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100";

const copy = {
  ja: {
    basic: "基本情報", contact: "連絡先", attributes: "関係者属性", name: "氏名 / 会社名", type: "種別", role: "役割", phone: "電話番号", email: "メールアドレス", lineId: "LINE ID", unset: "未設定", optional: "任意", save: "保存", saving: "保存中…", cancel: "キャンセル", relationTree: "関係を確認", shared: "氏名と連絡先は現在、顧客プロフィールと共有されています。保存後、関連する顧客情報にも反映されます。", error: "入力内容を確認してください。", readOnly: "会社メンバーに公開されている読み取り専用の関係者です。",
  },
  zh: {
    basic: "基本信息", contact: "联系方式", attributes: "主体属性", name: "姓名 / 公司名", type: "主体类型", role: "主体角色", phone: "电话号码", email: "邮箱地址", lineId: "LINE ID", unset: "未设置", optional: "选填", save: "保存", saving: "保存中…", cancel: "取消", relationTree: "查看关系", shared: "姓名和联系方式当前与客户档案共享，保存后会同步反映在相关客户信息中。", error: "请检查以下输入内容。", readOnly: "该主体对公司成员可见，但当前为只读。",
  },
  ko: {
    basic: "기본 정보", contact: "연락처", attributes: "관계자 속성", name: "이름 / 회사명", type: "관계자 유형", role: "역할", phone: "전화번호", email: "이메일", lineId: "LINE ID", unset: "미설정", optional: "선택", save: "저장", saving: "저장 중…", cancel: "취소", relationTree: "관계 확인", shared: "이름과 연락처는 현재 고객 프로필과 공유됩니다. 저장 후 관련 고객 정보에도 반영됩니다.", error: "다음 입력 내용을 확인해 주세요.", readOnly: "회사 구성원에게 공개되지만 현재 읽기 전용입니다.",
  },
} as const;

export function PartyProfileReadOnly({ defaults, locale }: { defaults: PartyProfileReadOnlyDefaults; locale: Locale }) {
  const text = copy[locale];
  const fields = [
    [text.name, defaults.name],
    [text.phone, defaults.phone],
    [text.email, defaults.email || text.unset],
    [text.lineId, defaults.lineId || text.unset],
    [text.type, defaults.partyType ? getPartyProfileTypeOptions(locale).find((item) => item.value === defaults.partyType)?.label ?? defaults.partyType : text.unset],
    [text.role, defaults.partyRole ? getPartyProfileRoleOptions(locale).find((item) => item.value === defaults.partyRole)?.label ?? defaults.partyRole : text.unset],
  ];
  return (
    <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label={text.readOnly}>
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{text.readOnly}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(([label, value]) => <div key={label} className="space-y-1"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900">{value}</dd></div>)}
      </div>
    </section>
  );
}

function initialValues(defaults: PartyProfileFormDefaults): PartyProfileFormValues {
  return {
    partyId: defaults.partyId,
    name: defaults.name,
    phone: defaults.phone,
    email: defaults.email ?? "",
    lineId: defaults.lineId ?? "",
    partyType: defaults.partyType ?? "",
    partyRole: defaults.partyRole ?? "",
  };
}

export function PartyProfileForm({ action, defaults, locale, returnTo, relationTreeHref }: PartyProfileFormProps) {
  const text = copy[locale];
  const initial = initialValues(defaults);
  const [values, setValues] = useState<PartyProfileFormValues>(initial);
  const [state, formAction, pending] = useActionState(action, { status: "idle", fieldErrors: {}, values: initial });
  const summaryRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  useEffect(() => {
    if (state.status === "error") {
      setValues(state.values);
      summaryRef.current?.focus();
    }
  }, [state]);

  const errorEntries = Object.entries(state.fieldErrors) as Array<[keyof PartyProfileFormValues, string]>;
  const errorFor = (field: keyof PartyProfileFormValues) => state.fieldErrors[field];
  const update = (field: keyof PartyProfileFormValues, event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === "Enter" && (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
  };
  const fieldProps = (field: keyof PartyProfileFormValues) => ({
    id: `party-${field}`,
    name: field,
    value: values[field],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => update(field, event),
    onKeyDown,
    onCompositionStart: () => { composingRef.current = true; },
    onCompositionEnd: () => { composingRef.current = false; },
    "aria-invalid": Boolean(errorFor(field)) || undefined,
    "aria-describedby": errorFor(field) ? `party-${field}-error` : undefined,
  });
  const focusField = (event: MouseEvent<HTMLAnchorElement>, field: keyof PartyProfileFormValues) => {
    event.preventDefault();
    const target = document.getElementById(`party-${field}`);
    target?.focus();
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const label = (field: keyof PartyProfileFormValues, content: string, required = false) => (
    <label htmlFor={`party-${field}`} className="text-sm font-semibold text-slate-700">
      {content} {required ? <span className="text-rose-700">*</span> : <span className="text-xs font-normal text-slate-500">({text.optional})</span>}
    </label>
  );
  const fieldError = (field: keyof PartyProfileFormValues) => errorFor(field) ? <p id={`party-${field}-error`} className="text-xs font-semibold text-rose-700">{errorFor(field)}</p> : null;

  return (
    <form action={formAction} noValidate className="space-y-6 pb-10">
      <input type="hidden" name="partyId" value={values.partyId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {state.status === "error" ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby="party-form-error-summary" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <p id="party-form-error-summary" className="font-bold">{state.message ?? text.error}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errorEntries.map(([field, message]) => <li key={field}><a className="underline" href={`#party-${field}`} onClick={(event) => focusField(event, field)}>{message}</a></li>)}
          </ul>
        </div>
      ) : null}

      <p className="text-sm leading-6 text-slate-600">{text.shared}</p>

      <section aria-labelledby="party-basic-heading" className="space-y-4 border-b border-slate-200 pb-6">
        <h2 id="party-basic-heading" className="text-base font-bold text-slate-950">{text.basic}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">{label("name", text.name, true)}<input {...fieldProps("name")} required aria-required="true" className={inputClass} />{fieldError("name")}</div>
          <div className="space-y-1">{label("partyType", text.type)}<select {...fieldProps("partyType")} className={inputClass}><option value="">{text.unset}</option>{getPartyProfileTypeOptions(locale).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{fieldError("partyType")}</div>
        </div>
      </section>

      <section aria-labelledby="party-contact-heading" className="space-y-4 border-b border-slate-200 pb-6">
        <h2 id="party-contact-heading" className="text-base font-bold text-slate-950">{text.contact}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">{label("phone", text.phone, true)}<input {...fieldProps("phone")} required aria-required="true" className={inputClass} />{fieldError("phone")}</div>
          <div className="space-y-1">{label("email", text.email)}<input {...fieldProps("email")} type="email" className={inputClass} />{fieldError("email")}</div>
          <div className="space-y-1">{label("lineId", text.lineId)}<input {...fieldProps("lineId")} className={inputClass} />{fieldError("lineId")}</div>
        </div>
      </section>

      <section aria-labelledby="party-attributes-heading" className="space-y-4 pb-2">
        <h2 id="party-attributes-heading" className="text-base font-bold text-slate-950">{text.attributes}</h2>
        <div className="max-w-md space-y-1">{label("partyRole", text.role)}<select {...fieldProps("partyRole")} className={inputClass}><option value="">{text.unset}</option>{getPartyProfileRoleOptions(locale).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{fieldError("partyRole")}</div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
        <div className="flex flex-wrap gap-2">
          <Link href={returnTo} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.cancel}</Link>
          <Link href={relationTreeHref} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.relationTree}</Link>
        </div>
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{pending ? text.saving : text.save}</button>
      </div>
      <div className="sr-only" aria-live="polite">{pending ? text.saving : ""}</div>
    </form>
  );
}
