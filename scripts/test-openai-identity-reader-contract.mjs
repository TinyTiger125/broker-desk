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
const entryPreviewSource = fs.readFileSync(path.join(root, "src/app/entry-preview-actions.ts"), "utf8");
const queuedProcessorSource = fs.readFileSync(path.join(root, "src/lib/identity-import-processor.ts"), "utf8");
const readinessSource = fs.readFileSync(path.join(root, "src/lib/production-readiness.ts"), "utf8");
const { buildOpenAiIdentityReaderInput } = loadTypescript(path.join(root, "src/lib/openai-identity-reader.ts"), {
  "@/lib/ai/responses-client": {},
  "@/lib/identity-reader-contract": contract,
  "@/lib/customer-identity-field-catalog": {
    CUSTOMER_IDENTITY_FIELDS: {
      name: {}, nameLatin: {}, nameKanji: {}, nameKatakana: {}, furigana: {}, birthDate: {}, gender: {}, currentPostalCode: {}, currentAddress: {}, phone: {}, lineId: {}, email: {},
    },
  },
});

const pdfInput = buildOpenAiIdentityReaderInput(Buffer.from("pdf"), "identity.pdf");
assert.equal(pdfInput[0].content[1].type, "input_file");
assert.match(pdfInput[0].content[1].file_data, /^data:application\/pdf;base64,/);
assert.match(pdfInput[0].content[0].text, /Do not guess/);

const imageInput = buildOpenAiIdentityReaderInput(Buffer.from("png"), "identity.png");
assert.equal(imageInput[0].content[1].type, "input_image");
assert.match(imageInput[0].content[1].image_url, /^data:image\/png;base64,/);
assert.match(readerSource, /丁目/);
assert.match(readerSource, /番地/);
assert.match(readerSource, /never reconstruct an address by joining separate lines/);
assert.match(readerSource, /Current-address candidates are always review-only and must never be automatically saved/);
const directCustomerPrompt = buildOpenAiIdentityReaderInput(Buffer.from("pdf"), "identity.pdf", { scope: "customer", customerMode: "direct" })[0].content[0].text;
assert.match(directCustomerPrompt, /a clear page-evidenced printed holder name is sufficient to create a pending customer record/);
assert.match(directCustomerPrompt, /birth date and gender may be absent or unreadable/);
assert.doesNotMatch(directCustomerPrompt, /if the holder's name, birth date, and gender are not visibly anchored/);
const queuedCustomerPrompt = buildOpenAiIdentityReaderInput(Buffer.from("pdf"), "identity.pdf", { scope: "customer", customerMode: "queued" })[0].content[0].text;
assert.match(queuedCustomerPrompt, /the holder's printed name and birth date are independent identity anchors/);
assert.match(queuedCustomerPrompt, /strict holder-name-plus-birth-date identity-anchor rule/);

const readerModule = loadTypescript(path.join(root, "src/lib/openai-identity-reader.ts"), {
  "@/lib/ai/responses-client": { createAiResponse: async () => { throw new Error("provider should not be called"); } },
  "@/lib/identity-reader-contract": contract,
  "@/lib/customer-identity-field-catalog": {
    CUSTOMER_IDENTITY_FIELDS: {
      name: {}, nameLatin: {}, nameKanji: {}, nameKatakana: {}, furigana: {}, birthDate: {}, gender: {}, currentPostalCode: {}, currentAddress: {}, phone: {}, lineId: {}, email: {},
    },
  },
});
const customerSchema = readerModule.buildIdentityReaderSchema(readerModule.IDENTITY_CUSTOMER_FIELD_KEYS);
assert.deepEqual(customerSchema.properties.candidates.items.properties.fieldKey.enum, [
  "applicant.name", "applicant.nameLatin", "applicant.nameKanji", "applicant.nameKatakana", "applicant.furigana", "applicant.birthDate", "applicant.gender",
  "applicant.currentPostalCode", "applicant.currentAddress", "applicant.phone", "applicant.lineId", "applicant.email",
]);
assert(!customerSchema.properties.candidates.items.properties.fieldKey.enum.includes("applicant.nationality"));
assert.match(readerSource, /maxOutputTokens: IDENTITY_READER_MAX_OUTPUT_TOKENS/);
assert.match(readerSource, /PDFDocument\.load/);
assert.match(readerSource, /scope === "customer"/);
assert.match(entryPreviewSource, /scope: "customer", customerMode: "direct"/);
assert.match(queuedProcessorSource, /customerMode: .*"queued"/);
const { PDFDocument } = await import("pdf-lib");
const oversized = await PDFDocument.create();
for (let index = 0; index < 21; index += 1) oversized.addPage();
let providerCalls = 0;
const readerWithProviderCounter = loadTypescript(path.join(root, "src/lib/openai-identity-reader.ts"), {
  "@/lib/ai/responses-client": { createAiResponse: async () => { providerCalls += 1; throw new Error("provider should not be called"); } },
  "@/lib/identity-reader-contract": contract,
  "@/lib/customer-identity-field-catalog": { CUSTOMER_IDENTITY_FIELDS: { name: {} } },
});
const oversizedBytes = Buffer.from(await oversized.save());
await assert.rejects(
  () => readerWithProviderCounter.readIdentityDocumentWithOpenAi({ buffer: oversizedBytes, filename: "oversized.pdf", scope: "customer" }),
  /remote_document_reader_too_many_pages/,
);
assert.equal(providerCalls, 0, "page preflight must run before the paid provider");

const twoPagePdf = await PDFDocument.create();
twoPagePdf.addPage();
twoPagePdf.addPage();
const outOfRangePdfBytes = Buffer.from(await twoPagePdf.save());
const outOfRangeReader = loadTypescript(path.join(root, "src/lib/openai-identity-reader.ts"), {
  "@/lib/ai/responses-client": {
    createAiResponse: async () => ({
      parsed: {
        documentType: "identity_passport",
        pages: [{ pageNumber: 1, lines: ["氏名 Synthetic"] }, { pageNumber: 3, lines: ["氏名 Synthetic"] }],
        candidates: [{ fieldKey: "applicant.name", value: "Synthetic", pageNumber: 3, sourceText: "氏名 Synthetic", uncertainty: "clear", subjectKey: "person_1", subjectLabel: "申請人" }],
      },
    }),
  },
  "@/lib/identity-reader-contract": contract,
  "@/lib/customer-identity-field-catalog": { CUSTOMER_IDENTITY_FIELDS: { name: {} } },
});
await assert.rejects(
  () => outOfRangeReader.readIdentityDocumentWithOpenAi({ buffer: outOfRangePdfBytes, filename: "two-page.pdf", scope: "customer" }),
  /remote_document_reader_invalid_response/,
);
const imageOutOfRangeReader = loadTypescript(path.join(root, "src/lib/openai-identity-reader.ts"), {
  "@/lib/ai/responses-client": {
    createAiResponse: async () => ({
      parsed: {
        documentType: "identity_passport",
        pages: [{ pageNumber: 1, lines: ["氏名 Synthetic"] }, { pageNumber: 2, lines: ["氏名 Synthetic"] }],
        candidates: [{ fieldKey: "applicant.name", value: "Synthetic", pageNumber: 2, sourceText: "氏名 Synthetic", uncertainty: "clear", subjectKey: "person_1", subjectLabel: "申請人" }],
      },
    }),
  },
  "@/lib/identity-reader-contract": contract,
  "@/lib/customer-identity-field-catalog": { CUSTOMER_IDENTITY_FIELDS: { name: {} } },
});
await assert.rejects(
  () => imageOutOfRangeReader.readIdentityDocumentWithOpenAi({ buffer: Buffer.from("png"), filename: "one-page.png", scope: "customer" }),
  /remote_document_reader_invalid_response/,
);

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
  pages: [{ pageNumber: 1, lines: [] }],
  candidates: [{
    fieldKey: "applicant.name",
    value: "Synthetic",
    pageNumber: 1,
    sourceText: "氏名 Synthetic",
    uncertainty: "clear",
    subjectKey: "person_1",
    subjectLabel: "在留カード所持者",
  }],
}), /remote_document_reader_empty_result/, "an all-empty page transcript must not be rescued by candidate quotes");
const blankAuxiliaryPage = contract.parseOpenAiIdentityReaderResponse({
  documentType: "identity_residence_card",
  pages: [{ pageNumber: 1, lines: [] }, { pageNumber: 2, lines: ["unrelated page text"] }],
  candidates: [{
    fieldKey: "applicant.name",
    value: "Synthetic",
    pageNumber: 1,
    sourceText: "氏名 Synthetic",
    uncertainty: "clear",
    subjectKey: "person_1",
    subjectLabel: "在留カード所持者",
  }],
});
assert.deepEqual(blankAuxiliaryPage.pages[0].lines, [], "an empty auxiliary page must remain empty");
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

// Large PDFs must use an opaque, short-lived Files API reference rather than
// putting a multi-megabyte base64 string in the Responses JSON request.
const temporaryFileReaderCalls = [];
let temporaryFileInput;
const largeReader = loadTypescript(path.join(root, "src/lib/openai-identity-reader.ts"), {
  "@/lib/ai/responses-client": {
    createAiResponse: async (args) => {
      temporaryFileReaderCalls.push(args);
      assert.equal(args.input[0].content[1].type, "input_file");
      assert.equal(args.input[0].content[1].file_id, "file-large-synthetic");
      assert.equal("file_data" in args.input[0].content[1], false);
      return {
        parsed: {
          documentType: "identity_passport",
          pages: [{ pageNumber: 1, lines: ["氏名 Synthetic"] }, { pageNumber: 2, lines: ["氏名 Synthetic"] }],
          candidates: [{ fieldKey: "applicant.name", value: "Synthetic", pageNumber: 1, sourceText: "氏名 Synthetic", uncertainty: "clear", subjectKey: "person_1", subjectLabel: "申請人" }],
        },
      };
    },
    withTemporaryOpenAiFile: async (input, callback) => {
      temporaryFileInput = input;
      return callback("file-large-synthetic");
    },
    AiResponseError: class AiResponseError extends Error {},
    AiTemporaryFileError: class AiTemporaryFileError extends Error {},
    AiRuntimeUnavailableError: class AiRuntimeUnavailableError extends Error {},
  },
  "@/lib/identity-reader-contract": contract,
  "@/lib/customer-identity-field-catalog": { CUSTOMER_IDENTITY_FIELDS: { name: {} } },
});
const largePdfBytes = Buffer.concat([outOfRangePdfBytes, Buffer.alloc(readerModule.OPENAI_IDENTITY_READER_INLINE_FILE_MAX_BYTES + 1)]);
const largeResponse = await largeReader.readIdentityDocumentWithOpenAi({ buffer: largePdfBytes, filename: "large-synthetic.pdf", scope: "customer" });
assert.equal(largeResponse.candidates[0].value, "Synthetic");
assert.equal(temporaryFileReaderCalls.length, 1);
assert.equal(temporaryFileInput.filename, "large-synthetic.pdf");
assert.equal(temporaryFileInput.mimeType, "application/pdf");
assert.equal(temporaryFileInput.buffer.byteLength, largePdfBytes.byteLength);
const inlineBoundary = buildOpenAiIdentityReaderInput(Buffer.alloc(readerModule.OPENAI_IDENTITY_READER_INLINE_FILE_MAX_BYTES), "boundary.pdf");
assert.equal(inlineBoundary[0].content[1].type, "input_file");
assert.match(inlineBoundary[0].content[1].file_data, /^data:application\/pdf;base64,/);
class SyntheticTemporaryFileError extends Error {
  constructor(operation, status) { super(operation); this.operation = operation; this.status = status; }
}
const failedUploadReader = loadTypescript(path.join(root, "src/lib/openai-identity-reader.ts"), {
  "@/lib/ai/responses-client": {
    createAiResponse: async () => { throw new Error("must not call Responses after upload failure"); },
    withTemporaryOpenAiFile: async () => { throw new SyntheticTemporaryFileError("upload", 413); },
    AiResponseError: class AiResponseError extends Error {},
    AiTemporaryFileError: SyntheticTemporaryFileError,
    AiRuntimeUnavailableError: class AiRuntimeUnavailableError extends Error {},
  },
  "@/lib/identity-reader-contract": contract,
  "@/lib/customer-identity-field-catalog": { CUSTOMER_IDENTITY_FIELDS: { name: {} } },
});
await assert.rejects(
  () => failedUploadReader.readIdentityDocumentWithOpenAi({ buffer: largePdfBytes, filename: "large-synthetic.pdf", scope: "customer" }),
  (error) => error?.code === "file_upload_failed" && error?.status === 413,
);

// The helper itself must delete the file even when the Responses callback fails.
const responsesClient = loadTypescript(path.join(root, "src/lib/ai/responses-client.ts"), {
  "./model-routing": {
    resolveAiRuntimeConfig: () => ({ enabled: true, baseUrl: "https://api.openai.test/v1" }),
    resolveAiTaskRoute: () => ({ model: "synthetic" }),
  },
});
const fileApiCalls = [];
const fileApiFetch = async (url, init = {}) => {
  fileApiCalls.push({ url, init });
  if (String(url).endsWith("/files")) {
    assert.equal(init.method, "POST");
    assert.equal(init.body.get("purpose"), "user_data");
    assert.equal(init.body.get("expires_after[seconds]"), "3600");
    assert.equal(init.body.get("file").type, "application/pdf");
    return new Response(JSON.stringify({ id: "file-expiring-synthetic" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  assert.equal(String(url), "https://api.openai.test/v1/files/file-expiring-synthetic");
  assert.equal(init.method, "DELETE");
  return new Response(null, { status: 204 });
};
await assert.rejects(
  () => responsesClient.withTemporaryOpenAiFile(
    { buffer: Buffer.from("synthetic"), filename: "synthetic.pdf", mimeType: "application/pdf" },
    async () => { throw new Error("responses failed"); },
    { env: { OPENAI_API_KEY: "test-key" }, fetchImpl: fileApiFetch },
  ),
  /responses failed/,
);
assert.equal(fileApiCalls.length, 2, "temporary file cleanup must run after a failed Responses request");

assert(readerSource.includes("identity_document_extraction_assist"), "adapter must use the existing AI task route");
assert(readerSource.includes("input_file"), "PDFs must be sent as Responses API input_file");
assert(readerSource.includes("input_image"), "images must be sent as Responses API input_image");
assert(readerSource.includes('"applicant.name"'), "the model schema must use canonical applicant field keys");
assert(readerSource.includes("not_found, an empty sourceText is allowed"), "not_found candidates must allow empty evidence text");
assert(readerSource.includes("subjectKey"), "the model schema must carry a stable person-group key");
assert(readerSource.includes("subjectLabel"), "the model schema must carry a visible person role label");
assert(readerSource.includes("jsonSchema"), "adapter must require structured output");
assert(readerSource.includes("IDENTITY_CUSTOMER_FIELD_KEYS"), "customer schema must derive from the existing customer catalog");
assert(readerSource.includes("Never transliterate"), "customer identity reader must not infer name representations");
assert.match(readerSource, /scope === "customer"/, "standalone customer reader must pass an explicit customer scope");
assert(extractorSource.includes("method: \"ai\""), "AI candidates must retain their extraction method");
assert(extractorSource.includes("uncertainty=${decision.effectiveUncertainty}"), "candidate provenance must retain resolved uncertainty");
assert(extractorSource.includes("resolveIdentityReaderCandidate"), "AI candidates must pass through the deterministic conflict resolver");
assert(extractorSource.includes("effectiveUncertainty"), "AI candidate evidence must retain the resolved uncertainty state");
assert(extractorSource.includes("decision.effectiveUncertainty !== \"clear\""), "unclear/conflicting candidates must lower review confidence");
assert(extractorSource.includes('configuredProvider === "openai_responses"'), "configured reader failures must not be swallowed as empty local OCR");
assert(extractorSource.includes('if (provider === "openai_responses") {\n    assertProductionDocumentReaderReady();'), "production OpenAI reader must pass readiness gate");
assert(readinessSource.includes('config.baseUrl !== DEFAULT_AI_BASE_URL'), "production OpenAI reader must use the approved API endpoint");
assert(readinessSource.includes('process.env.DOCUMENT_READING_PROVIDER !== "remote"'), "existing production remote reader gate must remain intact");
console.log("PASS: OpenAI identity reader input modality, structured evidence, uncertainty provenance and production readiness contract");
