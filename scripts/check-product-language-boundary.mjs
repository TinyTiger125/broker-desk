#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parse } from "@typescript-eslint/parser";

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

function isZhLocaleTest(node) {
  if (!node || node.type !== "BinaryExpression" || node.operator !== "===") return false;
  const left = node.left;
  const right = node.right;
  return (
    (left.type === "Identifier" && left.name === "locale" && right.type === "Literal" && right.value === "zh") ||
    (right.type === "Identifier" && right.name === "locale" && left.type === "Literal" && left.value === "zh")
  );
}

function walk(node, state, visit) {
  if (!node || typeof node !== "object") return;
  visit(node, state);

  if (node.type === "ConditionalExpression" && isZhLocaleTest(node.test)) {
    walk(node.test, state, visit);
    walk(node.consequent, { ...state, zhLocaleBranch: true }, visit);
    walk(node.alternate, state, visit);
    return;
  }

  if (node.type === "Property") {
    const keyName = node.key?.type === "Identifier" ? node.key.name : node.key?.value;
    walk(node.key, state, visit);
    walk(node.value, keyName === "zh" ? { ...state, zhLocaleBranch: true } : state, visit);
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "tokens" || key === "comments" || key === "loc" || key === "range") continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, state, visit);
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      walk(value, state, visit);
    }
  }
}

function collectVisibleStrings(source, filePath) {
  const ast = parse(source, {
    filePath,
    sourceType: "module",
    ecmaVersion: "latest",
    ecmaFeatures: { jsx: true },
  });
  const strings = [];
  walk(ast, { zhLocaleBranch: false }, (node, state) => {
    if (state.zhLocaleBranch) return;
    if (node.type === "Literal" && typeof node.value === "string") strings.push(node.value);
    if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
      strings.push(node.quasis.map((quasi) => quasi.value.raw).join(""));
    }
    if (node.type === "JSXText") strings.push(node.value);
  });
  return strings;
}

for (const root of roots) {
  for (const filePath of collect(root)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const term of forbiddenTerms) {
      if (collectVisibleStrings(source, filePath).some((value) => value.includes(term))) {
        violations.push(`${filePath}: ${term}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Product UI exposes implementation or AI reasoning language:\n" + violations.join("\n"));
  process.exit(1);
}

console.log(`[PASS] product-language boundary: scanned ${roots.join(", ")} with ${forbiddenTerms.length} forbidden implementation phrases`);
