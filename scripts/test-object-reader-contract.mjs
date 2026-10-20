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
const reader = load(path.join(root, "src/lib/openai-object-reader.ts"), {
  "@/lib/ai/responses-client": {
    AiResponseError: class AiResponseError extends Error {},
    AiRuntimeUnavailableError: class AiRuntimeUnavailableError extends Error {},
    createAiResponse: async () => { throw new Error("test stub"); },
  },
  "@/lib/object-reader-contract": contract,
});

const candidate = (subjectKey, subjectLabel, fieldKey, value, uncertainty = "clear") => ({
  fieldKey, value, pageNumber: 1, sourceText: value, uncertainty, subjectKey, subjectLabel,
});

const parsed = contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成レジデンス", "120000"] }],
  candidates: [candidate("object_1", "物件", "property.name", "合成レジデンス"), candidate("object_1", "物件", "lease.rent", "120000")],
});
assert.equal(parsed.candidates.length, 2);
assert.equal(contract.inferPropertyDocumentType("謄本(1).PDF"), "registry");
assert.equal(contract.inferPropertyDocumentType("重要事項説明書(1).pdf"), "important_matters");
assert.equal(contract.inferPropertyDocumentType("売買契約書(1).pdf"), "sale_contract");
assert.equal(contract.inferPropertyDocumentType("売主様告知書(1).pdf"), "seller_disclosure");
assert.equal(contract.parseObjectReaderResponse({
  documentType: "registry",
  pages: [{ pageNumber: 1, lines: ["面積 15.34㎡"] }],
  candidates: [candidate("object_1", "物件", "property.sizeSqm", "15.34")],
}).candidates[0].fieldKey, "property.sizeSqm");
assert.equal(contract.parseObjectReaderResponse({
  documentType: "registry",
  pages: [{ pageNumber: 1, lines: ["物件名 合成物件"] }],
  candidates: [candidate("object_1", "物件", "property.name", "合成物件")],
  processingMetadata: { provider: "local-test", model: "fixture", usage: { input_tokens: 1 } },
}).processingMetadata.provider, "local-test");
assert.throws(() => contract.parseObjectReaderResponse({
  documentType: "registry",
  pages: [{ pageNumber: 1, lines: ["物件名 合成物件"] }],
  candidates: [candidate("object_1", "物件", "property.name", "合成物件")],
  processingMetadata: { provider: "" },
}), (error) => error?.code === "invalid_object_reader_response");
const twentyTwoPages = Array.from({ length: 22 }, (_, index) => ({ pageNumber: index + 1, lines: [`page ${index + 1}`] }));
assert.equal(contract.parseObjectReaderResponse({ documentType: "important_matters", pages: twentyTwoPages, candidates: [] }).pages.length, 22, "22-page important-matters source must not be truncated");
const sparseModelResponse = {
  documentType: "important_matters",
  pages: [{ pageNumber: 3, lines: ["面積 19.45㎡"] }],
  candidates: [
    { ...candidate("object_1", "物件", "property.sizeSqm", "19.45", "conflict"), pageNumber: 3, sourceText: "面積 19.45㎡" },
    { fieldKey: "property.notes", value: "", pageNumber: 999, sourceText: "", uncertainty: "not_found", subjectKey: "object_1", subjectLabel: "物件" },
  ],
};
const completedSparse = contract.normalizeObjectReaderPageIndex(sparseModelResponse, 22);
assert.equal(completedSparse.pages.length, 22, "sparse model page index must be completed to original PDF page count");
assert.equal(completedSparse.candidates[1].pageNumber, 0, "missing candidates must carry no fake source page");
assert.equal(contract.parseObjectReaderResponse(completedSparse).candidates[1].pageNumber, 0);
assert.throws(() => contract.parseObjectReaderResponse({
  documentType: "registry",
  pages: [{ pageNumber: 1, lines: ["構造 鉄筋" ] }],
  candidates: [candidate("object_1", "物件", "property.registryStructure", "鉄筋")],
}), (error) => error?.code === "invalid_object_reader_response");
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
assert.equal(contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成物件"] }],
  candidates: [{ fieldKey: "lease.deposit", value: "", pageNumber: 0, sourceText: "", uncertainty: "not_found", subjectKey: "object_1", subjectLabel: "物件" }],
}).candidates[0].pageNumber, 0);
assert.throws(() => contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成物件"] }],
  candidates: [{ fieldKey: "lease.deposit", value: "", pageNumber: 1, sourceText: "合成物件", uncertainty: "not_found", subjectKey: "object_1", subjectLabel: "物件" }],
}), (error) => error?.code === "invalid_object_reader_response");
assert.throws(() => contract.parseObjectReaderResponse({
  documentType: "property_lease_document",
  pages: [{ pageNumber: 1, lines: ["合成物件"] }],
  candidates: [{ fieldKey: "lease.deposit", value: "", pageNumber: 1, sourceText: "", uncertainty: "clear", subjectKey: "object_1", subjectLabel: "物件" }],
}), (error) => error?.code === "invalid_object_reader_response");
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
assert(readerSource.includes("property.furigana"), "object prompt must include the existing furigana field");
assert(readerSource.includes("property.sizeSqm"), "object adapter must expose the existing area field");
assert(readerSource.includes("Do not create registry"), "object adapter must reject document-derived business fields");
assert(readerSource.includes("unique unit together with the building or land"), "object prompt must keep a unique unit and its containing context on one subject");
assert(readerSource.includes("whole-building total area or a parcel area"), "object prompt must not map building or parcel totals to unit size");
assert(readerSource.includes("independent units or objects"), "object prompt must block attribution for genuinely independent units");
assert(readerSource.includes("input_file") && readerSource.includes("input_image"), "object adapter must support PDF and image inputs");
const schema = reader.OBJECT_READER_SCHEMA;
const candidateSchema = schema.properties.candidates.items;
assert.deepEqual(candidateSchema.required, ["fieldKey", "value", "pageNumber", "sourceText", "uncertainty", "subjectKey", "subjectLabel", "sourceLocation"], "strict response schema must require every candidate property");
assert.deepEqual(candidateSchema.properties.sourceLocation.required, ["lineIndex", "x", "y", "width", "height"], "strict response schema must require every source-location property");
assert.deepEqual(candidateSchema.properties.sourceLocation.type, ["object", "null"], "optional source location must be represented as nullable");
assert(routingSource.includes("property_lease_document_extraction_assist"), "AI routing must define the object reader task");
console.log("PASS: object reader schema, property/lease separation, attribution blocking and existing-value retention");
