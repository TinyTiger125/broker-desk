#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.resolve("src/lib/request-rate-limit.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const mod = new Module(sourcePath);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(js, sourcePath);

const { classifyRequestRateLimit, createRequestRateLimiter } = mod.exports;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const authRequest = new Request("https://brokerdesk.example.test/sign-in", {
  headers: { "x-forwarded-for": "198.51.100.40" },
});
const mutationRequest = new Request("https://brokerdesk.example.test/api/input-files/upload", {
  method: "POST",
  headers: { "x-forwarded-for": "198.51.100.40" },
});
const downloadRequest = new Request("https://brokerdesk.example.test/api/attachments/attachment_1", {
  headers: { "x-forwarded-for": "198.51.100.40" },
});
const ordinaryRequest = new Request("https://brokerdesk.example.test/workspace");

assert(classifyRequestRateLimit(authRequest) === "authentication", "sign-in route must have auth rate limit");
assert(classifyRequestRateLimit(mutationRequest) === "mutation", "mutating API must have mutation rate limit");
assert(classifyRequestRateLimit(downloadRequest) === "download", "attachment route must have download rate limit");
assert(classifyRequestRateLimit(ordinaryRequest) === undefined, "ordinary reads must not be rate limited in app memory");

const limiter = createRequestRateLimiter();
const start = 1_000_000;
for (let count = 0; count < 30; count += 1) {
  assert(limiter(authRequest, start).allowed, `auth request ${count + 1} should be allowed`);
}
const blocked = limiter(authRequest, start);
assert(!blocked.allowed, "31st auth request must be rejected");
assert(blocked.retryAfterSeconds === 60, "blocked auth request must provide retry window");
assert(limiter(authRequest, start + 60_000).allowed, "auth window must reset after its expiry");

console.log("[PASS] request rate limiter classification, limits and reset behavior verified");
