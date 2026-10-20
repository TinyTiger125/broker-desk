import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const actionsSource = fs.readFileSync("src/app/actions.ts", "utf8");
const excelStart = actionsSource.indexOf("export async function uploadAndParseExcelAction");
const identityStart = actionsSource.indexOf("export async function uploadAndParseIdentityDocumentAction");
const reviewStart = actionsSource.indexOf("export async function saveExtractionReviewAction", identityStart);
assert.ok(excelStart >= 0 && identityStart > excelStart && reviewStart > identityStart, "upload actions must remain present");

const extractedActions = [
  actionsSource.slice(excelStart, identityStart),
  actionsSource.slice(identityStart, reviewStart),
].join("\n").replace(/^export /gm, "");

const compiled = ts.transpileModule(
  `
    ${extractedActions}
    module.exports = { uploadAndParseExcelAction, uploadAndParseIdentityDocumentAction };
  `,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const FileCtor = globalThis.File;
assert.ok(FileCtor, "the test runtime must expose File");

const state = {
  mode: "pass",
  sessionCalls: 0,
  writableCaseCalls: [],
  excelQueueCalls: [],
  identityQueueCalls: [],
  revalidatedPaths: [],
};

class ProductionReadinessError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProductionReadinessError";
    this.code = code;
  }
}

class RedirectSignal extends Error {
  constructor(url) {
    super(`redirect:${url}`);
    this.name = "RedirectSignal";
    this.url = url;
  }
}

function assertProductionImportWorkerReady() {
  if (state.mode === "fail-worker") {
    throw new ProductionReadinessError("production_import_worker_required");
  }
}

function assertProductionDocumentReaderReady() {
  if (state.mode === "fail-reader") {
    throw new ProductionReadinessError("production_document_reader_required");
  }
}

async function requireTenantSession() {
  state.sessionCalls += 1;
  return { user: { id: "user-1" }, tenant: { id: "tenant-1" } };
}

async function requireWritableCase(_session, caseId) {
  state.writableCaseCalls.push(caseId);
}

async function queueExcelImportSource(input) {
  state.excelQueueCalls.push(input);
  return { ok: true, jobId: "excel-job-1" };
}

async function queueIdentityImportSources(input) {
  state.identityQueueCalls.push(input);
  return { ok: true, jobIds: ["identity-job-1"] };
}

function redirect(url) {
  throw new RedirectSignal(url);
}

function revalidatePath(path) {
  state.revalidatedPaths.push(path);
}

const compiledModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: compiledModule,
  exports: compiledModule.exports,
  assertProductionImportWorkerReady,
  assertProductionDocumentReaderReady,
  ProductionReadinessError,
  requireTenantSession,
  requireWritableCase,
  queueExcelImportSource,
  queueIdentityImportSources,
  redirect,
  revalidatePath,
  File: FileCtor,
  URLSearchParams,
  encodeURIComponent,
});

const { uploadAndParseExcelAction, uploadAndParseIdentityDocumentAction } = compiledModule.exports;
assert.equal(typeof uploadAndParseExcelAction, "function");
assert.equal(typeof uploadAndParseIdentityDocumentAction, "function");

function formData(fields = {}, files = []) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  for (const [key, file] of files) form.append(key, file);
  return form;
}

async function expectRedirect(action, form, expectedUrl) {
  await assert.rejects(action(form), (error) => {
    assert.equal(error?.name, "RedirectSignal");
    assert.equal(error?.url, expectedUrl);
    return true;
  });
}

function resetState(mode) {
  state.mode = mode;
  state.sessionCalls = 0;
  state.writableCaseCalls = [];
  state.excelQueueCalls = [];
  state.identityQueueCalls = [];
  state.revalidatedPaths = [];
}

const excelFile = new File(["PK\\x03\\x04"], "sample.xlsx", {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
const identityFile = new File(["%PDF-1.7"], "identity.pdf", { type: "application/pdf" });

resetState("fail-worker");
await expectRedirect(
  uploadAndParseExcelAction,
  formData({ object: "case" }, [["excelFile", excelFile]]),
  "/import-center?flash=import_service_unavailable&object=case",
);
assert.equal(state.sessionCalls, 0, "worker guard failure must happen before session validation");
assert.equal(state.excelQueueCalls.length, 0, "worker guard failure must not queue Excel input");

resetState("fail-reader");
await expectRedirect(
  uploadAndParseIdentityDocumentAction,
  formData({ object: "person" }, [["identityDocumentFile", identityFile]]),
  "/import-center?flash=import_service_unavailable&object=person",
);
assert.equal(state.sessionCalls, 0, "reader guard failure must happen before session validation");
assert.equal(state.identityQueueCalls.length, 0, "reader guard failure must not queue identity input");

resetState("fail-worker");
await expectRedirect(
  uploadAndParseExcelAction,
  formData({ targetCaseId: "case-42", uploadContext: "case", object: "case" }, [["excelFile", excelFile]]),
  "/cases/case-42?flash=import_service_unavailable",
);
assert.equal(state.sessionCalls, 0, "case-context guard failure must happen before session validation");
assert.equal(state.excelQueueCalls.length, 0, "case-context guard failure must not queue Excel input");
assert.equal(state.writableCaseCalls.length, 0, "case-context guard failure must not check case permissions");

resetState("pass");
await expectRedirect(
  uploadAndParseExcelAction,
  formData({ object: "property" }),
  "/import-center?flash=excel_upload_missing&object=property#source-upload",
);
assert.equal(state.excelQueueCalls.length, 0, "missing-file validation must not queue input");

resetState("pass");
await expectRedirect(
  uploadAndParseExcelAction,
  formData({ object: "property" }, [["excelFile", excelFile]]),
  "/import-center?xlsxJob=excel-job-1&flash=input_extraction_queued",
);
assert.equal(state.sessionCalls, 1, "normal Excel path must validate the session");
assert.equal(state.excelQueueCalls.length, 1, "normal Excel path must queue input");
assert.equal(state.excelQueueCalls[0].file.name, "sample.xlsx");
assert.deepEqual(state.revalidatedPaths, ["/import-center"]);

resetState("pass");
await expectRedirect(
  uploadAndParseIdentityDocumentAction,
  formData({ object: "person" }, [["identityDocumentFile", identityFile]]),
  "/import-center?xlsxJob=identity-job-1&flash=input_extraction_queued",
);
assert.equal(state.sessionCalls, 1, "normal identity path must validate the session");
assert.equal(state.identityQueueCalls.length, 1, "normal identity path must queue input");
assert.equal(state.identityQueueCalls[0].files[0].name, "identity.pdf");
assert.deepEqual(state.revalidatedPaths, ["/import-center"]);

console.log("upload readiness Server Action behavior checks passed (guard redirects, object/case context, no queue before readiness, normal queue paths)");
