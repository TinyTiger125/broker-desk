#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const moduleCache = new Map();
function loadTsModule(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (moduleCache.has(sourcePath)) return moduleCache.get(sourcePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  mod._compile(js, sourcePath);
  moduleCache.set(sourcePath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { isStagingAllowlistEnforced, isEmailOnStagingAllowlist } = loadTsModule(
  "src/lib/staging-access-policy.ts",
);

assert(isStagingAllowlistEnforced("staging"), "staging must enforce the identity allowlist");
assert(isStagingAllowlistEnforced("preview"), "controlled preview must enforce the identity allowlist");
assert(!isStagingAllowlistEnforced("production"), "formal production behavior must remain outside this gate");
assert(!isStagingAllowlistEnforced("development"), "local development must not inherit the staging-only gate");

assert(
  isEmailOnStagingAllowlist(" NeoYu0125@GMAIL.COM ", "neoyu0125@gmail.com"),
  "allowlist email matching must normalize whitespace and case",
);
assert(
  !isEmailOnStagingAllowlist("not-allowed@example.test", "neoyu0125@gmail.com"),
  "an unlisted email must be denied",
);
assert(!isEmailOnStagingAllowlist("neoyu0125@gmail.com", ""), "an empty allowlist must fail closed");
assert(!isEmailOnStagingAllowlist("neoyu0125@gmail.com", " ,  "), "a blank allowlist must fail closed");
assert(
  !isEmailOnStagingAllowlist("neoyu0125@gmail.com", "not-an-email"),
  "a malformed allowlist entry must fail closed",
);
assert(
  isEmailOnStagingAllowlist(
    "friend@example.test",
    "neoyu0125@gmail.com, friend@example.test",
  ),
  "a normalized listed email must be allowed",
);

console.log("Staging allowlist behavior: PASS");
