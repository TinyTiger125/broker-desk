#!/usr/bin/env node

import assert from "node:assert/strict";
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { NextResponse as RealNextResponse } from "next/server.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

function resolveAlias(request) {
  const isLibAlias = request.startsWith("@/lib/");
  const relative = request.slice(isLibAlias ? "@/lib/".length : "@/".length);
  const base = isLibAlias ? path.resolve(ROOT, "src/lib") : path.resolve(ROOT, "src");
  const candidates = /\.(?:ts|tsx|mjs|js|cjs)$/.test(relative)
    ? [path.resolve(base, relative)]
    : [".ts", ".tsx", ".mjs", ".js", ".cjs"].map((extension) => path.resolve(base, `${relative}${extension}`));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function loadTs(sourcePath, overrides = {}) {
  const absolutePath = path.resolve(ROOT, sourcePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;

  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: absolutePath,
  }).outputText;
  const mod = new Module(absolutePath);
  mod.filename = absolutePath;
  mod.paths = Module._nodeModulePaths(ROOT);
  moduleCache.set(absolutePath, mod);
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(overrides, request)) return overrides[request];
    if (request.startsWith("@/")) return loadTs(resolveAlias(request), overrides);
    if (request === "react") return { cache: (fn) => fn };
    if (request === "next/headers") {
      return {
        cookies: async () => ({ getAll: () => [], get: () => undefined, set() {} }),
        headers: async () => new Headers(),
      };
    }
    return originalRequire(request);
  };
  mod._compile(output, absolutePath);
  return mod.exports;
}

function loadFunction(source, name, dependencies) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll("export async function ", "async function ");
  return new Function(...Object.keys(dependencies), `${compiled}\nreturn ${name};`)(...Object.values(dependencies));
}

function read(relativePath) {
  return fs.readFileSync(path.resolve(ROOT, relativePath), "utf8");
}

function assertNoNewSession(state, beforeCount, response, label) {
  assert.equal(state.sessions.size, beforeCount, `${label} must not create a new session`);
  assert.deepEqual(response.cookies.getAll(), [], `${label} must not set response cookies`);
}

async function invoke(action, form) {
  try {
    return await action({ status: "idle" }, form);
  } catch (error) {
    if (error?.redirectedTo) return error;
    throw error;
  }
}

process.env.BROKER_DESK_AUTH_MODE = "supabase";
process.env.BROKER_DESK_AUTH_PROVIDER = "supabase";
delete process.env.DATABASE_URL;
delete process.env.DATA_DRIVER;
delete process.env.BROKER_DESK_TEST_REQUEST_SCOPE;

const memory = loadTs("src/lib/data.memory.ts");
const fixtureTenantId = "tenant_cherry";
const fixtureOwnerId = "user_demo";
const fixtureEmail = `invite-integrated-${Date.now()}@example.test`;
const invitation = await memory.inviteTenantMember({
  tenantId: fixtureTenantId,
  name: "Integrated Supabase Invite",
  email: fixtureEmail,
  role: "broker",
  capability: "ordinary_member",
  invitedByUserId: fixtureOwnerId,
});
const fixtureUserId = invitation.userId;
const fixtureMembershipId = invitation.id;
const fixtureInvitationToken = invitation.invitationToken;
assert.ok(fixtureInvitationToken, "memory repository must issue a pending invitation token");
assert.equal((await memory.getUserById(fixtureUserId))?.externalAuthSubject, undefined, "fixture starts unbound");
assert.equal((await memory.getTenantMembership({ userId: fixtureUserId, tenantId: fixtureTenantId }))?.status, "invited");

const subject = `supabase:invite-integrated-${Date.now()}`;
const confirmationToken = "invite-confirmation-integrated";
const sessionCookieName = "sb-integrated-auth-token";
const state = {
  tokens: new Map([
    [confirmationToken, { subject, email: fixtureEmail, used: false, expired: false }],
    ["invite-confirmation-expired", { subject, email: fixtureEmail, used: false, expired: true }],
  ]),
  sessions: new Map(),
  nextSessionNumber: 0,
  verifyCalls: [],
  passwordUpdates: 0,
};
const requestCookieJar = new Map();

function sessionFromCookieJar() {
  const token = requestCookieJar.get(sessionCookieName);
  return token ? state.sessions.get(token) ?? null : null;
}

const syntheticAuthProvider = {
  async getIdentity() {
    const session = sessionFromCookieJar();
    if (!session?.password) return null;
    return { subject: session.subject, email: session.email, name: "Integrated Invite" };
  },
  async getSubject() {
    return (await this.getIdentity())?.subject ?? null;
  },
  async getVerifiedIdentity() {
    const session = sessionFromCookieJar();
    if (!session?.password || !session.verified) return null;
    return { subject: session.subject, email: session.email, name: "Integrated Invite" };
  },
};

const data = loadTs("src/lib/data.ts", {
  "@/lib/auth-provider": {
    getAuthIdentity: () => syntheticAuthProvider.getIdentity(),
    getAuthSubject: () => syntheticAuthProvider.getSubject(),
    getVerifiedAuthIdentity: () => syntheticAuthProvider.getVerifiedIdentity(),
  },
});
assert.equal(typeof data.getDefaultUser, "function", "actual data resolver must be available");
assert.equal(typeof data.listTenantSessionLookupsByExternalAuthSubject, "function", "actual session resolver must be available");
assert.equal(typeof data.acceptTenantInvitation, "function", "actual data acceptance facade must be available");

const callbackSource = read("src/app/auth/callback/route.ts");
const callbackBody = callbackSource.slice(callbackSource.indexOf("function safeNext("));
const callbackGET = loadFunction(callbackBody, "GET", {
  NextResponse: { redirect: (target) => ({ location: target.toString() }) },
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: async () => ({ error: null }) } }),
});
assert.equal(
  (await callbackGET(new Request("https://app.example.test/auth/callback?code=valid&next=%2Freset-password"))).location,
  "https://app.example.test/reset-password",
  "PKCE callback must preserve a safe next path",
);
assert.equal(
  (await callbackGET(new Request("https://app.example.test/auth/callback?code=valid&next=%2F%2Fevil.example"))).location,
  "https://app.example.test/workspace",
  "PKCE callback must reject an external next path",
);
const callbackFailureGET = loadFunction(callbackBody, "GET", {
  NextResponse: { redirect: (target) => ({ location: target.toString() }) },
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: async () => ({ error: new Error("expired") }) } }),
});
assert.equal(
  (await callbackFailureGET(new Request("https://app.example.test/auth/callback?code=expired&next=%2Freset-password"))).location,
  "https://app.example.test/sign-in?error=auth_callback_failed",
  "PKCE callback must fail closed when code exchange fails",
);

const confirmSource = read("src/app/auth/confirm/route.ts");
const confirmBody = confirmSource.slice(confirmSource.indexOf("type PendingCookie"));
assert.doesNotMatch(confirmSource, /export async function GET/, "raw invite tokens must not be accepted in a GET query");
function makeConfirmPOST() {
  const effects = { clientCalls: 0 };
  const cookieStore = { getAll: () => [], set() {} };
  const POST = loadFunction(confirmBody, "POST", {
    NextResponse: RealNextResponse,
    cookies: async () => cookieStore,
    getSupabaseConfig: () => ({ url: "https://supabase.example.test", key: "publishable-key" }),
    createServerClient: (_url, _key, options) => {
      effects.clientCalls += 1;
      return {
        auth: {
          verifyOtp: async ({ token_hash: tokenHash, type }) => {
            state.verifyCalls.push({ tokenHash, type });
            const token = state.tokens.get(tokenHash);
            if (type !== "invite" || !token || token.used || token.expired) {
              return { data: { session: null }, error: new Error("invite token unavailable") };
            }
            token.used = true;
            const sessionToken = `integrated-session-${++state.nextSessionNumber}`;
            state.sessions.set(sessionToken, {
              token: sessionToken,
              subject: token.subject,
              email: token.email,
              verified: true,
              password: null,
            });
            options.cookies.setAll(
              [{ name: sessionCookieName, value: sessionToken, options: { path: "/", httpOnly: true, sameSite: "lax" } }],
              { "cache-control": "private, no-store" },
            );
            return { data: { session: { user: { id: "synthetic-auth-user" }, access_token: sessionToken } }, error: null };
          },
        },
      };
    },
  });
  return { POST, effects };
}

const validConfirm = makeConfirmPOST();
const validResponse = await validConfirm.POST(new Request("https://app.example.test/auth/confirm", {
  method: "POST",
  headers: { origin: "https://app.example.test", "content-type": "application/json" },
  body: JSON.stringify({ token_hash: confirmationToken, type: "invite", next: "/reset-password" }),
}));
assert.equal(validResponse.status, 200);
assert.deepEqual(await validResponse.clone().json(), { ok: true, redirectTo: "/reset-password" });
assert.equal(validConfirm.effects.clientCalls, 1);
assert.deepEqual(state.verifyCalls, [{ tokenHash: confirmationToken, type: "invite" }]);
const sessionCookie = validResponse.cookies.get(sessionCookieName);
assert.ok(sessionCookie?.value, "valid confirmation must emit the session cookie on its redirect response");
assert.equal(validResponse.headers.get("cache-control"), "private, no-store");
assert.equal(validResponse.headers.get("referrer-policy"), "no-referrer");
assert.ok(!(await validResponse.clone().text()).includes(confirmationToken), "confirmation must not leak token_hash");
requestCookieJar.set(sessionCookieName, sessionCookie.value);
assert.ok(state.sessions.has(sessionCookie.value), "response cookie must identify the synthetic Auth session");

const invalidBaselineSessionCount = state.sessions.size;
const wrongType = makeConfirmPOST();
const wrongTypeResponse = await wrongType.POST(new Request("https://app.example.test/auth/confirm", {
  method: "POST",
  headers: { origin: "https://app.example.test", "content-type": "application/json" },
  body: JSON.stringify({ token_hash: confirmationToken, type: "recovery", next: "/reset-password" }),
}));
assert.equal(wrongTypeResponse.status, 400);
assert.equal(wrongType.effects.clientCalls, 0, "wrong type must be rejected before Auth verification");
assertNoNewSession(state, invalidBaselineSessionCount, wrongTypeResponse, "wrong type");

const expired = makeConfirmPOST();
const expiredResponse = await expired.POST(new Request("https://app.example.test/auth/confirm", {
  method: "POST",
  headers: { origin: "https://app.example.test", "content-type": "application/json" },
  body: JSON.stringify({ token_hash: "invite-confirmation-expired", type: "invite", next: "/reset-password" }),
}));
assert.equal(expiredResponse.status, 401);
assert.equal(expired.effects.clientCalls, 1);
assertNoNewSession(state, invalidBaselineSessionCount, expiredResponse, "expired token");

const reused = makeConfirmPOST();
const reusedResponse = await reused.POST(new Request("https://app.example.test/auth/confirm", {
  method: "POST",
  headers: { origin: "https://app.example.test", "content-type": "application/json" },
  body: JSON.stringify({ token_hash: confirmationToken, type: "invite", next: "/reset-password" }),
}));
assert.equal(reusedResponse.status, 401);
assert.equal(reused.effects.clientCalls, 1);
assertNoNewSession(state, invalidBaselineSessionCount, reusedResponse, "reused token");

const resetSource = read("src/components/supabase-reset-password-form.tsx");
const resetPasswordBody = resetSource.slice(
  resetSource.indexOf("export async function updateSupabasePassword"),
  resetSource.indexOf("export function SupabaseResetPasswordForm"),
);
const updateSupabasePassword = loadFunction(resetPasswordBody, "updateSupabasePassword", {});
const firstPasswordAuth = {
  async updateUser({ password }) {
    const session = sessionFromCookieJar();
    if (!session) return { error: new Error("no authenticated session") };
    if (!password || password.length < 8) return { error: new Error("weak password") };
    if (session.password) return { error: new Error("password already set") };
    session.password = password;
    state.passwordUpdates += 1;
    return { error: null };
  },
};
assert.equal(await data.getDefaultUser(), null, "resolver must not bind before first-password state is established");
await assert.rejects(
  () => updateSupabasePassword(firstPasswordAuth, "weak"),
  /weak password/,
  "first-password helper must surface Auth update failure",
);
await updateSupabasePassword(firstPasswordAuth, "integrated-first-password");
assert.equal(state.passwordUpdates, 1);
assert.equal(sessionFromCookieJar()?.password, "integrated-first-password");

const resolvedUser = await data.getDefaultUser();
assert.equal(resolvedUser?.id, fixtureUserId, "actual resolver must bind the session identity to the pending invite user");
assert.equal(resolvedUser?.externalAuthSubject, subject);
const boundUser = await memory.getUserById(fixtureUserId);
assert.equal(boundUser?.externalAuthSubject, subject, "memory binding must persist the session subject");
const pendingLookup = await data.listTenantSessionLookupsByExternalAuthSubject(subject);
assert.equal(pendingLookup.length, 1);
assert.equal(pendingLookup[0].membership.id, fixtureMembershipId);
assert.equal(pendingLookup[0].membership.status, "invited", "resolver must see the existing pending membership before acceptance");

const actions = read("src/app/actions.ts");
const invitationBody = actions.slice(
  actions.indexOf("export type TenantInvitationActionMessageToken"),
  actions.indexOf("export async function createTenantAccountAction"),
);
const actionEffects = { cookies: [], revalidated: [] };
const actionCookieStore = {
  set(...args) {
    actionEffects.cookies.push(args);
  },
};
const acceptAction = loadFunction(invitationBody, "acceptTenantInvitationAction", {
  getVerifiedAuthIdentity: () => syntheticAuthProvider.getVerifiedIdentity(),
  isClerkAuthEnabled: () => false,
  isSupabaseAuthEnabled: () => true,
  getDefaultUser: data.getDefaultUser,
  acceptTenantInvitation: data.acceptTenantInvitation,
  cookies: async () => actionCookieStore,
  ACTIVE_TENANT_COOKIE_NAME: "active_tenant",
  revalidatePath: (value) => actionEffects.revalidated.push(value),
  redirect: (value) => { throw { redirectedTo: value }; },
});

function invitationForm(overrides = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    tenantId: fixtureTenantId,
    membershipId: fixtureMembershipId,
    invitationToken: fixtureInvitationToken,
    ...overrides,
  })) form.set(key, value);
  return form;
}

function acceptanceSnapshot() {
  const db = globalThis.__brokerDb;
  const user = db.users.find((item) => item.id === fixtureUserId);
  const membership = db.tenantMemberships.find((item) => item.id === fixtureMembershipId);
  return JSON.stringify({
    user,
    membership,
    acceptanceAudits: db.auditLogs.filter((item) => item.targetId === fixtureMembershipId && item.action === "tenant_invitation_accepted"),
  });
}

const beforeWrongInput = acceptanceSnapshot();
const wrongTenant = await invoke(acceptAction, invitationForm({ tenantId: "tenant-does-not-exist" }));
assert.deepEqual(wrongTenant, { status: "error", message: "invitation_unavailable" });
assert.equal(acceptanceSnapshot(), beforeWrongInput, "wrong tenant must not mutate the pending membership");
const wrongMembership = await invoke(acceptAction, invitationForm({ membershipId: "membership-does-not-exist" }));
assert.deepEqual(wrongMembership, { status: "error", message: "invitation_unavailable" });
assert.equal(acceptanceSnapshot(), beforeWrongInput, "wrong membership must not mutate the pending membership");

const session = sessionFromCookieJar();
assert.ok(session);
const originalEmail = session.email;
session.email = "wrong-identity@example.test";
const wrongIdentity = await invoke(acceptAction, invitationForm());
assert.deepEqual(wrongIdentity, { status: "error", message: "invitation_email_mismatch" });
assert.equal(acceptanceSnapshot(), beforeWrongInput, "wrong identity must not mutate the pending membership");
session.email = originalEmail;

const accepted = await invoke(acceptAction, invitationForm());
assert.deepEqual(accepted, { redirectedTo: "/" });
assert.deepEqual(actionEffects.cookies[0]?.slice(0, 2), ["active_tenant", fixtureTenantId]);
assert.deepEqual(actionEffects.revalidated, ["/workspace", "/workspace/invitations"]);
const acceptedMembership = await memory.getTenantMembership({ userId: fixtureUserId, tenantId: fixtureTenantId });
assert.equal(acceptedMembership?.status, "active");
assert.equal(acceptedMembership?.invitationStatus, "accepted");
const acceptedLookup = await data.listTenantSessionLookupsByExternalAuthSubject(subject);
assert.equal(acceptedLookup[0].membership.status, "active", "session resolver must observe the accepted membership");
const auditCountAfterAccept = globalThis.__brokerDb.auditLogs.filter(
  (item) => item.targetId === fixtureMembershipId && item.action === "tenant_invitation_accepted",
).length;
assert.equal(auditCountAfterAccept, 1);

const repeated = await invoke(acceptAction, invitationForm());
assert.deepEqual(repeated, { status: "error", message: "invitation_unavailable" });
assert.equal(
  globalThis.__brokerDb.auditLogs.filter((item) => item.targetId === fixtureMembershipId && item.action === "tenant_invitation_accepted").length,
  auditCountAfterAccept,
  "repeated acceptance must not write a second audit",
);

assert.equal(state.sessions.size, 1, "only the valid confirmation may establish a session");
assert.equal(state.passwordUpdates, 1, "first-password handler must run exactly once");
console.log("Supabase invite integrated stateful acceptance: PASS (PKCE, confirmation cookies, expiry/reuse/type, first password, resolver binding, tenant/membership/identity guards, repeat acceptance)");
