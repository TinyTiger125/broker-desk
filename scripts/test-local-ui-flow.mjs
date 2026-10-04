import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Local-only browser evidence. The Next server must already be running with
// BROKER_DESK_AUTH_MODE=demo and DATA_DRIVER=memory. Demo auth is explicit and
// non-production; this script never sends a provider request or writes remote data.
const baseUrl = (process.env.BROKER_DESK_UI_BASE_URL ?? "http://127.0.0.1:3002").replace(/\/$/, "");
const chromePath = process.env.BROKER_DESK_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const evidenceDir = mkdtempSync(join("/tmp", "broker-desk-ui-flow-"));

const routes = [
  { name: "01-home", path: "/", expected: ["資料管理センター", "今日の重点"] },
  { name: "02-import", path: "/import-center", expected: ["情報入力"] },
  { name: "03-cases", path: "/organize-center?type=case", expected: ["案件資料", "案件"] },
  { name: "04-guarantee", path: "/cases/case_demo_asakusa_mori_rent/guarantee-application", expected: ["保証会社申込書を作成", "生成中は同じファイルを重ねて作成しないため"] },
  { name: "05-clients", path: "/clients", expected: ["顧客"] },
  { name: "06-properties", path: "/properties", expected: ["物件"] },
  { name: "07-documents", path: "/output-center", expected: ["文書出力"] },
  { name: "08-members", path: "/settings/members", expected: ["ユーザー管理", "メンバー"] },
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
  assert.equal(sessionResponse.status, 200, `local actor fixture ${actorId} must resolve a tenant session`);
  return { actorId, cookie, session };
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

try {
  const owner = await actorSession("user_demo");
  const sameTenantMember = await actorSession("user_ops");
  assert.equal(owner.session.user.id, "user_demo", "owner fixture must resolve user_demo");
  assert.equal(owner.session.tenant.id, "tenant_cherry", "owner fixture must resolve Cherry tenant");
  assert.equal(sameTenantMember.session.user.id, "user_ops", "same-tenant member fixture must resolve user_ops");
  assert.equal(sameTenantMember.session.tenant.id, "tenant_cherry", "same-tenant member must remain in Cherry tenant");

  // The second-tenant role intentionally exists only as a route-test context;
  // there is no production/demo browser identity or membership for it.
  const secondTenant = { actorId: "synthetic_user_other", tenantId: "tenant_other", mode: "route_harness_only" };
  assert.equal(secondTenant.mode, "route_harness_only");

  const browserEvidence = routes.map(runChrome);
  const report = {
    baseUrl,
    authBoundary: "explicit local demo auth; no production authentication bypass",
    roleContexts: {
      owner: { actorId: owner.actorId, userId: owner.session.user.id, tenantId: owner.session.tenant.id },
      sameTenantMember: { actorId: sameTenantMember.actorId, userId: sameTenantMember.session.user.id, tenantId: sameTenantMember.session.tenant.id },
      secondTenant,
    },
    browserEvidence,
    note: "Browser path is owner/demo UI evidence. Same-tenant member session is verified through the real local actor/session endpoints; second-tenant isolation remains route-harness evidence only.",
  };
  const reportPath = join(evidenceDir, "report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[PASS] local UI flow owner browser path: ${routes.map((route) => route.path).join(" -> ")}`);
  console.log(`[EVIDENCE] ${reportPath}`);
  console.log(`[EVIDENCE] screenshots: ${evidenceDir}`);
} catch (error) {
  console.error(`[FAIL] local UI flow: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`[EVIDENCE] partial artifacts: ${evidenceDir}`);
  process.exitCode = 1;
}
