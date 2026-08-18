import { readFile } from "node:fs/promises";

const pages = {
  client: await readFile("src/app/clients/[id]/page.tsx", "utf8"),
  contracts: await readFile("src/app/contracts/page.tsx", "utf8"),
  requests: await readFile("src/app/service-requests/page.tsx", "utf8"),
  audit: await readFile("src/app/audit-log/page.tsx", "utf8"),
};
const failures = [];
const requireText = (source, text, message) => { if (!source.includes(text)) failures.push(message); };
const forbidText = (source, text, message) => { if (source.includes(text)) failures.push(message); };

requireText(pages.client, "getClientDetail", "client detail must read the existing client detail source");
for (const fact of ["purposeLabel[client.purpose]", "stageLabel[client.stage]", "temperatureLabel[client.temperature]", "addFollowUp", "client.followUps", "client.quotations", "client.tasks", "/clients/${client.id}/edit"]) {
  requireText(pages.client, fact, `client detail must preserve ${fact}`);
}
for (const pseudo of ["getStageSuggestion", "stageSuggestion", "suggestionViewing", "suggestionNegotiating", "suggestionQuoted"]) {
  forbidText(pages.client, pseudo, `client detail must not render derived stage suggestions: ${pseudo}`);
}
for (const boundary of ["completion", "AI確認", "输出资格", "output readiness", "WORKFLOW_STAGE_PATH", "quickActions", "/quotes/new"]) forbidText(pages.client, boundary, `client detail must not add pseudo state or competing workflow: ${boundary}`);

for (const fact of ["listHubContracts", "record.contractNumber", "record.relatedProperty", "record.relatedParty", "record.signedAt", "page"]) requireText(pages.contracts, fact, `contracts must preserve ${fact}`);
for (const pseudo of ["batchUpdateContractStatusAction", "undoContractBatchStatusAction", "updateClientStage", 'name="ids"', "renewalTimeline", "next90Days", "atRiskValue", "auditCompliance", "alertCase1", "bulkTemplates", "financialReview", "/quotes/new", "/templates", "/board?from=contracts", "contract.status"]) forbidText(pages.contracts, pseudo, `contracts must remove non-authoritative or out-of-scope expression: ${pseudo}`);
forbidText(pages.contracts, "min-w-[980px]", "contracts must not force a wide desktop table");

requireText(pages.requests, "listHubServiceRequests", "service requests must use the existing request list source");
for (const action of ["batchUpdateServiceRequestStatusAction", "changeTaskStatusAction", "createServiceRequestQuickAction", "undoTaskStatusAction", 'name="taskIds"', "/clients/${request.clientId}"]) requireText(pages.requests, action, `service requests must preserve ${action}`);
for (const pseudo of ["FormDraftAssist", "Unsplash", "unsplash", "allocationPercent", "allocatedBudget", "slaRate", "evidenceImages", "/templates", "/import-center", "focusId", "relatedProperty"]) forbidText(pages.requests, pseudo, `service requests must remove non-authoritative or out-of-scope expression: ${pseudo}`);
forbidText(pages.requests, "min-w-[980px]", "service requests must not force a wide desktop table");

requireText(pages.audit, "listAuditLogs", "audit log must use the existing audit record source");
for (const field of ["log.createdAt", "log.actorId", "log.action", "log.targetType", "log.message", "log.context", "/api/hub/export?", "audit.view"]) requireText(pages.audit, field, `audit log must preserve ${field}`);
for (const pseudo of ["totalLogs", "uniqueActions", "actorCount", "min-w-[980px]", "href=\"/contracts\""]) forbidText(pages.audit, pseudo, `audit log must remove pseudo KPI or unstable context: ${pseudo}`);
requireText(pages.audit, "md:hidden", "audit log must provide a narrow row layout");

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}
console.log("TASK-034 core page contract checks passed (Object Page, Worklists, read-only List Report, facts and boundaries).");
