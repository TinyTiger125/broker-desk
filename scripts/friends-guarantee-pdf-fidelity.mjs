#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const templateId = process.env.TEMPLATE_ID ?? "friends_guarantee_individual_v1";
const sourcePath = process.env.SOURCE_PDF;
const outputPath = process.env.OUTPUT_PDF ?? `/tmp/broker-desk-${templateId}-smoke.pdf`;
const baseUrl = process.env.BASE_URL?.replace(/\/$/, "");
const caseId = process.env.CASE_ID ?? "case_fixture_friends_guarantee_pdf";
const mode = process.env.PDF_MODE;
const tolerance = 0.01;
const expectedPageSizeByTemplate = {
  zenhoren_individual_v1: { width: 1190.55, height: 841.89 },
  nihon_safety_individual_v1: { width: 841.89, height: 595.28 },
  j_lease_individual_v1: { width: 595.32, height: 841.92 },
  insure_individual_v1: { width: 780, height: 539 },
  friends_guarantee_individual_v1: { width: 1190.55, height: 841.89 },
};

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
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

const outputPdf = await PDFDocument.load(readFileSync(outputPath), { ignoreEncryption: true });
const expectedPageSize = expectedPageSizeByTemplate[templateId] ?? expectedPageSizeByTemplate.friends_guarantee_individual_v1;
assert(outputPdf.getPageCount() === 1, `page count changed: expected=1 output=${outputPdf.getPageCount()}`);
const outputPage = outputPdf.getPage(0);
const outputSize = outputPage.getSize();
assert(Math.abs(expectedPageSize.width - outputSize.width) <= tolerance, `page width changed: expected=${expectedPageSize.width} output=${outputSize.width}`);
assert(Math.abs(expectedPageSize.height - outputSize.height) <= tolerance, `page height changed: expected=${expectedPageSize.height} output=${outputSize.height}`);

if (sourcePath) {
  assert(existsSync(sourcePath), `source template not found: ${sourcePath}`);
  const sourcePdf = await PDFDocument.load(readFileSync(sourcePath), { ignoreEncryption: true });
  const sourcePage = sourcePdf.getPage(0);
  const sourceSize = sourcePage.getSize();
  assert(Math.abs(sourceSize.width - outputSize.width) <= tolerance, `page width changed: source=${sourceSize.width} output=${outputSize.width}`);
  assert(Math.abs(sourceSize.height - outputSize.height) <= tolerance, `page height changed: source=${sourceSize.height} output=${outputSize.height}`);
  assert(sourcePage.getRotation().angle === outputPage.getRotation().angle, `page rotation changed: source=${sourcePage.getRotation().angle} output=${outputPage.getRotation().angle}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      templateId,
      sourcePath: sourcePath ?? null,
      outputPath,
      pageCount: outputPdf.getPageCount(),
      firstPageSize: outputPdf.getPage(0).getSize(),
    },
    null,
    2,
  ),
);
