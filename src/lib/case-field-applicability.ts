import { CASE_FIELD_DEFINITIONS, type CaseFieldAppliesWhen } from "@/lib/case-field-catalog";
import { getCaseFieldValue } from "@/lib/case-field-normalization";

export const CASE_APPLICABILITY_SETTINGS_KEY = "__caseApplicability";

export type CaseApplicabilityConditionKey =
  | "identity_document_available"
  | "employment_required"
  | "guarantor_required"
  | "emergency_contact_required"
  | "co_occupant_exists"
  | "brokerage_or_management_known";

export type CaseApplicabilityChoice = "included" | "excluded";

export type CaseApplicabilitySettings = Partial<Record<CaseApplicabilityConditionKey, CaseApplicabilityChoice>>;

export type ResolvedCaseApplicabilityCondition = {
  key: CaseApplicabilityConditionKey;
  choice: CaseApplicabilityChoice;
  source: "saved" | "inferred";
};

export const CASE_APPLICABILITY_CONDITIONS = [
  "identity_document_available",
  "employment_required",
  "guarantor_required",
  "emergency_contact_required",
  "co_occupant_exists",
  "brokerage_or_management_known",
] as const satisfies readonly CaseApplicabilityConditionKey[];

const FIELD_PREFIXES_BY_CONDITION: Record<CaseApplicabilityConditionKey, readonly string[]> = {
  identity_document_available: [
    "applicant.identityDocumentType",
    "applicant.nationality",
    "applicant.residenceStatus",
    "applicant.residencePeriod",
    "applicant.residenceCard",
    "applicant.workRestriction",
    "applicant.driverLicense",
    "applicant.healthInsuranceType",
  ],
  employment_required: ["applicant.employer", "applicant.occupation", "applicant.jobType", "applicant.employmentType", "applicant.annualIncome", "applicant.monthlyIncome", "applicant.yearsEmployed", "applicant.payday"],
  guarantor_required: ["guarantor."],
  emergency_contact_required: ["emergencyContact."],
  co_occupant_exists: ["coOccupants."],
  brokerage_or_management_known: ["broker.", "management.", "landlord."],
};

function isChoice(value: unknown): value is CaseApplicabilityChoice {
  return value === "included" || value === "excluded";
}

function fieldKeyMatchesPrefixes(fieldKey: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => fieldKey === prefix || fieldKey.startsWith(prefix));
}

function hasMatchingCaseValue(confirmedData: Record<string, unknown>, prefixes: readonly string[]) {
  return CASE_FIELD_DEFINITIONS.some(
    (field) => field.storageScope === "case_fact" && fieldKeyMatchesPrefixes(field.fieldKey, prefixes) && Boolean(getCaseFieldValue(confirmedData, field.fieldKey)),
  );
}

function hasMatchingEvidence(evidenceFieldKeys: ReadonlySet<string>, prefixes: readonly string[]) {
  return [...evidenceFieldKeys].some((fieldKey) => fieldKeyMatchesPrefixes(fieldKey, prefixes));
}

function isLeaseCase(confirmedData: Record<string, unknown>) {
  const workflowType = String(confirmedData.__workflowType ?? "").trim();
  return workflowType !== "sale_mandate";
}

export function readCaseApplicabilitySettings(confirmedData: Record<string, unknown>): CaseApplicabilitySettings {
  const raw = confirmedData[CASE_APPLICABILITY_SETTINGS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  return Object.fromEntries(
    CASE_APPLICABILITY_CONDITIONS.flatMap((key) => {
      const value = (raw as Record<string, unknown>)[key];
      return isChoice(value) ? [[key, value]] : [];
    }),
  );
}

export function writeCaseApplicabilitySettings(
  confirmedData: Record<string, unknown>,
  settings: CaseApplicabilitySettings,
) {
  const nextData = { ...confirmedData };
  nextData[CASE_APPLICABILITY_SETTINGS_KEY] = Object.fromEntries(
    CASE_APPLICABILITY_CONDITIONS.flatMap((key) => (isChoice(settings[key]) ? [[key, settings[key]]] : [])),
  );
  return nextData;
}

export function inferCaseApplicabilityChoice(input: {
  key: CaseApplicabilityConditionKey;
  confirmedData: Record<string, unknown>;
  evidenceFieldKeys?: ReadonlySet<string>;
}): CaseApplicabilityChoice {
  const evidenceFieldKeys = input.evidenceFieldKeys ?? new Set<string>();
  const prefixes = FIELD_PREFIXES_BY_CONDITION[input.key];
  const hasKnownInformation = hasMatchingCaseValue(input.confirmedData, prefixes) || hasMatchingEvidence(evidenceFieldKeys, prefixes);

  if (input.key === "employment_required" || input.key === "emergency_contact_required") {
    return isLeaseCase(input.confirmedData) ? "included" : hasKnownInformation ? "included" : "excluded";
  }
  return hasKnownInformation ? "included" : "excluded";
}

export function resolveCaseApplicabilityConditions(input: {
  confirmedData: Record<string, unknown>;
  evidenceFieldKeys?: ReadonlySet<string>;
}): Record<CaseApplicabilityConditionKey, ResolvedCaseApplicabilityCondition> {
  const saved = readCaseApplicabilitySettings(input.confirmedData);
  return Object.fromEntries(
    CASE_APPLICABILITY_CONDITIONS.map((key) => {
      const savedChoice = saved[key];
      return [
        key,
        {
          key,
          choice:
            savedChoice ??
            inferCaseApplicabilityChoice({
              key,
              confirmedData: input.confirmedData,
              evidenceFieldKeys: input.evidenceFieldKeys,
            }),
          source: savedChoice ? "saved" : "inferred",
        },
      ];
    }),
  ) as Record<CaseApplicabilityConditionKey, ResolvedCaseApplicabilityCondition>;
}

export function isCaseFieldApplicable(input: {
  appliesWhen: CaseFieldAppliesWhen;
  confirmedData: Record<string, unknown>;
  conditions: Record<CaseApplicabilityConditionKey, ResolvedCaseApplicabilityCondition>;
  manualState?: string;
}) {
  if (input.manualState === "not_applicable") return false;
  if (input.appliesWhen === "always") return true;
  if (input.appliesWhen === "lease_case") return isLeaseCase(input.confirmedData);
  if (input.appliesWhen === "output_template_selected") return false;
  return input.conditions[input.appliesWhen].choice === "included";
}

export function parseCaseApplicabilitySettings(formData: FormData): CaseApplicabilitySettings {
  return Object.fromEntries(
    CASE_APPLICABILITY_CONDITIONS.flatMap((key) => {
      const value = String(formData.get(`condition:${key}`) ?? "").trim();
      return isChoice(value) ? [[key, value]] : [];
    }),
  );
}
