import { generateKeyPairSync, sign } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import ts from "typescript";
import { NextRequest } from "next/server.js";

const proxySource = (await readFile(new URL("../src/lib/supabase/proxy.ts", import.meta.url), "utf8"))
  .replaceAll('from "next/server"', 'from "next/server.js"');
const proxyModulePath = new URL("./.proxy-fixture-transpiled.mjs", import.meta.url);
await writeFile(proxyModulePath, ts.transpileModule(proxySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);
const proxyModule = await import(proxyModulePath.href);
await unlink(proxyModulePath);

globalThis.WebSocket = class FixtureWebSocket {};
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fixture-publishable-key";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" });
globalThis.fetch = async () => Response.json({ keys: [{ ...publicJwk, kid: "fixture-key", alg: "RS256", use: "sig" }] });

function makeJwt(subject) {
  const header = base64url(JSON.stringify({ alg: "RS256", kid: "fixture-key", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ sub: subject, email: "fixture@example.test", exp: Math.floor(Date.now() / 1000) + 300 }));
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

console.log("supabase proxy fixture passed (verified cookie session and invalid-JWT redirect)");
