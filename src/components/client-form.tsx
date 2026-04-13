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
  amlCheckStatus?: string;
  nextFollowUpAt?: Date;
  notes?: string;
};

type ClientFormProps = {
  action: (formData: FormData) => void;
  defaults?: ClientFormDefaults;
  mode: "create" | "edit";
  locale?: Locale;
};

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

const texts = {
  ja: {
    sectionA: "A. 基本情報",
    sectionB: "B. 希望条件",
    sectionC: "C. 契約・法定対応",
    sectionD: "D. フォロー設定",
    name: "顧客名",
    phone: "電話番号",
    lineId: "LINE ID",
    email: "メールアドレス",
    budgetMin: "予算下限",
    budgetMax: "予算上限",
    preferredArea: "希望エリア",
    firstChoiceArea: "第1希望エリア",
    secondChoiceArea: "第2希望エリア",
    desiredMoveInPeriod: "入居/運用希望時期",
    loanPreApproval: "ローン事前審査",
    brokerageContract: "媒介契約",
    aml: "本人確認/AML",
    signedAt: "媒介契約締結日",
    expiresAt: "媒介契約満了日",
    matters35: "重要事項説明日（35条）",
    matters37: "契約書面交付日（37条）",
    personalInfoConsentAt: "個人情報利用目的同意確認日",
    notes: "希望メモ / 初回ヒアリング要点",
    createSave: "顧客を保存",
    createSaveAndQuote: "保存して提案作成",
    updateSave: "変更を保存",
    temperaturePrefix: "温度感",
  },
  zh: {
    sectionA: "A. 基本信息",
    sectionB: "B. 需求条件",
    sectionC: "C. 合同与法定应对",
    sectionD: "D. 跟进设置",
    name: "客户姓名",
    phone: "电话号码",
    lineId: "LINE ID",
    email: "邮箱地址",
    budgetMin: "预算下限",
    budgetMax: "预算上限",
    preferredArea: "意向区域",
    firstChoiceArea: "第一意向区域",
    secondChoiceArea: "第二意向区域",
    desiredMoveInPeriod: "入住/运营期望时间",
    loanPreApproval: "贷款预审",
    brokerageContract: "媒介合同",
    aml: "实名/AML",
    signedAt: "媒介合同签订日",
    expiresAt: "媒介合同到期日",
    matters35: "重要事项说明日（35条）",
    matters37: "合同书面交付日（37条）",
    personalInfoConsentAt: "个人信息使用同意确认日",
    notes: "需求备注 / 首次访谈要点",
    createSave: "保存客户",
    createSaveAndQuote: "保存并创建提案",
    updateSave: "保存修改",
    temperaturePrefix: "温度",
  },
  ko: {
    sectionA: "A. 기본 정보",
    sectionB: "B. 희망 조건",
    sectionC: "C. 계약/법정 대응",
    sectionD: "D. 후속 설정",
    name: "고객명",
    phone: "전화번호",
    lineId: "LINE ID",
    email: "이메일",
    budgetMin: "예산 하한",
    budgetMax: "예산 상한",
    preferredArea: "희망 지역",
    firstChoiceArea: "1순위 희망 지역",
    secondChoiceArea: "2순위 희망 지역",
    desiredMoveInPeriod: "입주/운용 희망 시기",
    loanPreApproval: "대출 사전심사",
    brokerageContract: "중개 계약",
    aml: "본인확인/AML",
    signedAt: "중개 계약 체결일",
    expiresAt: "중개 계약 만료일",
    matters35: "중요사항 설명일(35조)",
    matters37: "계약서 교부일(37조)",
    personalInfoConsentAt: "개인정보 이용 동의 확인일",
    notes: "요청 메모 / 초기 상담 요점",
    createSave: "고객 저장",
    createSaveAndQuote: "저장 후 제안 생성",
    updateSave: "변경사항 저장",
    temperaturePrefix: "온도",
  },
} as const;

function toDateValue(value?: Date): string {
  if (!value) return "";
  const date = new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function ClientForm({ action, defaults, mode, locale = "ja" }: ClientFormProps) {
  const text = texts[locale];
  const budgetTypeOptions = getBudgetTypeOptions(locale);
  const purposeOptions = getPurposeOptions(locale);
  const loanPreApprovalOptions = getLoanPreApprovalOptions(locale);
  const brokerageContractTypeOptions = getBrokerageContractTypeOptions(locale);
  const amlCheckStatusOptions = getAmlCheckStatusOptions(locale);
  const stageOptions = getStageOptions(locale);
  const temperatureOptions = getTemperatureOptions(locale);

  return (
    <form action={action} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {defaults?.clientId ? <input type="hidden" name="clientId" value={defaults.clientId} /> : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{text.sectionA}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input name="name" required placeholder={text.name} defaultValue={defaults?.name ?? ""} className={inputClass} />
          <input name="phone" required placeholder={text.phone} defaultValue={defaults?.phone ?? ""} className={inputClass} />
          <input name="lineId" placeholder={text.lineId} defaultValue={defaults?.lineId ?? ""} className={inputClass} />
          <input name="email" placeholder={text.email} defaultValue={defaults?.email ?? ""} className={inputClass} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{text.sectionB}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input name="budgetMin" type="number" placeholder={text.budgetMin} defaultValue={defaults?.budgetMin ?? ""} className={inputClass} />
          <input name="budgetMax" type="number" placeholder={text.budgetMax} defaultValue={defaults?.budgetMax ?? ""} className={inputClass} />
          <input name="preferredArea" placeholder={text.preferredArea} defaultValue={defaults?.preferredArea ?? ""} className={inputClass} />
          <select name="budgetType" defaultValue={defaults?.budgetType ?? "total_price"} className={inputClass}>
            {budgetTypeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input name="firstChoiceArea" placeholder={text.firstChoiceArea} defaultValue={defaults?.firstChoiceArea ?? ""} className={inputClass} />
          <input
            name="secondChoiceArea"
            placeholder={text.secondChoiceArea}
            defaultValue={defaults?.secondChoiceArea ?? ""}
            className={inputClass}
          />
          <select name="purpose" defaultValue={defaults?.purpose ?? "self_use"} className={inputClass}>
            {purposeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select name="loanPreApprovalStatus" defaultValue={defaults?.loanPreApprovalStatus ?? "not_applied"} className={inputClass}>
            {loanPreApprovalOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input name="desiredMoveInPeriod" placeholder={text.desiredMoveInPeriod} defaultValue={defaults?.desiredMoveInPeriod ?? ""} className={inputClass} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{text.sectionC}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <select name="brokerageContractType" defaultValue={defaults?.brokerageContractType ?? "none"} className={inputClass}>
            {brokerageContractTypeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {text.brokerageContract} {item.label}
              </option>
            ))}
          </select>
          <select name="amlCheckStatus" defaultValue={defaults?.amlCheckStatus ?? "not_required"} className={inputClass}>
            {amlCheckStatusOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {text.aml} {item.label}
              </option>
            ))}
          </select>
          <label className="text-xs text-slate-500">
            {text.signedAt}
            <input
              name="brokerageContractSignedAt"
              type="date"
              defaultValue={toDateValue(defaults?.brokerageContractSignedAt)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-slate-500">
            {text.expiresAt}
            <input
              name="brokerageContractExpiresAt"
              type="date"
              defaultValue={toDateValue(defaults?.brokerageContractExpiresAt)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-slate-500">
            {text.matters35}
            <input
              name="importantMattersExplainedAt"
              type="date"
              defaultValue={toDateValue(defaults?.importantMattersExplainedAt)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-slate-500">
            {text.matters37}
            <input
              name="contractDocumentDeliveredAt"
              type="date"
              defaultValue={toDateValue(defaults?.contractDocumentDeliveredAt)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-slate-500">
            {text.personalInfoConsentAt}
            <input
              name="personalInfoConsentAt"
              type="date"
              defaultValue={toDateValue(defaults?.personalInfoConsentAt)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <div className="hidden md:block" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{text.sectionD}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <select name="stage" defaultValue={defaults?.stage ?? "lead"} className={inputClass}>
            {stageOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select name="temperature" defaultValue={defaults?.temperature ?? "medium"} className={inputClass}>
            {temperatureOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {text.temperaturePrefix} {item.label}
              </option>
            ))}
          </select>
          <input name="nextFollowUpAt" type="date" defaultValue={toDateValue(defaults?.nextFollowUpAt)} className={inputClass} />
          <div className="hidden md:block" />
        </div>
        <textarea name="notes" rows={4} placeholder={text.notes} defaultValue={defaults?.notes ?? ""} className={inputClass} />
      </section>

      {mode === "create" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="afterSave"
            value="detail"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            {text.createSave}
          </button>
          <button
            type="submit"
            name="afterSave"
            value="quote"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {text.createSaveAndQuote}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {text.updateSave}
          </button>
        </div>
      )}
    </form>
  );
}
