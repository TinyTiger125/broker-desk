#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const roots = ["src/app", "src/components"];
const excludedSegments = new Set(["api", "platform", "guarantee-applications"]);
const excludedFiles = new Set([
  "friends-guarantee-calibration-preview.tsx",
  "guarantee-template-designer.tsx",
]);
const forbiddenTerms = [
  "字段映射",
  "版式核验",
  "字段名 / key / 当前值",
  "内部字段",
  "模型判断",
  "AI 推理",
  "AI推理",
  "系统判断",
];

function collect(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedSegments.has(entry.name)) collect(filePath, result);
      continue;
    }
    if (!entry.isFile() || excludedFiles.has(entry.name) || !/\.(?:ts|tsx)$/.test(entry.name)) continue;
    result.push(filePath);
  }
  return result;
}

const violations = [];
for (const root of roots) {
  for (const filePath of collect(root)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const term of forbiddenTerms) {
      if (source.includes(term)) violations.push(`${filePath}: ${term}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Product UI exposes implementation or AI reasoning language:\n" + violations.join("\n"));
  process.exit(1);
}

console.log(`[PASS] product-language boundary: scanned ${roots.join(", ")} with ${forbiddenTerms.length} forbidden implementation phrases`);
