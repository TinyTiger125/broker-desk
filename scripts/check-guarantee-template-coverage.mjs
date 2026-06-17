#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const tsModuleCache = new Map();

function resolveProjectAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  return path.resolve(`src/lib/${request.slice("@/lib/".length)}.ts`);
}

function loadTsModule(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (tsModuleCache.has(sourcePath)) return tsModuleCache.get(sourcePath);

  const source = fs.readFileSync(sourcePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  const originalRequire = mod.require.bind(mod);
  tsModuleCache.set(sourcePath, mod.exports);
  mod.require = (request) => {
    const aliasPath = resolveProjectAlias(request);
    return aliasPath ? loadTsModule(aliasPath) : originalRequire(request);
  };
  mod._compile(js, sourcePath);
  tsModuleCache.set(sourcePath, mod.exports);
  return mod.exports;
}

function sortedByFieldKey(items) {
  return [...items].sort((a, b) => String(a.fieldKey).localeCompare(String(b.fieldKey)));
}

function segmentSignature(segment) {
  if (!segment) return "";
  return [
    segment.mode ?? "",
    segment.cells ?? "",
    segment.align ?? "",
    segment.gap ?? "",
    segment.xInset ?? "",
    segment.yOffset ?? "",
  ].join("/");
}

function fieldSignature(field) {
  return [
    field.sourceFieldKey ?? field.fieldKey,
    field.valueFormat ?? "",
    field.valuePart ?? "",
    segmentSignature(field.segment),
  ].join("|");
}

function readFixtureValue(input) {
  const { field, values, getCaseFieldValue, formatFriendsOverlayValue } = input;
  const sourceFieldKey = field.sourceFieldKey ?? field.fieldKey;
  const rawValue = String(values[sourceFieldKey] ?? getCaseFieldValue(values, sourceFieldKey) ?? "").trim();
  return formatFriendsOverlayValue(field, rawValue);
}

const guaranteeApplication = loadTsModule(path.resolve("src/lib/guarantee-application.ts"));
const caseFieldCatalog = loadTsModule(path.resolve("src/lib/case-field-catalog.ts"));
const caseFieldNormalization = loadTsModule(path.resolve("src/lib/case-field-normalization.ts"));
const friendsGuaranteePdf = loadTsModule(path.resolve("src/lib/friends-guarantee-pdf.ts"));
const { COMPLETE_CASE_FIELD_DEFAULTS, COMPLETE_DRAFT_DEFAULTS } = loadTsModule(
  path.resolve("src/lib/guarantee-application-fixtures.ts"),
);

const { guaranteeCompanyTemplates, getGuaranteeFieldCompletionMode } = guaranteeApplication;
const { getCaseFieldDefinition } = caseFieldCatalog;
const { getCaseFieldValue } = caseFieldNormalization;
const {
  formatFriendsOverlayValue,
  getFriendsGuaranteeCustomOverlayFields,
  getFriendsGuaranteeEffectiveDeletedOverlayFieldKeys,
  getFriendsGuaranteeEffectiveLayoutOverrides,
  getFriendsGuaranteeEffectiveOverlayFields,
  getFriendsOverlayFieldPrintMode,
  getGuaranteePdfTemplateConfig,
  isFriendsOverlayFieldNeverPrinted,
} = friendsGuaranteePdf;

const fixtureValues = { ...COMPLETE_CASE_FIELD_DEFAULTS, ...COMPLETE_DRAFT_DEFAULTS };

function labelForFieldKey(fieldKey, fields) {
  return (
    fields.find((field) => (field.sourceFieldKey ?? field.fieldKey) === fieldKey)?.label ??
    getCaseFieldDefinition(fieldKey)?.label ??
    fieldKey
  );
}

const summaries = guaranteeCompanyTemplates
  .filter((template) => template.outputStatus === "active")
  .map((template) => {
    const baseFields = getGuaranteePdfTemplateConfig(template.id).overlayFields.filter(
      (field) => !isFriendsOverlayFieldNeverPrinted(field),
    );
    const effectiveFields = getFriendsGuaranteeEffectiveOverlayFields({
      templateId: template.id,
      confirmedDataJson: fixtureValues,
    });
    const customFields = getFriendsGuaranteeCustomOverlayFields({
      templateId: template.id,
      confirmedDataJson: fixtureValues,
    });
    const deletedFieldKeys = getFriendsGuaranteeEffectiveDeletedOverlayFieldKeys({
      templateId: template.id,
      confirmedDataJson: fixtureValues,
    });
    const layoutOverrides = getFriendsGuaranteeEffectiveLayoutOverrides({
      templateId: template.id,
      confirmedDataJson: fixtureValues,
    });

    const effectiveSignatures = new Set(effectiveFields.map(fieldSignature));
    const effectiveSourceKeys = new Set(
      effectiveFields.map((field) => field.sourceFieldKey ?? field.fieldKey).filter((fieldKey) => fieldKey),
    );
    const effectiveTextSourceKeys = new Set(
      effectiveFields
        .filter((field) => getFriendsOverlayFieldPrintMode(field) !== "manual")
        .map((field) => field.sourceFieldKey ?? field.fieldKey)
        .filter((fieldKey) => fieldKey && !String(fieldKey).startsWith("company_option.")),
    );

    const unboundCustomFields = sortedByFieldKey(
      customFields
        .filter((field) => !field.sourceFieldKey)
        .map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          hasStaticValue: Boolean(String(field.value ?? "").trim()),
        })),
    );

    const boundFieldsWithoutFixtureValue = sortedByFieldKey(
      effectiveFields
        .filter((field) => field.sourceFieldKey)
        .filter((field) => !readFixtureValue({ field, values: fixtureValues, getCaseFieldValue, formatFriendsOverlayValue }))
        .map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          sourceFieldKey: field.sourceFieldKey,
          valueFormat: field.valueFormat,
          valuePart: field.valuePart,
        })),
    );

    const requiredTextSourceGaps = sortedByFieldKey(
      template.requiredFieldKeys
        .filter((fieldKey) => !fieldKey.startsWith("company_option."))
        .filter((fieldKey) => fixtureValues[fieldKey] || getCaseFieldValue(fixtureValues, fieldKey))
        .filter((fieldKey) => !effectiveSourceKeys.has(fieldKey))
        .map((fieldKey) => ({
          fieldKey,
          label: labelForFieldKey(fieldKey, [...effectiveFields, ...baseFields]),
          value: String(fixtureValues[fieldKey] ?? getCaseFieldValue(fixtureValues, fieldKey) ?? ""),
        })),
    );

    const manualOrCompanyOptionGaps = sortedByFieldKey(
      [...new Set([...template.requiredFieldKeys, ...template.companySpecificOptionKeys])]
        .filter((fieldKey) => fieldKey.startsWith("company_option."))
        .filter((fieldKey) => fixtureValues[fieldKey])
        .filter((fieldKey) => !effectiveSourceKeys.has(fieldKey))
        .map((fieldKey) => ({
          fieldKey,
          label: labelForFieldKey(fieldKey, [...effectiveFields, ...baseFields]),
          mode: getGuaranteeFieldCompletionMode(template, fieldKey),
          value: fixtureValues[fieldKey],
        })),
    );

    const baselineSplitGaps = sortedByFieldKey(
      baseFields
        .filter((field) => getFriendsOverlayFieldPrintMode(field) !== "manual")
        .filter((field) => readFixtureValue({ field, values: fixtureValues, getCaseFieldValue, formatFriendsOverlayValue }))
        .filter((field) => !effectiveSignatures.has(fieldSignature(field)))
        .map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          sourceFieldKey: field.sourceFieldKey ?? field.fieldKey,
          sourceCovered: effectiveSourceKeys.has(field.sourceFieldKey ?? field.fieldKey),
          valueFormat: field.valueFormat,
          valuePart: field.valuePart,
          segment: field.segment ? segmentSignature(field.segment) : undefined,
        })),
    );

    const duplicateSignatureCounts = [...effectiveFields.reduce((map, field) => {
      const signature = fieldSignature(field);
      map.set(signature, (map.get(signature) ?? 0) + 1);
      return map;
    }, new Map())]
      .filter(([, count]) => count > 1)
      .map(([signature, count]) => ({ signature, count }))
      .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));

    return {
      template: template.id,
      counts: {
        baseFields: baseFields.length,
        effectiveFields: effectiveFields.length,
        customFields: customFields.length,
        deletedFields: deletedFieldKeys.size,
        layoutOverrides: Object.keys(layoutOverrides).length,
        autoFields: effectiveFields.filter((field) => getFriendsOverlayFieldPrintMode(field) === "auto").length,
        candidateFields: effectiveFields.filter((field) => getFriendsOverlayFieldPrintMode(field) === "candidate").length,
        manualFields: effectiveFields.filter((field) => getFriendsOverlayFieldPrintMode(field) === "manual").length,
        coveredTextSourceKeys: effectiveTextSourceKeys.size,
      },
      requiredTextSourceGaps,
      manualOrCompanyOptionGaps,
      unboundCustomFields,
      boundFieldsWithoutFixtureValue,
      baselineSplitGaps,
      duplicateSignatureCounts,
    };
  });

const totals = summaries.reduce(
  (acc, summary) => {
    acc.requiredTextSourceGaps += summary.requiredTextSourceGaps.length;
    acc.manualOrCompanyOptionGaps += summary.manualOrCompanyOptionGaps.length;
    acc.unboundCustomFields += summary.unboundCustomFields.length;
    acc.boundFieldsWithoutFixtureValue += summary.boundFieldsWithoutFixtureValue.length;
    acc.baselineSplitGaps += summary.baselineSplitGaps.length;
    acc.duplicateSignatures += summary.duplicateSignatureCounts.length;
    return acc;
  },
  {
    requiredTextSourceGaps: 0,
    manualOrCompanyOptionGaps: 0,
    unboundCustomFields: 0,
    boundFieldsWithoutFixtureValue: 0,
    baselineSplitGaps: 0,
    duplicateSignatures: 0,
  },
);

console.log(JSON.stringify({
  ok: totals.requiredTextSourceGaps === 0 && totals.unboundCustomFields === 0,
  fixtureFieldCount: Object.keys(fixtureValues).length,
  templateCount: summaries.length,
  totals,
  templates: summaries,
}, null, 2));
