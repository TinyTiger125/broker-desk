import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadTsModule(sourcePath) {
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
  mod._compile(js, sourcePath);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { buildAiExperienceDraftsFromCorrectionEvents } = loadTsModule(path.resolve("src/lib/ai-experience-draft.ts"));

const baseEvent = {
  id: "correction_1",
  userId: "user_1",
  caseId: "case_1",
  trigger: "pdf_preview_save",
  fieldKey: "layout.applicant.phone",
  fieldLabel: "携帯電話 位置",
  aiValue: "10,20,80,16",
  confirmedValue: "14,20,90,16",
  changeType: "template_output_position_error",
  templateId: "zenhoren_individual_v1",
  scopeCandidate: "output_template",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

const single = buildAiExperienceDraftsFromCorrectionEvents({
  events: [baseEvent],
});
assert(single.length === 0, "single correction should not create an experience draft");

const caseOnly = buildAiExperienceDraftsFromCorrectionEvents({
  events: [
    { ...baseEvent, id: "correction_case_1", scopeCandidate: "case_only" },
    { ...baseEvent, id: "correction_case_2", caseId: "case_2", scopeCandidate: "case_only" },
  ],
});
assert(caseOnly.length === 0, "case-only events must not become reusable experience drafts");

const drafts = buildAiExperienceDraftsFromCorrectionEvents({
  events: [
    baseEvent,
    {
      ...baseEvent,
      id: "correction_2",
      caseId: "case_2",
      aiValue: "10,20,80,16",
      confirmedValue: "15,20,90,16",
      createdAt: new Date("2026-06-02T00:00:00.000Z"),
    },
    {
      ...baseEvent,
      id: "correction_other",
      fieldKey: "applicant.birthDate",
      fieldLabel: "生年月日",
      changeType: "ai_extraction_error",
      scopeCandidate: "source_template",
      templateId: undefined,
    },
  ],
});

assert(drafts.length === 1, "repeated same-scope correction should create one draft");
assert(drafts[0].status === undefined, "builder should leave status to storage gate default");
assert(drafts[0].scopeCandidate === "output_template", "draft should keep scoped reuse candidate");
assert(drafts[0].eventIds.length === 2, "draft should cite the source correction events");
assert(drafts[0].bodyMarkdown.includes("## Risk"), "draft should include risk section");
assert(drafts[0].bodyMarkdown.includes("ユーザー確認"), "draft should keep human confirmation in the rule");

const guaranteeDraftSave = buildAiExperienceDraftsFromCorrectionEvents({
  events: [
    {
      ...baseEvent,
      id: "draft_correction_1",
      caseId: "case_10",
      trigger: "guarantee_draft_save",
      fieldKey: "company_option.friends_plan_type",
      fieldLabel: "保証プラン",
      aiValue: "旧プラン",
      confirmedValue: "住居用標準プラン",
      changeType: "user_or_team_preference",
      templateId: "friends_guarantee_individual_v1",
      scopeCandidate: "output_template",
    },
    {
      ...baseEvent,
      id: "draft_correction_2",
      caseId: "case_11",
      trigger: "guarantee_draft_save",
      fieldKey: "company_option.friends_plan_type",
      fieldLabel: "保証プラン",
      aiValue: "旧プラン",
      confirmedValue: "住居用標準プラン",
      changeType: "user_or_team_preference",
      templateId: "friends_guarantee_individual_v1",
      scopeCandidate: "output_template",
    },
  ],
});
assert(guaranteeDraftSave.length === 1, "repeated guarantee draft saves should create a scoped experience draft");
assert(
  guaranteeDraftSave[0].evidenceSummaryJson.triggerTypes.includes("guarantee_draft_save"),
  "experience draft should preserve guarantee draft save trigger evidence",
);

console.log("[PASS] AI experience draft regression");
