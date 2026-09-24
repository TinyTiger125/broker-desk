import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const memory = read("src/lib/data.memory.ts");
const postgres = read("src/lib/data.postgres.ts");
const migration = read("db/migrations/20260830_001_object_attachment_links.sql");
const runtimeGrant = read("db/migrations/20260830_002_object_attachment_runtime_grant.sql");
const objectAttachments = read("src/lib/object-attachments.ts");
const actions = read("src/app/actions.ts");
const api = read("src/lib/w93-access.ts");
const component = read("src/components/object-attachment-section.tsx");
const attachmentList = read("src/components/object-attachment-list.tsx");
const associationManager = read("src/components/case-association-manager.tsx");
const casePage = read("src/app/cases/[id]/page.tsx");
const pages = [
  read("src/app/parties/[id]/edit/page.tsx"),
  read("src/app/properties/[id]/edit/page.tsx"),
];

assert.match(migration, /UNIQUE \(tenant_id, attachment_id, target_type, target_id\)/, "one file/object link must be idempotent");
assert.match(migration, /CHECK \(target_type IN \('case', 'party', 'property'\)\)/, "link targets must stay bounded");
assert.match(migration, /ENABLE ROW LEVEL SECURITY[\s\S]*FORCE ROW LEVEL SECURITY/, "attachment links require forced tenant RLS");
assert.match(runtimeGrant, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.attachment_links TO brokerdesk_runtime/, "runtime role must receive explicit attachment-link table access");
assert.match(postgres, /20260830_002_object_attachment_runtime_grant\.sql/, "runtime grant must remain a required deployment migration");
assert.match(postgres, /ON CONFLICT \(tenant_id, attachment_id, target_type, target_id\)/, "postgres link writes must be idempotent");
assert.match(memory, /const existing = db\.attachmentLinks\.find/, "memory link writes must be idempotent");
assert.match(objectAttachments, /linkImportJobAttachmentsToObject/, "import source files need an object-link operation");
assert.match(actions, /documentType: payload\.inputExtraction\.documentType/, "accepted OCR source files must receive a document-aware category");
assert.equal((actions.match(/linkImportJobAttachmentsToObject\(/g) ?? []).length >= 3, true, "new, append, and merge case paths must link source files");
assert.match(actions, /isObjectAttachmentTargetType[\s\S]*isObjectAttachmentCategory/, "direct object upload must validate target and category");
assert.match(api, /listAttachmentLinks[\s\S]*resolveW93Parent/, "downloads must resolve a readable linked parent");
assert.match(component, /attachmentFile/, "shared object UI must accept a file upload");
assert.match(component, /OBJECT_ATTACHMENT_CATEGORIES/, "shared object UI must expose the bounded category set");
assert.match(attachmentList, /\/api\/attachments\//, "shared object UI must expose authorized downloads");
assert.match(associationManager, /ObjectAttachmentList/, "case association management must retain the attachment list");
assert.match(associationManager, /caseAttachments/, "case association management must receive case attachments");
assert.match(associationManager, /caseAttachments\.length > 0/, "empty case attachment lists must not create a large empty panel");
assert.match(casePage, /caseAttachments=\{objectAttachments\}/, "case page must place case attachments in association management");
assert.doesNotMatch(casePage, /<ObjectAttachmentSection/, "case page must not render a second standalone generic upload form");
assert.equal((casePage.match(/associationPanel=\{associationPanel\}/g) ?? []).length, 2, "read-only and overview branches must retain the association panel");
assert.match(casePage, /\{associationPanel\}/, "quick case branch must retain the association panel");
for (const page of pages) assert.match(page, /<ObjectAttachmentSection/, "party and property pages must render the shared attachment section");

console.log("object attachments contract: PASS");
