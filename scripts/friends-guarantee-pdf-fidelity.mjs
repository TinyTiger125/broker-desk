#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const templateId = process.env.TEMPLATE_ID ?? "friends_guarantee_individual_v1";
const sourcePdfByTemplate = {
  zenhoren_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/１全保連.pdf",
  nihon_safety_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/日本セーフティー(1).pdf",
  j_lease_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/３Jリース.pdf",
  insure_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/４インシュア.pdf",
  friends_guarantee_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/５ふれんず保証.pdf",
};
const sourcePath =
  process.env.SOURCE_PDF ??
  process.env.FRIENDS_GUARANTEE_TEMPLATE_PATH ??
  sourcePdfByTemplate[templateId] ??
  sourcePdfByTemplate.friends_guarantee_individual_v1;
const outputPath = process.env.OUTPUT_PDF ?? `/tmp/broker-desk-${templateId}-smoke.pdf`;
const baseUrl = process.env.BASE_URL?.replace(/\/$/, "");
const caseId = process.env.CASE_ID ?? "case_fixture_friends_guarantee_pdf";
const mode = process.env.PDF_MODE;
const tolerance = 0.01;

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

if (!existsSync(sourcePath)) {
  fail(`source template not found: ${sourcePath}`);
}

if (baseUrl) {
  const url = `${baseUrl}/api/guarantee-applications/${encodeURIComponent(templateId)}/download?caseId=${encodeURIComponent(caseId)}${mode ? `&mode=${encodeURIComponent(mode)}` : ""}`;
  const response = await fetch(url);
  assert(response.ok, `download failed with HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.toLowerCase().startsWith("application/pdf"), `download content-type is not application/pdf: ${contentType}`);
  writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
}

if (!existsSync(outputPath)) {
  fail(`output PDF not found: ${outputPath}`);
}

const outputHeader = readFileSync(outputPath, { encoding: "utf8", flag: "r" }).slice(0, 4);
assert(outputHeader === "%PDF", "output file does not start with %PDF");

const [sourcePdf, outputPdf] = await Promise.all([
  PDFDocument.load(readFileSync(sourcePath), { ignoreEncryption: true }),
  PDFDocument.load(readFileSync(outputPath), { ignoreEncryption: true }),
]);

assert(outputPdf.getPageCount() === sourcePdf.getPageCount(), `page count changed: source=${sourcePdf.getPageCount()} output=${outputPdf.getPageCount()}`);

for (let index = 0; index < sourcePdf.getPageCount(); index += 1) {
  const sourcePage = sourcePdf.getPage(index);
  const outputPage = outputPdf.getPage(index);
  const sourceSize = sourcePage.getSize();
  const outputSize = outputPage.getSize();
  assert(Math.abs(sourceSize.width - outputSize.width) <= tolerance, `page ${index + 1} width changed: source=${sourceSize.width} output=${outputSize.width}`);
  assert(Math.abs(sourceSize.height - outputSize.height) <= tolerance, `page ${index + 1} height changed: source=${sourceSize.height} output=${outputSize.height}`);
  assert(
    sourcePage.getRotation().angle === outputPage.getRotation().angle,
    `page ${index + 1} rotation changed: source=${sourcePage.getRotation().angle} output=${outputPage.getRotation().angle}`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      templateId,
      sourcePath,
      outputPath,
      pageCount: outputPdf.getPageCount(),
      firstPageSize: outputPdf.getPage(0).getSize(),
    },
    null,
    2,
  ),
);
