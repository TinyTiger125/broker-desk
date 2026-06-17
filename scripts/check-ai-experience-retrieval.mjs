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
  mod.require = (request) => {
    if (request === "@/lib/data") return {};
    return Module.createRequire(sourcePath)(request);
  };
  mod._compile(js, sourcePath);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const {
  buildApprovedAiExperienceContextMarkdown,
  selectRelevantApprovedAiExperienceDrafts,
} = loadTsModule(path.resolve("src/lib/ai-experience-retrieval.ts"));

const baseDraft = {
  id: "experience_1",
  userId: "user_1",
  status: "approved",
  title: "携帯電話 位置 / PDF位置修正",
  bodyMarkdown: "## Finding\n電話欄の位置修正が複数回発生。",
  eventIds: ["correction_1", "correction_2"],
  fieldKey: "layout.applicant.phone",
  templateId: "zenhoren_individual_v1",
  changeType: "template_output_position_error",
  scopeCandidate: "output_template",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-03T00:00:00.000Z"),
};

const selected = selectRelevantApprovedAiExperienceDrafts(
  [
    baseDraft,
    { ...baseDraft, id: "experience_draft", status: "draft", updatedAt: new Date("2026-06-04T00:00:00.000Z") },
    { ...baseDraft, id: "experience_rejected", status: "rejected" },
    { ...baseDraft, id: "experience_other_template", templateId: "friends_guarantee_individual_v1" },
    { ...baseDraft, id: "experience_global", templateId: undefined, fieldKey: "applicant.phone", updatedAt: new Date("2026-06-02T00:00:00.000Z") },
  ],
  {
    templateId: "zenhoren_individual_v1",
    fieldKeys: ["applicant.phone"],
    limit: 5,
  },
);

assert(selected.length === 2, "retrieval should keep only approved matching/global scoped drafts");
assert(selected[0].id === "experience_1", "retrieval should sort by updatedAt desc");
assert(selected.every((draft) => draft.status === "approved"), "retrieval must never include draft/rejected experience");
assert(selected.every((draft) => draft.templateId !== "friends_guarantee_individual_v1"), "retrieval must exclude wrong template");

const markdown = buildApprovedAiExperienceContextMarkdown(selected);
assert(markdown.includes("Approved Broker Desk Experience"), "context should include a clear approved-experience header");
assert(markdown.includes("not confirmed facts"), "context should prevent treating hints as current facts");
assert(markdown.includes("layout.applicant.phone"), "context should preserve scoped field evidence");

console.log("[PASS] AI experience retrieval regression");
