#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";

const baseUrl = process.env.BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3002";
const caseId = process.env.CASE_ID ?? "case_fixture_friends_guarantee_pdf";
const outputDir = process.env.OUTPUT_DIR ?? "/tmp/zenhoren-multicell-visual";
const renderSize = process.env.RENDER_SIZE ?? "4200";
const templateId = "zenhoren_individual_v1";
const pageSize = { width: 1190.55, height: 841.89 };

const regions = [
  { name: "01-first-page-property-postal", x: 85, top: 235, width: 170, height: 55 },
  { name: "02-first-page-lease-amounts", x: 82, top: 332, width: 510, height: 95 },
  { name: "03-applicant-birth-and-postal", x: 680, top: 378, width: 250, height: 76 },
  { name: "04-applicant-mobile-phone", x: 930, top: 438, width: 260, height: 66 },
  { name: "05-workplace-phone-and-postal", x: 680, top: 490, width: 510, height: 88 },
  { name: "06-income-work-years", x: 680, top: 580, width: 510, height: 48 },
  { name: "07-emergency-birth-postal", x: 680, top: 718, width: 510, height: 72 },
  { name: "08-emergency-mobile-phone", x: 930, top: 772, width: 260, height: 52 },
  { name: "09-right-page-all-multicell", x: 660, top: 330, width: 525, height: 500 },
  { name: "10-applicant-postal-tight", x: 690, top: 397, width: 165, height: 44 },
  { name: "11-workplace-phone-tight", x: 930, top: 490, width: 260, height: 46 },
  { name: "12-workplace-postal-tight", x: 690, top: 527, width: 165, height: 44 },
  { name: "13-emergency-postal-tight", x: 690, top: 746, width: 165, height: 44 },
  { name: "14-emergency-mobile-tight", x: 930, top: 782, width: 260, height: 42 },
];

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function renderPdfToPng(pdfPath, directory) {
  const renderDirectory = join(directory, `render-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(renderDirectory, { recursive: true });
  execFileSync("qlmanage", ["-t", "-s", renderSize, "-o", renderDirectory, pdfPath], { stdio: "ignore" });
  const rendered = readdirSync(renderDirectory).filter((name) => name.toLowerCase().endsWith(".png"));
  const fallback = rendered.filter((name) => name.normalize("NFC").startsWith(basename(pdfPath).normalize("NFC")));
  const pngName = fallback[0] ?? rendered[0];
  assert(pngName, "qlmanage did not create a PNG thumbnail");
  return join(renderDirectory, pngName);
}

function cropWithSips(imagePath, crop, outputPath) {
  execFileSync("sips", [
    imagePath,
    "--cropToHeightWidth",
    String(crop.height),
    String(crop.width),
    "--cropOffset",
    String(crop.y),
    String(crop.x),
    "--out",
    outputPath,
  ], { stdio: "ignore" });
}

mkdirSync(outputDir, { recursive: true });
const outputPdf = join(outputDir, "zenhoren-multicell.pdf");
const endpoint = `${baseUrl}/api/guarantee-applications/${templateId}/download?caseId=${encodeURIComponent(caseId)}&mode=preview`;
const response = await fetch(endpoint);
assert(response.ok, `download failed with HTTP ${response.status}`);
assert((response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/pdf"), "download did not return a PDF");
writeFileSync(outputPdf, Buffer.from(await response.arrayBuffer()));
assert(readFileSync(outputPdf, { encoding: "utf8", flag: "r" }).slice(0, 4) === "%PDF", "output file does not start with %PDF");

const renderedPng = renderPdfToPng(outputPdf, outputDir);
const renderedProbe = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", renderedPng], { encoding: "utf8" });
const pixelWidth = Number(renderedProbe.match(/pixelWidth: (\d+)/)?.[1] ?? 0);
const pixelHeight = Number(renderedProbe.match(/pixelHeight: (\d+)/)?.[1] ?? 0);
assert(pixelWidth > 0 && pixelHeight > 0, "could not read rendered PNG dimensions");

const scaleX = pixelWidth / pageSize.width;
const scaleY = pixelHeight / pageSize.height;
const crops = regions.map((region) => {
  const crop = {
    x: Math.max(0, Math.round(region.x * scaleX)),
    y: Math.max(0, Math.round(region.top * scaleY)),
    width: Math.round(region.width * scaleX),
    height: Math.round(region.height * scaleY),
  };
  const cropPath = join(outputDir, `${region.name}.png`);
  cropWithSips(renderedPng, crop, cropPath);
  return { name: region.name, cropPath, crop };
});

console.log(JSON.stringify({
  ok: true,
  caseId,
  outputPdf,
  renderedPng,
  renderedSize: { width: pixelWidth, height: pixelHeight },
  expectedStandard: "one character per printed cell, visually centered, no overlap with grid lines",
  crops,
}, null, 2));
