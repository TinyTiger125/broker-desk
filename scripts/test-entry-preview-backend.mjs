import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
};
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const originalLoad = Module._load;
let readerCalls = 0;
const session = { tenant: { id: "tenant_test" }, user: { id: "user_test" } };
Module._load = function(request, parent, ...rest) {
  if (request === "@/lib/tenant-session") return { requireTenantSession: async (input) => { assert.equal(input.permission, "source.upload"); return session; } };
  if (request === "@/lib/locale") return { getLocale: async () => "zh" };
  if (request === "@/lib/data") return { addAuditLog: () => { throw new Error("preview must not persist"); } };
  if (request === "@/lib/identity-import-queue") return { MAX_IDENTITY_DOCUMENT_FILES: 6, getIdentityDocumentUploadLimitBytes: () => 10 * 1024 * 1024 };
  if (request === "@/lib/excel-import-queue") return { getExcelUploadLimitBytes: () => 10 * 1024 * 1024 };
  if (request === "@/lib/object-import-processor-adapter") return { normalizeObjectReaderCandidateValue: (_, value, uncertainty) => ({ value, uncertainty }) };
  if (request === "@/lib/openai-identity-reader") return { readIdentityDocumentWithOpenAi: async ({ filename, scope }) => {
    readerCalls += 1;
    assert.equal(scope, "customer");
    if (filename === "fail.pdf") throw new Error("synthetic_provider_failure");
    const shared = { value: "Synthetic Person", pageNumber: 1, sourceText: "Name: Synthetic Person", uncertainty: "clear", subjectKey: "holder", subjectLabel: "document holder" };
    return { candidates: [{ ...shared, fieldKey: "applicant.name" }, { ...shared, fieldKey: "applicant.residenceCardNumber", value: "DO_NOT_MAP" }] };
  } };
  if (request === "@/lib/openai-object-reader") return { readObjectDocumentWithOpenAi: async () => {
    readerCalls += 1;
    const shared = { value: "Example", pageNumber: 2, sourceText: "Property: Example", uncertainty: "clear", subjectKey: "one", subjectLabel: "property" };
    return { candidates: [{ ...shared, fieldKey: "property.name" }, { ...shared, fieldKey: "lease.rent", value: "50000" }] };
  } };
  return originalLoad.call(this, request, parent, ...rest);
};
const { previewEntryDocumentsAction } = require(resolve(root, "src/app/entry-preview-actions.ts"));
const { verifyEntryPreviewProofs } = require(resolve(root, "src/lib/entry-preview-proof.ts"));
function request(kind, names = ["source.pdf"]) {
  const fd = new FormData(); fd.set("previewKind", kind);
  for (const name of names) fd.append("uploadFile", new File(["%PDF-synthetic"], name, { type: "application/pdf" }));
  return fd;
}
const person = request("customer");
const customerResult = await previewEntryDocumentsAction(person);
assert.equal(customerResult.status, "ready");
assert.deepEqual(customerResult.candidates.map((field) => field.key), ["name"], "customer preview must exclude document-only fields");
assert.equal(customerResult.candidates[0].pageNumber, 1);
assert.equal(customerResult.candidates[0].sourceText, "Name: Synthetic Person");
person.set("entryReadProofs", JSON.stringify(customerResult.readProofs));
person.set("entryReadFileKeys", JSON.stringify(customerResult.readFileKeys));
assert.equal((await verifyEntryPreviewProofs({ formData: person, files: person.getAll("uploadFile"), session, kind: "customer", context: "entry" })).size, 1);
const propertyResult = await previewEntryDocumentsAction(request("property"));
assert.deepEqual(propertyResult.candidates.map((field) => field.key), ["name"], "standalone property preview must not leak lease fields into profile");
const partial = await previewEntryDocumentsAction(request("customer", ["good.pdf", "fail.pdf"]));
assert.equal(partial.status, "error");
assert.equal(partial.candidates.length, 1);
assert.deepEqual(partial.readFileKeys, ["good.pdf:14"]);
const beforeDuplicate = readerCalls;
const duplicate = await previewEntryDocumentsAction(request("customer", ["same.pdf", "same.pdf"]));
assert.equal(duplicate.status, "error");
assert.match(duplicate.message, /同名/);
assert.equal(readerCalls, beforeDuplicate, "duplicate identities must fail before any paid reader call");
console.log("preview backend: no-target read, field allowlist, attribution, source evidence, signed content proof, partial provider failure, duplicate-file guard: PASS");
