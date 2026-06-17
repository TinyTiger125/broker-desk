import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function resolveProjectAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  return path.resolve(`src/lib/${request.slice("@/lib/".length)}.ts`);
}

function loadTsModule(sourcePath, replacements = {}) {
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
  mod.require = (request) => {
    if (request in replacements) return replacements[request];
    const aliasPath = resolveProjectAlias(request);
    return aliasPath ? loadTsModule(aliasPath, replacements) : originalRequire(request);
  };
  mod._compile(js, sourcePath);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const caseFieldNormalization = loadTsModule(path.resolve("src/lib/case-field-normalization.ts"));
const {
  buildExtractionReviewCorrectionEvents,
  buildGuaranteeDraftCorrectionEvents,
  buildPdfPreviewCorrectionEvents,
  buildWorkbenchCorrectionEvents,
} = loadTsModule(path.resolve("src/lib/correction-event-builder.ts"), {
  "@/lib/case-field-normalization": caseFieldNormalization,
});

const baseReviewItem = {
  id: "review_1",
  userId: "user_1",
  caseId: "case_1",
  importJobId: "import_1",
  fieldKey: "property_location",
  label: "所在地",
  extractedValue: "港区芝公園1-2-3",
  normalizedValue: "港区芝公園1-2-3",
  sourceSheet: "入力",
  sourceCell: "B12",
  method: "ai",
  confidence: 0.62,
  reviewStatus: "suggested",
  sourceFileHash: "hash_1",
  templateVersion: "important-matters-v1",
  reviewedAt: new Date("2026-06-01T00:00:00.000Z"),
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

const drafts = buildWorkbenchCorrectionEvents({
  caseId: "case_1",
  trigger: "case_workbench_save",
  fieldKeys: ["property.address", "applicant.phone", "applicant.name", "lease.rent"],
  labelsByFieldKey: {
    "property.address": "所在地",
    "applicant.phone": "電話番号",
    "applicant.name": "氏名",
    "lease.rent": "家賃",
  },
  beforeData: {
    "applicant.name": "山田 太郎",
    "lease.rent": "120000",
  },
  afterData: {
    "property.address": "東京都港区芝公園1-2-3",
    "applicant.phone": "090-1234-5678",
    "applicant.name": "山田太郎",
    "lease.rent": "120000",
  },
  reviewItems: [baseReviewItem],
});

const byField = Object.fromEntries(drafts.map((draft) => [draft.fieldKey, draft]));

assert(drafts.length === 3, "only meaningful changed fields should create correction events");
assert(byField["property.address"].changeType === "ai_extraction_error", "changed AI candidate should be classified as AI extraction correction");
assert(byField["property.address"].sourceLocation === "入力 / B12", "source location should keep spreadsheet evidence");
assert(byField["property.address"].scopeCandidate === "source_template", "source template evidence should scope the learning candidate");
assert(byField["applicant.phone"].changeType === "source_absent_user_completed", "manual completion without candidate should be captured");
assert(byField["applicant.name"].changeType === "user_or_team_preference", "changed existing value should be captured as a team preference candidate");
assert(!byField["lease.rent"], "unchanged values must not create noisy correction events");

const extractionDrafts = buildExtractionReviewCorrectionEvents({
  caseId: "case_2",
  reviewItems: [
    {
      ...baseReviewItem,
      id: "review_edited",
      fieldKey: "property_location",
      label: "所在地",
      normalizedValue: "港区芝公園1-2-3",
      finalValue: "東京都港区芝公園1-2-3",
      reviewStatus: "edited",
    },
    {
      ...baseReviewItem,
      id: "review_accepted",
      fieldKey: "lease.rent",
      label: "家賃",
      normalizedValue: "120000",
      finalValue: "120000",
      reviewStatus: "accepted",
    },
    {
      ...baseReviewItem,
      id: "review_rejected",
      fieldKey: "applicant.birthDate",
      label: "生年月日",
      normalizedValue: "1990年1月11日",
      finalValue: undefined,
      reviewStatus: "rejected",
    },
  ],
});
const extractionByField = Object.fromEntries(extractionDrafts.map((draft) => [draft.fieldKey, draft]));
assert(extractionDrafts.length === 2, "extraction review should capture only corrected/rejected candidates");
assert(extractionByField["property.address"].changeType === "ai_extraction_error", "edited source extraction should canonicalize and capture AI correction");
assert(!extractionByField["lease.rent"], "accepted extraction candidates should not create learning noise");
assert(extractionByField["applicant.birthDate"].changeType === "one_off_case_override", "rejected extraction candidate should be audit-only by default");

const guaranteeDraftEvents = buildGuaranteeDraftCorrectionEvents({
  caseId: "case_4",
  templateId: "friends_guarantee_individual_v1",
  fieldKeys: [
    "company_option.friends_plan_type",
    "company_option.friends_consent",
    "company_option.friends_notes",
  ],
  labelsByFieldKey: {
    "company_option.friends_plan_type": "保証プラン",
    "company_option.friends_consent": "確認事項",
    "company_option.friends_notes": "通信欄",
  },
  beforeData: {
    "company_option.friends_plan_type": "旧プラン",
    "company_option.friends_notes": "旧メモ",
  },
  afterData: {
    "company_option.friends_plan_type": "住居用標準プラン",
    "company_option.friends_consent": "確認済み",
  },
});
const guaranteeDraftByField = Object.fromEntries(guaranteeDraftEvents.map((draft) => [draft.fieldKey, draft]));
assert(guaranteeDraftEvents.length === 3, "draft save should capture changed, newly filled, and cleared company-specific fields");
assert(guaranteeDraftByField["company_option.friends_plan_type"].trigger === "guarantee_draft_save", "draft save trigger should be preserved");
assert(guaranteeDraftByField["company_option.friends_plan_type"].changeType === "user_or_team_preference", "changed draft option should be reusable output preference candidate");
assert(guaranteeDraftByField["company_option.friends_plan_type"].scopeCandidate === "output_template", "changed draft option should scope to output template");
assert(guaranteeDraftByField["company_option.friends_consent"].changeType === "source_absent_user_completed", "newly filled draft option should be captured");
assert(guaranteeDraftByField["company_option.friends_notes"].changeType === "one_off_case_override", "cleared draft value should be case-only");
assert(guaranteeDraftByField["company_option.friends_notes"].scopeCandidate === "case_only", "cleared draft value should not become reusable rule");

const pdfDrafts = buildPdfPreviewCorrectionEvents({
  caseId: "case_3",
  templateId: "friends_guarantee_individual_v1",
  fieldKeys: ["applicant.phone", "lease.rent", "company_option.plan"],
  labelsByFieldKey: {
    "applicant.phone": "携帯電話",
    "lease.rent": "家賃",
    "company_option.plan": "保証プラン",
  },
  beforeData: {
    "applicant.phone": "090-1234-5678",
    "lease.rent": "120000",
    "company_option.plan": "旧プラン",
  },
  afterData: {
    "applicant.phone": "090-1234-5678-999",
    "lease.rent": "120000",
    "company_option.plan": "新プラン",
  },
  layoutDirty: true,
  layoutSaveScope: "template",
  previousLayoutOverrides: {
    "applicant.phone": { box: { x: 10, y: 20, width: 80, height: 16 } },
  },
  nextLayoutOverrides: {
    "applicant.phone": { box: { x: 14, y: 20, width: 90, height: 16 } },
    "applicant.birthDate": { box: { x: 100, y: 120, width: 70, height: 16 } },
  },
  previousCustomOverlayFields: [],
  nextCustomOverlayFields: [
    {
      fieldKey: "custom.postal",
      label: "郵便番号",
      value: "1234567",
      box: { x: 5, y: 6, width: 70, height: 16 },
      segment: { cells: 7, mode: "digits", align: "left" },
    },
  ],
});
const pdfByField = Object.fromEntries(pdfDrafts.map((draft) => [draft.fieldKey, draft]));
assert(pdfByField["applicant.phone"].changeType === "template_output_format_error", "PDF preview value edit should become output-format correction");
assert(!pdfByField["lease.rent"], "unchanged PDF preview field should not create event");
assert(pdfByField["company_option.plan"].changeType === "template_output_format_error", "draft option edit should be captured as output correction");
assert(pdfByField["layout.applicant.phone"].changeType === "template_output_position_error", "layout move should be captured");
assert(pdfByField["layout.applicant.phone"].scopeCandidate === "output_template", "template-scope layout save should produce template-scoped event");
assert(pdfByField["custom_overlay.custom.postal"].changeType === "template_output_position_error", "custom split field should create output correction event");

console.log("[PASS] correction event builder regression");
