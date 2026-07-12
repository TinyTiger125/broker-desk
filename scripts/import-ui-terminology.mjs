#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const defaultCsvPath = path.join(repoRoot, "docs", "operations", "ui-terminology-core-review.csv");
const i18nPath = path.join(repoRoot, "src", "lib", "i18n.ts");
const localeNames = new Set(["ja", "zh", "ko"]);

function parseArgs(argv) {
  const args = {
    csvPath: defaultCsvPath,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      args.write = true;
      continue;
    }
    if (arg === "--csv") {
      const next = argv[index + 1];
      if (!next) throw new Error("--csv requires a path");
      args.csvPath = path.isAbsolute(next) ? next : path.join(repoRoot, next);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run terms:import
  npm run terms:import -- --write
  npm run terms:import -- --csv docs/operations/ui-terminology-core-review.csv --write

Default mode is dry-run. Only rows with source=i18n and non-empty suggested_text are applied.
Hardcoded rows are reported as not auto-importable.`);
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) =>
    Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])),
  );
}

function escapeTsString(text) {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
}

function decodeTsStringContent(text) {
  try {
    return JSON.parse(`"${text}"`);
  } catch {
    return text;
  }
}

function collectReviewRows(rows) {
  const importable = [];
  const hardcodedWithSuggestions = [];
  const ignored = [];
  const duplicateKeys = new Set();
  const seenKeys = new Set();

  for (const row of rows) {
    const suggestedText = row.suggested_text?.trim() ?? "";
    if (!suggestedText) {
      ignored.push(row);
      continue;
    }
    if (row.source !== "i18n") {
      if (row.source === "hardcoded") hardcodedWithSuggestions.push(row);
      continue;
    }
    if (row.file !== "src/lib/i18n.ts" || !localeNames.has(row.locale) || !row.key) {
      ignored.push(row);
      continue;
    }
    const reviewKey = `${row.locale}:${row.key}`;
    if (seenKeys.has(reviewKey)) {
      duplicateKeys.add(reviewKey);
      continue;
    }
    seenKeys.add(reviewKey);
    if (suggestedText === row.current_text) {
      ignored.push(row);
      continue;
    }
    importable.push({
      locale: row.locale,
      key: row.key,
      currentText: row.current_text ?? "",
      suggestedText,
    });
  }

  return { importable, hardcodedWithSuggestions, ignored, duplicateKeys };
}

function findLocaleObjectRange(source, locale) {
  const marker = `const ${locale}: Dict = {`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Cannot find locale object: ${locale}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === "\\") {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return { start: bodyStart, end: index };
    }
  }

  throw new Error(`Cannot find end of locale object: ${locale}`);
}

function updateLocaleBody(body, updates) {
  const applied = [];
  const stale = [];
  const missing = [];
  let nextBody = body;

  for (const update of updates) {
    const escapedKey = update.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`("${escapedKey}"\\s*:\\s*)"((?:\\\\.|[^"\\\\])*)"`, "m");
    const match = nextBody.match(pattern);
    if (!match) {
      missing.push(update);
      continue;
    }
    const actualText = decodeTsStringContent(match[2]);
    if (actualText !== update.currentText) {
      stale.push({ ...update, actualText });
      continue;
    }
    nextBody = nextBody.replace(pattern, (_fullMatch, prefix) => `${prefix}"${escapeTsString(update.suggestedText)}"`);
    applied.push(update);
  }

  return { body: nextBody, applied, stale, missing };
}

function updateI18nSource(source, importable) {
  let nextSource = source;
  const byLocale = new Map();
  for (const update of importable) {
    const list = byLocale.get(update.locale) ?? [];
    list.push(update);
    byLocale.set(update.locale, list);
  }

  const result = { applied: [], stale: [], missing: [] };
  for (const locale of localeNames) {
    const updates = byLocale.get(locale) ?? [];
    if (updates.length === 0) continue;
    const range = findLocaleObjectRange(nextSource, locale);
    const body = nextSource.slice(range.start, range.end + 1);
    const updated = updateLocaleBody(body, updates);
    nextSource = `${nextSource.slice(0, range.start)}${updated.body}${nextSource.slice(range.end + 1)}`;
    result.applied.push(...updated.applied);
    result.stale.push(...updated.stale);
    result.missing.push(...updated.missing);
  }

  return { source: nextSource, ...result };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.csvPath)) throw new Error(`CSV not found: ${args.csvPath}`);

  const rows = parseCsv(fs.readFileSync(args.csvPath, "utf8"));
  const { importable, hardcodedWithSuggestions, duplicateKeys } = collectReviewRows(rows);
  const source = fs.readFileSync(i18nPath, "utf8");
  const result = updateI18nSource(source, importable);

  if (args.write && result.applied.length > 0) {
    fs.writeFileSync(i18nPath, result.source, "utf8");
  }

  const mode = args.write ? "write" : "dry-run";
  console.log(`UI terminology import (${mode})`);
  console.log(`CSV: ${path.relative(repoRoot, args.csvPath)}`);
  console.log(`Applied i18n rows: ${result.applied.length}`);
  console.log(`Skipped stale rows: ${result.stale.length}`);
  console.log(`Missing i18n keys: ${result.missing.length}`);
  console.log(`Hardcoded suggestions not imported: ${hardcodedWithSuggestions.length}`);
  console.log(`Duplicate i18n review keys ignored: ${duplicateKeys.size}`);

  if (!args.write && result.applied.length > 0) {
    console.log("Run with --write to update src/lib/i18n.ts.");
  }
  if (result.stale.length > 0) {
    console.log("Stale rows:");
    for (const row of result.stale.slice(0, 10)) {
      console.log(`- ${row.locale}.${row.key}: CSV current_text no longer matches source`);
    }
  }
  if (hardcodedWithSuggestions.length > 0) {
    console.log("Hardcoded rows require migration to i18n before import.");
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
