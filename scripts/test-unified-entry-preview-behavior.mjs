import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const Module = require("module");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const previewActionCalls = [];
const previewEntryDocumentsAction = async (formData) => {
  previewActionCalls.push(formData);
  if (formData.get("previewKind") === "property") return { status: "error", candidates: [], readFileKeys: [], message: "synthetic failure" };
  return {
    status: "ready",
    readFileKeys: formData.getAll("uploadFile").map((file) => `${file.name}:${file.size}`),
    readProofs: Object.fromEntries(formData.getAll("uploadFile").map((file) => [`${file.name}:${file.size}`, `proof:${file.name}`])),
    candidates: [{ id: "candidate-name", key: "name", label: "Name", value: "Document name", fileName: "identity.pdf", pageNumber: 1 }],
  };
};
const resolveCandidate = (value) => {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
};
Module._resolveFilename = function(request, parent, ...rest) {
  if (request === "@/app/entry-preview-actions") return "/virtual/entry-preview-actions.js";
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
Module._load = function(request, parent, ...rest) {
  if (request === "@/app/entry-preview-actions") {
    return { previewEntryDocumentsAction };
  }
  return originalLoad(request, parent, ...rest);
};
const transpile = (module, filename) => {
  const result = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
require.extensions[".tsx"] = transpile;
require.extensions[".ts"] = transpile;

const { applyEntryPreviewCandidate, buildEntryPreviewFormData, getUnreadEntryFiles, mergeEntryPreviewStates } = require(resolve(root, "src/components/entry-preview.tsx"));
const pdf = new File(["%PDF-1.7"], "identity.pdf", { type: "application/pdf" });
const image = new File(["image"], "portrait.png", { type: "image/png" });
const formData = buildEntryPreviewFormData([pdf, image], "customer");
assert.equal(formData.get("previewKind"), "customer");
assert.equal(formData.get("previewContext"), null);
assert.deepEqual(formData.getAll("uploadFile").map((file) => file.name), ["identity.pdf", "portrait.png"]);
assert.equal(previewActionCalls.length, 0, "building preview input must not submit the primary form or action");
formData.set("previewContext", "entry");
const readyPreview = await previewEntryDocumentsAction(formData);
assert.equal(readyPreview.status, "ready");
assert.equal(formData.get("previewContext"), "entry");
assert.deepEqual(readyPreview.readFileKeys, formData.getAll("uploadFile").map((file) => `${file.name}:${file.size}`));

const manualFirst = { name: "Manual name", phone: "000", notes: "Keep this" };
const confirmed = applyEntryPreviewCandidate(manualFirst, { key: "name", value: "Document name" });
assert.equal(confirmed.name, "Document name", "explicit confirmation applies only the selected candidate field");
assert.equal(confirmed.phone, "000");
assert.equal(confirmed.notes, "Keep this");
assert.deepEqual(applyEntryPreviewCandidate(manualFirst, { key: "unknownField", value: "must not enter" }), manualFirst, "unknown candidates must not add business fields");

const mergedPartial = mergeEntryPreviewStates(
  { status: "ready", candidates: [{ id: "old", key: "phone", sourceKey: "phone", label: "Phone", value: "000", fileName: "identity.pdf" }], readFileKeys: ["identity.pdf:8"], readProofs: { "identity.pdf:8": "proof:identity" } },
  { status: "error", candidates: [{ id: "new", key: "name", sourceKey: "name", label: "Name", value: "Document name", fileName: "portrait.png" }], readFileKeys: ["portrait.png:5"], readProofs: { "portrait.png:5": "proof:portrait" }, message: "one file failed" },
);
assert.equal(mergedPartial.status, "error");
assert.deepEqual(mergedPartial.readFileKeys, ["identity.pdf:8", "portrait.png:5"]);
assert.deepEqual(mergedPartial.readProofs, { "identity.pdf:8": "proof:identity", "portrait.png:5": "proof:portrait" }, "partial retry must preserve and merge read proofs");
assert.deepEqual(mergedPartial.candidates.map((candidate) => candidate.id), ["old", "new"], "partial failure must preserve prior candidates");
assert.deepEqual(getUnreadEntryFiles([pdf, image], ["identity.pdf:8"]), [image], "partial retry must send only unread files");

const failedPreview = await previewEntryDocumentsAction(buildEntryPreviewFormData([pdf], "property", "case"));
assert.equal(failedPreview.status, "error");
assert.deepEqual(failedPreview.readFileKeys, [], "failed preview must contribute no read keys to final save");
assert.equal(previewActionCalls.length, 2, "preview action is independently invoked with each preview request");
console.log("Unified entry preview behavior passed: independent input payload, manual-first preservation, explicit candidate confirmation, and failure state.");
