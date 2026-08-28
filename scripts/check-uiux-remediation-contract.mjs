import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [layoutCss, globalsCss, caseOverview, casePage, seedSource, mainNavLinks] = await Promise.all([
  readFile("src/components/layout-system/layout-system.module.css", "utf8"),
  readFile("src/app/globals.css", "utf8"),
  readFile("src/components/case-overview.tsx", "utf8"),
  readFile("src/app/cases/[id]/page.tsx", "utf8"),
  readFile("scripts/uiux-demo-data.mjs", "utf8"),
  readFile("src/components/main-nav-links.tsx", "utf8"),
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

function assertQuickWorkbenchNavigationContract(source) {
  const match = source.match(/const caseWorkbenchHref = \(options\?: \{ node\?: string; field\?: string; hash\?: string \}\) => \{[\s\S]*?\n  \};/);
  assert(match, "case quick-completion links must use one shared URL builder");
  const context = vm.createContext({ URLSearchParams });
  const executableHelper = match[0].replace(
    "(options?: { node?: string; field?: string; hash?: string })",
    "(options)",
  );
  vm.runInContext(
    `const brokerageCase = { id: "case_probe" };\n${executableHelper}\nglobalThis.caseWorkbenchHref = caseWorkbenchHref;`,
    context,
  );
  assert.equal(
    context.caseWorkbenchHref({ node: "contract_terms" }),
    "/cases/case_probe?view=quick&node=contract_terms",
    "quick-completion category navigation must preserve view=quick",
  );
  assert.equal(
    context.caseWorkbenchHref({ node: "participants", field: "applicant.name", hash: "case-review-desk" }),
    "/cases/case_probe?view=quick&node=participants&field=applicant.name#case-review-desk",
    "quick-completion field navigation must preserve view=quick with the selected category, field, and hash",
  );
}

function assertMainNavigationPerformanceContract(source) {
  requireMatch(source, /import Link, \{ useLinkStatus \} from "next\/link";/, "main navigation must expose immediate pending feedback through the framework link status");
  requireMatch(source, /const \[hasNavigationIntent, setHasNavigationIntent\] = useState\(false\);/, "main navigation must start without speculative full-route requests");
  requireMatch(source, /prefetch=\{hasNavigationIntent \? null : false\}/, "main navigation may only enable framework prefetch after explicit user intent");
  requireMatch(source, /onMouseEnter=\{\(\) => setHasNavigationIntent\(true\)\}/, "pointer intent must enable bounded prefetch for one link");
  requireMatch(source, /onFocus=\{\(\) => setHasNavigationIntent\(true\)\}/, "keyboard intent must enable bounded prefetch for one link");
  requireMatch(source, /const \{ pending \} = useLinkStatus\(\);/, "each main navigation link must observe its own pending navigation state");
  requireMatch(source, /pending \? "progress_activity" : icon/, "pending main navigation must replace the static icon with an immediate progress indicator");
  requireMatch(source, /pending \? "inline-block animate-spin text-\[20px\] motion-reduce:animate-none"/, "pending feedback must remain visible in both desktop and compact navigation");
  assert.doesNotMatch(source, /\bprefetch(?:=\{true\})?(?:\s|>)/, "main navigation must not force full prefetch of every authenticated dynamic route");
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
    { protocol: "postgres:", host: "db.staging.example", port: 5432, database: "staging_db", user: "qa", password: "secret", ssl: { rejectUnauthorized: true }, enableChannelBinding: true },
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
  const stagingMatch = source.match(/function enforceFixedStagingPoolConfig\(poolConfig\) \{[\s\S]*?\n\}/);
  assert(stagingMatch, "fixed Staging must have one explicit effective-config policy");
  vm.runInContext(`${stagingMatch[0]}\nglobalThis.enforceFixedStagingPoolConfig = enforceFixedStagingPoolConfig;`, context);
  const remoteWithoutOptions = context.buildPoolConfig("postgres://qa:secret@db.staging.example/staging_db");
  const enforcedRemote = context.enforceFixedStagingPoolConfig(remoteWithoutOptions);
  assert.equal(enforcedRemote.port, 5432, "an omitted remote port must resolve to 5432");
  assert.deepEqual(JSON.parse(JSON.stringify(enforcedRemote.ssl)), { rejectUnauthorized: true }, "fixed Staging must force certificate-verified TLS even without sslmode");
  assert.throws(
    () => context.buildPoolConfig("postgres://qa:secret@db.staging.example/staging_db?sslmode=disable"),
    /unsupported database ssl mode/,
    "TLS disable must be rejected",
  );
  const fingerprintMatch = source.match(/function targetFingerprint\(config\) \{[\s\S]*?\n\}/);
  assert(fingerprintMatch, "fixed Staging must fingerprint the complete effective target");
  const fingerprintContext = vm.createContext({ createHash });
  vm.runInContext(`${fingerprintMatch[0]}\nglobalThis.targetFingerprint = targetFingerprint;`, fingerprintContext);
  const defaultPortFingerprint = fingerprintContext.targetFingerprint(remoteWithoutOptions);
  const otherPortFingerprint = fingerprintContext.targetFingerprint(context.buildPoolConfig("postgres://qa:secret@db.staging.example:6543/staging_db"));
  assert.notEqual(defaultPortFingerprint, otherPortFingerprint, "any explicit different port must produce a rejected target fingerprint");
  requireMatch(source, /const validatedConfig = buildPoolConfig\(connectionString\);[\s\S]*?protocol: databaseProtocol[\s\S]*?remoteFingerprint = targetFingerprint\(\{ protocol: databaseProtocol, \.\.\.poolConfig \}\)[\s\S]*?effectivePoolConfig = fixedStagingTarget \? enforceFixedStagingPoolConfig\(poolConfig\) : poolConfig[\s\S]*?new Pool\(\{ \.\.\.effectivePoolConfig, max: 1, connectionTimeoutMillis: 10_000 \}\)/, "the full fingerprint, Staging policy, and Pool must consume one explicit validated effective config");
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
  requireMatch(source, /const REMOTE_TARGET_FINGERPRINT = "aaf14cc84744d48e626ff90cea8e67be03707f73a55b6368e545a0b094ab545a";/, "remote writes must be locked to the trusted full target fingerprint");
  requireMatch(source, /remoteFingerprint === REMOTE_TARGET_FINGERPRINT[\s\S]*?BROKER_DESK_DEPLOYMENT_ENV === "staging"[\s\S]*?effectivePoolConfig\.ssl\?\.rejectUnauthorized === true/, "remote writes must require the full target fingerprint, explicit Staging environment, and verified TLS");
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
assertQuickWorkbenchNavigationContract(casePage);
assertMainNavigationPerformanceContract(mainNavLinks);
await assertSeedContract(seedSource);

assert.throws(() => assertFieldGridContract(layoutCss.replace("align-items: stretch;", "align-items: start;"), caseOverview), /stretch/);
assert.throws(() => assertMobileMenuContract(globalsCss.replace("right: 0.5rem;", "right: -0.5rem;")), /safe margin/);
assert.throws(() => assertQuickWorkbenchNavigationContract(casePage.replace('params.set("view", "quick");', "")), /preserve view=quick/);
assert.throws(() => assertMainNavigationPerformanceContract(mainNavLinks.replace('href={href}', 'href={href} prefetch={true}')), /must not force full prefetch/);
await assert.rejects(assertSeedContract(seedSource.replace("${token}_${String(index).padStart(2, \"0\")}", "${String(index).padStart(2, \"0\")}")), /tenant-scoped/);
await assert.rejects(assertSeedContract(seedSource.replace("clients.tenant_id = EXCLUDED.tenant_id", "$2 = $2")), /clients upserts/);
await assert.rejects(assertSeedContract(seedSource.replace("DELETE FROM properties WHERE tenant_id = $1", "DELETE FROM properties WHERE TRUE")), /properties cleanup/);
await assert.rejects(assertSeedContract(seedSource.replace("BROKER_DESK_DEPLOYMENT_ENV === \"staging\"", "BROKER_DESK_DEPLOYMENT_ENV === \"preview\"")), /deployment environment|explicit Staging environment/);
await assert.rejects(assertSeedContract(seedSource.replace("effectivePoolConfig.ssl?.rejectUnauthorized === true", "true")), /verified TLS/);
await assert.rejects(assertSeedContract(seedSource.replace("TASK-039 Duplicate Guard Probe 1787271641750", "TASK-039")), /accepted QA workspace/);
await assert.rejects(assertSeedContract(seedSource.replace("aaf14cc84744d48e626ff90cea8e67be03707f73a55b6368e545a0b094ab545a", "0".repeat(64))), /trusted full target fingerprint/);
await assert.rejects(assertSeedContract(seedSource.replace("assertProtectedSnapshotUnchanged(protectedBefore, protectedAfter);", "assertProtectedSnapshotUnchanged(protectedAfter, protectedAfter);")), /baselines must be captured/);
await assert.rejects(assertSeedContract(seedSource.replace("await main().catch(reportSafeFailure);", "await main();")), /safe reporter/);
await assert.rejects(assertSeedContract(seedSource.replace("function reportSafeFailure() {", "function reportSafeFailure(error) {").replace('process.stderr.write("UIUX_DEMO_DATA_FAILED\\n");', "process.stderr.write(error.message);")), /fixed safe reporter|must not inspect/);
await assert.rejects(assertSeedContract(seedSource.replace('const allowedOptions = new Set(["sslmode", "channel_binding"]);', 'const allowedOptions = new Set(["sslmode", "channel_binding", "host"]);')), /must be rejected/);
await assert.rejects(assertSeedContract(seedSource.replace("new Pool({ ...effectivePoolConfig, max: 1, connectionTimeoutMillis: 10_000 })", "new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 })")), /raw connection string|same explicit validated effective config/);
await assert.rejects(assertSeedContract(seedSource.replace('enableChannelBinding: channelBinding === "prefer" ? true : channelBinding === "disable" ? false : undefined', "channel_binding: channelBinding || undefined")), /Pool config|legacy channel_binding|real node-postgres boolean key/);
await assert.rejects(assertSeedContract(seedSource.replace('return { ...poolConfig, ssl: { rejectUnauthorized: true } };', "return poolConfig;")), /valid JSON|force certificate-verified TLS/);
await assert.rejects(assertSeedContract(seedSource.replace('${config.protocol}\\n${config.host}\\n${config.database}\\n${config.port}', '${config.protocol}\\n${config.host}\\n${config.database}')), /different port/);

console.log("uiux remediation contract: PASS (field-row geometry, quick-view navigation, bounded main-nav prefetch, narrow menu viewport, and tenant-isolated demo data)");
