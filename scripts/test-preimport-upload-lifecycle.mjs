#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(read("src/lib/preimport-upload-lifecycle.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { mayDeletePreimportUpload, mayStartPropertyImport } = module.exports;
const owner = { role: "tenant_owner", capability: "company_owner", status: "active" };
const job = {
  sourceType: "excel", targetEntity: "properties", status: "mapped",
  uploadLifecycleVersion: 1, notes: JSON.stringify({ kind: "property_row_import", rows: [] }),
};
assert.equal(mayDeletePreimportUpload(job, owner), true);
assert.equal(mayDeletePreimportUpload(job, { role: "manager", capability: "company_form_admin", status: "active" }), true);
for (const membership of [
  { role: "broker", capability: "ordinary_member", status: "active" },
  { ...owner, role: "platform_owner" }, { ...owner, role: "broker" },
  { ...owner, status: "invited" }, { ...owner, capability: undefined },
]) assert.equal(mayDeletePreimportUpload(job, membership), false);
for (const change of [
  { uploadLifecycleVersion: undefined }, { uploadLifecycleVersion: 0 }, { uploadLifecycleVersion: 2 },
  { finalImportStartedAt: new Date() }, { status: "queued" }, { status: "processing" },
  { sourceReferencedAt: new Date() },
  { status: "completed" }, { status: "failed" }, { sourceType: "pdf" },
  { targetEntity: "parties" }, { notes: "malformed" }, { notes: "{}" },
  { notes: JSON.stringify({ kind: "input_file_extraction" }) },
  { notes: JSON.stringify({ kind: "property_row_import", targetCaseId: "case-other" }) },
  { notes: JSON.stringify({ kind: "property_row_import", targetCaseId: null }) },
]) assert.equal(mayDeletePreimportUpload({ ...job, ...change }, owner), false);
assert.equal(mayStartPropertyImport(job), true);
assert.equal(mayStartPropertyImport({ ...job, finalImportStartedAt: new Date() }), false);
assert.equal(mayStartPropertyImport({ ...job, status: "completed" }), false);
assert.equal(mayStartPropertyImport({ ...job, notes: JSON.stringify({ kind: "property_row_import", targetCaseId: "case-existing" }) }), true);
assert.equal(mayStartPropertyImport({ ...job, uploadLifecycleVersion: 0, notes: JSON.stringify({ rows: [] }) }), true);

// These are source wiring contracts, not substitutes for PostgreSQL concurrency/RLS evidence.
const queue = read("src/lib/excel-import-queue.ts");
assert.match(queue, /uploadLifecycleVersion:\s*1/, "new upload must stamp V1 at creation");
const actions = read("src/app/actions.ts");
const start = actions.indexOf("export async function executePropertyImportAction");
const body = actions.slice(start, actions.indexOf("export async function", start + 30));
assert.ok(body.indexOf("await preparePropertyRowImport(") > 0, "final import must prepare mapping and claim persistently");
assert.ok(body.indexOf("await preparePropertyRowImport(") < body.indexOf("await addProperty("), "atomic prepare precedes first business write");
assert.match(body, /if\s*\(!prepared\.claimed\)/, "a lost atomic claim must stop business writes");
assert.match(body, /allowFinalImportCompletion:\s*true/, "the final execution write must be the only post-claim mapping update");
assert.doesNotMatch(read("src/app/import-center/actions.ts"), /deletePrivateAttachmentForTenant/, "delete must not split into independent writes");

function executeModule(source, globals = {}, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, FormData, ...globals, require(name) {
    assert.ok(name in dependencies, `unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return module.exports;
}
const parsed = ts.createSourceFile("actions.ts", actions, ts.ScriptTarget.Latest, true);
const finalFunction = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "executePropertyImportAction").getText(parsed);
// The action is extracted below to isolate its claim/write ordering. Inject
// the same pure import-row helpers used by production and a minimal visibility
// context/list stub; otherwise a missing imported symbol would be reported as
// a false zero-write concurrency failure before addProperty is reached.
const importRowPolicyModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(read("src/lib/import-row-policy.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: importRowPolicyModule, exports: importRowPolicyModule.exports });
const importRowPolicy = importRowPolicyModule.exports;
for (const scenario of ["claim-denied", "success", "write-failed"]) {
  let claimed = false;
  let propertyWrites = 0;
  let status = "mapped";
  const fixture = { ...job, id: "test-job", notes: JSON.stringify({ kind: "property_row_import", rows: [{ name: "Synthetic property", price: 1 }] }) };
  const { executePropertyImportAction } = executeModule(finalFunction, {
    requireTenantSession: async () => ({ user: { id: "owner" }, tenant: { id: "tenant-a" } }),
    getLocale: async () => "ja", rejectForbiddenRecordInput: async () => {},
    listImportJobs: async () => [fixture], tr: (_locale, c) => c.ja,
    listPropertiesForContext: async () => [],
    createRequestContext: (session) => ({ tenantId: session.tenant.id, userId: session.user.id }),
    ...importRowPolicy,
    preparePropertyRowImport: async () => {
      if (scenario === "claim-denied" || claimed) return { job: { ...fixture, status: "mapped" }, claimed: false };
      claimed = true; status = "processing";
      return { job: { ...fixture, status: "processing", finalImportStartedAt: new Date() }, claimed: true };
    },
    updateImportJobMapping: async (input) => { status = input.status; },
    addProperty: async () => {
      assert.equal(claimed, true, "business write before claim");
      propertyWrites++;
      if (scenario === "write-failed") throw new Error("synthetic write failure");
    },
    parsePrice: (value) => Number(value ?? 0), createImportValidationIssue: (value) => value,
    buildImportValidationMessage: () => "test validation", addAuditLog: async () => {},
    revalidatePath: () => {}, withFlash: (path) => path,
    redirect: () => { throw new Error("test-redirect"); },
  });
  const input = new FormData(); input.set("jobId", "test-job");
  for (const [source, target] of [["name", "name"], ["price", "listing_price"]]) {
    input.append("sourceCol", source); input.append("targetField", target);
  }
  await Promise.allSettled([executePropertyImportAction(input), executePropertyImportAction(input)]);
  assert.equal(propertyWrites, scenario === "claim-denied" ? 0 : 1, `${scenario}: concurrent action must not duplicate writes`);
  if (scenario !== "claim-denied") {
    assert.equal(claimed, true);
    assert.equal(status, scenario === "write-failed" ? "failed" : "completed");
  }
}

// The memory repository must reject stale mapping/retry writes after the
// durable final-import marker, while allowing the execution completion write
// to preserve the winning mapping and only update its result message/status.
{
  const memorySourceFile = ts.createSourceFile("data.memory.ts", read("src/lib/data.memory.ts"), ts.ScriptTarget.Latest, true);
  const memoryFunction = (name) => memorySourceFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(memorySourceFile);
  const memoryJob = {
    id: "memory-final-claim", tenantId: "tenant-a", userId: "owner", sourceType: "excel", title: "Synthetic",
    targetEntity: "properties", status: "mapped", notes: JSON.stringify({ kind: "property_row_import", rows: [] }),
    uploadLifecycleVersion: 1, attemptCount: 0, createdAt: new Date(), updatedAt: new Date(),
  };
  const memoryDb = { importJobs: [memoryJob], tenants: [{ id: "tenant-a", status: "active" }], tenantMemberships: [{ tenantId: "tenant-a", userId: "owner", status: "active" }] };
  const memory = executeModule(
    memoryFunction("preparePropertyRowImport") + "\n" + memoryFunction("updateImportJobMapping") + "\n" + memoryFunction("isValidImportStatusTransition"),
    {
      db: memoryDb,
      resolveTenantId: (value) => value ?? "tenant-a",
      deriveTenantServiceState: () => ({ status: "operational" }),
      isTenantServiceOperational: () => true,
      mayStartPropertyImport: () => true,
    },
  );
  const memoryClaim = await memory.preparePropertyRowImport({
    tenantId: "tenant-a", userId: "owner", jobId: memoryJob.id,
    mappingJson: { winning_name: "name" }, validationMessage: "winning mapping",
  });
  assert.equal(memoryClaim.claimed, true);
  const staleMemoryWrite = await memory.updateImportJobMapping({
    tenantId: "tenant-a", userId: "owner", jobId: memoryJob.id,
    mappingJson: { stale_name: "name" }, validationMessage: "stale", status: "mapped",
  });
  assert.equal(staleMemoryWrite, null, "memory must reject a stale mapping after final claim");
  const memoryCompletion = await memory.updateImportJobMapping({
    tenantId: "tenant-a", userId: "owner", jobId: memoryJob.id,
    mappingJson: { stale_name: "name" }, validationMessage: "completed", status: "completed",
    allowFinalImportCompletion: true,
  });
  assert.equal(memoryCompletion?.status, "completed");
  assert.equal(JSON.stringify(memoryCompletion?.mappingJson), JSON.stringify({ winning_name: "name" }), "completion must preserve winning mapping");
}
console.log("[PASS] memory repository rejects post-claim manual/auto/retry mapping writes and preserves final mapping");

for (const role of ["ordinary_member", "platform_owner", "company_owner", "company_form_admin"]) {
  let rpcCalls = 0;
  const membership = role === "company_owner" ? owner : role === "company_form_admin"
    ? { status: "active", role: "manager", capability: role }
    : { status: "active", role: role === "platform_owner" ? role : "broker", capability: "ordinary_member" };
  const { deletePreimportUploadAction } = executeModule(read("src/app/import-center/actions.ts"), {}, {
    "next/cache": { revalidatePath() {} }, "next/navigation": { redirect() { throw new Error("test-redirect"); } },
    "next/dist/client/components/redirect-error": { isRedirectError: () => false },
    "@/lib/data": { deletePreimportPropertyUpload: async (input) => {
      assert.equal(input.tenantId, "tenant-a"); assert.equal(input.userId, "owner"); rpcCalls++; return false;
    } },
    "@/lib/locale": { getLocale: async () => "ja" },
    "@/lib/tenant-session": { requireTenantSession: async () => ({ membership, tenant: { id: "tenant-a" }, user: { id: "owner" } }) },
  });
  const input = new FormData(); input.set("jobId", "test-job"); input.set("confirm", "delete-original");
  input.set("tenantId", "tenant-victim"); input.set("userId", "victim");
  const result = await deletePreimportUploadAction({ error: "", attempt: 2 }, input);
  assert.equal(result.attempt, 3); assert.ok(result.error);
  assert.equal(rpcCalls, role === "company_owner" || role === "company_form_admin" ? 1 : 0);
  input.delete("confirm");
  await deletePreimportUploadAction(result, input);
  assert.equal(rpcCalls, role === "company_owner" || role === "company_form_admin" ? 1 : 0, "missing confirmation cannot invoke RPC");
}
console.log("[PASS] pre-import upload policy behavior and action wiring; DB/browser gates remain separate");

for (const scenario of ["already-started", "already-completed", "claim-during-parse", "parse-error-after-claim"]) {
  const expectedState = scenario === "already-completed" ? "completed" : "processing";
  let state = expectedState;
  let started = scenario === "already-started" || scenario === "already-completed";
  let writes = 0;
  let audits = 0;
  const processor = executeModule(read("src/lib/excel-import-processor.ts"), { Buffer }, {
    "node:crypto": { createHash: () => ({ update() { return this; }, digest: () => "test-hash" }) },
    "@/lib/object-import-processor-adapter": {
      ensureObjectImportTask: async () => null,
      persistObjectImportJobExtraction: async () => [],
      markObjectImportJobFailed: async () => null,
    },
    "@/lib/object-import-contract": { parseObjectImportNotes: () => null },
    "@/lib/data": {
      listImportJobs: async () => [{ ...job, id: "test-job", status: state, finalImportStartedAt: started ? new Date() : undefined }],
      listAttachments: async () => [{ id: "test-source", storagePath: "postgres-private://test/source", fileName: "test.xlsx" }],
      readPrivateAttachmentContent: async () => Buffer.from("synthetic workbook"),
      updateImportJobExecution: async (input) => {
        if (input.beforeFinalImport && started) return null;
        writes++; state = input.status; return { status: state };
      },
      updateImportJobMapping: async (input) => {
        if (input.beforeFinalImport && started) return null;
        if (started) throw new Error("started import cannot remap");
        writes++; state = input.status; return { status: state };
      },
      addAuditLog: async () => { audits++; },
    },
    "@/lib/excel-workbook": {
      validateExcelZip: async () => {}, MAX_EXCEL_SHEETS: 5, MAX_EXCEL_CELLS: 100,
      readExcelWorkbook: async () => {
        started = true;
        if (scenario === "parse-error-after-claim") throw new Error("synthetic parser failure");
        return { worksheets: [{ data: [["name"], ["synthetic row"]] }] };
      },
      getWorkbookSheetNames: () => ["sheet"], countWorkbookCells: () => 2,
      worksheetToRows: (worksheet) => worksheet.data,
    },
    "@/lib/input-file-extractor": { extractInputFileFromWorkbook: () => ({ extractionStatus: "unknown", fields: [] }) },
    "@/lib/import-mapping": { suggestImportMapping: () => ({}) },
    "@/lib/import-row-policy": { normalizeImportCellValue: (value) => String(value ?? "").trim() },
    "@/lib/attachment-storage": { isLocalPrivateStoragePath: () => false, isPostgresPrivateStoragePath: () => true },
  });
  const results = await Promise.all([1, 2].map(() => processor.processExcelImportJob({ tenantId: "tenant-a", userId: "owner", jobId: "test-job" })));
  for (const result of results) assert.equal(result.error, "import_execution_started", scenario);
  assert.equal(state, expectedState, `${scenario}: stale extractor must not corrupt final-import state`);
  assert.equal(writes, 0, scenario); assert.equal(audits, 0, scenario);
}
console.log("[PASS] actual processor interleavings (mocked repository I/O); PostgreSQL concurrency remains unverified");

const repo = ts.createSourceFile("data.postgres.ts", read("src/lib/data.postgres.ts"), ts.ScriptTarget.Latest, true);
const functionText = (name) => repo.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(repo);
for (const name of ["updateImportJobMapping", "updateImportJobExecution"]) {
  let queries = 0;
  const { [name]: update } = executeModule(functionText(name) + "\n" + functionText("isValidImportStatusTransition"), {
    ensureSchema: async () => {}, resolveTenantId: (value) => value,
    mapImportJob: () => { throw new Error("late update must not return a job"); },
    getPool: () => ({ query: async (sql, params) => {
      queries++;
      if (sql.startsWith("SELECT")) return { rows: [{ status: "processing", final_import_started_at: null }] };
      // Emulate the atomic UPDATE observing a claim committed after SELECT.
      const guard = name === "updateImportJobMapping"
        ? sql.match(/AND \(final_import_started_at IS NULL OR \$(\d+)::boolean\)/)
        : sql.match(/AND \(NOT \$(\d+)::boolean OR final_import_started_at IS NULL\)/);
      assert.ok(guard, `${name}: missing SQL compare-and-write guard`);
      assert.equal(params[Number(guard[1]) - 1], name === "updateImportJobMapping" ? false : true, `${name}: guard parameter not bound`);
      assert.equal(params[0], "test-job"); assert.equal(params[1], "owner");
      return { rows: [] };
    } }),
  });
  const result = await update({ tenantId: "tenant-a", userId: "owner", jobId: "test-job", mappingJson: {}, status: name === "updateImportJobMapping" ? "mapped" : "failed", beforeFinalImport: true });
  assert.equal(result, null); assert.equal(queries, 2);
}
console.log("[PASS] actual repository late-write SQL binding; real PostgreSQL execution remains unverified");

// Explicit opt-in; creates a fresh local-only cluster, never reads a DATABASE_URL.
// The real migration and existing member lifecycle functions execute against
// synthetic fixtures. Nothing connects to Staging/Production or a shared database.
// Opt-in real Chromium/React interaction test. The server action alone is a
// deferred synthetic failure; no product host, authentication or data is used.
if (process.argv.includes("--browser")) {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { WebSocket } = require("next/dist/compiled/ws");
  const webpackPackage = require("next/dist/compiled/webpack/webpack");
  const { webpack } = webpackPackage;
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:http");
  const { join, resolve } = await import("node:path");
  const root = fs.mkdtempSync("/private/tmp/preimport-focus-test-");
  let browser, server, socket;
  try {
    const source = read("src/components/preimport-upload-delete.tsx")
      .replace(
        'import { deletePreimportUploadAction } from "@/app/import-center/actions";',
        `const deletePreimportUploadAction = async () => {
        window.__submits = (window.__submits || 0) + 1;
        return new Promise(resolve => { window.__fail = () => resolve({ error: "Synthetic failure", attempt: window.__submits }); });
      };`,
      )
      .replace(
        'import { Button } from "@/components/ui-foundation";',
        'const Button = ({ children, loading = false, disabled, ...props }) => <button {...props} disabled={disabled || loading} aria-busy={loading || undefined}>{children}</button>;',
      );
    const entry = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText + '\nimport {createRoot} from "react-dom/client"; import {createElement} from "react"; createRoot(document.getElementById("root")).render(createElement(PreimportUploadDelete,{jobId:"synthetic-local-only",locale:"ja"}));';
    await new Promise((done, fail) => {
      const compiler = webpack({ mode: "development", devtool: false, entry: `data:text/javascript,${encodeURIComponent(entry)}`,
        output: { path: root, filename: "bundle.js" }, resolve: { alias: { "@": resolve("src") }, extensions: [".tsx", ".ts", ".jsx", ".js", ".json"], modules: [resolve("node_modules")] } });
      compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? fail(error || new Error(stats.toString({ all: false, errors: true }))) : done()));
    });
    server = createServer((request, response) => {
      response.setHeader("Content-Type", request.url === "/bundle.js" ? "text/javascript" : "text/html");
      response.end(request.url === "/bundle.js" ? fs.readFileSync(join(root, "bundle.js")) : '<div id="root"></div><script src="/bundle.js"></script>');
    });
    await new Promise(done => server.listen(0, "127.0.0.1", done));
    browser = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${join(root, "profile")}`, "about:blank"], { stdio: "ignore" });
    const until = async (check, label) => {
      for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(done => setTimeout(done, 50)); }
      throw new Error(`local browser timeout: ${label}`);
    };
    await until(() => fs.existsSync(join(root, "profile", "DevToolsActivePort")), "startup");
    const port = Number(fs.readFileSync(join(root, "profile", "DevToolsActivePort"), "utf8").split("\n")[0]);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find(item => item.type === "page" && item.url === "about:blank");
    assert.ok(target, "only the isolated blank target may be controlled");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(done => socket.addEventListener("open", done, { once: true }));
    let id = 0; const pending = new Map();
    socket.addEventListener("message", event => { const result = JSON.parse(event.data); const request = pending.get(result.id); if (request) { pending.delete(result.id); result.error ? request.reject(new Error(result.error.message)) : request.resolve(result.result); } });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
    const evaluate = async expression => { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); assert.equal(result.exceptionDetails, undefined); return result.result.value; };
    const press = async (key, code, keyCode) => {
      await send("Input.dispatchKeyEvent", { type: key === "Tab" ? "rawKeyDown" : "keyDown", key, code, windowsVirtualKeyCode: keyCode, ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : key === " " ? { text: " ", unmodifiedText: " " } : {}) });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
    };
    await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
    await until(() => evaluate('!!document.querySelector("summary")'), "render");
    for (let attempt = 1; attempt <= 2; attempt++) {
      await evaluate('document.querySelector("summary").focus()');
      if (!await evaluate('document.querySelector("details").open')) await press("Enter", "Enter", 13);
      assert.equal(await evaluate('document.querySelector("details").open'), true, "keyboard opens details");
      await press("Tab", "Tab", 9);
      assert.equal(await evaluate('document.activeElement.type'), "checkbox", `keyboard reaches confirmation: ${await evaluate('document.activeElement.outerHTML')}`);
      if (!await evaluate('document.activeElement.checked')) await press(" ", "Space", 32);
      await press("Tab", "Tab", 9);
      assert.equal(await evaluate('document.activeElement.type'), "submit");
      await press("Enter", "Enter", 13);
      await until(() => evaluate(`window.__submits === ${attempt} && document.querySelector("button").disabled`), "pending");
      await evaluate('document.querySelector("summary").focus()');
      await press("Enter", "Enter", 13);
      assert.equal(await evaluate('document.querySelector("details").open'), false, "native keyboard collapse while waiting");
      await evaluate('window.__fail()');
      await until(() => evaluate('!document.querySelector("button").disabled'), "failure returns");
      assert.equal(await evaluate('document.querySelector("details").open'), true, "failure must reopen confirmation before focus");
      assert.equal(await evaluate('document.activeElement === document.querySelector("[role=alert]")'), true, "visible error receives focus, including repeated same error");
      assert.equal(await evaluate('document.activeElement.getClientRects().length > 0'), true);
      assert.equal(await evaluate('document.activeElement.getAttribute("aria-live")'), "assertive");
      assert.equal(await evaluate('document.querySelector("input[name=jobId]").value'), "synthetic-local-only");
      assert.equal(await evaluate('window.__submits'), attempt, "no automatic resubmission");
    }
    console.log("[PASS] actual React + isolated Chromium keyboard: open/confirm/submit/collapse/fail/reopen/visible alert focus; same-error retry and no automatic submission");
  } finally {
    socket?.close();
    if (browser && browser.exitCode === null) { const exited = new Promise(done => browser.once("exit", done)); browser.kill("SIGTERM"); await exited; }
    if (server) await new Promise(done => server.close(done));
    fs.rmSync(root, { recursive: true });
  }
}

if (process.argv.includes("--postgres")) {
  const { execFileSync } = await import("node:child_process");
  const { join } = await import("node:path");
  const { default: pg } = await import("pg");
  const bin = "/opt/homebrew/opt/postgresql@16/bin";
  assert.ok(fs.existsSync(join(bin, "initdb")), "local PostgreSQL 16 is required for --postgres");
  const root = fs.mkdtempSync("/private/tmp/brokerdesk-preimport-pg-");
  const data = join(root, "data");
  const clients = [];
  let running = false;
  let succeeded = false;
  const run = (name, args) => execFileSync(join(bin, name), args, { encoding: "utf8", stdio: "pipe", env: { PATH: bin + ":/usr/bin:/bin", LANG: "C", HOME: process.env.HOME } });
  const connect = async (user, database = "preimport_lifecycle_test") => {
    const client = new pg.Client({ host: root, port: 55439, database, user, password: "", application_name: "preimport-local-test" });
    // Teardown may disconnect idle clients after an assertion has already failed.
    client.on("error", () => {});
    await client.connect(); clients.push(client);
    await client.query("SET statement_timeout = '6s'");
    return client;
  };
  try {
    run("initdb", ["-D", data, "-U", "qa_initializer", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=reject"]);
    run("pg_ctl", ["-D", data, "-o", `-F -p 55439 -k ${root} -c listen_addresses='' -c unix_socket_permissions=0700`, "-l", join(root, "postgres.log"), "-w", "start"]);
    running = true;
    const control = await connect("qa_initializer", "postgres");
    // This role exists only inside the disposable cluster. The migration set
    // contains owner-qualified DDL for the production-shaped `postgres`
    // owner, while qa_initializer remains the local bootstrap superuser.
    await control.query("CREATE ROLE postgres NOLOGIN SUPERUSER CREATEDB CREATEROLE BYPASSRLS");
    await control.query("CREATE ROLE brokerdesk_admin LOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE brokerdesk_runtime LOGIN NOSUPERUSER NOBYPASSRLS");
    await control.query("GRANT postgres TO brokerdesk_admin WITH INHERIT FALSE, SET TRUE, ADMIN FALSE");
    await control.query("CREATE DATABASE preimport_lifecycle_test OWNER brokerdesk_admin");
    const admin = await connect("brokerdesk_admin");
    await admin.query("CREATE TABLE broker_desk_schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW())");
    for (const name of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) {
      await admin.query(read(`db/migrations/${name}`));
    }
    const fixture = await connect("qa_initializer");
    assert.equal((await fixture.query("SELECT current_database() AS name")).rows[0].name, "preimport_lifecycle_test");
    await fixture.query(`INSERT INTO users(id,name,email,password_hash,external_auth_subject) VALUES
      ('local-actor','Synthetic actor','actor@example.invalid','non-login-fixture','local-actor-subject'),
      ('local-owner','Synthetic owner','owner@example.invalid','non-login-fixture','local-owner-subject');
      INSERT INTO tenants(id,name,slug,status,purchased_seat_count) VALUES ('local-tenant','LOCAL SYNTHETIC','local-test','active',3),('local-platform','LOCAL PLATFORM','local-platform','active',1);
      INSERT INTO tenant_memberships(id,tenant_id,user_id,role,capability,status,invitation_status) VALUES
      ('local-member','local-tenant','local-actor','tenant_owner','company_owner','active','accepted'),
      ('local-owner-member','local-tenant','local-owner','tenant_owner','company_owner','active','accepted');`);
    await fixture.query("SELECT set_config('app.external_auth_subject','local-actor-subject',false)");
    const deleter = await connect("brokerdesk_runtime");
    const manager = await connect("brokerdesk_runtime");
    const blocker = await connect("qa_initializer");
    await deleter.query("SELECT set_config('app.external_auth_subject','local-actor-subject',false)");
    await manager.query("SELECT set_config('app.external_auth_subject','local-owner-subject',false)");
    const deletePid = (await deleter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const managerPid = (await manager.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

    // Exercise the real PostgreSQL prepare primitive with a deterministic
    // stale-view interleaving. A holds the row after the claim and before
    // commit; B arrives with an older mapping and must wait, then return the
    // already-processing row without overwriting A's mapping.
    const postgresTree = ts.createSourceFile("data.postgres.ts", read("src/lib/data.postgres.ts"), ts.ScriptTarget.Latest, true);
    const prepareSource = postgresTree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "preparePropertyRowImport")?.getText(postgresTree);
    assert.ok(prepareSource, "PostgreSQL prepare primitive must be exported");
    let firstPrepare = true;
    let firstClaimReached;
    let releaseFirstClaim;
    const firstClaimReachedPromise = new Promise((resolve) => { firstClaimReached = resolve; });
    const firstClaimReleasePromise = new Promise((resolve) => { releaseFirstClaim = resolve; });
    const prepareWithTransaction = async (fn) => {
      const client = await connect("brokerdesk_runtime");
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.external_auth_subject','local-actor-subject',true)");
      try {
        const result = await fn(client);
        if (firstPrepare) {
          firstPrepare = false;
          firstClaimReached();
          await firstClaimReleasePromise;
        }
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    };
    const { preparePropertyRowImport } = executeModule(prepareSource, {
      ensureSchema: async () => {},
      resolveTenantId: (value) => value,
      withTransaction: prepareWithTransaction,
      mapImportJob: (row) => ({
        id: String(row.id),
        status: String(row.status),
        finalImportStartedAt: row.final_import_started_at ? new Date(row.final_import_started_at) : undefined,
      }),
    });
    const prepareJobId = "local-prepare-interleaving";
    await fixture.query(
      "INSERT INTO import_jobs(id,tenant_id,user_id,source_type,title,target_entity,status,notes,upload_lifecycle_version) VALUES ($1,'local-tenant','local-actor','excel','Synthetic prepare','properties','queued',$2,1)",
      [prepareJobId, JSON.stringify({ kind: "property_row_import", rows: [{ name: "Prepared property", price: 1 }] })],
    );
    let bSettled = false;
    const prepareA = preparePropertyRowImport({
      tenantId: "local-tenant",
      userId: "local-actor",
      jobId: prepareJobId,
      mappingJson: { source_name: "name", source_price: "listing_price" },
      validationMessage: "mapping A",
    });
    await firstClaimReachedPromise;
    const prepareB = preparePropertyRowImport({
      tenantId: "local-tenant",
      userId: "local-actor",
      jobId: prepareJobId,
      mappingJson: { stale_name: "name", stale_price: "listing_price" },
      validationMessage: "stale mapping B",
    }).then((result) => { bSettled = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(bSettled, false, "stale mapping request must wait for the winning PostgreSQL row lock");
    releaseFirstClaim();
    const [preparedA, preparedB] = await Promise.all([prepareA, prepareB]);
    assert.equal(preparedA.claimed, true, "first prepare must claim the final import");
    assert.equal(preparedB.claimed, false, "stale second prepare must not claim or rewrite the job");
    const prepareState = (await fixture.query(
      "SELECT status, mapping_json, validation_message, final_import_started_at, attempt_count FROM import_jobs WHERE id=$1",
      [prepareJobId],
    )).rows[0];
    assert.equal(prepareState.status, "processing");
    assert.deepEqual(prepareState.mapping_json, { source_name: "name", source_price: "listing_price" });
    assert.equal(prepareState.validation_message, "mapping A");
    assert.ok(prepareState.final_import_started_at, "winning prepare must persist final_import_started_at");
    assert.equal(Number(prepareState.attempt_count), 0, "final-import prepare must not mutate the parser attempt_count");
    await fixture.query(
      `INSERT INTO properties (id,tenant_id,name,listing_price,created_by_user_id,current_owner_user_id,visibility_scope,owner_resolution_status)
       VALUES ('property-prepare-interleaving','local-tenant','Prepared property',1,'local-actor','local-actor','private','resolved')`,
    );
    await fixture.query(
      `INSERT INTO audit_logs (id,tenant_id,user_id,actor_id,action,target_type,target_id,message,context_json)
       VALUES ('audit-prepare-interleaving','local-tenant','local-actor','local-actor','import_job_completed','import_job',$1,'Synthetic property import completed','{}'::jsonb)`,
      [prepareJobId],
    );
    await fixture.query("UPDATE import_jobs SET status='completed', completed_at=NOW() WHERE id=$1", [prepareJobId]);
    assert.equal(Number((await fixture.query("SELECT COUNT(*) FROM properties WHERE tenant_id='local-tenant' AND id='property-prepare-interleaving'")).rows[0].count), 1, "winning claim permits one business property write");
    assert.equal(Number((await fixture.query("SELECT COUNT(*) FROM audit_logs WHERE tenant_id='local-tenant' AND target_id=$1 AND action='import_job_completed'", [prepareJobId])).rows[0].count), 1, "winning claim has one completion audit");
    console.log("[PASS] isolated PostgreSQL prepare CAS observation: stale mapping waited and final state stayed with A (business rows below are separate fixture writes)");

    // Exercise the actual legacy mapping actions against the real PostgreSQL
    // adapter after a final-import claim. These are intentionally extracted
    // from the production action source only to keep this script independent
    // of Next's server-action loader; their repository calls and SQL execute
    // against the disposable cluster above.
    const postgresUpdateSource = postgresTree.statements
      .find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "updateImportJobMapping")?.getText(postgresTree);
    const transitionSource = postgresTree.statements
      .find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "isValidImportStatusTransition")?.getText(postgresTree);
    assert.ok(postgresUpdateSource && transitionSource, "PostgreSQL mapping adapter source must be available");
    const mappingRuntime = await connect("brokerdesk_runtime");
    await mappingRuntime.query("SELECT set_config('app.external_auth_subject','local-actor-subject',false)");
    const { updateImportJobMapping: updateMappingAgainstPostgres } = executeModule(
      postgresUpdateSource + "\n" + transitionSource,
      {
        ensureSchema: async () => {},
        resolveTenantId: (value) => value,
        getPool: () => ({ query: (...args) => mappingRuntime.query(...args) }),
        mapImportJob: (row) => ({ id: String(row.id), status: String(row.status), title: String(row.title ?? "Synthetic") }),
      },
    );
    const actionTree = ts.createSourceFile("actions.ts", actions, ts.ScriptTarget.Latest, true);
    const actionSource = (name) => actionTree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)?.getText(actionTree);
    const actionNames = ["updateImportJobMappingAction", "autoMapImportJobAction", "retryImportJobAction"];
    for (const actionName of actionNames) assert.ok(actionSource(actionName), `${actionName} source must be available`);
    const actionSession = { user: { id: "local-actor" }, tenant: { id: "local-tenant" } };
    let actionSerial = 0;
    for (const actionName of actionNames) {
      const actionJobId = `local-action-claim-${++actionSerial}`;
      await fixture.query(
        "INSERT INTO import_jobs(id,tenant_id,user_id,source_type,title,target_entity,status,notes,mapping_json,upload_lifecycle_version) VALUES ($1,'local-tenant','local-actor','excel',$2,'properties','mapped',$3,$4::jsonb,1)",
        [actionJobId, `Synthetic ${actionName}`, JSON.stringify({ kind: "property_row_import", rows: [] }), JSON.stringify({ winning_name: "name" })],
      );
      const claim = await fixture.query("SELECT brokerdesk_private.claim_property_row_import('local-tenant',$1) AS claimed", [actionJobId]);
      assert.equal(claim.rows[0].claimed, true, `${actionName}: fixture job must be claimed before stale action`);
      const before = (await fixture.query(
        "SELECT status, mapping_json, validation_message, final_import_started_at FROM import_jobs WHERE id=$1",
        [actionJobId],
      )).rows[0];
      let auditCalls = 0;
      const commonActionDeps = {
        requireTenantSession: async () => actionSession,
        getLocale: async () => "ja",
        updateImportJobMapping: updateMappingAgainstPostgres,
        addAuditLog: async () => { auditCalls += 1; },
        revalidatePath: () => {},
        redirect: () => { throw new Error("test-redirect"); },
        tr: (_locale, copy) => copy.ja,
        createImportValidationIssue: (value) => value,
        buildImportValidationMessage: () => "stale action message",
        buildMappingFromLists: (sources, targets) => Object.fromEntries(sources.map((source, index) => [source, targets[index]]).filter(([, target]) => target)),
        validateImportMapping: () => ({ missingRequired: [], unknownTargets: [], summary: "Synthetic mapping", coveredRequiredCount: 1, requiredCount: 1 }),
        isImportTargetEntity: (value) => value === "properties",
        suggestImportMapping: () => ({ stale_name: "name" }),
        parseCommaList: (value) => String(value).split(",").map((item) => item.trim()).filter(Boolean),
        listImportJobs: async () => [{ id: actionJobId, title: `Synthetic ${actionName}`, status: "processing", finalImportStartedAt: new Date(), mappingJson: { winning_name: "name" }, notes: JSON.stringify({ kind: "property_row_import", rows: [] }) }],
      };
      const { [actionName]: action } = executeModule(actionSource(actionName), commonActionDeps, {});
      const input = new FormData();
      input.set("jobId", actionJobId);
      if (actionName === "updateImportJobMappingAction") {
        input.set("targetEntity", "properties");
        input.append("sourceColumn", "stale_name"); input.append("targetField", "name");
      } else if (actionName === "autoMapImportJobAction") {
        input.set("targetEntity", "properties"); input.set("sourceColumns", "stale_name");
      }
      await assert.rejects(action(input), /処理開始済み|再処理|見つかりません|test-redirect/);
      assert.equal(auditCalls, 0, `${actionName}: rejected stale write must not emit an audit`);
      const after = (await fixture.query(
        "SELECT status, mapping_json, validation_message, final_import_started_at FROM import_jobs WHERE id=$1",
        [actionJobId],
      )).rows[0];
      assert.equal(after.status, before.status, `${actionName}: status must remain processing`);
      assert.deepEqual(after.mapping_json, before.mapping_json, `${actionName}: winning mapping must remain unchanged`);
      assert.equal(after.validation_message, before.validation_message, `${actionName}: winning validation must remain unchanged`);
      assert.ok(after.final_import_started_at, `${actionName}: final claim marker must remain`);
    }
    console.log("[PASS] actual PostgreSQL legacy actions: manual mapping, auto mapping, and retry were rejected after claim with zero audit drift");
    await mappingRuntime.end();

    let serial = 0;
    const makeJob = async () => {
      const id = `local-job-${++serial}`;
      await fixture.query("UPDATE tenant_memberships SET role='tenant_owner',capability='company_owner',status='active' WHERE id='local-member'");
      await fixture.query("INSERT INTO import_jobs(id,tenant_id,user_id,source_type,title,target_entity,status,notes,upload_lifecycle_version) VALUES ($1,'local-tenant','local-actor','excel','Synthetic upload','properties','queued',$2,1)", [id, JSON.stringify({ kind: "property_row_import", rows: [] })]);
      await fixture.query("INSERT INTO attachments(id,tenant_id,user_id,target_type,target_id,file_name,file_type,storage_path) VALUES ($1,'local-tenant','local-actor','import_job',$2,'synthetic.xlsx','application/octet-stream',$3)", [`source-${id}`, id, `postgres-private://local-tenant/source-${id}`]);
      await fixture.query("INSERT INTO private_attachment_blobs(attachment_id,tenant_id,content,sha256) VALUES ($1,'local-tenant',$2,'synthetic')", [`source-${id}`, Buffer.from("synthetic-only")]);
      await fixture.query("UPDATE import_jobs SET status='mapped' WHERE id=$1", [id]);
      return id;
    };
    const assertState = async (id, deleted) => {
      for (const [table, column, value] of [["import_jobs", "id", id], ["attachments", "id", `source-${id}`], ["private_attachment_blobs", "attachment_id", `source-${id}`]]) {
        assert.equal(Number((await fixture.query(`SELECT count(*) FROM ${table} WHERE ${column}=$1`, [value])).rows[0].count), deleted ? 0 : 1, `${table}: ${id}`);
      }
      assert.equal(Number((await fixture.query("SELECT count(*) FROM audit_logs WHERE target_id=$1 AND action='preimport_property_upload_deleted'", [id])).rows[0].count), deleted ? 1 : 0);
    };
    const waitBlocked = async (pid, done, label) => {
      for (let n = 0; n < 150; n++) {
        assert.equal(done(), false, `${label}: request completed instead of waiting for authorization lock`);
        const state = await fixture.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid]);
        if (state.rows[0]?.wait_event_type === "Lock") return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail(`${label}: no observed PostgreSQL lock wait`);
    };
    const changeMembership = (kind) => kind === "ordinary" || kind === "owner"
      ? manager.query("SELECT * FROM brokerdesk_private.update_tenant_member_capability('local-tenant','local-member','local-owner',$1,$2)", kind === "ordinary" ? ["broker", "ordinary_member"] : ["tenant_owner", "company_owner"])
      : manager.query("SELECT * FROM brokerdesk_private.update_tenant_member_status('local-tenant','local-member','local-owner',$1)", [kind]);

    for (const change of ["ordinary", "suspended", "removed", "owner"]) {
      const id = await makeJob();
      if (change === "owner") await fixture.query("UPDATE tenant_memberships SET role='broker',capability='ordinary_member' WHERE id='local-member'");
      await manager.query("BEGIN");
      await changeMembership(change);
      let finished = false;
      const pending = deleter.query("SELECT brokerdesk_private.delete_preimport_property_upload('local-tenant',$1) AS deleted", [id]).finally(() => { finished = true; });
      pending.catch(() => {});
      await waitBlocked(deletePid, () => finished, `change-first ${change}`);
      await manager.query("COMMIT");
      assert.equal((await pending).rows[0].deleted, change === "owner");
      await assertState(id, change === "owner");
    }

    // The opposite order: deletion holds tenant/membership while waiting for a
    // job lock; the real member lifecycle RPC must wait until deletion commits.
    const id = await makeJob();
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM import_jobs WHERE id=$1 FOR UPDATE", [id]);
    await deleter.query("BEGIN");
    let deleteDone = false;
    const deleting = deleter.query("SELECT brokerdesk_private.delete_preimport_property_upload('local-tenant',$1) AS deleted", [id]).finally(() => { deleteDone = true; });
    deleting.catch(() => {});
    await waitBlocked(deletePid, () => deleteDone, "delete waiting on job");
    await manager.query("BEGIN");
    let changeDone = false;
    const changing = changeMembership("ordinary").finally(() => { changeDone = true; });
    changing.catch(() => {});
    await waitBlocked(managerPid, () => changeDone, "downgrade waits for deletion");
    await blocker.query("COMMIT");
    assert.equal((await deleting).rows[0].deleted, true);
    await deleter.query("COMMIT");
    await changing; await manager.query("COMMIT");
    await assertState(id, true);

    await fixture.query("INSERT INTO tenant_memberships(id,tenant_id,user_id,role,capability,status,invitation_status) VALUES ('local-platform-member','local-platform','local-actor','platform_owner','company_owner','active','accepted')");
    for (const mode of ["mixed-valid", "mixed-ordinary", "platform-only", "form-admin", "invited"]) {
      const jobId = await makeJob();
      if (mode === "mixed-ordinary") await fixture.query("UPDATE tenant_memberships SET role='broker',capability='ordinary_member' WHERE id='local-member'");
      if (mode === "platform-only" || mode === "invited") await fixture.query("UPDATE tenant_memberships SET status=$1 WHERE id='local-member'", [mode === "invited" ? "invited" : "removed"]);
      if (mode === "form-admin") await fixture.query("UPDATE tenant_memberships SET role='manager',capability='company_form_admin' WHERE id='local-member'");
      const deleted = (await deleter.query("SELECT brokerdesk_private.delete_preimport_property_upload('local-tenant',$1) AS deleted", [jobId])).rows[0].deleted;
      assert.equal(deleted, mode === "mixed-valid" || mode === "form-admin", mode);
      await assertState(jobId, deleted);
    }
    succeeded = true;
    console.log("[PASS] isolated PostgreSQL 16: real migrations, member lifecycle RPCs, both authorization lock orders, role matrix and source/blob/audit outcomes");
  } finally {
    // Immediate local shutdown cancels outstanding lock waiters on a failed assertion.
    if (running) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    for (const client of clients) await client.end().catch(() => {});
    if (succeeded && root.startsWith("/private/tmp/brokerdesk-preimport-pg-")) fs.rmSync(root, { recursive: true });
    else console.log(`[LOCAL TEST EVIDENCE] stopped synthetic cluster retained at ${root}`);
  }
}
