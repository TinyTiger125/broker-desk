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
const resolveCandidate = (value) => {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
};
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};

const hookState = [];
let hookCursor = 0;
const fakeReact = {
  useRef(initial) {
    const index = hookCursor++;
    if (!(index in hookState)) hookState[index] = { current: initial };
    return hookState[index];
  },
  useState(initial) {
    const index = hookCursor++;
    if (!(index in hookState)) hookState[index] = initial;
    return [hookState[index], (next) => {
      hookState[index] = typeof next === "function" ? next(hookState[index]) : next;
    }];
  },
  useEffect(effect, dependencies) {
    const index = hookCursor++;
    const previous = hookState[index];
    const changed = !previous || dependencies.length !== previous.length || dependencies.some((value, offset) => !Object.is(value, previous[offset]));
    hookState[index] = dependencies;
    if (changed) effect();
  },
  useCallback(callback) {
    hookCursor += 1;
    return callback;
  },
};

Module._load = function(request, parent, ...rest) {
  if (request === "react" && parent?.filename.endsWith("/src/components/use-entry-draft.ts")) return fakeReact;
  return originalLoad(request, parent, ...rest);
};

const transpile = (module, filename, jsx = false) => {
  const result = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: jsx ? ts.JsxEmit.ReactJSX : undefined, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
require.extensions[".ts"] = (module, filename) => transpile(module, filename);
require.extensions[".tsx"] = (module, filename) => transpile(module, filename, true);

// The hook only needs sessionStorage and the React hook primitives for this behavior test.
const storage = new Map();
global.window = { sessionStorage: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
} };
const { useEntryDraft } = require(resolve(root, "src/components/use-entry-draft.ts"));

function renderHookInstance(input) {
  // This is a tiny deterministic hook harness, not a production component.
  hookCursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useEntryDraft(input);
}

function settle(input) {
  renderHookInstance(input);
  return renderHookInstance(input);
}

const draftKey = "entry-ui-behavior";
storage.set(draftKey, JSON.stringify({
  version: 1,
  baseline: { name: "Old server", phone: "000" },
  current: { name: "Stale draft", phone: "000" },
  dirty: ["name"],
}));

let result = settle({
  storageKey: draftKey,
  serverValues: { name: "Confirmed name", phone: "000" },
  appliedFields: ["name"],
});
assert.equal(result.values.name, "Confirmed name", "confirmed server value must replace a stale draft");
assert.equal(storage.has(draftKey), false, "stale draft must be consumed after confirmation");

result.setField("name", "Manual edit");
result = settle({
  storageKey: draftKey,
  serverValues: { name: "Confirmed name", phone: "000" },
  appliedFields: ["name"],
});
assert.equal(result.values.name, "Manual edit");
assert.equal(JSON.parse(storage.get(draftKey)).current.name, "Manual edit");

// A reload with the same applied marker must preserve a later manual edit.
hookState.length = 0;
result = settle({
  storageKey: draftKey,
  serverValues: { name: "Confirmed name", phone: "000" },
  appliedFields: ["name"],
});
assert.equal(result.values.name, "Manual edit", "repeated confirmation marker must not overwrite a later manual edit");

// A changed server value is a new confirmation and should supersede the old draft.
hookState.length = 0;
result = settle({
  storageKey: draftKey,
  serverValues: { name: "New confirmation", phone: "000" },
  appliedFields: ["name"],
});
assert.equal(result.values.name, "New confirmation");
assert.equal(storage.has(draftKey), false);

// Once the server contains the manually saved value, the ordinary save clears the draft.
result.setField("name", "Saved manually");
result = settle({
  storageKey: draftKey,
  serverValues: { name: "Saved manually", phone: "000" },
  appliedFields: [],
});
assert.equal(result.values.name, "Saved manually");
assert.equal(storage.has(draftKey), false, "ordinary save must clear an equal draft");

const { replaceEntryFiles } = require(resolve(root, "src/components/entry-file-picker.tsx"));
const first = new File(["first"], "first.pdf", { type: "application/pdf" });
const retry = new File(["retry"], "retry.pdf", { type: "application/pdf" });
const retryAgain = new File(["retry-again"], "retry-again.png", { type: "image/png" });
const formData = new FormData();
formData.append("uploadFile", first);
replaceEntryFiles(formData, [retry, retryAgain]);
assert.deepEqual(formData.getAll("uploadFile").map((file) => file.name), ["retry.pdf", "retry-again.png"]);
formData.delete("uploadFile");
replaceEntryFiles(formData, [retry, retryAgain]);
assert.deepEqual(formData.getAll("uploadFile").map((file) => file.name), ["retry.pdf", "retry-again.png"], "retry must rebuild uploadFile from retained File[] after native reset");

console.log("Unified entry UI behavior passed: draft refresh/confirmation retention and upload retry File[] replacement.");
