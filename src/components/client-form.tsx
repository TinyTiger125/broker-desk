"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent, type InputHTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { ClientFormActionState, ClientFormValues } from "@/app/actions";
import { endSubmission, handleFormSubmit, type SubmissionLock } from "@/components/form-submission-lock";
import { Button } from "@/components/ui-foundation";
import { HelpHint } from "@/components/help-hint";
import { EntryFilePicker, replaceEntryFiles } from "@/components/entry-file-picker";
import { applyEntryPreviewCandidate, createEntryIntentId, EntryPreview, type EntryPreviewCandidate } from "@/components/entry-preview";
import { useEntryDraft } from "@/components/use-entry-draft";
import { fillAutoSavedEntryForm, fillEmptyEntryDraftSuggestions, fillSelectedEntryCandidateForm, hasClientNameEntryPreviewConflict, type EntryPreviewState } from "@/lib/entry-preview";
import { CLIENT_IDENTITY_DRAFT_APPLY_EVENT, filterClientIdentityDraftSuggestionsForPartyType, type ClientIdentityDraftSuggestion } from "@/lib/customer-identity-draft";
import { CLIENT_INDIVIDUAL_FORM_FIELDS, isClientFormFieldCounted, preserveClientIndividualFieldsOnCorporateValidation } from "@/lib/client-form-state";
import { visibleClientNameFieldFromEvidence } from "@/lib/client-name-representation";
import type { Locale } from "@/lib/locale";
import { getBudgetTypeOptions, getPurposeOptions, getStageOptions, getTemperatureOptions } from "@/lib/options";
import { getPartyProfileTypeOptions } from "@/lib/party-profile";
import { formatJapanesePhone, formatJapanesePhoneForDisplay } from "@/lib/japanese-mobile-phone";
import { isValidJapanesePostalCode, normalizeJapanesePostalCode } from "@/lib/japanese-postal-code-validation";
import { formatLegacyYenAsManYen, isLegacyNonIntegerManYen } from "@/lib/client-money";
import { isCustomerNameRepresentationValue, normalizeCustomerIdentityValue } from "@/lib/customer-identity-field-catalog";
import type { EntryUploadStagedFileRef } from "@/lib/entry-upload-staging";
import { applyEntryStagedFilesToFormData } from "@/lib/entry-upload-staging-client";

export type ClientFormDefaults = {
  clientId?: string;
  name?: string;
  nameLatin?: string;
  nameKanji?: string;
  nameKatakana?: string;
  phone?: string;
  lineId?: string;
  email?: string;
  furigana?: string;
  birthDate?: Date | string;
  gender?: string;
  currentPostalCode?: string;
  currentAddress?: string;
  employerName?: string;
  employerAddress?: string;
  employerPhone?: string;
  employerFax?: string;
  annualIncome?: number;
  annualIncomeAsOf?: Date | string;
  annualIncomeSource?: string;
  partyType?: string;
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
  brokerageContractSignedAt?: Date | string;
  brokerageContractExpiresAt?: Date | string;
  importantMattersExplainedAt?: Date | string;
  contractDocumentDeliveredAt?: Date | string;
  personalInfoConsentAt?: Date | string;
  nextFollowUpAt?: Date | string;
  amlCheckStatus?: string;
  notes?: string;
};

type ClientFormProps = {
  action: (previousState: ClientFormActionState, formData: FormData) => Promise<ClientFormActionState>;
  defaults?: ClientFormDefaults;
  mode: "create" | "edit";
  locale?: Locale;
  returnTo: string;
  submitReturnTo?: string;
  onCreated?: (record: { id: string; name: string }) => void;
  onSaved?: (record: { id: string; name: string; values: ClientFormValues }) => void;
  onCancel?: () => void;
  partyMeta?: { type?: string };
  readOnly?: boolean;
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

type ExistingClientNameMatch = {
  id: string;
  name: string;
  nameLatin?: string;
  nameKanji?: string;
  nameKatakana?: string;
};

type ExistingClientAutoLookupField = "nameLatin" | "nameKanji" | "nameKatakana";
type ExistingClientLookupState = {
  query: string;
  matches: ExistingClientNameMatch[];
  status: "idle" | "searching" | "empty" | "ready" | "error";
};

const existingClientAutoLookupFields: readonly ExistingClientAutoLookupField[] = ["nameLatin", "nameKanji", "nameKatakana"];
const emptyExistingClientLookupState = (): ExistingClientLookupState => ({ query: "", matches: [], status: "idle" });

function parseExistingClientNameMatches(payload: unknown): ExistingClientNameMatch[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item): ExistingClientNameMatch[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") return [];
    return [{
      id: row.id,
      name: row.name,
      ...(typeof row.nameLatin === "string" ? { nameLatin: row.nameLatin } : {}),
      ...(typeof row.nameKanji === "string" ? { nameKanji: row.nameKanji } : {}),
      ...(typeof row.nameKatakana === "string" ? { nameKatakana: row.nameKatakana } : {}),
    }];
  });
}

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100 sm:text-sm";

/** Client-side formatter for server-rendered quick-entry forms. */
export function JapanesePhoneInput({ onInput, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} onInput={(event) => {
    const input = event.currentTarget;
    const formatted = formatJapanesePhone(input.value);
    if (formatted !== input.value) input.value = formatted;
    onInput?.(event);
  }} />;
}

const copy = {
  ja: {
    basic: "基本情報", profile: "本人資料", needs: "希望条件", management: "顧客管理", legal: "契約・法定情報", notes: "備考", basicHint: "顧客名は既存の互換項目です。個人はラテン文字・漢字・カタカナを別々に保存できます。", profileHint: "本人情報。法人には個人名の項目を表示しません。", needsHint: "希望条件は未入力のまま保存できます。", managementHint: "未設定の管理項目は後から補完できます。", legalHint: "契約・法定情報は確認できた項目だけ入力します。", notesHint: "補足事項を残します。",
    name: "顧客名", nameLatin: "氏名（ABC）", nameKanji: "氏名（漢字）", nameKatakana: "氏名（カタカナ）", companyName: "会社名", furigana: "氏名かな", companyFurigana: "会社名かな", phone: "電話番号", phoneMissing: "要補完：本人確認資料には電話番号がない場合があります", lineId: "LINE ID", email: "メールアドレス", partyType: "種別", partyTypeUnset: "未設定", birthDate: "生年月日", gender: "性別", currentPostalCode: "現住所郵便番号", currentAddress: "現住所", companyPostalCode: "会社郵便番号", companyAddress: "会社住所", employerName: "勤務先", employerAddress: "勤務先住所", employerPhone: "勤務先電話", employerFax: "勤務先FAX", annualIncome: "年収（参考）", annualIncomeAsOf: "年収基準日", annualIncomeSource: "年収情報の出典", yen: "円", man: "万円", legacyMoneyHint: "旧円額を万円表示しています。変更せず保存できます。変更する場合は整数万円で入力してください。", genderUnset: "未設定", genderMale: "男性", genderFemale: "女性", genderOther: "その他", budgetMin: "予算下限", budgetMax: "予算上限", budgetType: "予算タイプ", postalLookup: "郵便番号から住所を補完", postalLookupLoading: "住所を確認中…", postalLookupNotFound: "該当する郵便番号が見つかりません。詳細住所はそのまま入力してください。", postalLookupUnavailable: "郵便番号データを利用できません。詳細住所を確認してください。", postalLookupInvalid: "郵便番号は7桁で入力してください。",
    preferredArea: "意向エリア", firstChoiceArea: "第1希望エリア", secondChoiceArea: "第2希望エリア", purpose: "用途", period: "入居/運用希望時期",
    loan: "ローン事前審査", stage: "ステージ", temperature: "温度感", nextFollowUpAt: "次回フォロー日", brokerage: "媒介契約", signedAt: "媒介契約締結日", expiresAt: "媒介契約満了日", matters35: "重要事項説明日（35条）", matters37: "契約書面交付日（37条）", consent: "個人情報利用目的同意確認日", aml: "本人確認/AML", notesPlaceholder: "顧客の要望や確認事項", save: "保存", saveAndRead: "保存して読み取る", saving: "保存中…", cancel: "キャンセル", back: "戻る", choose: "選択してください", optional: "任意", error: "入力内容を確認してください。", initialState: "新規登録時は未確認の状態です。必要な確認項目を入力して保存してください。", existingClientLookupTitle: "既存顧客を確認", existingClientLookupDescription: "ファイルを選ぶ前に姓名表記を入力すると、同じ表記の既存記録だけを確認できます。別人の可能性があるため、アップロード先は自動変更・統合されません。", existingClientLookupPlaceholder: "姓名表記を入力", existingClientLookupSearch: "同名記録を確認", existingClientLookupSearching: "手動検索中…", existingClientLookupNone: "完全一致する既存記録はありません。", existingClientLookupManualFound: "手動検索の一致候補", existingClientAutoLookupSearching: "入力済みの姓名表記を確認中…", existingClientAutoLookupFound: "入力した姓名表記と一致する可能性のある既存記録", existingClientAutoLookupNone: "入力済みの姓名表記に完全一致する既存記録はありません。", existingClientAutoLookupError: "入力済みの姓名表記を確認できませんでした。", existingClientLookupOpen: "記録を開く",
  },
    zh: {
    basic: "基本信息", profile: "个人资料", needs: "需求条件", management: "客户管理", legal: "合同与法定信息", notes: "备注", basicHint: "客户姓名保留为兼容字段。个人可分别保存拉丁字母、汉字和片假名姓名。", profileHint: "个人资料；法人不显示个人姓名字段。", needsHint: "需求条件可以留空并在之后补充。", managementHint: "未设置的管理项目可以之后补全。", legalHint: "只填写已确认的合同与法定信息。", notesHint: "记录补充说明。",
    name: "客户姓名", nameLatin: "姓名（拉丁字母）", nameKanji: "姓名（汉字）", nameKatakana: "姓名（片假名）", companyName: "公司名称", furigana: "姓名假名", companyFurigana: "公司名称假名", phone: "电话号码", phoneMissing: "待补全：证件通常不含电话号码", lineId: "LINE ID", email: "邮箱地址", partyType: "主体类型", partyTypeUnset: "未设置", birthDate: "出生日期", gender: "性别", currentPostalCode: "现住址邮编", currentAddress: "现住址", companyPostalCode: "公司邮编", companyAddress: "公司地址", employerName: "工作单位", employerAddress: "工作单位地址", employerPhone: "工作单位电话", employerFax: "工作单位传真", annualIncome: "年收入（参考）", annualIncomeAsOf: "收入基准日期", annualIncomeSource: "收入信息来源", yen: "日元", man: "万日元", legacyMoneyHint: "当前以万日元显示旧日元金额；不修改即可原样保存。若要修改，请输入整数万日元。", genderUnset: "未设置", genderMale: "男性", genderFemale: "女性", genderOther: "其他", budgetMin: "预算下限", budgetMax: "预算上限", budgetType: "预算类型", postalLookup: "从邮编补全地址", postalLookupLoading: "正在确认地址…", postalLookupNotFound: "未找到该邮编。请保留并补充详细地址。", postalLookupUnavailable: "邮编数据暂不可用，请确认详细地址。", postalLookupInvalid: "请输入7位邮编。",
    preferredArea: "意向区域", firstChoiceArea: "第一意向区域", secondChoiceArea: "第二意向区域", purpose: "用途", period: "入住/运营期望时间",
    loan: "贷款预审", stage: "阶段", temperature: "温度", nextFollowUpAt: "下次跟进日期", brokerage: "媒介合同", signedAt: "媒介合同签订日", expiresAt: "媒介合同到期日", matters35: "重要事项说明日（35条）", matters37: "合同书面交付日（37条）", consent: "个人信息使用同意确认日", aml: "实名/AML", notesPlaceholder: "客户需求和确认事项", save: "保存", saveAndRead: "保存后读取", saving: "保存中…", cancel: "取消", back: "返回", choose: "请选择", optional: "选填", error: "请检查以下输入内容。", initialState: "新建记录时默认为未核验状态。请填写需要确认的项目后保存。", existingClientLookupTitle: "查找已有客户", existingClientLookupDescription: "选择文件前输入姓名表示，只显示完全相同的规范化姓名记录。可能是不同的人，不会自动切换或合并上传目标。", existingClientLookupPlaceholder: "输入姓名表示", existingClientLookupSearch: "查找同名记录", existingClientLookupSearching: "手动查找中…", existingClientLookupNone: "没有完全相同的已有客户记录。", existingClientLookupManualFound: "手动查找的匹配候选", existingClientAutoLookupSearching: "正在检查已填写的姓名表示…", existingClientAutoLookupFound: "与已填写姓名表示一致的可能已有客户", existingClientAutoLookupNone: "已填写的姓名表示没有完全一致的已有客户。", existingClientAutoLookupError: "无法检查已填写的姓名表示。", existingClientLookupOpen: "打开记录",
  },
  ko: {
    basic: "기본 정보", profile: "개인 자료", needs: "희망 조건", management: "고객 관리", legal: "계약 및 법정 정보", notes: "메모", basicHint: "고객명은 호환 필드로 유지됩니다. 개인은 라틴 문자·한자·가타카나 이름을 별도로 저장할 수 있습니다.", profileHint: "개인 자료이며 법인에는 개인 이름 항목을 표시하지 않습니다.", needsHint: "희망 조건은 비워 두고 나중에 보완할 수 있습니다.", managementHint: "설정하지 않은 관리 항목은 나중에 보완할 수 있습니다.", legalHint: "확인된 계약·법정 정보만 입력합니다.", notesHint: "추가 확인 사항을 기록합니다.",
    name: "고객명", nameLatin: "이름（라틴 문자）", nameKanji: "이름（한자）", nameKatakana: "이름（가타카나）", companyName: "회사명", furigana: "후리가나", companyFurigana: "회사명 후리가나", phone: "전화번호", phoneMissing: "추가 필요: 신분증에는 전화번호가 없는 경우가 많습니다", lineId: "LINE ID", email: "이메일", partyType: "주체 유형", partyTypeUnset: "미설정", birthDate: "생년월일", gender: "성별", currentPostalCode: "현재 우편번호", currentAddress: "현재 주소", companyPostalCode: "회사 우편번호", companyAddress: "회사 주소", employerName: "근무처", employerAddress: "근무처 주소", employerPhone: "근무처 전화", employerFax: "근무처 팩스", annualIncome: "연소득(참고)", annualIncomeAsOf: "소득 기준일", annualIncomeSource: "소득 정보 출처", yen: "엔", man: "만 엔", legacyMoneyHint: "기존 엔화 금액을 만 엔으로 표시하고 있습니다. 변경하지 않으면 원래 값으로 저장됩니다. 변경하려면 정수 만 엔을 입력해 주세요.", genderUnset: "미설정", genderMale: "남성", genderFemale: "여성", genderOther: "기타", budgetMin: "예산 하한", budgetMax: "예산 상한", budgetType: "예산 유형", postalLookup: "우편번호로 주소 보완", postalLookupLoading: "주소 확인 중…", postalLookupNotFound: "해당 우편번호를 찾지 못했습니다. 상세 주소를 그대로 입력해 주세요.", postalLookupUnavailable: "우편번호 데이터를 사용할 수 없습니다. 상세 주소를 확인해 주세요.", postalLookupInvalid: "우편번호 7자리를 입력해 주세요.",
    preferredArea: "희망 지역", firstChoiceArea: "1순위 희망 지역", secondChoiceArea: "2순위 희망 지역", purpose: "용도", period: "입주/운용 희망 시기",
    loan: "대출 사전심사", stage: "단계", temperature: "온도", nextFollowUpAt: "다음 후속 날짜", brokerage: "중개 계약", signedAt: "중개 계약 체결일", expiresAt: "중개 계약 만료일", matters35: "중요사항 설명일(35조)", matters37: "계약서 교부일(37조)", consent: "개인정보 이용 동의 확인일", aml: "본인확인/AML", notesPlaceholder: "고객 요청과 확인 사항", save: "저장", saveAndRead: "저장 후 읽기", saving: "저장 중…", cancel: "취소", back: "돌아가기", choose: "선택해 주세요", optional: "선택", error: "다음 입력 내용을 확인해 주세요.", initialState: "새로 등록한 기록은 미확인 초기 상태입니다. 필요한 확인 항목을 입력한 후 저장해 주세요.", existingClientLookupTitle: "기존 고객 찾기", existingClientLookupDescription: "파일을 선택하기 전에 이름 표기를 입력하면 완전히 일치하는 정규화 이름 기록만 표시합니다. 다른 사람일 수 있으므로 업로드 대상은 자동 변경하거나 병합하지 않습니다.", existingClientLookupPlaceholder: "이름 표기 입력", existingClientLookupSearch: "동일 이름 기록 찾기", existingClientLookupSearching: "수동 검색 중…", existingClientLookupNone: "완전히 일치하는 기존 고객 기록이 없습니다.", existingClientLookupManualFound: "수동 검색 일치 후보", existingClientAutoLookupSearching: "입력한 이름 표기를 확인하는 중…", existingClientAutoLookupFound: "입력한 이름 표기와 일치할 가능성이 있는 기존 고객", existingClientAutoLookupNone: "입력한 이름 표기와 완전히 일치하는 기존 고객이 없습니다.", existingClientAutoLookupError: "입력한 이름 표기를 확인하지 못했습니다.", existingClientLookupOpen: "기록 열기",
  },
} as const;

type ClientFormSectionKey = "basic" | "profile" | "needs" | "management" | "notes";

const clientFormSectionForField: Record<keyof ClientFormValues, ClientFormSectionKey> = {
  clientId: "basic",
  partyType: "profile",
  name: "basic",
  nameLatin: "profile",
  nameKanji: "profile",
  nameKatakana: "profile",
  phone: "basic",
  lineId: "basic",
  email: "basic",
  furigana: "profile",
  birthDate: "profile",
  gender: "profile",
  currentPostalCode: "profile",
  currentAddress: "profile",
  employerName: "profile",
  employerAddress: "profile",
  employerPhone: "profile",
  employerFax: "profile",
  annualIncome: "profile",
  annualIncomeAsOf: "profile",
  annualIncomeSource: "profile",
  budgetMin: "needs",
  budgetMax: "needs",
  budgetType: "needs",
  preferredArea: "needs",
  firstChoiceArea: "needs",
  secondChoiceArea: "needs",
  purpose: "needs",
  loanPreApprovalStatus: "needs",
  desiredMoveInPeriod: "needs",
  stage: "management",
  temperature: "management",
  nextFollowUpAt: "management",
  brokerageContractType: "management",
  brokerageContractSignedAt: "management",
  brokerageContractExpiresAt: "management",
  importantMattersExplainedAt: "management",
  contractDocumentDeliveredAt: "management",
  personalInfoConsentAt: "management",
  amlCheckStatus: "management",
  notes: "notes",
};

function ClientFormSection({
  section,
  title,
  hint,
  expanded,
  onToggle,
  filled,
  total,
  children,
}: {
  section: ClientFormSectionKey;
  title: string;
  hint?: string;
  expanded: boolean;
  onToggle: () => void;
  filled: number;
  total: number;
  children: ReactNode;
}) {
  const headingId = `client-${section}-heading`;
  const contentId = `client-${section}-content`;
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

const emptyValues = (): ClientFormValues => ({
  clientId: "", name: "", nameLatin: "", nameKanji: "", nameKatakana: "", phone: "", lineId: "", email: "", partyType: "", furigana: "", birthDate: "", gender: "", currentPostalCode: "", currentAddress: "", employerName: "", employerAddress: "", employerPhone: "", employerFax: "", annualIncome: "", annualIncomeAsOf: "", annualIncomeSource: "", budgetMin: "", budgetMax: "", budgetType: "total_price", preferredArea: "", firstChoiceArea: "", secondChoiceArea: "", purpose: "unspecified", loanPreApprovalStatus: "not_applied", desiredMoveInPeriod: "", stage: "lead", temperature: "unspecified", brokerageContractType: "none", brokerageContractSignedAt: "", brokerageContractExpiresAt: "", importantMattersExplainedAt: "", contractDocumentDeliveredAt: "", personalInfoConsentAt: "", amlCheckStatus: "not_required", nextFollowUpAt: "", notes: "",
});

function manYenValue(value?: number): string {
  return formatLegacyYenAsManYen(value);
}

function dateValue(value?: Date | string): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function initialValues(defaults?: ClientFormDefaults, partyMeta?: ClientFormProps["partyMeta"]): ClientFormValues {
  const values = emptyValues();
  if (!defaults) return values;
  return {
    ...values,
    ...Object.fromEntries(Object.entries(defaults).filter(([key]) => !key.endsWith("At") && key !== "budgetMin" && key !== "budgetMax" && key !== "clientId")) as Partial<ClientFormValues>,
    clientId: defaults.clientId ?? "",
    partyType: partyMeta?.type ?? defaults.partyType ?? "",
    phone: formatJapanesePhoneForDisplay(defaults.phone ?? ""),
    employerPhone: formatJapanesePhoneForDisplay(defaults.employerPhone ?? ""),
    employerFax: formatJapanesePhoneForDisplay(defaults.employerFax ?? ""),
    gender: defaults.gender ? normalizeCustomerIdentityValue("gender", defaults.gender) : "",
    birthDate: dateValue(defaults.birthDate),
    annualIncomeAsOf: dateValue(defaults.annualIncomeAsOf),
    annualIncome: manYenValue(defaults.annualIncome),
    budgetMin: manYenValue(defaults.budgetMin),
    budgetMax: manYenValue(defaults.budgetMax),
    brokerageContractSignedAt: dateValue(defaults.brokerageContractSignedAt),
    brokerageContractExpiresAt: dateValue(defaults.brokerageContractExpiresAt),
    importantMattersExplainedAt: dateValue(defaults.importantMattersExplainedAt),
    contractDocumentDeliveredAt: dateValue(defaults.contractDocumentDeliveredAt),
    personalInfoConsentAt: dateValue(defaults.personalInfoConsentAt),
    nextFollowUpAt: dateValue(defaults.nextFollowUpAt),
  };
}

export function ClientForm({ action, defaults, mode, locale = "ja", returnTo, submitReturnTo, onCreated, onSaved, onCancel, partyMeta, readOnly = false, formId, hideActions = false, onPendingChange, onSubmitStart, entryUpload = false, entryDraftKey, entryAppliedFields = [] }: ClientFormProps) {
  const text = copy[locale];
  const baseInitial = initialValues(defaults, partyMeta);
  const initial = baseInitial;
  const { values, setValues, hydrated } = useEntryDraft({ storageKey: entryDraftKey, serverValues: baseInitial, appliedFields: entryAppliedFields });
  const isCorporate = values.partyType === "corporate";
  const legacyAnnualIncomeYen = defaults?.annualIncome;
  const legacyBudgetMinYen = defaults?.budgetMin;
  const legacyBudgetMaxYen = defaults?.budgetMax;
  const annualIncomeIsLegacyDecimal = isLegacyNonIntegerManYen(legacyAnnualIncomeYen) && values.annualIncome === manYenValue(legacyAnnualIncomeYen);
  const budgetMinIsLegacyDecimal = isLegacyNonIntegerManYen(legacyBudgetMinYen) && values.budgetMin === manYenValue(legacyBudgetMinYen);
  const budgetMaxIsLegacyDecimal = isLegacyNonIntegerManYen(legacyBudgetMaxYen) && values.budgetMax === manYenValue(legacyBudgetMaxYen);
  const [entryFiles, setEntryFiles] = useState<File[]>([]);
  const [entryIntentId] = useState(() => createEntryIntentId());
  const [entryReadFileKeys, setEntryReadFileKeys] = useState<string[]>([]);
  const [entryStagedFiles, setEntryStagedFiles] = useState<EntryUploadStagedFileRef[]>([]);
  const [entryStagingPending, setEntryStagingPending] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(() => new Set());
  const [existingClientLookupQuery, setExistingClientLookupQuery] = useState("");
  const [existingClientLookupMatches, setExistingClientLookupMatches] = useState<ExistingClientNameMatch[]>([]);
  const [existingClientLookupStatus, setExistingClientLookupStatus] = useState<"idle" | "searching" | "empty" | "ready" | "error">("idle");
  const existingClientLookupAbortRef = useRef<AbortController | null>(null);
  const existingClientLookupRequestRef = useRef(0);
  const [existingClientAutoLookupByField, setExistingClientAutoLookupByField] = useState<Record<ExistingClientAutoLookupField, ExistingClientLookupState>>(() => Object.fromEntries(existingClientAutoLookupFields.map((field) => [field, emptyExistingClientLookupState()])) as Record<ExistingClientAutoLookupField, ExistingClientLookupState>);
  const existingClientAutoLookupAbortRef = useRef<Partial<Record<ExistingClientAutoLookupField, AbortController>>>({});
  const existingClientAutoLookupRequestRef = useRef<Record<ExistingClientAutoLookupField, number>>({ nameLatin: 0, nameKanji: 0, nameKatakana: 0 });
  const [autoSaving, startAutoSaving] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const autoSaveStartedRef = useRef(false);
  const entryFilesRef = useRef<File[]>([]);
  const entryReadFileKeysRef = useRef<string[]>([]);
  const entryStagedFilesRef = useRef<EntryUploadStagedFileRef[]>([]);
  const handleEntryReadFileKeys = useCallback((keys: string[]) => {
    entryReadFileKeysRef.current = keys;
    setEntryReadFileKeys(keys);
  }, []);
  const updateEntryFiles = useCallback((files: File[]) => {
    autoSaveStartedRef.current = false;
    const priorStagedFiles = entryStagedFilesRef.current;
    if (priorStagedFiles.length) {
      void Promise.all(priorStagedFiles.map((ref) => fetch(`/api/entry-staging?id=${encodeURIComponent(ref.id)}`, { method: "DELETE" }).catch(() => undefined)));
    }
    entryFilesRef.current = files;
    setEntryFiles(files);
    setEntryStagingPending(false);
    entryReadFileKeysRef.current = [];
    setEntryReadFileKeys([]);
    entryStagedFilesRef.current = [];
    setEntryStagedFiles([]);
  }, []);
  const handleEntryStagedFiles = useCallback((refs: EntryUploadStagedFileRef[]) => {
    entryStagedFilesRef.current = refs;
    setEntryStagedFiles(refs);
  }, []);
  const handleEntryStagingPending = useCallback((pending: boolean) => {
    setEntryStagingPending(pending);
  }, []);
  const lookupExistingClientsByName = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    const requestId = existingClientLookupRequestRef.current + 1;
    existingClientLookupRequestRef.current = requestId;
    existingClientLookupAbortRef.current?.abort();
    if (!query) {
      setExistingClientLookupMatches([]);
      setExistingClientLookupStatus("idle");
      return;
    }
    const controller = new AbortController();
    existingClientLookupAbortRef.current = controller;
    setExistingClientLookupStatus("searching");
    try {
      const response = await fetch(`/api/clients/exact-name?q=${encodeURIComponent(query)}`, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const payload = await response.json() as { ok?: boolean; matches?: unknown };
      if (!response.ok || payload.ok !== true || !Array.isArray(payload.matches)) throw new Error("client_name_lookup_failed");
      const matches = parseExistingClientNameMatches(payload.matches);
      if (controller.signal.aborted || requestId !== existingClientLookupRequestRef.current) return;
      setExistingClientLookupMatches(matches);
      setExistingClientLookupStatus(matches.length > 0 ? "ready" : "empty");
    } catch {
      if (controller.signal.aborted || requestId !== existingClientLookupRequestRef.current) return;
      setExistingClientLookupMatches([]);
      setExistingClientLookupStatus("error");
    }
  }, []);
  const searchExistingClientsByName = useCallback(() => {
    void lookupExistingClientsByName(existingClientLookupQuery);
  }, [existingClientLookupQuery, lookupExistingClientsByName]);
  const invalidateExistingClientAutoLookup = useCallback((field: ExistingClientAutoLookupField) => {
    existingClientAutoLookupRequestRef.current[field] += 1;
    existingClientAutoLookupAbortRef.current[field]?.abort();
    delete existingClientAutoLookupAbortRef.current[field];
    setExistingClientAutoLookupByField((current) => ({ ...current, [field]: emptyExistingClientLookupState() }));
  }, []);
  const lookupExistingClientAutoByName = useCallback(async (field: ExistingClientAutoLookupField, rawQuery: string) => {
    if (mode !== "create" || !entryUpload || isCorporate) return;
    const query = rawQuery.trim();
    const requestId = existingClientAutoLookupRequestRef.current[field] + 1;
    existingClientAutoLookupRequestRef.current[field] = requestId;
    existingClientAutoLookupAbortRef.current[field]?.abort();
    if (!query || !isCustomerNameRepresentationValue(field, query)) {
      delete existingClientAutoLookupAbortRef.current[field];
      setExistingClientAutoLookupByField((current) => ({ ...current, [field]: emptyExistingClientLookupState() }));
      return;
    }
    const controller = new AbortController();
    existingClientAutoLookupAbortRef.current[field] = controller;
    setExistingClientAutoLookupByField((current) => ({ ...current, [field]: { query, matches: [], status: "searching" } }));
    try {
      const response = await fetch(`/api/clients/exact-name?q=${encodeURIComponent(query)}`, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const payload = await response.json() as { ok?: boolean; matches?: unknown };
      if (!response.ok || payload.ok !== true || !Array.isArray(payload.matches)) throw new Error("client_name_lookup_failed");
      const matches = parseExistingClientNameMatches(payload.matches);
      if (controller.signal.aborted || requestId !== existingClientAutoLookupRequestRef.current[field]) return;
      setExistingClientAutoLookupByField((current) => ({ ...current, [field]: { query, matches, status: matches.length > 0 ? "ready" : "empty" } }));
    } catch {
      if (controller.signal.aborted || requestId !== existingClientAutoLookupRequestRef.current[field]) return;
      setExistingClientAutoLookupByField((current) => ({ ...current, [field]: { query, matches: [], status: "error" } }));
    }
  }, [entryUpload, isCorporate, mode]);
  const autoLookupExistingClientByName = useCallback((field: ExistingClientAutoLookupField, rawQuery: string) => {
    if (mode !== "create" || !entryUpload || isCorporate) return;
    // This is an advisory read from an explicitly typed persisted field. It
    // never submits the form, reads an upload, changes its target, or merges records.
    void lookupExistingClientAutoByName(field, rawQuery);
  }, [entryUpload, isCorporate, lookupExistingClientAutoByName, mode]);
  useEffect(() => () => {
    existingClientLookupAbortRef.current?.abort();
    existingClientAutoLookupFields.forEach((field) => existingClientAutoLookupAbortRef.current[field]?.abort());
  }, []);
  useEffect(() => {
    if (!isCorporate) return;
    existingClientAutoLookupFields.forEach(invalidateExistingClientAutoLookup);
  }, [invalidateExistingClientAutoLookup, isCorporate]);
  const confirmEntryCandidate = useCallback((candidate: EntryPreviewCandidate) => {
    setValues((current) => {
      if (String(current[candidate.key as keyof ClientFormValues] ?? "").trim()) return current;
      const visibleField = !isCorporate ? visibleClientNameFieldFromEvidence(candidate.key, candidate.value) : null;
      const next = applyEntryPreviewCandidate(current, candidate);
      return visibleField && !String(next[visibleField] ?? "").trim() ? { ...next, [visibleField]: candidate.value } : next;
    });
  }, [isCorporate, setValues]);
  const entryAction = useCallback(async (previousState: ClientFormActionState, formData: FormData) => {
    if (entryUpload) {
      replaceEntryFiles(formData, entryFilesRef.current);
      // The preview has already transferred these bytes in 1 MiB requests;
      // never re-embed the original in the final Action body.
      applyEntryStagedFilesToFormData(formData, entryStagedFilesRef.current);
      formData.set("entryReadFileKeys", JSON.stringify(entryReadFileKeysRef.current));
    }
    return action(previousState, formData);
  }, [action, entryUpload]);
  const [state, formAction, pending] = useActionState<ClientFormActionState, FormData>(entryAction, { status: "idle", fieldErrors: {}, values: initial });
  const autoSaveReadResult = useCallback((preview: EntryPreviewState) => {
    if (mode !== "create" || !entryUpload || autoSaveStartedRef.current || !formRef.current) return;
    const data = new FormData(formRef.current);
    const applied = fillAutoSavedEntryForm(data, preview);
    if (applied === 0 || hasClientNameEntryPreviewConflict(preview.candidates) || !String(data.get("name") ?? "").trim()) return;
    if (!String(data.get("purpose") ?? "").trim()) data.set("purpose", "unspecified");
    if (!String(data.get("temperature") ?? "").trim()) data.set("temperature", "unspecified");
    entryReadFileKeysRef.current = preview.readFileKeys;
    setValues((current) => ({ ...current, ...Object.fromEntries([...data.entries()].filter(([key, value]) => key in current && typeof value === "string")) }));
    autoSaveStartedRef.current = true;
    startAutoSaving(() => formAction(data));
  }, [entryUpload, formAction, mode, setValues]);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [expandedSections, setExpandedSections] = useState<Record<ClientFormSectionKey, boolean>>(() => ({
    basic: Boolean(baseInitial.phone || baseInitial.lineId || baseInitial.email),
    profile: Boolean(baseInitial.partyType || baseInitial.nameLatin || baseInitial.nameKanji || baseInitial.nameKatakana || baseInitial.furigana || baseInitial.birthDate || baseInitial.gender || baseInitial.currentPostalCode || baseInitial.currentAddress || baseInitial.employerName || baseInitial.employerAddress || baseInitial.employerPhone || baseInitial.employerFax || baseInitial.annualIncome),
    needs: Boolean(baseInitial.budgetMin || baseInitial.budgetMax || baseInitial.firstChoiceArea || baseInitial.secondChoiceArea || (baseInitial.purpose && baseInitial.purpose !== "unspecified") || baseInitial.desiredMoveInPeriod),
    management: Boolean((baseInitial.stage && baseInitial.stage !== "lead") || (baseInitial.temperature && baseInitial.temperature !== "unspecified") || baseInitial.nextFollowUpAt),
    notes: Boolean(baseInitial.notes),
  }));
  const composingRef = useRef(false);
  const notifiedCreatedId = useRef<string | undefined>(undefined);
  const submissionLockRef = useRef<SubmissionLock>({ current: false });
  const budgetTypeOptions = getBudgetTypeOptions(locale);
  const purposeOptions = getPurposeOptions(locale, mode === "edit" ? values.purpose : undefined);
  const stageOptions = getStageOptions(locale);
  const temperatureOptions = getTemperatureOptions(locale);
  // `name` remains the compatibility column, but individual users edit the
  // three explicit name representations below. Keep the legacy value hidden
  // and derive it from the first supplied representation when possible.
  const legacyNameValue = isCorporate
    ? values.name
    : values.nameKanji.trim() || values.nameLatin.trim() || values.nameKatakana.trim() || values.name;
  const profileNameLabel = isCorporate ? text.companyName : text.name;
  const profileFuriganaLabel = isCorporate ? text.companyFurigana : text.furigana;
  const profilePostalCodeLabel = isCorporate ? text.companyPostalCode : text.currentPostalCode;
  const profileAddressLabel = isCorporate ? text.companyAddress : text.currentAddress;
  const hiddenIndividualFields = CLIENT_INDIVIDUAL_FORM_FIELDS;
  const sectionFieldKeys: Record<ClientFormSectionKey, readonly (keyof ClientFormValues)[]> = {
    basic: ["phone", "lineId", "email"],
    profile: isCorporate
      ? ["partyType", "name", "furigana", "currentPostalCode", "currentAddress"]
      : ["partyType", "nameLatin", "nameKanji", "nameKatakana", "furigana", "birthDate", "gender", "currentPostalCode", "currentAddress", "employerName", "employerAddress", "employerPhone", "employerFax", "annualIncome"],
    needs: ["budgetMin", "budgetMax", "budgetType", "firstChoiceArea", "secondChoiceArea", "purpose", "desiredMoveInPeriod"],
    management: ["stage", "temperature", "nextFollowUpAt"],
    notes: ["notes"],
  };
  const sectionCounts = (section: ClientFormSectionKey) => {
    const fields = sectionFieldKeys[section];
    return { filled: fields.filter((field) => isClientFormFieldCounted(field, values[field], mode, touchedFields)).length, total: fields.length };
  };

  const openSectionForField = useCallback((field: keyof ClientFormValues) => {
    const resolvedField = !isCorporate && field === "name" ? "nameKanji" : field;
    const section = clientFormSectionForField[resolvedField];
    setExpandedSections((current) => current[section] ? current : { ...current, [section]: true });
  }, [isCorporate]);
  const appliedFieldKey = entryAppliedFields.at(-1) ?? "";
  useEffect(() => {
    if (!hydrated || !appliedFieldKey || !(appliedFieldKey in clientFormSectionForField)) return;
    const field = appliedFieldKey as keyof ClientFormValues;
    const frame = window.requestAnimationFrame(() => {
      openSectionForField(field);
      const target = document.getElementById(`client-${field}`);
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [appliedFieldKey, hydrated, openSectionForField]);
  const locateEntryCandidate = useCallback((candidate: EntryPreviewCandidate) => {
    // The legacy generic name is hidden for individual clients; focus the
    // visible profile field instead of attempting to focus a hidden input.
    const visibleField = !isCorporate ? visibleClientNameFieldFromEvidence(candidate.key, candidate.value) : null;
    if (!visibleField && !isCorporate && candidate.key === "name") {
      const fallback = document.getElementById("entry-preview-heading");
      fallback?.focus();
      fallback?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const field = (visibleField ?? candidate.key) as keyof ClientFormValues;
    if (!(field in clientFormSectionForField)) return;
    openSectionForField(field);
    const focus = () => {
      const target = document.getElementById(`client-${field}`);
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    if (typeof window === "undefined") focus();
    else window.requestAnimationFrame(focus);
  }, [isCorporate, openSectionForField]);
  const applyEntryCandidate = useCallback((candidate: EntryPreviewCandidate, preview: EntryPreviewState) => {
    if (mode !== "create" || !entryUpload || autoSaveStartedRef.current || !formRef.current) return;
    const data = new FormData(formRef.current);
    if (!fillSelectedEntryCandidateForm(data, preview, candidate)) return;
    const visibleNameField = !isCorporate ? visibleClientNameFieldFromEvidence(candidate.key, candidate.value) : null;
    const isNameRepresentation = Boolean(visibleNameField);
    if (isNameRepresentation && !String(data.get("name") ?? "").trim()) data.set("name", candidate.value);
    if (visibleNameField) data.set(visibleNameField, candidate.value);
    if (!String(data.get("purpose") ?? "").trim()) data.set("purpose", "unspecified");
    if (!String(data.get("temperature") ?? "").trim()) data.set("temperature", "unspecified");
    entryReadFileKeysRef.current = preview.readFileKeys;
    setValues((current) => {
      const existing = String(current[candidate.key as keyof ClientFormValues] ?? "").trim();
      if (existing && existing !== candidate.value.trim()) return current;
      const next = applyEntryPreviewCandidate(current, candidate);
      if (visibleNameField && !next[visibleNameField].trim()) next[visibleNameField] = candidate.value;
      if (isNameRepresentation && !next.name.trim()) next.name = candidate.value;
      return next;
    });
    autoSaveStartedRef.current = true;
    startAutoSaving(() => formAction(data));
    locateEntryCandidate(candidate);
  }, [entryUpload, formAction, isCorporate, locateEntryCandidate, mode, setValues]);
  const toggleSection = (section: ClientFormSectionKey) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  useEffect(() => {
    if (state.status !== "error") return;
    setValues((current) => preserveClientIndividualFieldsOnCorporateValidation(current, state.values));
    for (const field of Object.keys(state.fieldErrors) as Array<keyof ClientFormValues>) openSectionForField(field);
    summaryRef.current?.focus();
  }, [openSectionForField, setValues, state.fieldErrors, state.status, state.values]);
  useEffect(() => {
    if (!formId || readOnly) return;
    const handleDraftApply = (event: Event) => {
      const detail = (event as CustomEvent<{ formId?: string; suggestions?: ClientIdentityDraftSuggestion[] }>).detail;
      if (detail?.formId !== formId || !Array.isArray(detail.suggestions)) return;
      setValues((current) => {
        const partyTypeControl = formRef.current?.elements.namedItem("partyType");
        const livePartyType = partyTypeControl instanceof HTMLSelectElement ? partyTypeControl.value : current.partyType;
        if (livePartyType === "corporate" || current.partyType === "corporate") return current;
        const safeSuggestions = filterClientIdentityDraftSuggestionsForPartyType(livePartyType, detail.suggestions ?? []);
        return fillEmptyEntryDraftSuggestions(current, safeSuggestions);
      });
    };
    window.addEventListener(CLIENT_IDENTITY_DRAFT_APPLY_EVENT, handleDraftApply);
    return () => window.removeEventListener(CLIENT_IDENTITY_DRAFT_APPLY_EVENT, handleDraftApply);
  }, [formId, readOnly, setValues]);
  useEffect(() => {
    const record = state.createdRecord;
    if (!record || notifiedCreatedId.current === record.id) return;
    notifiedCreatedId.current = record.id;
    onCreated?.(record);
  }, [onCreated, state.createdRecord]);
  useEffect(() => {
    const record = state.updatedRecord;
    if (!record) return;
    onSaved?.(record);
  }, [onSaved, state.updatedRecord]);
  useEffect(() => {
    if (!pending) endSubmission(submissionLockRef.current);
    onPendingChange?.(pending);
  }, [onPendingChange, pending]);
  const errorEntries = Object.entries(state.fieldErrors) as Array<[keyof ClientFormValues, string]>;
  const errorFor = (field: keyof ClientFormValues) => state.fieldErrors[field];
  const update = (field: keyof ClientFormValues, event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setTouchedFields((current) => current.has(field) ? current : new Set(current).add(field));
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
  };
  const focusField = (event: MouseEvent<HTMLAnchorElement>, field: keyof ClientFormValues) => {
    event.preventDefault();
    const resolvedField = !isCorporate && field === "name" ? "nameKanji" : field;
    openSectionForField(resolvedField);
    const focus = () => {
      const target = document.getElementById(`client-${resolvedField}`);
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    if (typeof window === "undefined") focus();
    else window.requestAnimationFrame(focus);
  };
  const fieldProps = (field: keyof ClientFormValues) => ({
    id: `client-${field}`, name: field, value: values[field], onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => update(field, event), onKeyDown,
    onCompositionStart: () => { composingRef.current = true; }, onCompositionEnd: () => { composingRef.current = false; },
    "aria-invalid": Boolean(errorFor(field)) || undefined, "aria-describedby": errorFor(field) ? `client-${field}-error` : undefined,
    disabled: readOnly || undefined,
  });
  const existingClientAutoLookupStates = existingClientAutoLookupFields.map((field) => existingClientAutoLookupByField[field]);
  const existingClientAutoLookupMatches = [...new Map(existingClientAutoLookupStates.flatMap((state) => state.matches).map((match) => [match.id, match])).values()];
  const existingClientAutoLookupSearching = existingClientAutoLookupStates.some((state) => state.status === "searching");
  const existingClientAutoLookupHasQuery = existingClientAutoLookupStates.some((state) => state.query.length > 0);
  const existingClientAutoLookupHasError = existingClientAutoLookupStates.some((state) => state.status === "error");
  const errorText = (field: keyof ClientFormValues) => errorFor(field) ? <p id={`client-${field}-error`} className="text-xs font-semibold text-rose-700">{errorFor(field)}</p> : null;
  const label = (field: keyof ClientFormValues, content: string, required = false, hint?: string) => <div className="flex items-center gap-1"><label htmlFor={`client-${field}`} className="text-sm font-semibold text-slate-700">{content} {required ? <span className="text-rose-700">*</span> : <span className="text-xs font-normal text-slate-500">({text.optional})</span>}</label>{hint ? <HelpHint id={`client-${field}-hint`} label={content}>{hint}</HelpHint> : null}</div>;
  const [postalLookupStatus, setPostalLookupStatus] = useState<"idle" | "loading" | "found" | "not_found" | "unavailable" | "invalid" | "error">("idle");
  const lookupCurrentPostalCode = useCallback(async () => {
    const postalCode = normalizeJapanesePostalCode(values.currentPostalCode);
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
      const currentAddress = values.currentAddress.trim();
      const prefix = payload.addressPrefix;
      const administrativePrefix = `${payload.prefecture ?? ""}${payload.municipality ?? ""}`;
      const nextAddress = !currentAddress
        ? prefix
        : currentAddress.startsWith(prefix) || (administrativePrefix && currentAddress.startsWith(administrativePrefix))
          ? currentAddress
          : /^(東京都|北海道|京都府|大阪府|.{2,3}県)/.test(currentAddress)
            ? currentAddress
            : `${prefix}${currentAddress}`;
      setValues((current) => ({ ...current, currentPostalCode: postalCode, currentAddress: nextAddress }));
      setPostalLookupStatus("found");
    } catch {
      setPostalLookupStatus("error");
    }
  }, [setValues, values.currentAddress, values.currentPostalCode]);
  const select = (field: keyof ClientFormValues, options: ReadonlyArray<{ value: string; label: string }>, required = false) => (
    <select {...fieldProps(field)} required={required} aria-required={required || undefined} className={inputClass}>
      {required ? <option value="">{text.choose}</option> : null}
      {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  );
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    handleFormSubmit(event, submissionLockRef.current, onSubmitStart);
  };
  const handleInvalid = (event: FormEvent<HTMLFormElement>) => {
    const field = String((event.target as HTMLInputElement).name) as keyof ClientFormValues;
    if (field in clientFormSectionForField) openSectionForField(field);
  };

  return (
    <form ref={formRef} id={formId} action={formAction} onSubmit={readOnly ? (event) => event.preventDefault() : handleSubmit} onInvalidCapture={handleInvalid} noValidate className="space-y-3 pb-10">
      <input type="hidden" name="returnTo" value={returnTo} />
      {submitReturnTo ? <input type="hidden" name="submitReturnTo" value={submitReturnTo} /> : null}
      {onCreated ? <input type="hidden" name="caseDraftReturn" value="1" /> : null}
      {values.clientId ? <input type="hidden" name="clientId" value={values.clientId} /> : null}
      {!isCorporate ? <input type="hidden" id="client-name" name="name" value={legacyNameValue} readOnly aria-hidden="true" /> : null}
      {entryUpload && !readOnly ? <>
        <input type="hidden" name="entryIntentId" value={entryIntentId} />
        {mode === "create" ? <div role="search" aria-labelledby="existing-client-lookup-title" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <div className="flex items-center gap-1">
            <p id="existing-client-lookup-title" className="font-bold">{text.existingClientLookupTitle}</p>
            <HelpHint id="existing-client-lookup-hint" label={text.existingClientLookupTitle}>{text.existingClientLookupDescription}</HelpHint>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={existingClientLookupQuery}
              onChange={(event) => {
                existingClientLookupRequestRef.current += 1;
                existingClientLookupAbortRef.current?.abort();
                setExistingClientLookupQuery(event.target.value);
                setExistingClientLookupStatus("idle");
                setExistingClientLookupMatches([]);
              }}
              placeholder={text.existingClientLookupPlaceholder}
              aria-label={text.existingClientLookupPlaceholder}
              className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100"
            />
            <button type="button" onClick={() => void searchExistingClientsByName()} disabled={existingClientLookupStatus === "searching"} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 disabled:cursor-wait disabled:opacity-60">
              {existingClientLookupStatus === "searching" ? text.existingClientLookupSearching : text.existingClientLookupSearch}
            </button>
          </div>
          {existingClientLookupStatus === "error" ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{text.error}</p> : null}
          {existingClientLookupStatus === "empty" ? <p role="status" className="mt-2 text-xs font-semibold text-slate-700">{text.existingClientLookupNone}</p> : null}
          {existingClientLookupMatches.length > 0 ? <div className="mt-2 space-y-1" role="list" aria-label={text.existingClientLookupManualFound}>
            <p className="text-xs font-bold">{text.existingClientLookupManualFound}</p>
            {existingClientLookupMatches.map((match) => <div key={match.id} role="listitem" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-2.5 py-2">
              <span className="min-w-0 break-words font-semibold">{match.name}</span>
              <Link href={`/clients/${encodeURIComponent(match.id)}/edit`} className="shrink-0 font-bold text-[#0046ad] underline">{text.existingClientLookupOpen}</Link>
            </div>)}
          </div> : null}
          {existingClientAutoLookupSearching ? <p role="status" className="mt-2 text-xs font-semibold text-slate-700">{text.existingClientAutoLookupSearching}</p> : null}
          {existingClientAutoLookupHasError ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{text.existingClientAutoLookupError}</p> : null}
          {existingClientAutoLookupMatches.length > 0 ? <div className="mt-2 space-y-1" role="list" aria-label={text.existingClientAutoLookupFound}>
            <p className="text-xs font-bold">{text.existingClientAutoLookupFound}</p>
            {existingClientAutoLookupMatches.map((match) => <div key={match.id} role="listitem" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-2.5 py-2">
              <span className="min-w-0 break-words font-semibold">{match.name}</span>
              <Link href={`/clients/${encodeURIComponent(match.id)}/edit`} className="shrink-0 font-bold text-[#0046ad] underline">{text.existingClientLookupOpen}</Link>
            </div>)}
          </div> : existingClientAutoLookupHasQuery && !existingClientAutoLookupSearching && !existingClientAutoLookupHasError ? <p role="status" className="mt-2 text-xs font-semibold text-slate-700">{text.existingClientAutoLookupNone}</p> : null}
        </div> : null}
        <div className="grid items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 md:grid-cols-2">
          <EntryFilePicker locale={locale} files={entryFiles} onFilesChange={updateEntryFiles} disabled={pending} compact />
          <EntryPreview files={entryFiles} kind="customer" locale={locale} onConfirm={confirmEntryCandidate} onApplyCandidate={applyEntryCandidate} onLocateCandidate={locateEntryCandidate} onReadFileKeys={handleEntryReadFileKeys} onStagedFiles={handleEntryStagedFiles} onStagingPending={handleEntryStagingPending} onReadComplete={autoSaveReadResult} compact />
        </div>
        <input type="hidden" name="entryReadFileKeys" value={JSON.stringify(entryReadFileKeys)} />
        <input type="hidden" name="entryStagedFiles" value={JSON.stringify(entryStagedFiles)} />
      </> : null}
      {state.status === "error" ? <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><p className="font-bold">{state.message ?? text.error}</p><ul className="mt-2 list-disc space-y-1 pl-5">{errorEntries.map(([field, message]) => <li key={field}><a className="underline" href={`#client-${field}`} onClick={(event) => focusField(event, field)}>{message}</a></li>)}</ul></div> : null}
      <input type="hidden" name="purposeTouched" value={touchedFields.has("purpose") ? "1" : "0"} />

      <ClientFormSection section="basic" title={text.basic} hint={text.basicHint} expanded={expandedSections.basic} onToggle={() => toggleSection("basic")} {...sectionCounts("basic")}><div className="grid gap-3 md:grid-cols-2">
        {isCorporate ? <div className="space-y-1">{label("name", profileNameLabel, true)}<input {...fieldProps("name")} required aria-required="true" className={inputClass} />{errorText("name")}</div> : null}
        <div className="space-y-1">{label("phone", text.phone, false, !values.phone.trim() ? text.phoneMissing : undefined)}<input {...fieldProps("phone")} onChange={(event) => setValues((current) => ({ ...current, phone: formatJapanesePhone(event.target.value) }))} inputMode="tel" className={inputClass} />{errorText("phone")}</div>
        <div className="space-y-1">{label("lineId", text.lineId)}<input {...fieldProps("lineId")} className={inputClass} />{errorText("lineId")}</div>
        <div className="space-y-1">{label("email", text.email)}<input {...fieldProps("email")} type="email" className={inputClass} />{errorText("email")}</div>
      </div></ClientFormSection>

      <ClientFormSection section="profile" title={text.profile} hint={text.profileHint} expanded={expandedSections.profile} onToggle={() => toggleSection("profile")} {...sectionCounts("profile")}><div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1"><label htmlFor="client-partyType" className="text-sm font-semibold text-slate-700">{text.partyType} <span className="text-xs font-normal text-slate-500">({text.optional})</span></label><select {...fieldProps("partyType")} id="client-partyType" className={inputClass}><option value="">{text.partyTypeUnset}</option>{getPartyProfileTypeOptions(locale).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{errorText("partyType")}</div>
        {isCorporate ? <div className="space-y-1">{label("furigana", profileFuriganaLabel)}<input {...fieldProps("furigana")} className={inputClass} />{errorText("furigana")}</div> : <input {...fieldProps("furigana")} type="hidden" aria-hidden="true" />}
        {!isCorporate ? <>
          <div className="space-y-1">{label("nameLatin", text.nameLatin)}<input {...fieldProps("nameLatin")} onChange={(event) => { update("nameLatin", event); invalidateExistingClientAutoLookup("nameLatin"); }} onBlur={(event) => autoLookupExistingClientByName("nameLatin", event.currentTarget.value)} className={inputClass} />{errorText("nameLatin")}</div>
          <div className="space-y-1">{label("nameKanji", text.nameKanji)}<input {...fieldProps("nameKanji")} onChange={(event) => { update("nameKanji", event); invalidateExistingClientAutoLookup("nameKanji"); }} onBlur={(event) => autoLookupExistingClientByName("nameKanji", event.currentTarget.value)} className={inputClass} />{errorText("nameKanji")}</div>
          <div className="space-y-1">{label("nameKatakana", text.nameKatakana)}<input {...fieldProps("nameKatakana")} onChange={(event) => { update("nameKatakana", event); invalidateExistingClientAutoLookup("nameKatakana"); }} onBlur={(event) => autoLookupExistingClientByName("nameKatakana", event.currentTarget.value)} className={inputClass} />{errorText("nameKatakana")}</div>
          <div className="md:col-span-2">{errorText("name")}</div>
        </> : null}
        <div className="space-y-1">{label("currentPostalCode", profilePostalCodeLabel)}<input {...fieldProps("currentPostalCode")} onBlur={() => void lookupCurrentPostalCode()} inputMode="numeric" autoComplete="postal-code" className={inputClass} />{postalLookupStatus === "loading" ? <p role="status" className="text-xs font-semibold text-slate-600">{text.postalLookupLoading}</p> : postalLookupStatus === "found" ? <p role="status" className="text-xs font-semibold text-emerald-700">{text.postalLookup}</p> : postalLookupStatus === "not_found" ? <p role="status" className="text-xs font-semibold text-amber-700">{text.postalLookupNotFound}</p> : postalLookupStatus === "unavailable" ? <p role="alert" className="text-xs font-semibold text-amber-700">{text.postalLookupUnavailable}</p> : postalLookupStatus === "invalid" ? <p role="alert" className="text-xs font-semibold text-rose-700">{text.postalLookupInvalid}</p> : null}{errorText("currentPostalCode")}</div>
        <div className="space-y-1 md:col-span-2">{label("currentAddress", profileAddressLabel)}<input {...fieldProps("currentAddress")} className={inputClass} />{errorText("currentAddress")}</div>
        {isCorporate ? hiddenIndividualFields.map((field) => <input key={field} type="hidden" value={values[field]} disabled aria-hidden="true" />) : <>
          <div className="space-y-1">{label("birthDate", text.birthDate)}<input {...fieldProps("birthDate")} type="date" className={inputClass} />{errorText("birthDate")}</div>
          <div className="space-y-1">{label("gender", text.gender)}<select {...fieldProps("gender")} className={inputClass}><option value="">{text.genderUnset}</option><option value="male">{text.genderMale}</option><option value="female">{text.genderFemale}</option><option value="other">{text.genderOther}</option></select>{errorText("gender")}</div>
          <div className="space-y-1">{label("employerName", text.employerName)}<input {...fieldProps("employerName")} className={inputClass} />{errorText("employerName")}</div>
          <div className="space-y-1">{label("employerPhone", text.employerPhone)}<input {...fieldProps("employerPhone")} onChange={(event) => setValues((current) => ({ ...current, employerPhone: formatJapanesePhone(event.target.value) }))} inputMode="tel" className={inputClass} />{errorText("employerPhone")}</div>
          <div className="space-y-1">{label("employerFax", text.employerFax)}<input {...fieldProps("employerFax")} onChange={(event) => setValues((current) => ({ ...current, employerFax: formatJapanesePhone(event.target.value) }))} inputMode="tel" className={inputClass} />{errorText("employerFax")}</div>
          <div className="space-y-1">{label("employerAddress", text.employerAddress)}<input {...fieldProps("employerAddress")} className={inputClass} />{errorText("employerAddress")}</div>
          <div className="space-y-1">{label("annualIncome", text.annualIncome)}<div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[#0046ad] focus-within:ring-2 focus-within:ring-blue-100"><input {...fieldProps("annualIncome")} type="number" min="0" step={annualIncomeIsLegacyDecimal ? "any" : "1"} inputMode={annualIncomeIsLegacyDecimal ? "decimal" : "numeric"} className="min-h-11 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-base text-slate-900 outline-none sm:text-sm" /><span className="pr-3 text-xs font-semibold text-slate-500">{text.man}</span></div>{annualIncomeIsLegacyDecimal ? <p className="text-xs text-amber-700">{text.legacyMoneyHint}</p> : null}{errorText("annualIncome")}</div>
        </>}
      </div></ClientFormSection>

      <ClientFormSection section="needs" title={text.needs} hint={text.needsHint} expanded={expandedSections.needs} onToggle={() => toggleSection("needs")} {...sectionCounts("needs")}><div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">{label("budgetMin", text.budgetMin)}<div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[#0046ad] focus-within:ring-2 focus-within:ring-blue-100"><input {...fieldProps("budgetMin")} type="number" min="0" step={budgetMinIsLegacyDecimal ? "any" : "1"} inputMode={budgetMinIsLegacyDecimal ? "decimal" : "numeric"} className="min-h-11 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-base text-slate-900 outline-none sm:text-sm" /><span className="pr-3 text-xs font-semibold text-slate-500">{text.man}</span></div>{budgetMinIsLegacyDecimal ? <p className="text-xs text-amber-700">{text.legacyMoneyHint}</p> : null}{errorText("budgetMin")}</div>
        <div className="space-y-1">{label("budgetMax", text.budgetMax)}<div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[#0046ad] focus-within:ring-2 focus-within:ring-blue-100"><input {...fieldProps("budgetMax")} type="number" min="0" step={budgetMaxIsLegacyDecimal ? "any" : "1"} inputMode={budgetMaxIsLegacyDecimal ? "decimal" : "numeric"} className="min-h-11 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-base text-slate-900 outline-none sm:text-sm" /><span className="pr-3 text-xs font-semibold text-slate-500">{text.man}</span></div>{budgetMaxIsLegacyDecimal ? <p className="text-xs text-amber-700">{text.legacyMoneyHint}</p> : null}{errorText("budgetMax")}</div>
        <div className="space-y-1">{label("budgetType", text.budgetType)}{select("budgetType", budgetTypeOptions)}{errorText("budgetType")}</div>
        <div className="space-y-1">{label("firstChoiceArea", text.firstChoiceArea)}<input {...fieldProps("firstChoiceArea")} className={inputClass} />{errorText("firstChoiceArea")}</div>
        <div className="space-y-1">{label("secondChoiceArea", text.secondChoiceArea)}<input {...fieldProps("secondChoiceArea")} className={inputClass} />{errorText("secondChoiceArea")}</div>
        <div className="space-y-1">{label("purpose", text.purpose)}{select("purpose", purposeOptions)}{errorText("purpose")}</div>
        <div className="space-y-1">{label("desiredMoveInPeriod", text.period)}<input {...fieldProps("desiredMoveInPeriod")} className={inputClass} />{errorText("desiredMoveInPeriod")}</div>
      </div></ClientFormSection>

      <ClientFormSection section="management" title={text.management} hint={text.managementHint} expanded={expandedSections.management} onToggle={() => toggleSection("management")} {...sectionCounts("management")}><div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">{label("stage", text.stage, true, mode === "create" ? text.initialState : undefined)}{select("stage", stageOptions, true)}{errorText("stage")}</div>
        <div className="space-y-1">{label("temperature", text.temperature)}{select("temperature", temperatureOptions)}{errorText("temperature")}</div>
        <div className="space-y-1">{label("nextFollowUpAt", text.nextFollowUpAt)}<input {...fieldProps("nextFollowUpAt")} type="date" className={inputClass} />{errorText("nextFollowUpAt")}</div>
      </div></ClientFormSection>

      {!isCorporate ? (["preferredArea", "loanPreApprovalStatus", "annualIncomeAsOf", "annualIncomeSource", "brokerageContractType", "brokerageContractSignedAt", "brokerageContractExpiresAt", "importantMattersExplainedAt", "contractDocumentDeliveredAt", "personalInfoConsentAt", "amlCheckStatus"] as const).map((field) => <input key={field} type="hidden" name={field} value={values[field]} />) : null}

      <ClientFormSection section="notes" title={text.notes} hint={text.notesHint} expanded={expandedSections.notes} onToggle={() => toggleSection("notes")} {...sectionCounts("notes")}><div className="space-y-3">{label("notes", text.notes)}<textarea {...fieldProps("notes")} rows={5} placeholder={text.notesPlaceholder} className={`${inputClass} resize-y`} />{errorText("notes")}</div></ClientFormSection>

      {hideActions ? null : <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-5">{onCancel ? <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{text.cancel}</button> : <Link href={returnTo} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.cancel}</Link>}<Button type="submit" disabled={Boolean(entryUpload && entryFiles.length > 0 && (entryStagingPending || entryStagedFiles.length === 0))} loading={pending || autoSaving} className="min-h-11 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">{pending || autoSaving ? text.saving : entryUpload && entryFiles.length > entryReadFileKeys.length ? text.saveAndRead : text.save}</Button></div>}
      <div className="sr-only" aria-live="polite">{pending ? text.saving : ""}</div>
    </form>
  );
}
