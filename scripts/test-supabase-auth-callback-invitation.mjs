import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { NextResponse as RealNextResponse } from "next/server.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function loadFunction(source, name, dependencies) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll("export async function ", "async function ");
  return new Function(...Object.keys(dependencies), `${compiled}\nreturn ${name};`)(...Object.values(dependencies));
}

const callbackSource = await read("src/app/auth/callback/route.ts");
const callbackBody = callbackSource.slice(callbackSource.indexOf("function safeNext("));
const confirmSource = await read("src/app/auth/confirm/route.ts");
const confirmBody = confirmSource.slice(confirmSource.indexOf("type PendingCookie"));
const resetSource = await read("src/components/supabase-reset-password-form.tsx");
const resetPasswordBody = resetSource.slice(
  resetSource.indexOf("export async function updateSupabasePassword"),
  resetSource.indexOf("export function SupabaseResetPasswordForm"),
);
const invitationTemplate = await read("config/supabase/invitation-email.candidate.html");
assert.match(invitationTemplate, /\{\{ \.SiteURL \}\}\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&amp;type=invite&amp;next=%2Freset-password/);
assert.doesNotMatch(invitationTemplate, /\{\{ \.ConfirmationURL \}\}/, "local candidate must target the invite-specific token_hash route");

async function callbackResult(input, exchange) {
  const GET = loadFunction(callbackBody, "GET", {
    NextResponse: { redirect: (target) => ({ location: target.toString() }) },
    createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
  });
  return GET(new Request(`https://app.example.test/auth/callback${input}`));
}

assert.equal(
  (await callbackResult("?code=valid&next=%2Freset-password", async () => ({ error: null }))).location,
  "https://app.example.test/reset-password",
);
assert.equal(
  (await callbackResult("?code=valid&next=%2F%2Fevil.example", async () => ({ error: null }))).location,
  "https://app.example.test/workspace",
);
for (const [query, exchange] of [
  ["?next=%2Freset-password", async () => { throw new Error("must not exchange absent code"); }],
  ["?code=expired&next=%2Freset-password", async () => ({ error: new Error("expired") })],
  ["?code=network&next=%2Freset-password", async () => { throw new Error("network"); }],
]) {
  assert.equal(
    (await callbackResult(query, exchange)).location,
    "https://app.example.test/sign-in?error=auth_callback_failed",
  );
}

function makeConfirmHarness({
  query,
  verifyError = null,
  session = { user: { id: "user-1" } },
  setCookies = [],
  setHeaders = {},
  existingCookies = [],
}) {
  const effects = {
    verifyCalls: [],
    clientCalls: 0,
    cookieStoreSets: [],
    response: null,
  };
  const cookieStore = {
    getAll: () => existingCookies,
    set: (...args) => effects.cookieStoreSets.push(args),
  };
  const NextResponse = {
    redirect: (target) => {
      const response = RealNextResponse.redirect(target);
      effects.response = response;
      return response;
    },
  };
  const GET = loadFunction(confirmBody, "GET", {
    NextResponse,
    cookies: async () => cookieStore,
    getSupabaseConfig: () => ({ url: "https://supabase.example.test", key: "publishable-key" }),
    createServerClient: (_url, _key, options) => {
      effects.clientCalls += 1;
      return {
        auth: {
          verifyOtp: async (input) => {
            effects.verifyCalls.push(input);
            if (verifyError) return { data: { session: null }, error: verifyError };
            options.cookies.setAll(setCookies, setHeaders);
            return { data: { session }, error: null };
          },
          signOut: async () => { throw new Error("confirm route must not sign out"); },
        },
      };
    },
  });
  return { GET, effects, query };
}

const inviteToken = "invite-token-fixture";
const validConfirm = makeConfirmHarness({
  query: `?token_hash=${inviteToken}&type=invite&next=%2Freset-password`,
  setCookies: [{ name: "sb-fixture-auth-token", value: "session-cookie", options: { path: "/", httpOnly: true } }],
  setHeaders: { "cache-control": "private, no-store" },
});
const validConfirmResponse = await validConfirm.GET(new Request(`https://app.example.test/auth/confirm${validConfirm.query}`));
assert.equal(validConfirmResponse.headers.get("location"), "https://app.example.test/reset-password");
assert.deepEqual(validConfirm.effects.verifyCalls, [{ token_hash: inviteToken, type: "invite" }]);
assert.deepEqual(validConfirmResponse.cookies.getAll().map(({ name, value }) => ({ name, value })), [{ name: "sb-fixture-auth-token", value: "session-cookie" }]);
assert.match(validConfirmResponse.headers.get("set-cookie") ?? "", /HttpOnly/i);
assert.equal(validConfirmResponse.headers.get("cache-control"), "private, no-store");
assert.equal(validConfirm.effects.cookieStoreSets.length, 0, "invite confirmation must persist cookies on its redirect response");
assert.ok(!validConfirmResponse.headers.get("location")?.includes(inviteToken), "successful redirect must not leak token_hash");

const unsafeNext = makeConfirmHarness({
  query: `?token_hash=${inviteToken}&type=invite&next=%2F%2Fevil.example`,
  setCookies: [{ name: "sb-fixture-auth-token", value: "session-cookie", options: { path: "/" } }],
});
assert.equal(
  (await unsafeNext.GET(new Request(`https://app.example.test/auth/confirm${unsafeNext.query}`))).headers.get("location"),
  "https://app.example.test/reset-password",
);

for (const [label, query, verifyError, expectedClientCalls] of [
  ["missing token", "?type=invite", null, 0],
  ["wrong type", `?token_hash=${inviteToken}&type=recovery`, null, 0],
  ["expired token", `?token_hash=${inviteToken}&type=invite`, new Error("expired"), 1],
  ["reused token", `?token_hash=${inviteToken}&type=invite`, new Error("already used"), 1],
]) {
  const fixture = makeConfirmHarness({
    query,
    verifyError,
    existingCookies: [{ name: "sb-fixture-auth-token", value: "existing-session" }],
  });
  const response = await fixture.GET(new Request(`https://app.example.test/auth/confirm${fixture.query}`));
  assert.equal(response.headers.get("location"), "https://app.example.test/sign-in?error=invite_confirmation_failed", label);
  assert.equal(fixture.effects.clientCalls, expectedClientCalls, label);
  assert.deepEqual(response.cookies.getAll(), [], `${label} must not establish a new session`);
  assert.ok(!response.headers.get("location")?.includes(inviteToken), `${label} must not leak token_hash`);
}

const duplicateType = makeConfirmHarness({ query: `?token_hash=${inviteToken}&type=invite&type=recovery` });
assert.equal(
  (await duplicateType.GET(new Request(`https://app.example.test/auth/confirm${duplicateType.query}`))).headers.get("location"),
  "https://app.example.test/sign-in?error=invite_confirmation_failed",
);

const updateSupabasePassword = loadFunction(resetPasswordBody, "updateSupabasePassword", {});
let passwordUpdated = null;
await updateSupabasePassword({
  updateUser: async (input) => {
    passwordUpdated = input.password;
    return { error: null };
  },
}, "first-password-fixture");
assert.equal(passwordUpdated, "first-password-fixture");
await assert.rejects(
  () => updateSupabasePassword({ updateUser: async () => ({ error: new Error("weak password") }) }, "weak"),
  /weak password/,
);

const actions = await read("src/app/actions.ts");
const invitationBody = actions.slice(
  actions.indexOf("export type TenantInvitationActionMessageToken"),
  actions.indexOf("export async function createTenantAccountAction"),
);
assert.ok(invitationBody.startsWith("export type") && invitationBody.includes("acceptTenantInvitationAction"));

function scenario(overrides = {}) {
  const identity = overrides.identity === undefined
    ? { subject: "supabase:verified", email: "INVITED@example.test" }
    : overrides.identity;
  const user = overrides.user === undefined
    ? { id: "user-1", email: "invited@example.test", externalAuthSubject: "supabase:verified" }
    : overrides.user;
  const membership = {
    id: "membership-1",
    tenantId: "tenant-1",
    user: { id: "user-1" },
    token: "secret-token",
    expiresAt: Date.now() + 60_000,
    status: "invited",
    ...overrides.membership,
  };
  const effects = { accepts: 0, cookies: [], revalidated: [] };
  const action = loadFunction(invitationBody, "acceptTenantInvitationAction", {
    getVerifiedAuthIdentity: async () => identity,
    isClerkAuthEnabled: () => overrides.provider === "clerk",
    isSupabaseAuthEnabled: () => overrides.provider !== "clerk",
    getDefaultUser: async () => user,
    acceptTenantInvitation: async (input) => {
      effects.accepts += 1;
      if (overrides.acceptError) throw overrides.acceptError;
      if (overrides.acceptedMember) return overrides.acceptedMember;
      if (!user || input.userId !== membership.user.id || input.tenantId !== membership.tenantId
        || input.membershipId !== membership.id || input.invitationToken !== membership.token
        || membership.status !== "invited" || membership.expiresAt <= Date.now()) return null;
      membership.status = "active";
      return membership;
    },
    cookies: async () => ({ set: (...args) => {
      if (overrides.cookieError) throw overrides.cookieError;
      effects.cookies.push(args);
    } }),
    ACTIVE_TENANT_COOKIE_NAME: "active_tenant",
    revalidatePath: (path) => effects.revalidated.push(path),
    redirect: (path) => { throw { redirectedTo: path }; },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    tenantId: "tenant-1", membershipId: "membership-1", invitationToken: "secret-token",
    ...overrides.form,
  })) form.set(key, value);
  return { action, form, effects };
}

async function run(overrides) {
  const { action, form, effects } = scenario(overrides);
  return { result: await invoke(action, form), effects };
}

async function invoke(action, form) {
  try {
    return await action({ status: "idle" }, form);
  } catch (error) {
    if (error?.redirectedTo) return error;
    throw error;
  }
}

for (const provider of ["supabase", "clerk"]) {
  const subject = `${provider}:verified`;
  const { result, effects } = await run({ provider, identity: {
    subject, email: "INVITED@example.test",
  }, user: { id: "user-1", email: "invited@example.test", externalAuthSubject: subject } });
  assert.deepEqual(result, { redirectedTo: "/" });
  assert.equal(effects.accepts, 1);
  assert.equal(effects.cookies[0][1], "tenant-1");
  assert.deepEqual(effects.revalidated, ["/workspace", "/workspace/invitations"]);
}

for (const [label, overrides, expected, acceptCalls] of [
  ["unverified", { identity: null }, "email_verification_required", 0],
  ["unbound", { user: null }, "invitation_identity_not_bound", 0],
  ["subject mismatch", { user: { id: "user-1", email: "invited@example.test", externalAuthSubject: "supabase:other" } }, "invitation_identity_not_bound", 0],
  ["email mismatch", { identity: { subject: "supabase:verified", email: "other@example.test" } }, "invitation_email_mismatch", 0],
  ["invalid payload", { form: { invitationToken: "" } }, "invitation_payload_invalid", 0],
  ["wrong tenant", { form: { tenantId: "tenant-2" } }, "invitation_unavailable", 1],
  ["wrong membership", { form: { membershipId: "membership-2" } }, "invitation_unavailable", 1],
  ["wrong token", { form: { invitationToken: "wrong" } }, "invitation_unavailable", 1],
  ["expired", { membership: { expiresAt: Date.now() - 1 } }, "invitation_unavailable", 1],
  ["already accepted", { membership: { status: "active" } }, "invitation_unavailable", 1],
  ["backend error", { acceptError: new Error("db unavailable") }, "invitation_accept_failed", 1],
  ["returned foreign member", { acceptedMember: { id: "membership-1", tenantId: "tenant-2", user: { id: "user-1" } } }, "invitation_unavailable", 1],
  ["cookie failure", { cookieError: new Error("cookie unavailable") }, "accepted_workspace_switch_failed", 1],
]) {
  const { result, effects } = await run(overrides);
  assert.deepEqual(result, { status: "error", message: expected }, label);
  assert.equal(effects.accepts, acceptCalls, label);
  assert.equal(effects.cookies.length, 0, label);
}

const repeated = scenario();
assert.deepEqual(await invoke(repeated.action, repeated.form), { redirectedTo: "/" });
assert.deepEqual(await invoke(repeated.action, repeated.form), { status: "error", message: "invitation_unavailable" });
assert.equal(repeated.effects.cookies.length, 1);

const firstPasswordMembership = await run({
  provider: "supabase",
  identity: { subject: "supabase:verified", email: "INVITED@example.test" },
  user: { id: "user-1", email: "invited@example.test", externalAuthSubject: "supabase:verified" },
});
assert.deepEqual(firstPasswordMembership.result, { redirectedTo: "/" });
assert.equal(firstPasswordMembership.effects.accepts, 1, "first password flow must accept the existing membership exactly once");

console.log("Supabase callback and invitation action behavior: PASS (success, failure, expiry, identity, tenant, repeat)");
