import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;

function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  const candidates = [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};

function compileTypeScript(module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}

require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;

const { writeCaseAssociationData } = require(resolve(root, "src/lib/case-associations.ts"));
const actionsSource = readFileSync(resolve(root, "src/app/actions.ts"), "utf8");
const casePageSource = readFileSync(resolve(root, "src/app/cases/[id]/page.tsx"), "utf8");
const associationActionSource = actionsSource.slice(actionsSource.indexOf("export async function saveCaseAssociationsAction"));
assert(
  associationActionSource.includes('if (primaryPartyId && !primaryParty?.name?.trim())'),
  "association action rejects a primary party with an empty name instead of retaining the old name",
);
assert(
  associationActionSource.indexOf('if (primaryPartyId && !primaryParty?.name?.trim())') < associationActionSource.indexOf("updateBrokerageCaseConfirmedData"),
  "empty-name rejection occurs before the association update write",
);
assert(
  casePageSource.includes("result?.record && result.resolution.canWrite"),
  "read-only associated properties must not receive editable profile defaults",
);
assert(
  casePageSource.includes("updatePropertyAction={canWriteCase && associatedPropertyResult?.resolution.canWrite ? updatePropertyProfileInlineAction : undefined}"),
  "read-only associated properties must not receive an inline edit action",
);

const party = (partyId, roles) => ({ partyId, roles });

// Changing only the property while no primary applicant is assigned must not
// erase an independently edited case field.
const propertyOnly = writeCaseAssociationData(
  { "applicant.name": "Neo Test H009" },
  { parties: [party("person-other", ["其他关联人"])], primaryPropertyId: "prop-h010" },
  { propertyName: "H010 Synthetic Property" },
);
assert.equal(propertyOnly["applicant.name"], "Neo Test H009", "property-only association retains applicant name");

// A case may already contain a confirmed applicant name before its first
// association is saved.  Adding the master record must not silently replace
// that case value.
const firstAssociation = writeCaseAssociationData(
  { "applicant.name": "已确认申请人" },
  { parties: [party("person-b", ["主要申请人"])], primaryPropertyId: "prop-h010" },
  { primaryPartyName: "主档申请人", propertyName: "主档物件" },
);
assert.equal(firstAssociation["applicant.name"], "已确认申请人", "first association retains an existing applicant value");

// The same protection applies to a confirmed property value.  A linked
// property's canonical name can replace an association-derived old value,
// but not an independently edited value.
const firstPropertyAssociation = writeCaseAssociationData(
  { "property.name": "已确认物件" },
  { parties: [], primaryPropertyId: "prop-h011" },
  { propertyName: "主档物件" },
);
assert.equal(firstPropertyAssociation["property.name"], "已确认物件", "first association retains an existing property value");

const switchedProperty = writeCaseAssociationData(
  { __primaryPropertyId: "prop-h010", "property.name": "旧主档物件" },
  { parties: [], primaryPropertyId: "prop-h011" },
  { propertyName: "新主档物件", previousPrimaryPropertyName: "旧主档物件" },
);
assert.equal(switchedProperty["property.name"], "新主档物件", "property switch adopts a previous canonical value");

const retainedEditedProperty = writeCaseAssociationData(
  { __primaryPropertyId: "prop-h010", "property.name": "案件编辑物件", __workbenchFieldStatuses: { "property.name": "edited" } },
  { parties: [], primaryPropertyId: "prop-h011" },
  { propertyName: "新主档物件", previousPrimaryPropertyName: "旧主档物件" },
);
assert.equal(retainedEditedProperty["property.name"], "案件编辑物件", "edited property value is retained on switch");

// Changing only the property for the same primary applicant must retain both
// canonical and manually edited case values.
const samePrimary = writeCaseAssociationData(
  { __primaryPartyId: "person-a", applicant: "ignored", "applicant.name": "Neo Edited" },
  { parties: [party("person-a", ["主要申请人"])], primaryPropertyId: "prop-h010" },
  { primaryPartyName: "Person A", propertyName: "H010 Synthetic Property" },
);
assert.equal(samePrimary["applicant.name"], "Neo Edited", "same primary retains manually edited value");

// Switching the primary applicant intentionally adopts the new master-data
// name, while removing the old primary clears only an association-derived
// value that still matches the old master record.
const switched = writeCaseAssociationData(
  { __primaryPartyId: "person-a", "applicant.name": "Person A" },
  { parties: [party("person-b", ["主要申请人"])], primaryPropertyId: "prop-h010" },
  { primaryPartyName: "Person B", previousPrimaryPartyName: "Person A" },
);
assert.equal(switched["applicant.name"], "Person B", "primary switch adopts new primary name");

const removedCanonical = writeCaseAssociationData(
  { __primaryPartyId: "person-a", "applicant.name": "Person A" },
  { parties: [], primaryPropertyId: "prop-h010" },
  { previousPrimaryPartyName: "Person A" },
);
assert.equal(removedCanonical["applicant.name"], undefined, "removing primary clears matching association-derived name");

const removedEdited = writeCaseAssociationData(
  { __primaryPartyId: "person-a", "applicant.name": "Neo Edited" },
  { parties: [], primaryPropertyId: "prop-h010" },
  { previousPrimaryPartyName: "Person A" },
);
assert.equal(removedEdited["applicant.name"], "Neo Edited", "removing primary retains independently edited value");

// Explicitly unlinking a property clears only the association-derived name.
const removedCanonicalProperty = writeCaseAssociationData(
  { __primaryPropertyId: "prop-h010", "property.name": "旧主档物件" },
  { parties: [], primaryPropertyId: undefined },
  { previousPrimaryPropertyName: "旧主档物件" },
);
assert.equal(removedCanonicalProperty["property.name"], undefined, "removing primary clears matching association-derived property name");

const removedEditedProperty = writeCaseAssociationData(
  { __primaryPropertyId: "prop-h010", "property.name": "案件编辑物件", __workbenchFieldStatuses: { "property.name": "edited" } },
  { parties: [], primaryPropertyId: undefined },
  { previousPrimaryPropertyName: "旧主档物件" },
);
assert.equal(removedEditedProperty["property.name"], "案件编辑物件", "removing primary retains independently edited property name");

const removedSameValueEditedProperty = writeCaseAssociationData(
  { __primaryPropertyId: "prop-h010", "property.name": "旧主档物件", __workbenchFieldStatuses: { "property.name": "edited" } },
  { parties: [], primaryPropertyId: undefined },
  { previousPrimaryPropertyName: "旧主档物件" },
);
assert.equal(removedSameValueEditedProperty["property.name"], "旧主档物件", "edited property value equal to canonical name is retained");

const removedSameValueEdited = writeCaseAssociationData(
  { __primaryPartyId: "person-a", "applicant.name": "Person A", __workbenchFieldStatuses: { "applicant.name": "edited" } },
  { parties: [], primaryPropertyId: "prop-h010" },
  { previousPrimaryPartyName: "Person A" },
);
assert.equal(removedSameValueEdited["applicant.name"], "Person A", "edited value equal to canonical name is retained");

console.log("Case association retention behavior: PASS");
