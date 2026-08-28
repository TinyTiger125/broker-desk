import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [layoutCss, caseOverview, seedSource] = await Promise.all([
  readFile("src/components/layout-system/layout-system.module.css", "utf8"),
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

function seedHelpers(source) {
  const match = source.match(/function tenantToken\([\s\S]*?\n}\n\nfunction assertOwnedMarkerWrite\([\s\S]*?\n}/);
  assert(match, "seed identity and collision helpers must remain directly executable");
  const context = vm.createContext({ createHash });
  vm.runInContext(`${match[0]}\nglobalThis.seedHelpers = { tenantToken, clientId, propertyId, caseId, assertOwnedMarkerWrite };`, context);
  return context.seedHelpers;
}

function assertSeedContract(source) {
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
}

assertFieldGridContract(layoutCss, caseOverview);
assertSeedContract(seedSource);

assert.throws(() => assertFieldGridContract(layoutCss.replace("align-items: stretch;", "align-items: start;"), caseOverview), /stretch/);
assert.throws(() => assertSeedContract(seedSource.replace("${token}_${String(index).padStart(2, \"0\")}", "${String(index).padStart(2, \"0\")}")), /tenant-scoped/);
assert.throws(() => assertSeedContract(seedSource.replace("clients.tenant_id = EXCLUDED.tenant_id", "$2 = $2")), /clients upserts/);
assert.throws(() => assertSeedContract(seedSource.replace("DELETE FROM properties WHERE tenant_id = $1", "DELETE FROM properties WHERE TRUE")), /properties cleanup/);

console.log("uiux remediation contract: PASS (field-row geometry and tenant-isolated demo data)");
