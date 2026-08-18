import { readFile } from "node:fs/promises";

const action = await readFile("src/app/actions.ts", "utf8");
const form = await readFile("src/components/client-form.tsx", "utf8");
const createPage = await readFile("src/app/clients/new/page.tsx", "utf8");
const editPage = await readFile("src/app/clients/[id]/edit/page.tsx", "utf8");
const detailPage = await readFile("src/app/clients/[id]/page.tsx", "utf8");
const failures = [];

function requireText(source, text, description) {
  if (!source.includes(text)) failures.push(description);
}

function forbidText(source, text, description) {
  if (source.includes(text)) failures.push(description);
}

requireText(form, 'basic: "基本情報"', "form must keep the basic information group");
requireText(form, 'needs: "需求条件"', "form must keep the needs group");
requireText(form, 'management: "顧客管理"', "form must keep the customer management group");
requireText(form, 'legal: "契約・法定情報"', "form must keep the legal group");
requireText(form, 'notes: "備考"', "form must keep the notes group");
requireText(form, 'setValues(state.values)', "server validation errors must restore submitted values");
requireText(form, 'role="alert"', "form must expose one focusable error summary");
requireText(form, 'aria-describedby', "field errors must be associated with fields");
requireText(form, 'onCompositionStart', "IME composition guard must exist as code mechanism");
if ((form.match(/<button type="submit"/g) ?? []).length !== 1) failures.push("complete form must have exactly one submit button");
forbidText(form, "afterSave", "complete form must not expose the old second submit flow");

forbidText(createPage, "client-form-template", "new page must not import template helpers");
forbidText(createPage, "client-intake-parser", "new page must not import memo parser");
forbidText(createPage, "confidence", "new page must not show confidence UI");
forbidText(createPage, "import-center", "new page must not treat import-center as returnTo");
requireText(createPage, 'stage: "lead"', "create page must seed only the lead stage");
requireText(editPage, "updateClientProfileAction", "edit page must use the structured update action");
requireText(editPage, "normalizeReturnTo", "edit page must validate returnTo before rendering");

const returnToStart = action.indexOf("function safeClientReturnTo");
const returnToEnd = action.indexOf("async function persistClientForm", returnToStart);
const returnTo = action.slice(returnToStart, returnToEnd);
requireText(returnTo, 'parsed.pathname === "/clients"', "actions must whitelist the client list return path");
requireText(returnTo, 'parsed.pathname === "/organize-center"', "actions must whitelist the approved organize entry");
forbidText(returnTo, "/import-center", "actions must reject import-center as a form return path");
requireText(action, "export async function createClient(formData: FormData)", "quick create compatibility wrapper must remain");
requireText(action, "await persistClientForm(formData, \"create\", undefined, true)", "quick create must reuse the shared persistence core");
requireText(action, "parsed <= 0", "budget zero and negative values must be rejected server-side");
requireText(action, "budgetMin > budgetMax", "budget bounds must be validated server-side");
requireText(action, 'redirect(`/clients/${client.id}?flash=client_created`)', "create must redirect with the client_created feedback code");
requireText(detailPage, "client_created", "client detail must map the creation feedback code");
requireText(detailPage, "顧客を作成しました。", "client detail must include the Japanese creation feedback");
requireText(detailPage, "客户已创建。", "client detail must include the Chinese creation feedback");
requireText(detailPage, "고객을 생성했습니다.", "client detail must include the Korean creation feedback");

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("TASK-032 client Responsive Form contract checks passed (groups, validation, errors, returnTo, and boundaries).");
