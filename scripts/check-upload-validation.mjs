import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const Module = require("node:module");
const sourcePath = path.resolve("src/lib/upload-validation.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module.Module(sourcePath);
loaded.filename = sourcePath;
loaded.paths = Module.Module._nodeModulePaths(process.cwd());
loaded._compile(compiled, sourcePath);

const { detectIdentityDocumentKind, isZipContainer } = loaded.exports;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(detectIdentityDocumentKind(Buffer.from("%PDF-1.7")) === "pdf", "PDF signature should be accepted");
assert(detectIdentityDocumentKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === "png", "PNG signature should be accepted");
assert(detectIdentityDocumentKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) === "jpeg", "JPEG signature should be accepted");
assert(detectIdentityDocumentKind(Buffer.from("not-a-document")) === null, "Unknown file signatures must be rejected");
assert(isZipContainer(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])) === true, "XLSX ZIP signature should be accepted");
assert(isZipContainer(Buffer.from("not-a-workbook")) === false, "Non-ZIP workbook must be rejected");

console.log("[PASS] Upload file signatures and ZIP container guards");
