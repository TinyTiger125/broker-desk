#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const contractPath = path.join(root, "src/lib/identity-reader-contract.ts");
const extractorSource = fs.readFileSync(path.join(root, "src/lib/identity-document-extractor.ts"), "utf8");
const processorSource = fs.readFileSync(path.join(root, "src/lib/identity-import-processor.ts"), "utf8");

function loadTypescript(filePath) {
  const moduleInstance = new Module(filePath, null);
  moduleInstance.filename = filePath;
  moduleInstance.paths = Module._nodeModulePaths(root);
  const javascript = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath,
  }).outputText;
  moduleInstance._compile(javascript, filePath);
  return moduleInstance.exports;
}

const { buildRemoteDocumentReaderRequest, parseRemoteDocumentReaderResponse, RemoteDocumentReaderError } = loadTypescript(contractPath);
const request = buildRemoteDocumentReaderRequest(Buffer.from("synthetic"), "identity.pdf");
assert.deepEqual(request, { document: { filename: "identity.pdf", contentBase64: Buffer.from("synthetic").toString("base64") } });
assert.deepEqual(parseRemoteDocumentReaderResponse({ pages: [{ lines: ["氏名 Synthetic"] }] }), { pages: [{ pageNumber: 1, lines: ["氏名 Synthetic"] }] });
for (const value of [null, {}, { pages: "bad" }, { pages: [{}] }, { pages: [{ lines: [42] }] }, { pages: [] }, { pages: [{ lines: ["", "  "] }] }]) {
  assert.throws(() => parseRemoteDocumentReaderResponse(value), (error) => error instanceof RemoteDocumentReaderError);
}
assert.throws(() => parseRemoteDocumentReaderResponse({ pages: [{ pageNumber: 0, lines: ["text"] }] }), /remote_document_reader_invalid_page/);
assert(extractorSource.includes("buildRemoteDocumentReaderRequest"), "extractor must use the shared reader request contract");
assert(extractorSource.includes("parseRemoteDocumentReaderResponse"), "extractor must use the shared reader response contract");
assert(!extractorSource.includes("function parseRemoteOcrResult"), "extractor must not retain a second response parser");
assert(processorSource.includes("RemoteDocumentReaderError"), "processor must classify reader failures");
assert(processorSource.includes("remote_document_reader_${error.code}"), "processor must persist reader failure codes");
console.log("PASS: remote reader request/response contract, malformed/empty rejection and failure classification");
