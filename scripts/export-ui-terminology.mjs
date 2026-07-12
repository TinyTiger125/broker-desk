#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import ts from "typescript";

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "src");
const outPath = path.join(repoRoot, "docs", "operations", "ui-terminology-review.csv");
const coreOutPath = path.join(repoRoot, "docs", "operations", "ui-terminology-core-review.csv");
const starterOutPath = path.join(repoRoot, "docs", "operations", "ui-terminology-starter-review.csv");
const targetExtensions = new Set([".ts", ".tsx"]);
const cjkPattern = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const localeNames = new Set(["ja", "zh", "ko"]);
const starterI18nReviewLimit = 220;
const starterHardcodedReviewLimit = 80;
const starterReviewFiles = new Set([
  "src/lib/i18n.ts",
  "src/app/page.tsx",
  "src/app/import-center/page.tsx",
  "src/app/organize-center/page.tsx",
  "src/app/output-center/page.tsx",
  "src/app/cases/[id]/page.tsx",
  "src/components/case-workbench-field-form.tsx",
  "src/components/identity-document-upload-form.tsx",
  "src/components/input-extraction-review.tsx",
  "src/components/page-flash-banner.tsx",
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") return [];
      return walk(fullPath);
    }
    if (!targetExtensions.has(path.extname(entry.name))) return [];
    return [fullPath];
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function stableId(prefix, text) {
  return `${prefix}.${crypto.createHash("sha1").update(text).digest("hex").slice(0, 10)}`;
}

function classifySurface(file) {
  if (file === "src/lib/i18n.ts") return "frontstage";
  if (file.startsWith("src/components/")) return "frontstage";
  if (
    file === "src/app/page.tsx" ||
    file.startsWith("src/app/import-center/") ||
    file.startsWith("src/app/organize-center/") ||
    file.startsWith("src/app/cases/") ||
    file.startsWith("src/app/output-center/") ||
    file.startsWith("src/app/guarantee-applications/")
  ) {
    return "frontstage";
  }
  if (file.startsWith("src/app/api/") || file === "src/app/actions.ts") return "system";
  if (file.startsWith("src/lib/")) return "library";
  return "secondary";
}

function reviewPriority(row) {
  let score = row.occurrences * 3;
  if (starterReviewFiles.has(row.file)) score += 80;
  if (row.source === "i18n") score += 20;
  if (row.locale === "zh" || row.locale === "unknown") score += 10;
  if (row.file === "src/lib/i18n.ts") score += 10;
  return score;
}

function nodeText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isImportPath(node) {
  return ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent);
}

function extractLocaleObjectRows(sourceFile, filePath, rows) {
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      localeNames.has(node.name.text) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const locale = node.name.text;
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const keyNode = prop.name;
        const value = nodeText(prop.initializer);
        if (!value || !cjkPattern.test(value)) continue;
        const key = ts.isStringLiteral(keyNode) || ts.isIdentifier(keyNode) ? keyNode.text : keyNode.getText(sourceFile);
        rows.push({
          id: `i18n.${locale}.${key}`,
          source: "i18n",
          file: path.relative(repoRoot, filePath),
          line: lineOf(sourceFile, prop),
          locale,
          key,
          currentText: value,
          suggestedText: "",
          notes: "Can be edited in CSV and migrated back to i18n source.",
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function extractHardcodedRows(sourceFile, filePath, rows) {
  const relativeFile = path.relative(repoRoot, filePath);
  if (relativeFile === "src/lib/i18n.ts") return;
  let hardcodedIndex = 0;

  function visit(node) {
    const text = nodeText(node);
    if (text && cjkPattern.test(text) && !isImportPath(node)) {
      const line = lineOf(sourceFile, node);
      hardcodedIndex += 1;
      rows.push({
        id: `hardcoded.${relativeFile}:${line}:${hardcodedIndex}`,
        source: "hardcoded",
        file: relativeFile,
        line,
        locale: "unknown",
        key: "",
        currentText: text,
        suggestedText: "",
        notes: "Hardcoded UI copy. Migrate to i18n before automatic replacement.",
      });
    }
    if (ts.isJsxText(node)) {
      const textValue = node.getText(sourceFile).replace(/\s+/g, " ").trim();
      if (textValue && cjkPattern.test(textValue)) {
        const line = lineOf(sourceFile, node);
        hardcodedIndex += 1;
        rows.push({
          id: `jsx.${relativeFile}:${line}:${hardcodedIndex}`,
          source: "hardcoded",
          file: relativeFile,
          line,
          locale: "unknown",
          key: "",
          currentText: textValue,
          suggestedText: "",
          notes: "JSX text node. Migrate to i18n before automatic replacement.",
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function main() {
  const rows = [];
  for (const filePath of walk(srcRoot)) {
    const source = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, path.extname(filePath) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    extractLocaleObjectRows(sourceFile, filePath, rows);
    extractHardcodedRows(sourceFile, filePath, rows);
  }

  const summarized = new Map();
  for (const row of rows) {
    const key = row.source === "i18n" ? row.id : `${row.source}:${row.currentText}`;
    const existing = summarized.get(key);
    if (!existing) {
      summarized.set(key, { ...row, id: row.source === "i18n" ? row.id : stableId("hardcoded", row.currentText), occurrences: 1 });
      continue;
    }
    existing.occurrences += 1;
  }

  const outputRows = Array.from(summarized.values()).map((row) => ({
    ...row,
    surface: classifySurface(row.file),
  })).sort((a, b) =>
    a.surface.localeCompare(b.surface) ||
    a.source.localeCompare(b.source) ||
    a.file.localeCompare(b.file) ||
    a.line - b.line ||
    a.id.localeCompare(b.id),
  );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const header = ["id", "surface", "source", "file", "line", "occurrences", "locale", "key", "current_text", "suggested_text", "notes"];
  const toCsv = (rowsToWrite) => [
    header.map(csvCell).join(","),
    ...rowsToWrite.map((row) => [
      row.id,
      row.surface,
      row.source,
      row.file,
      row.line,
      row.occurrences,
      row.locale,
      row.key,
      row.currentText,
      row.suggestedText,
      row.notes,
    ].map(csvCell).join(",")),
  ].join("\n");

  const coreRows = outputRows.filter((row) => row.surface === "frontstage");
  const starterCandidates = [...coreRows].filter((row) => starterReviewFiles.has(row.file) || row.occurrences > 1);
  const sortByPriority = (a, b) =>
    reviewPriority(b) - reviewPriority(a) ||
    a.file.localeCompare(b.file) ||
    a.line - b.line ||
    a.id.localeCompare(b.id);
  const sourceRank = { i18n: 0, hardcoded: 1 };
  const starterRows = [
    ...starterCandidates
      .filter((row) => row.source === "i18n")
      .sort(sortByPriority)
      .slice(0, starterI18nReviewLimit),
    ...starterCandidates
      .filter((row) => row.source === "hardcoded")
      .sort(sortByPriority)
      .slice(0, starterHardcodedReviewLimit),
  ]
    .sort((a, b) =>
      (sourceRank[a.source] ?? 9) - (sourceRank[b.source] ?? 9) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.id.localeCompare(b.id),
    );
  fs.writeFileSync(outPath, `${toCsv(outputRows)}\n`, "utf8");
  fs.writeFileSync(coreOutPath, `${toCsv(coreRows)}\n`, "utf8");
  fs.writeFileSync(starterOutPath, `${toCsv(starterRows)}\n`, "utf8");
  console.log(`Exported ${outputRows.length} unique UI terminology rows from ${rows.length} occurrences to ${path.relative(repoRoot, outPath)}`);
  console.log(`Exported ${coreRows.length} frontstage review rows to ${path.relative(repoRoot, coreOutPath)}`);
  console.log(`Exported ${starterRows.length} high-priority review rows to ${path.relative(repoRoot, starterOutPath)}`);
}

main();
