import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const SOURCE_URL = "https://www.post.japanpost.jp/service/search/zipcode/download/utf/zip/utf_ken_all.zip";
const OUTPUT_PATH = join(process.cwd(), "src", "data", "japan-postal-code-index.ts");

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function normalizeTownArea(value) {
  const town = value.trim();
  if (!town || town === "以下に掲載がない場合") return "";
  return town;
}

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), "broker-desk-postal-"));
  const zipPath = join(tempDir, "utf_ken_all.zip");
  try {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));

    const csv = execFileSync("unzip", ["-p", zipPath, "utf_ken_all.csv"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const entriesByPostalCode = {};
    for (const line of csv.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const columns = parseCsvLine(line);
      const postalCode = (columns[2] ?? "").replace(/\D/g, "");
      const prefecture = (columns[6] ?? "").trim();
      const municipality = (columns[7] ?? "").trim();
      const townArea = normalizeTownArea(columns[8] ?? "");
      if (postalCode.length !== 7 || !prefecture || !municipality) continue;
      const entry = { postalCode, prefecture, municipality, townArea };
      entriesByPostalCode[postalCode] = entriesByPostalCode[postalCode] ?? [];
      const duplicated = entriesByPostalCode[postalCode].some(
        (item) => item.prefecture === entry.prefecture && item.municipality === entry.municipality && item.townArea === entry.townArea,
      );
      if (!duplicated) entriesByPostalCode[postalCode].push(entry);
    }

    const generatedAt = new Date().toISOString();
    const postalCodeCount = Object.keys(entriesByPostalCode).length;
    const compressedIndexBase64 = gzipSync(Buffer.from(JSON.stringify(entriesByPostalCode), "utf8"), { level: 9 }).toString("base64");
    // Keep generated source lines bounded so TypeScript/Turbopack does not
    // parse one multi-megabyte string literal. The runtime joins these chunks
    // before base64 decoding and gunzipping on the server.
    const base64Chunks = compressedIndexBase64.match(/.{1,8192}/g) ?? [];
    const moduleSource = [
      "// GENERATED FILE. Run `npm run sync:postal-codes` to refresh from the Japan Post official UTF CSV archive.",
      `// Source: ${SOURCE_URL}`,
      `// Generated at: ${generatedAt}`,
      `// Postal-code entries: ${postalCodeCount}`,
      "// Encoding: gzip+base64 (server-side inflate)",
      "",
      "export const JAPAN_POSTAL_CODE_INDEX_METADATA = {",
      `  generatedAt: ${JSON.stringify(generatedAt)},`,
      `  source: ${JSON.stringify(SOURCE_URL)},`,
      `  postalCodeCount: ${postalCodeCount},`,
      `  format: "gzip+base64",`,
      "} as const;",
      "",
      "export const JAPAN_POSTAL_CODE_INDEX_GZIP_BASE64 = [",
      ...base64Chunks.map((chunk) => `  ${JSON.stringify(chunk)},`),
      "].join(\"\");",
      "",
    ].join("\n");
    mkdirSync(join(process.cwd(), "src", "data"), { recursive: true });
    writeFileSync(OUTPUT_PATH, moduleSource);
    console.log(`[PASS] Japan postal code index synced: ${postalCodeCount} postal codes -> ${OUTPUT_PATH}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
