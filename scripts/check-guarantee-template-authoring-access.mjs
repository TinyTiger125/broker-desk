#!/usr/bin/env node
import { readFileSync } from "node:fs";

const actions = readFileSync("src/app/actions.ts", "utf8");
const preview = readFileSync("src/app/guarantee-applications/friends-guarantee/preview/preview-page-content.tsx", "utf8");
const failures = [];

const actionStart = actions.indexOf("async function saveGuaranteeApplicationPreviewWithScope(");
const actionEnd = actions.indexOf("\nfunction parsePrice", actionStart);
const action = actions.slice(actionStart, actionEnd);
if (actionStart < 0 || actionEnd < 0) failures.push("template save action boundary not found");
if (!action.includes('saveMode === "template" ? {} : { permission: "output.update_draft" }')) {
  failures.push("official template save still depends on tenant output.update_draft capability");
}
if (!action.includes("if (saveMode === \"template\") await requirePlatformOwnerSession();")) {
  failures.push("official template save is missing the platform-owner guard");
}
if (!action.includes('saveMode === "case" && caseId ? await requireWritableCase(session, caseId) : null')) {
  failures.push("official template save still resolves a hidden caseId before the template scope");
}
if (action.includes('assertTenantPermission(session, "template.edit_draft")') || action.includes('assertTenantPermission(session, "template.publish")')) {
  failures.push("official template save still applies tenant template permissions");
}
if (!action.includes('flash=template_layout_forbidden')) failures.push("permission denial does not return a friendly editor flash");
if (!preview.includes('requireTenantSession(isTemplateAuthoring ? {} : { permission: "output.preview" })')) {
  failures.push("authoring GET still depends on tenant output.preview capability");
}
if (!preview.includes("PlatformSessionError") || !preview.includes("プラットフォーム管理者権限が必要です")) {
  failures.push("non-owner authoring GET lacks a friendly platform-owner denial");
}
if (!preview.includes("getLocale") || !preview.includes("当前账号没有保存官方模板的权限")) {
  failures.push("permission denial copy is not connected to the locale system");
}
if (!preview.includes("template_layout_forbidden")) failures.push("editor does not render the permission-denied feedback");

if (failures.length) {
  console.error("Guarantee template authoring access contract failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Guarantee template authoring access contract passed.");
