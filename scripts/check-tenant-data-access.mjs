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

const { DEFAULT_TENANT_ID } = loadTsModule("src/lib/tenant-constants.ts");
const data = loadTsModule("src/lib/data.memory.ts");

const userId = "user_demo";
const tenantA = DEFAULT_TENANT_ID;
const tenantB = "tenant_isolated_regression";
const suffix = Date.now().toString(36);

const jobB = await data.addImportJob({
  tenantId: tenantB,
  userId,
  sourceType: "manual",
  title: `isolated import ${suffix}`,
  targetEntity: "properties",
  status: "mapped",
});

const caseB = await data.saveBrokerageCaseExtractionReview({
  tenantId: tenantB,
  userId,
  caseId: `case_isolated_${suffix}`,
  caseType: "unit_sale",
  caseTitle: `isolated tenant case ${suffix}`,
  status: "reviewed",
  confirmedDataJson: { "property.name": `isolated property ${suffix}` },
  sourceImportJobIds: [jobB.id],
  reviewItems: [
    {
      importJobId: jobB.id,
      fieldKey: "property.name",
      label: "物件名",
      extractedValue: `isolated property ${suffix}`,
      normalizedValue: `isolated property ${suffix}`,
      finalValue: `isolated property ${suffix}`,
      sourceSheet: "manual",
      method: "manual",
      confidence: 1,
      reviewStatus: "accepted",
      sourceFileHash: `isolated-${suffix}`,
      templateVersion: "tenant-access-regression",
      reviewedById: userId,
      reviewedAt: new Date(),
    },
  ],
});

assert(await data.getBrokerageCaseById({ tenantId: tenantA, userId, caseId: caseB.id }) === null, "tenant A must not read tenant B case");
assert((await data.getBrokerageCaseById({ tenantId: tenantB, userId, caseId: caseB.id }))?.id === caseB.id, "tenant B should read own case");
assert(!(await data.listBrokerageCases(userId, 500, tenantA)).some((item) => item.id === caseB.id), "tenant A case list must exclude tenant B case");
assert((await data.listBrokerageCases(userId, 500, tenantB)).some((item) => item.id === caseB.id), "tenant B case list should include own case");
assert(!(await data.listImportJobs(userId, 500, tenantA)).some((item) => item.id === jobB.id), "tenant A import list must exclude tenant B import");
assert((await data.listExtractionReviewItems({ tenantId: tenantA, userId, caseId: caseB.id })).length === 0, "tenant A must not read tenant B review items");

const draftB = await data.saveGuaranteeApplicationDraft({
  tenantId: tenantB,
  userId,
  caseId: caseB.id,
  templateId: "friends_guarantee_individual_v1",
  companyCode: "friends_guarantee",
  status: "ready",
  fieldValuesJson: { "company_option.friends_plan_type": "サポート50" },
  fieldStatusesJson: { "company_option.friends_plan_type": "confirmed" },
  lastReviewedAt: new Date(),
});
assert(draftB.tenantId === tenantB, "saved draft should retain tenant B");
assert(
  (await data.getGuaranteeApplicationDraft({
    tenantId: tenantA,
    userId,
    caseId: caseB.id,
    templateId: "friends_guarantee_individual_v1",
  })) === null,
  "tenant A must not read tenant B guarantee draft",
);

const correctionB = await data.addCorrectionEvents({
  tenantId: tenantB,
  userId,
  events: [
    {
      caseId: caseB.id,
      trigger: "case_workbench_save",
      fieldKey: "property.name",
      fieldLabel: "物件名",
      confirmedValue: `isolated property ${suffix}`,
      changeType: "one_off_case_override",
      scopeCandidate: "case_only",
    },
  ],
});
assert(correctionB.length === 1, "tenant B correction event should be written");
assert((await data.listCorrectionEvents({ tenantId: tenantA, userId, caseId: caseB.id })).length === 0, "tenant A must not read tenant B correction events");

const aiDraftB = await data.addAiExperienceDrafts({
  tenantId: tenantB,
  userId,
  drafts: [
    {
      title: `isolated ai draft ${suffix}`,
      bodyMarkdown: "tenant boundary test",
      eventIds: correctionB.map((event) => event.id),
      fieldKey: "property.name",
      changeType: "one_off_case_override",
      scopeCandidate: "case_only",
    },
  ],
});
assert(aiDraftB.length === 1, "tenant B AI experience draft should be written");
assert(!(await data.listAiExperienceDrafts({ tenantId: tenantA, userId, limit: 500 })).some((item) => item.id === aiDraftB[0].id), "tenant A must not read tenant B AI drafts");

const attachmentB = await data.addAttachment({
  tenantId: tenantB,
  userId,
  targetType: "import_job",
  targetId: jobB.id,
  fileName: `isolated-${suffix}.pdf`,
  fileType: "application/pdf",
});
assert(!(await data.listAttachments({ tenantId: tenantA, userId, targetType: "import_job", limit: 500 })).some((item) => item.id === attachmentB.id), "tenant A must not read tenant B attachment");

const outputB = await data.addGeneratedOutput({
  tenantId: tenantB,
  userId,
  actorId: userId,
  outputType: "property_overview",
  outputFormat: "pdf",
  language: "ja",
  title: `isolated output ${suffix}`,
  documentNumber: `BD-TENANT-${suffix}`,
});
assert(await data.getGeneratedOutputById({ tenantId: tenantA, userId, id: outputB.id }) === undefined, "tenant A must not read tenant B generated output");
assert((await data.getGeneratedOutputById({ tenantId: tenantB, userId, id: outputB.id }))?.id === outputB.id, "tenant B should read own generated output");

console.log("[PASS] tenant data access boundary regression");
