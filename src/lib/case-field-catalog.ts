export type CaseFieldStorageScope = "case_fact" | "output_process" | "template_option";

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
};

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
  group.fields.map((field) => ({
    ...field,
    groupId: group.id,
    groupLabel: group.label,
  })),
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
