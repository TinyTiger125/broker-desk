import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const catalogPath = join(root, "src/lib/case-field-catalog.ts");
const catalogSource = readFileSync(catalogPath, "utf8");

const catalogKeys = [...catalogSource.matchAll(/fieldKey:\s*"([^"]+)"/g)].map((match) => match[1]);
const catalogKeySet = new Set(catalogKeys);
for (const index of [0, 1, 2]) {
  for (const suffix of ["furigana", "name", "relationship", "gender", "birthDate", "phone", "employerName"]) {
    const fieldKey = `coOccupants.${index}.${suffix}`;
    catalogKeys.push(fieldKey);
    catalogKeySet.add(fieldKey);
  }
}
const duplicateCatalogKeys = catalogKeys.filter((key, index) => catalogKeys.indexOf(key) !== index);

if (duplicateCatalogKeys.length > 0) {
  console.error("Duplicate case field catalog keys:");
  [...new Set(duplicateCatalogKeys)].forEach((key) => console.error(`- ${key}`));
  process.exit(1);
}

const semanticPrefixes = [
  "application",
  "property",
  "lease",
  "applicant",
  "guarantor",
  "emergencyContact",
  "coOccupants",
  "broker",
  "management",
  "guarantee",
  "company_option",
  "landlord",
];

const sourceFiles = [
  "src/lib/friends-guarantee-pdf.ts",
  "src/lib/guarantee-application.ts",
  "src/app/actions.ts",
  "src/app/cases/[id]/page.tsx",
  "src/app/guarantee-applications/friends-guarantee/preview/page.tsx",
];

function isSemanticFieldKey(value) {
  return semanticPrefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}.`));
}

function isAllowedRenderFragment(fieldKey) {
  const renderSuffixes = ["family", "given", "prefecture", "municipality", "street", "rest"];
  const parts = fieldKey.split(".");
  const suffix = parts.at(-1);
  if (renderSuffixes.includes(suffix)) {
    const sourceKey = parts.slice(0, -1).join(".");
    return catalogKeySet.has(sourceKey);
  }
  if (fieldKey === "application.submittedMonth" || fieldKey === "application.submittedDay") {
    return catalogKeySet.has("application.submittedDate");
  }
  return false;
}

function collectFieldKeysFromSource(file) {
  const source = readFileSync(join(root, file), "utf8");
  const keys = new Set();

  for (const match of source.matchAll(/\b(?:fieldKey|sourceFieldKey):\s*"([^"]+)"/g)) {
    if (isSemanticFieldKey(match[1])) keys.add(match[1]);
  }

  for (const match of source.matchAll(/\[\s*"([^"]+)"\s*,\s*"[^"]*"\s*\]/g)) {
    if (isSemanticFieldKey(match[1])) keys.add(match[1]);
  }

  return [...keys];
}

const missing = [];

for (const file of sourceFiles) {
  for (const fieldKey of collectFieldKeysFromSource(file)) {
    if (catalogKeySet.has(fieldKey)) continue;
    if (fieldKey.startsWith("custom.")) continue;
    if (isAllowedRenderFragment(fieldKey)) continue;
    missing.push({ file, fieldKey });
  }
}

if (missing.length > 0) {
  console.error("Semantic field keys missing from src/lib/case-field-catalog.ts:");
  missing
    .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey) || a.file.localeCompare(b.file))
    .forEach((item) => console.error(`- ${item.fieldKey} (${item.file})`));
  process.exit(1);
}

console.log(`Case field catalog OK: ${catalogKeys.length} fields checked across ${sourceFiles.length} sources.`);
