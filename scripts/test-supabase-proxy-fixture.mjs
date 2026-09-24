import { generateKeyPairSync, sign } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";

const identityModulePath = new URL("./.identity-fixture-transpiled.mjs", import.meta.url);
const identitySource = await readFile(new URL("../src/lib/supabase/identity.ts", import.meta.url), "utf8");
await writeFile(identityModulePath, ts.transpileModule(identitySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);
const proxySource = (await readFile(new URL("../src/lib/supabase/proxy.ts", import.meta.url), "utf8"))
  .replaceAll('from "next/server"', 'from "next/server.js"')
  .replaceAll('from "@/lib/supabase/identity"', 'from "./.identity-fixture-transpiled.mjs"');
const proxyModulePath = new URL("./.proxy-fixture-transpiled.mjs", import.meta.url);
await writeFile(proxyModulePath, ts.transpileModule(proxySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);
const proxyModule = await import(proxyModulePath.href);
await unlink(proxyModulePath);

const sourceWithCookieState = NextResponse.next();
sourceWithCookieState.cookies.set({ name: "sb-fixture-auth-token", value: "", maxAge: 0, path: "/", httpOnly: true, secure: true, sameSite: "lax" });
sourceWithCookieState.headers.set("cache-control", "private, no-store");
const copiedStateResponse = proxyModule.copySupabaseResponseState(sourceWithCookieState, NextResponse.redirect("https://brokerdesk.test/sign-in"));
const copiedSetCookie = copiedStateResponse.headers.get("set-cookie") ?? "";
if (!/max-age=0/i.test(copiedSetCookie) || !/path=\//i.test(copiedSetCookie) || !/httponly/i.test(copiedSetCookie)) {
  throw new Error(`response cookie attributes were not preserved: ${copiedSetCookie}`);
}
if (!/no-store/i.test(copiedStateResponse.headers.get("cache-control") ?? "")) {
  throw new Error("response cache headers were not preserved");
}

globalThis.WebSocket = class FixtureWebSocket {};
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fixture-publishable-key";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" });
globalThis.fetch = async () => Response.json({ keys: [{ ...publicJwk, kid: "fixture-key", alg: "RS256", use: "sig" }] });

function makeJwt(subject, overrides = {}) {
  const header = base64url(JSON.stringify({ alg: "RS256", kid: "fixture-key", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: subject,
    email: "fixture@example.test",
    iss: "https://fixture.supabase.test/auth/v1",
    aud: "authenticated",
    role: "authenticated",
    aal: "aal1",
    session_id: "session_fixture_01",
    is_anonymous: false,
    iat: now - 30,
    exp: now + 300,
    ...overrides,
  }));
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

function makeCookie(token) {
  const session = {
    access_token: token,
    refresh_token: "fixture-refresh-token",
    expires_in: 300,
    expires_at: Math.floor(Date.now() / 1000) + 300,
    token_type: "bearer",
    user: { id: "user_fixture_01", aud: "authenticated", role: "authenticated" },
  };
  return `sb-fixture-auth-token=base64-${base64url(JSON.stringify(session))}`;
}

const validRequest = new NextRequest("https://brokerdesk.test/workspace", { headers: { cookie: makeCookie(makeJwt("user_fixture_01")) } });
const validResponse = await proxyModule.updateSupabaseSession(validRequest, { requireAuth: true });
if (validResponse.status !== 200) throw new Error(`valid session was rejected: ${validResponse.status}`);

const invalidRequest = new NextRequest("https://brokerdesk.test/workspace", { headers: { cookie: makeCookie(makeJwt("user_fixture_01").slice(0, -2) + "xx") } });
const invalidResponse = await proxyModule.updateSupabaseSession(invalidRequest, { requireAuth: true });
if (invalidResponse.status !== 307 || !invalidResponse.headers.get("location")?.includes("/sign-in")) {
  throw new Error(`invalid session was not redirected: ${invalidResponse.status}`);
}

const clearedRequest = new NextRequest("https://brokerdesk.test/workspace");
const clearedResponse = await proxyModule.updateSupabaseSession(clearedRequest, { requireAuth: true });
if (clearedResponse.status !== 307 || !clearedResponse.headers.get("location")?.includes("/sign-in")) {
  throw new Error(`cleared session remained authorized: ${clearedResponse.status}`);
}

for (const [label, overrides] of [
  ["expired", { iat: Math.floor(Date.now() / 1000) - 600, exp: Math.floor(Date.now() / 1000) - 300 }],
  ["wrong issuer", { iss: "https://evil.example/auth/v1" }],
  ["wrong audience", { aud: "service_role" }],
  ["wrong role", { role: "service_role" }],
  ["anonymous", { is_anonymous: true }],
]) {
  const request = new NextRequest("https://brokerdesk.test/workspace", { headers: { cookie: makeCookie(makeJwt("user_fixture_01", overrides)) } });
  const response = await proxyModule.updateSupabaseSession(request, { requireAuth: true });
  if (response.status !== 307 || !response.headers.get("location")?.includes("/sign-in")) {
    throw new Error(`${label} session was accepted: ${response.status}`);
  }
}

console.log("supabase proxy fixture passed (valid, tampered, expired, issuer/audience/role/anonymous claim boundaries)");
await unlink(identityModulePath);
