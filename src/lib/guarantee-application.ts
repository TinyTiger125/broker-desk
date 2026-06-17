import type { BrokerageCase, GuaranteeApplicationDraft } from "@/lib/data.memory";
import { getCaseFieldValue } from "@/lib/case-field-normalization";

export type GuaranteeCompanyCode = "zenhoren" | "nihon_safety" | "j_lease" | "insure" | "friends_guarantee";
export type GuaranteeApplicantType = "individual" | "corporate" | "both";
export type GuaranteeTemplateStatus = "draft" | "active" | "deprecated";
export type GuaranteeTemplateQualityStatus = "verified" | "needs_calibration" | "source_quality_blocked";
export type GuaranteeFieldCompletionMode = "certified_auto" | "assisted_candidate" | "manual_electronic";

export type GuaranteeCompanyTemplate = {
  id: string;
  companyCode: GuaranteeCompanyCode;
  companyDisplayName: string;
  companyLegalName: string;
  templateDisplayName: string;
  templateVersion: string;
  sourcePdfFileName: string;
  pageCount: number;
  supportedApplicantType: GuaranteeApplicantType;
  requiredFieldKeys: string[];
  optionalFieldKeys: string[];
  companySpecificOptionKeys: string[];
  coordinateMappingVersion: string;
  outputStatus: GuaranteeTemplateStatus;
  qualityStatus: GuaranteeTemplateQualityStatus;
  qualityNotes: string[];
  allowDirectDownload: boolean;
  fieldCompletionModes: Record<string, GuaranteeFieldCompletionMode>;
};

export type GuaranteeReadinessStatus = "available" | "missing" | "needs_confirmation";

export type GuaranteeReadinessField = {
  fieldKey: string;
  label: string;
  required: boolean;
  status: GuaranteeReadinessStatus;
  value: string;
  source: "confirmed_case" | "draft" | "candidate" | "not_provided";
};

export type GuaranteeReadinessGroup = {
  id: string;
  label: string;
  fields: GuaranteeReadinessField[];
};

export type GuaranteeApplicationFieldValue = {
  fieldKey: string;
  label: string;
  value: string;
};

export type FriendsGuaranteeDraftFieldDefinition = {
  fieldKey: string;
  label: string;
  required: boolean;
  inputType: "text" | "select" | "textarea";
  options?: string[];
};

export type FriendsGuaranteeDraftReadiness = {
  fields: GuaranteeReadinessField[];
  readyCount: number;
  missingCount: number;
  requiredMissingCount: number;
  status: "ready" | "draft";
};

export const GUARANTEE_APPLICATION_OUTPUT_TYPE = "guarantee_application";

export const GUARANTEE_FIELD_COMPLETION_LABELS: Record<GuaranteeFieldCompletionMode, string> = {
  certified_auto: "安全自動入力",
  assisted_candidate: "候補入力",
  manual_electronic: "電子手入力",
};

export const guaranteeCompanyTemplates: GuaranteeCompanyTemplate[] = [
  {
    id: "zenhoren_individual_v1",
    companyCode: "zenhoren",
    companyDisplayName: "全保連",
    companyLegalName: "全保連株式会社",
    templateDisplayName: "個人用申込書 / 2ページ",
    templateVersion: "zenhoren:v1",
    sourcePdfFileName: "１全保連.pdf",
    pageCount: 2,
    supportedApplicantType: "individual",
    requiredFieldKeys: [
      "property.name",
      "property.address",
      "lease.rent",
      "applicant.name",
      "applicant.birthDate",
      "applicant.phone",
      "applicant.currentAddress",
      "applicant.employerName",
      "emergencyContact.name",
      "emergencyContact.phone",
      "broker.companyName",
    ],
    optionalFieldKeys: ["lease.commonFee", "lease.moveInDate", "applicant.email", "coOccupants.0.name"],
    companySpecificOptionKeys: ["company_option.zenhoren_collection_service", "company_option.zenhoren_initial_fee"],
    coordinateMappingVersion: "overlay:zenhoren_v1_full_boxes_2026_06_08",
    outputStatus: "active",
    qualityStatus: "verified",
    qualityNotes: [
      "Phase E baseline: official PDF overlay is enabled behind preview confirmation. Numeric/date/phone fields are certified; text fields remain assisted candidates.",
    ],
    allowDirectDownload: true,
    fieldCompletionModes: {
      "broker.companyName": "certified_auto",
      "broker.fax": "certified_auto",
      "broker.staffName": "certified_auto",
      "property.name": "assisted_candidate",
      "property.postalCode": "certified_auto",
      "property.roomNumber": "certified_auto",
      "property.usage": "certified_auto",
      "lease.moveInDate": "certified_auto",
      "lease.rent": "certified_auto",
      "lease.commonFee": "certified_auto",
      "lease.deposit": "certified_auto",
      "lease.keyMoney": "certified_auto",
      "lease.parkingFee": "certified_auto",
      "lease.monthlyRentTotal": "certified_auto",
      "applicant.birthDate": "certified_auto",
      "applicant.phone": "certified_auto",
      "applicant.currentPostalCode": "certified_auto",
      "applicant.employerPostalCode": "certified_auto",
      "applicant.employerPhone": "certified_auto",
      "applicant.annualIncome": "certified_auto",
      "applicant.yearsEmployed": "certified_auto",
      "emergencyContact.birthDate": "certified_auto",
      "emergencyContact.phone": "certified_auto",
      "emergencyContact.postalCode": "certified_auto",
      "coOccupants.0.birthDate": "manual_electronic",
      "coOccupants.1.birthDate": "manual_electronic",
      "coOccupants.2.birthDate": "manual_electronic",
      "broker.phone": "certified_auto",
      "company_option.zenhoren_collection_service": "manual_electronic",
      "company_option.zenhoren_initial_fee": "manual_electronic",
    },
  },
  {
    id: "nihon_safety_individual_v1",
    companyCode: "nihon_safety",
    companyDisplayName: "日本セーフティー",
    companyLegalName: "日本セーフティー株式会社",
    templateDisplayName: "個人用申込書 / 1ページ",
    templateVersion: "nihon_safety:v1",
    sourcePdfFileName: "日本セーフティー(1).pdf",
    pageCount: 1,
    supportedApplicantType: "individual",
    requiredFieldKeys: [
      "property.name",
      "property.address",
      "lease.rent",
      "applicant.name",
      "applicant.birthDate",
      "applicant.phone",
      "applicant.currentAddress",
      "applicant.employerName",
      "emergencyContact.name",
      "broker.companyName",
    ],
    optionalFieldKeys: ["lease.commonFee", "applicant.email", "applicant.annualIncome", "coOccupants.0.name"],
    companySpecificOptionKeys: ["company_option.nihon_safety_product", "company_option.nihon_safety_payment_method"],
    coordinateMappingVersion: "overlay:nihon_safety_v1_calibrated",
    outputStatus: "active",
    qualityStatus: "verified",
    qualityNotes: [
      "Phase E baseline uses the high-resolution official PDF source. Text fields are preview-confirmed candidates; numeric/date fields use conservative auto placement.",
    ],
    allowDirectDownload: true,
    fieldCompletionModes: {
      "lease.moveInDate": "manual_electronic",
      "lease.rent": "certified_auto",
      "lease.commonFee": "certified_auto",
      "lease.parkingFee": "certified_auto",
      "lease.monthlyRentTotal": "certified_auto",
      "lease.deposit": "certified_auto",
      "lease.keyMoney": "certified_auto",
      "applicant.birthDate": "certified_auto",
      "applicant.phone": "certified_auto",
      "applicant.annualIncome": "manual_electronic",
      "broker.phone": "certified_auto",
      "company_option.nihon_safety_product": "manual_electronic",
      "company_option.nihon_safety_payment_method": "manual_electronic",
    },
  },
  {
    id: "j_lease_individual_v1",
    companyCode: "j_lease",
    companyDisplayName: "Jリース",
    companyLegalName: "ジェイリース株式会社（Jリース）",
    templateDisplayName: "入居申込書兼保証委託申込書 / 2ページ",
    templateVersion: "j_lease:v1",
    sourcePdfFileName: "３Jリース.pdf",
    pageCount: 2,
    supportedApplicantType: "individual",
    requiredFieldKeys: [
      "property.name",
      "property.address",
      "lease.rent",
      "applicant.name",
      "applicant.birthDate",
      "applicant.phone",
      "applicant.currentAddress",
      "applicant.employerName",
      "applicant.annualIncome",
      "emergencyContact.name",
      "broker.companyName",
    ],
    optionalFieldKeys: ["lease.commonFee", "applicant.email", "coOccupants.0.name", "management.companyName"],
    companySpecificOptionKeys: ["company_option.j_lease_product_plan", "company_option.j_lease_rent_transfer"],
    coordinateMappingVersion: "overlay:j_lease_v1_calibrated",
    outputStatus: "active",
    qualityStatus: "verified",
    qualityNotes: [
      "Phase E baseline supports segmented date/phone/money handling where coordinates are known. Long text remains preview-confirmed.",
    ],
    allowDirectDownload: true,
    fieldCompletionModes: {
      "lease.moveInDate": "manual_electronic",
      "lease.rent": "certified_auto",
      "lease.commonFee": "certified_auto",
      "lease.parkingFee": "certified_auto",
      "applicant.birthDate": "certified_auto",
      "applicant.phone": "certified_auto",
      "applicant.employerPhone": "certified_auto",
      "applicant.annualIncome": "certified_auto",
      "applicant.yearsEmployed": "certified_auto",
      "emergencyContact.birthDate": "manual_electronic",
      "emergencyContact.phone": "manual_electronic",
      "company_option.j_lease_product_plan": "manual_electronic",
      "company_option.j_lease_rent_transfer": "manual_electronic",
    },
  },
  {
    id: "insure_individual_v1",
    companyCode: "insure",
    companyDisplayName: "インシュア",
    companyLegalName: "株式会社インシュア",
    templateDisplayName: "スマートサポート申込書（個人用） / 1ページ",
    templateVersion: "insure:v1",
    sourcePdfFileName: "４インシュア.pdf",
    pageCount: 1,
    supportedApplicantType: "individual",
    requiredFieldKeys: [
      "property.name",
      "property.address",
      "lease.rent",
      "applicant.name",
      "applicant.birthDate",
      "applicant.phone",
      "applicant.currentAddress",
      "applicant.employerName",
      "emergencyContact.name",
    ],
    optionalFieldKeys: ["lease.commonFee", "applicant.email", "applicant.occupation", "coOccupants.0.name", "broker.companyName"],
    companySpecificOptionKeys: ["company_option.insure_smart_support", "company_option.insure_single_person"],
    coordinateMappingVersion: "overlay:insure_v1_calibrated",
    outputStatus: "active",
    qualityStatus: "verified",
    qualityNotes: [
      "Phase E baseline is printable after preview confirmation. Dense or optional cells stay manual until a user places them.",
    ],
    allowDirectDownload: true,
    fieldCompletionModes: {
      "lease.moveInDate": "manual_electronic",
      "lease.rent": "certified_auto",
      "lease.commonFee": "certified_auto",
      "lease.parkingFee": "manual_electronic",
      "lease.deposit": "manual_electronic",
      "lease.keyMoney": "manual_electronic",
      "applicant.birthDate": "certified_auto",
      "applicant.phone": "certified_auto",
      "applicant.annualIncome": "manual_electronic",
      "applicant.yearsEmployed": "certified_auto",
      "emergencyContact.birthDate": "manual_electronic",
      "emergencyContact.phone": "manual_electronic",
      "broker.phone": "manual_electronic",
      "broker.staffName": "manual_electronic",
      "company_option.insure_smart_support": "manual_electronic",
      "company_option.insure_single_person": "manual_electronic",
    },
  },
  {
    id: "friends_guarantee_individual_v1",
    companyCode: "friends_guarantee",
    companyDisplayName: "ふれんず保証",
    companyLegalName: "株式会社ふれんず宅建保証（ふれんず保証）",
    templateDisplayName: "入居申込書兼保証委託申込書（個人用） / 1ページ",
    templateVersion: "friends_guarantee:v1",
    sourcePdfFileName: "５ふれんず保証.pdf",
    pageCount: 1,
    supportedApplicantType: "individual",
    requiredFieldKeys: [
      "property.name",
      "property.address",
      "lease.rent",
      "lease.moveInDate",
      "applicant.name",
      "applicant.birthDate",
      "applicant.phone",
      "applicant.currentAddress",
      "applicant.employerName",
      "emergencyContact.name",
      "broker.companyName",
      "company_option.friends_plan_type",
      "company_option.friends_consent",
    ],
    optionalFieldKeys: [
      "lease.commonFee",
      "lease.deposit",
      "lease.keyMoney",
      "lease.insuranceFee",
      "lease.keyExchangeFee",
      "applicant.email",
      "applicant.gender",
      "applicant.spouse",
      "applicant.residenceYears",
      "applicant.housingType",
      "applicant.currentRent",
      "applicant.jobType",
      "applicant.employmentType",
      "applicant.moveReason",
      "guarantor.jobType",
      "emergencyContact.jobType",
      "coOccupants.0.name",
      "coOccupants.1.name",
      "coOccupants.2.name",
      "broker.address",
      "broker.staffName",
      "management.companyName",
      "management.address",
      "management.phone",
      "management.staffName",
    ],
    companySpecificOptionKeys: [
      "company_option.friends_plan_type",
      "company_option.friends_consent",
      "company_option.friends_collection_agency",
      "company_option.friends_single_rider",
      "company_option.friends_notes",
    ],
    coordinateMappingVersion: "overlay:friends_guarantee_v1_calibrated",
    outputStatus: "active",
    qualityStatus: "verified",
    qualityNotes: ["Current baseline supports visual preview, drag adjustment, custom fields, and template-level calibration save."],
    allowDirectDownload: true,
    fieldCompletionModes: {
      "property.roomNumber": "certified_auto",
      "lease.moveInDate": "certified_auto",
      "lease.rent": "certified_auto",
      "lease.commonFee": "certified_auto",
      "lease.parkingFee": "certified_auto",
      "lease.monthlyRentTotal": "certified_auto",
      "lease.deposit": "certified_auto",
      "lease.keyMoney": "certified_auto",
      "lease.insuranceFee": "certified_auto",
      "lease.keyExchangeFee": "certified_auto",
      "applicant.birthDate": "certified_auto",
      "applicant.residenceYears": "certified_auto",
      "applicant.currentRent": "certified_auto",
      "applicant.annualIncome": "certified_auto",
      "applicant.payday": "certified_auto",
      "broker.phone": "certified_auto",
      "management.phone": "certified_auto",
      "company_option.friends_plan_type": "manual_electronic",
      "company_option.friends_consent": "manual_electronic",
      "company_option.friends_collection_agency": "manual_electronic",
      "company_option.friends_single_rider": "manual_electronic",
      "company_option.friends_notes": "manual_electronic",
    },
  },
];

export function getGuaranteeFieldCompletionMode(
  template: Pick<GuaranteeCompanyTemplate, "fieldCompletionModes">,
  fieldKey: string,
): GuaranteeFieldCompletionMode {
  const configured = template.fieldCompletionModes[fieldKey];
  if (configured) return configured;
  if (fieldKey.startsWith("company_option.")) return "manual_electronic";
  if (fieldKey.startsWith("custom.")) return "manual_electronic";
  return "assisted_candidate";
}

export function getGuaranteeFieldCompletionSummary(input: {
  template: Pick<GuaranteeCompanyTemplate, "fieldCompletionModes">;
  fieldKeys: string[];
}): Record<GuaranteeFieldCompletionMode, number> {
  const uniqueFieldKeys = [...new Set(input.fieldKeys)];
  return uniqueFieldKeys.reduce<Record<GuaranteeFieldCompletionMode, number>>(
    (summary, fieldKey) => {
      summary[getGuaranteeFieldCompletionMode(input.template, fieldKey)] += 1;
      return summary;
    },
    {
      certified_auto: 0,
      assisted_candidate: 0,
      manual_electronic: 0,
    },
  );
}

const GROUP_DEFINITIONS = [
  {
    id: "property_lease",
    label: "物件・契約条件",
    fields: [
      ["property.name", "物件名"],
      ["property.roomNumber", "部屋番号"],
      ["property.address", "物件所在地"],
      ["lease.moveInDate", "入居予定日"],
      ["lease.rent", "賃料"],
      ["lease.commonFee", "共益費・管理費"],
      ["lease.deposit", "敷金"],
      ["lease.keyMoney", "礼金"],
      ["lease.insuranceFee", "保険料"],
      ["lease.keyExchangeFee", "鍵交換代"],
    ],
  },
  {
    id: "applicant",
    label: "申込者・賃借人",
    fields: [
      ["applicant.name", "氏名"],
      ["applicant.furigana", "フリガナ"],
      ["applicant.gender", "性別"],
      ["applicant.spouse", "配偶者"],
      ["applicant.birthDate", "生年月日"],
      ["applicant.phone", "携帯電話"],
      ["applicant.email", "メール"],
      ["applicant.currentPostalCode", "現住所 郵便番号"],
      ["applicant.currentAddress", "現住所"],
      ["applicant.residenceYears", "居住年数"],
      ["applicant.housingType", "自宅・賃貸"],
      ["applicant.currentRent", "現家賃"],
    ],
  },
  {
    id: "employment_income",
    label: "勤務先・収入",
    fields: [
      ["applicant.employerName", "勤務先名"],
      ["applicant.employerFurigana", "勤務先フリガナ"],
      ["applicant.employerPhone", "勤務先電話"],
      ["applicant.employerPostalCode", "勤務先 郵便番号"],
      ["applicant.employerAddress", "勤務先住所"],
      ["applicant.occupation", "業種"],
      ["applicant.jobType", "職種"],
      ["applicant.employmentType", "雇用形態"],
      ["applicant.annualIncome", "年収"],
      ["applicant.yearsEmployed", "勤続年数"],
      ["applicant.payday", "給料日"],
      ["applicant.moveReason", "転居理由"],
    ],
  },
  {
    id: "contact_guarantor",
    label: "緊急連絡先・連帯保証人",
    fields: [
      ["guarantor.name", "連帯保証人1 氏名"],
      ["guarantor.furigana", "連帯保証人1 フリガナ"],
      ["guarantor.gender", "連帯保証人1 性別"],
      ["guarantor.spouse", "連帯保証人1 配偶者"],
      ["guarantor.relationship", "連帯保証人1 続柄"],
      ["guarantor.birthDate", "連帯保証人1 生年月日"],
      ["guarantor.phone", "連帯保証人1 電話番号"],
      ["guarantor.address", "連帯保証人1 自宅住所"],
      ["guarantor.residenceYears", "連帯保証人1 居住年数"],
      ["guarantor.housingType", "連帯保証人1 自宅・賃貸"],
      ["guarantor.employerName", "連帯保証人1 勤務先名"],
      ["guarantor.employerFurigana", "連帯保証人1 勤務先フリガナ"],
      ["guarantor.employerAddress", "連帯保証人1 勤務先住所"],
      ["guarantor.occupation", "連帯保証人1 業種"],
      ["guarantor.jobType", "連帯保証人1 職種"],
      ["guarantor.employmentType", "連帯保証人1 雇用形態"],
      ["guarantor.annualIncome", "連帯保証人1 年収"],
      ["guarantor.payday", "連帯保証人1 給料日"],
      ["emergencyContact.name", "氏名"],
      ["emergencyContact.furigana", "フリガナ"],
      ["emergencyContact.gender", "性別"],
      ["emergencyContact.spouse", "配偶者"],
      ["emergencyContact.relationship", "続柄"],
      ["emergencyContact.birthDate", "生年月日"],
      ["emergencyContact.phone", "電話番号"],
      ["emergencyContact.postalCode", "自宅 郵便番号"],
      ["emergencyContact.address", "自宅住所"],
      ["emergencyContact.residenceYears", "居住年数"],
      ["emergencyContact.housingType", "自宅・賃貸"],
      ["emergencyContact.employerName", "勤務先名"],
      ["emergencyContact.employerFurigana", "勤務先フリガナ"],
      ["emergencyContact.employerAddress", "勤務先住所"],
      ["emergencyContact.occupation", "業種"],
      ["emergencyContact.jobType", "職種"],
      ["emergencyContact.employmentType", "雇用形態"],
      ["emergencyContact.annualIncome", "年収"],
      ["emergencyContact.payday", "給料日"],
    ],
  },
  {
    id: "co_occupants",
    label: "同居人",
    fields: [
      ["coOccupants.0.furigana", "同居人1 フリガナ"],
      ["coOccupants.0.name", "同居人1 氏名"],
      ["coOccupants.0.relationship", "同居人1 続柄"],
      ["coOccupants.0.birthDate", "同居人1 生年月日"],
      ["coOccupants.0.phone", "同居人1 電話番号"],
      ["coOccupants.0.employerName", "同居人1 勤務先又は学校名"],
      ["coOccupants.1.furigana", "同居人2 フリガナ"],
      ["coOccupants.1.name", "同居人2 氏名"],
      ["coOccupants.1.relationship", "同居人2 続柄"],
      ["coOccupants.1.birthDate", "同居人2 生年月日"],
      ["coOccupants.1.phone", "同居人2 電話番号"],
      ["coOccupants.1.employerName", "同居人2 勤務先又は学校名"],
      ["coOccupants.2.furigana", "同居人3 フリガナ"],
      ["coOccupants.2.name", "同居人3 氏名"],
      ["coOccupants.2.relationship", "同居人3 続柄"],
      ["coOccupants.2.birthDate", "同居人3 生年月日"],
      ["coOccupants.2.phone", "同居人3 電話番号"],
      ["coOccupants.2.employerName", "同居人3 勤務先又は学校名"],
    ],
  },
  {
    id: "broker_management",
    label: "取扱店・管理会社",
    fields: [
      ["broker.companyName", "取扱店名"],
      ["broker.staffName", "担当者"],
      ["broker.address", "取扱店住所"],
      ["broker.phone", "取扱店電話"],
      ["management.companyName", "管理会社名"],
      ["management.address", "管理会社住所"],
      ["management.phone", "管理会社電話"],
      ["management.staffName", "管理会社担当者"],
    ],
  },
  {
    id: "guarantee_options",
    label: "保証プラン・会社別項目",
    fields: [
      ["guarantee.plan", "保証プラン"],
      ["guarantee.initialFee", "初回保証料"],
      ["guarantee.monthlyFee", "月額保証料"],
      ["guarantee.renewalFee", "更新保証料"],
    ],
  },
] as const;

const COMPANY_OPTION_LABELS: Record<string, string> = {
  "company_option.zenhoren_collection_service": "口座振替・集金代行プラン",
  "company_option.zenhoren_initial_fee": "初回保証委託料",
  "company_option.nihon_safety_product": "商品区分",
  "company_option.nihon_safety_payment_method": "賃料支払方法",
  "company_option.j_lease_product_plan": "Jリース保証プラン",
  "company_option.j_lease_rent_transfer": "家賃送金サービス",
  "company_option.insure_smart_support": "スマートサポートプラン",
  "company_option.insure_single_person": "単身者向け確認項目",
  "company_option.friends_plan_type": "ふれんず保証プラン",
  "company_option.friends_consent": "個人情報同意確認",
  "company_option.friends_collection_agency": "収納代行利用有無",
  "company_option.friends_single_rider": "単身特約有無",
  "company_option.friends_notes": "備考・通信欄",
};

export const FRIENDS_GUARANTEE_DRAFT_FIELD_DEFINITIONS: FriendsGuaranteeDraftFieldDefinition[] = [
  {
    fieldKey: "company_option.friends_plan_type",
    label: "ふれんず保証プラン",
    required: true,
    inputType: "select",
    options: ["住居用標準プラン", "サポート50", "サポート100", "学生", "駐車場プラン", "店舗・事務所プラン", "その他"],
  },
  {
    fieldKey: "company_option.friends_consent",
    label: "個人情報同意確認",
    required: true,
    inputType: "select",
    options: ["確認済み", "未確認"],
  },
  {
    fieldKey: "company_option.friends_collection_agency",
    label: "収納代行利用有無",
    required: false,
    inputType: "select",
    options: ["利用する", "利用しない", "未定"],
  },
  {
    fieldKey: "company_option.friends_single_rider",
    label: "単身特約有無",
    required: false,
    inputType: "select",
    options: ["あり", "なし", "未確認"],
  },
  {
    fieldKey: "company_option.friends_notes",
    label: "備考・通信欄",
    required: false,
    inputType: "textarea",
  },
];

export const GUARANTEE_DRAFT_FIELD_DEFINITIONS_BY_TEMPLATE_ID: Record<string, FriendsGuaranteeDraftFieldDefinition[]> = {
  zenhoren_individual_v1: [
    {
      fieldKey: "company_option.zenhoren_collection_service",
      label: "口座振替・集金代行プラン",
      required: false,
      inputType: "select",
      options: ["利用する", "利用しない", "未定"],
    },
    {
      fieldKey: "company_option.zenhoren_initial_fee",
      label: "初回保証委託料",
      required: false,
      inputType: "select",
      options: ["賃料50%", "賃料80%", "その他"],
    },
  ],
  nihon_safety_individual_v1: [
    {
      fieldKey: "company_option.nihon_safety_product",
      label: "賃貸保証プラン",
      required: false,
      inputType: "select",
      options: ["プラス1（保証人あり）", "パートナー（保証人なし）", "その他"],
    },
    {
      fieldKey: "company_option.nihon_safety_payment_method",
      label: "継続保証料支払方法",
      required: false,
      inputType: "select",
      options: ["月払い", "年払い", "未定"],
    },
  ],
  j_lease_individual_v1: [
    {
      fieldKey: "company_option.j_lease_product_plan",
      label: "Jリース保証プラン",
      required: false,
      inputType: "select",
      options: ["住居用プラン", "事業用プラン", "学生プラン", "その他"],
    },
    {
      fieldKey: "company_option.j_lease_rent_transfer",
      label: "家賃送金サービス",
      required: false,
      inputType: "select",
      options: ["利用する", "利用しない", "未定"],
    },
  ],
  insure_individual_v1: [
    {
      fieldKey: "company_option.insure_smart_support",
      label: "スマートサポートプラン",
      required: false,
      inputType: "select",
      options: ["居住用50", "月額ワイド", "学生", "トータル", "ライフ", "事業用100", "事業用80", "月額保証料プラン", "その他"],
    },
    {
      fieldKey: "company_option.insure_single_person",
      label: "単身者向け確認項目",
      required: false,
      inputType: "select",
      options: ["該当なし", "単身者", "未確認"],
    },
  ],
  friends_guarantee_individual_v1: FRIENDS_GUARANTEE_DRAFT_FIELD_DEFINITIONS,
};

function valueFromCandidate(candidateData: Record<string, unknown>, fieldKey: string): string {
  const value = candidateData[fieldKey];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function valueFromRecord(data: Record<string, unknown>, fieldKey: string): string {
  const value = data[fieldKey];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "確認済み" : "";
  return "";
}

export function getGuaranteeCompanyTemplate(templateId?: string): GuaranteeCompanyTemplate {
  return guaranteeCompanyTemplates.find((template) => template.id === templateId) ?? guaranteeCompanyTemplates[0];
}

export function findGuaranteeCompanyTemplate(templateId?: string): GuaranteeCompanyTemplate | undefined {
  if (!templateId) return undefined;
  return guaranteeCompanyTemplates.find((template) => template.id === templateId);
}

export function buildGuaranteeApplicationFieldValues(input: {
  confirmedDataJson?: Record<string, unknown>;
  draftFieldValuesJson?: Record<string, unknown>;
  fieldKeys: string[];
}): GuaranteeApplicationFieldValue[] {
  const confirmedData = input.confirmedDataJson ?? {};
  const draftData = input.draftFieldValuesJson ?? {};
  const labels = new Map<string, string>();
  GROUP_DEFINITIONS.forEach((group) => {
    group.fields.forEach(([fieldKey, label]) => labels.set(fieldKey, label));
  });
  Object.entries(COMPANY_OPTION_LABELS).forEach(([fieldKey, label]) => labels.set(fieldKey, label));

  return input.fieldKeys.map((fieldKey) => ({
    fieldKey,
    label: labels.get(fieldKey) ?? "確認項目",
    value: getCaseFieldValue(confirmedData, fieldKey) || valueFromRecord(draftData, fieldKey),
  }));
}

export function getGuaranteeDraftFieldDefinitions(templateId?: string): FriendsGuaranteeDraftFieldDefinition[] {
  const resolvedTemplateId = templateId && GUARANTEE_DRAFT_FIELD_DEFINITIONS_BY_TEMPLATE_ID[templateId]
    ? templateId
    : "friends_guarantee_individual_v1";
  return GUARANTEE_DRAFT_FIELD_DEFINITIONS_BY_TEMPLATE_ID[resolvedTemplateId] ?? FRIENDS_GUARANTEE_DRAFT_FIELD_DEFINITIONS;
}

export function buildGuaranteeDraftReadiness(
  draft?: GuaranteeApplicationDraft | null,
  templateId = "friends_guarantee_individual_v1",
): FriendsGuaranteeDraftReadiness {
  const fieldValues = draft?.fieldValuesJson ?? {};
  const fields = getGuaranteeDraftFieldDefinitions(templateId).map((definition) => {
    const value = valueFromRecord(fieldValues, definition.fieldKey);
    return {
      fieldKey: definition.fieldKey,
      label: definition.label,
      required: definition.required,
      status: value ? "available" : "missing",
      value,
      source: value ? "draft" : "not_provided",
    } satisfies GuaranteeReadinessField;
  });
  const readyCount = fields.filter((field) => field.status === "available").length;
  const requiredMissingCount = fields.filter((field) => field.required && field.status !== "available").length;
  return {
    fields,
    readyCount,
    missingCount: fields.filter((field) => field.status === "missing").length,
    requiredMissingCount,
    status: requiredMissingCount === 0 ? "ready" : "draft",
  };
}

export function buildFriendsGuaranteeDraftReadiness(draft?: GuaranteeApplicationDraft | null): FriendsGuaranteeDraftReadiness {
  return buildGuaranteeDraftReadiness(draft, "friends_guarantee_individual_v1");
}

export function buildGuaranteeApplicationReadiness(input: {
  brokerageCase?: BrokerageCase;
  template: GuaranteeCompanyTemplate;
  candidateData?: Record<string, unknown>;
  draft?: GuaranteeApplicationDraft | null;
}): GuaranteeReadinessGroup[] {
  const confirmedData = input.brokerageCase?.confirmedDataJson ?? {};
  const candidateData = input.candidateData ?? {};
  const draftData = input.draft?.fieldValuesJson ?? {};
  const requiredFields = new Set(input.template.requiredFieldKeys);
  const fieldDefinitions = new Map<string, string>();
  GROUP_DEFINITIONS.forEach((group) => {
    group.fields.forEach(([fieldKey, label]) => fieldDefinitions.set(fieldKey, label));
  });
  input.template.companySpecificOptionKeys.forEach((fieldKey) => {
    if (!fieldDefinitions.has(fieldKey)) fieldDefinitions.set(fieldKey, COMPANY_OPTION_LABELS[fieldKey] ?? "会社別確認項目");
  });

  const groups: GuaranteeReadinessGroup[] = GROUP_DEFINITIONS.map((group) => ({
    id: group.id,
    label: group.label,
    fields: group.fields.map(([fieldKey, label]) => {
      const confirmedValue = getCaseFieldValue(confirmedData, fieldKey);
      const candidateValue = valueFromCandidate(candidateData, fieldKey);
      return {
        fieldKey,
        label,
        required: requiredFields.has(fieldKey),
        status: confirmedValue ? "available" : candidateValue ? "needs_confirmation" : "missing",
        value: confirmedValue || candidateValue,
        source: confirmedValue ? "confirmed_case" : candidateValue ? "candidate" : "not_provided",
      } satisfies GuaranteeReadinessField;
    }),
  }));

  const companyOptionFields = input.template.companySpecificOptionKeys.map((fieldKey) => {
    const draftValue = valueFromRecord(draftData, fieldKey);
    const confirmedValue = getCaseFieldValue(confirmedData, fieldKey);
    const candidateValue = valueFromCandidate(candidateData, fieldKey);
    const value = draftValue || confirmedValue || candidateValue;
    return {
      fieldKey,
      label: fieldDefinitions.get(fieldKey) ?? fieldKey,
      required: requiredFields.has(fieldKey),
      status: value ? (draftValue || confirmedValue ? "available" : "needs_confirmation") : "missing",
      value,
      source: draftValue ? "draft" : confirmedValue ? "confirmed_case" : candidateValue ? "candidate" : "not_provided",
    } satisfies GuaranteeReadinessField;
  });
  const guaranteeGroup = groups.find((group) => group.id === "guarantee_options");
  if (guaranteeGroup) guaranteeGroup.fields.push(...companyOptionFields);

  const unresolvedFields = groups.flatMap((group) =>
    group.fields
      .filter((field) => field.required && field.status !== "available")
      .map((field) => ({
        ...field,
        label: `${group.label} / ${field.label}`,
      }))
  );
  groups.push({
    id: "unresolved",
    label: "未入力・要確認",
    fields: unresolvedFields,
  });

  return groups;
}
