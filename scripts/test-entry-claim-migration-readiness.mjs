#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const sourcePath = new URL("../src/lib/data.postgres.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const sourceFile = typescript.createSourceFile("data.postgres.ts", source, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TS);
const migrationStatement = sourceFile.statements.find(
  (statement) => typescript.isVariableStatement(statement) && statement.declarationList.declarations.some(
    (declaration) => declaration.name.getText(sourceFile) === "REQUIRED_PRODUCTION_MIGRATIONS",
  ),
);
assert(migrationStatement, "data.postgres.ts must define REQUIRED_PRODUCTION_MIGRATIONS");
const migrationText = migrationStatement.getText(sourceFile);
const requiredMigrations = [...migrationText.matchAll(/"([^\"]+)"/g)].map((match) => match[1]);
assert(requiredMigrations.includes("20261102_005_entry_request_claims_runtime_acl.sql"), "readiness must require migration 005 runtime ACL");
assert(requiredMigrations.includes("20261102_006_entry_request_claims_authenticated_acl.sql"), "readiness must require migration 006 authenticated ACL");
assert(requiredMigrations.includes("20261117_001_entry_preview_review_cleanup_guards.sql"), "readiness must require the direct-review cleanup guard migration");
assert(requiredMigrations.includes("20261117_002_entry_upload_staging_cleanup_acl.sql"), "readiness must require the entry staging cleanup ACL migration");
assert.equal(
  requiredMigrations.indexOf("20261117_001_entry_preview_review_cleanup_guards.sql"),
  requiredMigrations.indexOf("20261116_003_entry_preview_review_candidates.sql") + 1,
  "direct-review cleanup guard migration must follow the original review-candidate migration",
);
assert.equal(
  requiredMigrations.indexOf("20261117_002_entry_upload_staging_cleanup_acl.sql"),
  requiredMigrations.indexOf("20261117_001_entry_preview_review_cleanup_guards.sql") + 1,
  "entry staging cleanup ACL migration must follow the direct-review cleanup migration",
);
assert.equal(
  requiredMigrations.indexOf("20261102_005_entry_request_claims_runtime_acl.sql"),
  requiredMigrations.indexOf("20261102_004_entry_request_claim_fencing.sql") + 1,
  "migration 005 must follow migration 004 in the readiness set",
);
assert.equal(
  requiredMigrations.indexOf("20261102_006_entry_request_claims_authenticated_acl.sql"),
  requiredMigrations.indexOf("20261102_005_entry_request_claims_runtime_acl.sql") + 1,
  "migration 006 must follow migration 005 in the readiness set",
);

const readinessStatement = sourceFile.statements.find(
  (statement) => typescript.isFunctionDeclaration(statement) && statement.name?.getText(sourceFile) === "assertProductionMigrationsApplied",
);
assert(readinessStatement, "data.postgres.ts must define assertProductionMigrationsApplied");
const readinessOutput = typescript.transpileModule(
  `module.exports = ${readinessStatement.getText(sourceFile)}`,
  { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 }, fileName: "data.postgres.ts" },
).outputText;
class FixtureReadinessError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const moduleRecord = { exports: {} };
vm.runInNewContext(readinessOutput, {
  module: moduleRecord,
  exports: moduleRecord.exports,
  REQUIRED_PRODUCTION_MIGRATIONS: requiredMigrations,
  ProductionReadinessError: FixtureReadinessError,
  buildHealthFailureCause: () => ({ errorClass: "FixtureError", phase: "ledger_query" }),
});
const assertProductionMigrationsApplied = moduleRecord.exports;
assert.equal(typeof assertProductionMigrationsApplied, "function", "readiness assertion must be callable in isolation");

const stoppedAt004 = requiredMigrations.filter((name) => ![
  "20261102_005_entry_request_claims_runtime_acl.sql",
  "20261102_006_entry_request_claims_authenticated_acl.sql",
].includes(name));
const full006 = [...requiredMigrations];
const fakeDatabase = (rows) => ({ query: async () => ({ rows: rows.map((name) => ({ name })) }) });
await assert.rejects(
  () => assertProductionMigrationsApplied(fakeDatabase(stoppedAt004)),
  (error) => error instanceof FixtureReadinessError && error.code === "production_migrations_required",
  "a ledger stopped at migration 004 must not satisfy production readiness",
);
await assertProductionMigrationsApplied(fakeDatabase(full006));

console.log(JSON.stringify({
  pass: true,
  requiredMigrationCount: requiredMigrations.length,
  stopAt: "20261102_004_entry_request_claim_fencing.sql",
  stopAt004: "rejected",
  completeAt: "20261102_006_entry_request_claims_authenticated_acl.sql",
  completeAt006: "accepted",
}, null, 2));
