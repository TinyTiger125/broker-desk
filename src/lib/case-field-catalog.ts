export type CaseFieldStorageScope = "case_fact" | "output_process" | "template_option";

export type CaseFieldImportance = "core" | "conditional" | "low_frequency" | "output_specific";

export type CaseFieldAppliesWhen =
  | "always"
  | "lease_case"
  | "identity_document_available"
  | "employment_required"
  | "guarantor_required"
  | "emergency_contact_required"
  | "co_occupant_exists"
  | "brokerage_or_management_known"
  | "output_template_selected";

export type CaseFieldValueKind =
  | "text"
  | "textarea"
  | "date"
  | "phone"
  | "email"
  | "postal_code"
  | "money_yen"
  | "money_man_yen"
  | "number"
  | "duration_years"
  | "select"
  | "id_number"
  | "boolean";

export type CaseFieldDefinition = {
  fieldKey: string;
  label: string;
  valueKind: CaseFieldValueKind;
  storageScope: CaseFieldStorageScope;
  aliases?: readonly string[];
  notes?: string;
};

export type CaseFieldGroupDefinition = {
  id: string;
  label: string;
  description: string;
  fields: readonly CaseFieldDefinition[];
};

export type CatalogCaseFieldDefinition = CaseFieldDefinition & {
  groupId: string;
  groupLabel: string;
  treeNodeId: string;
  treePath: readonly string[];
  importance: CaseFieldImportance;
  appliesWhen: CaseFieldAppliesWhen;
  searchAliases: readonly string[];
};

export type CaseInformationTreeNode = {
  id: string;
  label: string;
  children?: readonly CaseInformationTreeNode[];
};

export const CASE_INFORMATION_TREE = [
  {
    id: "case_overview",
    label: "案件概要",
    children: [
      { id: "case_overview_status", label: "取引種別・進行状況" },
      { id: "case_overview_owner", label: "担当・店舗" },
      { id: "case_overview_notes", label: "重要メモ" },
    ],
  },
  {
    id: "participants",
    label: "参加者",
    children: [
      { id: "participants_applicant_basic", label: "申込者・賃借人" },
      { id: "participants_applicant_contact", label: "連絡先" },
      { id: "participants_applicant_current_address", label: "現住所" },
      { id: "participants_co_occupants", label: "同居人・入居者" },
      { id: "participants_emergency_contact", label: "緊急連絡先" },
      { id: "participants_guarantor", label: "連帯保証人" },
    ],
  },
  {
    id: "property",
    label: "物件",
    children: [
      { id: "property_basic", label: "物件基本" },
      { id: "property_address", label: "所在地・郵便番号" },
      { id: "property_room", label: "部屋・号室" },
      { id: "property_management", label: "管理情報" },
    ],
  },
  {
    id: "contract_terms",
    label: "契約条件",
    children: [
      { id: "contract_monthly_fees", label: "月額費用" },
      { id: "contract_initial_fees", label: "初期費用" },
      { id: "contract_dates", label: "日付・契約期間" },
      { id: "contract_payment", label: "支払条件" },
    ],
  },
  {
    id: "employment_income",
    label: "勤務・収入",
    children: [
      { id: "employment_company", label: "勤務先・学校" },
      { id: "employment_role", label: "職業・雇用形態" },
      { id: "employment_income_amount", label: "収入・勤続" },
    ],
  },
  {
    id: "identity_documents",
    label: "本人確認資料",
    children: [
      { id: "identity_type", label: "確認資料種別" },
      { id: "identity_residence_card", label: "在留カード" },
      { id: "identity_driver_license", label: "運転免許証" },
      { id: "identity_insurance", label: "保険証" },
    ],
  },
  {
    id: "related_companies",
    label: "関係会社",
    children: [
      { id: "related_broker", label: "仲介会社" },
      { id: "related_management", label: "管理会社" },
      { id: "related_landlord", label: "貸主" },
    ],
  },
  {
    id: "source_evidence",
    label: "資料來源",
    children: [
      { id: "source_files", label: "アップロード文件" },
      { id: "source_extraction", label: "AI抽出結果" },
      { id: "source_history", label: "手動修正履歴" },
    ],
  },
  {
    id: "output_draft",
    label: "出力専用",
    children: [
      { id: "output_process", label: "申込処理" },
      { id: "output_guarantee_options", label: "保証会社別追加項目" },
    ],
  },
] as const satisfies readonly CaseInformationTreeNode[];

const coOccupantFields = (index: 0 | 1 | 2): readonly CaseFieldDefinition[] => {
  const prefix = `coOccupants.${index}`;
  const labelPrefix = `同居人${index + 1}`;
  return [
    { fieldKey: `${prefix}.furigana`, label: `${labelPrefix} フリガナ`, valueKind: "text", storageScope: "case_fact" },
    { fieldKey: `${prefix}.name`, label: `${labelPrefix} 氏名`, valueKind: "text", storageScope: "case_fact" },
    { fieldKey: `${prefix}.relationship`, label: `${labelPrefix} 続柄`, valueKind: "select", storageScope: "case_fact" },
    { fieldKey: `${prefix}.gender`, label: `${labelPrefix} 性別`, valueKind: "select", storageScope: "case_fact" },
    { fieldKey: `${prefix}.birthDate`, label: `${labelPrefix} 生年月日`, valueKind: "date", storageScope: "case_fact" },
    { fieldKey: `${prefix}.phone`, label: `${labelPrefix} 電話番号`, valueKind: "phone", storageScope: "case_fact" },
    { fieldKey: `${prefix}.employerName`, label: `${labelPrefix} 勤務先又は学校名`, valueKind: "text", storageScope: "case_fact" },
  ];
};

const treePathByNodeId = new Map<string, readonly string[]>();

function indexCaseInformationTree(nodes: readonly CaseInformationTreeNode[], parentPath: readonly string[] = []) {
  nodes.forEach((node) => {
    const nextPath = [...parentPath, node.label];
    treePathByNodeId.set(node.id, nextPath);
    if (node.children) indexCaseInformationTree(node.children, nextPath);
  });
}

indexCaseInformationTree(CASE_INFORMATION_TREE);

function getFieldTreeNodeId(field: CaseFieldDefinition) {
  const key = field.fieldKey;
  if (field.storageScope === "output_process") return "output_process";
  if (field.storageScope === "template_option" || key.startsWith("company_option.") || key.startsWith("guarantee.")) return "output_guarantee_options";

  if (key === "property.roomNumber") return "property_room";
  if (key === "property.postalCode" || key === "property.address") return "property_address";
  if (key.startsWith("property.")) return "property_basic";

  if (["lease.rent", "lease.commonFee", "lease.parkingFee", "lease.waterTownFee", "lease.otherMonthlyFee", "lease.monthlyRentTotal"].includes(key)) {
    return "contract_monthly_fees";
  }
  if (["lease.deposit", "lease.keyMoney", "lease.insuranceFee", "lease.keyExchangeFee", "lease.cancellationDeduction", "lease.initialCostTotal"].includes(key)) {
    return "contract_initial_fees";
  }
  if (["lease.contractType", "lease.contractStartDate", "lease.contractEndDate", "lease.moveInDate"].includes(key)) return "contract_dates";
  if (key.startsWith("lease.")) return "contract_payment";

  if (["applicant.phone", "applicant.mobilePhone", "applicant.homePhone", "applicant.email"].includes(key)) return "participants_applicant_contact";
  if (key.startsWith("applicant.current") || key === "applicant.residenceYears" || key === "applicant.housingType" || key === "applicant.cohabitingFamilyCount") {
    return "participants_applicant_current_address";
  }
  if (key.startsWith("applicant.employer")) return "employment_company";
  if (["applicant.occupation", "applicant.jobType", "applicant.employmentType", "applicant.moveReason"].includes(key)) return "employment_role";
  if (["applicant.annualIncome", "applicant.monthlyIncome", "applicant.yearsEmployed", "applicant.payday"].includes(key)) return "employment_income_amount";
  if (key === "applicant.identityDocumentType") return "identity_type";
  if (key.startsWith("applicant.residence") || key === "applicant.nationality" || key === "applicant.workRestriction") return "identity_residence_card";
  if (key.startsWith("applicant.driverLicense")) return "identity_driver_license";
  if (key === "applicant.healthInsuranceType") return "identity_insurance";
  if (key.startsWith("applicant.")) return "participants_applicant_basic";

  if (key.startsWith("coOccupants.")) return "participants_co_occupants";
  if (key.startsWith("emergencyContact.")) return "participants_emergency_contact";
  if (key.startsWith("guarantor.")) return "participants_guarantor";

  if (key.startsWith("broker.")) return "related_broker";
  if (key.startsWith("management.")) return "related_management";
  if (key.startsWith("landlord.")) return "related_landlord";
  return "case_overview_status";
}

function getFieldAppliesWhen(field: CaseFieldDefinition): CaseFieldAppliesWhen {
  const key = field.fieldKey;
  if (field.storageScope === "output_process" || field.storageScope === "template_option" || key.startsWith("company_option.") || key.startsWith("guarantee.")) {
    return "output_template_selected";
  }
  if (key.startsWith("coOccupants.")) return "co_occupant_exists";
  if (key.startsWith("guarantor.")) return "guarantor_required";
  if (key.startsWith("emergencyContact.")) return "emergency_contact_required";
  if (key.startsWith("broker.") || key.startsWith("management.") || key.startsWith("landlord.")) return "brokerage_or_management_known";
  if (
    key.startsWith("applicant.residence") ||
    key.startsWith("applicant.driverLicense") ||
    key === "applicant.identityDocumentType" ||
    key === "applicant.nationality" ||
    key === "applicant.workRestriction" ||
    key === "applicant.healthInsuranceType"
  ) {
    return "identity_document_available";
  }
  if (key.startsWith("applicant.employer") || key === "applicant.occupation" || key === "applicant.jobType" || key === "applicant.employmentType" || key.endsWith("Income") || key === "applicant.payday" || key === "applicant.yearsEmployed") {
    return "employment_required";
  }
  return "lease_case";
}

function getFieldImportance(field: CaseFieldDefinition): CaseFieldImportance {
  const key = field.fieldKey;
  if (field.storageScope === "output_process" || field.storageScope === "template_option" || key.startsWith("company_option.") || key.startsWith("guarantee.")) return "output_specific";
  if (
    [
      "property.name",
      "property.roomNumber",
      "property.postalCode",
      "property.address",
      "lease.moveInDate",
      "lease.rent",
      "lease.commonFee",
      "lease.monthlyRentTotal",
      "applicant.furigana",
      "applicant.name",
      "applicant.birthDate",
      "applicant.phone",
      "applicant.currentPostalCode",
      "applicant.currentAddress",
      "applicant.employerName",
      "applicant.employerPhone",
      "applicant.employmentType",
      "applicant.annualIncome",
      "emergencyContact.name",
      "emergencyContact.relationship",
      "emergencyContact.phone",
      "broker.companyName",
      "broker.phone",
    ].includes(key)
  ) {
    return "core";
  }
  if (key.includes("HomePage") || key.includes("fax") || key.endsWith(".fax") || key.endsWith("Conditions") || key === "applicant.monthlyIncome" || key.endsWith(".payday")) {
    return "low_frequency";
  }
  return "conditional";
}

const SEARCH_ALIAS_BY_FIELD_KEY: Record<string, readonly string[]> = {
  "property.name": ["物件", "物件名", "房源", "房产", "楼名", "building"],
  "property.roomNumber": ["号室", "部屋", "房号", "房间", "room", "unit"],
  "property.postalCode": ["郵便番号", "邮编", "zip", "postal"],
  "property.address": ["所在地", "住所", "地址", "location"],
  "lease.rent": ["家賃", "賃料", "租金", "rent"],
  "lease.commonFee": ["共益費", "管理費", "管理费", "common fee"],
  "lease.moveInDate": ["入居予定日", "入住日", "move in"],
  "applicant.name": ["申込者", "賃借人", "氏名", "姓名", "客户", "tenant"],
  "applicant.furigana": ["フリガナ", "片假名", "ふりがな", "kana"],
  "applicant.phone": ["電話", "携帯", "手机号", "电话", "mobile"],
  "applicant.email": ["メール", "邮箱", "mail", "email"],
  "applicant.currentPostalCode": ["現住所郵便番号", "现住址邮编", "邮编", "postal"],
  "applicant.currentAddress": ["現住所", "现住址", "住址", "address"],
  "applicant.employerName": ["勤務先", "学校", "工作单位", "公司", "employer"],
  "applicant.employerPhone": ["勤務先電話", "公司电话", "work phone"],
  "applicant.annualIncome": ["年収", "年收入", "income"],
  "emergencyContact.name": ["緊急連絡先", "紧急联系人", "emergency"],
  "guarantor.name": ["連帯保証人", "保证人", "guarantor"],
};

export function getCaseFieldInformation(field: CaseFieldDefinition) {
  const treeNodeId = getFieldTreeNodeId(field);
  const treePath = treePathByNodeId.get(treeNodeId) ?? ["案件概要"];
  const searchAliases = [
    field.fieldKey,
    field.label,
    ...(field.aliases ?? []),
    ...(SEARCH_ALIAS_BY_FIELD_KEY[field.fieldKey] ?? []),
    ...treePath,
  ];
  return {
    treeNodeId,
    treePath,
    importance: getFieldImportance(field),
    appliesWhen: getFieldAppliesWhen(field),
    searchAliases: [...new Set(searchAliases)],
  } as const;
}

export const CASE_FIELD_CATALOG_GROUPS = [
  {
    id: "application_process",
    label: "申込処理",
    description: "申込書の作成日、申込日、出力処理上の情報。通常は案件事実ではなく出力時に決まる。",
    fields: [
      { fieldKey: "application.submittedDate", label: "申込日", valueKind: "date", storageScope: "output_process" },
    ],
  },
  {
    id: "property_lease",
    label: "物件・契約条件",
    description: "保証会社申込書、見積、広告、契約前整理で共通して使う物件と賃貸条件。",
    fields: [
      { fieldKey: "property.furigana", label: "物件フリガナ", valueKind: "text", storageScope: "case_fact", aliases: ["property_furigana", "building_furigana"] },
      { fieldKey: "property.name", label: "物件名", valueKind: "text", storageScope: "case_fact", aliases: ["property_name", "building_name"] },
      { fieldKey: "property.roomNumber", label: "部屋番号・号室", valueKind: "text", storageScope: "case_fact", aliases: ["room_number", "unit_number"] },
      { fieldKey: "property.postalCode", label: "物件郵便番号", valueKind: "postal_code", storageScope: "case_fact", aliases: ["property_postal_code", "postal_code", "zip_code"] },
      { fieldKey: "property.address", label: "物件所在地", valueKind: "textarea", storageScope: "case_fact", aliases: ["property_location", "residential_address", "building_location"] },
      { fieldKey: "property.usage", label: "物件用途", valueKind: "select", storageScope: "case_fact", aliases: ["property_use", "property_usage", "use_type"] },
      { fieldKey: "lease.contractType", label: "契約形態", valueKind: "select", storageScope: "case_fact", aliases: ["contract_type", "lease_contract_type"] },
      { fieldKey: "lease.contractStartDate", label: "契約期間開始日", valueKind: "date", storageScope: "case_fact", aliases: ["contract_start_date"] },
      { fieldKey: "lease.contractEndDate", label: "契約期間終了日", valueKind: "date", storageScope: "case_fact", aliases: ["contract_end_date"] },
      { fieldKey: "lease.moveInDate", label: "入居予定日", valueKind: "date", storageScope: "case_fact", aliases: ["move_in_date", "move_in_planned_date"] },
      { fieldKey: "lease.rent", label: "賃料・家賃", valueKind: "money_yen", storageScope: "case_fact", aliases: ["rent", "monthly_rent"] },
      { fieldKey: "lease.commonFee", label: "共益費・管理費", valueKind: "money_yen", storageScope: "case_fact", aliases: ["common_fee", "management_fee"] },
      { fieldKey: "lease.parkingFee", label: "駐車場代", valueKind: "money_yen", storageScope: "case_fact", aliases: ["parking_fee"] },
      { fieldKey: "lease.waterTownFee", label: "水道料・町費", valueKind: "money_yen", storageScope: "case_fact", aliases: ["water_town_fee", "water_fee", "town_fee"] },
      { fieldKey: "lease.otherMonthlyFee", label: "その他月額費用", valueKind: "money_yen", storageScope: "case_fact", aliases: ["other_monthly_fee"] },
      { fieldKey: "lease.monthlyRentTotal", label: "月額賃料合計", valueKind: "money_yen", storageScope: "case_fact", aliases: ["monthly_rent_total", "rent_total"] },
      { fieldKey: "lease.deposit", label: "敷金・保証金", valueKind: "money_yen", storageScope: "case_fact", aliases: ["deposit", "security_deposit"] },
      { fieldKey: "lease.keyMoney", label: "礼金", valueKind: "money_yen", storageScope: "case_fact", aliases: ["key_money"] },
      { fieldKey: "lease.insuranceFee", label: "保険料", valueKind: "money_yen", storageScope: "case_fact", aliases: ["insurance_fee"] },
      { fieldKey: "lease.keyExchangeFee", label: "鍵交換代", valueKind: "money_yen", storageScope: "case_fact", aliases: ["key_exchange_fee"] },
      { fieldKey: "lease.cancellationDeduction", label: "敷引・解約引", valueKind: "money_yen", storageScope: "case_fact", aliases: ["cancellation_deduction"] },
      { fieldKey: "lease.initialCostTotal", label: "初回費用合計", valueKind: "money_yen", storageScope: "case_fact", aliases: ["initial_cost_total"] },
      { fieldKey: "lease.paymentMethod", label: "賃料支払方法", valueKind: "select", storageScope: "case_fact", aliases: ["rent_payment_method"] },
      { fieldKey: "lease.rentPaymentDay", label: "賃料支払日", valueKind: "number", storageScope: "case_fact", aliases: ["rent_payment_day"] },
    ],
  },
  {
    id: "applicant",
    label: "申込者・賃借人",
    description: "申込者本人の基本情報、現住所、連絡先、現在住居。",
    fields: [
      { fieldKey: "applicant.furigana", label: "フリガナ", valueKind: "text", storageScope: "case_fact", aliases: ["buyer_furigana", "tenant_furigana"] },
      { fieldKey: "applicant.name", label: "氏名", valueKind: "text", storageScope: "case_fact", aliases: ["buyer_name", "tenant_name"] },
      { fieldKey: "applicant.gender", label: "性別", valueKind: "select", storageScope: "case_fact", aliases: ["tenant_gender"] },
      { fieldKey: "applicant.spouse", label: "配偶者", valueKind: "select", storageScope: "case_fact", aliases: ["tenant_spouse"] },
      { fieldKey: "applicant.birthDate", label: "生年月日", valueKind: "date", storageScope: "case_fact", aliases: ["buyer_birth_date", "tenant_birth_date"] },
      { fieldKey: "applicant.phone", label: "代表電話番号", valueKind: "phone", storageScope: "case_fact", aliases: ["buyer_phone", "tenant_phone", "mobile_phone"] },
      { fieldKey: "applicant.mobilePhone", label: "携帯電話", valueKind: "phone", storageScope: "case_fact", aliases: ["applicant_mobile_phone"] },
      { fieldKey: "applicant.homePhone", label: "自宅電話", valueKind: "phone", storageScope: "case_fact", aliases: ["applicant_home_phone"] },
      { fieldKey: "applicant.email", label: "メール", valueKind: "email", storageScope: "case_fact", aliases: ["buyer_email", "tenant_email"] },
      { fieldKey: "applicant.currentPostalCode", label: "現住所 郵便番号", valueKind: "postal_code", storageScope: "case_fact", aliases: ["applicant_current_postal_code", "buyer_postal_code", "tenant_postal_code"] },
      { fieldKey: "applicant.currentAddress", label: "現住所", valueKind: "textarea", storageScope: "case_fact", aliases: ["buyer_address", "tenant_address"] },
      { fieldKey: "applicant.nationality", label: "国籍", valueKind: "text", storageScope: "case_fact", aliases: ["nationality"] },
      { fieldKey: "applicant.residenceYears", label: "居住年数", valueKind: "duration_years", storageScope: "case_fact", aliases: ["residence_years"] },
      { fieldKey: "applicant.housingType", label: "現住居区分", valueKind: "select", storageScope: "case_fact", aliases: ["housing_type"] },
      { fieldKey: "applicant.currentRent", label: "現家賃", valueKind: "money_yen", storageScope: "case_fact", aliases: ["current_rent"] },
      { fieldKey: "applicant.cohabitingFamilyCount", label: "同居家族人数", valueKind: "number", storageScope: "case_fact", aliases: ["cohabiting_family_count"] },
    ],
  },
  {
    id: "identity_document",
    label: "本人確認資料",
    description: "在留カード、運転免許証、本人確認資料から入る情報。",
    fields: [
      { fieldKey: "applicant.identityDocumentType", label: "確認資料種別", valueKind: "select", storageScope: "case_fact", aliases: ["identity_document_type"] },
      { fieldKey: "applicant.residenceStatus", label: "在留資格", valueKind: "text", storageScope: "case_fact", aliases: ["residence_status"] },
      { fieldKey: "applicant.residencePeriod", label: "在留期間", valueKind: "text", storageScope: "case_fact", aliases: ["residence_period"] },
      { fieldKey: "applicant.residenceCardExpiry", label: "在留カード有効期限", valueKind: "date", storageScope: "case_fact", aliases: ["residence_card_expiry"] },
      { fieldKey: "applicant.residenceCardNumber", label: "在留カード番号", valueKind: "id_number", storageScope: "case_fact", aliases: ["residence_card_number"] },
      { fieldKey: "applicant.workRestriction", label: "就労制限", valueKind: "select", storageScope: "case_fact", aliases: ["work_restriction"] },
      { fieldKey: "applicant.driverLicenseNumber", label: "免許証番号", valueKind: "id_number", storageScope: "case_fact", aliases: ["driver_license_number", "applicant_license_number"] },
      { fieldKey: "applicant.driverLicenseExpiry", label: "免許証有効期限", valueKind: "date", storageScope: "case_fact", aliases: ["driver_license_expiry"] },
      { fieldKey: "applicant.driverLicenseConditions", label: "免許条件", valueKind: "textarea", storageScope: "case_fact", aliases: ["driver_license_conditions"] },
      { fieldKey: "applicant.healthInsuranceType", label: "保険証種類", valueKind: "select", storageScope: "case_fact", aliases: ["health_insurance_type"] },
    ],
  },
  {
    id: "employment_income",
    label: "勤務先・収入",
    description: "申込者の勤務先、学校、収入、雇用形態、転居理由。",
    fields: [
      { fieldKey: "applicant.employerFurigana", label: "勤務先フリガナ", valueKind: "text", storageScope: "case_fact", aliases: ["employer_furigana", "workplace_furigana"] },
      { fieldKey: "applicant.employerName", label: "勤務先名・学校名", valueKind: "text", storageScope: "case_fact", aliases: ["employer_name", "workplace_name", "school_name"] },
      { fieldKey: "applicant.employerDepartment", label: "部署", valueKind: "text", storageScope: "case_fact", aliases: ["employer_department", "department"] },
      { fieldKey: "applicant.employerPhone", label: "勤務先電話", valueKind: "phone", storageScope: "case_fact", aliases: ["employer_phone", "workplace_phone"] },
      { fieldKey: "applicant.employerPostalCode", label: "勤務先 郵便番号", valueKind: "postal_code", storageScope: "case_fact", aliases: ["applicant_employer_postal_code", "employer_postal_code", "workplace_postal_code"] },
      { fieldKey: "applicant.employerAddress", label: "勤務先住所", valueKind: "textarea", storageScope: "case_fact", aliases: ["employer_address", "workplace_address"] },
      { fieldKey: "applicant.employerHomePage", label: "勤務先ホームページ", valueKind: "text", storageScope: "case_fact", aliases: ["employer_homepage", "workplace_homepage"] },
      { fieldKey: "applicant.occupation", label: "業種", valueKind: "text", storageScope: "case_fact", aliases: ["occupation", "industry"] },
      { fieldKey: "applicant.jobType", label: "職種", valueKind: "text", storageScope: "case_fact", aliases: ["job_type"] },
      { fieldKey: "applicant.employmentType", label: "雇用形態", valueKind: "select", storageScope: "case_fact", aliases: ["employment_type"] },
      { fieldKey: "applicant.annualIncome", label: "年収", valueKind: "money_man_yen", storageScope: "case_fact", aliases: ["annual_income"] },
      { fieldKey: "applicant.monthlyIncome", label: "月収", valueKind: "money_man_yen", storageScope: "case_fact", aliases: ["monthly_income"] },
      { fieldKey: "applicant.yearsEmployed", label: "勤続年数", valueKind: "duration_years", storageScope: "case_fact", aliases: ["years_employed"] },
      { fieldKey: "applicant.payday", label: "給料日・収入日", valueKind: "number", storageScope: "case_fact", aliases: ["payday", "income_day"] },
      { fieldKey: "applicant.moveReason", label: "転居理由", valueKind: "select", storageScope: "case_fact", aliases: ["move_reason"] },
    ],
  },
  {
    id: "guarantor",
    label: "連帯保証人",
    description: "連帯保証人予定者。テンプレートによって緊急連絡先と兼用されることがある。",
    fields: [
      { fieldKey: "guarantor.furigana", label: "連帯保証人1 フリガナ", valueKind: "text", storageScope: "case_fact" },
      { fieldKey: "guarantor.name", label: "連帯保証人1 氏名", valueKind: "text", storageScope: "case_fact" },
      { fieldKey: "guarantor.gender", label: "連帯保証人1 性別", valueKind: "select", storageScope: "case_fact" },
      { fieldKey: "guarantor.spouse", label: "連帯保証人1 配偶者", valueKind: "select", storageScope: "case_fact" },
      { fieldKey: "guarantor.relationship", label: "連帯保証人1 続柄", valueKind: "select", storageScope: "case_fact" },
      { fieldKey: "guarantor.birthDate", label: "連帯保証人1 生年月日", valueKind: "date", storageScope: "case_fact" },
      { fieldKey: "guarantor.driverLicenseNumber", label: "連帯保証人1 免許証番号", valueKind: "id_number", storageScope: "case_fact", aliases: ["guarantor_driver_license_number"] },
      { fieldKey: "guarantor.postalCode", label: "連帯保証人1 自宅郵便番号", valueKind: "postal_code", storageScope: "case_fact", aliases: ["guarantor_postal_code"] },
      { fieldKey: "guarantor.address", label: "連帯保証人1 自宅住所", valueKind: "textarea", storageScope: "case_fact" },
      { fieldKey: "guarantor.phone", label: "連帯保証人1 代表電話", valueKind: "phone", storageScope: "case_fact" },
      { fieldKey: "guarantor.mobilePhone", label: "連帯保証人1 携帯電話", valueKind: "phone", storageScope: "case_fact", aliases: ["guarantor_mobile_phone"] },
      { fieldKey: "guarantor.homePhone", label: "連帯保証人1 自宅電話", valueKind: "phone", storageScope: "case_fact", aliases: ["guarantor_home_phone"] },
      { fieldKey: "guarantor.residenceYears", label: "連帯保証人1 居住年数", valueKind: "duration_years", storageScope: "case_fact" },
      { fieldKey: "guarantor.housingType", label: "連帯保証人1 自宅・賃貸", valueKind: "select", storageScope: "case_fact" },
      { fieldKey: "guarantor.employerFurigana", label: "連帯保証人1 勤務先フリガナ", valueKind: "text", storageScope: "case_fact" },
      { fieldKey: "guarantor.employerName", label: "連帯保証人1 勤務先名", valueKind: "text", storageScope: "case_fact" },
      { fieldKey: "guarantor.employerPhone", label: "連帯保証人1 勤務先電話", valueKind: "phone", storageScope: "case_fact" },
      { fieldKey: "guarantor.employerAddress", label: "連帯保証人1 勤務先住所", valueKind: "textarea", storageScope: "case_fact" },
      { fieldKey: "guarantor.occupation", label: "連帯保証人1 業種", valueKind: "text", storageScope: "case_fact" },
      { fieldKey: "guarantor.jobType", label: "連帯保証人1 職種", valueKind: "text", storageScope: "case_fact" },
      { fieldKey: "guarantor.employmentType", label: "連帯保証人1 雇用形態", valueKind: "select", storageScope: "case_fact" },
      { fieldKey: "guarantor.annualIncome", label: "連帯保証人1 年収", valueKind: "money_man_yen", storageScope: "case_fact" },
      { fieldKey: "guarantor.yearsEmployed", label: "連帯保証人1 勤続年数", valueKind: "duration_years", storageScope: "case_fact" },
      { fieldKey: "guarantor.payday", label: "連帯保証人1 給料日", valueKind: "number", storageScope: "case_fact" },
    ],
  },
  {
    id: "emergency_contact",
    label: "緊急連絡先",
    description: "緊急連絡先。保証人欄と兼用される表では役割を別途判定する。",
    fields: [
      { fieldKey: "emergencyContact.furigana", label: "緊急連絡先 フリガナ", valueKind: "text", storageScope: "case_fact", aliases: ["emergency_contact_furigana"] },
      { fieldKey: "emergencyContact.name", label: "緊急連絡先 氏名", valueKind: "text", storageScope: "case_fact", aliases: ["guarantor_name", "emergency_contact_name"] },
      { fieldKey: "emergencyContact.gender", label: "緊急連絡先 性別", valueKind: "select", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.spouse", label: "緊急連絡先 配偶者", valueKind: "select", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.relationship", label: "緊急連絡先 続柄", valueKind: "select", storageScope: "case_fact", aliases: ["guarantor_relationship", "emergency_contact_relationship"] },
      { fieldKey: "emergencyContact.birthDate", label: "緊急連絡先 生年月日", valueKind: "date", storageScope: "case_fact", aliases: ["guarantor_birth_date", "emergency_contact_birth_date"] },
      { fieldKey: "emergencyContact.driverLicenseNumber", label: "緊急連絡先 免許証番号", valueKind: "id_number", storageScope: "case_fact", aliases: ["emergency_contact_driver_license_number"] },
      { fieldKey: "emergencyContact.postalCode", label: "緊急連絡先 自宅郵便番号", valueKind: "postal_code", storageScope: "case_fact", aliases: ["emergency_contact_postal_code"] },
      { fieldKey: "emergencyContact.address", label: "緊急連絡先 自宅住所", valueKind: "textarea", storageScope: "case_fact", aliases: ["guarantor_address", "emergency_contact_address"] },
      { fieldKey: "emergencyContact.phone", label: "緊急連絡先 代表電話", valueKind: "phone", storageScope: "case_fact", aliases: ["guarantor_phone", "emergency_contact_phone"] },
      { fieldKey: "emergencyContact.mobilePhone", label: "緊急連絡先 携帯電話", valueKind: "phone", storageScope: "case_fact", aliases: ["emergency_contact_mobile_phone"] },
      { fieldKey: "emergencyContact.homePhone", label: "緊急連絡先 自宅電話", valueKind: "phone", storageScope: "case_fact", aliases: ["emergency_contact_home_phone"] },
      { fieldKey: "emergencyContact.residenceYears", label: "緊急連絡先 居住年数", valueKind: "duration_years", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.housingType", label: "緊急連絡先 自宅・賃貸", valueKind: "select", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.employerFurigana", label: "緊急連絡先 勤務先フリガナ", valueKind: "text", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.employerName", label: "緊急連絡先 勤務先名", valueKind: "text", storageScope: "case_fact", aliases: ["guarantor_employer_name"] },
      { fieldKey: "emergencyContact.employerPhone", label: "緊急連絡先 勤務先電話", valueKind: "phone", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.employerAddress", label: "緊急連絡先 勤務先住所", valueKind: "textarea", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.occupation", label: "緊急連絡先 業種", valueKind: "text", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.jobType", label: "緊急連絡先 職種", valueKind: "text", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.employmentType", label: "緊急連絡先 雇用形態", valueKind: "select", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.annualIncome", label: "緊急連絡先 年収", valueKind: "money_man_yen", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.yearsEmployed", label: "緊急連絡先 勤続年数", valueKind: "duration_years", storageScope: "case_fact" },
      { fieldKey: "emergencyContact.payday", label: "緊急連絡先 給料日", valueKind: "number", storageScope: "case_fact" },
    ],
  },
  {
    id: "co_occupants",
    label: "同居人・入居者",
    description: "テンプレート容量に合わせて最大3名を標準扱いする。",
    fields: [...coOccupantFields(0), ...coOccupantFields(1), ...coOccupantFields(2)],
  },
  {
    id: "broker_management",
    label: "仲介会社・管理会社",
    description: "協定会社、仲介会社、管理会社、取扱店情報。",
    fields: [
      { fieldKey: "broker.companyName", label: "協定会社・取扱店名", valueKind: "text", storageScope: "case_fact", aliases: ["broker_a_company_name", "broker_b_company_name"] },
      { fieldKey: "broker.branchName", label: "支店名", valueKind: "text", storageScope: "case_fact", aliases: ["broker_branch_name"] },
      { fieldKey: "broker.staffName", label: "担当者", valueKind: "text", storageScope: "case_fact", aliases: ["agent_a_name", "agent_b_name"] },
      { fieldKey: "broker.phone", label: "協定会社・取扱店TEL", valueKind: "phone", storageScope: "case_fact", aliases: ["broker_a_phone", "broker_b_phone"] },
      { fieldKey: "broker.fax", label: "協定会社・取扱店FAX", valueKind: "phone", storageScope: "case_fact", aliases: ["broker_a_fax", "broker_b_fax"] },
      { fieldKey: "broker.address", label: "協定会社・取扱店住所", valueKind: "textarea", storageScope: "case_fact", aliases: ["broker_address"] },
      { fieldKey: "broker.agentCompanyName", label: "仲介会社名", valueKind: "text", storageScope: "case_fact", aliases: ["agent_company_name"] },
      { fieldKey: "broker.agentPhone", label: "仲介会社TEL", valueKind: "phone", storageScope: "case_fact", aliases: ["agent_phone"] },
      { fieldKey: "broker.agentFax", label: "仲介会社FAX", valueKind: "phone", storageScope: "case_fact", aliases: ["agent_fax"] },
      { fieldKey: "management.companyName", label: "管理会社名", valueKind: "text", storageScope: "case_fact", aliases: ["management_company_name"] },
      { fieldKey: "management.address", label: "管理会社住所", valueKind: "textarea", storageScope: "case_fact", aliases: ["management_address"] },
      { fieldKey: "management.phone", label: "管理会社電話", valueKind: "phone", storageScope: "case_fact", aliases: ["management_phone"] },
      { fieldKey: "management.staffName", label: "管理会社担当者", valueKind: "text", storageScope: "case_fact", aliases: ["management_staff_name"] },
      { fieldKey: "landlord.name", label: "賃貸人・貸主名", valueKind: "text", storageScope: "case_fact", aliases: ["landlord_name"] },
      { fieldKey: "landlord.address", label: "賃貸人住所", valueKind: "textarea", storageScope: "case_fact", aliases: ["landlord_address"] },
    ],
  },
  {
    id: "guarantee_options",
    label: "保証プラン・会社別項目",
    description: "全社共通に近い保証条件と、会社ごとの選択肢。",
    fields: [
      { fieldKey: "guarantee.plan", label: "保証プラン", valueKind: "select", storageScope: "template_option", aliases: ["guarantee_plan"] },
      { fieldKey: "guarantee.initialFee", label: "初回保証料", valueKind: "money_yen", storageScope: "template_option", aliases: ["initial_guarantee_fee"] },
      { fieldKey: "guarantee.monthlyFee", label: "月額保証料", valueKind: "money_yen", storageScope: "template_option", aliases: ["monthly_guarantee_fee"] },
      { fieldKey: "guarantee.renewalFee", label: "更新保証料", valueKind: "money_yen", storageScope: "template_option", aliases: ["renewal_guarantee_fee"] },
      { fieldKey: "company_option.zenhoren_collection_service", label: "全保連 口座振替・集金代行", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.zenhoren_initial_fee", label: "全保連 初回保証委託料", valueKind: "money_yen", storageScope: "template_option" },
      { fieldKey: "company_option.nihon_safety_product", label: "日本セーフティー 商品区分", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.nihon_safety_payment_method", label: "日本セーフティー 賃料支払方法", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.j_lease_product_plan", label: "Jリース 保証プラン", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.j_lease_rent_transfer", label: "Jリース 家賃送金サービス", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.insure_smart_support", label: "インシュア スマートサポートプラン", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.insure_single_person", label: "インシュア 単身者確認", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.friends_plan_type", label: "ふれんず保証プラン", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.friends_consent", label: "ふれんず 個人情報同意確認", valueKind: "boolean", storageScope: "template_option" },
      { fieldKey: "company_option.friends_collection_agency", label: "ふれんず 収納代行", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.friends_single_rider", label: "ふれんず 単身特約", valueKind: "select", storageScope: "template_option" },
      { fieldKey: "company_option.friends_notes", label: "ふれんず 通信欄", valueKind: "textarea", storageScope: "template_option" },
    ],
  },
] as const satisfies readonly CaseFieldGroupDefinition[];

export const CASE_FIELD_DEFINITIONS: readonly CatalogCaseFieldDefinition[] = CASE_FIELD_CATALOG_GROUPS.flatMap((group) =>
  group.fields.map((field) => {
    const information = getCaseFieldInformation(field);
    return {
      ...field,
      ...information,
      groupId: group.id,
      groupLabel: group.label,
    };
  }),
);

export const CASE_FIELD_KEYS = CASE_FIELD_DEFINITIONS.map((field) => field.fieldKey);

export const CASE_FIELD_KEY_SET = new Set<string>(CASE_FIELD_KEYS);

export const CASE_FIELD_LABEL_BY_KEY = Object.fromEntries(
  CASE_FIELD_DEFINITIONS.map((field) => [field.fieldKey, field.label]),
);

export const CASE_FIELD_ALIASES = Object.fromEntries(
  CASE_FIELD_DEFINITIONS.map((field) => [field.fieldKey, [field.fieldKey, ...(field.aliases ?? [])]]),
);

export function isKnownCaseFieldKey(fieldKey: string): boolean {
  return CASE_FIELD_KEY_SET.has(fieldKey);
}

export function getCaseFieldDefinition(fieldKey: string) {
  return CASE_FIELD_DEFINITIONS.find((field) => field.fieldKey === fieldKey);
}

export function getCaseFieldLabel(fieldKey: string): string {
  return CASE_FIELD_LABEL_BY_KEY[fieldKey] ?? fieldKey;
}
