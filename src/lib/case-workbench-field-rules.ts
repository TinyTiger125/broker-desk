import {
  CASE_FIELD_CATALOG_GROUPS,
  CASE_FIELD_DEFINITIONS,
  getCaseFieldInformation,
  type CaseFieldAppliesWhen,
  type CaseFieldImportance,
} from "@/lib/case-field-catalog";

export type CaseFieldRequirement = "required" | "optional";

export type CaseWorkbenchFieldRule = {
  id: string;
  tenantId?: string;
  userId: string;
  fieldKey: string;
  requirement: CaseFieldRequirement;
  updatedAt: Date;
};

export type CaseWorkbenchFieldRuleInput = {
  fieldKey: string;
  requirement: CaseFieldRequirement;
};

export type EffectiveCaseWorkbenchFieldRule = {
  fieldKey: string;
  label: string;
  groupId: string;
  groupLabel: string;
  treeNodeId: string;
  treePath: readonly string[];
  importance: CaseFieldImportance;
  appliesWhen: CaseFieldAppliesWhen;
  defaultRequirement: CaseFieldRequirement;
  requirement: CaseFieldRequirement;
};

const caseFactDefinitions = CASE_FIELD_DEFINITIONS.filter((field) => field.storageScope === "case_fact");

export const CASE_WORKBENCH_FIELD_KEYS = caseFactDefinitions.map((field) => field.fieldKey);
export const CASE_WORKBENCH_FIELD_KEY_SET = new Set<string>(CASE_WORKBENCH_FIELD_KEYS);

export function isCaseWorkbenchFieldKey(value: string): boolean {
  return CASE_WORKBENCH_FIELD_KEY_SET.has(value);
}

export function getDefaultCaseFieldRequirement(importance: CaseFieldImportance): CaseFieldRequirement {
  return importance === "core" ? "required" : "optional";
}

export function normalizeCaseFieldRequirement(value: unknown): CaseFieldRequirement | null {
  return value === "required" || value === "optional" ? value : null;
}

export function buildCaseWorkbenchRuleMap(rules: readonly CaseWorkbenchFieldRule[]): Map<string, CaseFieldRequirement> {
  return new Map(
    rules
      .filter((rule) => isCaseWorkbenchFieldKey(rule.fieldKey) && normalizeCaseFieldRequirement(rule.requirement))
      .map((rule) => [rule.fieldKey, rule.requirement]),
  );
}

export function resolveCaseWorkbenchFieldRequirement(
  fieldKey: string,
  importance: CaseFieldImportance,
  ruleMap: ReadonlyMap<string, CaseFieldRequirement>,
): CaseFieldRequirement {
  return ruleMap.get(fieldKey) ?? getDefaultCaseFieldRequirement(importance);
}

export function listCaseWorkbenchRuleCatalog(
  rules: readonly CaseWorkbenchFieldRule[],
): EffectiveCaseWorkbenchFieldRule[] {
  const ruleMap = buildCaseWorkbenchRuleMap(rules);
  return CASE_FIELD_CATALOG_GROUPS.flatMap((group) =>
    group.fields
      .filter((field) => field.storageScope === "case_fact")
      .map((field) => {
        const information = getCaseFieldInformation(field);
        const defaultRequirement = getDefaultCaseFieldRequirement(information.importance);
        return {
          fieldKey: field.fieldKey,
          label: field.label,
          groupId: group.id,
          groupLabel: group.label,
          treeNodeId: information.treeNodeId,
          treePath: information.treePath,
          importance: information.importance,
          appliesWhen: information.appliesWhen,
          defaultRequirement,
          requirement: resolveCaseWorkbenchFieldRequirement(field.fieldKey, information.importance, ruleMap),
        };
      }),
  );
}
