import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/components/case-association-draft.tsx", "utf8");
const action = fs.readFileSync("src/app/case-entry-actions.ts", "utf8");
const newRoute = fs.readFileSync("src/app/cases/new/page.tsx", "utf8");
const detail = fs.readFileSync("src/app/cases/[id]/page.tsx", "utf8");

assert.match(newRoute, /createCaseWithUploadAction/);
assert.match(page, /name="caseUploadFile"/);
assert.match(page, /name="caseUploadTarget" value="case"/);
assert.match(page, /name="casePreviewValuesJson"/);
assert.match(page, /name="caseManualValuesJson"/);
assert.match(page, /name="entryReadFileKeys"/);
assert.match(page, /<EntryPreview[^>]*context="case"/);
assert.match(action, /saveBrokerageCaseExtractionReview\(\{/);
assert.match(action, /archiveCaseFile/);
assert.match(action, /verifyEntryPreviewProofs/);
assert.match(action, /persistEntryPreviewAudit/);
assert.match(action, /resolveObjectImportTarget\(\{/);
assert.match(action, /caseUploadTarget/);
assert.match(action, /uploadTarget\.targetId !== primaryPartyId/);
assert.match(action, /associationDraft\.primaryPropertyId !== uploadTarget\.targetId/);
assert.match(detail, /case_upload_archived_limited/);

console.log("case unified entry contract: PASS");
