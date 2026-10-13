#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [migration, postgres, memory, actions, clientForm, propertyForm, manager, partyPage, clientPage] = await Promise.all([
  source("db/migrations/20261012_002_unified_profiles.sql"),
  source("src/lib/data.postgres.ts"),
  source("src/lib/data.memory.ts"),
  source("src/app/actions.ts"),
  source("src/components/client-form.tsx"),
  source("src/components/property-responsive-form.tsx"),
  source("src/components/case-association-manager.tsx"),
  source("src/app/parties/[id]/edit/page.tsx"),
  source("src/app/clients/[id]/edit/page.tsx"),
]);

const clientColumns = [
  "furigana", "birth_date", "gender", "current_postal_code", "current_address",
  "employer_name", "employer_address", "employer_phone", "annual_income",
  "annual_income_as_of", "annual_income_source",
];
const propertyColumns = ["furigana", "room_number", "postal_code", "usage", "listing_rent", "listing_common_fee"];

for (const column of [...clientColumns, ...propertyColumns]) {
  assert(migration.includes(`ADD COLUMN IF NOT EXISTS ${column}`), `migration is missing ${column}`);
}
assert(!/NOT NULL/i.test(migration), "profile migration must keep new columns nullable");
const migrationSql = migration.replace(/--.*$/gm, "");
assert(!/confirmedDataJson|DROP\s+(TABLE|COLUMN)/i.test(migrationSql), "profile migration must not alter case snapshots or drop data");
assert(postgres.includes('"20261012_002_unified_profiles.sql"'), "production readiness must require the profile migration");

for (const field of ["furigana", "birthDate", "gender", "currentPostalCode", "currentAddress", "employerName", "employerAddress", "employerPhone", "annualIncome", "annualIncomeAsOf", "annualIncomeSource"]) {
  assert(memory.includes(field), `memory repository is missing ${field}`);
  assert(postgres.includes(field), `postgres repository is missing ${field}`);
}
for (const field of ["furigana", "roomNumber", "postalCode", "usage", "listingRent", "listingCommonFee"]) {
  assert(memory.includes(field), `memory property repository is missing ${field}`);
  assert(postgres.includes(field), `postgres property repository is missing ${field}`);
}
assert(memory.includes('hasOwnProperty.call(input, "furigana")'), "memory updates must preserve omitted person fields");
assert(memory.includes('hasOwnProperty.call(input, "listingRent")'), "memory updates must preserve omitted property fields");
assert(postgres.includes('hasInput("furigana")'), "postgres updates must preserve omitted person fields");
assert(postgres.includes('hasInput("listingRent")'), "postgres updates must preserve omitted property fields");

assert(actions.includes("mergePartyProfileNotes"), "party updates must preserve role/type metadata and freeform notes");
assert(actions.includes("updateClientProfileInlineAction"), "inline person profile action is missing");
assert(actions.includes("updatePropertyProfileInlineAction"), "inline property profile action is missing");
assert(!/confirmedDataJson\s*[:=].*(updateClient|updateProperty)/s.test(actions), "profile actions must not write case snapshots");
const clientPersist = actions.slice(actions.indexOf("async function persistClientForm"), actions.indexOf("export async function createClientFormAction"));
assert(clientPersist.includes("if (!inline)"), "inline person profile saves must not revalidate the case workbench and discard its draft");
const propertyPersist = actions.slice(actions.indexOf("async function updatePropertyProfile("), actions.indexOf("function parsePartyProfileForm"));
assert(propertyPersist.includes("if (!inline)"), "inline property profile saves must not revalidate the case workbench and discard its draft");

for (const field of ["furigana", "birthDate", "currentAddress", "employerName", "annualIncome", "annualIncomeSource"]) {
  assert(clientForm.includes(field), `client form is missing ${field}`);
}
for (const field of ["roomNumber", "postalCode", "usage", "listingRent", "listingCommonFee"]) {
  assert(propertyForm.includes(field), `property form is missing ${field}`);
}
assert(clientForm.includes("readOnly"), "client form needs a read-only mode");
assert(manager.includes("clientDefaultsFromValues"), "case drawer must refresh the full person profile after save");
assert(manager.includes("record.values"), "case drawer must consume the full saved profile");
assert(manager.includes("updatePersonAction"), "case drawer is missing person profile edit action");
assert(manager.includes("updatePropertyAction"), "case drawer is missing property profile edit action");
assert(partyPage.includes("ClientForm"), "party edit must use the unified full profile form");
assert(clientPage.includes("ClientForm"), "client edit must use the unified full profile form");

console.log("Unified profile contract passed: nullable migration, persistence-preserving updates, unified forms, and case drawer cache refresh.");
