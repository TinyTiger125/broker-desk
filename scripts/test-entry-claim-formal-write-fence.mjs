import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const resolveCandidate = (value) => {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  return [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
};
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const data = require(resolve(root, "src/lib/data.memory.ts"));
data.resetBusinessDataForQa();
const tenant = await data.getTenantById("tenant_cherry");
const user = await data.getUserById("user_demo");
assert(tenant && user);
const digest = "a".repeat(64);

async function rotateClaim(targetType) {
  const requestKey = randomUUID();
  const first = await data.claimEntryRequest({ tenantId: tenant.id, userId: user.id, targetType, requestKey, payloadDigest: digest, targetId: `${targetType}_fenced_target` });
  assert.equal(first.state, "claimed");
  await data.releaseEntryRequest({ tenantId: tenant.id, userId: user.id, targetType, requestKey, claimToken: first.claimToken });
  const second = await data.claimEntryRequest({ tenantId: tenant.id, userId: user.id, targetType, requestKey, payloadDigest: digest, targetId: `${targetType}_fenced_target` });
  assert.equal(second.state, "claimed");
  assert.notEqual(second.claimToken, first.claimToken);
  return { requestKey, oldToken: first.claimToken, newToken: second.claimToken };
}

const clientFence = await rotateClaim("client");
const clientInput = {
  tenantId: tenant.id,
  ownerUserId: user.id,
  id: "client_fenced_target",
  name: "Fence client",
  phone: "",
  budgetType: "total_price",
  purpose: "buy",
  loanPreApprovalStatus: "not_applied",
  stage: "lead",
  temperature: "cold",
  brokerageContractType: "none",
  amlCheckStatus: "not_required",
};
await assert.rejects(() => data.addClient({ ...clientInput, entryRequest: { requestKey: clientFence.requestKey, claimToken: clientFence.oldToken } }), /entry_request_claim_fenced/);
await data.addClient({ ...clientInput, entryRequest: { requestKey: clientFence.requestKey, claimToken: clientFence.newToken } });

const propertyFence = await rotateClaim("property");
const propertyInput = {
  tenantId: tenant.id,
  createdByUserId: user.id,
  currentOwnerUserId: user.id,
  id: "prop_fenced_target",
  name: "Fence property",
  listingPrice: 0,
};
await assert.rejects(() => data.addProperty({ ...propertyInput, entryRequest: { requestKey: propertyFence.requestKey, claimToken: propertyFence.oldToken } }), /entry_request_claim_fenced/);
await data.addProperty({ ...propertyInput, entryRequest: { requestKey: propertyFence.requestKey, claimToken: propertyFence.newToken } });

const caseFence = await rotateClaim("case");
await assert.rejects(() => data.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: user.id,
  caseId: "case_fenced_target",
  caseType: "rental_application",
  caseTitle: "Fence case",
  confirmedDataJson: {},
  sourceImportJobIds: [],
  reviewItems: [],
  entryRequest: { requestKey: caseFence.requestKey, claimToken: caseFence.oldToken },
}), /entry_request_claim_fenced/);
await data.saveBrokerageCaseExtractionReview({
  tenantId: tenant.id,
  userId: user.id,
  caseId: "case_fenced_target",
  caseType: "rental_application",
  caseTitle: "Fence case",
  confirmedDataJson: {},
  sourceImportJobIds: [],
  reviewItems: [],
  entryRequest: { requestKey: caseFence.requestKey, claimToken: caseFence.newToken },
});

console.log("entry claim formal-write fence: rotated stale token rejected for client/property/case; current token persisted: PASS");
