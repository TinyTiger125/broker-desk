import fs from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const checks = [
  {
    file: "../src/app/settings/members/page.tsx",
    required: ["listTenantMembers", "inviteTenantMemberAction", "updateTenantMemberRoleAction", "updateTenantMemberStatusAction", "lg:grid-cols"],
    forbidden: ["min-w-[760px]", "overflow-x-auto"],
  },
  {
    file: "../src/app/platform/accounts/page.tsx",
    required: ["requirePlatformOwnerSession", "listPlatformTenantAccounts", "createTenantAccountAction", "updateTenantAccountLifecycleAction", "lg:grid-cols"],
    forbidden: ["/platform/templates", "min-w-[980px]", "overflow-x-auto"],
  },
  {
    file: "../src/app/settings/ai-experience/page.tsx",
    required: ["draftAiExperiencesAction", "reviewAiExperienceDraftAction", "statusTabs", "AIは入力と整理の補助", "AI 仅作为录入与整理辅助"],
    forbidden: ["md:grid-cols-4"],
  },
  {
    file: "../src/app/page.tsx",
    required: ["/import-center", "/organize-center", "listHubImportJobs", "listBrokerageCases"],
    forbidden: ["listHubGeneratedOutputs", "/output-center", "relatedPropertyHint", "?focus=", "ready", "outputAction"],
  },
];

const failures = [];
for (const check of checks) {
  const source = read(check.file);
  for (const token of check.required) {
    if (!source.includes(token)) failures.push(`${check.file}: missing ${token}`);
  }
  for (const token of check.forbidden) {
    if (source.includes(token)) failures.push(`${check.file}: forbidden ${token}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("TASK-035 contract checks passed");
