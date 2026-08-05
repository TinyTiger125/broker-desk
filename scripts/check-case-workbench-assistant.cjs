const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = process.cwd();
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, join(root, "src", request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const { getCaseWorkbenchAssistantDecision } = require("../src/lib/case-workbench-assistant.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function field(id, state, required = true) {
  return { id, state, required };
}

const conflictFirst = getCaseWorkbenchAssistantDecision([
  field("candidate", "ai_suggested"),
  field("conflict", "conflict"),
  field("missing", "missing"),
]);
assert(conflictFirst.mode === "conflict", `Expected conflict mode, got ${conflictFirst.mode}`);
assert(conflictFirst.nextField.id === "conflict", "Conflict field must be the first action");
assert(conflictFirst.conflictCount === 1, `Expected 1 conflict, got ${conflictFirst.conflictCount}`);

const candidateBeforeMissing = getCaseWorkbenchAssistantDecision([
  field("candidate", "needs_review"),
  field("missing", "missing"),
]);
assert(candidateBeforeMissing.mode === "candidate", `Expected candidate mode, got ${candidateBeforeMissing.mode}`);
assert(candidateBeforeMissing.nextField.id === "candidate", "Readable candidate should be confirmed before manual filling");

const requiredBeforeOptional = getCaseWorkbenchAssistantDecision([
  field("optional-missing", "missing", false),
  field("required-missing", "missing"),
]);
assert(requiredBeforeOptional.mode === "missing", `Expected missing mode, got ${requiredBeforeOptional.mode}`);
assert(requiredBeforeOptional.nextField.id === "required-missing", "Required missing fields must be prioritized before optional missing fields");

const ready = getCaseWorkbenchAssistantDecision([]);
assert(ready.mode === "ready", `Expected ready mode, got ${ready.mode}`);
assert(ready.nextField === undefined, "Ready state should not point to a field");
