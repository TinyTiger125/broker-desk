import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  buildGuaranteeApplicationFieldValues,
  getGuaranteeCompanyTemplate,
  getGuaranteeFieldCompletionMode,
} from "@/lib/guarantee-application";
import { getCaseFieldDefinition } from "@/lib/case-field-catalog";
import { getCaseFieldValue } from "@/lib/case-field-normalization";

export const FRIENDS_GUARANTEE_TEMPLATE_PATH =
  process.env.FRIENDS_GUARANTEE_TEMPLATE_PATH ?? "/Users/laineyzhu/Desktop/房产专家资料库/５ふれんず保証.pdf";

const JAPANESE_FONT_CANDIDATES = [
  "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/ee89e7987a76cc8cfdff36c96bd7bc77655b343e.asset/AssetData/YuGothic-Medium.otf",
  "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/0b5bb0a7f7e82279e049e3c943133f4b186ff8a2.asset/AssetData/Osaka.ttf",
  "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
  "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
  "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
  "/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc",
  "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc",
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
];

export const FRIENDS_GUARANTEE_TEMPLATE_PAGE_SIZE = {
  width: 1190.55,
  height: 841.89,
} as const;

const CUSTOM_OVERLAY_FONT_SIZE_MIN = 5;
const CUSTOM_OVERLAY_FONT_SIZE_MAX = 18;

export type FriendsOverlayBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GuaranteePageSize = {
  width: number;
  height: number;
};

export type FriendsOverlaySegment = {
  cells: number;
  mode: "digits" | "amount";
  align?: "left" | "right";
  gap?: number;
  xInset?: number;
  yOffset?: number;
};

export type FriendsOverlayPrintMode = "auto" | "candidate" | "manual" | "never";

export type FriendsOverlayField = {
  fieldKey: string;
  sourceFieldKey?: string;
  label: string;
  x: number;
  y: number;
  size: number;
  maxWidth: number;
  minSize?: number;
  align?: "left" | "center" | "right";
  printMode?: FriendsOverlayPrintMode;
  print?: false;
  calibrationId?: string;
  calibrationNote?: string;
  box?: FriendsOverlayBox;
  segment?: FriendsOverlaySegment;
  valueFormat?:
    | "dateYmd"
    | "dateYmdShort"
    | "dateMd"
    | "dateMdWithoutDaySuffix"
    | "dateDigitsYmd"
    | "dateYear"
    | "dateYearShort"
    | "dateMonth"
    | "dateDay"
    | "phoneDigits"
    | "phonePart1"
    | "phonePart2"
    | "phonePart3"
    | "durationYears"
    | "addressPrefecture"
    | "addressMunicipality"
    | "addressStreet"
    | "addressRest";
  valuePart?: "firstToken" | "restTokens";
  dateParts?: {
    year: FriendsOverlayBox;
    month: FriendsOverlayBox;
    day: FriendsOverlayBox;
    yearFormat?: "full" | "short";
  };
  custom?: boolean;
  sizeOverride?: boolean;
};

type GuaranteeCheckboxOption = {
  x: number;
  y: number;
  size?: number;
  valueIncludes: string[];
};

type GuaranteeCheckboxField = {
  fieldKey: string;
  options: GuaranteeCheckboxOption[];
};

export type FriendsOverlayLayoutOverrides = Record<string, { box?: FriendsOverlayBox; size?: number }>;
export type FriendsCustomOverlayField = FriendsOverlayField & {
  custom: true;
  box: FriendsOverlayBox;
  value?: string;
};

export function getFriendsOverlayFieldPrintMode(field: Pick<FriendsOverlayField, "print" | "printMode">): FriendsOverlayPrintMode {
  return field.printMode ?? (field.print === false ? "manual" : "auto");
}

export function isFriendsOverlayFieldNeverPrinted(field: Pick<FriendsOverlayField, "print" | "printMode">) {
  return getFriendsOverlayFieldPrintMode(field) === "never";
}

export function isFriendsOverlayFieldManualOnly(field: Pick<FriendsOverlayField, "print" | "printMode">) {
  return getFriendsOverlayFieldPrintMode(field) === "manual";
}

function applyGuaranteeOverlayPrintMode(
  field: FriendsOverlayField,
  templateId: string,
): FriendsOverlayField {
  const template = getGuaranteeCompanyTemplate(templateId);
  const sourceFieldKey = field.sourceFieldKey ?? field.fieldKey;
  const configuredMode = template.fieldCompletionModes[field.fieldKey] ?? template.fieldCompletionModes[sourceFieldKey];
  const mode = getGuaranteeFieldCompletionMode(template, sourceFieldKey);
  if (field.printMode === "never" || field.printMode === "manual") return field;
  if (field.print === false && !configuredMode) return { ...field, printMode: "manual" };
  if (mode === "certified_auto") return { ...field, printMode: field.printMode ?? "auto" };
  if (mode === "manual_electronic") return { ...field, printMode: "manual" };
  return { ...field, printMode: "candidate" };
}

export type GuaranteePdfTemplateConfig = {
  id: string;
  companyDisplayName: string;
  pdfPath: string;
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  pageSize: GuaranteePageSize;
  overlayFields: readonly FriendsOverlayField[];
};

export const FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY = "__friendsGuaranteeLayoutOverrides";
export const FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY = "__friendsGuaranteeLayoutOverrideVersionsByTemplate";
export const FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY = "__friendsGuaranteeDeletedOverlayFieldsByTemplate";
export const FRIENDS_GUARANTEE_CUSTOM_FIELDS_KEY = "__friendsGuaranteeCustomOverlayFields";
export const GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY = "__guaranteeApplicationConfirmedOverlayFieldsByTemplate";
export const FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID = "friends_guarantee_individual_v1";

function boxFromTop(input: {
  pageHeight: number;
  x: number;
  top: number;
  width: number;
  height: number;
}): FriendsOverlayBox {
  return {
    x: input.x,
    y: input.pageHeight - input.top - input.height,
    width: input.width,
    height: input.height,
  };
}

function overlayFieldFromTop(input: {
  fieldKey: string;
  sourceFieldKey?: string;
  label: string;
  pageHeight: number;
  x: number;
  top: number;
  width: number;
  height: number;
  size?: number;
  minSize?: number;
  align?: FriendsOverlayField["align"];
  segment?: FriendsOverlaySegment;
  valueFormat?: FriendsOverlayField["valueFormat"];
  valuePart?: FriendsOverlayField["valuePart"];
  dateParts?: FriendsOverlayField["dateParts"];
  printMode?: FriendsOverlayPrintMode;
  print?: false;
  calibrationId?: string;
  calibrationNote?: string;
}): FriendsOverlayField {
  const size = input.size ?? 8;
  const box = boxFromTop(input);
  return {
    fieldKey: input.fieldKey,
    sourceFieldKey: input.sourceFieldKey,
    label: input.label,
    x: box.x + 3,
    y: box.y + Math.max(0, (box.height - size) / 2) + size * 0.1,
    size,
    maxWidth: Math.max(1, box.width - 6),
    minSize: input.minSize ?? Math.max(5, size - 2),
    align: input.align,
    segment: input.segment,
    valueFormat: input.valueFormat,
    valuePart: input.valuePart,
    dateParts: input.dateParts,
    printMode: input.printMode,
    print: input.print,
    calibrationId: input.calibrationId,
    calibrationNote: input.calibrationNote,
    box,
  };
}

function overlayBoxFromTop(input: {
  pageHeight: number;
  x: number;
  top: number;
  width: number;
  height: number;
}): FriendsOverlayBox {
  return {
    x: input.x,
    y: input.pageHeight - input.top - input.height,
    width: input.width,
    height: input.height,
  };
}

function overlayFieldFromImage(input: {
  fieldKey: string;
  label: string;
  pageSize: { width: number; height: number };
  imageSize: { width: number; height: number };
  x: number;
  top: number;
  width: number;
  height: number;
  size?: number;
  minSize?: number;
  align?: "right";
  segment?: FriendsOverlaySegment;
  valueFormat?: FriendsOverlayField["valueFormat"];
  print?: false;
}): FriendsOverlayField {
  const scaleX = input.pageSize.width / input.imageSize.width;
  const scaleY = input.pageSize.height / input.imageSize.height;
  return overlayFieldFromTop({
    fieldKey: input.fieldKey,
    label: input.label,
    pageHeight: input.pageSize.height,
    x: input.x * scaleX,
    top: input.top * scaleY,
    width: input.width * scaleX,
    height: input.height * scaleY,
    size: input.size,
    minSize: input.minSize,
    align: input.align,
    segment: input.segment,
    valueFormat: input.valueFormat,
    print: input.print,
  });
}

const AMOUNT_6: FriendsOverlaySegment = { mode: "amount", cells: 6, align: "right" };
const AMOUNT_7: FriendsOverlaySegment = { mode: "amount", cells: 7, align: "right" };
const DATE_8: FriendsOverlaySegment = { mode: "digits", cells: 8, align: "left" };
const PHONE_11: FriendsOverlaySegment = { mode: "digits", cells: 11, align: "left", xInset: 2, yOffset: -3 };
const PHONE_11_GRID: FriendsOverlaySegment = { mode: "digits", cells: 11, align: "left", yOffset: -3 };
const PHONE_12_GRID: FriendsOverlaySegment = { mode: "digits", cells: 12, align: "left", yOffset: -3 };
const POSTAL_7: FriendsOverlaySegment = { mode: "digits", cells: 7, align: "left", yOffset: -5.2 };
const POSTAL_7_PROPERTY: FriendsOverlaySegment = { ...POSTAL_7, yOffset: -4.4 };
const POSTAL_7_WORKPLACE: FriendsOverlaySegment = { ...POSTAL_7, yOffset: -0.8 };
const NIHON_SAFETY_PAGE_SIZE = { width: 841.89, height: 595.28 } as const;
const NIHON_SAFETY_IMAGE_SIZE = { width: 2400, height: 1696 } as const;
const NIHON_SAFETY_TEMPLATE_IMAGE_PATH = join(process.cwd(), "public/guarantee-templates/nihon-safety-v1-hd.png");

export const FRIENDS_OVERLAY_FIELDS = [
  { fieldKey: "property.name", label: "物件名", x: 98, y: 686, size: 10, maxWidth: 220, minSize: 7.2 },
  { fieldKey: "property.roomNumber", label: "号室", x: 360, y: 686, size: 10, maxWidth: 48 },
  { fieldKey: "property.address", label: "所在地", x: 98, y: 648, size: 9, maxWidth: 230, minSize: 7 },
  { fieldKey: "lease.moveInDate", label: "入居希望日", x: 444, y: 686, size: 9, maxWidth: 120 },
  { fieldKey: "lease.rent", label: "賃料", x: 166, y: 616, size: 9, maxWidth: 62, align: "right", segment: AMOUNT_7 },
  { fieldKey: "lease.deposit", label: "敷金", x: 326, y: 616, size: 9, maxWidth: 62, align: "right", segment: AMOUNT_7 },
  { fieldKey: "lease.commonFee", label: "共益費・管理費", x: 166, y: 592, size: 9, maxWidth: 62, align: "right", segment: AMOUNT_7 },
  { fieldKey: "lease.keyMoney", label: "礼金", x: 326, y: 592, size: 9, maxWidth: 62, align: "right", segment: AMOUNT_7 },
  { fieldKey: "lease.parkingFee", label: "駐車場代", x: 166, y: 568, size: 9, maxWidth: 62, align: "right", segment: AMOUNT_7 },
  { fieldKey: "lease.insuranceFee", label: "保険料", x: 326, y: 568, size: 9, maxWidth: 62, align: "right", segment: AMOUNT_7 },
  { fieldKey: "lease.keyExchangeFee", label: "鍵交換代", x: 326, y: 544, size: 9, maxWidth: 62, align: "right", segment: AMOUNT_7 },
  { fieldKey: "lease.monthlyRentTotal", label: "賃料合計", x: 166, y: 473, size: 9, maxWidth: 62, align: "right", segment: AMOUNT_7 },
  { fieldKey: "applicant.name", label: "申込者氏名", x: 100, y: 402, size: 10, maxWidth: 220 },
  { fieldKey: "applicant.furigana", label: "フリガナ", x: 100, y: 428, size: 9, maxWidth: 220 },
  { fieldKey: "applicant.birthDate", label: "生年月日", x: 455, y: 397, size: 9, maxWidth: 120 },
  { fieldKey: "applicant.phone", label: "携帯電話", x: 455, y: 339, size: 9, maxWidth: 120 },
  { fieldKey: "applicant.currentAddress", label: "現住所", x: 100, y: 370, size: 9, maxWidth: 220, minSize: 7 },
  { fieldKey: "applicant.residenceYears", label: "居住年数", x: 383, y: 370, size: 8, maxWidth: 52, box: { x: 382, y: 361, width: 56, height: 21 } },
  { fieldKey: "applicant.currentRent", label: "現家賃", x: 503, y: 345, size: 8, maxWidth: 66, align: "right", segment: AMOUNT_6, box: { x: 482, y: 347, width: 54, height: 18 } },
  { fieldKey: "applicant.employerFurigana", label: "勤務先フリガナ", x: 100, y: 323, size: 8, maxWidth: 220, minSize: 7, box: { x: 100, y: 316, width: 218, height: 15 } },
  { fieldKey: "applicant.employerName", label: "勤務先", x: 100, y: 298, size: 9, maxWidth: 220, minSize: 7 },
  { fieldKey: "applicant.employerPhone", label: "勤務先電話", x: 455, y: 298, size: 8, maxWidth: 115 },
  { fieldKey: "applicant.employerAddress", label: "勤務先住所", x: 100, y: 254, size: 8, maxWidth: 220, minSize: 7 },
  { fieldKey: "applicant.occupation", label: "業種", x: 455, y: 273, size: 8, maxWidth: 100, minSize: 7, box: { x: 455, y: 263, width: 100, height: 19 } },
  { fieldKey: "applicant.jobType", label: "職種", x: 455, y: 258, size: 8, maxWidth: 100, minSize: 7, box: { x: 455, y: 250, width: 100, height: 14 } },
  { fieldKey: "applicant.annualIncome", label: "年収", x: 455, y: 248, size: 8, maxWidth: 80, align: "right", segment: AMOUNT_6, box: { x: 445, y: 243, width: 78, height: 18 } },
  { fieldKey: "applicant.payday", label: "給料日", x: 455, y: 223, size: 8, maxWidth: 80, align: "right", box: { x: 455, y: 213, width: 80, height: 19 } },
  { fieldKey: "guarantor.furigana", label: "連帯保証人1 フリガナ", x: 678, y: 792, size: 7.2, maxWidth: 200, minSize: 6.2, box: { x: 678, y: 787, width: 200, height: 13 } },
  { fieldKey: "guarantor.name", label: "連帯保証人1 氏名", x: 678, y: 768, size: 8.2, maxWidth: 200, minSize: 6.4, box: { x: 678, y: 759, width: 200, height: 23 } },
  { fieldKey: "guarantor.birthDate", label: "連帯保証人1 生年月日", x: 1095, y: 768, size: 7.2, maxWidth: 68, box: { x: 1091, y: 755, width: 68, height: 32 } },
  { fieldKey: "guarantor.address", label: "連帯保証人1 現住所", x: 678, y: 722, size: 7.2, maxWidth: 198, minSize: 6.2, box: { x: 678, y: 701, width: 198, height: 28 } },
  { fieldKey: "guarantor.residenceYears", label: "連帯保証人1 居住年数", x: 955, y: 722, size: 7.2, maxWidth: 40, box: { x: 952, y: 701, width: 40, height: 28 } },
  { fieldKey: "guarantor.phone", label: "連帯保証人1 電話番号", x: 1048, y: 694, size: 7.2, maxWidth: 86, box: { x: 1048, y: 688, width: 86, height: 16 } },
  { fieldKey: "guarantor.employerFurigana", label: "連帯保証人1 勤務先フリガナ", x: 678, y: 675, size: 7.2, maxWidth: 210, minSize: 6.2, box: { x: 678, y: 668, width: 210, height: 16 } },
  { fieldKey: "guarantor.employerName", label: "連帯保証人1 勤務先名", x: 678, y: 650, size: 7.2, maxWidth: 210, minSize: 6.2, box: { x: 678, y: 640, width: 210, height: 21 } },
  { fieldKey: "guarantor.employerAddress", label: "連帯保証人1 勤務先住所", x: 678, y: 606, size: 7.2, maxWidth: 210, minSize: 6.2, box: { x: 678, y: 590, width: 210, height: 25 } },
  { fieldKey: "guarantor.occupation", label: "連帯保証人1 業種", x: 1020, y: 625, size: 7.2, maxWidth: 94, minSize: 6.2, box: { x: 1020, y: 620, width: 94, height: 16 } },
  { fieldKey: "guarantor.jobType", label: "連帯保証人1 職種", x: 1020, y: 610, size: 7.2, maxWidth: 94, minSize: 6.2, box: { x: 1020, y: 604, width: 94, height: 14 } },
  { fieldKey: "guarantor.annualIncome", label: "連帯保証人1 年収", x: 1020, y: 600, size: 7.2, maxWidth: 68, align: "right", segment: AMOUNT_6, box: { x: 1012, y: 594, width: 68, height: 16 } },
  { fieldKey: "guarantor.payday", label: "連帯保証人1 給料日", x: 1020, y: 577, size: 7.2, maxWidth: 68, align: "right", box: { x: 1012, y: 571, width: 68, height: 16 } },
  { fieldKey: "emergencyContact.name", label: "緊急連絡先氏名", x: 678, y: 535, size: 8.2, maxWidth: 200, minSize: 6.4, box: { x: 678, y: 526, width: 200, height: 23 } },
  { fieldKey: "emergencyContact.furigana", label: "緊急連絡先フリガナ", x: 678, y: 562, size: 7.2, maxWidth: 200, minSize: 6.2, box: { x: 678, y: 555, width: 200, height: 13 } },
  { fieldKey: "emergencyContact.birthDate", label: "生年月日", x: 1095, y: 535, size: 7.2, maxWidth: 68, box: { x: 1091, y: 522, width: 68, height: 32 } },
  { fieldKey: "emergencyContact.address", label: "現住所", x: 678, y: 500, size: 7.2, maxWidth: 198, minSize: 6.2, box: { x: 678, y: 476, width: 198, height: 30 } },
  { fieldKey: "emergencyContact.residenceYears", label: "居住年数", x: 955, y: 500, size: 7.2, maxWidth: 40, box: { x: 952, y: 476, width: 40, height: 30 } },
  { fieldKey: "emergencyContact.phone", label: "緊急連絡先電話", x: 1048, y: 464, size: 7.2, maxWidth: 86, box: { x: 1048, y: 458, width: 86, height: 17 } },
  { fieldKey: "emergencyContact.employerFurigana", label: "勤務先フリガナ", x: 678, y: 455, size: 7.2, maxWidth: 200, minSize: 6.2, box: { x: 678, y: 446, width: 200, height: 13 } },
  { fieldKey: "emergencyContact.employerName", label: "勤務先名", x: 678, y: 432, size: 7.2, maxWidth: 200, minSize: 6.2, box: { x: 678, y: 420, width: 200, height: 21 } },
  { fieldKey: "emergencyContact.employerAddress", label: "勤務先住所", x: 678, y: 362, size: 7.2, maxWidth: 210, minSize: 6.2, box: { x: 678, y: 344, width: 210, height: 26 } },
  { fieldKey: "emergencyContact.occupation", label: "業種", x: 1020, y: 408, size: 7.2, maxWidth: 94, minSize: 6.2, box: { x: 1020, y: 401, width: 94, height: 16 } },
  { fieldKey: "emergencyContact.jobType", label: "職種", x: 1020, y: 393, size: 7.2, maxWidth: 94, minSize: 6.2, box: { x: 1020, y: 387, width: 94, height: 14 } },
  { fieldKey: "emergencyContact.annualIncome", label: "年収", x: 1020, y: 383, size: 7.2, maxWidth: 68, align: "right", segment: AMOUNT_6, box: { x: 1012, y: 377, width: 68, height: 16 } },
  { fieldKey: "emergencyContact.payday", label: "給料日", x: 1020, y: 360, size: 7.2, maxWidth: 68, align: "right", box: { x: 1012, y: 354, width: 68, height: 16 } },
  { fieldKey: "coOccupants.0.furigana", label: "入居者1 フリガナ", x: 55, y: 162, size: 7.5, maxWidth: 165, minSize: 7 },
  { fieldKey: "coOccupants.0.name", label: "入居者1 氏名", x: 55, y: 142, size: 8, maxWidth: 178, minSize: 6 },
  { fieldKey: "coOccupants.0.relationship", label: "入居者1 続柄", x: 245, y: 142, size: 8, maxWidth: 38 },
  { fieldKey: "coOccupants.0.birthDate", label: "入居者1 生年月日", x: 305, y: 142, size: 8, maxWidth: 64 },
  { fieldKey: "coOccupants.0.phone", label: "入居者1 電話番号", x: 384, y: 142, size: 8, maxWidth: 86 },
  { fieldKey: "coOccupants.0.employerName", label: "入居者1 勤務先", x: 474, y: 142, size: 8, maxWidth: 100, minSize: 7 },
  { fieldKey: "coOccupants.1.furigana", label: "入居者2 フリガナ", x: 55, y: 111, size: 7.5, maxWidth: 165, minSize: 7 },
  { fieldKey: "coOccupants.1.name", label: "入居者2 氏名", x: 55, y: 91, size: 8, maxWidth: 178, minSize: 6 },
  { fieldKey: "coOccupants.1.relationship", label: "入居者2 続柄", x: 245, y: 91, size: 8, maxWidth: 38 },
  { fieldKey: "coOccupants.1.birthDate", label: "入居者2 生年月日", x: 305, y: 91, size: 8, maxWidth: 64 },
  { fieldKey: "coOccupants.1.phone", label: "入居者2 電話番号", x: 384, y: 91, size: 8, maxWidth: 86 },
  { fieldKey: "coOccupants.1.employerName", label: "入居者2 勤務先", x: 474, y: 91, size: 8, maxWidth: 100, minSize: 7 },
  { fieldKey: "coOccupants.2.furigana", label: "入居者3 フリガナ", x: 55, y: 59, size: 7.5, maxWidth: 165, minSize: 7 },
  { fieldKey: "coOccupants.2.name", label: "入居者3 氏名", x: 55, y: 39, size: 8, maxWidth: 178, minSize: 6 },
  { fieldKey: "coOccupants.2.relationship", label: "入居者3 続柄", x: 245, y: 39, size: 8, maxWidth: 38 },
  { fieldKey: "coOccupants.2.birthDate", label: "入居者3 生年月日", x: 305, y: 39, size: 8, maxWidth: 64 },
  { fieldKey: "coOccupants.2.phone", label: "入居者3 電話番号", x: 384, y: 39, size: 8, maxWidth: 86 },
  { fieldKey: "coOccupants.2.employerName", label: "入居者3 勤務先", x: 474, y: 39, size: 8, maxWidth: 100, minSize: 7 },
  { fieldKey: "broker.companyName", label: "仲介会社店舗", x: 675, y: 293, size: 9, maxWidth: 120, minSize: 7 },
  { fieldKey: "broker.address", label: "仲介会社住所", x: 675, y: 260, size: 8, maxWidth: 120, minSize: 7 },
  { fieldKey: "broker.phone", label: "仲介会社電話", x: 675, y: 240, size: 9, maxWidth: 120 },
  { fieldKey: "broker.staffName", label: "仲介会社担当者", x: 675, y: 213, size: 8, maxWidth: 120, minSize: 7 },
  { fieldKey: "management.companyName", label: "管理会社名", x: 930, y: 293, size: 9, maxWidth: 120, minSize: 7 },
  { fieldKey: "management.address", label: "管理会社住所", x: 930, y: 260, size: 8, maxWidth: 120, minSize: 7 },
  { fieldKey: "management.phone", label: "管理会社電話", x: 930, y: 240, size: 9, maxWidth: 120 },
  { fieldKey: "management.staffName", label: "管理会社担当者", x: 930, y: 213, size: 8, maxWidth: 120 },
] satisfies readonly FriendsOverlayField[];

const ZENHOREN_OVERLAY_FIELDS = [
  overlayFieldFromTop({ fieldKey: "broker.companyName", label: "協定会社名", pageHeight: 841.89, x: 112, top: 99, width: 360, height: 23, size: 8, minSize: 5.5 }),
  overlayFieldFromTop({ fieldKey: "broker.staffName", label: "担当", pageHeight: 841.89, x: 506, top: 99, width: 78, height: 23, size: 8, minSize: 5.5 }),
  overlayFieldFromTop({ fieldKey: "broker.phone", label: "協定会社TEL", pageHeight: 841.89, x: 112, top: 124, width: 130, height: 22, size: 8, minSize: 5.5 }),
  overlayFieldFromTop({ fieldKey: "broker.fax", label: "FAX", pageHeight: 841.89, x: 302, top: 124, width: 130, height: 22, size: 8, minSize: 5.5 }),
  overlayFieldFromTop({ fieldKey: "broker.agentCompanyName", label: "仲介会社名", pageHeight: 841.89, x: 112, top: 150, width: 130, height: 22, size: 8, minSize: 5.5 }),
  overlayFieldFromTop({ fieldKey: "broker.agentPhone", label: "仲介会社TEL", pageHeight: 841.89, x: 302, top: 150, width: 130, height: 22, size: 8, minSize: 5.5 }),
  overlayFieldFromTop({ fieldKey: "broker.agentFax", label: "仲介会社FAX", pageHeight: 841.89, x: 500, top: 150, width: 84, height: 22, size: 8, minSize: 5.5 }),
  overlayFieldFromTop({ fieldKey: "application.submittedMonth", label: "申込日 月", pageHeight: 841.89, x: 140, top: 179, width: 30, height: 19, size: 8, minSize: 5.5, align: "right" }),
  overlayFieldFromTop({ fieldKey: "application.submittedDay", label: "申込日 日", pageHeight: 841.89, x: 190, top: 179, width: 30, height: 19, size: 8, minSize: 5.5, align: "right" }),
  overlayFieldFromTop({ fieldKey: "lease.moveInDate", label: "入居日", pageHeight: 841.89, x: 274, top: 179, width: 82, height: 19, size: 8, minSize: 5.5, valueFormat: "dateMdWithoutDaySuffix" }),
  overlayFieldFromTop({ fieldKey: "property.furigana", label: "物件フリガナ", pageHeight: 841.89, x: 98, top: 203, width: 390, height: 16, size: 7, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "property.name", label: "物件名", pageHeight: 841.89, x: 98, top: 220, width: 390, height: 22, size: 8.5, minSize: 5.2 }),
  overlayFieldFromTop({ fieldKey: "property.roomNumber", label: "号室", pageHeight: 841.89, x: 501, top: 220, width: 76, height: 23, size: 8, minSize: 5.5 }),
  overlayFieldFromTop({
    fieldKey: "property.postalCode",
    label: "物件郵便番号",
    pageHeight: 841.89,
    x: 111.8,
    top: 245,
    width: 106.3,
    height: 24,
    size: 7.2,
    minSize: 5.5,
    segment: POSTAL_7_PROPERTY,
  }),
  overlayFieldFromTop({ fieldKey: "property.address.prefecture", sourceFieldKey: "property.address", label: "物件 都道府県", pageHeight: 841.89, x: 102, top: 279, width: 58, height: 22, size: 7.2, minSize: 5, valueFormat: "addressPrefecture" }),
  overlayFieldFromTop({ fieldKey: "property.address.rest", sourceFieldKey: "property.address", label: "物件 住所続き", pageHeight: 841.89, x: 180, top: 279, width: 340, height: 22, size: 7.2, minSize: 5, valueFormat: "addressRest" }),
  overlayFieldFromTop({ fieldKey: "lease.rent", label: "家賃", pageHeight: 841.89, x: 102, top: 350, width: 104, height: 18, size: 7.2, minSize: 5, align: "right", segment: AMOUNT_7 }),
  overlayFieldFromTop({ fieldKey: "lease.deposit", label: "敷金・保証金", pageHeight: 841.89, x: 460, top: 350, width: 112, height: 18, size: 7.2, minSize: 5, align: "right", segment: AMOUNT_7 }),
  overlayFieldFromTop({ fieldKey: "lease.commonFee", label: "共益費・管理費", pageHeight: 841.89, x: 102, top: 374, width: 104, height: 18, size: 7.2, minSize: 5, align: "right", segment: AMOUNT_7 }),
  overlayFieldFromTop({ fieldKey: "lease.keyMoney", label: "礼金", pageHeight: 841.89, x: 460, top: 374, width: 112, height: 18, size: 7.2, minSize: 5, align: "right", segment: AMOUNT_7 }),
  overlayFieldFromTop({ fieldKey: "lease.parkingFee", label: "駐車場", pageHeight: 841.89, x: 102, top: 398, width: 104, height: 18, size: 7.2, minSize: 5, align: "right", segment: AMOUNT_7 }),
  overlayFieldFromTop({ fieldKey: "lease.monthlyRentTotal", label: "月額賃料", pageHeight: 841.89, x: 278, top: 398, width: 112, height: 18, size: 7.2, minSize: 5, align: "right", segment: AMOUNT_7 }),
  overlayFieldFromTop({
    fieldKey: "lease.insuranceFee",
    label: "保険料",
    pageHeight: 841.89,
    x: 460,
    top: 398,
    width: 112,
    height: 18,
    size: 7.2,
    minSize: 5,
    align: "right",
    segment: AMOUNT_7,
    printMode: "never",
    print: false,
    calibrationId: "zenhoren-v1-amount-insurance-fee",
    calibrationNote: "全保連の該当枠は敷引（解約引き）であり、保険料を自動印字しない。",
  }),
  overlayFieldFromTop({ fieldKey: "applicant.furigana.family", sourceFieldKey: "applicant.furigana", label: "申込者フリガナ 姓", pageHeight: 841.89, x: 704, top: 340, width: 198, height: 16, size: 7, minSize: 5, valuePart: "firstToken" }),
  overlayFieldFromTop({ fieldKey: "applicant.furigana.given", sourceFieldKey: "applicant.furigana", label: "申込者フリガナ 名", pageHeight: 841.89, x: 914, top: 340, width: 198, height: 16, size: 7, minSize: 5, valuePart: "restTokens" }),
  overlayFieldFromTop({ fieldKey: "applicant.name.family", sourceFieldKey: "applicant.name", label: "申込者氏名 姓", pageHeight: 841.89, x: 704, top: 359, width: 198, height: 30, size: 9, minSize: 5.5, valuePart: "firstToken" }),
  overlayFieldFromTop({ fieldKey: "applicant.name.given", sourceFieldKey: "applicant.name", label: "申込者氏名 名", pageHeight: 841.89, x: 914, top: 359, width: 198, height: 30, size: 9, minSize: 5.5, valuePart: "restTokens" }),
  overlayFieldFromTop({
    fieldKey: "applicant.birthDate",
    label: "生年月日",
    pageHeight: 841.89,
    x: 696,
    top: 389,
    width: 220,
    height: 20,
    size: 8,
    minSize: 5,
    valueFormat: "dateYmd",
    dateParts: {
      year: overlayBoxFromTop({ pageHeight: 841.89, x: 704, top: 389, width: 58, height: 20 }),
      month: overlayBoxFromTop({ pageHeight: 841.89, x: 768, top: 389, width: 42, height: 20 }),
      day: overlayBoxFromTop({ pageHeight: 841.89, x: 808, top: 389, width: 42, height: 20 }),
    },
  }),
  overlayFieldFromTop({
    fieldKey: "applicant.driverLicenseNumber",
    label: "免許番号",
    pageHeight: 841.89,
    x: 954,
    top: 389,
    width: 220,
    height: 20,
    size: 6.8,
    minSize: 5,
    segment: { mode: "digits", cells: 12, align: "left" },
  }),
  overlayFieldFromTop({ fieldKey: "applicant.phone", label: "携帯電話", pageHeight: 841.89, x: 971.0, top: 464, width: 205.3, height: 28, size: 6.8, minSize: 5, segment: PHONE_11_GRID }),
  overlayFieldFromTop({ fieldKey: "applicant.email", label: "メールアドレス", pageHeight: 841.89, x: 862, top: 500, width: 150, height: 20, size: 7, minSize: 5, printMode: "manual", print: false, calibrationId: "zenhoren-v1-applicant-email", calibrationNote: "欄位置が狭く、初期値では印字しない。必要時にプレビューで配置する。" }),
  overlayFieldFromTop({
    fieldKey: "applicant.currentPostalCode",
    label: "現住所 郵便番号",
    pageHeight: 841.89,
    x: 707.3,
    top: 405,
    width: 106.2,
    height: 24,
    size: 7.2,
    minSize: 5,
    segment: POSTAL_7,
  }),
  overlayFieldFromTop({ fieldKey: "applicant.currentAddress.prefecture", sourceFieldKey: "applicant.currentAddress", label: "現住所 都道府県", pageHeight: 841.89, x: 704, top: 423, width: 124, height: 28, size: 7.2, minSize: 5, valueFormat: "addressPrefecture" }),
  overlayFieldFromTop({ fieldKey: "applicant.currentAddress.rest", sourceFieldKey: "applicant.currentAddress", label: "現住所 続き", pageHeight: 841.89, x: 860, top: 423, width: 310, height: 28, size: 7.2, minSize: 5, valueFormat: "addressRest" }),
  overlayFieldFromTop({ fieldKey: "applicant.employerName", label: "勤務先名称", pageHeight: 841.89, x: 704, top: 506, width: 210, height: 23, size: 7.5, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "applicant.employerPhone", label: "勤務先電話", pageHeight: 841.89, x: 952.9, top: 504, width: 222.8, height: 24, size: 6.8, minSize: 5, segment: PHONE_12_GRID }),
  overlayFieldFromTop({
    fieldKey: "applicant.employerPostalCode",
    label: "勤務先 郵便番号",
    pageHeight: 841.89,
    x: 707.3,
    top: 534,
    width: 106.2,
    height: 24,
    size: 7.2,
    minSize: 5,
    segment: POSTAL_7_WORKPLACE,
  }),
  overlayFieldFromTop({ fieldKey: "applicant.employerAddress.prefecture", sourceFieldKey: "applicant.employerAddress", label: "勤務先 都道府県", pageHeight: 841.89, x: 704, top: 552, width: 124, height: 28, size: 7.2, minSize: 5, valueFormat: "addressPrefecture" }),
  overlayFieldFromTop({ fieldKey: "applicant.employerAddress.rest", sourceFieldKey: "applicant.employerAddress", label: "勤務先住所 続き", pageHeight: 841.89, x: 704, top: 570, width: 360, height: 20, size: 7.2, minSize: 5, valueFormat: "addressRest" }),
  overlayFieldFromTop({ fieldKey: "applicant.annualIncome", label: "年収", pageHeight: 841.89, x: 688, top: 595, width: 112, height: 21, size: 7.2, minSize: 5, align: "right" }),
  overlayFieldFromTop({ fieldKey: "applicant.yearsEmployed", label: "勤続年数", pageHeight: 841.89, x: 810, top: 595, width: 92, height: 21, size: 7.2, minSize: 5, align: "right", valueFormat: "durationYears" }),
  overlayFieldFromTop({ fieldKey: "applicant.occupation", label: "勤務先業種", pageHeight: 841.89, x: 1066, top: 595, width: 108, height: 21, size: 7.2, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.furigana", label: "同居人1フリガナ", pageHeight: 841.89, x: 704, top: 618, width: 210, height: 15, size: 5.8, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.name", label: "同居人1氏名", pageHeight: 841.89, x: 704, top: 635, width: 210, height: 17, size: 6.6, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.relationship", label: "同居人1続柄", pageHeight: 841.89, x: 918, top: 635, width: 48, height: 17, size: 6, minSize: 5 }),
  overlayFieldFromTop({
    fieldKey: "coOccupants.0.birthDate",
    label: "同居人1生年月日",
    pageHeight: 841.89,
    x: 954,
    top: 636,
    width: 210,
    height: 17,
    size: 6,
    minSize: 4.8,
    valueFormat: "dateYmd",
    printMode: "manual",
    print: false,
    calibrationId: "zenhoren-v1-cooccupant-1-birth-date",
    calibrationNote: "生年月日ラベルとの干渉が残るため初期印字しない。必要時にプレビューで配置する。",
    dateParts: {
      year: overlayBoxFromTop({ pageHeight: 841.89, x: 994, top: 636, width: 72, height: 17 }),
      month: overlayBoxFromTop({ pageHeight: 841.89, x: 1096, top: 636, width: 42, height: 17 }),
      day: overlayBoxFromTop({ pageHeight: 841.89, x: 1152, top: 636, width: 30, height: 17 }),
    },
  }),
  overlayFieldFromTop({
    fieldKey: "coOccupants.0.phone",
    label: "同居人1携帯電話",
    pageHeight: 841.89,
    x: 1008,
    top: 649,
    width: 163,
    height: 18,
    size: 5.8,
    minSize: 4.8,
    segment: PHONE_11,
    printMode: "manual",
    print: false,
    calibrationId: "zenhoren-v1-cooccupant-1-phone",
    calibrationNote: "同居人電話欄は初期自動印字の視覚基準未達のため、プレビューで確認・配置した場合のみ印字する。",
  }),
  overlayFieldFromTop({ fieldKey: "coOccupants.1.furigana", label: "同居人2フリガナ", pageHeight: 841.89, x: 704, top: 664, width: 210, height: 15, size: 5.8, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "coOccupants.1.name", label: "同居人2氏名", pageHeight: 841.89, x: 704, top: 681, width: 210, height: 17, size: 6.6, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "coOccupants.1.relationship", label: "同居人2続柄", pageHeight: 841.89, x: 918, top: 681, width: 48, height: 17, size: 6, minSize: 5 }),
  overlayFieldFromTop({
    fieldKey: "coOccupants.1.birthDate",
    label: "同居人2生年月日",
    pageHeight: 841.89,
    x: 954,
    top: 682,
    width: 210,
    height: 17,
    size: 6,
    minSize: 4.8,
    valueFormat: "dateYmd",
    printMode: "manual",
    print: false,
    calibrationId: "zenhoren-v1-cooccupant-2-birth-date",
    calibrationNote: "生年月日ラベルとの干渉が残るため初期印字しない。必要時にプレビューで配置する。",
    dateParts: {
      year: overlayBoxFromTop({ pageHeight: 841.89, x: 994, top: 682, width: 72, height: 17 }),
      month: overlayBoxFromTop({ pageHeight: 841.89, x: 1096, top: 682, width: 42, height: 17 }),
      day: overlayBoxFromTop({ pageHeight: 841.89, x: 1152, top: 682, width: 30, height: 17 }),
    },
  }),
  overlayFieldFromTop({
    fieldKey: "coOccupants.1.phone",
    label: "同居人2携帯電話",
    pageHeight: 841.89,
    x: 1008,
    top: 695,
    width: 163,
    height: 18,
    size: 5.8,
    minSize: 4.8,
    segment: PHONE_11,
    printMode: "manual",
    print: false,
    calibrationId: "zenhoren-v1-cooccupant-2-phone",
    calibrationNote: "同居人電話欄は初期自動印字の視覚基準未達のため、プレビューで確認・配置した場合のみ印字する。",
  }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.furigana", label: "緊急連絡先フリガナ", pageHeight: 841.89, x: 704, top: 713, width: 220, height: 18, size: 6.8, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.name", label: "緊急連絡先氏名", pageHeight: 841.89, x: 704, top: 733, width: 220, height: 23, size: 7.8, minSize: 5 }),
  overlayFieldFromTop({
    fieldKey: "emergencyContact.birthDate",
    label: "緊急連絡先生年月日",
    pageHeight: 841.89,
    x: 1010,
    top: 733,
    width: 170,
    height: 22,
    size: 8,
    minSize: 5,
    valueFormat: "dateYmd",
    dateParts: {
      year: overlayBoxFromTop({ pageHeight: 841.89, x: 986, top: 733, width: 42, height: 22 }),
      month: overlayBoxFromTop({ pageHeight: 841.89, x: 1038, top: 733, width: 30, height: 22 }),
      day: overlayBoxFromTop({ pageHeight: 841.89, x: 1088, top: 733, width: 30, height: 22 }),
    },
  }),
  overlayFieldFromTop({
    fieldKey: "emergencyContact.postalCode",
    label: "緊急連絡先 郵便番号",
    pageHeight: 841.89,
    x: 707.3,
    top: 752,
    width: 106.2,
    height: 24,
    size: 7.2,
    minSize: 5,
    segment: POSTAL_7_WORKPLACE,
  }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.address.prefecture", sourceFieldKey: "emergencyContact.address", label: "緊急連絡先 都道府県", pageHeight: 841.89, x: 704, top: 770, width: 124, height: 28, size: 6.8, minSize: 5, valueFormat: "addressPrefecture" }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.address.rest", sourceFieldKey: "emergencyContact.address", label: "緊急連絡先住所 続き", pageHeight: 841.89, x: 860, top: 770, width: 310, height: 28, size: 6.8, minSize: 5, valueFormat: "addressRest" }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.phone", label: "緊急連絡先電話", pageHeight: 841.89, x: 979.0, top: 789, width: 196.0, height: 24, size: 6.8, minSize: 5, segment: PHONE_11_GRID }),
] satisfies readonly FriendsOverlayField[];

const nihonSafetyField = (input: Omit<Parameters<typeof overlayFieldFromImage>[0], "pageSize" | "imageSize">) =>
  overlayFieldFromImage({
    ...input,
    pageSize: NIHON_SAFETY_PAGE_SIZE,
    imageSize: NIHON_SAFETY_IMAGE_SIZE,
  });

const NIHON_SAFETY_OVERLAY_FIELDS = [
  nihonSafetyField({ fieldKey: "applicant.furigana", label: "申込者フリガナ", x: 205, top: 190, width: 560, height: 38, size: 7.2, minSize: 5 }),
  nihonSafetyField({ fieldKey: "applicant.name", label: "申込者氏名", x: 205, top: 230, width: 560, height: 80, size: 8.5, minSize: 5 }),
  nihonSafetyField({ fieldKey: "applicant.birthDate", label: "生年月日", x: 300, top: 315, width: 245, height: 52, size: 7, minSize: 5, valueFormat: "dateYmd" }),
  nihonSafetyField({ fieldKey: "applicant.phone", label: "携帯TEL", x: 845, top: 315, width: 305, height: 50, size: 7.2, minSize: 5 }),
  nihonSafetyField({ fieldKey: "applicant.currentAddress", label: "現住所", x: 855, top: 190, width: 800, height: 72, size: 7, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "applicant.employerFurigana", label: "勤務先フリガナ", x: 205, top: 435, width: 560, height: 34, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "applicant.employerName", label: "勤務先/学校名", x: 205, top: 468, width: 560, height: 58, size: 7.2, minSize: 5 }),
  nihonSafetyField({ fieldKey: "applicant.employerAddress", label: "勤務先所在地", x: 850, top: 435, width: 810, height: 90, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "applicant.employerPhone", label: "勤務先TEL", x: 205, top: 530, width: 340, height: 52, size: 7, minSize: 5 }),
  nihonSafetyField({ fieldKey: "applicant.annualIncome", label: "月収", x: 855, top: 530, width: 120, height: 52, size: 7, minSize: 5, align: "right", segment: AMOUNT_6, print: false }),
  nihonSafetyField({ fieldKey: "applicant.occupation", label: "業種", x: 1015, top: 530, width: 300, height: 52, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "applicant.jobType", label: "職種", x: 1355, top: 530, width: 300, height: 52, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "coOccupants.0.furigana", label: "入居者1 フリガナ", x: 205, top: 650, width: 345, height: 34, size: 6.4, minSize: 4.8, print: false }),
  nihonSafetyField({ fieldKey: "coOccupants.0.name", label: "入居者1 氏名", x: 205, top: 684, width: 345, height: 50, size: 6.8, minSize: 4.8, print: false }),
  nihonSafetyField({ fieldKey: "coOccupants.0.relationship", label: "入居者1 続柄", x: 580, top: 684, width: 80, height: 50, size: 6.5, minSize: 4.8, print: false }),
  nihonSafetyField({ fieldKey: "coOccupants.0.birthDate", label: "入居者1 生年月日", x: 665, top: 684, width: 250, height: 50, size: 6.2, minSize: 4.8, valueFormat: "dateYmd", print: false }),
  nihonSafetyField({ fieldKey: "coOccupants.0.phone", label: "入居者1 携帯番号", x: 915, top: 684, width: 290, height: 50, size: 6.2, minSize: 4.8, print: false }),
  nihonSafetyField({ fieldKey: "coOccupants.0.employerName", label: "入居者1 勤務先", x: 1205, top: 684, width: 460, height: 50, size: 6.2, minSize: 4.8, print: false }),
  nihonSafetyField({ fieldKey: "emergencyContact.furigana", label: "緊急連絡先フリガナ", x: 205, top: 978, width: 390, height: 36, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "emergencyContact.name", label: "緊急連絡先氏名", x: 205, top: 1016, width: 390, height: 64, size: 7.5, minSize: 5 }),
  nihonSafetyField({ fieldKey: "emergencyContact.phone", label: "緊急連絡先電話", x: 780, top: 982, width: 300, height: 70, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "emergencyContact.address", label: "緊急連絡先住所", x: 1140, top: 982, width: 530, height: 92, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "lease.moveInDate", label: "入居予定日", x: 2205, top: 372, width: 160, height: 44, size: 7.2, minSize: 5, valueFormat: "dateYmdShort", print: false }),
  nihonSafetyField({ fieldKey: "property.name", label: "物件名", x: 1705, top: 498, width: 590, height: 88, size: 7.2, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "property.roomNumber", label: "号室", x: 2285, top: 560, width: 80, height: 40, size: 7, minSize: 5, align: "right" }),
  nihonSafetyField({ fieldKey: "property.address", label: "所在地", x: 1705, top: 620, width: 610, height: 112, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "broker.companyName", label: "仲介店名", x: 1710, top: 742, width: 300, height: 46, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "broker.phone", label: "仲介店TEL", x: 2070, top: 742, width: 250, height: 46, size: 6.8, minSize: 4.8 }),
  nihonSafetyField({ fieldKey: "lease.keyMoney", label: "礼金", x: 1810, top: 906, width: 150, height: 40, size: 6.4, minSize: 5, align: "right" }),
  nihonSafetyField({ fieldKey: "lease.deposit", label: "敷金", x: 1810, top: 952, width: 150, height: 40, size: 6.4, minSize: 5, align: "right" }),
  nihonSafetyField({ fieldKey: "lease.rent", label: "月額賃料", x: 2130, top: 906, width: 150, height: 40, size: 6.4, minSize: 5, align: "right" }),
  nihonSafetyField({ fieldKey: "lease.commonFee", label: "管理費/共益費", x: 2130, top: 952, width: 150, height: 40, size: 6.4, minSize: 5, align: "right" }),
  nihonSafetyField({ fieldKey: "lease.parkingFee", label: "駐車場", x: 2130, top: 998, width: 150, height: 40, size: 6.4, minSize: 5, align: "right" }),
  nihonSafetyField({ fieldKey: "lease.monthlyRentTotal", label: "合計", x: 2130, top: 1254, width: 150, height: 40, size: 6.4, minSize: 5, align: "right" }),
  nihonSafetyField({ fieldKey: "guarantee.plan", label: "賃貸保証プラン", x: 1790, top: 1400, width: 480, height: 60, size: 6.8, minSize: 4.8, print: false }),
] satisfies readonly FriendsOverlayField[];

const J_LEASE_OVERLAY_FIELDS = [
  overlayFieldFromTop({ fieldKey: "applicant.furigana", label: "申込者フリガナ", pageHeight: 841.92, x: 92, top: 96, width: 110, height: 15, size: 6.4, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "applicant.name", label: "申込者氏名", pageHeight: 841.92, x: 92, top: 112, width: 110, height: 30, size: 7.8, minSize: 5 }),
  overlayFieldFromTop({
    fieldKey: "applicant.birthDate",
    label: "生年月日",
    pageHeight: 841.92,
    x: 393,
    top: 96,
    width: 198,
    height: 16,
    size: 6.2,
    minSize: 4.8,
    valueFormat: "dateYmd",
    dateParts: {
      year: boxFromTop({ pageHeight: 841.92, x: 388, top: 99, width: 82, height: 12 }),
      month: boxFromTop({ pageHeight: 841.92, x: 488, top: 99, width: 24, height: 12 }),
      day: boxFromTop({ pageHeight: 841.92, x: 540, top: 99, width: 24, height: 12 }),
    },
  }),
  overlayFieldFromTop({ fieldKey: "applicant.phone", label: "携帯電話", pageHeight: 841.92, x: 405, top: 146, width: 158, height: 18, size: 6.8, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "applicant.email", label: "mail", pageHeight: 841.92, x: 244, top: 131, width: 145, height: 13, size: 5.8, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "applicant.currentAddress", label: "現住所", pageHeight: 841.92, x: 230, top: 168, width: 260, height: 20, size: 5.8, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "applicant.employerFurigana", label: "勤務先フリガナ", pageHeight: 841.92, x: 103, top: 191, width: 132, height: 12, size: 5.8, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "applicant.employerName", label: "勤務先名称", pageHeight: 841.92, x: 103, top: 205, width: 132, height: 18, size: 6.5, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "applicant.employerPhone", label: "勤務先電話", pageHeight: 841.92, x: 312, top: 205, width: 78, height: 18, size: 6.2, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "applicant.employerAddress", label: "勤務先住所", pageHeight: 841.92, x: 230, top: 242, width: 260, height: 20, size: 5.8, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "applicant.occupation", label: "事業内容", pageHeight: 841.92, x: 72, top: 269, width: 78, height: 16, size: 6.1, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "applicant.annualIncome", label: "年収", pageHeight: 841.92, x: 306, top: 269, width: 64, height: 16, size: 6.1, minSize: 4.8, align: "right" }),
  overlayFieldFromTop({ fieldKey: "applicant.yearsEmployed", label: "勤続年数", pageHeight: 841.92, x: 442, top: 269, width: 58, height: 16, size: 6.1, minSize: 4.8, valueFormat: "durationYears" }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.furigana", label: "同居人1フリガナ", pageHeight: 841.92, x: 67, top: 356, width: 155, height: 12, size: 5.6, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.name", label: "同居人1氏名", pageHeight: 841.92, x: 67, top: 375, width: 155, height: 18, size: 6.2, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.relationship", label: "同居人1続柄", pageHeight: 841.92, x: 226, top: 375, width: 36, height: 18, size: 6.2, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.birthDate", label: "同居人1生年月日", pageHeight: 841.92, x: 267, top: 375, width: 72, height: 18, size: 5.8, minSize: 4.8, valueFormat: "dateYmd", print: false }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.phone", label: "同居人1携帯電話", pageHeight: 841.92, x: 345, top: 375, width: 75, height: 18, size: 5.8, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.furigana", label: "緊急連絡先フリガナ", pageHeight: 841.92, x: 67, top: 445, width: 135, height: 14, size: 5.8, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.name", label: "緊急連絡先氏名", pageHeight: 841.92, x: 67, top: 461, width: 135, height: 24, size: 7, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.birthDate", label: "緊急連絡先生年月日", pageHeight: 841.92, x: 393, top: 445, width: 162, height: 16, size: 6.2, minSize: 4.8, valueFormat: "dateDigitsYmd", segment: DATE_8, print: false }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.phone", label: "緊急連絡先電話", pageHeight: 841.92, x: 67, top: 486, width: 135, height: 18, size: 6.2, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.address", label: "緊急連絡先住所", pageHeight: 841.92, x: 332, top: 463, width: 230, height: 22, size: 6.2, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "lease.moveInDate", label: "入居予定日", pageHeight: 841.92, x: 293, top: 627, width: 92, height: 19, size: 6.5, minSize: 4.8, valueFormat: "dateYmdShort", print: false }),
  overlayFieldFromTop({ fieldKey: "property.name", label: "物件名", pageHeight: 841.92, x: 95, top: 647, width: 225, height: 25, size: 6.8, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "property.roomNumber", label: "号室", pageHeight: 841.92, x: 326, top: 647, width: 65, height: 25, size: 6.8, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "property.address", label: "物件所在地", pageHeight: 841.92, x: 222, top: 682, width: 160, height: 24, size: 5.8, minSize: 4.8 }),
  overlayFieldFromTop({ fieldKey: "lease.rent", label: "家賃", pageHeight: 841.92, x: 480, top: 636, width: 72, height: 17, size: 6.2, minSize: 4.8, align: "right" }),
  overlayFieldFromTop({ fieldKey: "lease.commonFee", label: "共益費・管理費", pageHeight: 841.92, x: 480, top: 659, width: 72, height: 17, size: 6.2, minSize: 4.8, align: "right" }),
  overlayFieldFromTop({ fieldKey: "lease.parkingFee", label: "駐車場料金", pageHeight: 841.92, x: 480, top: 682, width: 72, height: 17, size: 6.2, minSize: 4.8, align: "right" }),
  overlayFieldFromTop({ fieldKey: "lease.monthlyRentTotal", label: "月額総賃料", pageHeight: 841.92, x: 472, top: 770, width: 82, height: 19, size: 6.2, minSize: 4.8, align: "right", print: false }),
  overlayFieldFromTop({ fieldKey: "guarantee.plan", label: "保証プラン", pageHeight: 841.92, x: 213, top: 779, width: 180, height: 18, size: 6.2, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "broker.companyName", label: "協定不動産会社名", pageHeight: 841.92, x: 92, top: 783, width: 185, height: 18, size: 5.8, minSize: 4.8 }),
] satisfies readonly FriendsOverlayField[];

const INSURE_OVERLAY_FIELDS = [
  overlayFieldFromTop({ fieldKey: "applicant.name", label: "申込者氏名", pageHeight: 539, x: 49, top: 92, width: 150, height: 31, size: 7.5, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "applicant.furigana", label: "申込者フリガナ", pageHeight: 539, x: 49, top: 82, width: 150, height: 12, size: 6.5, minSize: 5 }),
  overlayFieldFromTop({
    fieldKey: "applicant.birthDate",
    label: "生年月日",
    pageHeight: 539,
    x: 278,
    top: 82,
    width: 102,
    height: 18,
    size: 6.2,
    minSize: 5,
    valueFormat: "dateYmd",
    print: false,
    dateParts: {
      year: boxFromTop({ pageHeight: 539, x: 258, top: 86, width: 34, height: 10 }),
      month: boxFromTop({ pageHeight: 539, x: 305, top: 86, width: 14, height: 10 }),
      day: boxFromTop({ pageHeight: 539, x: 344, top: 86, width: 14, height: 10 }),
    },
  }),
  overlayFieldFromTop({ fieldKey: "applicant.phone", label: "電話番号", pageHeight: 539, x: 273, top: 103, width: 110, height: 14, size: 7, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "applicant.email", label: "mail", pageHeight: 539, x: 272, top: 124, width: 110, height: 14, size: 6.5, minSize: 5, print: false }),
  overlayFieldFromTop({ fieldKey: "applicant.currentAddress", label: "現住所", pageHeight: 539, x: 49, top: 145, width: 300, height: 31, size: 6.8, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "applicant.employerFurigana", label: "勤務先フリガナ", pageHeight: 539, x: 49, top: 190, width: 162, height: 13, size: 6.2, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "applicant.employerName", label: "勤務先", pageHeight: 539, x: 49, top: 205, width: 162, height: 18, size: 6.8, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "applicant.employerAddress", label: "勤務先所在地", pageHeight: 539, x: 49, top: 226, width: 162, height: 25, size: 6.5, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "applicant.occupation", label: "業種", pageHeight: 539, x: 151, top: 260, width: 58, height: 17, size: 6.5, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "applicant.annualIncome", label: "年収", pageHeight: 539, x: 241, top: 260, width: 54, height: 17, size: 6.5, minSize: 5, align: "right", print: false }),
  overlayFieldFromTop({ fieldKey: "applicant.yearsEmployed", label: "勤続年数", pageHeight: 539, x: 330, top: 260, width: 50, height: 17, size: 6.5, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.name", label: "同居人1氏名", pageHeight: 539, x: 49, top: 288, width: 95, height: 16, size: 6, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.relationship", label: "同居人1続柄", pageHeight: 539, x: 148, top: 288, width: 44, height: 16, size: 6, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.birthDate", label: "同居人1生年月日", pageHeight: 539, x: 200, top: 288, width: 60, height: 16, size: 5.8, minSize: 4.8, valueFormat: "dateYmd", print: false }),
  overlayFieldFromTop({ fieldKey: "coOccupants.0.phone", label: "同居人1電話", pageHeight: 539, x: 265, top: 288, width: 65, height: 16, size: 5.8, minSize: 4.8, print: false }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.name", label: "連帯保証人/緊急連絡先氏名", pageHeight: 539, x: 49, top: 360, width: 150, height: 31, size: 7.5, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.furigana", label: "フリガナ", pageHeight: 539, x: 49, top: 350, width: 150, height: 12, size: 6.5, minSize: 5, print: false }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.birthDate", label: "生年月日", pageHeight: 539, x: 250, top: 345, width: 110, height: 18, size: 7, minSize: 5, valueFormat: "dateYmd", print: false }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.phone", label: "電話番号", pageHeight: 539, x: 273, top: 368, width: 110, height: 14, size: 7, minSize: 5, print: false }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.address", label: "現住所", pageHeight: 539, x: 49, top: 407, width: 300, height: 36, size: 6.8, minSize: 5, print: false }),
  overlayFieldFromTop({ fieldKey: "emergencyContact.employerName", label: "勤務先", pageHeight: 539, x: 49, top: 454, width: 162, height: 18, size: 6.8, minSize: 5, print: false }),
  overlayFieldFromTop({ fieldKey: "lease.moveInDate", label: "入居予定日", pageHeight: 539, x: 685, top: 58, width: 78, height: 18, size: 7, minSize: 5, valueFormat: "dateYmd", print: false }),
  overlayFieldFromTop({ fieldKey: "property.name", label: "物件名", pageHeight: 539, x: 442, top: 80, width: 214, height: 34, size: 7.2, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "property.roomNumber", label: "号室", pageHeight: 539, x: 690, top: 80, width: 58, height: 34, size: 7, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "property.address", label: "住所", pageHeight: 539, x: 442, top: 124, width: 222, height: 44, size: 6.8, minSize: 5 }),
  overlayFieldFromTop({ fieldKey: "lease.rent", label: "家賃", pageHeight: 539, x: 438, top: 204, width: 70, height: 16, size: 6.2, minSize: 5, align: "right" }),
  overlayFieldFromTop({ fieldKey: "lease.commonFee", label: "共益費・管理費", pageHeight: 539, x: 438, top: 225, width: 70, height: 14, size: 6, minSize: 5, align: "right" }),
  overlayFieldFromTop({ fieldKey: "lease.parkingFee", label: "駐車場代", pageHeight: 539, x: 438, top: 252, width: 70, height: 16, size: 6.2, minSize: 5, align: "right", print: false }),
  overlayFieldFromTop({ fieldKey: "lease.deposit", label: "敷金", pageHeight: 539, x: 562, top: 276, width: 75, height: 16, size: 6.2, minSize: 5, align: "right", print: false }),
  overlayFieldFromTop({ fieldKey: "lease.keyMoney", label: "礼金", pageHeight: 539, x: 562, top: 300, width: 75, height: 16, size: 6.2, minSize: 5, align: "right", print: false }),
  overlayFieldFromTop({ fieldKey: "guarantee.plan", label: "スマートサポートプラン", pageHeight: 539, x: 641, top: 301, width: 95, height: 18, size: 6.2, minSize: 5, print: false }),
  overlayFieldFromTop({ fieldKey: "broker.companyName", label: "仲介会社名", pageHeight: 539, x: 545, top: 409, width: 110, height: 16, size: 6.2, minSize: 5, print: false }),
  overlayFieldFromTop({ fieldKey: "broker.phone", label: "仲介会社TEL", pageHeight: 539, x: 545, top: 441, width: 110, height: 18, size: 6.5, minSize: 5, print: false }),
  overlayFieldFromTop({ fieldKey: "broker.staffName", label: "仲介会社担当者", pageHeight: 539, x: 545, top: 421, width: 110, height: 18, size: 6.5, minSize: 5, print: false }),
] satisfies readonly FriendsOverlayField[];

const OVERLAY_FIELDS_BY_TEMPLATE_ID: Record<string, readonly FriendsOverlayField[]> = {
  zenhoren_individual_v1: ZENHOREN_OVERLAY_FIELDS,
  nihon_safety_individual_v1: NIHON_SAFETY_OVERLAY_FIELDS,
  j_lease_individual_v1: J_LEASE_OVERLAY_FIELDS,
  insure_individual_v1: INSURE_OVERLAY_FIELDS,
  friends_guarantee_individual_v1: FRIENDS_OVERLAY_FIELDS,
};

const CHECKBOX_FIELDS_BY_TEMPLATE_ID: Record<string, GuaranteeCheckboxField[]> = {
  zenhoren_individual_v1: [
    {
      fieldKey: "property.usage",
      options: [
        { valueIncludes: ["住居用", "居住用", "住宅"], x: 104, y: 518, size: 8 },
        { valueIncludes: ["住居学生", "学生"], x: 216, y: 518, size: 8 },
        { valueIncludes: ["火災保険"], x: 343, y: 518, size: 8 },
        { valueIncludes: ["トランク"], x: 464, y: 518, size: 8 },
        { valueIncludes: ["倉庫"], x: 584, y: 518, size: 8 },
        { valueIncludes: ["駐車場"], x: 104, y: 497, size: 8 },
        { valueIncludes: ["事務所"], x: 216, y: 497, size: 8 },
        { valueIncludes: ["店舗"], x: 343, y: 497, size: 8 },
      ],
    },
  ],
  nihon_safety_individual_v1: [
    {
      fieldKey: "company_option.nihon_safety_payment_method",
      options: [
        { valueIncludes: ["月払い"], x: 620, y: 297, size: 8 },
        { valueIncludes: ["年払い"], x: 734, y: 297, size: 8 },
      ],
    },
    {
      fieldKey: "company_option.nihon_safety_product",
      options: [
        { valueIncludes: ["プラス"], x: 624, y: 123, size: 8 },
        { valueIncludes: ["パートナー"], x: 714, y: 123, size: 8 },
      ],
    },
  ],
  friends_guarantee_individual_v1: [
    {
      fieldKey: "company_option.friends_plan_type",
      options: [
        { valueIncludes: ["100"], x: 476, y: 662 },
        { valueIncludes: ["学生"], x: 522, y: 662 },
        { valueIncludes: ["駐車"], x: 559, y: 662 },
        { valueIncludes: ["店舗", "事務所"], x: 430, y: 636 },
        { valueIncludes: ["住居", "標準", "50"], x: 434, y: 662 },
      ],
    },
    {
      fieldKey: "company_option.friends_collection_agency",
      options: [{ valueIncludes: ["利用する"], x: 471, y: 612 }],
    },
    {
      fieldKey: "company_option.friends_single_rider",
      options: [{ valueIncludes: ["あり"], x: 471, y: 570 }],
    },
  ],
};

const FRIENDS_OVERLAY_FIELD_KEYS = new Set(
  [
    ...FRIENDS_OVERLAY_FIELDS,
    ...ZENHOREN_OVERLAY_FIELDS,
    ...NIHON_SAFETY_OVERLAY_FIELDS,
    ...J_LEASE_OVERLAY_FIELDS,
    ...INSURE_OVERLAY_FIELDS,
  ].map((field) => field.fieldKey),
);

const friendsGuaranteeLayoutStore = globalThis as typeof globalThis & {
  __friendsGuaranteeTemplateLayoutOverridesByTemplate?: Record<string, FriendsOverlayLayoutOverrides>;
  __friendsGuaranteeTemplateLayoutOverrideVersionsByTemplate?: Record<string, string>;
  __friendsGuaranteeTemplateDeletedOverlayFieldsByTemplate?: Record<string, string[]>;
  __friendsGuaranteeTemplateCustomFieldsByTemplate?: Record<string, FriendsCustomOverlayField[]>;
};

type FriendsGuaranteeLayoutStoreSnapshot = {
  layoutOverridesByTemplate?: Record<string, FriendsOverlayLayoutOverrides>;
  layoutOverrideVersionsByTemplate?: Record<string, string>;
  deletedOverlayFieldsByTemplate?: Record<string, string[]>;
  customFieldsByTemplate?: Record<string, FriendsCustomOverlayField[]>;
};

export type FriendsGuaranteeTemplateLayoutSnapshot = {
  templateId: string;
  baselineVersion: string;
  layoutOverrides: FriendsOverlayLayoutOverrides;
  deletedOverlayFieldKeys: string[];
  customOverlayFields: FriendsCustomOverlayField[];
};

const FRIENDS_GUARANTEE_LAYOUT_STORE_PATH =
  process.env.FRIENDS_GUARANTEE_LAYOUT_STORE_PATH ?? join(process.cwd(), ".broker-desk/friends-guarantee-layouts.json");

let friendsGuaranteeLayoutStoreHydrated = false;

const GUARANTEE_TEMPLATE_CONFIGS = {
	  zenhoren_individual_v1: {
	    id: "zenhoren_individual_v1",
	    companyDisplayName: "全保連",
	    pdfPath: "/Users/laineyzhu/Desktop/房产专家资料库/１全保連.pdf",
	    imageSrc: "/guarantee-templates/zenhoren-v1-hd.png",
	    imageWidth: 2400,
	    imageHeight: 1697,
	    pageSize: { width: 1190.55, height: 841.89 },
	  },
  nihon_safety_individual_v1: {
    id: "nihon_safety_individual_v1",
    companyDisplayName: "日本セーフティー",
    pdfPath: "/Users/laineyzhu/Desktop/房产专家资料库/日本セーフティー(1).pdf",
    imageSrc: "/guarantee-templates/nihon-safety-v1-hd.png",
    imageWidth: 2400,
    imageHeight: 1696,
    pageSize: NIHON_SAFETY_PAGE_SIZE,
  },
	  j_lease_individual_v1: {
	    id: "j_lease_individual_v1",
	    companyDisplayName: "Jリース",
	    pdfPath: "/Users/laineyzhu/Desktop/房产专家资料库/３Jリース.pdf",
	    imageSrc: "/guarantee-templates/j-lease-v1-hd.png",
	    imageWidth: 1697,
	    imageHeight: 2400,
	    pageSize: { width: 595.32, height: 841.92 },
	  },
	  insure_individual_v1: {
	    id: "insure_individual_v1",
	    companyDisplayName: "インシュア",
	    pdfPath: "/Users/laineyzhu/Desktop/房产专家资料库/４インシュア.pdf",
	    imageSrc: "/guarantee-templates/insure-v1-hd.png",
	    imageWidth: 2400,
	    imageHeight: 1658,
	    pageSize: { width: 780, height: 539 },
	  },
  friends_guarantee_individual_v1: {
    id: FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
    companyDisplayName: "ふれんず保証",
    pdfPath: FRIENDS_GUARANTEE_TEMPLATE_PATH,
    imageSrc: "/guarantee-templates/friends-guarantee-v1.png",
    imageWidth: 1600,
    imageHeight: 1131,
    pageSize: FRIENDS_GUARANTEE_TEMPLATE_PAGE_SIZE,
  },
} as const;

function hydrateFriendsGuaranteeLayoutStore(): void {
  if (friendsGuaranteeLayoutStoreHydrated) return;
  friendsGuaranteeLayoutStoreHydrated = true;
  if (!existsSync(FRIENDS_GUARANTEE_LAYOUT_STORE_PATH)) return;

  try {
    const snapshot = JSON.parse(readFileSync(FRIENDS_GUARANTEE_LAYOUT_STORE_PATH, "utf8")) as FriendsGuaranteeLayoutStoreSnapshot;
    if (snapshot.layoutOverridesByTemplate && typeof snapshot.layoutOverridesByTemplate === "object") {
      friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverridesByTemplate = snapshot.layoutOverridesByTemplate;
    }
    if (snapshot.layoutOverrideVersionsByTemplate && typeof snapshot.layoutOverrideVersionsByTemplate === "object") {
      friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverrideVersionsByTemplate = snapshot.layoutOverrideVersionsByTemplate;
    }
    if (snapshot.deletedOverlayFieldsByTemplate && typeof snapshot.deletedOverlayFieldsByTemplate === "object") {
      friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateDeletedOverlayFieldsByTemplate = snapshot.deletedOverlayFieldsByTemplate;
    }
    if (snapshot.customFieldsByTemplate && typeof snapshot.customFieldsByTemplate === "object") {
      friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateCustomFieldsByTemplate = snapshot.customFieldsByTemplate;
    }
  } catch {
    // Ignore invalid local layout caches; users can save the template again.
  }
}

function backupFriendsGuaranteeLayoutStore(): void {
  if (!existsSync(FRIENDS_GUARANTEE_LAYOUT_STORE_PATH)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(dirname(FRIENDS_GUARANTEE_LAYOUT_STORE_PATH), "backups");
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(
    FRIENDS_GUARANTEE_LAYOUT_STORE_PATH,
    join(backupDir, `friends-guarantee-layouts-${stamp}.json`),
  );
}

function persistFriendsGuaranteeLayoutStore(): void {
  const snapshot: FriendsGuaranteeLayoutStoreSnapshot = {
    layoutOverridesByTemplate: friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverridesByTemplate ?? {},
    layoutOverrideVersionsByTemplate: friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverrideVersionsByTemplate ?? {},
    deletedOverlayFieldsByTemplate: friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateDeletedOverlayFieldsByTemplate ?? {},
    customFieldsByTemplate: friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateCustomFieldsByTemplate ?? {},
  };
  mkdirSync(dirname(FRIENDS_GUARANTEE_LAYOUT_STORE_PATH), { recursive: true });
  backupFriendsGuaranteeLayoutStore();
  writeFileSync(FRIENDS_GUARANTEE_LAYOUT_STORE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getGuaranteeTemplatePageSize(templateId?: string): GuaranteePageSize {
  const id = templateId && templateId in GUARANTEE_TEMPLATE_CONFIGS ? templateId : FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  return GUARANTEE_TEMPLATE_CONFIGS[id as keyof typeof GUARANTEE_TEMPLATE_CONFIGS].pageSize;
}

export function getFriendsOverlayFieldBox(field: FriendsOverlayField): FriendsOverlayBox {
  if (field.box) return { ...field.box };

  const inputHeight = Math.max(18, field.size * 2.4);
  return {
    x: field.x,
    y: field.y - 4,
    width: field.maxWidth + 12,
    height: inputHeight,
  };
}

function isCustomOverlayFieldKey(fieldKey: string): boolean {
  return /^custom\.[a-z0-9][a-z0-9_.-]*$/i.test(fieldKey);
}

function scaleBox(box: FriendsOverlayBox, pageSize: { width: number; height: number }): FriendsOverlayBox {
  const scaleX = pageSize.width / FRIENDS_GUARANTEE_TEMPLATE_PAGE_SIZE.width;
  const scaleY = pageSize.height / FRIENDS_GUARANTEE_TEMPLATE_PAGE_SIZE.height;
  return {
    x: box.x * scaleX,
    y: box.y * scaleY,
    width: box.width * scaleX,
    height: box.height * scaleY,
  };
}

function scaleOverlayField(field: FriendsOverlayField, pageSize: { width: number; height: number }): FriendsOverlayField {
  if (
    pageSize.width === FRIENDS_GUARANTEE_TEMPLATE_PAGE_SIZE.width &&
    pageSize.height === FRIENDS_GUARANTEE_TEMPLATE_PAGE_SIZE.height
  ) {
    return field;
  }
  const scaleX = pageSize.width / FRIENDS_GUARANTEE_TEMPLATE_PAGE_SIZE.width;
  const scaleY = pageSize.height / FRIENDS_GUARANTEE_TEMPLATE_PAGE_SIZE.height;
  return {
    ...field,
    x: field.x * scaleX,
    y: field.y * scaleY,
    maxWidth: field.maxWidth * scaleX,
    size: Math.max(5.5, field.size * Math.min(scaleX, scaleY)),
    minSize: field.minSize ? Math.max(4.8, field.minSize * Math.min(scaleX, scaleY)) : undefined,
    box: field.box ? scaleBox(field.box, pageSize) : undefined,
  };
}

export function getGuaranteePdfTemplateConfig(templateId?: string): GuaranteePdfTemplateConfig {
  const id = templateId && templateId in GUARANTEE_TEMPLATE_CONFIGS ? templateId : FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const base = GUARANTEE_TEMPLATE_CONFIGS[id as keyof typeof GUARANTEE_TEMPLATE_CONFIGS];
  const overlayFields =
    OVERLAY_FIELDS_BY_TEMPLATE_ID[id] ?? FRIENDS_OVERLAY_FIELDS.map((field) => scaleOverlayField(field, base.pageSize));
  return {
    ...base,
    overlayFields: overlayFields.map((field) => applyGuaranteeOverlayPrintMode(field, id)),
  };
}

export function sanitizeGuaranteeConfirmedOverlayFields(value: unknown): Record<string, string[]> {
  const rawValue = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })() : value;
  if (!rawValue || typeof rawValue !== "object") return {};

  return Object.entries(rawValue as Record<string, unknown>).reduce<Record<string, string[]>>((acc, [templateId, fieldKeys]) => {
    if (!Array.isArray(fieldKeys)) return acc;
    const normalized = [...new Set(fieldKeys
      .map((fieldKey) => String(fieldKey ?? "").trim())
      .filter((fieldKey) => /^[a-zA-Z0-9_.-]+$/.test(fieldKey)))]
      .sort();
    if (normalized.length > 0) acc[templateId] = normalized;
    return acc;
  }, {});
}

export function setGuaranteeConfirmedOverlayFieldKeys(input: {
  currentValue: unknown;
  templateId: string;
  fieldKeys: Iterable<string>;
}): Record<string, string[]> {
  const next = sanitizeGuaranteeConfirmedOverlayFields(input.currentValue);
  const normalized = [...new Set([...input.fieldKeys]
    .map((fieldKey) => String(fieldKey ?? "").trim())
    .filter((fieldKey) => /^[a-zA-Z0-9_.-]+$/.test(fieldKey)))]
    .sort();
  if (normalized.length > 0) next[input.templateId] = normalized;
  else delete next[input.templateId];
  return next;
}

export function getGuaranteeConfirmedOverlayFieldKeys(input: {
  confirmedDataJson?: Record<string, unknown>;
  templateId?: string;
}): Set<string> {
  const templateId = input.templateId ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const confirmedByTemplate = sanitizeGuaranteeConfirmedOverlayFields(
    input.confirmedDataJson?.[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY],
  );
  return new Set(confirmedByTemplate[templateId] ?? []);
}

function sanitizeLayoutBox(
  value: unknown,
  pageSize: GuaranteePageSize = FRIENDS_GUARANTEE_TEMPLATE_PAGE_SIZE,
): FriendsOverlayBox | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const width = clampNumber(Number(raw.width), 8, pageSize.width);
  const height = clampNumber(Number(raw.height), 8, pageSize.height);
  return {
    x: clampNumber(Number(raw.x), 0, pageSize.width - width),
    y: clampNumber(Number(raw.y), 0, pageSize.height - height),
    width,
    height,
  };
}

function sanitizeOverlaySegment(value: unknown): FriendsOverlaySegment | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === "amount" ? "amount" : raw.mode === "digits" ? "digits" : undefined;
  if (!mode) return undefined;

  const cells = clampNumber(Math.floor(Number(raw.cells)), 1, 24);
  const align = raw.align === "right" ? "right" : "left";
  const gap = raw.gap === undefined ? undefined : clampNumber(Number(raw.gap), 0, 24);
  return {
    mode,
    cells,
    align,
    ...(gap === undefined ? {} : { gap }),
  };
}

function isMoneyLikeCaseField(fieldKey?: string): boolean {
  if (!fieldKey) return false;
  const definition = getCaseFieldDefinition(fieldKey);
  return definition?.valueKind === "money_yen" || definition?.valueKind === "money_man_yen";
}

function normalizeOverlaySegmentForSource(
  sourceFieldKey: string | undefined,
  segment: FriendsOverlaySegment | undefined,
): FriendsOverlaySegment | undefined {
  if (!segment) return undefined;
  if (!isMoneyLikeCaseField(sourceFieldKey)) return segment;
  return {
    ...segment,
    mode: "amount",
    align: "right",
  };
}

function sanitizeOverlayAlign(value: unknown): FriendsOverlayField["align"] | undefined {
  if (value === "left" || value === "center" || value === "right") return value;
  return undefined;
}

function sanitizeOverlayValueFormat(value: unknown): FriendsOverlayField["valueFormat"] | undefined {
  if (
    value === "dateYmd" ||
    value === "dateYmdShort" ||
    value === "dateMd" ||
    value === "dateMdWithoutDaySuffix" ||
    value === "dateDigitsYmd" ||
    value === "dateYear" ||
    value === "dateYearShort" ||
    value === "dateMonth" ||
    value === "dateDay" ||
    value === "phoneDigits" ||
    value === "phonePart1" ||
    value === "phonePart2" ||
    value === "phonePart3" ||
    value === "durationYears" ||
    value === "addressPrefecture" ||
    value === "addressMunicipality" ||
    value === "addressStreet" ||
    value === "addressRest"
  ) {
    return value;
  }
  return undefined;
}

function sanitizeOverlayValuePart(value: unknown): FriendsOverlayField["valuePart"] | undefined {
  if (value === "firstToken" || value === "restTokens") return value;
  return undefined;
}

function sanitizeOverlaySourceFieldKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.startsWith("custom.")) return undefined;
  return /^[a-zA-Z0-9_.-]+$/.test(normalized) ? normalized : undefined;
}

export function sanitizeFriendsGuaranteeLayoutOverrides(
  value: unknown,
  templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
): FriendsOverlayLayoutOverrides {
  const pageSize = getGuaranteeTemplatePageSize(templateId);
  const rawValue = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })() : value;
  if (!rawValue || typeof rawValue !== "object") return {};

  return Object.entries(rawValue as Record<string, unknown>).reduce<FriendsOverlayLayoutOverrides>((acc, [fieldKey, entry]) => {
    if ((!FRIENDS_OVERLAY_FIELD_KEYS.has(fieldKey) && !isCustomOverlayFieldKey(fieldKey)) || !entry || typeof entry !== "object") return acc;
    const raw = entry as Record<string, unknown>;
    const box = sanitizeLayoutBox(raw.box, pageSize);
    const size = typeof raw.size === "number" ? clampNumber(raw.size, CUSTOM_OVERLAY_FONT_SIZE_MIN, CUSTOM_OVERLAY_FONT_SIZE_MAX) : undefined;
    if (box || size !== undefined) {
      acc[fieldKey] = {
        ...(box ? { box } : {}),
        ...(size !== undefined ? { size } : {}),
      };
    }
    return acc;
  }, {});
}

export function hasFriendsGuaranteeLayoutOverrides(overrides: FriendsOverlayLayoutOverrides): boolean {
  return Object.keys(overrides).length > 0;
}

export function sanitizeFriendsGuaranteeDeletedOverlayFieldKeys(
  value: unknown,
  templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
): string[] {
  const rawValue = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })() : value;
  const rawKeys: unknown[] = Array.isArray(rawValue)
    ? rawValue
    : rawValue && typeof rawValue === "object" && Array.isArray((rawValue as Record<string, unknown>)[templateId])
      ? ((rawValue as Record<string, unknown>)[templateId] as unknown[])
      : [];
  return [...new Set(
    rawKeys
      .map((fieldKey) => String(fieldKey ?? "").trim())
      .filter((fieldKey) => FRIENDS_OVERLAY_FIELD_KEYS.has(fieldKey)),
  )].sort();
}

function sanitizeFriendsGuaranteeLayoutOverrideVersions(value: unknown): Record<string, string> {
  const rawValue = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })() : value;
  if (!rawValue || typeof rawValue !== "object") return {};

  return Object.entries(rawValue as Record<string, unknown>).reduce<Record<string, string>>((acc, [templateId, version]) => {
    if (!(templateId in GUARANTEE_TEMPLATE_CONFIGS) || typeof version !== "string") return acc;
    const normalized = version.trim();
    if (normalized) acc[templateId] = normalized;
    return acc;
  }, {});
}

export function getFriendsGuaranteeLayoutBaselineVersion(templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID): string {
  return getGuaranteeCompanyTemplate(templateId).coordinateMappingVersion;
}

export function getFriendsGuaranteeCaseLayoutOverrideVersions(confirmedDataJson?: Record<string, unknown>): Record<string, string> {
  return sanitizeFriendsGuaranteeLayoutOverrideVersions(
    confirmedDataJson?.[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY],
  );
}

export function setFriendsGuaranteeCaseLayoutOverrideVersion(input: {
  currentValue: unknown;
  templateId: string;
  enabled: boolean;
}): Record<string, string> {
  const next = sanitizeFriendsGuaranteeLayoutOverrideVersions(input.currentValue);
  if (input.enabled) next[input.templateId] = getFriendsGuaranteeLayoutBaselineVersion(input.templateId);
  else delete next[input.templateId];
  return next;
}

export function getFriendsGuaranteeTemplateDeletedOverlayFieldKeys(
  templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
): string[] {
  hydrateFriendsGuaranteeLayoutStore();
  const savedVersion = friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverrideVersionsByTemplate?.[templateId];
  if (savedVersion !== getFriendsGuaranteeLayoutBaselineVersion(templateId)) return [];
  return sanitizeFriendsGuaranteeDeletedOverlayFieldKeys(
    friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateDeletedOverlayFieldsByTemplate?.[templateId] ?? [],
    templateId,
  );
}

export function saveFriendsGuaranteeTemplateDeletedOverlayFieldKeys(
  fieldKeys: readonly string[],
  templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
): void {
  hydrateFriendsGuaranteeLayoutStore();
  friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateDeletedOverlayFieldsByTemplate = {
    ...(friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateDeletedOverlayFieldsByTemplate ?? {}),
    [templateId]: sanitizeFriendsGuaranteeDeletedOverlayFieldKeys(fieldKeys, templateId),
  };
  friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverrideVersionsByTemplate = {
    ...(friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverrideVersionsByTemplate ?? {}),
    [templateId]: getFriendsGuaranteeLayoutBaselineVersion(templateId),
  };
  persistFriendsGuaranteeLayoutStore();
}

export function getFriendsGuaranteeCaseDeletedOverlayFieldKeys(input: {
  templateId?: string;
  confirmedDataJson?: Record<string, unknown>;
}): string[] {
  const templateId = input.templateId ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const savedVersions = getFriendsGuaranteeCaseLayoutOverrideVersions(input.confirmedDataJson);
  if (savedVersions[templateId] !== getFriendsGuaranteeLayoutBaselineVersion(templateId)) return [];
  return sanitizeFriendsGuaranteeDeletedOverlayFieldKeys(
    input.confirmedDataJson?.[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY],
    templateId,
  );
}

export function setFriendsGuaranteeCaseDeletedOverlayFieldKeys(input: {
  currentValue: unknown;
  templateId: string;
  fieldKeys: readonly string[];
}): Record<string, string[]> {
  const rawValue = input.currentValue && typeof input.currentValue === "object"
    ? input.currentValue as Record<string, unknown>
    : {};
  const next = Object.entries(rawValue).reduce<Record<string, string[]>>((acc, [templateId, fieldKeys]) => {
    if (!(templateId in GUARANTEE_TEMPLATE_CONFIGS)) return acc;
    const normalized = sanitizeFriendsGuaranteeDeletedOverlayFieldKeys(fieldKeys, templateId);
    if (normalized.length > 0) acc[templateId] = normalized;
    return acc;
  }, {});
  const normalized = sanitizeFriendsGuaranteeDeletedOverlayFieldKeys(input.fieldKeys, input.templateId);
  if (normalized.length > 0) next[input.templateId] = normalized;
  else delete next[input.templateId];
  return next;
}

export function sanitizeFriendsGuaranteeCustomOverlayFields(
  value: unknown,
  templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
): FriendsCustomOverlayField[] {
  const pageSize = getGuaranteeTemplatePageSize(templateId);
  const rawValue = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })() : value;
  if (!Array.isArray(rawValue)) return [];

  const seen = new Set<string>();
  return rawValue.reduce<FriendsCustomOverlayField[]>((acc, item, index) => {
    if (!item || typeof item !== "object") return acc;
    const raw = item as Record<string, unknown>;
    const fieldKey = String(raw.fieldKey ?? "").trim();
    if (!isCustomOverlayFieldKey(fieldKey) || seen.has(fieldKey)) return acc;
    const box = sanitizeLayoutBox(raw.box, pageSize);
    if (!box) return acc;
    const sourceFieldKey = sanitizeOverlaySourceFieldKey(raw.sourceFieldKey);
    seen.add(fieldKey);
    const normalizedField: FriendsCustomOverlayField = {
      fieldKey,
      sourceFieldKey,
      label: String(raw.label ?? `追加欄${index + 1}`).trim().slice(0, 40) || `追加欄${index + 1}`,
      value: sourceFieldKey ? "" : typeof raw.value === "string" ? raw.value.trim() : "",
      x: box.x + 3,
      y: box.y + Math.max(0, (box.height - 8) / 2),
      size: typeof raw.size === "number" ? clampNumber(raw.size, CUSTOM_OVERLAY_FONT_SIZE_MIN, CUSTOM_OVERLAY_FONT_SIZE_MAX) : 8,
      maxWidth: Math.max(8, box.width - 6),
      minSize: CUSTOM_OVERLAY_FONT_SIZE_MIN,
      align: sanitizeOverlayAlign(raw.align),
      box,
      segment: normalizeOverlaySegmentForSource(sourceFieldKey, sanitizeOverlaySegment(raw.segment)),
      valueFormat: sanitizeOverlayValueFormat(raw.valueFormat),
      valuePart: sanitizeOverlayValuePart(raw.valuePart),
      custom: true,
    };
    acc.push(applyGuaranteeOverlayPrintMode(normalizedField, templateId) as FriendsCustomOverlayField);
    return acc;
  }, []);
}

function mergeCustomOverlayFields(
  templateFields: readonly FriendsCustomOverlayField[],
  caseFields: readonly FriendsCustomOverlayField[],
): FriendsCustomOverlayField[] {
  const merged = new Map<string, FriendsCustomOverlayField>();
  templateFields.forEach((field) => merged.set(field.fieldKey, { ...field, value: "" }));
  caseFields.forEach((field) => {
    const existing = merged.get(field.fieldKey);
    merged.set(field.fieldKey, {
      ...(existing ?? field),
      ...field,
      box: { ...field.box },
    });
  });
  return [...merged.values()];
}

export function sanitizeFriendsGuaranteeCustomOverlayFieldsByTemplate(value: unknown): Record<string, FriendsCustomOverlayField[]> {
  const rawValue = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })() : value;
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) return {};

  return Object.entries(rawValue as Record<string, unknown>).reduce<Record<string, FriendsCustomOverlayField[]>>(
    (acc, [templateId, fields]) => {
      if (!(templateId in GUARANTEE_TEMPLATE_CONFIGS)) return acc;
      const normalized = sanitizeFriendsGuaranteeCustomOverlayFields(fields, templateId);
      if (normalized.length > 0) acc[templateId] = normalized;
      return acc;
    },
    {},
  );
}

export function getFriendsGuaranteeCaseCustomOverlayFields(input: {
  templateId?: string;
  confirmedDataJson?: Record<string, unknown>;
}): FriendsCustomOverlayField[] {
  const templateId = input.templateId ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  return sanitizeFriendsGuaranteeCustomOverlayFieldsByTemplate(
    input.confirmedDataJson?.[FRIENDS_GUARANTEE_CUSTOM_FIELDS_KEY],
  )[templateId] ?? [];
}

export function setFriendsGuaranteeCaseCustomOverlayFields(input: {
  currentValue: unknown;
  templateId: string;
  fields: readonly FriendsCustomOverlayField[];
}): Record<string, FriendsCustomOverlayField[]> {
  const next = sanitizeFriendsGuaranteeCustomOverlayFieldsByTemplate(input.currentValue);
  const normalized = sanitizeFriendsGuaranteeCustomOverlayFields(input.fields, input.templateId);
  if (normalized.length > 0) next[input.templateId] = normalized;
  else delete next[input.templateId];
  return next;
}

export function getFriendsGuaranteeTemplateLayoutOverrides(templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID): FriendsOverlayLayoutOverrides {
  hydrateFriendsGuaranteeLayoutStore();
  const savedVersion = friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverrideVersionsByTemplate?.[templateId];
  if (savedVersion !== getFriendsGuaranteeLayoutBaselineVersion(templateId)) return {};
  return sanitizeFriendsGuaranteeLayoutOverrides(
    friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverridesByTemplate?.[templateId] ?? {},
    templateId,
  );
}

export function saveFriendsGuaranteeTemplateLayoutOverrides(
  overrides: FriendsOverlayLayoutOverrides,
  templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
): void {
  hydrateFriendsGuaranteeLayoutStore();
  friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverridesByTemplate = {
    ...(friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverridesByTemplate ?? {}),
    [templateId]: sanitizeFriendsGuaranteeLayoutOverrides(overrides, templateId),
  };
  friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverrideVersionsByTemplate = {
    ...(friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateLayoutOverrideVersionsByTemplate ?? {}),
    [templateId]: getFriendsGuaranteeLayoutBaselineVersion(templateId),
  };
  persistFriendsGuaranteeLayoutStore();
}

export function getFriendsGuaranteeCaseLayoutOverrides(input: {
  templateId?: string;
  confirmedDataJson?: Record<string, unknown>;
}): FriendsOverlayLayoutOverrides {
  const templateId = input.templateId ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const savedVersions = getFriendsGuaranteeCaseLayoutOverrideVersions(input.confirmedDataJson);
  if (savedVersions[templateId] !== getFriendsGuaranteeLayoutBaselineVersion(templateId)) return {};
  return sanitizeFriendsGuaranteeLayoutOverrides(
    input.confirmedDataJson?.[FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY],
    templateId,
  );
}

export function getFriendsGuaranteeEffectiveLayoutOverrides(input: {
  templateId?: string;
  confirmedDataJson?: Record<string, unknown>;
}): FriendsOverlayLayoutOverrides {
  const templateId = input.templateId ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  return sanitizeFriendsGuaranteeLayoutOverrides(
    {
      ...getFriendsGuaranteeTemplateLayoutOverrides(templateId),
      ...getFriendsGuaranteeCaseLayoutOverrides({ templateId, confirmedDataJson: input.confirmedDataJson }),
    },
    templateId,
  );
}

export function getFriendsGuaranteeEffectiveDeletedOverlayFieldKeys(input: {
  templateId?: string;
  confirmedDataJson?: Record<string, unknown>;
}): Set<string> {
  const templateId = input.templateId ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  return new Set([
    ...getFriendsGuaranteeTemplateDeletedOverlayFieldKeys(templateId),
    ...getFriendsGuaranteeCaseDeletedOverlayFieldKeys({ templateId, confirmedDataJson: input.confirmedDataJson }),
  ]);
}

export function getFriendsGuaranteeTemplateCustomOverlayFields(
  templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
): FriendsCustomOverlayField[] {
  hydrateFriendsGuaranteeLayoutStore();
  return sanitizeFriendsGuaranteeCustomOverlayFields(
    friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateCustomFieldsByTemplate?.[templateId] ?? [],
    templateId,
  );
}

export function getFriendsGuaranteeTemplateLayoutSnapshot(
  templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
): FriendsGuaranteeTemplateLayoutSnapshot {
  return {
    templateId,
    baselineVersion: getFriendsGuaranteeLayoutBaselineVersion(templateId),
    layoutOverrides: getFriendsGuaranteeTemplateLayoutOverrides(templateId),
    deletedOverlayFieldKeys: getFriendsGuaranteeTemplateDeletedOverlayFieldKeys(templateId),
    customOverlayFields: getFriendsGuaranteeTemplateCustomOverlayFields(templateId),
  };
}

export function saveFriendsGuaranteeTemplateCustomOverlayFields(
  fields: readonly FriendsCustomOverlayField[],
  templateId = FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID,
): void {
  hydrateFriendsGuaranteeLayoutStore();
  friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateCustomFieldsByTemplate = {
    ...(friendsGuaranteeLayoutStore.__friendsGuaranteeTemplateCustomFieldsByTemplate ?? {}),
    [templateId]: sanitizeFriendsGuaranteeCustomOverlayFields(
      fields.map((field) => ({
        ...field,
        segment: field.segment ? { ...field.segment } : undefined,
        value: "",
      })),
      templateId,
    ),
  };
  persistFriendsGuaranteeLayoutStore();
}

export function getFriendsGuaranteeCustomOverlayFields(input: {
  templateId?: string;
  confirmedDataJson?: Record<string, unknown>;
}): FriendsCustomOverlayField[] {
  return mergeCustomOverlayFields(
    getFriendsGuaranteeTemplateCustomOverlayFields(input.templateId),
    getFriendsGuaranteeCaseCustomOverlayFields(input),
  );
}

export function getFriendsGuaranteeEffectiveOverlayFields(input: {
  templateId?: string;
  confirmedDataJson?: Record<string, unknown>;
  includeNever?: boolean;
}): FriendsOverlayField[] {
  const templateId = input.templateId ?? FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID;
  const templateConfig = getGuaranteePdfTemplateConfig(templateId);
  const customFields = getFriendsGuaranteeCustomOverlayFields({
    templateId,
    confirmedDataJson: input.confirmedDataJson,
  });
  const deletedOverlayFieldKeys = getFriendsGuaranteeEffectiveDeletedOverlayFieldKeys({
    templateId,
    confirmedDataJson: input.confirmedDataJson,
  });
  const layoutOverrides = getFriendsGuaranteeEffectiveLayoutOverrides({
    templateId,
    confirmedDataJson: input.confirmedDataJson,
  });
  return applyFriendsGuaranteeLayoutOverrides(
    [...templateConfig.overlayFields, ...customFields].filter(
      (field) =>
        !deletedOverlayFieldKeys.has(field.fieldKey) &&
        (input.includeNever || !isFriendsOverlayFieldNeverPrinted(field)),
    ),
    layoutOverrides,
  );
}

export function applyFriendsGuaranteeLayoutOverrides(
  fields: readonly FriendsOverlayField[],
  overrides: FriendsOverlayLayoutOverrides,
): FriendsOverlayField[] {
  return fields.map((field) => {
    const override = overrides[field.fieldKey];
    if (!override) return field;
    const nextField = {
      ...field,
      ...(override.size !== undefined ? { size: override.size, sizeOverride: true } : {}),
    };
    if (!override.box) return nextField;
    return {
      ...nextField,
      dateParts: undefined,
      box: { ...override.box },
      maxWidth: override.box.width,
    };
  });
}

type FontkitFont = {
  glyphForCodePoint: (codePoint: number) => { id: number } | undefined;
};

type FontkitWithCreate = typeof fontkit & {
  create?: (fontData: Uint8Array) => FontkitFont;
};

function hasGlyphCoverage(fontPath: string, requiredText: string): boolean {
  const fontkitWithCreate = fontkit as FontkitWithCreate;
  if (!fontkitWithCreate.create) return true;

  try {
    const font = fontkitWithCreate.create(readFileSync(fontPath));
    return [...requiredText].every((char) => {
      if (/\s/.test(char)) return true;
      const glyph = font.glyphForCodePoint(char.codePointAt(0) ?? 0);
      return Boolean(glyph && glyph.id > 0);
    });
  } catch {
    return false;
  }
}

function resolveJapaneseFontPath(requiredText: string): string {
  const existingCandidates = JAPANESE_FONT_CANDIDATES.filter((candidate) => existsSync(candidate));
  const fontPath =
    existingCandidates.find((candidate) => hasGlyphCoverage(candidate, requiredText)) ??
    existingCandidates[0];
  if (!fontPath) {
    throw new Error("Japanese font for PDF overlay was not found on this machine.");
  }
  return fontPath;
}

function normalizePdfValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isPostalCodeOverlayField(field: Pick<FriendsOverlayField, "fieldKey" | "sourceFieldKey">): boolean {
  const key = `${field.sourceFieldKey ?? ""} ${field.fieldKey}`.toLowerCase();
  return key.includes("postalcode") || key.includes("postal_code");
}

function formatJapanesePostalCodePart(value: string, valuePart: FriendsOverlayField["valuePart"]): string {
  const digits = value.replace(/[^\d]/g, "").slice(0, 7);
  if (valuePart === "firstToken") return digits.slice(0, 3);
  if (valuePart === "restTokens") return digits.slice(3, 7);
  return digits;
}

function normalizeSegmentValue(value: string, segment: FriendsOverlaySegment): string {
  const normalized = value.replace(/[^\d]/g, "");
  if (segment.mode === "amount") return normalized.replace(/^0+(?=\d)/, "");
  return normalized;
}

function segmentValue(value: string, segment: FriendsOverlaySegment): string[] {
  const cells = Math.max(1, Math.floor(segment.cells));
  const normalized = normalizeSegmentValue(value, segment);
  const chars = [...normalized];
  const visibleChars = segment.align === "right" ? chars.slice(-cells) : chars.slice(0, cells);
  const padded = Array(cells).fill("");
  const offset = segment.align === "right" ? Math.max(0, cells - visibleChars.length) : 0;
  visibleChars.forEach((char, index) => {
    padded[offset + index] = char;
  });
  return padded;
}

function getSegmentCellBoxes(field: FriendsOverlayField): FriendsOverlayBox[] {
  const segment = field.segment;
  if (!segment) return [];
  const box = field.box ?? getFriendsOverlayFieldBox(field);
  const cells = Math.max(1, Math.floor(segment.cells));
  const gap = Math.max(0, segment.gap ?? 0);
  const xInset = Math.max(0, segment.xInset ?? 0);
  const printableWidth = Math.max(1, box.width - xInset * 2);
  const cellWidth = Math.max(1, (printableWidth - gap * (cells - 1)) / cells);
  return Array.from({ length: cells }, (_, index) => ({
    x: box.x + xInset + index * (cellWidth + gap),
    y: box.y,
    width: cellWidth,
    height: box.height,
  }));
}

function trimToMeasuredWidth(input: {
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  value: string;
  size: number;
  maxWidth: number;
}): string {
  const normalized = normalizePdfValue(input.value);
  if (input.font.widthOfTextAtSize(normalized, input.size) <= input.maxWidth) return normalized;

  const marker = "…";
  const markerWidth = input.font.widthOfTextAtSize(marker, input.size);
  if (markerWidth > input.maxWidth) return "";

  const chars = [...normalized];
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${chars.slice(0, mid).join("")}${marker}`;
    if (input.font.widthOfTextAtSize(candidate, input.size) <= input.maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${chars.slice(0, low).join("")}${marker}`;
}

function fitSingleLineText(input: {
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  field: FriendsOverlayField;
  value: string;
}) {
  const minSize = typeof input.field.minSize === "number" ? input.field.minSize : Math.max(6, input.field.size * 0.8);
  const maxWidth = input.field.box ? Math.max(1, input.field.box.width - 6) : input.field.maxWidth;
  const normalized = normalizePdfValue(input.value);
  const startSize = input.field.box
    ? getHeightLimitedTextSize(input.field.size, minSize, input.field.box, {
        custom: input.field.custom,
        sizeOverride: input.field.sizeOverride,
      })
    : input.field.size;
  for (let size = startSize; size >= minSize; size -= 0.25) {
    if (input.font.widthOfTextAtSize(normalized, size) <= maxWidth) {
      return { value: normalized, size };
    }
  }
  return {
    value: trimToMeasuredWidth({
      font: input.font,
      value: normalized,
      size: minSize,
      maxWidth,
    }),
    size: minSize,
  };
}

function canPrintAutoFieldWithoutAdjustment(input: {
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  field: FriendsOverlayField;
  value: string;
}): boolean {
  if (input.field.dateParts) {
    const parsed = parseDateParts(input.value);
    if (!parsed) return false;
    const year = input.field.dateParts.yearFormat === "short" ? parsed.year.slice(-2) : parsed.year;
    return [
      [year, input.field.dateParts.year],
      [parsed.month, input.field.dateParts.month],
      [parsed.day, input.field.dateParts.day],
    ].every(([value, box]) =>
      input.font.widthOfTextAtSize(String(value), input.field.size) <= Math.max(1, (box as FriendsOverlayBox).width - 2),
    );
  }

  const fieldValue = formatOverlayValue(input.field, input.value);
  if (!fieldValue) return false;

  if (input.field.segment) {
    const chars = segmentValue(fieldValue, input.field.segment);
    const cells = getSegmentCellBoxes(input.field);
    return chars.every((char, index) => {
      if (!char) return true;
      const cell = cells[index];
      return Boolean(cell) && input.font.widthOfTextAtSize(char, input.field.size) <= Math.max(1, cell.width - 2);
    });
  }

  const printableWidth = input.field.box ? Math.max(1, input.field.box.width - 6) : input.field.maxWidth;
  return input.font.widthOfTextAtSize(normalizePdfValue(fieldValue), input.field.size) <= printableWidth;
}

export function formatFriendsOverlayValue(field: FriendsOverlayField, value: string): string {
  const normalized = normalizePdfValue(value);
  if (field.valuePart && isPostalCodeOverlayField(field)) {
    return formatJapanesePostalCodePart(normalized, field.valuePart);
  }
  if (field.valueFormat === "durationYears") {
    const yearMatch = normalized.match(/(\d+(?:\.\d+)?)\s*年/);
    return yearMatch?.[1] ?? normalized.replace(/[年月か月ヶ月\s　]/g, "");
  }
  if (field.valueFormat === "addressPrefecture") {
    return parseJapaneseAddressParts(normalized).prefecture;
  }
  if (field.valueFormat === "addressMunicipality") {
    return parseJapaneseAddressParts(normalized).municipality;
  }
  if (field.valueFormat === "addressStreet") {
    return parseJapaneseAddressParts(normalized).street;
  }
  if (field.valueFormat === "addressRest") {
    return parseJapaneseAddressParts(normalized).rest;
  }
  if (
    field.valueFormat === "phoneDigits" ||
    field.valueFormat === "phonePart1" ||
    field.valueFormat === "phonePart2" ||
    field.valueFormat === "phonePart3"
  ) {
    const parts = parseJapanesePhoneParts(normalized);
    if (field.valueFormat === "phoneDigits") return parts.join("");
    if (field.valueFormat === "phonePart1") return parts[0] ?? "";
    if (field.valueFormat === "phonePart2") return parts[1] ?? "";
    return parts[2] ?? "";
  }
  if (field.valueFormat) {
    const match = parseDateParts(normalized);
    if (!match) return normalized;
    const { year, month, day } = match;
    const month2 = month.padStart(2, "0");
    const day2 = day.padStart(2, "0");

    switch (field.valueFormat) {
      case "dateYear":
        return year;
      case "dateYearShort":
        return year.slice(-2);
      case "dateMonth":
        return month;
      case "dateDay":
        return day;
      case "dateDigitsYmd":
        return `${year}${month2}${day2}`;
      case "dateYmdShort":
        return `${year.slice(-2)}   ${month}   ${day}`;
      case "dateMdWithoutDaySuffix":
        return `${month}月${day}`;
      case "dateMd":
        return `${month}月${day}日`;
      case "dateYmd":
      default:
        return `${year}   ${month}   ${day}`;
    }
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

function formatOverlayValue(field: FriendsOverlayField, value: string): string {
  return formatFriendsOverlayValue(field, value);
}

function parseDateParts(value: string): { year: string; month: string; day: string } | undefined {
  const normalized = normalizePdfValue(value);
  const match = normalized.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return undefined;
  return {
    year: match[1],
    month: String(Number(match[2])),
    day: String(Number(match[3])),
  };
}

function parseJapaneseAddressParts(value: string): { prefecture: string; municipality: string; rest: string; street: string } {
  const normalized = normalizePdfValue(value)
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

function parseJapanesePhoneParts(value: string): [string, string, string] {
  const normalized = normalizePdfValue(value);
  const explicitParts = normalized
    .split(/[-ー－―\s　]+/)
    .map((part) => part.replace(/\D/g, ""))
    .filter(Boolean);
  if (explicitParts.length >= 3) {
    return [explicitParts[0], explicitParts[1], explicitParts.slice(2).join("")];
  }

  const digits = normalized.replace(/\D/g, "");
  if (digits.length <= 2) return [digits, "", ""];
  if (digits.length <= 6) return [digits.slice(0, 3), digits.slice(3), ""];
  if (digits.length === 10 && /^0[36]/.test(digits)) {
    return [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6)];
  }
  if (digits.length === 10) return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  if (digits.length === 11) return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
  return [digits.slice(0, 3), digits.slice(3, Math.max(3, digits.length - 4)), digits.slice(-4)];
}

function getHeightLimitedTextSize(size: number, minSize: number, box: FriendsOverlayBox, input?: { custom?: boolean; sizeOverride?: boolean }) {
  if (input?.custom || input?.sizeOverride) return Math.max(minSize, size);
  return Math.max(minSize, Math.min(size, Math.max(4, box.height - 2) * 0.72));
}

function drawTextInBox(input: {
  page: ReturnType<PDFDocument["getPages"]>[number];
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  value: string;
  box: FriendsOverlayBox;
  size: number;
  minSize?: number;
  align?: "left" | "center" | "right";
  custom?: boolean;
  sizeOverride?: boolean;
}) {
  const minSize = input.minSize ?? Math.max(5, input.size * 0.8);
  const maxWidth = Math.max(1, input.box.width - 2);
  const normalized = normalizePdfValue(input.value);
  let size = getHeightLimitedTextSize(input.size, minSize, input.box, {
    custom: input.custom,
    sizeOverride: input.sizeOverride,
  });
  while (size > minSize && input.font.widthOfTextAtSize(normalized, size) > maxWidth) {
    size -= 0.25;
  }
  const value =
    input.font.widthOfTextAtSize(normalized, size) <= maxWidth
      ? normalized
      : trimToMeasuredWidth({ font: input.font, value: normalized, size, maxWidth });
  const textWidth = input.font.widthOfTextAtSize(value, size);
  const x =
    input.align === "right"
      ? input.box.x + Math.max(0, input.box.width - textWidth - 1)
      : input.align === "center"
        ? input.box.x + Math.max(0, (input.box.width - textWidth) / 2)
        : input.box.x + 1;
  input.page.drawText(value, {
    x,
    y: input.box.y + Math.max(0, (input.box.height - size) / 2) + size * 0.1,
    size,
    font: input.font,
    color: rgb(0.05, 0.08, 0.12),
    maxWidth,
  });
}

function drawDateParts(input: {
  page: ReturnType<PDFDocument["getPages"]>[number];
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  field: FriendsOverlayField;
  value: string;
}): boolean {
  if (!input.field.dateParts) return false;
  const parsed = parseDateParts(input.value);
  if (!parsed) return false;
  const year = input.field.dateParts.yearFormat === "short" ? parsed.year.slice(-2) : parsed.year;
  drawTextInBox({ ...input, value: year, box: input.field.dateParts.year, size: input.field.size, minSize: input.field.minSize, align: "center", custom: input.field.custom, sizeOverride: input.field.sizeOverride });
  drawTextInBox({ ...input, value: parsed.month, box: input.field.dateParts.month, size: input.field.size, minSize: input.field.minSize, align: "center", custom: input.field.custom, sizeOverride: input.field.sizeOverride });
  drawTextInBox({ ...input, value: parsed.day, box: input.field.dateParts.day, size: input.field.size, minSize: input.field.minSize, align: "center", custom: input.field.custom, sizeOverride: input.field.sizeOverride });
  return true;
}

function drawFieldValue(input: {
  page: ReturnType<PDFDocument["getPages"]>[number];
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  field: FriendsOverlayField;
  value: string;
}) {
  const { page, font, field } = input;
  if (drawDateParts(input)) return;
  const fieldValue = formatOverlayValue(field, input.value);
  if (!fieldValue) return;
  if (field.segment) {
    const chars = segmentValue(fieldValue, field.segment);
    const cells = getSegmentCellBoxes(field);
    chars.forEach((char, index) => {
      if (!char) return;
      const cell = cells[index];
      if (!cell) return;
      const minSize = typeof field.minSize === "number" ? field.minSize : Math.max(5, field.size * 0.8);
      let size = getHeightLimitedTextSize(field.size, minSize, cell, {
        custom: field.custom,
        sizeOverride: field.sizeOverride,
      });
      while (size > minSize && font.widthOfTextAtSize(char, size) > Math.max(1, cell.width - 2)) {
        size -= 0.25;
      }
      const textWidth = font.widthOfTextAtSize(char, size);
      page.drawText(char, {
        x: cell.x + Math.max(0, (cell.width - textWidth) / 2),
        y: cell.y + Math.max(0, (cell.height - size) / 2) + size * 0.1 + (field.segment?.yOffset ?? 0),
        size,
        font,
        color: rgb(0.05, 0.08, 0.12),
        maxWidth: Math.max(1, cell.width),
      });
    });
    return;
  }

  const { value, size } = fitSingleLineText({ font, field, value: fieldValue });
  const textWidth = font.widthOfTextAtSize(value, size);
  const box = field.box;
  const printableX = box ? box.x + 3 : field.x;
  const printableY = box ? box.y + Math.max(0, (box.height - size) / 2) + size * 0.1 : field.y;
  const printableWidth = box ? Math.max(1, box.width - 6) : field.maxWidth;
  const x =
    "align" in field && field.align === "right"
      ? Math.max(printableX, printableX + printableWidth - textWidth)
      : "align" in field && field.align === "center"
        ? printableX + Math.max(0, (printableWidth - textWidth) / 2)
      : printableX;
  page.drawText(value, {
    x,
    y: printableY,
    size,
    font,
    color: rgb(0.05, 0.08, 0.12),
    maxWidth: printableWidth,
  });
}

function checkboxOptionMatches(value: string, option: GuaranteeCheckboxOption): boolean {
  const normalized = normalizePdfValue(value);
  return option.valueIncludes.some((needle) => normalized.includes(needle));
}

function drawStructuredCheckboxes(input: {
  page: ReturnType<PDFDocument["getPages"]>[number];
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  templateId: string;
  draftValues: Record<string, unknown>;
  confirmedDataJson?: Record<string, unknown>;
}) {
  const fields = CHECKBOX_FIELDS_BY_TEMPLATE_ID[input.templateId] ?? [];
  fields.forEach((field) => {
    const value = input.draftValues[field.fieldKey] ?? (
      input.confirmedDataJson ? getCaseFieldValue(input.confirmedDataJson, field.fieldKey) : ""
    );
    if (typeof value !== "string" || !value.trim()) return;
    const option = field.options.find((item) => checkboxOptionMatches(value, item));
    if (!option) return;
    input.page.drawText("レ", {
      x: option.x,
      y: option.y,
      size: option.size ?? 9,
      font: input.font,
      color: rgb(0.05, 0.08, 0.12),
    });
  });
}

export async function renderFriendsGuaranteePdf(input: {
  confirmedDataJson?: Record<string, unknown>;
  draftFieldValuesJson?: Record<string, unknown>;
  caseTitle?: string;
  templateId?: string;
}): Promise<Uint8Array> {
  const templateConfig = getGuaranteePdfTemplateConfig(input.templateId);
  if (!existsSync(templateConfig.pdfPath)) {
    throw new Error(`Guarantee PDF template was not found: ${templateConfig.pdfPath}`);
  }

  let pdf: PDFDocument;
  let page = undefined as ReturnType<PDFDocument["getPages"]>[number] | undefined;

  if (templateConfig.id === "nihon_safety_individual_v1") {
    if (!existsSync(NIHON_SAFETY_TEMPLATE_IMAGE_PATH)) {
      throw new Error(`Guarantee PDF template image was not found: ${NIHON_SAFETY_TEMPLATE_IMAGE_PATH}`);
    }
    pdf = await PDFDocument.create();
    const templateImageBytes = readFileSync(NIHON_SAFETY_TEMPLATE_IMAGE_PATH);
    const templateImage = await pdf.embedPng(templateImageBytes);
    page = pdf.addPage([templateConfig.pageSize.width, templateConfig.pageSize.height]);
    page.drawImage(templateImage, {
      x: 0,
      y: 0,
      width: templateConfig.pageSize.width,
      height: templateConfig.pageSize.height,
    });
  } else {
    const templateBytes = readFileSync(templateConfig.pdfPath);
    pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    [page] = pdf.getPages();
  }

  pdf.registerFontkit(fontkit);
  if (!page) throw new Error("Guarantee PDF template has no pages.");

  const customFields = getFriendsGuaranteeCustomOverlayFields({
    templateId: templateConfig.id,
    confirmedDataJson: input.confirmedDataJson,
  });
  const layoutOverrides = getFriendsGuaranteeEffectiveLayoutOverrides({
    templateId: templateConfig.id,
    confirmedDataJson: input.confirmedDataJson,
  });
  const deletedOverlayFieldKeys = getFriendsGuaranteeEffectiveDeletedOverlayFieldKeys({
    templateId: templateConfig.id,
    confirmedDataJson: input.confirmedDataJson,
  });
  const layoutBoxOverrideKeys = new Set(
    Object.entries(layoutOverrides).flatMap(([fieldKey, override]) => (override.box ? [fieldKey] : [])),
  );
  const confirmedOverlayFieldKeys = getGuaranteeConfirmedOverlayFieldKeys({
    confirmedDataJson: input.confirmedDataJson,
    templateId: templateConfig.id,
  });
  const baseOverlayFields = [...templateConfig.overlayFields, ...customFields].filter(
    (field) => !deletedOverlayFieldKeys.has(field.fieldKey),
  );
  const overlayFields = applyFriendsGuaranteeLayoutOverrides(baseOverlayFields, layoutOverrides);
  const checkboxFieldKeys = CHECKBOX_FIELDS_BY_TEMPLATE_ID[templateConfig.id]?.map((field) => field.fieldKey) ?? [];
  const fieldValues = buildGuaranteeApplicationFieldValues({
    confirmedDataJson: input.confirmedDataJson,
    draftFieldValuesJson: input.draftFieldValuesJson,
    fieldKeys: [...new Set([
      ...overlayFields.map((field) => field.sourceFieldKey ?? field.fieldKey),
      ...checkboxFieldKeys,
    ])],
  });
  const valueByKey = new Map(fieldValues.map((field) => [field.fieldKey, field.value]));
  customFields.forEach((field) => {
    if (field.value) valueByKey.set(field.fieldKey, field.value);
  });
  const draftValues = input.draftFieldValuesJson ?? {};
  const requiredText = `${fieldValues.map((field) => field.value).join("")}${customFields.map((field) => field.value ?? "").join("")}${Object.values(draftValues).join("")}`;
  const fontBytes = readFileSync(resolveJapaneseFontPath(requiredText));
  // Subset-embedded Japanese fonts can render as garbled glyphs in macOS/WPS preview.
  const font = await pdf.embedFont(fontBytes, { subset: false });

  overlayFields.forEach((field) => {
    const printMode = getFriendsOverlayFieldPrintMode(field);
    if (printMode === "never") return;
    if (printMode === "manual" && !layoutBoxOverrideKeys.has(field.fieldKey)) return;
    if (
      printMode === "candidate" &&
      !confirmedOverlayFieldKeys.has(field.fieldKey) &&
      !(field.sourceFieldKey && confirmedOverlayFieldKeys.has(field.sourceFieldKey))
    ) {
      return;
    }
    const directValue = valueByKey.get(field.fieldKey);
    const sourceValue = field.sourceFieldKey ? valueByKey.get(field.sourceFieldKey) : undefined;
    const value = directValue || sourceValue || "";
    if (!value) return;
    if (printMode === "auto" && !canPrintAutoFieldWithoutAdjustment({ font, field, value })) return;
    drawFieldValue({
      page,
      font,
      field: directValue && field.sourceFieldKey ? { ...field, valuePart: undefined } : field,
      value,
    });
  });

  drawStructuredCheckboxes({
    page,
    font,
    templateId: templateConfig.id,
    draftValues,
    confirmedDataJson: input.confirmedDataJson,
  });

  if (templateConfig.id === FRIENDS_GUARANTEE_DEFAULT_TEMPLATE_ID) {
    const notes = typeof draftValues["company_option.friends_notes"] === "string" ? draftValues["company_option.friends_notes"].trim() : "";
    if (notes) {
      page.drawText(trimToMeasuredWidth({ font, value: notes, size: 9, maxWidth: 500 }), {
        x: 617,
        y: 100,
        size: 9,
        font,
        color: rgb(0.05, 0.08, 0.12),
        maxWidth: 500,
      });
    }
  }

  return pdf.save({ useObjectStreams: false });
}
