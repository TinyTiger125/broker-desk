import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import typescript from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const Module = require("module");
const originalResolve = Module._resolveFilename;
const candidatePath = (value) => [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((item) => existsSync(item) && statSync(item).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return candidatePath(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (mod, filename) => mod._compile(typescript.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);

const { collectClientIdentityDraftSuggestions } = require(resolve(root, "src/lib/customer-identity-draft.ts"));
const { fillEmptyEntryDraftSuggestions } = require(resolve(root, "src/lib/entry-preview.ts"));

const field = (fieldKey, candidateValue, overrides = {}) => ({
  id: `field-${fieldKey}-${candidateValue}`,
  tenantId: "tenant-test",
  targetId: "target-test",
  fieldKey,
  candidateValue,
  confidence: 0.74,
  provenance: { uncertainty: "unclear", sourceAttachmentId: "attachment-test", sourceFileHash: "hash-test", ...overrides.provenance },
  finalSource: "model_draft",
  status: "low_confidence",
  ...overrides,
});
const view = (fields, status = "needs_review") => ({ target: { status }, fields });

const suggestions = collectClientIdentityDraftSuggestions([
  view([
    field("name", "Candidate Name"),
    field("birthDate", "平成2年1月2日", { provenance: { alternatives: [{ value: "1990-01-02" }] } }),
    field("gender", "男性"),
    field("currentAddress", "Draft Address"),
    field("phone", "not a phone"),
    field("nationality", "unsupported"),
    field("birthDate", "not-a-date"),
    field("email", "invalid-email"),
    field("currentPostalCode", "123"),
    field("currentAddress", "Ambiguous Address", { provenance: { uncertainty: "unclear", alternatives: [{ value: "Other Address" }] } }),
    field("gender", "female", { finalSource: "human" }),
  ]),
  view([field("currentAddress", "Another Address")]),
  view([field("name", "Candidate Name")]),
  view([field("name", "Ignored completed target")], "completed"),
]);
assert.deepEqual(suggestions, [
  { key: "name", value: "Candidate Name" },
  { key: "birthDate", value: "1990-01-02" },
  { key: "gender", value: "male" },
], "only unique, valid, low-confidence existing fields become drafts");

const seeded = fillEmptyEntryDraftSuggestions(
  { name: "", birthDate: "saved-date", gender: "", phone: "" },
  suggestions,
);
assert.deepEqual(seeded, { name: "Candidate Name", birthDate: "saved-date", gender: "male", phone: "" }, "blank fields receive drafts while saved values remain unchanged");
const clearedByUser = fillEmptyEntryDraftSuggestions({ name: "", birthDate: "", gender: "" }, []);
assert.deepEqual(clearedByUser, { name: "", birthDate: "", gender: "" }, "no candidates means no synthetic form edits");

const clientForm = readFileSync(resolve(root, "src/components/client-form.tsx"), "utf8");
for (const copy of [
  "読み取り候補を空欄の顧客項目に入力しています",
  "读取候选已填入空白客户字段",
  "읽기 후보를 비어 있는 고객 필드에 입력했습니다",
]) assert.match(clientForm, new RegExp(copy));
assert.match(clientForm, /data-client-draft-suggestions/);
assert.match(clientForm, /低信頼度または不一致の候補は自動保存されません/);

console.log("client low-confidence draft suggestions: PASS");
