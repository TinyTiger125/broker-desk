#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { NextResponse as RealNextResponse } from "next/server.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.resolve(ROOT, relativePath), "utf8");
}

function loadFunction(source, name, dependencies) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll("export async function ", "async function ");
  return new Function(...Object.keys(dependencies), `${compiled}\nreturn ${name};`)(...Object.values(dependencies));
}

const adminSource = read("src/lib/supabase/admin.ts");
const closedBetaSource = read("src/lib/closed-beta-access.ts");
const confirmSource = read("src/app/auth/confirm/route.ts");
const invitationTemplateSource = read("config/supabase/invitation-email.candidate.html");
const invitePageSource = read("src/app/auth/invite/page.tsx");
const inviteClientSource = read("src/components/supabase-invite-fragment-confirm.tsx");
const testerFormSource = read("src/components/closed-beta-tester-form.tsx");
const resetPasswordSource = read("src/components/supabase-reset-password-form.tsx");
const workspaceSource = read("src/app/workspace/page.tsx");
const invitationsPageSource = read("src/app/workspace/invitations/page.tsx");
const acceptInvitationSource = read("src/app/workspace/invitations/accept-invitation-form.tsx");
const proxySource = read("src/proxy.ts");
const nextConfigSource = read("next.config.ts");

assert.match(adminSource, /new URL\("\/auth\/invite"/);
assert.match(adminSource, /invitationUrl\.hash\s*=\s*new URLSearchParams/);
assert.doesNotMatch(adminSource, /invitationUrl\.searchParams\.(?:set|append)\(["']token_hash/);
assert.match(closedBetaSource, /new URL\("\/auth\/invite"/);
assert.match(closedBetaSource, /url\.hash\s*=\s*new URLSearchParams/);
assert.match(inviteClientSource, /window\.history\.replaceState/);
assert.ok(
  inviteClientSource.indexOf("window.history.replaceState") < inviteClientSource.indexOf('fetch("/auth/confirm"'),
  "fragment must be removed before the confirmation POST is created",
);
assert.doesNotMatch(inviteClientSource, /localStorage|sessionStorage/);
assert.match(inviteClientSource, /onClick=\{confirmInvite\}/);
assert.match(inviteClientSource, /tokenRef\.current\s*=\s*null/);
assert.match(inviteClientSource, /initializedRef/);
assert.match(inviteClientSource, /clearScheduledRef/);
assert.match(inviteClientSource, /queueMicrotask/);
assert.match(inviteClientSource, /setState\(tokenRef\.current \? "ready" : "invalid"\)/);
assert.match(inviteClientSource, /此邀请链接无效或已使用/);
assert.match(inviteClientSource, /无法确认邀请/);
assert.ok(
  inviteClientSource.indexOf("if (initializedRef.current)") < inviteClientSource.indexOf("const invitation = readInviteFragment()"),
  "StrictMode replay must reuse the consumed invitation before reading the cleared hash",
);
assert.match(inviteClientSource, /mountedRef\.current = false/);
assert.match(inviteClientSource, /window\.location\.replace/);
assert.match(invitePageSource, /dynamic\s*=\s*"force-dynamic"/);
assert.match(invitePageSource, /fetchCache\s*=\s*"force-no-store"/);
assert.match(proxySource, /"\/auth\/invite"/);
assert.match(nextConfigSource, /source: "\/auth\/invite"/);
assert.match(nextConfigSource, /source: "\/auth\/confirm"/);
assert.match(nextConfigSource, /Cache-Control.*private, no-store/);
assert.match(nextConfigSource, /Referrer-Policy.*no-referrer/);
assert.doesNotMatch(confirmSource, /export async function GET/, "raw invite tokens must not be accepted in a GET query");
assert.match(confirmSource, /export async function POST/);
assert.match(invitationTemplateSource, /\/auth\/invite#token_hash=\{\{ \.TokenHash \}\}/);
assert.doesNotMatch(invitationTemplateSource, /\/auth\/confirm\?token_hash=/);
assert.match(confirmSource, /request\.headers\.get\("origin"\) === requestUrl\.origin/);
assert.match(confirmSource, /verifyOtp\(\{ token_hash: parsed\.tokenHash, type: "invite" \}\)/);
assert.doesNotMatch(confirmSource, /console\.(?:log|warn|error)\s*\(/);

// Local UI contract: the platform owner receives a one-response link that is
// copied manually, while the tester gets visible password/error feedback and
// reaches the pending-invitation acceptance path before tenant entry.
assert.match(testerFormSource, /result\.invitation\.invitationUrl/);
assert.match(testerFormSource, /pagehide/);
assert.match(testerFormSource, /demoNotice/);
assert.match(testerFormSource, /不能登录真实账号/);
assert.match(testerFormSource, /role="alert"/);
assert.doesNotMatch(testerFormSource, /localStorage|sessionStorage/);
assert.match(resetPasswordSource, /密码至少需要 8 位/);
assert.match(resetPasswordSource, /密码更新失败/);
assert.match(resetPasswordSource, /router\.replace\("\/sign-in"\)/);
assert.match(workspaceSource, /pendingInvitations/);
assert.match(workspaceSource, /workspace\/invitations/);
assert.match(invitationsPageSource, /AcceptInvitationForm/);
assert.match(acceptInvitationSource, /name="invitationToken"/);
assert.match(acceptInvitationSource, /role="alert"/);

const confirmBody = confirmSource.slice(confirmSource.indexOf("type PendingCookie"));
const marker = "synthetic-fragment-post-marker";
const verifyCalls = [];
const usedTokens = new Set();
const cookieName = "sb-fragment-auth-token";

const POST = loadFunction(confirmBody, "POST", {
  NextResponse: RealNextResponse,
  cookies: async () => ({ getAll: () => [], get: () => undefined, set() {} }),
  getSupabaseConfig: () => ({ url: "https://supabase.example.test", key: "publishable-key" }),
  createServerClient: (_url, _key, options) => ({
    auth: {
      verifyOtp: async ({ token_hash: tokenHash, type }) => {
        verifyCalls.push({ tokenHash, type });
        if (usedTokens.has(tokenHash)) return { data: { session: null }, error: new Error("used") };
        usedTokens.add(tokenHash);
        options.cookies.setAll(
          [{ name: cookieName, value: "synthetic-session", options: { path: "/", httpOnly: true, sameSite: "lax" } }],
          { "cache-control": "provider-value-that-must-not-win" },
        );
        return { data: { session: { user: { id: "synthetic-user" } } }, error: null };
      },
    },
  }),
});

const originalConsole = { log: console.log, warn: console.warn, error: console.error };
const consoleCalls = [];
console.log = (...args) => consoleCalls.push(args);
console.warn = (...args) => consoleCalls.push(args);
console.error = (...args) => consoleCalls.push(args);
try {
  const validResponse = await POST(new Request("https://app.example.test/auth/confirm", {
    method: "POST",
    headers: {
      origin: "https://app.example.test",
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ token_hash: marker, type: "invite", next: "/reset-password" }),
  }));
  assert.equal(validResponse.status, 200);
  assert.equal(validResponse.headers.get("cache-control"), "private, no-store");
  assert.equal(validResponse.headers.get("referrer-policy"), "no-referrer");
  assert.equal(validResponse.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await validResponse.clone().json(), { ok: true, redirectTo: "/reset-password" });
  assert.equal((await validResponse.clone().text()).includes(marker), false);
  assert.equal(validResponse.cookies.get(cookieName)?.value, "synthetic-session");
  assert.deepEqual(verifyCalls, [{ tokenHash: marker, type: "invite" }]);

  const reusedResponse = await POST(new Request("https://app.example.test/auth/confirm", {
    method: "POST",
    headers: { origin: "https://app.example.test", "content-type": "application/json" },
    body: JSON.stringify({ token_hash: marker, type: "invite", next: "/reset-password" }),
  }));
  assert.equal(reusedResponse.status, 401, "a provider-rejected reused token must fail closed");
  assert.equal((await reusedResponse.text()).includes(marker), false);

  const beforeRejectedCalls = verifyCalls.length;
  const wrongOrigin = await POST(new Request("https://app.example.test/auth/confirm", {
    method: "POST",
    headers: { origin: "https://evil.example.test", "content-type": "application/json" },
    body: JSON.stringify({ token_hash: "synthetic-wrong-origin-marker", type: "invite" }),
  }));
  assert.equal(wrongOrigin.status, 403);
  assert.equal(verifyCalls.length, beforeRejectedCalls, "wrong origin must be rejected before Auth");

  const wrongType = await POST(new Request("https://app.example.test/auth/confirm", {
    method: "POST",
    headers: { origin: "https://app.example.test", "content-type": "application/json" },
    body: JSON.stringify({ token_hash: "synthetic-wrong-type-marker", type: "recovery" }),
  }));
  assert.equal(wrongType.status, 400);
  assert.equal(verifyCalls.length, beforeRejectedCalls, "wrong type must be rejected before Auth");

  const extraField = await POST(new Request("https://app.example.test/auth/confirm", {
    method: "POST",
    headers: { origin: "https://app.example.test", "content-type": "application/json" },
    body: JSON.stringify({ token_hash: "synthetic-extra-field-marker", type: "invite", extra: "rejected" }),
  }));
  assert.equal(extraField.status, 400);

  const wrongContentType = await POST(new Request("https://app.example.test/auth/confirm", {
    method: "POST",
    headers: { origin: "https://app.example.test", "content-type": "text/plain" },
    body: JSON.stringify({ token_hash: "synthetic-content-type-marker", type: "invite" }),
  }));
  assert.equal(wrongContentType.status, 415);
} finally {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

assert.deepEqual(consoleCalls, [], "confirmation route must not log raw invite material");
console.log("closed beta invite fragment checks passed (URL boundary, explicit same-origin POST, one-time handling, no-store headers, visible failure/password/acceptance UI contract)");
