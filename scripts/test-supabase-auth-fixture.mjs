import { generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const identitySource = await readFile(new URL("../src/lib/supabase/identity.ts", import.meta.url), "utf8");
const identityModule = await import(`data:text/javascript,${encodeURIComponent(ts.transpileModule(identitySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText)}`);

// Auth verification does not need Realtime; provide a local constructor so
// Node 20 can instantiate the isomorphic client without a network WebSocket.
globalThis.WebSocket = class FixtureWebSocket {};

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" });
const header = { alg: "RS256", kid: "fixture-key", typ: "JWT" };
const payload = {
  sub: "user_fixture_01",
  email: "fixture@example.test",
  iss: "https://fixture.supabase.test/auth/v1",
  aud: "authenticated",
  role: "authenticated",
  aal: "aal1",
  session_id: "session_fixture_01",
  is_anonymous: false,
  user_metadata: { full_name: "Fixture User" },
  exp: Math.floor(Date.now() / 1000) + 300,
};
const encodedHeader = base64url(JSON.stringify(header));
const encodedPayload = base64url(JSON.stringify(payload));
const signingInput = `${encodedHeader}.${encodedPayload}`;
const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
const jwt = `${signingInput}.${signature}`;

globalThis.fetch = async () => Response.json({ keys: [{ ...publicJwk, kid: "fixture-key", alg: "RS256", use: "sig" }] });

const client = createClient("https://fixture.supabase.test", "fixture-publishable-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const valid = await client.auth.getClaims(jwt, { keys: [publicJwk] });
if (valid.error || valid.data?.claims?.sub !== payload.sub) {
  throw new Error(`valid fixture was rejected: ${valid.error?.message ?? "missing claims"}`);
}
const identity = identityModule.normalizeSupabaseIdentity(valid.data.claims);
if (identity?.subject !== "supabase:user_fixture_01" || identity.email !== payload.email || identity.name !== "Fixture User") {
  throw new Error(`subject mapping failed: ${JSON.stringify(identity)}`);
}
if (!identityModule.validateSupabaseClaims(valid.data.claims, "https://fixture.supabase.test")) {
  throw new Error("valid standard claims were rejected");
}
for (const altered of [
  { ...payload, iss: "https://evil.example/auth/v1" },
  { ...payload, aud: "service_role" },
  { ...payload, role: "service_role" },
  { ...payload, is_anonymous: true },
]) {
  if (identityModule.validateSupabaseClaims(altered, "https://fixture.supabase.test")) {
    throw new Error(`invalid claims were accepted: ${JSON.stringify(altered)}`);
  }
}

const tampered = `${encodedHeader}.${base64url(JSON.stringify({ ...payload, sub: "attacker" }))}.${signature}`;
const invalid = await client.auth.getClaims(tampered, { keys: [publicJwk] });
if (!invalid.error || invalid.data) throw new Error("tampered fixture was accepted");

console.log("supabase auth fixture passed (valid JWKS signature, subject mapping, tampered signature rejection)");
