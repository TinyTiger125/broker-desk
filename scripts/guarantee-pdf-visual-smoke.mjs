#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";

const baseUrl = process.env.BASE_URL?.replace(/\/$/, "");
const caseId = process.env.CASE_ID ?? "case_fixture_friends_guarantee_pdf";
const templateId = process.env.TEMPLATE_ID ?? "zenhoren_individual_v1";
const mode = process.env.PDF_MODE;
const outputDir = process.env.OUTPUT_DIR ?? `/tmp/broker-desk-guarantee-visual-${templateId}`;
const outputPdf = process.env.OUTPUT_PDF ?? join(outputDir, `${templateId}.pdf`);
const renderSize = process.env.RENDER_SIZE ?? "3600";
const sourcePdfByTemplate = {
  zenhoren_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/１全保連.pdf",
  nihon_safety_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/日本セーフティー(1).pdf",
  j_lease_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/３Jリース.pdf",
  insure_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/４インシュア.pdf",
  friends_guarantee_individual_v1: "/Users/laineyzhu/Desktop/房产专家资料库/５ふれんず保証.pdf",
};
const sourcePdf = process.env.SOURCE_PDF ?? sourcePdfByTemplate[templateId];

const criticalRegionsByTemplate = {
  zenhoren_individual_v1: [
    { name: "property-and-money", x: 0.03, y: 0.20, width: 0.48, height: 0.28 },
    { name: "applicant-work", x: 0.57, y: 0.38, width: 0.40, height: 0.26 },
    { name: "cooccupants-and-emergency", x: 0.56, y: 0.61, width: 0.42, height: 0.30 },
  ],
  nihon_safety_individual_v1: [
    { name: "applicant", x: 0.05, y: 0.12, width: 0.48, height: 0.55 },
    { name: "property-and-money", x: 0.55, y: 0.10, width: 0.40, height: 0.62 },
    { name: "broker-and-options", x: 0.52, y: 0.70, width: 0.42, height: 0.22 },
  ],
  j_lease_individual_v1: [
    { name: "applicant", x: 0.05, y: 0.10, width: 0.54, height: 0.25 },
    { name: "property-and-money", x: 0.05, y: 0.70, width: 0.90, height: 0.25 },
    { name: "contact", x: 0.05, y: 0.40, width: 0.54, height: 0.25 },
  ],
  insure_individual_v1: [
    { name: "applicant", x: 0.05, y: 0.13, width: 0.45, height: 0.42 },
    { name: "property-and-money", x: 0.54, y: 0.08, width: 0.42, height: 0.55 },
    { name: "contact-and-company", x: 0.05, y: 0.64, width: 0.90, height: 0.26 },
  ],
  friends_guarantee_individual_v1: [
    { name: "property-and-money", x: 0.04, y: 0.20, width: 0.48, height: 0.34 },
    { name: "applicant", x: 0.04, y: 0.45, width: 0.48, height: 0.28 },
    { name: "contacts-and-company", x: 0.54, y: 0.07, width: 0.44, height: 0.80 },
  ],
};

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function parsePng(buffer) {
  assert(buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "rendered file is not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") idatChunks.push(data);
    if (type === "IEND") break;
    offset += length + 12;
  }

  assert(width > 0 && height > 0, "PNG dimensions missing");
  assert(bitDepth === 8, `unsupported PNG bit depth: ${bitDepth}`);
  const channels =
    colorType === 0 ? 1 :
    colorType === 2 ? 3 :
    colorType === 6 ? 4 :
    0;
  assert(channels > 0, `unsupported PNG color type: ${colorType}`);

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rowBytes = width * channels;
  const pixels = Buffer.alloc(rowBytes * height);
  let sourceOffset = 0;
  let targetOffset = 0;
  const previous = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = inflated.subarray(sourceOffset, sourceOffset + rowBytes);
    sourceOffset += rowBytes;
    const decoded = Buffer.alloc(rowBytes);

    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= channels ? decoded[index - channels] : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= channels ? previous[index - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      decoded[index] = (row[index] + predictor) & 0xff;
    }

    decoded.copy(pixels, targetOffset);
    decoded.copy(previous);
    targetOffset += rowBytes;
  }

  return { width, height, channels, pixels };
}

function cropStats(image, region) {
  const x0 = Math.max(0, Math.floor(region.x * image.width));
  const y0 = Math.max(0, Math.floor(region.y * image.height));
  const x1 = Math.min(image.width, x0 + Math.floor(region.width * image.width));
  const y1 = Math.min(image.height, y0 + Math.floor(region.height * image.height));
  let nonWhite = 0;
  let total = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * image.width + x) * image.channels;
      const r = image.pixels[index];
      const g = image.channels === 1 ? r : image.pixels[index + 1];
      const b = image.channels === 1 ? r : image.pixels[index + 2];
      if (r < 245 || g < 245 || b < 245) nonWhite += 1;
      total += 1;
    }
  }

  return {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
    nonWhiteRatio: total > 0 ? nonWhite / total : 0,
  };
}

function cropDeltaStats(outputImage, sourceImage, region) {
  const x0 = Math.max(0, Math.floor(region.x * outputImage.width));
  const y0 = Math.max(0, Math.floor(region.y * outputImage.height));
  const x1 = Math.min(outputImage.width, x0 + Math.floor(region.width * outputImage.width), sourceImage.width);
  const y1 = Math.min(outputImage.height, y0 + Math.floor(region.height * outputImage.height), sourceImage.height);
  let changed = 0;
  let total = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const outputIndex = (y * outputImage.width + x) * outputImage.channels;
      const sourceIndex = (y * sourceImage.width + x) * sourceImage.channels;
      const outputR = outputImage.pixels[outputIndex];
      const outputG = outputImage.channels === 1 ? outputR : outputImage.pixels[outputIndex + 1];
      const outputB = outputImage.channels === 1 ? outputR : outputImage.pixels[outputIndex + 2];
      const sourceR = sourceImage.pixels[sourceIndex];
      const sourceG = sourceImage.channels === 1 ? sourceR : sourceImage.pixels[sourceIndex + 1];
      const sourceB = sourceImage.channels === 1 ? sourceR : sourceImage.pixels[sourceIndex + 2];
      if (Math.abs(outputR - sourceR) + Math.abs(outputG - sourceG) + Math.abs(outputB - sourceB) > 45) changed += 1;
      total += 1;
    }
  }

  return {
    changedPixelRatio: total > 0 ? changed / total : 0,
    changedPixels: changed,
  };
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

function cropWithSips(imagePath, region, outputPath) {
  execFileSync("sips", [
    imagePath,
    "--cropToHeightWidth",
    String(region.height),
    String(region.width),
    "--cropOffset",
    String(region.y),
    String(region.x),
    "--out",
    outputPath,
  ], { stdio: "ignore" });
}

mkdirSync(outputDir, { recursive: true });

if (baseUrl) {
  const endpoint = `${baseUrl}/api/guarantee-applications/${encodeURIComponent(templateId)}/download?caseId=${encodeURIComponent(caseId)}${mode ? `&mode=${encodeURIComponent(mode)}` : ""}`;
  const response = await fetch(endpoint);
  assert(response.ok, `download failed with HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.toLowerCase().startsWith("application/pdf"), `download content-type is not application/pdf: ${contentType}`);
  writeFileSync(outputPdf, Buffer.from(await response.arrayBuffer()));
}

assert(existsSync(outputPdf), `output PDF not found: ${outputPdf}`);
const header = readFileSync(outputPdf, { encoding: "utf8", flag: "r" }).slice(0, 4);
assert(header === "%PDF", "output file does not start with %PDF");

const renderedPng = renderPdfToPng(outputPdf, outputDir);
const image = parsePng(readFileSync(renderedPng));
const sourceImage = sourcePdf && existsSync(sourcePdf)
  ? parsePng(readFileSync(renderPdfToPng(sourcePdf, outputDir)))
  : null;
const pageStats = cropStats(image, { x: 0, y: 0, width: 1, height: 1 });
assert(pageStats.nonWhiteRatio > 0.01, `rendered page appears blank: nonWhiteRatio=${pageStats.nonWhiteRatio}`);

const regions = criticalRegionsByTemplate[templateId] ?? [];
const regionStats = regions.map((region) => {
  const stats = cropStats(image, region);
  assert(stats.nonWhiteRatio > 0.01, `${region.name} crop appears blank: nonWhiteRatio=${stats.nonWhiteRatio}`);
  const delta = sourceImage ? cropDeltaStats(image, sourceImage, region) : undefined;
  if (delta) {
    assert(delta.changedPixelRatio > 0.00015, `${region.name} crop has no visible fill delta against source: changedPixelRatio=${delta.changedPixelRatio}`);
  }
  const cropPath = join(outputDir, `${templateId}-${region.name}.png`);
  cropWithSips(renderedPng, stats, cropPath);
  return {
    name: region.name,
    cropPath,
    ...stats,
    nonWhiteRatio: Number(stats.nonWhiteRatio.toFixed(4)),
    changedPixelRatio: delta ? Number(delta.changedPixelRatio.toFixed(5)) : undefined,
  };
});

console.log(JSON.stringify({
  ok: true,
  templateId,
  caseId,
  outputPdf,
  renderedPng,
  page: {
    width: image.width,
    height: image.height,
    nonWhiteRatio: Number(pageStats.nonWhiteRatio.toFixed(4)),
  },
  regions: regionStats,
}, null, 2));
