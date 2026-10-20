import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/object-attachments.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;

const attachments = new Map([
  ["att-a", { id: "att-a", tenantId: "tenant", userId: "user", targetType: "import_job", targetId: "job-a", fileName: "registry.pdf", fileType: "application/pdf", uploadedAt: new Date("2026-10-19T00:00:00Z") }],
  ["att-linked", { id: "att-linked", tenantId: "tenant", userId: "user", targetType: "import_job", targetId: "job-a", fileName: "linked.pdf", fileType: "application/pdf", uploadedAt: new Date("2026-10-19T00:01:00Z") }],
  ["att-case", { id: "att-case", tenantId: "tenant", userId: "user", targetType: "import_job", targetId: "job-case", fileName: "case-only.pdf", fileType: "application/pdf", uploadedAt: new Date("2026-10-19T00:02:00Z") }],
  ["att-other", { id: "att-other", tenantId: "tenant", userId: "user", targetType: "import_job", targetId: "job-other", fileName: "other.pdf", fileType: "application/pdf", uploadedAt: new Date("2026-10-19T00:03:00Z") }],
]);
const targets = [
  { id: "target-a", tenantId: "tenant", userId: "user", targetType: "property", targetId: "property-a", importJobId: "job-a", targetVersion: "v1", status: "completed", createdAt: new Date("2026-10-19T00:00:00Z"), updatedAt: new Date("2026-10-19T00:00:00Z") },
  { id: "target-case", tenantId: "tenant", userId: "user", caseId: "case-1", targetType: "property", targetId: "property-a", importJobId: "job-case", targetVersion: "v1", status: "completed", createdAt: new Date("2026-10-19T00:00:00Z"), updatedAt: new Date("2026-10-19T00:00:00Z") },
  { id: "target-other", tenantId: "tenant", userId: "user", targetType: "property", targetId: "property-other", importJobId: "job-other", targetVersion: "v1", status: "completed", createdAt: new Date("2026-10-19T00:00:00Z"), updatedAt: new Date("2026-10-19T00:00:00Z") },
];
const linkedItem = {
  attachment: attachments.get("att-linked"),
  link: { id: "link-1", tenantId: "tenant", attachmentId: "att-linked", targetType: "property", targetId: "property-a", category: "property_registry", createdByUserId: "user", createdAt: new Date("2026-10-19T00:01:00Z") },
};
let importReadinessReady = true;
let targetQueryCalls = 0;

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "@/lib/data") {
    return {
      getAttachmentByIdForTenant: async ({ id }) => attachments.get(id),
      getObjectImportFeatureReadiness: async () => ({ ready: importReadinessReady }),
      linkAttachmentToObject: async () => { throw new Error("write must not be called"); },
      listAttachmentLinks: async () => [linkedItem.link],
      listObjectImportTargets: async () => { targetQueryCalls += 1; return targets; },
      listAttachments: async ({ targetId }) => [...attachments.values()].filter((attachment) => attachment.targetId === targetId),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
try {
  const testModule = new Module("object-attachments-test", import.meta.url);
  testModule.filename = new URL("../src/lib/object-attachments.ts", import.meta.url).pathname;
  testModule.paths = Module._nodeModulePaths(process.cwd());
  testModule._compile(compiled, testModule.filename);
  const result = await testModule.exports.listObjectArchiveAttachments({ tenantId: "tenant", userId: "user", targetType: "property", targetId: "property-a" });
  assert.deepEqual(result.map((item) => item.attachment.id), ["att-linked", "att-a"], "archive must retain links, derive standalone source, and deduplicate attachments");
  assert.equal(result.some((item) => item.attachment.id === "att-case"), false, "case-linked source must not leak into an object archive");
  assert.equal(result.some((item) => item.attachment.id === "att-other"), false, "another object's source must not leak into this archive");
  importReadinessReady = false;
  const fallback = await testModule.exports.listObjectArchiveAttachments({ tenantId: "tenant", userId: "user", targetType: "property", targetId: "property-a" });
  assert.deepEqual(fallback.map((item) => item.attachment.id), ["att-linked"], "unready import storage must preserve direct links");
  assert.equal(targetQueryCalls, 1, "unready import storage must skip the target query");
  console.log("object attachment archive behavior: PASS");
} finally {
  Module._load = originalLoad;
}
