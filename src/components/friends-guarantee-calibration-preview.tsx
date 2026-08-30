"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { FriendsCustomOverlayField, FriendsOverlayField, FriendsOverlayLayoutOverrides } from "@/lib/friends-guarantee-pdf";
import { getFriendsOverlayEstimatedTextFit } from "@/lib/friends-guarantee-fit";

type PageSize = {
  width: number;
  height: number;
};

type DragMode = "move" | "resize-width" | "resize-size";

type OverlayBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragState = {
  fieldKey: string;
  mode: DragMode;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startBox: OverlayBox;
  groupFieldKeys?: string[];
  groupStartBoxes?: Record<string, OverlayBox>;
};

type AlignmentGuide = {
  axis: "x" | "y";
  position: number;
  label: "left" | "center" | "right" | "top" | "middle" | "bottom";
};

type FieldMatchCandidate = {
  sourceFieldKey: string;
  label: string;
  box: OverlayBox;
  valueFormat?: FriendsOverlayField["valueFormat"];
  valuePart?: FriendsOverlayField["valuePart"];
  align?: FriendsOverlayField["align"];
  segmentCells?: number;
  scoreBoost?: number;
};

type FieldMatchSuggestion = {
  customFieldKey: string;
  sourceFieldKey: string;
  label?: string;
  valueFormat?: FriendsOverlayField["valueFormat"];
  valuePart?: FriendsOverlayField["valuePart"];
  align?: FriendsOverlayField["align"];
  segmentCells?: number;
  confidence?: number;
  reason?: string;
};

type LayoutSaveScope = "case" | "template";

const SNAP_THRESHOLD = 2.5;
const CUSTOM_SEGMENT_DEFAULT: NonNullable<FriendsOverlayField["segment"]> = { mode: "digits", cells: 7, align: "left" };
const INLINE_COPY_GAP = 6;
const BOX_NUMBER_STEP = 0.5;
const CUSTOM_FONT_SIZE_MIN = 5;
const CUSTOM_FONT_SIZE_MAX = 18;
const CUSTOM_FONT_SIZE_STEP = 0.5;

type FieldBindingOption = {
  fieldKey: string;
  label: string;
  value: string;
  groupId?: string;
  groupLabel?: string;
  valueKind?: string;
  storageScope?: string;
};

function isMoneyLikeBinding(option?: FieldBindingOption) {
  return option?.valueKind === "money_yen" || option?.valueKind === "money_man_yen";
}

function normalizeSegmentForBinding(
  option: FieldBindingOption | undefined,
  segment: FriendsOverlayField["segment"],
): FriendsOverlayField["segment"] {
  if (!segment || !isMoneyLikeBinding(option)) return segment;
  return {
    ...segment,
    mode: "amount",
    align: "right",
  };
}

type BindingSection = {
  id: string;
  label: string;
  fieldKeys?: readonly string[];
  prefixes?: readonly string[];
};

type BindingTemplateGroup = {
  id: string;
  label: string;
  initialSectionId: string;
  sections: readonly BindingSection[];
};

const TEMPLATE_BINDING_GROUPS: readonly BindingTemplateGroup[] = [
  {
    id: "zenhoren_individual_v1",
    label: "1 全保連",
    initialSectionId: "broker",
    sections: [
      { id: "broker", label: "協定会社/仲介会社", prefixes: ["broker.", "management."] },
      { id: "dates", label: "申込日/入居日", fieldKeys: ["lease.moveInDate"] },
      { id: "property", label: "物件内容/代理店記入欄", prefixes: ["property.", "lease.", "guarantee.plan", "company_option.zenhoren_"] },
      { id: "applicant", label: "申込者・賃借人", prefixes: ["applicant."] },
      { id: "co_occupants", label: "同居者", prefixes: ["coOccupants."] },
      { id: "guarantor", label: "連帯保証人/緊急連絡先", prefixes: ["guarantor.", "emergencyContact."] },
      { id: "all", label: "この表の全項目" },
      { id: "other", label: "その他/未分類" },
    ],
  },
  {
    id: "nihon_safety_individual_v1",
    label: "2 日本セーフティー",
    initialSectionId: "applicant",
    sections: [
      { id: "applicant", label: "お申込者記入欄", prefixes: ["applicant."] },
      { id: "employment", label: "勤務先情報", prefixes: ["applicant.employer", "applicant.occupation", "applicant.jobType", "applicant.employmentType", "applicant.annualIncome", "applicant.yearsEmployed", "applicant.payday"] },
      { id: "property", label: "取扱店記入欄/物件", prefixes: ["property.", "lease.", "broker.", "management."] },
      { id: "co_occupants", label: "入居者", prefixes: ["coOccupants."] },
      { id: "contact", label: "緊急連絡先", prefixes: ["emergencyContact.", "guarantor."] },
      { id: "options", label: "商品/支払方法", prefixes: ["company_option.nihon_safety_"] },
      { id: "all", label: "この表の全項目" },
      { id: "other", label: "その他/未分類" },
    ],
  },
  {
    id: "j_lease_individual_v1",
    label: "3 Jリース",
    initialSectionId: "applicant",
    sections: [
      { id: "applicant", label: "申込者・賃借人", prefixes: ["applicant.name", "applicant.furigana", "applicant.gender", "applicant.spouse", "applicant.birthDate", "applicant.phone", "applicant.homePhone", "applicant.mobilePhone", "applicant.email", "applicant.current", "applicant.residence", "applicant.housing", "applicant.driverLicense"] },
      { id: "employment", label: "勤務先・収入", prefixes: ["applicant.employer", "applicant.occupation", "applicant.jobType", "applicant.employmentType", "applicant.annualIncome", "applicant.yearsEmployed", "applicant.payday", "applicant.moveReason"] },
      { id: "business_use", label: "物件利用業態/事業内容", prefixes: ["company_option.j_lease_", "guarantee.plan"] },
      { id: "co_occupants", label: "事業用申込/同居人", prefixes: ["coOccupants."] },
      { id: "contact", label: "緊急連絡先", prefixes: ["emergencyContact."] },
      { id: "guarantor", label: "連帯保証人予定者", prefixes: ["guarantor."] },
      { id: "property", label: "申込日/入居予定日/物件・賃料", prefixes: ["property.", "lease.", "broker.", "management."] },
      { id: "all", label: "この表の全項目" },
      { id: "other", label: "その他/未分類" },
    ],
  },
  {
    id: "insure_individual_v1",
    label: "4 インシュア",
    initialSectionId: "applicant",
    sections: [
      { id: "applicant", label: "申込者", prefixes: ["applicant.name", "applicant.furigana", "applicant.gender", "applicant.spouse", "applicant.birthDate", "applicant.phone", "applicant.email", "applicant.current", "applicant.residence", "applicant.housing"] },
      { id: "employment", label: "勤務先", prefixes: ["applicant.employer", "applicant.occupation", "applicant.jobType", "applicant.employmentType", "applicant.annualIncome", "applicant.yearsEmployed", "applicant.payday"] },
      { id: "property", label: "物件/賃料", prefixes: ["property.", "lease."] },
      { id: "co_occupants", label: "同居者", prefixes: ["coOccupants."] },
      { id: "contact", label: "緊急連絡先/保証人", prefixes: ["emergencyContact.", "guarantor."] },
      { id: "options", label: "プラン/確認項目", prefixes: ["company_option.insure_", "guarantee.plan", "broker.", "management."] },
      { id: "all", label: "この表の全項目" },
      { id: "other", label: "その他/未分類" },
    ],
  },
  {
    id: "friends_guarantee_individual_v1",
    label: "5 ふれんず保証",
    initialSectionId: "property",
    sections: [
      { id: "property", label: "物件内容", prefixes: ["property.", "lease.", "guarantee.plan"] },
      { id: "applicant", label: "申込者・賃借人", prefixes: ["applicant."] },
      { id: "co_occupants", label: "入居者", prefixes: ["coOccupants."] },
      { id: "guarantor", label: "連帯保証人", prefixes: ["guarantor."] },
      { id: "contact", label: "緊急連絡先", prefixes: ["emergencyContact."] },
      { id: "broker", label: "仲介会社/管理会社", prefixes: ["broker.", "management."] },
      { id: "all", label: "この表の全項目" },
      { id: "other", label: "その他/未分類" },
    ],
  },
];

type FieldBindingKind = "address" | "date" | "duration" | "phone" | "postal" | "text";
type ValueFormatKind = "address" | "date" | "duration" | "phone" | "raw";

const VALUE_FORMAT_OPTIONS: Array<{ value: NonNullable<FriendsOverlayField["valueFormat"]> | ""; label: string }> = [
  { value: "", label: "そのまま" },
  { value: "dateYmd", label: "日付 年 月 日" },
  { value: "dateYmdShort", label: "日付 YY M D" },
  { value: "dateMd", label: "日付 M月D日" },
  { value: "dateMdWithoutDaySuffix", label: "日付 M月D" },
  { value: "dateDigitsYmd", label: "日付 8桁" },
  { value: "dateYear", label: "日付 年だけ" },
  { value: "dateYearShort", label: "日付 年だけ(下2桁)" },
  { value: "dateMonth", label: "日付 月だけ" },
  { value: "dateDay", label: "日付 日だけ" },
  { value: "phoneDigits", label: "電話 数字のみ" },
  { value: "phonePart1", label: "電話 前段" },
  { value: "phonePart2", label: "電話 中段" },
  { value: "phonePart3", label: "電話 後段" },
  { value: "durationYears", label: "年数だけ" },
  { value: "addressPrefecture", label: "住所 都道府県" },
  { value: "addressMunicipality", label: "住所 市区町村" },
  { value: "addressStreet", label: "住所 町名番地（市区町村以降）" },
  { value: "addressRest", label: "住所 市区町村＋町名番地" },
];

const VALUE_PART_OPTIONS: Array<{ value: NonNullable<FriendsOverlayField["valuePart"]> | ""; label: string }> = [
  { value: "", label: "全文" },
  { value: "firstToken", label: "前半だけ" },
  { value: "restTokens", label: "後半だけ" },
];

const VALUE_FORMATS_WITH_FIXED_PART = new Set<FriendsOverlayField["valueFormat"]>([
  "dateYmd",
  "dateYmdShort",
  "dateMd",
  "dateMdWithoutDaySuffix",
  "dateDigitsYmd",
  "dateYear",
  "dateYearShort",
  "dateMonth",
  "dateDay",
  "phoneDigits",
  "phonePart1",
  "phonePart2",
  "phonePart3",
  "durationYears",
  "addressPrefecture",
  "addressMunicipality",
  "addressStreet",
  "addressRest",
]);

const DATE_VALUE_FORMATS = new Set<FriendsOverlayField["valueFormat"]>([
  "dateYmd",
  "dateYmdShort",
  "dateMd",
  "dateMdWithoutDaySuffix",
  "dateDigitsYmd",
  "dateYear",
  "dateYearShort",
  "dateMonth",
  "dateDay",
]);

const PHONE_VALUE_FORMATS = new Set<FriendsOverlayField["valueFormat"]>([
  "phoneDigits",
  "phonePart1",
  "phonePart2",
  "phonePart3",
]);

const VALUE_KIND_LABELS: Record<string, string> = {
  boolean: "真偽",
  date: "日付",
  duration_years: "年数",
  email: "メール",
  id_number: "番号",
  money_man_yen: "万円",
  money_yen: "円",
  number: "数値",
  phone: "電話",
  postal_code: "郵便番号",
  select: "選択",
  text: "文字",
  textarea: "長文",
};

const STORAGE_SCOPE_LABELS: Record<string, string> = {
  case_fact: "案件标准项目",
  output_process: "出力処理",
  template_option: "会社別項目",
};

function inferBindingKind(option?: FieldBindingOption): FieldBindingKind {
  if (!option) return "text";
  const key = option.fieldKey.toLowerCase();
  const label = option.label;
  const value = option.value;
  if (option.valueKind === "postal_code" || key.includes("postalcode") || key.includes("postal_code")) return "postal";
  if (key.includes("address")) return "address";
  if (key.includes("phone") || key.includes("tel") || /電話|携帯|TEL/i.test(label) || /^0\d[-ー－―\s　]?\d/.test(value)) return "phone";
  if (key.includes("date") || /生年月日|予定日|申込日|契約日/.test(label) || /\d{4}\D+\d{1,2}\D+\d{1,2}/.test(value)) {
    return "date";
  }
  if (key.includes("yearsemployed") || key.includes("residenceyears") || /年数|勤続|居住年数/.test(label)) return "duration";
  return "text";
}

function getFormatKind(format?: FriendsOverlayField["valueFormat"]): ValueFormatKind {
  if (!format) return "raw";
  if (DATE_VALUE_FORMATS.has(format)) return "date";
  if (PHONE_VALUE_FORMATS.has(format)) return "phone";
  if (format === "addressPrefecture" || format === "addressMunicipality" || format === "addressStreet" || format === "addressRest") return "address";
  if (format === "durationYears") return "duration";
  return "raw";
}

function bindingSupportsFormat(option: FieldBindingOption, format?: FriendsOverlayField["valueFormat"]) {
  const formatKind = getFormatKind(format);
  if (formatKind === "raw") return true;
  return inferBindingKind(option) === formatKind;
}

function valueFormatAllowedForBinding(option: FieldBindingOption | undefined, format?: FriendsOverlayField["valueFormat"]) {
  if (!format || !option) return true;
  return getValueFormatOptionsForBinding(option).some((item) => item.value === format);
}

function getEffectiveValueFormatForBinding(
  option: FieldBindingOption | undefined,
  format?: FriendsOverlayField["valueFormat"],
) {
  return valueFormatAllowedForBinding(option, format) ? format : undefined;
}

function getValueFormatOptionsForBinding(option?: FieldBindingOption) {
  if (!option) return VALUE_FORMAT_OPTIONS;
  const kind = inferBindingKind(option);
  if (kind === "date") {
    return VALUE_FORMAT_OPTIONS.filter((item) => item.value === "" || getFormatKind(item.value || undefined) === "date")
      .map((item) => item.value === "" ? { ...item, label: "日付 全文" } : item);
  }
  if (kind === "address") {
    return VALUE_FORMAT_OPTIONS.filter((item) => item.value === "" || getFormatKind(item.value || undefined) === "address")
      .map((item) => item.value === "" ? { ...item, label: "住所 全文" } : item);
  }
  if (kind === "phone") {
    return VALUE_FORMAT_OPTIONS.filter((item) => item.value === "" || getFormatKind(item.value || undefined) === "phone")
      .map((item) => item.value === "" ? { ...item, label: "電話 全文" } : item);
  }
  if (kind === "duration") {
    return VALUE_FORMAT_OPTIONS.filter((item) => item.value === "" || item.value === "durationYears")
      .map((item) => item.value === "" ? { ...item, label: "年数 原文" } : item);
  }
  if (kind === "postal") {
    return VALUE_FORMAT_OPTIONS.filter((item) => item.value === "")
      .map((item) => item.value === "" ? { ...item, label: "郵便番号 全文" } : item);
  }
  return VALUE_FORMAT_OPTIONS.filter((item) => item.value === "");
}

function normalizePreviewValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parsePreviewDateParts(value: string): { year: string; month: string; day: string } | undefined {
  const match = normalizePreviewValue(value).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return undefined;
  return {
    year: match[1],
    month: String(Number(match[2])),
    day: String(Number(match[3])),
  };
}

function parsePreviewJapanesePhoneParts(value: string): [string, string, string] {
  const normalized = normalizePreviewValue(value);
  const digits = normalized.replace(/\D/g, "");
  const hyphenated = normalized.match(/(\d{2,4})[-ー－―\s　](\d{2,4})[-ー－―\s　](\d{3,4})/);
  if (hyphenated) return [hyphenated[1], hyphenated[2], hyphenated[3]];
  if (digits.length === 11) return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
  if (digits.length === 10 && digits.startsWith("03")) return [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6)];
  if (digits.length >= 10) return [digits.slice(0, 3), digits.slice(3, digits.length - 4), digits.slice(-4)];
  return [digits, "", ""];
}

function parsePreviewJapaneseAddressParts(value: string) {
  const normalized = normalizePreviewValue(value)
    .replace(/^〒?\s*\d{3}-?\d{4}\s*/, "")
    .replace(/^日本\s*/, "");
  const match = normalized.match(/^(東京都|北海道|京都府|大阪府|.{2,3}県)(.*)$/);
  if (!match) return { prefecture: "", municipality: "", rest: normalized, street: normalized };
  const rest = match[2].trim();
  const municipalityMatch = rest.match(/^((?:[^市区町村郡]+郡)?[^市区町村]+市(?:[^市区町村]+区)?|(?:[^市区町村郡]+郡)?[^市区町村]+[区町村])(.*)$/);
  const municipality = municipalityMatch?.[1] ?? "";
  const street = municipalityMatch?.[2]?.trim() ?? rest;
  return {
    prefecture: match[1],
    municipality,
    rest,
    street,
  };
}

function isPostalCodeOverlayField(field: Pick<FriendsOverlayField, "fieldKey" | "sourceFieldKey">) {
  const key = `${field.sourceFieldKey ?? ""} ${field.fieldKey}`.toLowerCase();
  return key.includes("postalcode") || key.includes("postal_code");
}

function formatPreviewJapanesePostalCodePart(value: string, valuePart: FriendsOverlayField["valuePart"]) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 7);
  if (valuePart === "firstToken") return digits.slice(0, 3);
  if (valuePart === "restTokens") return digits.slice(3, 7);
  return digits;
}

function formatPreviewOverlayValue(
  field: Pick<FriendsOverlayField, "fieldKey" | "sourceFieldKey" | "valueFormat" | "valuePart" | "segment">,
  value: string,
) {
  const normalized = normalizePreviewValue(value);
  if (field.valuePart && isPostalCodeOverlayField(field)) {
    return formatPreviewJapanesePostalCodePart(normalized, field.valuePart);
  }
  if (field.valueFormat === "durationYears") {
    const yearMatch = normalized.match(/(\d+(?:\.\d+)?)\s*年/);
    return yearMatch?.[1] ?? normalized.replace(/[年月か月ヶ月\s　]/g, "");
  }
  if (field.valueFormat === "addressPrefecture") return parsePreviewJapaneseAddressParts(normalized).prefecture;
  if (field.valueFormat === "addressMunicipality") return parsePreviewJapaneseAddressParts(normalized).municipality;
  if (field.valueFormat === "addressStreet") return parsePreviewJapaneseAddressParts(normalized).street;
  if (field.valueFormat === "addressRest") return parsePreviewJapaneseAddressParts(normalized).rest;
  if (
    field.valueFormat === "phoneDigits" ||
    field.valueFormat === "phonePart1" ||
    field.valueFormat === "phonePart2" ||
    field.valueFormat === "phonePart3"
  ) {
    const parts = parsePreviewJapanesePhoneParts(normalized);
    if (field.valueFormat === "phoneDigits") return parts.join("");
    if (field.valueFormat === "phonePart1") return parts[0] ?? "";
    if (field.valueFormat === "phonePart2") return parts[1] ?? "";
    return parts[2] ?? "";
  }
  if (field.valueFormat) {
    const date = parsePreviewDateParts(normalized);
    if (!date) return normalized;
    const month2 = date.month.padStart(2, "0");
    const day2 = date.day.padStart(2, "0");
    if (field.valueFormat === "dateYear") return date.year;
    if (field.valueFormat === "dateYearShort") return date.year.slice(-2);
    if (field.valueFormat === "dateMonth") return date.month;
    if (field.valueFormat === "dateDay") return date.day;
    if (field.valueFormat === "dateDigitsYmd") return `${date.year}${month2}${day2}`;
    if (field.valueFormat === "dateYmdShort") return `${date.year.slice(-2)}   ${date.month}   ${date.day}`;
    if (field.valueFormat === "dateMdWithoutDaySuffix") return `${date.month}月${date.day}`;
    if (field.valueFormat === "dateMd") return `${date.month}月${date.day}日`;
    return `${date.year}   ${date.month}   ${date.day}`;
  }
  if (field.valuePart && field.segment?.mode === "digits") {
    const digits = normalized.replace(/[^\d]/g, "");
    const cells = Math.max(1, Math.floor(field.segment.cells));
    if (digits) {
      if (field.valuePart === "firstToken") return digits.slice(0, cells);
      return digits.length > cells ? digits.slice(-cells) : "";
    }
  }
  if (field.valuePart) {
    const parts = normalized.split(/[\s　]+/).filter(Boolean);
    if (field.valuePart === "firstToken") return parts[0] ?? normalized;
    return parts.length > 1 ? parts.slice(1).join(" ") : "";
  }
  return normalized;
}

function canUseValuePart(input: {
  bindingOption?: FieldBindingOption;
  valueFormat?: FriendsOverlayField["valueFormat"];
}) {
  if (VALUE_FORMATS_WITH_FIXED_PART.has(input.valueFormat)) return false;
  const kind = inferBindingKind(input.bindingOption);
  return kind === "text" || kind === "postal";
}

function isPersonalNameSourceField(sourceFieldKey?: string) {
  return /^(applicant|guarantor|emergencyContact|coOccupants\.\d+)\.(name|furigana)$/.test(sourceFieldKey ?? "");
}

function isPostalCodeSourceField(sourceFieldKey?: string) {
  return Boolean(sourceFieldKey && /postalcode|postal_code/i.test(sourceFieldKey));
}

function getPreviewInputFontSize(input: {
  box: OverlayBox;
  field: FriendsOverlayField;
  fit: ReturnType<typeof getFriendsOverlayEstimatedTextFit>;
}) {
  const minSize = input.field.minSize ?? Math.max(CUSTOM_FONT_SIZE_MIN, input.field.size * 0.8);
  const heightLimitedSize = input.field.custom || input.field.sizeOverride
    ? input.field.size
    : Math.max(minSize, Math.min(input.field.size, Math.max(4, input.box.height - 2) * 0.72));
  const baseSize = Math.min(CUSTOM_FONT_SIZE_MAX, Math.max(CUSTOM_FONT_SIZE_MIN, heightLimitedSize));
  if (input.fit.status !== "shrinks" && input.fit.status !== "overflows") return baseSize;
  const ratio = input.fit.printableWidth / Math.max(1, input.fit.estimatedWidth);
  return Math.max(minSize, Math.min(baseSize, baseSize * ratio * 1.1));
}

function boxFromTopForPage(pageSize: PageSize, input: { x: number; top: number; width: number; height: number }): OverlayBox {
  return {
    x: input.x,
    y: pageSize.height - input.top - input.height,
    width: input.width,
    height: input.height,
  };
}

function boxCenter(box: OverlayBox) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function isJLeaseLikePage(pageSize: PageSize) {
  return Math.abs(pageSize.width - 595.32) < 3 && Math.abs(pageSize.height - 841.92) < 3;
}

function isJLeaseTemplate(imageAlt: string, pageSize: PageSize) {
  return isJLeaseLikePage(pageSize) && /Jリース|ジェイリース|J[-\s]?LEASE/i.test(imageAlt);
}

function getMatchIdentity(candidate: FieldMatchCandidate) {
  return `${candidate.sourceFieldKey}:${candidate.valueFormat ?? ""}:${candidate.valuePart ?? ""}`;
}

function getFormatBadge(field: Pick<FriendsOverlayField, "valueFormat" | "valuePart" | "segment">) {
  if (field.valueFormat === "dateYear") return "年";
  if (field.valueFormat === "dateYearShort") return "年2桁";
  if (field.valueFormat === "dateMonth") return "月";
  if (field.valueFormat === "dateDay") return "日";
  if (field.valueFormat === "phonePart1") return "電話1";
  if (field.valueFormat === "phonePart2") return "電話2";
  if (field.valueFormat === "phonePart3") return "電話3";
  if (field.valueFormat === "phoneDigits") return "電話";
  if (field.valueFormat === "addressPrefecture") return "都道府県";
  if (field.valueFormat === "addressMunicipality") return "市区町村";
  if (field.valueFormat === "addressStreet") return "町名番地";
  if (field.valueFormat === "addressRest") return "住所後半";
  if (field.valueFormat === "durationYears") return "年数";
  if (field.valuePart === "firstToken") return "前半";
  if (field.valuePart === "restTokens") return "後半";
  if (field.segment) return `${field.segment.cells}格`;
  return "";
}

function getCoOccupantParts(field: Pick<FriendsOverlayField, "fieldKey" | "sourceFieldKey" | "custom">) {
  const sourceKey = field.sourceFieldKey ?? (!field.custom ? field.fieldKey : undefined);
  const match = sourceKey?.match(/^coOccupants\.(\d+)\.(.+)$/);
  if (!match) return null;
  return {
    index: Number(match[1]),
    suffix: match[2],
  };
}

function replaceCoOccupantIndex(sourceFieldKey: string, sourceIndex: number, targetIndex: number) {
  return sourceFieldKey.replace(`coOccupants.${sourceIndex}.`, `coOccupants.${targetIndex}.`);
}

function replaceCoOccupantLabel(label: string, sourceIndex: number, targetIndex: number) {
  return label
    .replaceAll(`同居人${sourceIndex + 1}`, `同居人${targetIndex + 1}`)
    .replaceAll(`入居者${sourceIndex + 1}`, `入居者${targetIndex + 1}`);
}

function getSegmentSignature(segment: FriendsOverlayField["segment"]) {
  if (!segment) return "";
  return `${segment.mode}:${segment.cells}:${segment.align ?? ""}:${segment.gap ?? ""}:${segment.xInset ?? ""}:${segment.yOffset ?? ""}`;
}

function shouldAutoMatchCustomField(field: FriendsCustomOverlayField) {
  return !field.sourceFieldKey || /^(追加欄|分格欄)/.test(field.label);
}

function hasStoredFieldValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function getAiPrematchBlockingReason(
  field: FriendsCustomOverlayField,
  draftFieldValues: Record<string, string>,
  fieldValues: Record<string, string>,
) {
  if (field.sourceFieldKey) return "绑定済み";
  if (
    hasStoredFieldValue(field.value) ||
    hasStoredFieldValue(draftFieldValues[field.fieldKey]) ||
    hasStoredFieldValue(fieldValues[field.fieldKey])
  ) {
    return "値あり";
  }
  return "";
}

function getCandidateScore(input: {
  candidate: FieldMatchCandidate;
  customBox: OverlayBox;
  field: FriendsCustomOverlayField;
  pageSize: PageSize;
}) {
  const customCenter = boxCenter(input.customBox);
  const candidateCenter = boxCenter(input.candidate.box);
  const dx = Math.abs(customCenter.x - candidateCenter.x);
  const dy = Math.abs(customCenter.y - candidateCenter.y);
  const distance = Math.hypot(dx, dy);
  const pageDiagonal = Math.hypot(input.pageSize.width, input.pageSize.height);
  let score = distance / pageDiagonal;

  const customCells = input.field.segment?.cells;
  if (customCells && input.candidate.segmentCells) {
    score += Math.abs(customCells - input.candidate.segmentCells) * 0.015;
  } else if (customCells && !input.candidate.segmentCells) {
    score += 0.08;
  } else if (!customCells && input.candidate.segmentCells) {
    score += 0.04;
  }

  if (customCells === 12 && input.candidate.sourceFieldKey.includes("driverLicenseNumber")) score -= 0.12;
  if (customCells === 11 && /phone/i.test(input.candidate.sourceFieldKey)) score -= 0.08;
  if (customCells === 7 && /PostalCode/i.test(input.candidate.sourceFieldKey)) score -= 0.08;
  if (input.field.segment?.mode === "amount" && /(rent|Fee|deposit|Money|Income|RentTotal)/i.test(input.candidate.sourceFieldKey)) score -= 0.08;
  if (input.candidate.scoreBoost) score -= input.candidate.scoreBoost;
  return score;
}

function findBestFieldMatch(input: {
  candidates: readonly FieldMatchCandidate[];
  customBox: OverlayBox;
  field: FriendsCustomOverlayField;
  pageSize: PageSize;
  usedCandidateKeys: Set<string>;
}) {
  const ranked = input.candidates
    .filter((candidate) => !input.usedCandidateKeys.has(getMatchIdentity(candidate)))
    .map((candidate) => ({
      candidate,
      score: getCandidateScore({
        candidate,
        customBox: input.customBox,
        field: input.field,
        pageSize: input.pageSize,
      }),
    }))
    .sort((a, b) => a.score - b.score);
  const best = ranked[0];
  if (!best) return null;
  return best.score < 0.16 ? best.candidate : null;
}

function getBindingTemplateGroup(templateId: string) {
  return TEMPLATE_BINDING_GROUPS.find((group) => group.id === templateId) ?? TEMPLATE_BINDING_GROUPS[0];
}

function bindingFieldMatchesSection(fieldKey: string, section: BindingSection) {
  if (section.id === "all") return true;
  if (section.id === "other") return false;
  if (section.fieldKeys?.includes(fieldKey)) return true;
  return section.prefixes?.some((prefix) => fieldKey.startsWith(prefix)) ?? false;
}

function bindingFieldMatchesAnyExplicitSection(fieldKey: string, group: BindingTemplateGroup) {
  return group.sections.some((section) => {
    if (section.id === "all" || section.id === "other") return false;
    return bindingFieldMatchesSection(fieldKey, section);
  });
}

function getBindingOptionsForSection(
  options: readonly FieldBindingOption[],
  group: BindingTemplateGroup,
  sectionId: string,
) {
  const section = group.sections.find((item) => item.id === sectionId) ?? group.sections[0];
  if (!section) return options;
  if (section.id === "all") return options;
  if (section.id === "other") {
    return options.filter((option) => !bindingFieldMatchesAnyExplicitSection(option.fieldKey, group));
  }
  return options.filter((option) => bindingFieldMatchesSection(option.fieldKey, section));
}

function bindingSearchText(option: FieldBindingOption) {
  return [
    option.label,
    option.fieldKey,
    option.groupLabel,
    option.valueKind ? VALUE_KIND_LABELS[option.valueKind] ?? option.valueKind : "",
    option.storageScope ? STORAGE_SCOPE_LABELS[option.storageScope] ?? option.storageScope : "",
    option.value,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterBindingOptionsBySearch(options: readonly FieldBindingOption[], searchTerm: string) {
  const tokens = searchTerm
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return [...options];
  return options.filter((option) => {
    const haystack = bindingSearchText(option);
    return tokens.every((token) => haystack.includes(token));
  });
}

function groupBindingOptions(options: readonly FieldBindingOption[]) {
  const groups = new Map<string, { id: string; label: string; options: FieldBindingOption[] }>();
  options.forEach((option) => {
    const id = option.groupId ?? "uncategorized";
    const label = option.groupLabel ?? "未分類";
    const group = groups.get(id);
    if (group) {
      group.options.push(option);
      return;
    }
    groups.set(id, { id, label, options: [option] });
  });
  return [...groups.values()];
}

type FriendsGuaranteeCalibrationPreviewProps = {
  mode?: "broker" | "authoring";
  fields: readonly FriendsOverlayField[];
  prematchReferenceFields?: readonly FriendsOverlayField[];
  fieldValues: Record<string, string>;
  formId: string;
  imageAlt: string;
  imageHeight: number;
  imageSrc: string;
  imageWidth: number;
  templateId: string;
  bindingOptions: readonly FieldBindingOption[];
  initialDeletedFieldKeys: string[];
  initialLayoutOverrides: FriendsOverlayLayoutOverrides;
  pageSize: PageSize;
  requiredFieldKeys: string[];
};

function getDefaultBox(field: FriendsOverlayField) {
  if (field.box) return { ...field.box };
  const inputHeight = Math.max(18, field.size * 2.4);
  return {
    x: field.x,
    y: field.y - 4,
    width: field.maxWidth + 12,
    height: inputHeight,
  };
}

function normalizeSegmentValue(value: string, segment: NonNullable<FriendsOverlayField["segment"]>) {
  const normalized = value.replace(/[^\d]/g, "");
  if (segment.mode === "amount") return normalized.replace(/^0+(?=\d)/, "");
  return normalized;
}

function segmentValue(value: string, segment: NonNullable<FriendsOverlayField["segment"]>) {
  const cells = Math.max(1, Math.floor(segment.cells));
  const normalized = normalizeSegmentValue(value, segment);
  const chars = [...normalized];
  const visibleChars = segment.align === "right" ? chars.slice(-cells) : chars.slice(0, cells);
  const padded = Array<string>(cells).fill("");
  const offset = segment.align === "right" ? Math.max(0, cells - visibleChars.length) : 0;
  visibleChars.forEach((char, index) => {
    padded[offset + index] = char;
  });
  return padded;
}

function hasSegmentOverflow(value: string, segment: NonNullable<FriendsOverlayField["segment"]>) {
  return normalizeSegmentValue(value, segment).length > Math.max(1, Math.floor(segment.cells));
}

function fitStatusLabel(status: ReturnType<typeof getFriendsOverlayEstimatedTextFit>["status"]) {
  if (status === "overflows") return "長すぎ";
  if (status === "segment_overflows") return "桁数超過";
  if (status === "shrinks") return "縮小印字";
  return "";
}

function clampSegmentCells(value: number) {
  if (!Number.isFinite(value)) return 7;
  return Math.min(24, Math.max(1, Math.floor(value)));
}

function clampCustomFontSize(value: number) {
  if (!Number.isFinite(value)) return 8;
  const clamped = Math.min(CUSTOM_FONT_SIZE_MAX, Math.max(CUSTOM_FONT_SIZE_MIN, value));
  return Math.round(clamped / CUSTOM_FONT_SIZE_STEP) * CUSTOM_FONT_SIZE_STEP;
}

function clampBox(box: OverlayBox, pageSize: PageSize) {
  const width = Math.min(pageSize.width, Math.max(8, box.width));
  const height = Math.min(pageSize.height, Math.max(8, box.height));
  return {
    x: Math.min(pageSize.width - width, Math.max(0, box.x)),
    y: Math.min(pageSize.height - height, Math.max(0, box.y)),
    width,
    height,
  };
}

function previewFieldId(fieldKey: string) {
  return `field-${fieldKey.replaceAll(".", "-")}`;
}

function boxToStyle(box: OverlayBox, pageSize: PageSize) {
  return {
    left: `${(box.x / pageSize.width) * 100}%`,
    top: `${((pageSize.height - box.y - box.height) / pageSize.height) * 100}%`,
    width: `${(box.width / pageSize.width) * 100}%`,
    height: `${(box.height / pageSize.height) * 100}%`,
  };
}

function roundBoxNumber(value: number) {
  return Math.round(value * 10) / 10;
}

function boxToNumbers(box: OverlayBox) {
  return {
    x: roundBoxNumber(box.x),
    y: roundBoxNumber(box.y),
    width: roundBoxNumber(box.width),
    height: roundBoxNumber(box.height),
  };
}

function lineToStyle(guide: AlignmentGuide, pageSize: PageSize) {
  if (guide.axis === "x") {
    return {
      left: `${(guide.position / pageSize.width) * 100}%`,
    };
  }
  return {
    top: `${((pageSize.height - guide.position) / pageSize.height) * 100}%`,
  };
}

function distanceToNearest(value: number, candidates: AlignmentGuide[]) {
  return candidates.reduce<{ delta: number; guide: AlignmentGuide } | null>((best, guide) => {
    const delta = guide.position - value;
    if (Math.abs(delta) > SNAP_THRESHOLD) return best;
    if (!best || Math.abs(delta) < Math.abs(best.delta)) return { delta, guide };
    return best;
  }, null);
}

function snapBox(input: {
  box: OverlayBox;
  candidates: AlignmentGuide[];
  mode: DragMode;
  pageSize: PageSize;
}) {
  const xCandidates = input.candidates.filter((guide) => guide.axis === "x");
  const yCandidates = input.candidates.filter((guide) => guide.axis === "y");
  const box = { ...input.box };
  const guides: AlignmentGuide[] = [];

  const xTargets =
    input.mode === "resize-width"
      ? [{ value: box.x + box.width, kind: "right" as const }]
      : [
          { value: box.x, kind: "left" as const },
          { value: box.x + box.width, kind: "right" as const },
        ];
  const nearestX = xTargets
    .map((target) => {
      const match = distanceToNearest(target.value, xCandidates);
      return match ? { ...match, target } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(a!.delta) - Math.abs(b!.delta))[0];
  if (nearestX) {
    if (input.mode === "resize-width") {
      box.width = Math.max(8, box.width + nearestX.delta);
    } else {
      box.x += nearestX.delta;
    }
    guides.push(nearestX.guide);
  }

  if (input.mode === "move") {
    const yTargets = [
      { value: box.y, kind: "bottom" as const },
      { value: box.y + box.height, kind: "top" as const },
    ];
    const nearestY = yTargets
      .map((target) => {
        const match = distanceToNearest(target.value, yCandidates);
        return match ? { ...match, target } : null;
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(a!.delta) - Math.abs(b!.delta))[0];
    if (nearestY) {
      box.y += nearestY.delta;
      guides.push(nearestY.guide);
    }
  }

  return {
    box: clampBox(box, input.pageSize),
    guides,
  };
}

export function FriendsGuaranteeCalibrationPreview({
  mode = "broker",
  fields,
  prematchReferenceFields = [],
  fieldValues,
  formId,
  imageAlt,
  imageHeight,
  imageSrc,
  imageWidth,
  templateId,
  bindingOptions,
  initialDeletedFieldKeys,
  initialLayoutOverrides,
  pageSize,
  requiredFieldKeys,
}: FriendsGuaranteeCalibrationPreviewProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const customFieldSequenceRef = useRef(0);
  const requiredSet = useMemo(() => new Set(requiredFieldKeys), [requiredFieldKeys]);
  const isTemplateAuthoring = mode === "authoring";
  const [calibrationMode, setCalibrationMode] = useState(isTemplateAuthoring);
  const [layoutOverrides, setLayoutOverrides] = useState<FriendsOverlayLayoutOverrides>(initialLayoutOverrides);
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const layoutSaveScope: LayoutSaveScope = isTemplateAuthoring ? "template" : "case";
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [newSegmentCells, setNewSegmentCells] = useState(CUSTOM_SEGMENT_DEFAULT.cells);
  const [bindingTemplateId, setBindingTemplateId] = useState(templateId);
  const [bindingSectionId, setBindingSectionId] = useState(() => getBindingTemplateGroup(templateId).initialSectionId);
  const [bindingSearchTerm, setBindingSearchTerm] = useState("");
  const [deletedFieldKeys, setDeletedFieldKeys] = useState<Set<string>>(() => new Set(initialDeletedFieldKeys));
  const [draftFieldValues, setDraftFieldValues] = useState<Record<string, string>>(() => ({ ...fieldValues }));
  const [selectedGroupFieldKeys, setSelectedGroupFieldKeys] = useState<Set<string>>(() => new Set());
  const [autoMatchMessage, setAutoMatchMessage] = useState("");
  const [autoMatchInFlight, setAutoMatchInFlight] = useState(false);
  const [autoMatchStartedAt, setAutoMatchStartedAt] = useState<number | null>(null);
  const [autoMatchNow, setAutoMatchNow] = useState(() => Date.now());
  const [customFields, setCustomFields] = useState<FriendsCustomOverlayField[]>(
    () => fields.filter((field): field is FriendsCustomOverlayField => field.custom === true && Boolean(field.box)),
  );
  const baseFields = useMemo(() => fields.filter((field) => !field.custom), [fields]);
  const allFields = useMemo(
    () => [...baseFields, ...customFields].filter((field) => !deletedFieldKeys.has(field.fieldKey)),
    [baseFields, customFields, deletedFieldKeys],
  );

  const defaultBoxByFieldKey = useMemo(
    () => new Map(allFields.map((field) => [field.fieldKey, getDefaultBox(field)])),
    [allFields],
  );
  const activeField = activeFieldKey ? allFields.find((field) => field.fieldKey === activeFieldKey) : null;
  const bindingOptionsByFieldKey = useMemo(
    () => new Map(bindingOptions.map((option) => [option.fieldKey, option])),
    [bindingOptions],
  );
  const layoutOverrideValue = useMemo(() => JSON.stringify(layoutOverrides), [layoutOverrides]);
  const deletedOverlayFieldsValue = useMemo(() => JSON.stringify([...deletedFieldKeys].sort()), [deletedFieldKeys]);
  const customOverlayFieldsValue = useMemo(() => {
    return JSON.stringify(
      customFields.map((field) => {
        const bindingOption = field.sourceFieldKey ? bindingOptionsByFieldKey.get(field.sourceFieldKey) : undefined;
        const valueFormat = getEffectiveValueFormatForBinding(bindingOption, field.valueFormat);
        return {
          fieldKey: field.fieldKey,
          sourceFieldKey: field.sourceFieldKey,
          label: field.label,
          size: field.size,
          align: field.align,
          valueFormat,
          valuePart: canUseValuePart({ bindingOption, valueFormat }) ? field.valuePart : undefined,
          segment: field.segment ? { ...field.segment } : undefined,
          value: field.sourceFieldKey ? "" : draftFieldValues[field.fieldKey] ?? field.value ?? "",
          box: layoutOverrides[field.fieldKey]?.box ?? field.box,
        };
      }),
    );
  }, [bindingOptionsByFieldKey, customFields, draftFieldValues, layoutOverrides]);

  const getPreviewValueForField = useCallback(
    (field: FriendsOverlayField) => {
      if (calibrationMode && field.custom && field.sourceFieldKey) {
        const bindingOption = bindingOptionsByFieldKey.get(field.sourceFieldKey);
        if (bindingOption) return formatPreviewOverlayValue(field, bindingOption.value);
      }
      return draftFieldValues[field.fieldKey] ?? fieldValues[field.fieldKey] ?? "";
    },
    [bindingOptionsByFieldKey, calibrationMode, draftFieldValues, fieldValues],
  );

  const boxForField = useCallback(
    (field: FriendsOverlayField) =>
      layoutOverrides[field.fieldKey]?.box ?? defaultBoxByFieldKey.get(field.fieldKey) ?? getDefaultBox(field),
    [defaultBoxByFieldKey, layoutOverrides],
  );

  const sizeForField = useCallback(
    (field: FriendsOverlayField) => layoutOverrides[field.fieldKey]?.size ?? field.size,
    [layoutOverrides],
  );

  useEffect(() => {
    if (!autoMatchInFlight) return;
    setAutoMatchNow(Date.now());
    const intervalId = window.setInterval(() => setAutoMatchNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [autoMatchInFlight]);

  const aiPrematchSafety = useMemo(() => {
    const blockedFields = customFields.flatMap((field) => {
      const reason = getAiPrematchBlockingReason(field, draftFieldValues, fieldValues);
      return reason ? [{ fieldKey: field.fieldKey, label: field.label, reason }] : [];
    });
    const targetFieldCount = customFields.filter(
      (field) => shouldAutoMatchCustomField(field) && !getAiPrematchBlockingReason(field, draftFieldValues, fieldValues),
    ).length;
    const existingBindingCount = blockedFields.filter((field) => field.reason === "绑定済み").length;
    const existingValueCount = blockedFields.filter((field) => field.reason === "値あり").length;
    return {
      blockedFields,
      existingBindingCount,
      existingValueCount,
      targetFieldCount,
      totalCustomFieldCount: customFields.length,
      canRun: customFields.length > 0 && targetFieldCount > 0 && blockedFields.length === 0,
    };
  }, [customFields, draftFieldValues, fieldValues]);

  const aiPrematchBlockedMessage = useMemo(() => {
    if (aiPrematchSafety.totalCustomFieldCount === 0) return "追加欄がありません。";
    if (aiPrematchSafety.blockedFields.length > 0) {
      const examples = aiPrematchSafety.blockedFields
        .slice(0, 3)
        .map((field) => `${field.label}(${field.reason})`)
        .join("、");
      return `项目匹配已停止：当前模板已有 ${aiPrematchSafety.existingBindingCount} 个对应项目、${aiPrematchSafety.existingValueCount} 个已有内容。请只在整张表为空白填写区时使用。${examples ? `例：${examples}` : ""}`;
    }
    if (aiPrematchSafety.targetFieldCount === 0) return "未绑定の追加欄がありません。";
    return "";
  }, [aiPrematchSafety]);

  const aiPrematchButtonTitle =
    aiPrematchBlockedMessage || "AIと位置情報から未設定欄の項目候補を推定します。全体が未設定のときだけ使用できます。";
  const autoMatchElapsedSeconds = autoMatchStartedAt
    ? Math.max(0, Math.floor((autoMatchNow - autoMatchStartedAt) / 1000))
    : 0;

  const previewFieldForField = useCallback(
    (field: FriendsOverlayField): FriendsOverlayField => ({
      ...field,
      size: sizeForField(field),
      sizeOverride: layoutOverrides[field.fieldKey]?.size !== undefined,
    }),
    [layoutOverrides, sizeForField],
  );

  const createCustomFieldKey = useCallback(() => {
    const usedFieldKeys = new Set([...baseFields, ...customFields].map((field) => field.fieldKey));
    const keyPrefix = templateId.replace(/[^a-z0-9_-]/gi, "_");
    let fieldKey = "";
    do {
      customFieldSequenceRef.current += 1;
      fieldKey = `custom.${keyPrefix}_${customFieldSequenceRef.current}`;
    } while (usedFieldKeys.has(fieldKey));
    return fieldKey;
  }, [baseFields, customFields, templateId]);

  const fieldMatchCandidates = useMemo<FieldMatchCandidate[]>(() => {
    const candidates: FieldMatchCandidate[] = [];
    const referenceFields = prematchReferenceFields.length > 0 ? prematchReferenceFields : baseFields;
    const addCandidate = (candidate: FieldMatchCandidate) => {
      if (!bindingOptionsByFieldKey.has(candidate.sourceFieldKey)) return;
      candidates.push(candidate);
    };
    const addSplitCandidates = (field: FriendsOverlayField, box: OverlayBox, label: string, sourceFieldKey: string) => {
      if (/電話|携帯/.test(label) || /phone|tel/i.test(sourceFieldKey)) {
        const firstWidth = box.width * 0.28;
        const middleWidth = box.width * 0.34;
        const lastWidth = box.width - firstWidth - middleWidth;
        addCandidate({
          sourceFieldKey,
          label: `${label} 前段`,
          box: { ...box, width: firstWidth },
          valueFormat: "phonePart1",
          align: "center",
          scoreBoost: 0.03,
        });
        addCandidate({
          sourceFieldKey,
          label: `${label} 中段`,
          box: { ...box, x: box.x + firstWidth, width: middleWidth },
          valueFormat: "phonePart2",
          align: "center",
          scoreBoost: 0.03,
        });
        addCandidate({
          sourceFieldKey,
          label: `${label} 後段`,
          box: { ...box, x: box.x + firstWidth + middleWidth, width: lastWidth },
          valueFormat: "phonePart3",
          align: "center",
          scoreBoost: 0.03,
        });
      }
      if (/住所/.test(label) || /address/i.test(sourceFieldKey)) {
        const prefectureWidth = box.width * 0.28;
        const municipalityWidth = box.width * 0.34;
        const streetWidth = box.width - prefectureWidth - municipalityWidth;
        addCandidate({
          sourceFieldKey,
          label: `${label} 都道府県`,
          box: { ...box, width: prefectureWidth },
          valueFormat: "addressPrefecture",
          scoreBoost: 0.02,
        });
        addCandidate({
          sourceFieldKey,
          label: `${label} 市区町村`,
          box: { ...box, x: box.x + prefectureWidth, width: municipalityWidth },
          valueFormat: "addressMunicipality",
          scoreBoost: 0.02,
        });
        addCandidate({
          sourceFieldKey,
          label: `${label} 町名番地`,
          box: { ...box, x: box.x + prefectureWidth + municipalityWidth, width: streetWidth },
          valueFormat: "addressStreet",
          scoreBoost: 0.02,
        });
      }
      if (/氏名|フリガナ/.test(label) || /name|furigana/i.test(sourceFieldKey)) {
        addCandidate({
          sourceFieldKey,
          label: `${label} 前半`,
          box: { ...box, width: box.width / 2 },
          valuePart: "firstToken",
          scoreBoost: 0.02,
        });
        addCandidate({
          sourceFieldKey,
          label: `${label} 後半`,
          box: { ...box, x: box.x + box.width / 2, width: box.width / 2 },
          valuePart: "restTokens",
          scoreBoost: 0.02,
        });
      }
      if (/生年月日|予定日|申込日/.test(label) || /date/i.test(sourceFieldKey)) {
        const yearWidth = box.width * 0.48;
        const monthWidth = box.width * 0.26;
        const dayWidth = box.width - yearWidth - monthWidth;
        addCandidate({
          sourceFieldKey,
          label: `${label} 年`,
          box: { ...box, width: yearWidth },
          valueFormat: "dateYear",
          align: "center",
          scoreBoost: 0.03,
        });
        addCandidate({
          sourceFieldKey,
          label: `${label} 月`,
          box: { ...box, x: box.x + yearWidth, width: monthWidth },
          valueFormat: "dateMonth",
          align: "center",
          scoreBoost: 0.03,
        });
        addCandidate({
          sourceFieldKey,
          label: `${label} 日`,
          box: { ...box, x: box.x + yearWidth + monthWidth, width: dayWidth },
          valueFormat: "dateDay",
          align: "center",
          scoreBoost: 0.03,
        });
      }
    };

    referenceFields.forEach((field) => {
      const sourceFieldKey = field.sourceFieldKey ?? field.fieldKey;
      const option = bindingOptionsByFieldKey.get(sourceFieldKey);
      const label = option?.label ?? field.label;
      const box = boxForField(field);
      addCandidate({
        sourceFieldKey,
        label,
        box,
        valueFormat: field.valueFormat,
        valuePart: field.valuePart,
        align: field.align,
        segmentCells: field.segment?.cells,
        scoreBoost: field.print === false || field.printMode === "manual" ? 0.01 : 0.03,
      });
      if (field.dateParts) {
        addCandidate({
          sourceFieldKey,
          label: `${label} 年`,
          box: field.dateParts.year,
          valueFormat: field.dateParts.yearFormat === "short" ? "dateYearShort" : "dateYear",
          align: "center",
          scoreBoost: 0.05,
        });
        addCandidate({
          sourceFieldKey,
          label: `${label} 月`,
          box: field.dateParts.month,
          valueFormat: "dateMonth",
          align: "center",
          scoreBoost: 0.05,
        });
        addCandidate({
          sourceFieldKey,
          label: `${label} 日`,
          box: field.dateParts.day,
          valueFormat: "dateDay",
          align: "center",
          scoreBoost: 0.05,
        });
      } else {
        addSplitCandidates(field, box, label, sourceFieldKey);
      }
    });

    if (isJLeaseTemplate(imageAlt, pageSize)) {
      const addJLeaseCandidate = (
        sourceFieldKey: string,
        label: string,
        box: { x: number; top: number; width: number; height: number },
        candidate: Omit<FieldMatchCandidate, "sourceFieldKey" | "label" | "box"> = {},
      ) => {
        addCandidate({
          sourceFieldKey,
          label,
          box: boxFromTopForPage(pageSize, box),
          ...candidate,
        });
      };
      addJLeaseCandidate("applicant.driverLicenseNumber", "免許証番号", { x: 428, top: 112, width: 150, height: 18 }, {
        align: "center",
        segmentCells: 12,
        scoreBoost: 0.12,
      });
      addJLeaseCandidate("applicant.currentPostalCode", "現住所 郵便番号", { x: 94, top: 147, width: 96, height: 18 }, {
        align: "center",
        segmentCells: 7,
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("applicant.employerPostalCode", "勤務先 郵便番号", { x: 94, top: 242, width: 96, height: 18 }, {
        align: "center",
        segmentCells: 7,
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("emergencyContact.postalCode", "緊急連絡先 郵便番号", { x: 242, top: 462, width: 96, height: 18 }, {
        align: "center",
        segmentCells: 7,
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("emergencyContact.postalCode", "連帯保証人 郵便番号", { x: 334, top: 739, width: 96, height: 18 }, {
        align: "center",
        segmentCells: 7,
        scoreBoost: 0.05,
      });
      addJLeaseCandidate("applicant.phone", "携帯電話 前段", { x: 404, top: 146, width: 42, height: 18 }, {
        valueFormat: "phonePart1",
        align: "center",
        scoreBoost: 0.05,
      });
      addJLeaseCandidate("applicant.phone", "携帯電話 中段", { x: 462, top: 146, width: 48, height: 18 }, {
        valueFormat: "phonePart2",
        align: "center",
        scoreBoost: 0.05,
      });
      addJLeaseCandidate("applicant.phone", "携帯電話 後段", { x: 526, top: 146, width: 48, height: 18 }, {
        valueFormat: "phonePart3",
        align: "center",
        scoreBoost: 0.05,
      });
      addJLeaseCandidate("emergencyContact.furigana", "緊急連絡先 フリガナ", { x: 67, top: 445, width: 135, height: 14 }, {
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("emergencyContact.name", "緊急連絡先 氏名", { x: 67, top: 461, width: 135, height: 24 }, {
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("emergencyContact.gender", "緊急連絡先 性別", { x: 390, top: 461, width: 36, height: 18 }, {
        align: "center",
        scoreBoost: 0.06,
      });
      addJLeaseCandidate("emergencyContact.relationship", "緊急連絡先 続柄", { x: 445, top: 445, width: 62, height: 20 }, {
        align: "center",
        scoreBoost: 0.06,
      });
      addJLeaseCandidate("emergencyContact.birthDate", "緊急連絡先 生年月日 年", { x: 393, top: 445, width: 58, height: 16 }, {
        valueFormat: "dateYear",
        align: "center",
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("emergencyContact.birthDate", "緊急連絡先 生年月日 月", { x: 468, top: 445, width: 34, height: 16 }, {
        valueFormat: "dateMonth",
        align: "center",
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("emergencyContact.birthDate", "緊急連絡先 生年月日 日", { x: 520, top: 445, width: 34, height: 16 }, {
        valueFormat: "dateDay",
        align: "center",
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("emergencyContact.homePhone", "緊急連絡先 自宅電話", { x: 67, top: 486, width: 135, height: 18 }, {
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("emergencyContact.mobilePhone", "緊急連絡先 携帯電話", { x: 205, top: 486, width: 135, height: 18 }, {
        scoreBoost: 0.08,
      });
      addJLeaseCandidate("emergencyContact.address", "緊急連絡先 都道府県", { x: 332, top: 463, width: 92, height: 22 }, {
        valueFormat: "addressPrefecture",
        scoreBoost: 0.06,
      });
      addJLeaseCandidate("emergencyContact.address", "緊急連絡先 市区町村", { x: 424, top: 463, width: 76, height: 22 }, {
        valueFormat: "addressMunicipality",
        scoreBoost: 0.06,
      });
      addJLeaseCandidate("emergencyContact.address", "緊急連絡先 町名番地", { x: 500, top: 463, width: 62, height: 22 }, {
        valueFormat: "addressStreet",
        scoreBoost: 0.06,
      });
    }

    return candidates;
  }, [baseFields, bindingOptionsByFieldKey, boxForField, imageAlt, pageSize, prematchReferenceFields]);

  const getAlignmentCandidates = useCallback((excludedFieldKey: string) => {
    return allFields.flatMap((field) => {
      if (field.fieldKey === excludedFieldKey) return [];
      const box = boxForField(field);
      return [
        { axis: "x" as const, position: box.x, label: "left" as const },
        { axis: "x" as const, position: box.x + box.width, label: "right" as const },
        { axis: "y" as const, position: box.y, label: "bottom" as const },
        { axis: "y" as const, position: box.y + box.height, label: "top" as const },
      ];
    });
  }, [boxForField, allFields]);
  const activeBoxGuides = useMemo<AlignmentGuide[]>(() => {
    if (!activeField || !calibrationMode) return [];
    const box = boxForField(activeField);
    return [
      { axis: "x", position: box.x, label: "left" },
      { axis: "x", position: box.x + box.width, label: "right" },
      { axis: "y", position: box.y, label: "bottom" },
      { axis: "y", position: box.y + box.height, label: "top" },
    ];
  }, [activeField, boxForField, calibrationMode]);
  const isPortraitTemplate = imageHeight > imageWidth;
  const canvasClassName = isPortraitTemplate
    ? "relative mx-auto shadow-2xl"
    : "relative mx-auto min-w-[980px] max-w-[1600px] shadow-2xl";
  const canvasStyle = isPortraitTemplate
    ? {
        width: `min(100%, calc((100vh - 260px) * ${imageWidth / imageHeight}), ${imageWidth}px)`,
      }
    : undefined;

  const applyDrag = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointerId !== pointerId || !canvas) return false;

    const rect = canvas.getBoundingClientRect();
    const scaleX = pageSize.width / rect.width;
    const scaleY = pageSize.height / rect.height;
    const deltaX = (clientX - drag.startClientX) * scaleX;
    const deltaY = (clientY - drag.startClientY) * scaleY;
    const nextBox =
      drag.mode === "move"
        ? {
            ...drag.startBox,
            x: drag.startBox.x + deltaX,
            y: drag.startBox.y - deltaY,
          }
        : drag.mode === "resize-size"
          ? {
              ...drag.startBox,
              width: drag.startBox.width + deltaX,
              height: drag.startBox.height + deltaY,
              y: drag.startBox.y - deltaY,
            }
        : {
            ...drag.startBox,
            width: drag.startBox.width + deltaX,
          };
    const snapped = snapEnabled && drag.mode !== "resize-size"
      ? snapBox({
          box: nextBox,
          candidates: getAlignmentCandidates(drag.fieldKey),
          mode: drag.mode,
          pageSize,
        })
      : { box: clampBox(nextBox, pageSize), guides: [] };
    if (drag.mode === "move" && drag.groupFieldKeys && drag.groupFieldKeys.length > 1 && drag.groupStartBoxes) {
      const adjustedDeltaX = snapped.box.x - drag.startBox.x;
      const adjustedDeltaY = snapped.box.y - drag.startBox.y;
      setLayoutOverrides((current) => {
        const next = { ...current };
        drag.groupFieldKeys?.forEach((fieldKey) => {
          const startBox = drag.groupStartBoxes?.[fieldKey];
          if (!startBox) return;
          next[fieldKey] = {
            ...(current[fieldKey] ?? {}),
            box: clampBox(
              {
                ...startBox,
                x: startBox.x + adjustedDeltaX,
                y: startBox.y + adjustedDeltaY,
              },
              pageSize,
            ),
          };
        });
        return next;
      });
    } else {
      setLayoutOverrides((current) => ({
        ...current,
        [drag.fieldKey]: { ...(current[drag.fieldKey] ?? {}), box: snapped.box },
      }));
    }
    setAlignmentGuides(snapped.guides);
    setDirty(true);
    return true;
  }, [getAlignmentCandidates, pageSize, snapEnabled]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      if (applyDrag(event.pointerId, event.clientX, event.clientY)) {
        event.preventDefault();
      }
    };
    const handleEnd = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        dragRef.current = null;
        setDragging(false);
        setAlignmentGuides([]);
      }
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, [applyDrag, dragging]);

  const startDrag = (event: ReactPointerEvent<HTMLElement>, field: FriendsOverlayField, mode: DragMode) => {
    if (!calibrationMode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startBox = boxForField(field);
    const groupFieldKeys =
      mode === "move" && selectedGroupFieldKeys.has(field.fieldKey)
        ? allFields.filter((item) => selectedGroupFieldKeys.has(item.fieldKey)).map((item) => item.fieldKey)
        : [];
    const groupStartBoxes =
      groupFieldKeys.length > 1
        ? Object.fromEntries(
            allFields
              .filter((item) => groupFieldKeys.includes(item.fieldKey))
              .map((item) => [item.fieldKey, boxForField(item)]),
          )
        : undefined;
    dragRef.current = {
      fieldKey: field.fieldKey,
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox,
      groupFieldKeys,
      groupStartBoxes,
    };
    setActiveFieldKey(field.fieldKey);
    setDragging(true);
    setAlignmentGuides([]);
  };

  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (applyDrag(event.pointerId, event.clientX, event.clientY)) {
      event.preventDefault();
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
      setAlignmentGuides([]);
    }
  };

  const addCustomField = (segment?: NonNullable<FriendsOverlayField["segment"]>) => {
    const fieldKey = createCustomFieldKey();
    const segmentCells = segment ? clampSegmentCells(segment.cells) : 0;
    const box = clampBox(
      {
        x: pageSize.width * 0.42,
        y: pageSize.height * 0.45,
        width: segment
          ? Math.min(Math.max(24 * segmentCells, 120), pageSize.width * 0.48)
          : Math.min(180, pageSize.width * 0.18),
        height: Math.max(18, pageSize.height * 0.024),
      },
      pageSize,
    );
    const field: FriendsCustomOverlayField = {
      fieldKey,
      label: segment ? `分格欄${customFields.length + 1}` : `追加欄${customFields.length + 1}`,
      x: box.x + 3,
      y: box.y + 6,
      size: 8,
      minSize: 5,
      maxWidth: box.width - 6,
      box,
      segment: segment ? { ...segment, cells: segmentCells } : undefined,
      custom: true,
      value: "",
    };
    setCustomFields((current) => [...current, field]);
    setDraftFieldValues((current) => ({ ...current, [fieldKey]: "" }));
    setLayoutOverrides((current) => ({ ...current, [fieldKey]: { box } }));
    setActiveFieldKey(fieldKey);
    setCalibrationMode(true);
    setDirty(true);
  };

  const activeCustomField = activeFieldKey
    ? customFields.find((field) => field.fieldKey === activeFieldKey)
    : null;
  const activeBox = activeField ? boxForField(activeField) : null;
  const activeBoxNumbers = activeBox ? boxToNumbers(activeBox) : null;
  const activeFieldSize = activeField ? roundBoxNumber(sizeForField(activeField)) : null;
  const activeFieldIsYear =
    activeField?.valueFormat === "dateYear" ||
    activeField?.valueFormat === "dateYearShort" ||
    /(?:^|[ /・])年$/.test(activeField?.label.trim() ?? "");
  const activeCoOccupantParts = activeField ? getCoOccupantParts(activeField) : null;
  const activeCoOccupantGroupFields = useMemo(() => {
    if (!activeCoOccupantParts) return [];
    const customRowFields = customFields.filter((field) => {
      if (deletedFieldKeys.has(field.fieldKey)) return false;
      return getCoOccupantParts(field)?.index === activeCoOccupantParts.index;
    });
    if (customRowFields.length > 0) return customRowFields;
    return allFields.filter((field) => getCoOccupantParts(field)?.index === activeCoOccupantParts.index);
  }, [activeCoOccupantParts, allFields, customFields, deletedFieldKeys]);
  const activeGroupSelected = activeField ? selectedGroupFieldKeys.has(activeField.fieldKey) : false;
  const activeBindingOption = activeCustomField?.sourceFieldKey
    ? bindingOptionsByFieldKey.get(activeCustomField.sourceFieldKey)
    : undefined;
  const activeEffectiveValueFormat = getEffectiveValueFormatForBinding(
    activeBindingOption,
    activeCustomField?.valueFormat,
  );
  const activeBindingKind = inferBindingKind(activeBindingOption);
  const activeCanUseValuePart = canUseValuePart({
    bindingOption: activeBindingOption,
    valueFormat: activeEffectiveValueFormat,
  });
  const activeBindingTemplateGroup = getBindingTemplateGroup(bindingTemplateId);
  const activeBindingSection =
    activeBindingTemplateGroup.sections.find((section) => section.id === bindingSectionId) ??
    activeBindingTemplateGroup.sections.find((section) => section.id === activeBindingTemplateGroup.initialSectionId) ??
    activeBindingTemplateGroup.sections[0];
  const bindingSectionsWithCounts = activeBindingTemplateGroup.sections.map((section) => ({
    ...section,
    count: getBindingOptionsForSection(bindingOptions, activeBindingTemplateGroup, section.id).length,
  }));
  const hasBindingSearchTerm = bindingSearchTerm.trim().length > 0;
  const filteredBindingOptions = (() => {
    const sectionOptions = getBindingOptionsForSection(
      bindingOptions,
      activeBindingTemplateGroup,
      hasBindingSearchTerm ? "all" : activeBindingSection?.id ?? "all",
    );
    const options = filterBindingOptionsBySearch(sectionOptions, bindingSearchTerm);
    if (!activeBindingOption || options.some((option) => option.fieldKey === activeBindingOption.fieldKey)) return options;
    return [activeBindingOption, ...options];
  })();
  const groupedFilteredBindingOptions = groupBindingOptions(filteredBindingOptions);
  const filteredValueFormatOptions = getValueFormatOptionsForBinding(activeBindingOption);

  const updateFieldBox = (fieldKey: string, nextBox: OverlayBox) => {
    const box = clampBox(nextBox, pageSize);
    setLayoutOverrides((current) => ({
      ...current,
      [fieldKey]: { ...(current[fieldKey] ?? {}), box },
    }));
    setDirty(true);
  };

  const updateFieldFontSize = (field: FriendsOverlayField, nextSize: number) => {
    const size = clampCustomFontSize(nextSize);
    if (field.custom) {
      updateCustomField(field.fieldKey, (currentField) => ({
        ...currentField,
        size,
        minSize: Math.min(currentField.minSize ?? CUSTOM_FONT_SIZE_MIN, size),
      }));
      return;
    }
    setLayoutOverrides((current) => ({
      ...current,
      [field.fieldKey]: { ...(current[field.fieldKey] ?? {}), size },
    }));
    setDirty(true);
  };

  const updateActiveFieldFontSize = (nextSize: number) => {
    if (!activeField) return;
    updateFieldFontSize(activeField, nextSize);
  };

  const updateActiveFieldBox = (updater: (box: OverlayBox) => OverlayBox) => {
    if (!activeField) return;
    updateFieldBox(activeField.fieldKey, updater(boxForField(activeField)));
  };

  const updateActiveBoxNumber = (key: keyof OverlayBox, value: number) => {
    if (!Number.isFinite(value)) return;
    updateActiveFieldBox((box) => ({
      ...box,
      [key]: value,
    }));
  };

  const fitActiveYearField = () => {
    if (!activeField) return;
    updateActiveFieldBox((box) => ({ ...box, width: Math.max(box.width, 42) }));
    updateActiveFieldFontSize(Math.min(activeFieldSize ?? 6, 6));
  };

  const nudgeActiveField = (deltaX: number, deltaY: number) => {
    updateActiveFieldBox((box) => ({
      ...box,
      x: box.x + deltaX,
      y: box.y + deltaY,
    }));
  };

  const roundActiveFieldBox = () => {
    updateActiveFieldBox((box) => ({
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    }));
  };

  const duplicateActiveFieldInline = (copies: 1 | 2) => {
    if (!activeField) return;
    const sourceBox = boxForField(activeField);
    const sourceBindingKey =
      activeCustomField?.sourceFieldKey ??
      (!activeField.custom && bindingOptionsByFieldKey.has(activeField.fieldKey) ? activeField.fieldKey : undefined);
    const sourceBindingOption = sourceBindingKey ? bindingOptionsByFieldKey.get(sourceBindingKey) : undefined;
    const sourceDraftValue =
      draftFieldValues[activeField.fieldKey] ?? activeCustomField?.value ?? fieldValues[activeField.fieldKey] ?? "";
    const sourceSize = sizeForField(activeField);
    const createdFields: FriendsCustomOverlayField[] = [];
    const createdOverrides: FriendsOverlayLayoutOverrides = {};
    const createdDraftValues: Record<string, string> = {};
    const shouldSplitValuePartCopy =
      copies === 1 &&
      Boolean(activeCustomField) &&
      (isPersonalNameSourceField(sourceBindingKey) || isPostalCodeSourceField(sourceBindingKey)) &&
      !activeField.segment &&
      !activeField.valueFormat &&
      canUseValuePart({ bindingOption: sourceBindingOption, valueFormat: activeField.valueFormat });
    const shouldConvertSourceToFirstToken = shouldSplitValuePartCopy && !activeField.valuePart;
    const copiedValuePart =
      shouldSplitValuePartCopy && (!activeField.valuePart || activeField.valuePart === "firstToken")
        ? "restTokens"
        : activeField.valuePart;

    if (shouldConvertSourceToFirstToken && activeCustomField) {
      const sourceFirstTokenField = { ...activeCustomField, valuePart: "firstToken" as const };
      setCustomFields((current) =>
        current.map((field) => (field.fieldKey === activeCustomField.fieldKey ? sourceFirstTokenField : field)),
      );
      if (sourceBindingOption) {
        createdDraftValues[activeCustomField.fieldKey] = formatPreviewOverlayValue(sourceFirstTokenField, sourceBindingOption.value);
      }
    }

    for (let index = 0; index < copies; index += 1) {
      const box = clampBox(
        {
          ...sourceBox,
          x: sourceBox.x + (sourceBox.width + INLINE_COPY_GAP) * (index + 1),
        },
        pageSize,
      );
      const fieldKey = createCustomFieldKey();
      const field: FriendsCustomOverlayField = {
        fieldKey,
        sourceFieldKey: sourceBindingKey,
        label: `${sourceBindingOption?.label ?? activeField.label} コピー${index + 1}`,
        x: box.x + 3,
        y: box.y + 6,
        size: sourceSize,
        minSize: activeField.minSize ?? 5,
        maxWidth: Math.max(8, box.width - 6),
        align: activeField.align,
        valueFormat: activeField.valueFormat,
        valuePart: copiedValuePart,
        segment: activeField.segment ? { ...activeField.segment } : undefined,
        box,
        custom: true,
        value: sourceBindingKey ? "" : sourceDraftValue,
      };
      createdFields.push(field);
      createdOverrides[fieldKey] = { box };
      createdDraftValues[fieldKey] = sourceBindingOption
        ? formatPreviewOverlayValue(field, sourceBindingOption.value)
        : sourceDraftValue;
    }

    if (createdFields.length === 0) return;
    setCustomFields((current) => [...current, ...createdFields]);
    setLayoutOverrides((current) => ({ ...current, ...createdOverrides }));
    setDraftFieldValues((current) => ({ ...current, ...createdDraftValues }));
    setActiveFieldKey(createdFields[createdFields.length - 1].fieldKey);
    setCalibrationMode(true);
    setDirty(true);
  };

  const selectActiveCoOccupantGroup = () => {
    if (!activeCoOccupantParts || activeCoOccupantGroupFields.length === 0) return;
    setSelectedGroupFieldKeys(new Set(activeCoOccupantGroupFields.map((field) => field.fieldKey)));
    setCalibrationMode(true);
  };

  const inferCoOccupantCopyDeltaY = (sourceIndex: number, targetIndex: number, sourceFields: FriendsOverlayField[]) => {
    const averageCenterY = (fieldsForRow: FriendsOverlayField[]) => {
      if (fieldsForRow.length === 0) return null;
      const total = fieldsForRow.reduce((sum, field) => sum + boxCenter(boxForField(field)).y, 0);
      return total / fieldsForRow.length;
    };
    const sourceRowFields = allFields.filter((field) => getCoOccupantParts(field)?.index === sourceIndex);
    const targetRowFields = allFields.filter((field) => getCoOccupantParts(field)?.index === targetIndex);
    const sourceCenterY = averageCenterY(sourceRowFields);
    const targetCenterY = averageCenterY(targetRowFields);
    if (sourceCenterY !== null && targetCenterY !== null && Math.abs(targetCenterY - sourceCenterY) > 2) {
      return targetCenterY - sourceCenterY;
    }

    const boxes = sourceFields.map((field) => boxForField(field));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    return -Math.max(36, maxY - minY + 10);
  };

  const copyActiveCoOccupantGroupToNext = () => {
    if (!activeCoOccupantParts || activeCoOccupantParts.index >= 2) return;
    const sourceIndex = activeCoOccupantParts.index;
    const targetIndex = sourceIndex + 1;
    const sourceFields = activeCoOccupantGroupFields.filter((field) => getCoOccupantParts(field)?.index === sourceIndex);
    if (sourceFields.length === 0) return;

    const existingTargetSignatures = new Set(
      customFields.flatMap((field) => {
        const parts = getCoOccupantParts(field);
        if (!parts || parts.index !== targetIndex || !field.sourceFieldKey) return [];
        return [`${field.sourceFieldKey}:${field.valueFormat ?? ""}:${field.valuePart ?? ""}:${getSegmentSignature(field.segment)}`];
      }),
    );
    const deltaY = inferCoOccupantCopyDeltaY(sourceIndex, targetIndex, sourceFields);
    const createdFields: FriendsCustomOverlayField[] = [];
    const createdOverrides: FriendsOverlayLayoutOverrides = {};
    const createdDraftValues: Record<string, string> = {};

    sourceFields.forEach((sourceField) => {
      const sourceParts = getCoOccupantParts(sourceField);
      const sourceFieldKey = sourceField.sourceFieldKey ?? (!sourceField.custom ? sourceField.fieldKey : undefined);
      if (!sourceParts || sourceParts.index !== sourceIndex || !sourceFieldKey) return;
      const targetSourceFieldKey = replaceCoOccupantIndex(sourceFieldKey, sourceIndex, targetIndex);
      const targetOption = bindingOptionsByFieldKey.get(targetSourceFieldKey);
      if (!targetOption) return;
      const targetValueFormat = getEffectiveValueFormatForBinding(targetOption, sourceField.valueFormat);
      const targetValuePart = canUseValuePart({ bindingOption: targetOption, valueFormat: targetValueFormat })
        ? sourceField.valuePart
        : undefined;
      const targetSegment = normalizeSegmentForBinding(
        targetOption,
        sourceField.segment ? { ...sourceField.segment } : undefined,
      );
      const targetSignature = `${targetSourceFieldKey}:${targetValueFormat ?? ""}:${targetValuePart ?? ""}:${getSegmentSignature(targetSegment)}`;
      if (existingTargetSignatures.has(targetSignature)) return;
      existingTargetSignatures.add(targetSignature);

      const sourceBox = boxForField(sourceField);
      const sourceSize = sizeForField(sourceField);
      const box = clampBox(
        {
          ...sourceBox,
          y: sourceBox.y + deltaY,
        },
        pageSize,
      );
      const fieldKey = createCustomFieldKey();
      const field: FriendsCustomOverlayField = {
        fieldKey,
        sourceFieldKey: targetSourceFieldKey,
        label: replaceCoOccupantLabel(targetOption.label ?? sourceField.label, sourceIndex, targetIndex),
        x: box.x + 3,
        y: box.y + 6,
        size: sourceSize,
        minSize: sourceField.minSize ?? 5,
        maxWidth: Math.max(8, box.width - 6),
        align: sourceField.align,
        valueFormat: targetValueFormat,
        valuePart: targetValuePart,
        segment: targetSegment,
        box,
        custom: true,
        value: "",
      };
      createdFields.push(field);
      createdOverrides[fieldKey] = { box };
      createdDraftValues[fieldKey] = formatPreviewOverlayValue(field, targetOption.value);
    });

    if (createdFields.length === 0) {
      setAutoMatchMessage(`入居者${targetIndex + 1}には、同じ绑定の枠が既にあります。`);
      return;
    }
    setCustomFields((current) => [...current, ...createdFields]);
    setLayoutOverrides((current) => ({ ...current, ...createdOverrides }));
    setDraftFieldValues((current) => ({ ...current, ...createdDraftValues }));
    setSelectedGroupFieldKeys(new Set(createdFields.map((field) => field.fieldKey)));
    setActiveFieldKey(createdFields[createdFields.length - 1].fieldKey);
    setCalibrationMode(true);
    setDirty(true);
    setAutoMatchMessage(`入居者${sourceIndex + 1}の枠 ${createdFields.length} 件を入居者${targetIndex + 1}へコピーしました。位置は整组拖动で微調整できます。`);
  };

  const updateCustomField = (
    fieldKey: string,
    updater: (field: FriendsCustomOverlayField) => FriendsCustomOverlayField,
  ) => {
    setCustomFields((current) => current.map((field) => (field.fieldKey === fieldKey ? updater(field) : field)));
    setDirty(true);
  };

  const updateActiveCustomBinding = (sourceFieldKey: string) => {
    if (!activeCustomField) return;
    const option = bindingOptionsByFieldKey.get(sourceFieldKey);
    const nextValueFormat =
      option && !valueFormatAllowedForBinding(option, activeCustomField.valueFormat)
        ? undefined
        : activeCustomField.valueFormat;
    const nextField = {
      ...activeCustomField,
      sourceFieldKey: option?.fieldKey,
      valueFormat: nextValueFormat,
      valuePart: canUseValuePart({ bindingOption: option, valueFormat: nextValueFormat }) ? activeCustomField.valuePart : undefined,
    };
    updateCustomField(activeCustomField.fieldKey, (field) => ({
      ...field,
      sourceFieldKey: nextField.sourceFieldKey,
      label: option && /^(追加欄|分格欄)/.test(field.label) ? option.label : field.label,
      valueFormat: nextField.valueFormat,
      valuePart: nextField.valuePart,
      segment: normalizeSegmentForBinding(option, field.segment),
      value: option ? "" : field.value,
    }));
    setDraftFieldValues((current) => ({
      ...current,
      [activeCustomField.fieldKey]: option ? formatPreviewOverlayValue(nextField, option.value) : current[activeCustomField.fieldKey] ?? "",
    }));
  };

  const updateActiveCustomField = (patch: Partial<FriendsCustomOverlayField>) => {
    if (!activeCustomField) return;
    updateCustomField(activeCustomField.fieldKey, (field) => ({ ...field, ...patch }));
  };

  const updateActiveCustomSegmentCells = (delta: number) => {
    if (!activeCustomField?.segment) return;
    updateCustomField(activeCustomField.fieldKey, (field) =>
      field.segment
        ? {
            ...field,
            segment: {
              ...field.segment,
              cells: clampSegmentCells(field.segment.cells + delta),
            },
          }
        : field,
    );
  };

  const deleteCustomField = (fieldKey: string) => {
    setCustomFields((current) => current.filter((field) => field.fieldKey !== fieldKey));
    setLayoutOverrides((current) => {
      const next = { ...current };
      delete next[fieldKey];
      return next;
    });
    setDraftFieldValues((current) => {
      const next = { ...current };
      delete next[fieldKey];
      return next;
    });
    if (activeFieldKey === fieldKey) setActiveFieldKey(null);
    setSelectedGroupFieldKeys((current) => {
      if (!current.has(fieldKey)) return current;
      const next = new Set(current);
      next.delete(fieldKey);
      return next;
    });
    setDirty(true);
  };

  const deleteField = (field: FriendsOverlayField) => {
    if (field.custom) {
      deleteCustomField(field.fieldKey);
      return;
    }
    setDeletedFieldKeys((current) => {
      const next = new Set(current);
      next.add(field.fieldKey);
      return next;
    });
    setLayoutOverrides((current) => {
      const next = { ...current };
      delete next[field.fieldKey];
      return next;
    });
    if (activeFieldKey === field.fieldKey) setActiveFieldKey(null);
    setSelectedGroupFieldKeys((current) => {
      if (!current.has(field.fieldKey)) return current;
      const next = new Set(current);
      next.delete(field.fieldKey);
      return next;
    });
    setDirty(true);
  };

  const buildLocalFieldMatchSuggestions = (): FieldMatchSuggestion[] => {
    const usedCandidateKeys = new Set(
      customFields
        .filter((field) => field.sourceFieldKey && !shouldAutoMatchCustomField(field))
        .map((field) =>
          getMatchIdentity({
            sourceFieldKey: field.sourceFieldKey!,
            label: field.label,
            box: boxForField(field),
            valueFormat: field.valueFormat,
            valuePart: field.valuePart,
          }),
        ),
    );
    const suggestions: FieldMatchSuggestion[] = [];
    customFields.forEach((field) => {
      if (!shouldAutoMatchCustomField(field)) return;
      const match = findBestFieldMatch({
        candidates: fieldMatchCandidates,
        customBox: boxForField(field),
        field,
        pageSize,
        usedCandidateKeys,
      });
      if (!match) return;
      usedCandidateKeys.add(getMatchIdentity(match));
      suggestions.push({
        customFieldKey: field.fieldKey,
        sourceFieldKey: match.sourceFieldKey,
        label: match.label,
        valueFormat: match.valueFormat,
        valuePart: match.valuePart,
        align: match.align,
        segmentCells: match.segmentCells,
      });
    });
    return suggestions;
  };

  const applyFieldMatchSuggestions = (suggestions: readonly FieldMatchSuggestion[]) => {
    const suggestionsByFieldKey = new Map<string, FieldMatchSuggestion>();
    suggestions.forEach((suggestion) => {
      if (!suggestion.customFieldKey || suggestionsByFieldKey.has(suggestion.customFieldKey)) return;
      if (!bindingOptionsByFieldKey.has(suggestion.sourceFieldKey)) return;
      suggestionsByFieldKey.set(suggestion.customFieldKey, suggestion);
    });

    let matchedCount = 0;
    const nextDraftValues: Record<string, string> = {};
    const nextFields = customFields.map((field) => {
      if (!shouldAutoMatchCustomField(field)) return field;
      const match = suggestionsByFieldKey.get(field.fieldKey);
      if (!match) return field;
      const option = bindingOptionsByFieldKey.get(match.sourceFieldKey);
      const nextValueFormat = getEffectiveValueFormatForBinding(option, match.valueFormat);
      const nextField: FriendsCustomOverlayField = {
        ...field,
        sourceFieldKey: match.sourceFieldKey,
        label: /^(追加欄|分格欄)/.test(field.label) ? match.label ?? option?.label ?? field.label : field.label,
        valueFormat: nextValueFormat,
        valuePart: canUseValuePart({ bindingOption: option, valueFormat: nextValueFormat }) ? match.valuePart : undefined,
        align: field.align ?? match.align,
        segment: normalizeSegmentForBinding(
          option,
          field.segment
            ? {
                ...field.segment,
                cells: field.segment.cells || match.segmentCells || field.segment.cells,
              }
            : match.segmentCells
              ? { mode: "digits", cells: match.segmentCells, align: "left" }
              : undefined,
        ),
        value: option ? "" : field.value,
      };
      nextDraftValues[field.fieldKey] = option ? formatPreviewOverlayValue(nextField, option.value) : field.value ?? "";
      matchedCount += 1;
      return nextField;
    });
    setCustomFields(nextFields);
    if (matchedCount > 0) {
      setDraftFieldValues((current) => ({ ...current, ...nextDraftValues }));
      setDirty(true);
    }
    return matchedCount;
  };

  const runLocalAutoMatch = (prefix?: string) => {
    const matchedCount = applyFieldMatchSuggestions(buildLocalFieldMatchSuggestions());
    if (matchedCount > 0) {
      setAutoMatchMessage(`${prefix ? `${prefix} / ` : ""}本地项目匹配 ${matchedCount} 件。请逐个检查后保存模板。`);
    } else {
      setAutoMatchMessage(`${prefix ? `${prefix} / ` : ""}没有找到足够可信的项目匹配。`);
    }
  };

  const buildAiPrematchPayload = () => ({
    pageSize,
    safety: {
      mode: "blank_custom_fields_only",
      totalCustomFieldCount: aiPrematchSafety.totalCustomFieldCount,
      targetFieldCount: aiPrematchSafety.targetFieldCount,
      existingBindingCount: aiPrematchSafety.existingBindingCount,
      existingValueCount: aiPrematchSafety.existingValueCount,
    },
    fields: customFields.filter(shouldAutoMatchCustomField).map((field) => ({
      fieldKey: field.fieldKey,
      label: field.label,
      box: boxForField(field),
      segmentCells: field.segment?.cells,
      segmentMode: field.segment?.mode,
    })),
    candidates: fieldMatchCandidates.map((candidate) => ({
      sourceFieldKey: candidate.sourceFieldKey,
      label: candidate.label,
      box: candidate.box,
      valueFormat: candidate.valueFormat,
      valuePart: candidate.valuePart,
      align: candidate.align,
      segmentCells: candidate.segmentCells,
    })),
    bindingOptions: bindingOptions.map((option) => ({
      fieldKey: option.fieldKey,
      label: option.label,
      groupLabel: option.groupLabel,
      valueKind: option.valueKind,
      storageScope: option.storageScope,
    })),
  });

  const autoMatchCustomFields = async () => {
    if (autoMatchInFlight) return;
    if (!aiPrematchSafety.canRun) {
      setAutoMatchMessage(aiPrematchBlockedMessage || "项目匹配只能在整张表为空白填写区时执行。");
      return;
    }

    setAutoMatchInFlight(true);
    setAutoMatchStartedAt(Date.now());
    setAutoMatchMessage(`AI项目匹配中。${aiPrematchSafety.targetFieldCount} 个空白填写区 / ${fieldMatchCandidates.length} 个候选项目。`);
    try {
      const response = await fetch(`/api/guarantee-applications/${encodeURIComponent(templateId)}/field-prematch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildAiPrematchPayload()),
      });
      if (!response.ok) throw new Error(`field_prematch_http_${response.status}`);
      const result = (await response.json()) as { matches?: FieldMatchSuggestion[]; model?: string };
      const aiMatches = Array.isArray(result.matches) ? result.matches : [];
      const matchedCount = applyFieldMatchSuggestions(aiMatches);
      if (matchedCount > 0) {
        setAutoMatchMessage(`AI项目匹配 ${matchedCount} 件。请逐个检查后保存模板。`);
      } else {
        runLocalAutoMatch("AI没有返回足够可信的候选");
      }
    } catch {
      runLocalAutoMatch("AI暂不可用，已回退");
    } finally {
      setAutoMatchInFlight(false);
      setAutoMatchStartedAt(null);
    }
  };

  const getFieldBadgeText = (field: FriendsOverlayField) => {
    const sourceFieldKey = field.sourceFieldKey ?? (!field.custom ? field.fieldKey : undefined);
    const option = sourceFieldKey ? bindingOptionsByFieldKey.get(sourceFieldKey) : undefined;
    const base = option?.label ?? field.label;
    const format = getFormatBadge(field);
    if (field.custom && !sourceFieldKey) return "未绑定";
    return format ? `${base} / ${format}` : base;
  };

  return (
    <div data-bd-button-surface="editor" className="flex h-[calc(100vh-132px)] flex-col">
      <input form={formId} type="hidden" name="layoutOverrides" value={layoutOverrideValue} readOnly />
      <input form={formId} type="hidden" name="deletedOverlayFields" value={deletedOverlayFieldsValue} readOnly />
      <input form={formId} type="hidden" name="customOverlayFields" value={customOverlayFieldsValue} readOnly />
      <input form={formId} type="hidden" name="layoutDirty" value={dirty ? "true" : "false"} readOnly />
      <input form={formId} type="hidden" name="layoutSaveScope" value={layoutSaveScope} readOnly />
      <div className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <div className="min-w-[190px] flex-1 pr-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-[#002FA7]">02</span>
              <p className="truncate text-sm font-black text-slate-950">
                {isTemplateAuthoring ? "テンプレート編集" : "申込書の確認"}
              </p>
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
              {activeField
                ? getFieldBadgeText(activeField)
                : dirty
                  ? isTemplateAuthoring
                    ? "未保存のテンプレート変更"
                    : "未保存のこの案件の位置調整"
                  : "選択中の枠なし"}
            </p>
          </div>
          <div className="min-w-[260px] flex-[1.2]">
            <div className="flex flex-wrap items-center gap-2">
              <span
                title={isTemplateAuthoring ? "この申込書テンプレートの標準位置として保存" : "この案件だけに保存"}
                className="inline-flex h-9 items-center gap-1.5 border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700"
              >
                <span className="material-symbols-outlined text-[15px] text-[#002FA7]">save</span>
                保存先: {isTemplateAuthoring ? "テンプレート" : "この案件"}
              </span>
              <div className="flex min-w-0 items-center gap-2">
                {isTemplateAuthoring && autoMatchMessage ? (
                  <span className="min-w-0 truncate border border-[#002FA7]/20 bg-[#eef4ff] px-3 py-2 text-xs font-black text-[#002FA7]">
                    {autoMatchInFlight ? `${autoMatchMessage} 已等待 ${autoMatchElapsedSeconds}s` : autoMatchMessage}
                  </span>
                ) : isTemplateAuthoring && aiPrematchSafety.blockedFields.length > 0 ? (
                  <span
                    title={aiPrematchBlockedMessage}
                    className="min-w-0 truncate border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700"
                  >
                    项目匹配停止：已有对应项目或内容
                  </span>
                ) : (
                  <span className="min-w-0 truncate border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                    {calibrationMode
                      ? snapEnabled
                        ? "位置手柄 ON / 吸着弱"
                        : "位置手柄 ON / 吸着 OFF"
                      : "位置手柄 OFF"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-3 border-t border-slate-200 px-4 py-2">
          <div className="min-w-[360px] flex-[2]">
            <p className="mb-2 text-[10px] font-black text-slate-500">
              {isTemplateAuthoring ? "テンプレート操作" : "今回の申込書"}
            </p>
            {isTemplateAuthoring ? (
              <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                title="PDF上に入力欄を追加"
                onClick={() => addCustomField()}
                className="inline-flex h-9 items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 text-xs font-black text-emerald-800 hover:bg-emerald-100"
              >
                <span className="material-symbols-outlined text-[16px]">add_box</span>
                入力欄
              </button>
              <div className="inline-flex h-9 items-center overflow-hidden border border-[#002FA7]/30 bg-white text-xs font-black text-[#002FA7]">
                <button
                  type="button"
                  title="追加する分格数を減らす"
                  onClick={() => setNewSegmentCells((current) => clampSegmentCells(current - 1))}
                  className="h-full px-2 hover:bg-[#eef4ff]"
                >
                  -
                </button>
                <label className="flex h-full items-center border-x border-[#002FA7]/20 px-2">
                  <input
                    aria-label="追加する分格数"
                    type="number"
                    min={1}
                    max={24}
                    value={newSegmentCells}
                    onChange={(event) => setNewSegmentCells(clampSegmentCells(Number(event.target.value)))}
                    className="w-8 bg-transparent text-center text-xs font-black outline-none"
                  />
                  <span>格</span>
                </label>
                <button
                  type="button"
                  title="追加する分格数を増やす"
                  onClick={() => setNewSegmentCells((current) => clampSegmentCells(current + 1))}
                  className="h-full px-2 hover:bg-[#eef4ff]"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                title={`${newSegmentCells}格の分格欄を追加`}
                onClick={() => addCustomField({ ...CUSTOM_SEGMENT_DEFAULT, cells: newSegmentCells })}
                className="inline-flex h-9 items-center gap-1.5 border border-[#002FA7]/30 bg-[#002FA7]/5 px-3 text-xs font-black text-[#002FA7] hover:bg-[#002FA7]/10"
              >
                <span className="material-symbols-outlined text-[16px]">view_column</span>
                分格欄
              </button>
              <button
                type="button"
                title={aiPrematchButtonTitle}
                onClick={() => void autoMatchCustomFields()}
                disabled={autoMatchInFlight || !aiPrematchSafety.canRun}
                className="inline-flex h-9 items-center gap-2 border border-[#002FA7]/25 bg-[#eef4ff] px-3 text-xs font-black text-[#002FA7] hover:bg-[#dfeaff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
                {autoMatchInFlight ? "匹配中" : "项目匹配"}
              </button>
              <button
                type="button"
                title="移動・拡大縮小用のハンドルを表示"
                onClick={() => setCalibrationMode((current) => !current)}
                className={`inline-flex h-9 items-center gap-2 border px-3 text-xs font-black ${
                  calibrationMode
                    ? "border-slate-950 bg-slate-950 !text-white hover:bg-slate-800 [&_.material-symbols-outlined]:!text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">open_with</span>
                位置手柄
              </button>
              <button
                type="button"
                title="近い罫線への吸着を切り替え"
                onClick={() => {
                  setSnapEnabled((current) => !current);
                  setAlignmentGuides([]);
                }}
                className={`inline-flex h-9 items-center gap-2 border px-3 text-xs font-black ${
                  snapEnabled
                    ? "border-[#002FA7]/40 bg-white text-[#002FA7] hover:bg-[#eef4ff] [&_.material-symbols-outlined]:text-[#002FA7]"
                    : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">grid_on</span>
                吸着{snapEnabled ? "弱" : "OFF"}
              </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  title="この案件だけに印字位置と文字サイズの調整を保存"
                  onClick={() => setCalibrationMode((current) => !current)}
                  className={`inline-flex h-9 items-center gap-2 border px-3 text-xs font-black ${
                    calibrationMode
                      ? "border-slate-950 bg-slate-950 !text-white hover:bg-slate-800 [&_.material-symbols-outlined]:!text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">tune</span>
                  {calibrationMode ? "位置調整を終了" : "この申込書の位置を調整"}
                </button>
                <span className="inline-flex h-9 items-center border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                  変更はこの案件だけに反映されます
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      {activeField && activeBoxNumbers ? (
        <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-y border-slate-200 bg-white/95 px-4 py-2 text-xs font-bold text-slate-700 shadow-sm backdrop-blur">
          <span className="mr-1 font-black text-slate-950">填写区整理</span>
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label key={`box-number-${key}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
              <span className="text-[10px] font-black uppercase text-slate-500">
                {key === "width" ? "W" : key === "height" ? "H" : key.toUpperCase()}
              </span>
              <input
                type="number"
                step={BOX_NUMBER_STEP}
                value={activeBoxNumbers[key]}
                onChange={(event) => updateActiveBoxNumber(key, Number(event.target.value))}
                className="w-16 bg-transparent text-right text-xs font-black text-slate-950 outline-none"
              />
            </label>
          ))}
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              title="選択中の枠の文字を小さくする"
              onClick={() => updateActiveFieldFontSize((activeFieldSize ?? 8) - CUSTOM_FONT_SIZE_STEP)}
              className="px-2 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
            >
              -
            </button>
            <label className="inline-flex items-center gap-1 border-x border-slate-100 px-2 py-1.5">
              <span className="text-[10px] font-black text-slate-500">字号</span>
              <input
                aria-label="選択中の枠の文字サイズ"
                type="number"
                min={CUSTOM_FONT_SIZE_MIN}
                max={CUSTOM_FONT_SIZE_MAX}
                step={CUSTOM_FONT_SIZE_STEP}
                value={activeFieldSize ?? 8}
                onChange={(event) => updateActiveFieldFontSize(Number(event.target.value))}
                className="w-10 bg-transparent text-right text-xs font-black text-slate-950 outline-none"
              />
            </label>
            <button
              type="button"
              title="選択中の枠の文字を大きくする"
              onClick={() => updateActiveFieldFontSize((activeFieldSize ?? 8) + CUSTOM_FONT_SIZE_STEP)}
              className="px-2 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
            >
              +
            </button>
          </div>
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              title="左へ0.5移動"
              onClick={() => nudgeActiveField(-BOX_NUMBER_STEP, 0)}
              className="px-2 py-1.5 text-xs font-black hover:bg-slate-50"
            >
              ←
            </button>
            <button
              type="button"
              title="右へ0.5移動"
              onClick={() => nudgeActiveField(BOX_NUMBER_STEP, 0)}
              className="border-l border-slate-100 px-2 py-1.5 text-xs font-black hover:bg-slate-50"
            >
              →
            </button>
            <button
              type="button"
              title="上へ0.5移動"
              onClick={() => nudgeActiveField(0, BOX_NUMBER_STEP)}
              className="border-l border-slate-100 px-2 py-1.5 text-xs font-black hover:bg-slate-50"
            >
              ↑
            </button>
            <button
              type="button"
              title="下へ0.5移動"
              onClick={() => nudgeActiveField(0, -BOX_NUMBER_STEP)}
              className="border-l border-slate-100 px-2 py-1.5 text-xs font-black hover:bg-slate-50"
            >
              ↓
            </button>
          </div>
          <button
            type="button"
            title="現在のX/Y/W/Hを整数に揃える"
            onClick={roundActiveFieldBox}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            数值取整
          </button>
          {activeFieldIsYear ? (
            <button
              type="button"
              title="4桁の年が切れない幅と文字サイズに調整"
              onClick={fitActiveYearField}
              className="rounded-lg border border-[#002FA7]/30 bg-[#eef4ff] px-3 py-1.5 text-xs font-black text-[#002FA7] hover:bg-[#dfeaff]"
            >
              适配4位年份
            </button>
          ) : null}
          {activeCustomField?.segment ? (
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <span className="px-2 py-1.5 text-xs font-black text-slate-700">桁数 {activeCustomField.segment.cells}</span>
              <button
                type="button"
                title="桁数を減らす"
                onClick={() => updateActiveCustomSegmentCells(-1)}
                className="border-l border-slate-100 px-2 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                -
              </button>
              <button
                type="button"
                title="桁数を増やす"
                onClick={() => updateActiveCustomSegmentCells(1)}
                className="border-l border-slate-100 px-2 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                +
              </button>
            </div>
          ) : null}
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-emerald-200 bg-white text-xs font-black text-emerald-800 shadow-sm">
            <button
              type="button"
              title="選択中の枠と同じ幅・高さ・水平位置で右側に1つコピー"
              onClick={() => duplicateActiveFieldInline(1)}
              className="px-3 py-1.5 hover:bg-emerald-50"
            >
              右复制
            </button>
            <button
              type="button"
              title="選択中の枠を基準に、同じ幅・高さ・水平位置の3連枠を作る"
              onClick={() => duplicateActiveFieldInline(2)}
              className="border-l border-emerald-100 px-3 py-1.5 hover:bg-emerald-50"
            >
              三联框
            </button>
          </div>
          {activeCoOccupantParts && activeCoOccupantGroupFields.length > 0 ? (
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-cyan-200 bg-white text-xs font-black text-cyan-800 shadow-sm">
              <button
                type="button"
                title={`入居者${activeCoOccupantParts.index + 1}の枠をまとめて選択`}
                onClick={selectActiveCoOccupantGroup}
                className="px-3 py-1.5 hover:bg-cyan-50"
              >
                入居者{activeCoOccupantParts.index + 1}组
              </button>
              {activeCoOccupantParts.index < 2 ? (
                <button
                  type="button"
                  title={`入居者${activeCoOccupantParts.index + 1}の枠を入居者${activeCoOccupantParts.index + 2}へコピー`}
                  onClick={copyActiveCoOccupantGroupToNext}
                  className="border-l border-cyan-100 px-3 py-1.5 hover:bg-cyan-50"
                >
                  复制到{activeCoOccupantParts.index + 2}
                </button>
              ) : null}
              {activeGroupSelected ? (
                <button
                  type="button"
                  title="组选中を解除"
                  onClick={() => setSelectedGroupFieldKeys(new Set())}
                  className="border-l border-cyan-100 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  解除
                </button>
              ) : null}
            </div>
          ) : null}
          <span className="min-w-0 truncate text-[11px] font-semibold text-slate-500">
            选中：{getFieldBadgeText(activeField)}
          </span>
        </div>
      ) : null}
      {activeCustomField ? (
        <div className="grid gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 2xl:grid-cols-4">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm 2xl:col-span-4">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">关联项目</span>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(10rem,0.7fr)_minmax(14rem,1fr)_minmax(0,1.4fr)]">
              <label className="grid gap-1">
                <span className="text-[9px] font-black text-slate-400">1. 表单</span>
                <select
                  value={bindingTemplateId}
                  onChange={(event) => {
                    const nextGroup = getBindingTemplateGroup(event.target.value);
                    setBindingTemplateId(nextGroup.id);
                    setBindingSectionId(nextGroup.initialSectionId);
                    setBindingSearchTerm("");
                  }}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20"
                >
                  {TEMPLATE_BINDING_GROUPS.map((group) => (
                    <option key={`binding-template-${group.id}`} value={group.id}>
                      {group.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[9px] font-black text-slate-400">2. 表头/区域</span>
                <select
                  value={activeBindingSection?.id ?? ""}
                  onChange={(event) => {
                    setBindingSectionId(event.target.value);
                    setBindingSearchTerm("");
                  }}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20"
                >
                  {bindingSectionsWithCounts.map((section) => (
                    <option key={`binding-section-${section.id}`} value={section.id}>
                      {section.label} ({section.count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[9px] font-black text-slate-400">3. 搜索</span>
                <input
                  type="search"
                  value={bindingSearchTerm}
                  onChange={(event) => setBindingSearchTerm(event.target.value)}
                  placeholder="项目名 / 当前值"
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20"
                />
              </label>
              <label className="grid gap-1 md:col-span-2 2xl:col-span-3">
                <span className="text-[9px] font-black text-slate-400">4. 匹配项目</span>
                <select
                  value={activeCustomField.sourceFieldKey ?? ""}
                  onChange={(event) => updateActiveCustomBinding(event.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20"
                >
                  <option value="">手入力 / 固定文字</option>
                  {groupedFilteredBindingOptions.map((group) => (
                    <optgroup key={`binding-group-${group.id}`} label={`${group.label} (${group.options.length})`}>
                      {group.options.map((option) => (
                        <option key={`binding-${option.fieldKey}`} value={option.fieldKey}>
                          {option.label} ({option.fieldKey})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
            <span className="truncate text-[10px] font-semibold text-slate-500">
              {activeBindingOption?.value
                ? `${activeBindingOption.groupLabel ?? "未分類"} / ${activeBindingOption.valueKind ? VALUE_KIND_LABELS[activeBindingOption.valueKind] ?? activeBindingOption.valueKind : "项目"} / 現在値: ${activeBindingOption.value}`
                : hasBindingSearchTerm
                  ? `${activeBindingTemplateGroup.label} 全体から検索 / ${filteredBindingOptions.length}項目`
                  : `${activeBindingTemplateGroup.label} / ${activeBindingSection?.label ?? "未分類"} / ${filteredBindingOptions.length}項目`}
            </span>
          </div>

          <label className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">显示格式</span>
            <select
              value={activeEffectiveValueFormat ?? ""}
              onChange={(event) => {
                const nextValueFormat = (event.target.value || undefined) as FriendsOverlayField["valueFormat"];
                const nextBindingOption =
                  activeBindingOption && bindingSupportsFormat(activeBindingOption, nextValueFormat)
                    ? activeBindingOption
                    : undefined;
                const nextValuePart = canUseValuePart({
                  bindingOption: nextBindingOption,
                  valueFormat: nextValueFormat,
                }) ? activeCustomField.valuePart : undefined;
                const nextField = {
                  ...activeCustomField,
                  sourceFieldKey: nextBindingOption?.fieldKey,
                  valueFormat: nextValueFormat,
                  valuePart: nextValuePart,
                };
                updateActiveCustomField(nextField);
                if (nextBindingOption) {
                  setDraftFieldValues((current) => ({
                    ...current,
                    [activeCustomField.fieldKey]: formatPreviewOverlayValue(nextField, nextBindingOption.value),
                  }));
                }
              }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20"
            >
              {filteredValueFormatOptions.map((option) => (
                <option key={`format-${option.value || "raw"}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">内容拆分</span>
            <select
              value={activeCustomField.valuePart ?? ""}
              disabled={!activeCanUseValuePart}
              onChange={(event) =>
                updateActiveCustomField({
                  valuePart: (event.target.value || undefined) as FriendsOverlayField["valuePart"],
                })
              }
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {VALUE_PART_OPTIONS.map((option) => (
                <option key={`part-${option.value || "all"}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="truncate text-[10px] font-semibold text-slate-500">
              {activeCanUseValuePart
                ? activeBindingKind === "postal"
                  ? "郵便番号は前3桁 / 後4桁"
                  : "只用于姓名等需要按空格拆开的内容"
                : "当前内容不需要拆分"}
            </span>
          </label>

          <div className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">对齐</span>
            <div className="grid gap-2">
              <select
                value={activeCustomField.align ?? "left"}
                onChange={(event) =>
                  updateActiveCustomField({
                    align: event.target.value as FriendsOverlayField["align"],
                  })
                }
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20"
              >
                <option value="left">靠左</option>
                <option value="center">居中</option>
                <option value="right">靠右</option>
              </select>
            </div>
          </div>

          <div className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">分格规则</span>
            {activeCustomField.segment ? (
              <div className="grid grid-cols-[1fr_64px_1fr] gap-2">
                <select
                  value={activeCustomField.segment.mode}
                  onChange={(event) =>
                    updateCustomField(activeCustomField.fieldKey, (field) =>
                      field.segment
                        ? {
                            ...field,
                            segment: {
                              ...field.segment,
                              mode: event.target.value === "amount" ? "amount" : "digits",
                            },
                          }
                        : field,
                    )
                  }
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20"
                >
                  <option value="digits">数字</option>
                  <option value="amount">金额</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={activeCustomField.segment.cells}
                  onChange={(event) =>
                    updateCustomField(activeCustomField.fieldKey, (field) =>
                      field.segment
                        ? {
                            ...field,
                            segment: {
                              ...field.segment,
                              cells: clampSegmentCells(Number(event.target.value)),
                            },
                          }
                        : field,
                    )
                  }
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-center text-xs font-black text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20"
                />
                <select
                  value={activeCustomField.segment.align ?? "left"}
                  onChange={(event) =>
                    updateCustomField(activeCustomField.fieldKey, (field) =>
                      field.segment
                        ? {
                            ...field,
                            segment: {
                              ...field.segment,
                              align: event.target.value === "right" ? "right" : "left",
                            },
                          }
                        : field,
                    )
                  }
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-[#002FA7]/20"
                >
                  <option value="left">左詰</option>
                  <option value="right">右詰</option>
                </select>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  updateActiveCustomField({
                    segment: { ...CUSTOM_SEGMENT_DEFAULT, cells: newSegmentCells },
                  })
                }
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-700 hover:bg-slate-100"
              >
                分格にする
              </button>
            )}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto bg-slate-200 p-6">
        <div ref={canvasRef} className={canvasClassName} style={canvasStyle}>
          <Image
            src={imageSrc}
            width={imageWidth}
            height={imageHeight}
            alt={imageAlt}
            priority
            className="h-auto w-full select-none bg-white"
            draggable={false}
          />
          {autoMatchInFlight ? (
            <div className="absolute inset-0 z-[60] flex items-start justify-center bg-slate-950/20 px-6 pt-16 backdrop-blur-[1px]">
              <div className="max-w-[520px] border border-[#002FA7]/30 bg-white px-5 py-4 text-slate-950 shadow-2xl">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined animate-spin text-[24px] text-[#002FA7]">sync</span>
                  <div className="min-w-0">
                    <p className="text-sm font-black">AI项目匹配中</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      {aiPrematchSafety.targetFieldCount} 个空白填写区 / {fieldMatchCandidates.length} 个候选项目，已等待 {autoMatchElapsedSeconds}s。
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  结果返回前不要保存模板或刷新页面。返回后仍只是候选绑定，需要肉眼检查。
                </p>
              </div>
            </div>
          ) : null}
          {calibrationMode
            ? activeBoxGuides.map((guide) => (
                <span
                  key={`active-guide-${guide.axis}-${guide.label}`}
                  aria-hidden="true"
                  className={`pointer-events-none absolute z-[15] ${
                    guide.axis === "x"
                      ? "top-0 h-full border-l border-dashed border-slate-400/45"
                      : "left-0 w-full border-t border-dashed border-slate-400/45"
                  }`}
                  style={lineToStyle(guide, pageSize)}
                />
              ))
            : null}
          {alignmentGuides.map((guide) => (
            <span
              key={`snap-guide-${guide.axis}-${guide.position}-${guide.label}`}
              aria-hidden="true"
              className={`pointer-events-none absolute z-[25] ${
                guide.axis === "x"
                  ? "top-0 h-full border-l-2 border-dashed border-[#002FA7]"
                  : "left-0 w-full border-t-2 border-dashed border-[#002FA7]"
              }`}
              style={lineToStyle(guide, pageSize)}
            >
              <span
                className={`absolute rounded bg-[#002FA7] px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm ${
                  guide.axis === "x" ? "left-1 top-2" : "left-2 top-1"
                }`}
              >
                吸着
              </span>
            </span>
          ))}
          {allFields.map((field) => {
            const previewField = previewFieldForField(field);
            const value = getPreviewValueForField(field);
            const required = requiredSet.has(field.fieldKey);
            const missing = required && !value;
            const box = boxForField(field);
            const printMode = field.printMode ?? (field.print === false ? "manual" : "auto");
            const manualPlacementRequired = printMode === "manual" && !layoutOverrides[field.fieldKey]?.box;
            const segmentOverflow = field.segment ? hasSegmentOverflow(value, field.segment) : false;
            const textFit = getFriendsOverlayEstimatedTextFit({ field: previewField, value, box });
            const textOverflow = textFit.status === "overflows" || textFit.status === "segment_overflows";
            const textShrink = textFit.status === "shrinks";
            const previewFontSize = getPreviewInputFontSize({ field: previewField, box, fit: textFit });
            const inputClass = missing
              ? "border-rose-500 bg-rose-50/95 text-rose-950 placeholder:text-rose-400 ring-2 ring-rose-300"
              : manualPlacementRequired
                ? "border-amber-500 bg-amber-50/90 text-amber-950 ring-2 ring-amber-200"
              : textOverflow
                ? "border-rose-500 bg-rose-50/95 text-rose-950 ring-2 ring-rose-300"
              : segmentOverflow
                ? "border-amber-500 bg-amber-50/95 text-amber-950 ring-2 ring-amber-300"
              : textShrink
                ? "border-amber-500 bg-amber-50/95 text-amber-950 ring-2 ring-amber-200"
              : value
                ? "border-emerald-500 bg-emerald-50/90 text-slate-950"
                : "border-slate-300 bg-white/75 text-slate-900";
            const active = activeFieldKey === field.fieldKey;
            const groupSelected = selectedGroupFieldKeys.has(field.fieldKey);
            const dimInactiveCalibrationChrome = Boolean(calibrationMode && activeFieldKey && !active && !groupSelected);
            const inactiveCalibrationChromeClass = dimInactiveCalibrationChrome
              ? "pointer-events-none opacity-0 transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-90 group-focus-within:pointer-events-auto group-focus-within:opacity-90"
              : "opacity-100 transition-opacity duration-100";
            const inactiveCalibrationBadgeClass = dimInactiveCalibrationChrome
              ? "opacity-10 transition-opacity duration-100 group-hover:opacity-90 group-focus-within:opacity-90"
              : "opacity-100 transition-opacity duration-100";
            const badgeText = getFieldBadgeText(field);
            const segmentCells = field.segment ? segmentValue(value, field.segment) : [];
            const segmentGap =
              field.segment && field.segment.gap
                ? `${Math.max(0, (field.segment.gap / Math.max(1, box.width)) * 100)}%`
                : "0";
            return (
              <label
                key={`overlay-${field.fieldKey}`}
                id={previewFieldId(field.fieldKey)}
                className={`group absolute scroll-mt-24 ${
                  calibrationMode ? "cursor-pointer" : ""
                } ${active ? "z-30" : groupSelected ? "z-20" : "z-10"}`}
                style={boxToStyle(box, pageSize)}
                title={
                  calibrationMode
                    ? `${field.label} / クリックで選択、左上の移動ハンドルで位置調整`
                    : manualPlacementRequired
                      ? `${field.label} / 位置を調整するとPDFに印字されます`
                      : field.label
                }
                onClick={() => setActiveFieldKey(field.fieldKey)}
              >
                {calibrationMode || field.custom || active ? (
                  <span
                    className={`pointer-events-none absolute -top-5 left-0 z-30 max-w-[180px] truncate rounded px-2 py-0.5 text-[9px] font-black shadow ${
                      field.custom && !field.sourceFieldKey
                        ? "bg-amber-500 text-white"
                        : field.custom
                          ? "bg-emerald-700 text-white"
                          : "bg-slate-950 text-white"
                    } ${inactiveCalibrationBadgeClass}`}
                  >
                    {badgeText}
                  </span>
                ) : null}
                {calibrationMode || field.custom || active ? null : (
                  <span className="absolute -top-5 left-0 hidden whitespace-nowrap rounded bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-white shadow group-focus-within:block group-hover:block">
                    {field.label}{field.segment ? " / 分格" : ""}{manualPlacementRequired ? " / 要手動配置" : ""}
                  </span>
                )}
                {field.segment ? (
                  <>
                    <input
                      form={formId}
                      name={`field:${field.fieldKey}`}
                      value={value}
                      onChange={(event) => {
                        setDraftFieldValues((current) => ({ ...current, [field.fieldKey]: event.target.value }));
                        setDirty(true);
                      }}
                      placeholder={missing ? "入力" : ""}
                      aria-label={field.label}
                      readOnly={calibrationMode}
                      inputMode="numeric"
                      onFocus={() => setActiveFieldKey(field.fieldKey)}
                      className={`absolute inset-0 z-10 h-full w-full rounded-sm border bg-transparent px-1 !text-transparent caret-[#001e40] outline-none transition placeholder:text-rose-400 focus:border-[#001e40] focus:bg-white/20 focus:ring-2 focus:ring-[#001e40]/30 ${
                        calibrationMode ? "pointer-events-none select-none" : ""
                      } ${active ? "ring-2 ring-[#001e40]" : groupSelected ? "ring-2 ring-cyan-500" : ""} ${inputClass}`}
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none relative z-[11] grid h-full w-full tabular-nums"
                      style={{
                        gridTemplateColumns: `repeat(${segmentCells.length}, minmax(0, 1fr))`,
                        gap: segmentGap,
                        fontSize: `${previewFontSize}px`,
                        lineHeight: 1,
                      }}
                    >
                      {segmentCells.map((char, index) => (
                        <span
                          key={`${field.fieldKey}-segment-${index}`}
                          className={`flex min-w-0 items-center justify-center border font-black leading-none ${
                            textOverflow
                              ? "border-rose-500 bg-rose-50/95 text-rose-950"
                              : manualPlacementRequired
                              ? "border-amber-500 bg-amber-50/90 text-amber-950"
                              : segmentOverflow
                              ? "border-amber-500 bg-amber-50/95 text-amber-950"
                              : textShrink
                              ? "border-amber-500 bg-amber-50/90 text-amber-950"
                              : missing
                                ? "border-rose-500 bg-rose-50/95 text-rose-950"
                                : value
                                  ? "border-emerald-500 bg-emerald-50/90 text-slate-950"
                                  : "border-slate-300 bg-white/75 text-slate-900"
                          }`}
                        >
                          {char}
                        </span>
                      ))}
                    </span>
                    {segmentOverflow || textOverflow ? (
                      <span className={`pointer-events-none absolute -bottom-5 right-0 rounded px-1.5 py-0.5 text-[9px] font-black text-white ${textOverflow ? "bg-rose-600" : "bg-amber-500"} ${inactiveCalibrationBadgeClass}`}>
                        {fitStatusLabel(textFit.status) || "桁数超過"}
                      </span>
                    ) : null}
                    {manualPlacementRequired ? (
                      <span className={`pointer-events-none absolute -bottom-5 right-0 rounded bg-amber-600 px-1.5 py-0.5 text-[9px] font-black text-white ${inactiveCalibrationBadgeClass}`}>
                        要配置
                      </span>
                    ) : null}
                  </>
                ) : (
                  <input
                    form={formId}
                    name={`field:${field.fieldKey}`}
                    value={value}
                    onChange={(event) => {
                      setDraftFieldValues((current) => ({ ...current, [field.fieldKey]: event.target.value }));
                      setDirty(true);
                    }}
                    placeholder={missing ? "入力" : ""}
                    aria-label={field.label}
                    readOnly={calibrationMode}
                    onFocus={() => setActiveFieldKey(field.fieldKey)}
                    className={`h-full w-full rounded-sm border px-1 text-[11px] font-bold leading-none outline-none transition focus:border-[#001e40] focus:bg-white focus:ring-2 focus:ring-[#001e40]/30 ${
                      field.align === "right" ? "text-right" : field.align === "center" ? "text-center" : ""
                    } ${calibrationMode ? "pointer-events-none select-none" : ""} ${active ? "ring-2 ring-[#001e40]" : groupSelected ? "ring-2 ring-cyan-500" : ""} ${inputClass}`}
                    style={{
                      fontSize: `${previewFontSize}px`,
                      lineHeight: 1.08,
                    }}
                  />
                )}
                {!field.segment && (textOverflow || textShrink) ? (
                  <span className={`pointer-events-none absolute -bottom-5 right-0 rounded px-1.5 py-0.5 text-[9px] font-black text-white ${textOverflow ? "bg-rose-600" : "bg-amber-500"} ${inactiveCalibrationBadgeClass}`}>
                    {fitStatusLabel(textFit.status)}
                  </span>
                ) : null}
                {!field.segment && manualPlacementRequired ? (
                  <span className={`pointer-events-none absolute -bottom-5 right-0 rounded bg-amber-600 px-1.5 py-0.5 text-[9px] font-black text-white ${inactiveCalibrationBadgeClass}`}>
                    要配置
                  </span>
                ) : null}
                {calibrationMode ? (
                  <>
                    {active ? (
                      <button
                        type="button"
                        aria-label={`${field.label}を移動`}
                        title={groupSelected && selectedGroupFieldKeys.size > 1 ? "组选中の枠をまとめて移動" : "このハンドルをドラッグして移動"}
                        className="absolute -left-2 -top-2 z-30 flex h-5 w-5 cursor-move items-center justify-center rounded-full border border-[#001e40] bg-white text-[#001e40] shadow hover:bg-[#eef4ff]"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          startDrag(event, field, "move");
                        }}
                        onPointerMove={updateDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        <span className="material-symbols-outlined text-[13px]">open_with</span>
                      </button>
                    ) : null}
                    {isTemplateAuthoring ? (
                      <button
                        type="button"
                        aria-label={`${field.label}を削除`}
                        title={`${field.label}を削除`}
                        className={`absolute -right-2 -top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-rose-300 bg-white text-[12px] font-black leading-none text-rose-700 shadow hover:bg-rose-50 ${inactiveCalibrationChromeClass}`}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          deleteField(field);
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                    <span
                      role="presentation"
                      className={`absolute -right-1 top-1/2 h-4 w-2 -translate-y-1/2 cursor-ew-resize rounded-full border border-[#001e40] bg-white shadow ${inactiveCalibrationChromeClass}`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startDrag(event, field, "resize-width");
                      }}
                      onPointerMove={updateDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                    <span
                      role="presentation"
                      className={`absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-[#001e40] bg-white shadow ${inactiveCalibrationChromeClass}`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startDrag(event, field, "resize-size");
                      }}
                      onPointerMove={updateDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  </>
                ) : null}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
