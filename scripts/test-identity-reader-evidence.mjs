#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const filePath = path.join(root, "src/lib/identity-reader-evidence.ts");
const moduleInstance = new Module(filePath, null);
moduleInstance.filename = filePath;
moduleInstance.paths = Module._nodeModulePaths(root);
const javascript = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filePath,
}).outputText;
moduleInstance._compile(javascript, filePath);
const { resolveIdentityReaderCandidate } = moduleInstance.exports;

assert.deepEqual(
  resolveIdentityReaderCandidate({ existingValue: "山田 太郎", candidateValue: "山田太郎", uncertainty: "clear" }),
  { effectiveUncertainty: "clear", valuesDiffer: false, reviewScore: 0.74 },
  "whitespace-only variation must preserve a clear deterministic value",
);
assert.deepEqual(
  resolveIdentityReaderCandidate({ existingValue: "山田", candidateValue: "佐藤", uncertainty: "clear" }),
  { effectiveUncertainty: "conflict", valuesDiffer: true, reviewScore: 0.24 },
  "a model value that conflicts with a deterministic value must remain review-required",
);
assert.equal(
  resolveIdentityReaderCandidate({ existingValue: "山田", candidateValue: "山田", uncertainty: "unclear" }).effectiveUncertainty,
  "unclear",
  "model uncertainty must not be upgraded merely because values agree",
);
assert.equal(
  resolveIdentityReaderCandidate({ existingValue: "山田", candidateValue: "", uncertainty: "not_found" }).effectiveUncertainty,
  "not_found",
  "missing model evidence must remain not_found",
);
console.log("PASS: deterministic identity values are preserved and model conflicts remain review-required");
