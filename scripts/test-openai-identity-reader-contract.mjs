#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();

function loadTypescript(filePath, dependencies = {}) {
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

const contract = loadTypescript(path.join(root, "src/lib/identity-reader-contract.ts"));
const readerSource = fs.readFileSync(path.join(root, "src/lib/openai-identity-reader.ts"), "utf8");
const extractorSource = fs.readFileSync(path.join(root, "src/lib/identity-document-extractor.ts"), "utf8");
const readinessSource = fs.readFileSync(path.join(root, "src/lib/production-readiness.ts"), "utf8");
const { buildOpenAiIdentityReaderInput } = loadTypescript(path.join(root, "src/lib/openai-identity-reader.ts"), {
  "@/lib/ai/responses-client": {},
  "@/lib/identity-reader-contract": contract,
});

const pdfInput = buildOpenAiIdentityReaderInput(Buffer.from("pdf"), "identity.pdf");
assert.equal(pdfInput[0].content[1].type, "input_file");
assert.match(pdfInput[0].content[1].file_data, /^data:application\/pdf;base64,/);
assert.match(pdfInput[0].content[0].text, /Do not guess/);

const imageInput = buildOpenAiIdentityReaderInput(Buffer.from("png"), "identity.png");
assert.equal(imageInput[0].content[1].type, "input_image");
assert.match(imageInput[0].content[1].image_url, /^data:image\/png;base64,/);

const parsed = contract.parseOpenAiIdentityReaderResponse({
  documentType: "identity_residence_card",
  pages: [{ pageNumber: 1, lines: ["氏名 Synthetic"] }],
  candidates: [{
    fieldKey: "applicant.name",
    value: "Synthetic",
    pageNumber: 1,
    sourceText: "氏名 Synthetic",
    uncertainty: "unclear",
    subjectKey: "person_1",
    subjectLabel: "申請人",
  }],
});
assert.equal(parsed.candidates[0].uncertainty, "unclear");
assert.throws(() => contract.parseOpenAiIdentityReaderResponse({
  documentType: "identity_residence_card",
  pages: [{ pageNumber: 1, lines: ["氏名 Synthetic"] }],
  candidates: [{ fieldKey: "applicant.name", value: "guess", pageNumber: 1, sourceText: "", uncertainty: "clear", subjectKey: "person_1", subjectLabel: "申請人" }],
}), /remote_document_reader_invalid_response/);
assert.equal(contract.parseOpenAiIdentityReaderResponse({
  documentType: "identity_residence_card",
  pages: [{ pageNumber: 1, lines: ["氏名 Synthetic"] }],
  candidates: [{ fieldKey: "applicant.nationality", value: "", pageNumber: 1, sourceText: "", uncertainty: "not_found", subjectKey: "person_1", subjectLabel: "申請人" }],
}).candidates[0].uncertainty, "not_found");

assert(readerSource.includes("identity_document_extraction_assist"), "adapter must use the existing AI task route");
assert(readerSource.includes("input_file"), "PDFs must be sent as Responses API input_file");
assert(readerSource.includes("input_image"), "images must be sent as Responses API input_image");
assert(readerSource.includes('"applicant.name"'), "the model schema must use canonical applicant field keys");
assert(readerSource.includes("not_found, an empty sourceText is allowed"), "not_found candidates must allow empty evidence text");
assert(readerSource.includes("subjectKey"), "the model schema must carry a stable person-group key");
assert(readerSource.includes("subjectLabel"), "the model schema must carry a visible person role label");
assert(readerSource.includes("jsonSchema"), "adapter must require structured output");
assert(extractorSource.includes("method: \"ai\""), "AI candidates must retain their extraction method");
assert(extractorSource.includes("uncertainty=${decision.effectiveUncertainty}"), "candidate provenance must retain resolved uncertainty");
assert(extractorSource.includes("resolveIdentityReaderCandidate"), "AI candidates must pass through the deterministic conflict resolver");
assert(extractorSource.includes("effectiveUncertainty"), "AI candidate evidence must retain the resolved uncertainty state");
assert(extractorSource.includes("decision.effectiveUncertainty !== \"clear\""), "unclear/conflicting candidates must lower review confidence");
assert(extractorSource.includes('configuredProvider === "openai_responses"'), "configured reader failures must not be swallowed as empty local OCR");
assert(extractorSource.includes('if (isProductionRuntime()) throw new ProductionReadinessError("production_document_reader_required")'), "OpenAI adapter must remain production fail-closed");
assert(readinessSource.includes('process.env.DOCUMENT_READING_PROVIDER !== "remote"'), "existing production remote reader gate must remain intact");
console.log("PASS: OpenAI identity reader input modality, structured evidence, uncertainty provenance and production fail-closed contract");
