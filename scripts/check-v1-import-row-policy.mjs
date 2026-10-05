#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (filePath) => fs.readFileSync(filePath, "utf8");
const load = (filePath) => {
  const compiled = ts.transpileModule(read(filePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    Date,
  });
  return module.exports;
};

const { buildPropertyImportKey, buildPropertyImportRowFingerprint, normalizeImportCellValue } = load("src/lib/import-row-policy.ts");

assert.equal(normalizeImportCellValue(null), "", "null Excel cells must remain empty");
assert.equal(normalizeImportCellValue(undefined), "", "missing Excel cells must remain empty");
assert.equal(normalizeImportCellValue("  住所\n 1-2-3 "), "住所 1-2-3", "whitespace must be deterministic");
assert.equal(normalizeImportCellValue(new Date("2026-09-30T00:00:00.000Z")), "2026-09-30", "Excel dates must be stable ISO dates");
assert.equal(
  buildPropertyImportKey("  Test  ", " Tokyo 1-2-3 "),
  buildPropertyImportKey("test", "Tokyo 1-2-3"),
  "property duplicate keys must normalize case and whitespace",
);
assert.equal(buildPropertyImportKey("", "Tokyo"), undefined, "rows without a property name cannot be duplicate keys");
assert.equal(
  buildPropertyImportRowFingerprint({ name: "Test", address: "Tokyo", price: 100 }),
  buildPropertyImportRowFingerprint({ price: "100", address: " Tokyo ", name: " Test " }),
  "exact row fingerprints must normalize all source values and key order",
);

const processor = read("src/lib/excel-import-processor.ts");
assert(processor.includes("worksheetToRows(firstSheet)"), "generic Excel rows must use the stable worksheet value conversion");
assert(processor.includes("normalizeImportCellValue"), "generic Excel rows must normalize blanks and whitespace");

const actions = read("src/app/actions.ts");
assert(actions.includes("listPropertiesForContext"), "property import must inspect only visible existing properties");
assert(actions.includes('code: "import_row_exact_duplicate"'), "exact duplicate rows must be reported separately");
assert(actions.includes('code: "import_row_suspected_duplicate"'), "same name/address rows must remain visible as suspected duplicates");
assert(actions.includes("疑似重複として確認してください"), "suspected duplicates must not be silently discarded");

const mapping = read("src/lib/import-mapping.ts");
const page = read("src/app/import-center/page.tsx");
assert(mapping.includes('"import_row_exact_duplicate"'), "exact duplicate issue must be part of the validation contract");
assert(mapping.includes('"import_row_suspected_duplicate"'), "suspected duplicate issue must be part of the validation contract");
assert(page.includes("疑似重复行待确认"), "suspected duplicate issue must be visible in the import result title");

console.log("[PASS] V1 Excel values are normalized and duplicate imports remain explicit, visible, and non-destructive");
