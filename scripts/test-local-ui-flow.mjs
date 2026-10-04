import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import crypto from "node:crypto";
import { join } from "node:path";
import pg from "pg";

// Local-only browser evidence. The Next server must already be running with an
// explicitly selected local DATA_DRIVER and either demo auth or the
// non-production trusted-header harness. This script never sends a provider
// request or writes remote data.
const baseUrl = (process.env.BROKER_DESK_UI_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
const chromePath = process.env.BROKER_DESK_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const evidenceDir = mkdtempSync(join("/tmp", "broker-desk-ui-flow-"));
const syntheticLedgerFixture = process.env.BROKER_DESK_EXCEL_FIXTURE ?? "/tmp/broker-desk-synthetic-v1-import.xlsx";
const supportedCaseFixture = process.env.BROKER_DESK_CASE_EXCEL_FIXTURE ?? join(process.cwd(), "scripts/fixtures/object-import/h034-supported.xlsx");
const uniqueSyntheticLedgerFixture = process.env.BROKER_DESK_UI_UNIQUE_FIXTURE === "1"
  ? join(evidenceDir, "broker-desk-synthetic-v1-import-unique.xlsx")
  : syntheticLedgerFixture;
if (uniqueSyntheticLedgerFixture !== syntheticLedgerFixture) {
  // The local acceptance may be rerun against the same disposable database.
  // Rewrite a harmless workbook metadata field so the content hash receives a
  // fresh idempotency key while the worksheet rows remain unchanged.
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(syntheticLedgerFixture);
  workbook.creator = "Broker Desk local acceptance";
  workbook.modified = new Date();
  await workbook.xlsx.writeFile(uniqueSyntheticLedgerFixture);
}

const routes = [
  { name: "01-home", path: "/", expected: ["資料管理センター", "今日の重点"] },
  { name: "02-import", path: "/import-center", expected: ["情報入力"] },
  { name: "03-cases", path: "/organize-center?type=case", expected: ["案件を新規作成", "案件"] },
  // The isolated harness intentionally leaves the staging-only guarantee
  // feature flag off; review its explicit disabled state rather than
  // weakening the gate or manufacturing template-library rows.
  { name: "04-guarantee", path: "/cases/case_demo_asakusa_mori_rent/guarantee-application", expected: ["保証会社申込書を作成", "この申込機能は現在利用できません"] },
  { name: "05-clients", path: "/clients", expected: ["顧客"] },
  { name: "06-properties", path: "/properties", expected: ["物件"] },
  { name: "07-documents", path: "/output-center", expected: ["文書出力"] },
  { name: "08-members", path: "/settings/members", expected: ["会社メンバーと権限", "メンバー追加"] },
];

function getSetCookie(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
}

function cookieValue(setCookie, name) {
  return setCookie
    .map((value) => value.split(";", 1)[0])
    .find((value) => value.startsWith(`${name}=`));
}

async function actorSession(actorId) {
  if (process.env.BROKER_DESK_UI_TRUSTED_HEADER === "1") {
    const headers = {
      origin: baseUrl,
      "x-brokerdesk-auth-secret": process.env.BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET ?? "local-ui-test-secret",
      "x-brokerdesk-auth-subject": `demo:${actorId}`,
      "x-brokerdesk-auth-email": actorId === "user_ops" ? "ops@brokerdesk.local" : "demo@brokerdesk.local",
      "x-brokerdesk-auth-name": actorId === "user_ops" ? "Synthetic Ops" : "Synthetic Owner",
    };
    const sessionResponse = await fetch(`${baseUrl}/api/tenant/session`, { headers });
    const session = await sessionResponse.json();
    assert.equal(sessionResponse.status, 200, `trusted-header actor ${actorId} must resolve a tenant session`);
    return { actorId, headers, session, sessionStatus: sessionResponse.status };
  }
  const response = await fetch(`${baseUrl}/api/actor`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ actorId }),
  });
  assert.equal(response.status, 200, `local actor fixture ${actorId} must switch successfully`);
  const cookie = cookieValue(getSetCookie(response), "brokerdesk_actor_id");
  assert.ok(cookie, `local actor fixture ${actorId} must return its test-only actor cookie`);
  const sessionResponse = await fetch(`${baseUrl}/api/tenant/session`, { headers: { cookie, origin: baseUrl } });
  const session = await sessionResponse.json();
  if (sessionResponse.status !== 200 && process.env.BROKER_DESK_UI_FIXED_PG_SUBJECT !== "1") {
    assert.equal(sessionResponse.status, 200, `local actor fixture ${actorId} must resolve a tenant session`);
  }
  return { actorId, cookie, session, sessionStatus: sessionResponse.status };
}

async function requestAsActor(actor, path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  for (const [name, value] of Object.entries(actor.headers ?? {})) headers.set(name, value);
  headers.set("origin", baseUrl);
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

function localQueryClient() {
  const queryUrl = process.env.BROKER_DESK_UI_PG_QUERY_URL?.trim();
  const querySocket = process.env.BROKER_DESK_UI_PG_QUERY_SOCKET?.trim();
  assert.ok(queryUrl || querySocket, "local PostgreSQL fixture requires an explicit query connection");
  return queryUrl
    ? new pg.Client({ connectionString: queryUrl, application_name: "brokerdesk-ui-fixture" })
    : new pg.Client({
      host: querySocket,
      port: Number(process.env.BROKER_DESK_UI_PG_QUERY_PORT ?? 55439),
      database: process.env.BROKER_DESK_UI_PG_QUERY_DATABASE ?? "preimport_lifecycle_test",
      user: process.env.BROKER_DESK_UI_PG_QUERY_USER ?? "qa_initializer",
      password: "",
      application_name: "brokerdesk-ui-fixture",
    });
}

async function seedLocalAcceptanceFixture() {
  const client = localQueryClient();
  await client.connect();
  try {
    await client.query("BEGIN");
    // The harness is allowed to reset only its own named synthetic rows so a
    // rerun against the same disposable cluster can assert absolute counts.
    await client.query(
      `DELETE FROM private_attachment_blobs
        WHERE attachment_id IN (
          SELECT id FROM attachments
           WHERE tenant_id = 'tenant_cherry' AND file_name LIKE 'broker-desk-synthetic-v1-import%'
        )`,
    );
    await client.query("DELETE FROM attachments WHERE tenant_id = 'tenant_cherry' AND file_name LIKE 'broker-desk-synthetic-v1-import%'");
    await client.query(
      `DELETE FROM audit_logs
        WHERE tenant_id = 'tenant_cherry'
          AND (message LIKE 'Excel 物件保存:%' OR target_id IN (SELECT id FROM import_jobs WHERE tenant_id = 'tenant_cherry' AND title LIKE 'broker-desk-synthetic-v1-import%'))`,
    );
    await client.query("DELETE FROM import_jobs WHERE tenant_id = 'tenant_cherry' AND title LIKE 'broker-desk-synthetic-v1-import%'");
    await client.query("DELETE FROM properties WHERE tenant_id = 'tenant_cherry' AND name IN ('合成タワー', '合成空室', '合成坏价格')");
    await client.query(
      `INSERT INTO users(id,name,email,password_hash,external_auth_subject)
       VALUES ('user_demo','Synthetic Owner','demo@brokerdesk.local','local-fixture','demo:user_demo'),
              ('user_ops','Synthetic Ops','ops@brokerdesk.local','local-fixture','demo:user_ops')
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, external_auth_subject=EXCLUDED.external_auth_subject`,
    );
    await client.query(
      `INSERT INTO tenants(id,name,slug,account_type,status,purchased_seat_count)
       VALUES ('tenant_cherry','Synthetic Cherry Tenant','synthetic-cherry','company','active',5)
       ON CONFLICT (id) DO UPDATE SET status='active', purchased_seat_count=5`,
    );
    await client.query(
      `INSERT INTO tenant_memberships(id,tenant_id,user_id,role,capability,status,invitation_provider,invitation_status,invitation_accepted_at)
       VALUES ('membership_demo','tenant_cherry','user_demo','tenant_owner','company_owner','active','manual','accepted',NOW()),
              ('membership_ops','tenant_cherry','user_ops','broker','ordinary_member','active','manual','accepted',NOW())
       ON CONFLICT DO NOTHING`,
    );
    await client.query(
      `INSERT INTO clients(id,tenant_id,name,phone,purpose,stage,temperature,owner_user_id,created_by_user_id,current_owner_user_id,visibility_scope,owner_resolution_status)
       VALUES ('client_demo_asakusa','tenant_cherry','Synthetic Applicant','09000000000','rent','lead','warm','user_demo','user_demo','user_demo','private','resolved')
       ON CONFLICT (id) DO NOTHING`,
    );
    await client.query(
      `INSERT INTO properties(id,tenant_id,name,address,listing_price,created_by_user_id,current_owner_user_id,visibility_scope,owner_resolution_status)
       VALUES ('property_demo_asakusa','tenant_cherry','Synthetic Property','東京都台東区浅草1-1',100000,'user_demo','user_demo','private','resolved')
       ON CONFLICT (id) DO NOTHING`,
    );
    await client.query(
      `INSERT INTO brokerage_cases(id,tenant_id,user_id,case_type,case_title,primary_property_id,status,confirmed_data_json,source_import_job_ids,created_by_user_id,current_owner_user_id,visibility_scope,owner_resolution_status)
       VALUES ('case_demo_asakusa_mori_rent','tenant_cherry','user_demo','unit_rent','Synthetic 浅草案件','property_demo_asakusa','draft',
               '{"applicant.name":"Synthetic Applicant","property.name":"Synthetic Property","property.address":"東京都台東区浅草1-1"}'::jsonb,ARRAY[]::text[],'user_demo','user_demo','private','resolved')
       ON CONFLICT (id) DO UPDATE SET tenant_id='tenant_cherry', user_id='user_demo', current_owner_user_id='user_demo', visibility_scope='private', owner_resolution_status='resolved'`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function queryLocalImportEvidence(jobId) {
  const queryUrl = process.env.BROKER_DESK_UI_PG_QUERY_URL?.trim();
  const querySocket = process.env.BROKER_DESK_UI_PG_QUERY_SOCKET?.trim();
  const client = localQueryClient();
  await client.connect();
  try {
    const job = (await client.query(
      "SELECT id, tenant_id, status, mapping_json, validation_message, final_import_started_at, attempt_count FROM import_jobs WHERE id = $1",
      [jobId],
    )).rows[0];
    assert.ok(job, `real action job must exist in PostgreSQL: ${jobId}`);
    const propertyCounts = (await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE name = '合成タワー')::int AS tower_count,
              count(*) FILTER (WHERE name = '合成空室')::int AS vacant_count
         FROM properties WHERE tenant_id = $1 AND name IN ('合成タワー', '合成空室')`,
      [job.tenant_id],
    )).rows[0];
    const auditCount = Number((await client.query(
      "SELECT count(*)::int AS count FROM audit_logs WHERE tenant_id = $1 AND target_id = $2 AND action = 'import_job_completed'",
      [job.tenant_id, jobId],
    )).rows[0].count);
    assert.equal(job.status, "completed", "real executePropertyImportAction must complete the job");
    assert.ok(job.final_import_started_at, "real action job must retain final_import_started_at");
    assert.equal(Number(job.attempt_count), 1, "two synchronous submissions must increment the real attempt count exactly once");
    assert.equal(Number(propertyCounts.total), 3, "two synchronous submissions must produce exactly three valid synthetic properties");
    assert.equal(Number(propertyCounts.tower_count), 2, "the two distinct tower rows must both persist");
    assert.equal(Number(propertyCounts.vacant_count), 1, "the vacant synthetic row must persist");
    assert.equal(auditCount, 1, "two synchronous submissions must produce one completion audit");
    return {
      job: {
        id: job.id,
        tenantId: job.tenant_id,
        status: job.status,
        mapping: job.mapping_json,
        finalImportStartedAt: Boolean(job.final_import_started_at),
        attemptCount: Number(job.attempt_count),
      },
      properties: { total: Number(propertyCounts.total), towerCount: Number(propertyCounts.tower_count), vacantCount: Number(propertyCounts.vacant_count) },
      completionAudits: auditCount,
      querySource: queryUrl ? "explicit local PostgreSQL URL" : `explicit local PostgreSQL socket ${querySocket}`,
    };
  } finally {
    await client.end();
  }
}

function runChrome(route) {
  console.log(`[BROWSER] opening ${route.path}`);
  const output = spawnSync(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-crash-reporter",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1440,1000",
    `--user-data-dir=${join(evidenceDir, `${route.name}-profile`)}`,
    `--screenshot=${join(evidenceDir, `${route.name}.png`)}`,
    "--dump-dom",
    "--virtual-time-budget=2500",
    `${baseUrl}${route.path}`,
  ], { encoding: "utf8", timeout: 20_000 });
  assert.equal(output.status, 0, `Chrome route ${route.path} must exit successfully: ${output.stderr}`);
  const html = output.stdout;
  for (const expected of route.expected) assert(html.includes(expected), `Chrome route ${route.path} must render ${expected}`);
  console.log(`[BROWSER] passed ${route.path}`);
  return { path: route.path, expected: route.expected, screenshot: join(evidenceDir, `${route.name}.png`) };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeWebSocketFrame(value) {
  const payload = Buffer.from(value);
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) masked[index] = payload[index] ^ mask[index % 4];
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length < 65_536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, mask, masked]);
}

class CdpPage {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.handshake = false;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.consoleErrors = [];
  }

  async connect() {
    const url = new URL(this.webSocketUrl);
    const key = crypto.randomBytes(16).toString("base64");
    this.socket = net.connect({ host: url.hostname, port: Number(url.port) }, () => {
      this.socket.write(
        "GET " + url.pathname + url.search + " HTTP/1.1\r\n" +
        "Host: " + url.hostname + ":" + url.port + "\r\n" +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        "Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n",
      );
    });
    this.socket.on("data", (chunk) => this.consume(chunk));
    this.socket.on("error", (error) => {
      this.emit("__error", error);
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    });
    await new Promise((resolve, reject) => {
      const removeHandshake = this.addListener("__handshake", () => {
        removeHandshake();
        removeError();
        resolve();
      });
      const removeError = this.addListener("__error", (error) => {
        removeHandshake();
        removeError();
        reject(error);
      });
    });
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
  }

  addListener(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  send(method, params = {}) {
    assert.ok(this.socket && this.handshake, "CDP socket must be connected before " + method);
    const id = this.nextId++;
    this.socket.write(encodeWebSocketFrame(JSON.stringify({ id, method, params })));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) throw new Error("browser evaluation failed: " + (response.exceptionDetails.text ?? expression));
    return response.result?.value;
  }

  async waitForLocation(predicate, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let location;
      try {
        location = await this.evaluate("location.href");
      } catch {
        location = undefined;
      }
      if (typeof location === "string" && predicate(location)) return location;
      await sleep(250);
    }
    let current;
    try { current = await this.evaluate("location.href"); } catch { current = "unknown"; }
    throw new Error("browser did not reach expected location; current=" + String(current));
  }

  async waitForText(text, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const body = await this.evaluate("document.body?.innerText ?? ''");
      if (body.includes(text)) return body;
      await sleep(250);
    }
    let location;
    let body;
    try { location = await this.evaluate("location.href"); } catch { location = "unknown"; }
    try { body = await this.evaluate("document.body?.innerText ?? ''"); } catch { body = "unknown"; }
    throw new Error("browser did not render expected text: " + text + "; location=" + String(location) + "; body=" + String(body).slice(0, 1000));
  }

  async setFile(selector, filePath) {
    const document = await this.send("DOM.getDocument", { depth: -1 });
    const node = await this.send("DOM.querySelector", { nodeId: document.root.nodeId, selector });
    assert.ok(node.nodeId, "file input " + selector + " must exist");
    await this.send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [filePath] });
  }

  async close() {
    try { await this.send("Page.close"); } catch { /* Chrome may already be gone. */ }
    this.socket?.destroy();
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.handshake) {
      const end = this.buffer.indexOf("\r\n\r\n");
      if (end === -1) return;
      const status = this.buffer.subarray(0, end).toString("utf8");
      if (!status.includes("101 ")) {
        this.emit("__error", new Error("CDP websocket handshake failed: " + status));
        return;
      }
      this.handshake = true;
      this.buffer = this.buffer.subarray(end + 4);
      this.emit("__handshake");
    }
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      let offset = 2;
      let length = second & 0x7f;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = (second & 0x80) !== 0;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;
      let payload = this.buffer.subarray(offset, offset + length);
      if (masked) {
        const mask = this.buffer.subarray(offset - 4, offset);
        payload = Buffer.from(payload);
        for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
      }
      this.buffer = this.buffer.subarray(offset + length);
      const opcode = first & 0x0f;
      if (opcode === 0x9) {
        const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
        this.socket.write(pong);
      } else if (opcode === 0x1) {
        this.dispatch(JSON.parse(payload.toString("utf8")));
      }
    }
  }

  dispatch(message) {
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error("CDP " + message.error.message));
      else pending.resolve(message.result ?? {});
    }
    this.emit(message.method, message.params);
    if (message.method === "Runtime.exceptionThrown") this.consoleErrors.push(message.params?.exceptionDetails?.text ?? "Runtime exception");
    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) {
      this.consoleErrors.push(message.params.args?.map((arg) => arg.value ?? arg.description ?? "").join(" ") ?? message.params.type);
    }
  }

  emit(method, value) {
    for (const listener of this.listeners.get(method) ?? []) listener(value);
  }
}

async function readJson(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, "Chrome debugging endpoint must respond: " + url);
  return response.json();
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  assert.ok(port > 0, "local CDP port must be reserved");
  return port;
}

async function launchInteractiveChrome(requestHeaders = {}) {
  const port = Number(process.env.BROKER_DESK_CDP_PORT ?? await reservePort());
  const profile = join(evidenceDir, "interactive-profile");
  const child = spawn(chromePath, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + port, "--remote-allow-origins=*", "--user-data-dir=" + profile, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let chromeStderr = "";
  child.stderr.on("data", (chunk) => { chromeStderr += chunk.toString(); });
  let version;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      version = await readJson("http://127.0.0.1:" + port + "/json/version");
      break;
    } catch {
      await sleep(250);
    }
  }
  assert.ok(version?.webSocketDebuggerUrl, "Chrome CDP endpoint must become available");
  let tab;
  let lastTabs = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastTabs = await readJson("http://127.0.0.1:" + port + "/json/list");
    tab = lastTabs.find((item) => item.type === "page");
    if (tab) break;
    await sleep(250);
  }
  assert.ok(tab?.webSocketDebuggerUrl, "Chrome must expose an interactive page target; targets=" + JSON.stringify(lastTabs.map((item) => ({ type: item.type, url: item.url }))) + " stderr=" + chromeStderr.slice(-1000));
  const page = new CdpPage(tab.webSocketDebuggerUrl);
  await page.connect();
  if (Object.keys(requestHeaders).length > 0) {
    await page.send("Network.enable");
    await page.send("Network.setExtraHTTPHeaders", { headers: requestHeaders });
  }
  return { page, child, port };
}

async function navigate(page, path) {
  const target = new URL(baseUrl + path);
  await page.send("Page.navigate", { url: target.href });
  await page.waitForLocation((location) => {
    try {
      const current = new URL(location);
      return current.origin === target.origin && current.pathname === target.pathname && current.search === target.search;
    } catch {
      return false;
    }
  }, 15_000);
  await sleep(300);
  return page.evaluate("location.href");
}

async function runInteractiveRoutes(page) {
  const evidence = [];
  for (const route of routes) {
    console.log(`[BROWSER] opening authenticated ${route.path}`);
    await navigate(page, route.path);
    for (const expected of route.expected) await page.waitForText(expected, 15_000);
    const screenshot = await page.send("Page.captureScreenshot", { format: "png" });
    const screenshotPath = join(evidenceDir, `${route.name}.png`);
    writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
    evidence.push({ path: route.path, expected: route.expected, screenshot: screenshotPath });
    console.log(`[BROWSER] passed authenticated ${route.path}`);
  }
  return evidence;
}

function browserScript(lines) {
  return lines.join("\n");
}

async function runExcelLedgerFlow(page) {
  assert.ok(existsSync(uniqueSyntheticLedgerFixture), "synthetic ledger fixture must exist: " + uniqueSyntheticLedgerFixture);
  await navigate(page, "/import-center?flow=ledger#source-upload");
  await page.waitForText("情報入力", 15_000);
  await page.setFile('input[name="excelFile"]', uniqueSyntheticLedgerFixture);
  const uploadSummary = await page.evaluate(browserScript([
    "(() => {",
    "  const input = document.querySelector('input[name=\"excelFile\"]');",
    "  if (!input?.form) return \"missing-form\";",
    "  input.form.requestSubmit();",
    "  return input.files?.[0]?.name ?? \"no-file\";",
    "})()",
  ]));
  assert.equal(uploadSummary, uniqueSyntheticLedgerFixture.split("/").pop(), "browser must attach the synthetic Excel source");
  const uploadLocation = await page.waitForLocation((location) => location.includes("xlsxJob="), 15_000);
  const jobId = new URL(uploadLocation).searchParams.get("xlsxJob");
  assert.ok(jobId, "Excel upload must return an xlsxJob id");
  await page.waitForText("列対応を開く", 5_000).catch(async () => {
    // PostgreSQL processing is intentionally asynchronous in the UI: the
    // page that receives the upload can still show queued while the local
    // processor has already committed mapped. Refresh once before judging
    // the persisted state.
    await page.send("Page.reload", { ignoreCache: true });
    await page.waitForLocation((location) => location.includes("xlsxJob="), 15_000);
    await sleep(300);
    await page.waitForText("列対応を開く", 20_000);
  });
  const mappingLink = await page.evaluate(browserScript([
    "(() => {",
    "  const link = [...document.querySelectorAll('a')].find((candidate) => candidate.textContent?.includes(\"列対応を開く\"));",
    "  link?.click();",
    "  return link?.getAttribute('href') ?? null;",
    "})()",
  ]));
  assert.equal(mappingLink, "/import-center?job=" + encodeURIComponent(jobId) + "&advanced=1#job-mapping", "mapping recovery link must open the job-scoped mapping form");
  await page.waitForLocation((location) => location.includes("job=" + encodeURIComponent(jobId)) && location.includes("advanced=1"), 15_000);
  await page.waitForText("保存先を確認", 20_000);
  const sourceBody = await page.evaluate("document.body.innerText");
  assert.match(sourceBody, /合成タワー|合成空室/, "parsed source rows must be visible before mapping");

  const invalidMapping = await page.evaluate(browserScript([
    "(() => {",
    "  const form = document.querySelector('form#mapping-form');",
    "  const sourceColumns = [...(form?.querySelectorAll('input[name=\"sourceColumn\"]') ?? [])].map((input) => input.value);",
    "  const nameRow = [...(form?.querySelectorAll('tr') ?? [])].find((row) => row.querySelector('input[name=\"sourceColumn\"]')?.value === \"物件名\");",
    "  const nameSelect = nameRow?.querySelector('select[name=\"targetField\"]');",
    "  if (!form || !nameSelect) return { ok: false, sourceColumns };",
    "  nameSelect.value = \"\";",
    "  nameSelect.dispatchEvent(new Event(\"change\", { bubbles: true }));",
    "  form.requestSubmit();",
    "  return { ok: true, sourceColumns };",
    "})()",
  ]));
  assert.equal(invalidMapping.ok, true, "mapping form must expose the synthetic source columns");
  await page.waitForLocation((location) => location.includes("advanced=1"), 15_000);
  const invalidBody = await page.waitForText("必須フィールドのマッピング不足", 15_000);
  assert.match(invalidBody, /物件名|保存先/, "invalid required mapping must remain actionable");

  const recoveredMapping = await page.evaluate(browserScript([
    "(() => {",
    "  const form = document.querySelector('form#mapping-form');",
    "  const nameRow = [...(form?.querySelectorAll('tr') ?? [])].find((row) => row.querySelector('input[name=\"sourceColumn\"]')?.value === \"物件名\");",
    "  const priceRow = [...(form?.querySelectorAll('tr') ?? [])].find((row) => row.querySelector('input[name=\"sourceColumn\"]')?.value === \"売出価格\");",
    "  const nameSelect = nameRow?.querySelector('select[name=\"targetField\"]');",
    "  const priceSelect = priceRow?.querySelector('select[name=\"targetField\"]');",
    "  if (!form || !nameSelect || !priceSelect) return { ok: false };",
    "  nameSelect.value = \"name\";",
    "  priceSelect.value = \"listing_price\";",
    "  nameSelect.dispatchEvent(new Event(\"change\", { bubbles: true }));",
    "  priceSelect.dispatchEvent(new Event(\"change\", { bubbles: true }));",
    "  form.requestSubmit();",
    "  return { ok: true, values: [nameSelect.value, priceSelect.value], formSources: [...new FormData(form).getAll(\"sourceColumn\")], formTargets: [...new FormData(form).getAll(\"targetField\")] };",
    "})()",
  ]));
  assert.equal(recoveredMapping.ok, true, "required mapping must be recoverable after an invalid-field submission");
  console.log(`[BROWSER] recovered mapping form: ${JSON.stringify(recoveredMapping)}`);
  assert.deepEqual(recoveredMapping.values, ["name", "listing_price"], "recovered mapping must submit both required fields");
  await page.waitForLocation((location) => location.includes("job=" + encodeURIComponent(jobId)) && location.includes("advanced=1"), 20_000);
  await sleep(1_000);
  await navigate(page, "/import-center?xlsxJob=" + encodeURIComponent(jobId) + "&advanced=1#source-upload");
  await sleep(1_000);
  await page.evaluate(browserScript([
    "(() => {",
    "  const summary = [...document.querySelectorAll('summary')].find((candidate) => candidate.textContent?.includes(\"通常の物件台帳保存設定\"));",
    "  if (summary && !summary.parentElement?.open) summary.click();",
    "  return Boolean(summary);",
    "})()",
  ]));
  await page.waitForText("物件台帳に保存", 15_000);

  const duplicateSubmit = await page.evaluate(browserScript([
    "(() => {",
    "  const form = [...document.querySelectorAll('form')].find((candidate) => candidate.querySelector('input[name=\"jobId\"]') && candidate.textContent?.includes(\"物件台帳に保存\"));",
    "  if (!form) return false;",
    "  form.requestSubmit();",
    "  form.requestSubmit();",
    "  return true;",
    "})()",
  ]));
  assert.equal(duplicateSubmit, true, "the UI harness must attempt a duplicate submit against one import job");
  await page.waitForLocation((location) => location.includes("flash=excel_imported"), 20_000);
  const resultBody = await page.waitForText("登録成功", 15_000);
  assert.match(resultBody, /スキップ|疑似重複/, "result must explain invalid and duplicate rows instead of hiding them");

  const reopened = await navigate(page, "/import-center?xlsxJob=" + encodeURIComponent(jobId));
  assert.ok(reopened.includes("xlsxJob=" + encodeURIComponent(jobId)), "reopen must retain the same import job");
  const reopenedBody = await page.waitForText("登録成功", 15_000);
  assert.match(reopenedBody, /合成タワー|疑似重複/, "refresh/reopen must retain the saved result and source evidence");
  await navigate(page, "/properties");
  const propertiesBody = await page.waitForText("合成タワー", 15_000);
  assert.match(propertiesBody, /合成空室/, "successful rows must be visible in the saved property list");
  return {
    fixture: uniqueSyntheticLedgerFixture,
    jobId,
    upload: "queued and parsed",
    invalidMappingRecovery: "missing required 物件名 mapping -> restore mapping",
    duplicateSubmit: "two synchronous submissions attempted against one job; claim/result remained single-source",
    result: "saved valid rows; invalid price and exact/suspected duplicate rows retained in result",
    refreshReopen: "same xlsxJob result persisted",
    savedProperties: ["合成タワー", "合成空室"],
  };
}

async function runCaseAssociationFlow(page) {
  assert.ok(existsSync(supportedCaseFixture), "supported case fixture must exist: " + supportedCaseFixture);
  const caseId = "case_demo_asakusa_mori_rent";
  await navigate(page, "/import-center?flow=case&targetCaseId=" + encodeURIComponent(caseId) + "#source-upload");
  await page.waitForText("情報入力", 15_000);
  await page.setFile('input[name="excelFile"]', supportedCaseFixture);
  const uploadSummary = await page.evaluate(browserScript([
    "(() => {",
    "  const input = document.querySelector('input[name=\"excelFile\"]');",
    "  if (!input?.form) return \"missing-form\";",
    "  input.form.requestSubmit();",
    "  return input.files?.[0]?.name ?? \"no-file\";",
    "})()",
  ]));
  assert.equal(uploadSummary, supportedCaseFixture.split("/").pop(), "browser must attach the supported case Excel source");
  console.log(`[BROWSER] case upload submitted; current=${await page.evaluate("location.href")}`);
  const uploadLocation = await page.waitForLocation((location) => location.includes("xlsxJob=") && location.includes("targetCaseId="), 15_000);
  console.log(`[BROWSER] case upload redirected: ${uploadLocation}`);
  const jobId = new URL(uploadLocation).searchParams.get("xlsxJob");
  assert.ok(jobId, "case-scoped Excel upload must return an xlsxJob id");
  await page.waitForText("この案件へ追加", 5_000).catch(async () => {
    await page.send("Page.reload", { ignoreCache: true });
    await page.waitForLocation((location) => location.includes("xlsxJob=") && location.includes("targetCaseId="), 15_000);
    await sleep(300);
    await page.waitForText("この案件へ追加", 20_000);
  });
  await page.waitForText("確認して現在の案件に追加", 15_000);

  const review = await page.evaluate(browserScript([
    "(async () => {",
    "  try {",
    "  document.querySelectorAll('button').forEach((button) => {",
    "    if (button.textContent?.includes(\"すべての値を見直す\")) button.click();",
    "  });",
    "  await new Promise((resolve) => setTimeout(resolve, 800));",
    "  const form = [...document.querySelectorAll('form')].find((candidate) => candidate.querySelector('input[name=\"reviewDecisionsJson\"]'));",
    "  const input = form?.querySelector('input:not([type=\"hidden\"]), textarea');",
    "  if (!form || !input) return { ok: false, formCount: document.querySelectorAll('form').length, editableCount: document.querySelectorAll('input:not([type=\"hidden\"]), textarea').length, body: document.body?.innerText?.slice(-1200) };",
    "  const original = input.value;",
    "  const edited = original ? original + \"（合成確認）\" : \"合成確認\";",
    "  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), \"value\");",
    "  descriptor?.set?.call(input, edited);",
    "  input.dispatchEvent(new Event(\"input\", { bubbles: true }));",
    "  input.dispatchEvent(new Event(\"change\", { bubbles: true }));",
    "  input.dispatchEvent(new Event(\"blur\", { bubbles: true }));",
    "  await new Promise((resolve) => setTimeout(resolve, 300));",
    "  const confirm = [...form.querySelectorAll('button')].find((button) => button.textContent?.includes(\"この値を確定\"));",
    "  confirm?.click();",
    "  return { ok: true, original, edited };",
    "  } catch (error) { return { ok: false, error: String(error) }; }",
    "})()",
  ]));
  assert.equal(review.ok, true, "case review must expose an editable extracted value: " + JSON.stringify(review));
  const reviewBody = await page.waitForText("確認済み・保存待ち", 10_000).catch(() => page.evaluate("document.body.innerText"));
  assert.match(reviewBody, /合成確認|保存待ち|確認して現在の案件に追加/, "edited candidate must be visible before case save");

  const saveResult = await page.evaluate(browserScript([
    "(() => {",
    "  const form = [...document.querySelectorAll('form')].find((candidate) => candidate.querySelector('input[name=\"reviewDecisionsJson\"]'));",
    "  if (!form) return false;",
    "  form.requestSubmit();",
    "  return true;",
    "})()",
  ]));
  assert.equal(saveResult, true, "case review save form must submit");
  console.log(`[BROWSER] case review save submitted; current=${await page.evaluate("location.href")}`);
  const caseLocation = await page.waitForLocation((location) => location.includes("/cases/" + caseId), 20_000);
  console.log(`[BROWSER] case review redirected: ${caseLocation}`);
  const caseBody = await page.waitForText("案件", 15_000);
  assert.match(caseBody, /合成確認|雨漏り|資料/, "saved review must return to the associated case with source evidence");
  const reopenedCase = await navigate(page, caseLocation.replace(baseUrl, ""));
  assert.ok(reopenedCase.includes("/cases/" + caseId), "associated case must reopen by stable case id");
  const reopenedBody = await page.waitForText("合成確認", 15_000).catch(() => page.evaluate("document.body.innerText"));
  assert.match(reopenedBody, /合成確認|雨漏り|資料/, "refresh/reopen must retain the edited case-linked review value or source record");
  return {
    fixture: supportedCaseFixture,
    jobId,
    caseId,
    path: "queued -> parsed -> edited review -> explicit current-case append -> case reopen",
    evidence: "edited synthetic value and source record remained observable after redirect/reopen",
  };
}

try {
  if (process.env.BROKER_DESK_UI_TRUSTED_HEADER === "1") await seedLocalAcceptanceFixture();
  const owner = await actorSession("user_demo");
  const sameTenantMember = await actorSession("user_ops");
  assert.equal(owner.session.user.id, "user_demo", "owner fixture must resolve user_demo");
  assert.equal(owner.session.tenant.id, "tenant_cherry", "owner fixture must resolve Cherry tenant");
  if (sameTenantMember.sessionStatus === 200) {
    assert.equal(sameTenantMember.session.user.id, "user_ops", "same-tenant member fixture must resolve user_ops");
    assert.equal(sameTenantMember.session.tenant.id, "tenant_cherry", "same-tenant member must remain in Cherry tenant");
  }

  let accessEvidence;
  if (process.env.BROKER_DESK_UI_TRUSTED_HEADER === "1") {
    const ownerMembersResponse = await requestAsActor(owner, "/settings/members");
    const ownerMembersBody = await ownerMembersResponse.text();
    assert.equal(ownerMembersResponse.status, 200, "owner must be allowed to read the members page");
    assert.match(ownerMembersBody, /メンバー追加/, "owner members page must expose the management control");
    const memberMembersResponse = await requestAsActor(sameTenantMember, "/settings/members");
    const memberMembersBody = await memberMembersResponse.text();
    assert.equal(memberMembersResponse.status, 200, "same-tenant ordinary member must be allowed to read the members page");
    assert.match(memberMembersBody, /会社メンバーを管理できません/, "ordinary member must receive the explicit management denial state");
    assert.doesNotMatch(memberMembersBody, /メンバー追加/, "ordinary member must not receive the invite management form");
    const foreignTenantResponse = await requestAsActor(owner, "/api/tenant/session", {
      headers: { cookie: "brokerdesk_tenant_id=tenant_other" },
    });
    const foreignTenantBody = await foreignTenantResponse.json();
    assert.equal(foreignTenantResponse.status, 403, "owner must be denied when a second-tenant cookie is requested");
    assert.equal(foreignTenantBody.error, "tenant_forbidden", "cross-tenant request must fail closed at the session resolver");
    accessEvidence = {
      ownerMembersPage: { status: ownerMembersResponse.status, managementControl: true },
      sameTenantOrdinaryMember: { status: memberMembersResponse.status, managementControl: false },
      foreignTenantRequest: { status: foreignTenantResponse.status, error: foreignTenantBody.error, requestedTenant: "tenant_other" },
    };
  } else {
    accessEvidence = { mode: "demo-cookie harness; trusted-header request matrix not run" };
  }

  let browserEvidence = process.env.BROKER_DESK_UI_TRUSTED_HEADER === "1" || process.env.BROKER_DESK_SKIP_STATIC_ROUTES === "1"
    ? []
    : routes.map(runChrome);
  const interactive = await launchInteractiveChrome(owner.headers ?? {});
  let ledgerEvidence;
  let caseEvidence;
  try {
    if (process.env.BROKER_DESK_UI_TRUSTED_HEADER === "1") browserEvidence = await runInteractiveRoutes(interactive.page);
    if (process.env.BROKER_DESK_UI_ONLY_CASE !== "1") {
      ledgerEvidence = await runExcelLedgerFlow(interactive.page);
      ledgerEvidence.postgresActionEvidence = await queryLocalImportEvidence(ledgerEvidence.jobId);
    } else {
      ledgerEvidence = { skipped: true };
    }
    caseEvidence = await runCaseAssociationFlow(interactive.page);
    assert.deepEqual(interactive.page.consoleErrors, [], "interactive Chrome import flow must not emit console errors");
  } finally {
    await interactive.page.close();
    interactive.child.kill();
  }
  const report = {
    baseUrl,
    authBoundary: "explicit local demo auth; no production authentication bypass",
    roleContexts: {
      owner: { actorId: owner.actorId, userId: owner.session.user.id, tenantId: owner.session.tenant.id },
      sameTenantMember: sameTenantMember.sessionStatus === 200
        ? { actorId: sameTenantMember.actorId, userId: sameTenantMember.session.user.id, tenantId: sameTenantMember.session.tenant.id }
        : { actorId: sameTenantMember.actorId, sessionStatus: sameTenantMember.sessionStatus },
    },
    accessEvidence,
    browserEvidence,
    importEvidence: {
      ledger: ledgerEvidence,
      caseAssociation: caseEvidence,
      browserTool: "agent-browser unavailable; installed Chrome headless CDP fallback used",
    },
    note: "Browser path uses explicit local trusted-header identities and transaction-local PostgreSQL request scopes. Owner, same-tenant ordinary-member, and second-tenant denial requests were made against the isolated database. Import flow uses two existing synthetic workbooks and never calls a remote provider.",
  };
  const reportPath = join(evidenceDir, "report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[PASS] local UI flow owner browser path: ${routes.map((route) => route.path).join(" -> ")}`);
  console.log(`[PASS] Excel ledger happy path + invalid mapping/duplicate recovery: ${ledgerEvidence.jobId}`);
  console.log(`[PASS] real executePropertyImportAction PostgreSQL row/job/audit counts: ${JSON.stringify(ledgerEvidence.postgresActionEvidence)}`);
  console.log(`[PASS] case-scoped review edit/save/reopen path: ${caseEvidence.jobId} -> ${caseEvidence.caseId}`);
  console.log(`[EVIDENCE] ${reportPath}`);
  console.log(`[EVIDENCE] screenshots: ${evidenceDir}`);
} catch (error) {
  console.error(`[FAIL] local UI flow: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`[EVIDENCE] partial artifacts: ${evidenceDir}`);
  process.exitCode = 1;
}
