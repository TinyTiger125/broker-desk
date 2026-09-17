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
assert(
  actionsSource.includes('if (primaryPartyId && !primaryParty?.name?.trim())'),
  "association action rejects a primary party with an empty name instead of retaining the old name",
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

const removedSameValueEdited = writeCaseAssociationData(
  { __primaryPartyId: "person-a", "applicant.name": "Person A", __workbenchFieldStatuses: { "applicant.name": "edited" } },
  { parties: [], primaryPropertyId: "prop-h010" },
  { previousPrimaryPartyName: "Person A" },
);
assert.equal(removedSameValueEdited["applicant.name"], "Person A", "edited value equal to canonical name is retained");

console.log("Case association retention behavior: PASS");
