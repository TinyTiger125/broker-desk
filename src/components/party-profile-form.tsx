import { FormDraftAssist } from "@/components/form-draft-assist";
import type { Locale } from "@/lib/locale";
import {
  getPartyProfileRoleOptions,
  getPartyProfileTypeOptions,
  type PartyProfileRole,
  type PartyProfileType,
} from "@/lib/party-profile";

export type PartyProfileFormDefaults = {
  partyId?: string;
  name?: string;
  partyType?: PartyProfileType;
  partyRole?: PartyProfileRole;
  phone?: string;
  email?: string;
  lineId?: string;
  relationHint?: string;
  note?: string;
};

type PartyProfileFormProps = {
  action: (formData: FormData) => void;
  defaults?: PartyProfileFormDefaults;
  locale: Locale;
  mode: "create" | "edit";
};

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#d5e3fc]";

const copy = {
  ja: {
    basic: "基本情報",
    contact: "連絡先",
    relation: "関連情報",
    name: "氏名 / 会社名",
    type: "種別",
    role: "役割",
    phone: "電話番号",
    email: "メールアドレス",
    lineId: "LINE ID",
    relationHint: "関連物件・案件メモ",
    note: "備考",
    save: "関係者を保存",
    saveAndList: "保存して一覧へ",
  },
  zh: {
    basic: "基本信息",
    contact: "联系方式",
    relation: "关联信息",
    name: "姓名 / 公司名",
    type: "主体类型",
    role: "主体角色",
    phone: "电话号码",
    email: "邮箱地址",
    lineId: "LINE ID",
    relationHint: "关联物件 / 案件备注",
    note: "备注",
    save: "保存主体",
    saveAndList: "保存并返回列表",
  },
  ko: {
    basic: "기본 정보",
    contact: "연락처",
    relation: "연결 정보",
    name: "이름 / 회사명",
    type: "관계자 유형",
    role: "역할",
    phone: "전화번호",
    email: "이메일",
    lineId: "LINE ID",
    relationHint: "연결 매물 / 안건 메모",
    note: "메모",
    save: "관계자 저장",
    saveAndList: "저장 후 목록으로",
  },
} as const;

export function PartyProfileForm({ action, defaults, locale, mode }: PartyProfileFormProps) {
  const text = copy[locale];
  const formId = mode === "create" ? "party-profile-create-form" : `party-profile-edit-form-${defaults?.partyId ?? "unknown"}`;
  const storageKey = mode === "create" ? "draft:parties:new" : `draft:parties:edit:${defaults?.partyId ?? "unknown"}`;
  const fields = ["name", "partyType", "partyRole", "phone", "email", "lineId", "relationHint", "note"];

  return (
    <form id={formId} action={action} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {defaults?.partyId ? <input type="hidden" name="partyId" value={defaults.partyId} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <FormDraftAssist
          formId={formId}
          storageKey={storageKey}
          fieldNames={fields}
          reuseKey="parties:profile"
          reuseFields={["partyType", "partyRole"]}
          locale={locale}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{text.basic}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 md:col-span-3">
            <span className="text-xs font-semibold text-slate-600">{text.name}</span>
            <input name="name" required defaultValue={defaults?.name ?? ""} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{text.type}</span>
            <select name="partyType" defaultValue={defaults?.partyType ?? "individual"} className={inputClass}>
              {getPartyProfileTypeOptions(locale).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">{text.role}</span>
            <select name="partyRole" defaultValue={defaults?.partyRole ?? "applicant"} className={inputClass}>
              {getPartyProfileRoleOptions(locale).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{text.contact}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{text.phone}</span>
            <input name="phone" defaultValue={defaults?.phone ?? ""} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{text.email}</span>
            <input name="email" type="email" defaultValue={defaults?.email ?? ""} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{text.lineId}</span>
            <input name="lineId" defaultValue={defaults?.lineId ?? ""} className={inputClass} />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{text.relation}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{text.relationHint}</span>
            <input name="relationHint" defaultValue={defaults?.relationHint ?? ""} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{text.note}</span>
            <input name="note" defaultValue={defaults?.note ?? ""} className={inputClass} />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="submit" name="afterSave" value="edit" className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
          {text.save}
        </button>
        <button type="submit" name="afterSave" value="list" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
          {text.saveAndList}
        </button>
      </div>
    </form>
  );
}
