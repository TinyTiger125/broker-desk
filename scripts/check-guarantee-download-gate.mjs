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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const caseFieldNormalization = loadTsModule(path.resolve("src/lib/case-field-normalization.ts"));
const guaranteeApplication = loadTsModule(path.resolve("src/lib/guarantee-application.ts"));
const friendsGuaranteePdf = loadTsModule(path.resolve("src/lib/friends-guarantee-pdf.ts"));
const { evaluateGuaranteeDownloadGate } = loadTsModule(path.resolve("src/lib/guarantee-download-gate.ts"));
const { COMPLETE_CASE_FIELD_DEFAULTS, COMPLETE_DRAFT_DEFAULTS } = loadTsModule(path.resolve("src/lib/guarantee-application-fixtures.ts"));

const {
  GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY,
  getFriendsGuaranteeEffectiveOverlayFields,
  getFriendsOverlayFieldPrintMode,
  setGuaranteeConfirmedOverlayFieldKeys,
} = friendsGuaranteePdf;
const { getCaseFieldValue } = caseFieldNormalization;
const {
  findGuaranteeCompanyTemplate,
  getGuaranteeDraftFieldDefinitions,
  guaranteeCompanyTemplates,
} = guaranteeApplication;

const fullData = COMPLETE_CASE_FIELD_DEFAULTS;
const fullDraftData = COMPLETE_DRAFT_DEFAULTS;

assert(
  findGuaranteeCompanyTemplate("not_a_real_template") === undefined,
  "strict template lookup must not fall back for external route ids",
);

function baseCase(input) {
  return {
    id: "case_gate",
    userId: "user_1",
    caseTitle: "Gate check",
    sourceImportJobIds: [],
    status: "reviewed",
    confirmedDataJson: input.confirmedDataJson,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  };
}

function draft(template, fieldValuesJson) {
  return {
    id: "draft_gate",
    userId: "user_1",
    caseId: "case_gate",
    templateId: template.id,
    companyCode: template.companyCode,
    status: "ready",
    fieldValuesJson,
    fieldStatusesJson: Object.fromEntries(Object.keys(fieldValuesJson).map((key) => [key, "confirmed"])),
    lastReviewedAt: new Date("2026-06-01T00:00:00.000Z"),
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  };
}

function buildDraftValues(template) {
  return Object.fromEntries(
    getGuaranteeDraftFieldDefinitions(template.id)
      .map((definition) => [definition.fieldKey, fullDraftData[definition.fieldKey]])
      .filter(([, value]) => value),
  );
}

function confirmedOverlayData(template, confirmedDataJson, draftValues) {
  const candidateFieldKeys = getFriendsGuaranteeEffectiveOverlayFields({
    templateId: template.id,
    confirmedDataJson,
  })
    .filter((field) => getFriendsOverlayFieldPrintMode(field) === "candidate")
    .flatMap((field) => {
      const sourceFieldKey = field.sourceFieldKey ?? field.fieldKey;
      const value = sourceFieldKey.startsWith("company_option.")
        ? String(draftValues[sourceFieldKey] ?? "").trim()
        : getCaseFieldValue(confirmedDataJson, sourceFieldKey);
      return value ? [field.fieldKey, sourceFieldKey] : [];
    });
  return {
    ...confirmedDataJson,
    [GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY]: setGuaranteeConfirmedOverlayFieldKeys({
      currentValue: confirmedDataJson[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY],
      templateId: template.id,
      fieldKeys: candidateFieldKeys,
    }),
  };
}

const summaries = guaranteeCompanyTemplates
  .filter((template) => template.outputStatus === "active")
  .map((template) => {
    const missingGate = evaluateGuaranteeDownloadGate({
      brokerageCase: baseCase({ confirmedDataJson: {} }),
      template,
      draft: null,
    });
    assert(!missingGate.canDownload, `${template.id}: empty case must not download`);
    assert(missingGate.blockedReasons.some((reason) => reason.code === "required_fields_missing"), `${template.id}: empty case should expose workbench missing reason`);
    assert(missingGate.draftUrl.includes("company-draft-fields"), `${template.id}: draft URL should deep-link to preview company fields`);

    const readyDraft = draft(template, buildDraftValues(template));
    const candidateGate = evaluateGuaranteeDownloadGate({
      brokerageCase: baseCase({ confirmedDataJson: fullData }),
      template,
      draft: readyDraft,
    });
    const candidateReason = candidateGate.blockedReasons.find(
      (reason) => reason.code === "candidate_fields_unconfirmed",
    );
    if (candidateReason) {
      assert(
        candidateReason.fields.every((field) => field.fieldKey.startsWith("company_option.")),
        `${template.id}: saved case fields must not require preview confirmation`,
      );
    }

    const confirmedDataJson = confirmedOverlayData(template, fullData, readyDraft.fieldValuesJson);
    const confirmedGate = evaluateGuaranteeDownloadGate({
      brokerageCase: baseCase({ confirmedDataJson }),
      template,
      draft: readyDraft,
    });
    assert(
      confirmedGate.canDownload,
      `${template.id}: confirmed preview fields should allow download, blocked=${confirmedGate.blockedReasons.map((reason) => reason.code).join(",")}`,
    );

    return {
      template: template.id,
      missingBlockedReasons: missingGate.blockedReasons.map((reason) => reason.code),
      candidateBlockedReasons: candidateGate.blockedReasons.map((reason) => reason.code),
    };
  });

console.log(JSON.stringify({
  ok: true,
  templateCount: summaries.length,
  templates: summaries,
}, null, 2));
