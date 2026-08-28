import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [layoutCss, globalsCss, caseOverview, seedSource] = await Promise.all([
  readFile("src/components/layout-system/layout-system.module.css", "utf8"),
  readFile("src/app/globals.css", "utf8"),
  readFile("src/components/case-overview.tsx", "utf8"),
  readFile("scripts/uiux-demo-data.mjs", "utf8"),
]);

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertFieldGridContract(css, overview) {
  const desktop = css.match(/@media \(min-width: 64rem\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  requireMatch(desktop, /\.formRow\s*\{[\s\S]*?align-items:\s*stretch;/, "desktop field rows must stretch both cells to one row height");
  requireMatch(desktop, /\.formRow\s*>\s*\.formField\s*\{[\s\S]*?height:\s*100%;/, "each field article must fill the stretched row");
  requireMatch(overview, /const renderField = \(field: CaseOverviewField\) => \(\s*<div className="[^"]*h-full[^"]*sm:flex-row[^"]*sm:items-start/, "field content must fill its article and align value/action from the same top baseline");
  requireMatch(overview, /data-field-trigger=\{fieldAnchor\(field\.fieldKey\)\}[\s\S]*?className=\{`[^`]*min-h-11[^`]*sm:min-w-24/, "field actions must keep one stable touch target and desktop action column");
}

function assertMobileMenuContract(css) {
  const narrowViewport = css.match(/@media \(max-width: 30rem\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  requireMatch(narrowViewport, /\.app-mobile-header\s+\.app-header-menu-panel\s*\{/, "narrow header panels must use a shared viewport-safe rule");
  requireMatch(narrowViewport, /position:\s*fixed;/, "narrow header panels must escape clipping ancestors");
  requireMatch(narrowViewport, /top:\s*3\.5rem;/, "narrow header panels must remain below the sticky header");
  requireMatch(narrowViewport, /right:\s*0\.5rem;/, "narrow header panels must keep the viewport safe margin");
  requireMatch(narrowViewport, /margin-top:\s*0;/, "fixed panels must not retain trigger-relative offset");
}

function seedHelpers(source) {
  const match = source.match(/function tenantToken\([\s\S]*?\n}\n\nfunction assertOwnedMarkerWrite\([\s\S]*?\n}/);
  assert(match, "seed identity and collision helpers must remain directly executable");
  const context = vm.createContext({ createHash });
  vm.runInContext(`${match[0]}\nglobalThis.seedHelpers = { tenantToken, clientId, propertyId, caseId, assertOwnedMarkerWrite };`, context);
  return context.seedHelpers;
}

async function assertSafeFailureContract(source) {
  const match = source.match(/function reportSafeFailure\(\) \{[\s\S]*?\n\}/);
  assert(match, "seed failures must use one fixed safe reporter");
  const writes = [];
  const processStub = { stderr: { write: (value) => writes.push(value) }, exitCode: 0 };
  const context = vm.createContext({ process: processStub });
  vm.runInContext(`${match[0]}\nglobalThis.reportSafeFailure = reportSafeFailure;`, context);
  const hostileError = new Error("postgres://admin:secret@db.internal.example:5432/private_db 10.0.0.8");
  context.reportSafeFailure(hostileError);
  assert.deepEqual(writes, ["UIUX_DEMO_DATA_FAILED\n"], "failure output must be one fixed safe code");
  assert.equal(processStub.exitCode, 1, "failure output must set a nonzero exit code");
  writes.length = 0;
  await Promise.reject(hostileError).catch(context.reportSafeFailure);
  assert.deepEqual(writes, ["UIUX_DEMO_DATA_FAILED\n"], "a rejected database connection must emit only the fixed safe code");
  writes.length = 0;
  try {
    new URL("postgres://admin:secret@[db.internal.example:5432/private_db");
  } catch (error) {
    context.reportSafeFailure(error);
  }
  assert.deepEqual(writes, ["UIUX_DEMO_DATA_FAILED\n"], "a malformed database URL must emit only the fixed safe code");
  const emitted = writes.join("");
  for (const secret of ["admin", "secret", "db.internal.example", "5432", "private_db", "10.0.0.8"]) {
    assert.equal(emitted.includes(secret), false, `failure output must not contain ${secret}`);
  }
  requireMatch(source, /async function main\(\) \{[\s\S]*?buildPoolConfig\(connectionString\)[\s\S]*?await pool\.connect\(\)[\s\S]*?await client\.query\("BEGIN"\)[\s\S]*?await client\.query\("ROLLBACK"\)\.catch\(\(\) => undefined\)[\s\S]*?await pool\.end\(\);[\s\S]*?\n\}/, "URL parsing, pool connection, queries, rollback, and close must stay inside the safe main boundary");
  requireMatch(source, /await main\(\)\.catch\(reportSafeFailure\);/, "all main failures must terminate through the fixed safe reporter");
  assert.doesNotMatch(match[0], /error|message|stack|cause|connectionString|DATABASE/, "safe reporter must not inspect or print raw errors or connection data");
}

function assertExplicitPoolTargetContract(source) {
  const match = source.match(/function buildPoolConfig\(connectionString\) \{[\s\S]*?\n\}/);
  assert(match, "seed must derive one explicit validated Pool config");
  const context = vm.createContext({ URL, Set, Number, decodeURIComponent });
  vm.runInContext(`${match[0]}\nglobalThis.buildPoolConfig = buildPoolConfig;`, context);
  const config = context.buildPoolConfig("postgres://qa:secret@db.staging.example:5432/staging_db?sslmode=require&channel_binding=prefer");
  assert.deepEqual(
    JSON.parse(JSON.stringify(config)),
    { host: "db.staging.example", port: 5432, database: "staging_db", user: "qa", password: "secret", ssl: {}, enableChannelBinding: true },
    "Pool config must use the validated authority and database exactly",
  );
  for (const unsafe of [
    "?host=production.example",
    "?hostaddr=10.0.0.8",
    "?port=6432",
    "?user=admin",
    "?database=production",
    "?dbname=production",
    "?service=production",
    "?passfile=/tmp/pgpass",
    "?%68ost=production.example",
    "?sslmode=require&sslmode=verify-full",
    "?HOST=production.example",
  ]) {
    assert.throws(
      () => context.buildPoolConfig(`postgres://qa:secret@db.staging.example:5432/staging_db${unsafe}`),
      /unsupported or repeated database connection option/,
      `Pool target override ${unsafe} must be rejected`,
    );
  }
  assert.equal(
    context.buildPoolConfig("postgres://qa:secret@db.staging.example/staging_db?sslmode=require&channel_binding=disable").enableChannelBinding,
    false,
    "channel_binding=disable must map to the real node-postgres boolean key",
  );
  assert.throws(
    () => context.buildPoolConfig("postgres://qa:secret@db.staging.example/staging_db?sslmode=require&channel_binding=require"),
    /unsupported database channel binding mode/,
    "unsupported require semantics must be rejected instead of silently weakened",
  );
  assert.doesNotMatch(source, /channel_binding:\s*channelBinding/, "legacy channel_binding must never be passed to Pool");
  assert.doesNotMatch(source, /new Pool\(\{\s*connectionString/, "Pool must never receive the unvalidated raw connection string");
  requireMatch(source, /const poolConfig = buildPoolConfig\(connectionString\);[\s\S]*?remoteFingerprint = createHash\("sha256"\)[\s\S]*?poolConfig\.host[\s\S]*?poolConfig\.database[\s\S]*?new Pool\(\{ \.\.\.poolConfig, max: 1, connectionTimeoutMillis: 10_000 \}\)/, "the fingerprint and Pool must consume the same explicit validated config");
}

async function assertSeedContract(source) {
  await assertSafeFailureContract(source);
  assertExplicitPoolTargetContract(source);
  const helpers = seedHelpers(source);
  const tenantA = helpers.tenantToken("tenant-a");
  const tenantAAgain = helpers.tenantToken("tenant-a");
  const tenantB = helpers.tenantToken("tenant-b");
  assert.equal(tenantA, tenantAAgain, "tenant identity must be stable");
  assert.notEqual(tenantA, tenantB, "different tenants must get different deterministic identities");
  for (const makeId of [helpers.clientId, helpers.propertyId, helpers.caseId]) {
    assert.notEqual(makeId(tenantA, 1), makeId(tenantB, 1), "record IDs must be tenant-scoped");
  }
  assert.doesNotThrow(() => helpers.assertOwnedMarkerWrite({ rowCount: 1 }, "party", "owned"));
  assert.throws(() => helpers.assertOwnedMarkerWrite({ rowCount: 0 }, "party", "foreign"), /outside the target tenant\/marker boundary/);

  requireMatch(source, /const REMOTE_WORKSPACE_NAME = "TASK-039 Duplicate Guard Probe 1787271641750";/, "remote writes must be locked to the accepted QA workspace");
  requireMatch(source, /const REMOTE_DATABASE_FINGERPRINT = "f0b906198ebf2e9ddd5a29c3c3204c9bb366ed03d39b80b72a81dcfa775e6da4";/, "remote writes must be locked to the trusted database fingerprint");
  requireMatch(source, /remoteFingerprint === REMOTE_DATABASE_FINGERPRINT[\s\S]*?poolConfig\.port === 5432[\s\S]*?poolConfig\.ssl !== undefined[\s\S]*?BROKER_DESK_DEPLOYMENT_ENV === "staging"/, "remote writes must require the fingerprint, fixed port, TLS, and explicit Staging deployment environment");
  requireMatch(source, /NODE_ENV === "production" \|\| process\.env\.VERCEL_ENV === "production"/, "Production must remain rejected");

  for (const [table, markerColumn] of [["clients", "notes"], ["properties", "notes"], ["brokerage_cases", "case_title"]]) {
    requireMatch(
      source,
      new RegExp(`ON CONFLICT \\(id\\)[\\s\\S]*?WHERE ${table}\\.tenant_id = EXCLUDED\\.tenant_id[\\s\\S]*?AND ${table}\\.${markerColumn} LIKE \\$\\d+[\\s\\S]*?RETURNING id`),
      `${table} upserts must refuse cross-tenant or non-marker conflicts`,
    );
  }
  for (const table of ["clients", "properties", "brokerage_cases"]) {
    requireMatch(source, new RegExp(`SELECT lifecycle_status[\\s\\S]*?FROM ${table} WHERE tenant_id = \\$1 AND (?:notes|case_title) LIKE \\$2`), `${table} status must stay tenant and marker scoped`);
    requireMatch(source, new RegExp(`DELETE FROM ${table} WHERE tenant_id = \\$1[\\s\\S]*?AND (?:notes|case_title) LIKE \\$2`), `${table} cleanup must stay tenant and marker scoped`);
  }
  for (const table of ["tenant_memberships", "tenant_guarantee_template_installs", "generated_outputs"]) {
    requireMatch(source, new RegExp(`SELECT count\\(\\*\\)::int AS count FROM ${table} WHERE tenant_id = \\$1`), `${table} must be snapshotted inside the target tenant`);
  }
  requireMatch(source, /const protectedBefore = await readProtectedSnapshot\(client, tenantId\);[\s\S]*?const markerBefore = await readStatus\(client, tenantId\);[\s\S]*?if \(mode === "seed"\) await seed[\s\S]*?const protectedAfter = await readProtectedSnapshot\(client, tenantId\);[\s\S]*?assertProtectedSnapshotUnchanged\(protectedBefore, protectedAfter\);[\s\S]*?COMMIT/, "protected and marker baselines must be captured before writes and protected counts rechecked before commit");
}

assertFieldGridContract(layoutCss, caseOverview);
assertMobileMenuContract(globalsCss);
await assertSeedContract(seedSource);

assert.throws(() => assertFieldGridContract(layoutCss.replace("align-items: stretch;", "align-items: start;"), caseOverview), /stretch/);
assert.throws(() => assertMobileMenuContract(globalsCss.replace("right: 0.5rem;", "right: -0.5rem;")), /safe margin/);
await assert.rejects(assertSeedContract(seedSource.replace("${token}_${String(index).padStart(2, \"0\")}", "${String(index).padStart(2, \"0\")}")), /tenant-scoped/);
await assert.rejects(assertSeedContract(seedSource.replace("clients.tenant_id = EXCLUDED.tenant_id", "$2 = $2")), /clients upserts/);
await assert.rejects(assertSeedContract(seedSource.replace("DELETE FROM properties WHERE tenant_id = $1", "DELETE FROM properties WHERE TRUE")), /properties cleanup/);
await assert.rejects(assertSeedContract(seedSource.replace("BROKER_DESK_DEPLOYMENT_ENV === \"staging\"", "BROKER_DESK_DEPLOYMENT_ENV === \"preview\"")), /deployment environment/);
await assert.rejects(assertSeedContract(seedSource.replace("poolConfig.port === 5432", "poolConfig.port > 0")), /fixed port/);
await assert.rejects(assertSeedContract(seedSource.replace("poolConfig.ssl !== undefined", "true")), /TLS/);
await assert.rejects(assertSeedContract(seedSource.replace("TASK-039 Duplicate Guard Probe 1787271641750", "TASK-039")), /accepted QA workspace/);
await assert.rejects(assertSeedContract(seedSource.replace("f0b906198ebf2e9ddd5a29c3c3204c9bb366ed03d39b80b72a81dcfa775e6da4", "0".repeat(64))), /trusted database fingerprint/);
await assert.rejects(assertSeedContract(seedSource.replace("assertProtectedSnapshotUnchanged(protectedBefore, protectedAfter);", "assertProtectedSnapshotUnchanged(protectedAfter, protectedAfter);")), /baselines must be captured/);
await assert.rejects(assertSeedContract(seedSource.replace("await main().catch(reportSafeFailure);", "await main();")), /safe reporter/);
await assert.rejects(assertSeedContract(seedSource.replace("function reportSafeFailure() {", "function reportSafeFailure(error) {").replace('process.stderr.write("UIUX_DEMO_DATA_FAILED\\n");', "process.stderr.write(error.message);")), /fixed safe reporter|must not inspect/);
await assert.rejects(assertSeedContract(seedSource.replace('const allowedOptions = new Set(["sslmode", "channel_binding"]);', 'const allowedOptions = new Set(["sslmode", "channel_binding", "host"]);')), /must be rejected/);
await assert.rejects(assertSeedContract(seedSource.replace("new Pool({ ...poolConfig, max: 1, connectionTimeoutMillis: 10_000 })", "new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 })")), /raw connection string|same explicit validated config/);
await assert.rejects(assertSeedContract(seedSource.replace('enableChannelBinding: channelBinding === "prefer" ? true : channelBinding === "disable" ? false : undefined', "channel_binding: channelBinding || undefined")), /Pool config|legacy channel_binding|real node-postgres boolean key/);

console.log("uiux remediation contract: PASS (field-row geometry, narrow menu viewport, and tenant-isolated demo data)");
