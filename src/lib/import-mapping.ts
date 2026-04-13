import type { ImportTargetEntity } from "@/lib/data";
import type { Locale } from "@/lib/locale";

export type ImportFieldOption = {
  key: string;
  label: string;
  required: boolean;
};

const jaImportFieldOptions: Record<ImportTargetEntity, ImportFieldOption[]> = {
  properties: [
    { key: "name", label: "物件名", required: true },
    { key: "address", label: "所在地", required: false },
    { key: "area", label: "エリア", required: false },
    { key: "listing_price", label: "売出価格", required: true },
    { key: "management_fee", label: "管理費", required: false },
    { key: "repair_fee", label: "修繕積立金", required: false },
  ],
  parties: [
    { key: "name", label: "関係者名", required: true },
    { key: "phone", label: "電話", required: true },
    { key: "email", label: "メール", required: false },
    { key: "party_type", label: "関係者種別", required: false },
    { key: "roles", label: "役割タグ", required: false },
    { key: "notes", label: "備考", required: false },
  ],
  contracts: [
    { key: "contract_number", label: "契約番号", required: true },
    { key: "contract_type", label: "契約種別", required: true },
    { key: "property_id", label: "関連物件ID", required: true },
    { key: "party_id", label: "関係者ID", required: true },
    { key: "signed_at", label: "署名日", required: true },
    { key: "status", label: "状態", required: false },
  ],
  service_requests: [
    { key: "title", label: "件名", required: true },
    { key: "property_id", label: "関連物件ID", required: true },
    { key: "party_id", label: "関係者ID", required: false },
    { key: "description", label: "内容", required: false },
    { key: "occurred_at", label: "発生日", required: true },
    { key: "status", label: "状態", required: false },
    { key: "cost", label: "費用", required: false },
  ],
};

const zhImportFieldOptions: Record<ImportTargetEntity, ImportFieldOption[]> = {
  properties: [
    { key: "name", label: "物件名称", required: true },
    { key: "address", label: "地址", required: false },
    { key: "area", label: "区域", required: false },
    { key: "listing_price", label: "挂牌价格", required: true },
    { key: "management_fee", label: "管理费", required: false },
    { key: "repair_fee", label: "修缮基金", required: false },
  ],
  parties: [
    { key: "name", label: "主体名称", required: true },
    { key: "phone", label: "电话", required: true },
    { key: "email", label: "邮箱", required: false },
    { key: "party_type", label: "主体类型", required: false },
    { key: "roles", label: "角色标签", required: false },
    { key: "notes", label: "备注", required: false },
  ],
  contracts: [
    { key: "contract_number", label: "合同编号", required: true },
    { key: "contract_type", label: "合同类型", required: true },
    { key: "property_id", label: "关联物件ID", required: true },
    { key: "party_id", label: "关联主体ID", required: true },
    { key: "signed_at", label: "签署日期", required: true },
    { key: "status", label: "状态", required: false },
  ],
  service_requests: [
    { key: "title", label: "标题", required: true },
    { key: "property_id", label: "关联物件ID", required: true },
    { key: "party_id", label: "关联主体ID", required: false },
    { key: "description", label: "内容", required: false },
    { key: "occurred_at", label: "发生日期", required: true },
    { key: "status", label: "状态", required: false },
    { key: "cost", label: "费用", required: false },
  ],
};

const koImportFieldOptions: Record<ImportTargetEntity, ImportFieldOption[]> = {
  properties: [
    { key: "name", label: "매물명", required: true },
    { key: "address", label: "소재지", required: false },
    { key: "area", label: "지역", required: false },
    { key: "listing_price", label: "매도호가", required: true },
    { key: "management_fee", label: "관리비", required: false },
    { key: "repair_fee", label: "수선적립금", required: false },
  ],
  parties: [
    { key: "name", label: "관계자명", required: true },
    { key: "phone", label: "전화", required: true },
    { key: "email", label: "이메일", required: false },
    { key: "party_type", label: "관계자 유형", required: false },
    { key: "roles", label: "역할 태그", required: false },
    { key: "notes", label: "비고", required: false },
  ],
  contracts: [
    { key: "contract_number", label: "계약 번호", required: true },
    { key: "contract_type", label: "계약 유형", required: true },
    { key: "property_id", label: "연관 매물 ID", required: true },
    { key: "party_id", label: "관계자 ID", required: true },
    { key: "signed_at", label: "서명일", required: true },
    { key: "status", label: "상태", required: false },
  ],
  service_requests: [
    { key: "title", label: "제목", required: true },
    { key: "property_id", label: "연관 매물 ID", required: true },
    { key: "party_id", label: "관계자 ID", required: false },
    { key: "description", label: "내용", required: false },
    { key: "occurred_at", label: "발생일", required: true },
    { key: "status", label: "상태", required: false },
    { key: "cost", label: "비용", required: false },
  ],
};

const importFieldOptionsByLocale: Record<Locale, Record<ImportTargetEntity, ImportFieldOption[]>> = {
  ja: jaImportFieldOptions,
  zh: zhImportFieldOptions,
  ko: koImportFieldOptions,
};

export const importFieldOptions: Record<ImportTargetEntity, ImportFieldOption[]> = jaImportFieldOptions;

export function getImportFieldOptions(locale: Locale): Record<ImportTargetEntity, ImportFieldOption[]>;
export function getImportFieldOptions(locale: Locale, target: ImportTargetEntity): ImportFieldOption[];
export function getImportFieldOptions(locale: Locale, target?: ImportTargetEntity) {
  const table = importFieldOptionsByLocale[locale] ?? importFieldOptionsByLocale.ja;
  if (target) {
    return table[target];
  }
  return table;
}

export function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function buildMappingFromLists(sourceColumns: string[], targetFields: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const max = Math.min(sourceColumns.length, targetFields.length);
  for (let i = 0; i < max; i += 1) {
    const source = sourceColumns[i]?.trim();
    const target = targetFields[i]?.trim();
    if (!source || !target) continue;
    mapping[source] = target;
  }
  return mapping;
}

export function validateImportMapping(target: ImportTargetEntity, mapping: Record<string, string>, locale: Locale = "ja") {
  const options = getImportFieldOptions(locale, target);
  const validTargets = new Set(options.map((item) => item.key));
  const requiredTargets = options.filter((item) => item.required).map((item) => item.key);
  const mappedTargets = new Set(Object.values(mapping));

  const unknownTargets = [...mappedTargets].filter((key) => !validTargets.has(key));
  const missingRequired = requiredTargets.filter((key) => !mappedTargets.has(key));
  const coveredRequiredCount = requiredTargets.length - missingRequired.length;

  const summary = (() => {
    if (missingRequired.length === 0) {
      if (locale === "zh") {
        return `已覆盖必填项（${coveredRequiredCount}/${requiredTargets.length}）`;
      }
      if (locale === "ko") {
        return `필수 항목 충족 (${coveredRequiredCount}/${requiredTargets.length})`;
      }
      return `必須項目を充足（${coveredRequiredCount}/${requiredTargets.length}）`;
    }

    const missingLabels = missingRequired
      .map((key) => options.find((opt) => opt.key === key)?.label ?? key)
      .join(locale === "ko" ? ", " : "、");

    if (locale === "zh") {
      return `必填项缺失（${missingLabels}）`;
    }
    if (locale === "ko") {
      return `필수 항목 누락 (${missingLabels})`;
    }
    return `必須項目が不足（${missingLabels}）`;
  })();

  return {
    summary,
    missingRequired,
    unknownTargets,
    coveredRequiredCount,
    requiredCount: requiredTargets.length,
  };
}

type AliasDictionary = Record<ImportTargetEntity, Record<string, string[]>>;

const fieldAliases: AliasDictionary = {
  properties: {
    name: ["name", "property_name", "物件名", "物件名称", "物件", "매물명", "매물"],
    address: ["address", "所在地", "住所", "所在地住所", "地址", "소재지", "주소"],
    area: ["area", "エリア", "地域", "区域", "지역"],
    listing_price: [
      "listing_price",
      "price",
      "売出価格",
      "価格",
      "販売価格",
      "販売金額",
      "物件価格",
      "挂牌价格",
      "매도호가",
      "매물가격",
    ],
    management_fee: ["management_fee", "管理費", "管理費月額", "管理费", "관리비"],
    repair_fee: ["repair_fee", "修繕積立金", "修繕費", "修繕積立", "修缮基金", "수선적립금", "수선비"],
  },
  parties: {
    name: ["name", "party_name", "氏名", "名前", "主体名", "会社名", "法人名", "主体名称", "주체명"],
    phone: ["phone", "tel", "telephone", "電話", "電話番号", "携帯", "携帯番号", "电话", "핸드폰", "전화"],
    email: ["email", "mail", "メール", "メールアドレス", "邮箱", "이메일"],
    party_type: ["party_type", "type", "主体種別", "種別", "区分", "主体类型", "주체유형", "주체 유형"],
    roles: ["roles", "role", "役割", "ロール", "関係", "角色", "역할", "역할태그", "역할 태그"],
    notes: ["notes", "note", "備考", "メモ", "摘要", "备注", "비고", "메모"],
  },
  contracts: {
    contract_number: ["contract_number", "契約番号", "契約no", "契約番号no", "合同编号", "계약번호", "계약 번호"],
    contract_type: ["contract_type", "契約種別", "契約タイプ", "契約区分", "合同类型", "계약유형", "계약 유형"],
    property_id: ["property_id", "物件id", "物件番号", "物件管理id", "关联物件id", "연관매물id", "연관 매물 id"],
    party_id: ["party_id", "主体id", "契約者id", "顧客id", "关联主体id", "연관주체id", "연관 주체 id"],
    signed_at: ["signed_at", "署名日", "締結日", "契約日", "签署日期", "서명일"],
    status: ["status", "状態", "ステータス", "状态", "상태"],
  },
  service_requests: {
    title: ["title", "件名", "タイトル", "依頼名", "标题", "제목"],
    property_id: ["property_id", "物件id", "物件番号", "关联物件id", "연관매물id", "연관 매물 id"],
    party_id: ["party_id", "主体id", "依頼者id", "顧客id", "关联主体id", "연관주체id", "연관 주체 id"],
    description: ["description", "内容", "詳細", "説明", "설명"],
    occurred_at: ["occurred_at", "発生日", "発生日時", "受付日", "发生日期", "발생일"],
    status: ["status", "状態", "ステータス", "状态", "상태"],
    cost: ["cost", "費用", "金額", "コスト", "费用", "비용"],
  },
};

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[ 　\t\r\n\-_()（）\[\]【】]/g, "");
}

export function suggestImportMapping(target: ImportTargetEntity, sourceColumns: string[]): Record<string, string> {
  const aliases = fieldAliases[target];
  const usedTargets = new Set<string>();
  const mapping: Record<string, string> = {};

  sourceColumns.forEach((raw) => {
    const source = raw.trim();
    if (!source) return;

    const normalized = normalizeHeader(source);
    let matchedTarget: string | undefined;

    for (const [targetField, candidates] of Object.entries(aliases)) {
      if (usedTargets.has(targetField)) continue;
      const matched = candidates.some((alias) => normalizeHeader(alias) === normalized);
      if (matched) {
        matchedTarget = targetField;
        break;
      }
    }

    if (!matchedTarget) {
      const byKey = importFieldOptions[target].find((field) => normalizeHeader(field.key) === normalized);
      if (byKey && !usedTargets.has(byKey.key)) {
        matchedTarget = byKey.key;
      }
    }

    if (matchedTarget) {
      mapping[source] = matchedTarget;
      usedTargets.add(matchedTarget);
    }
  });

  return mapping;
}
