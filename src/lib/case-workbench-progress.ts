import { CASE_FIELD_DEFINITIONS, getCaseFieldInformation } from "@/lib/case-field-catalog";
import {
  isCaseFieldApplicable,
  resolveCaseApplicabilityConditions,
} from "@/lib/case-field-applicability";
import { getCaseFieldAliases, getCaseFieldValue } from "@/lib/case-field-normalization";
import { resolveCaseWorkbenchFieldRequirement, type CaseFieldRequirement } from "@/lib/case-workbench-field-rules";

const WORKBENCH_FIELD_STATUS_KEY = "__workbenchFieldStatuses";

type CaseProgressReviewItem = {
  fieldKey: string;
  reviewStatus: string;
  createdAt: Date;
};

export type CaseWorkbenchProgressSnapshot = {
  completed: number;
  total: number;
  open: number;
  percent: number;
  reviewCompleted: number;
  reviewTotal: number;
  reviewOpen: number;
  reviewPercent: number;
  applicableRequiredFieldKeys: string[];
};

function readStatusMap(confirmedData: Record<string, unknown>): Record<string, string> {
  const raw = confirmedData[WORKBENCH_FIELD_STATUS_KEY];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
}

function getLatestReviewByFieldKey(reviewItems: readonly CaseProgressReviewItem[]) {
  const reviewByFieldKey = reviewItems.reduce<Map<string, CaseProgressReviewItem[]>>((acc, item) => {
    const list = acc.get(item.fieldKey) ?? [];
    list.push(item);
    acc.set(item.fieldKey, list);
    return acc;
  }, new Map());

  return (fieldKey: string) => {
    const items = getCaseFieldAliases(fieldKey)
      .flatMap((alias) => reviewByFieldKey.get(alias) ?? [])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return items[items.length - 1];
  };
}

function isFieldComplete(input: {
  fieldKey: string;
  confirmedData: Record<string, unknown>;
  statusMap: Record<string, string>;
  latestReview?: CaseProgressReviewItem;
}) {
  const value = getCaseFieldValue(input.confirmedData, input.fieldKey);
  const manualState = input.statusMap[input.fieldKey];
  if (manualState === "unknown" || manualState === "rejected" || manualState === "needs_review") return false;
  if (manualState === "confirmed" || manualState === "edited") return Boolean(value);
  if (input.latestReview?.reviewStatus === "suggested") return false;
  if (input.latestReview?.reviewStatus === "unknown" || input.latestReview?.reviewStatus === "rejected") return false;
  return Boolean(value);
}

export function getCaseWorkbenchProgressSnapshot(input: {
  confirmedData: Record<string, unknown>;
  reviewItems: readonly CaseProgressReviewItem[];
  ruleMap: ReadonlyMap<string, CaseFieldRequirement>;
}): CaseWorkbenchProgressSnapshot {
  const statusMap = readStatusMap(input.confirmedData);
  const evidenceFieldKeys = new Set(input.reviewItems.map((item) => item.fieldKey));
  const conditions = resolveCaseApplicabilityConditions({
    confirmedData: input.confirmedData,
    evidenceFieldKeys,
  });
  const getLatestReview = getLatestReviewByFieldKey(input.reviewItems);
  const applicableRequiredFields = CASE_FIELD_DEFINITIONS.filter((field) => {
    if (field.storageScope !== "case_fact") return false;
    const information = getCaseFieldInformation(field);
    if (resolveCaseWorkbenchFieldRequirement(field.fieldKey, information.importance, input.ruleMap) !== "required") return false;
    return isCaseFieldApplicable({
      appliesWhen: information.appliesWhen,
      confirmedData: input.confirmedData,
      conditions,
      manualState: statusMap[field.fieldKey],
    });
  });
  const completed = applicableRequiredFields.filter((field) =>
    isFieldComplete({
      fieldKey: field.fieldKey,
      confirmedData: input.confirmedData,
      statusMap,
      latestReview: getLatestReview(field.fieldKey),
    }),
  ).length;
  const total = applicableRequiredFields.length;
  const applicableFields = CASE_FIELD_DEFINITIONS.filter((field) => {
    if (field.storageScope !== "case_fact") return false;
    const information = getCaseFieldInformation(field);
    return isCaseFieldApplicable({
      appliesWhen: information.appliesWhen,
      confirmedData: input.confirmedData,
      conditions,
      manualState: statusMap[field.fieldKey],
    });
  });
  const reviewCompleted = applicableFields.filter((field) =>
    isFieldComplete({
      fieldKey: field.fieldKey,
      confirmedData: input.confirmedData,
      statusMap,
      latestReview: getLatestReview(field.fieldKey),
    }),
  ).length;
  const reviewTotal = applicableFields.length;
  return {
    completed,
    total,
    open: Math.max(0, total - completed),
    percent: total > 0 ? Math.round((completed / total) * 100) : 100,
    reviewCompleted,
    reviewTotal,
    reviewOpen: Math.max(0, reviewTotal - reviewCompleted),
    reviewPercent: reviewTotal > 0 ? Math.round((reviewCompleted / reviewTotal) * 100) : 100,
    applicableRequiredFieldKeys: applicableRequiredFields.map((field) => field.fieldKey),
  };
}
