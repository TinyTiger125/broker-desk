import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE_URL = "https://www.post.japanpost.jp/service/search/zipcode/download/utf/zip/utf_ken_all.zip";
const OUTPUT_PATH = join(process.cwd(), ".broker-desk", "japan-postal-code-index.json");

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

    mkdirSync(join(process.cwd(), ".broker-desk"), { recursive: true });
    writeFileSync(
      OUTPUT_PATH,
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        source: SOURCE_URL,
        entriesByPostalCode,
      })}\n`,
    );
    console.log(`[PASS] Japan postal code index synced: ${Object.keys(entriesByPostalCode).length} postal codes -> ${OUTPUT_PATH}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
