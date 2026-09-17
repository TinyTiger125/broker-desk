import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith("@/")) {
    const mapped = resolve(root, "src", request.slice(2));
    if (existsSync(`${mapped}.ts`)) return `${mapped}.ts`;
  }
  return originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = function (module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const { resolveObjectImportFeatureReadiness } = require(resolve(root, "src/lib/object-import-contract.ts"));
assert.deepEqual(resolveObjectImportFeatureReadiness({ migrationApplied: false, targetsTablePresent: false, fieldsTablePresent: false }), { ready: false, reason: "migration_required" });
assert.deepEqual(resolveObjectImportFeatureReadiness({ migrationApplied: true, targetsTablePresent: false, fieldsTablePresent: false }), { ready: false, reason: "schema_incomplete" });
assert.deepEqual(resolveObjectImportFeatureReadiness({ migrationApplied: true, targetsTablePresent: true, fieldsTablePresent: true }), { ready: true });

const page = readFileSync(resolve(root, "src/app/cases/[id]/page.tsx"), "utf8");
const uploadAction = readFileSync(resolve(root, "src/app/object-import-actions.ts"), "utf8");
const postgres = readFileSync(resolve(root, "src/lib/data.postgres.ts"), "utf8");
assert.match(page, /const objectImportReadiness = await getObjectImportFeatureReadiness\(\);/);
assert.match(page, /objectImportReadiness\.ready\s*\?\s*await listObjectImportTargets/);
assert.match(page, /objectImportUploadAction=\{canWriteCase && objectImportReadiness\.ready \? uploadObjectImportAction : undefined\}/);
assert.match(uploadAction, /const readiness = await getObjectImportFeatureReadiness\(\);/);
assert.match(uploadAction, /object_import_feature_unavailable:\$\{readiness\.reason\}/);
assert.match(postgres, /broker_desk_schema_migrations WHERE name=\$1/);
assert.match(postgres, /to_regclass\('public\.object_import_targets'\)/);
assert.match(postgres, /to_regclass\('public\.object_import_fields'\)/);
console.log("PASS: object-import readiness distinguishes missing migration/schema from ready state; case page skips object-table reads and upload when unavailable");
