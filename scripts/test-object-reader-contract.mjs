#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
function load(filePath, dependencies = {}) {
  const moduleInstance = new Module(filePath, null);
  moduleInstance.filename = filePath;
  moduleInstance.paths = Module._nodeModulePaths(root);
  const javascript = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath,
  }).outputText;
  const originalRequire = moduleInstance.require.bind(moduleInstance);
  moduleInstance.require = (name) => dependencies[name] ?? originalRequire(name);
  moduleInstance._compile(javascript, filePath);
  return moduleInstance.exports;
}

const contract = load(path.join(root, "src/lib/object-reader-contract.ts"));
const attribution = load(path.join(root, "src/lib/object-reader-attribution.ts"), {
  "@/lib/object-reader-contract": contract,
});
const mapping = load(path.join(root, "src/lib/object-reader-mapping.ts"), {
  "@/lib/object-reader-attribution": attribution,
});
const readerSource = fs.readFileSync(path.join(root, "src/lib/openai-object-reader.ts"), "utf8");
const routingSource = fs.readFileSync(path.join(root, "src/lib/ai/model-routing.ts"), "utf8");

const candidate = (subjectKey, subjectLabel, fieldKey, value, uncertainty = "clear") => ({
  fieldKey, value, pageNumber: 1, sourceText: value, uncertainty, subjectKey, subjectLabel,
});

const parsed = contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成レジデンス", "120000"] }],
  candidates: [candidate("object_1", "物件", "property.name", "合成レジデンス"), candidate("object_1", "物件", "lease.rent", "120000")],
});
assert.equal(parsed.candidates.length, 2);
assert.throws(() => contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成物件"] }],
  candidates: [{ fieldKey: "property.name", value: "推測", pageNumber: 1, sourceText: "", uncertainty: "clear", subjectKey: "object_1", subjectLabel: "物件" }],
}), (error) => error?.code === "invalid_object_reader_response");
assert.equal(contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成物件"] }],
  candidates: [{ fieldKey: "lease.deposit", value: "", pageNumber: 1, sourceText: "", uncertainty: "not_found", subjectKey: "object_1", subjectLabel: "物件" }],
}).candidates[0].uncertainty, "not_found");
assert.throws(() => contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成物件"] }],
  candidates: [{ fieldKey: "property.name", value: "物件", pageNumber: 999, sourceText: "合成物件", uncertainty: "clear", subjectKey: "object_1", subjectLabel: "物件" }],
}), (error) => error?.code === "invalid_object_reader_response");
assert.throws(() => contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成物件"] }],
  candidates: [{ fieldKey: "property.name", value: "物件", pageNumber: 1, sourceText: "別の引用", uncertainty: "clear", subjectKey: "object_1", subjectLabel: "物件" }],
}), (error) => error?.code === "invalid_object_reader_response");
assert.throws(() => contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成物件"] }],
  candidates: [{ fieldKey: "property.name", value: "物件", pageNumber: 1, sourceText: "合成物件", uncertainty: "clear", subjectKey: "x".repeat(101), subjectLabel: "物件" }],
}), (error) => error?.code === "invalid_object_reader_response");

const oneObject = mapping.mapObjectReaderCandidates({
  candidates: [
    candidate("object_1", "物件", "property.name", "合成レジデンス"),
    candidate("object_1", "物件", "lease.rent", "120000"),
  ],
  existingFields: [{ fieldKey: "property.name", value: "人类已保存物件", normalizedValue: "人类已保存物件" }],
});
assert.equal(oneObject.status, "mapped");
assert.deepEqual(oneObject.preservedFieldKeys, ["property.name"]);
assert.equal(oneObject.decisions.find((item) => item.fieldKey === "property.name")?.action, "preserve_existing");
assert.equal(oneObject.decisions.find((item) => item.fieldKey === "lease.rent")?.action, "suggest");

const multipleObjects = mapping.mapObjectReaderCandidates({
  candidates: [
    candidate("object_1", "物件1", "property.name", "物件A"),
    candidate("object_2", "部屋B", "property.name", "物件B"),
    candidate("object_1", "物件1", "lease.rent", "100000"),
  ],
  existingFields: [{ fieldKey: "property.name", value: "既存主物件", normalizedValue: "既存主物件" }],
});
assert.equal(multipleObjects.status, "ambiguous_objects");
assert.deepEqual(multipleObjects.decisions, [], "model_attribution_blocked must stop all automatic object suggestions");
assert.deepEqual(multipleObjects.preservedFieldKeys, [], "blocked attribution must not auto-confirm or merge existing object groups");

const leaseOnly = mapping.mapObjectReaderCandidates({ candidates: [candidate("lease_1", "契約条件", "lease.rent", "90000")] });
assert.equal(leaseOnly.status, "no_object", "lease-only candidates cannot be assigned to a shared property without object attribution");
const leaseLabeledAsObject = mapping.mapObjectReaderCandidates({ candidates: [candidate("object_1", "物件", "lease.rent", "90000")] });
assert.equal(leaseLabeledAsObject.status, "no_object", "lease-only candidates still need a property identity field");

assert(readerSource.includes("property_lease_document_extraction_assist"), "object adapter must use a dedicated task route");
assert(readerSource.includes("property.name") && readerSource.includes("lease.rent"), "object adapter must expose canonical property and lease keys");
assert(readerSource.includes("property.furigana"), "object prompt must explicitly reject invented/unneeded furigana field");
assert(readerSource.includes("input_file") && readerSource.includes("input_image"), "object adapter must support PDF and image inputs");
assert(routingSource.includes("property_lease_document_extraction_assist"), "AI routing must define the object reader task");
console.log("PASS: object reader schema, property/lease separation, attribution blocking and existing-value retention");
