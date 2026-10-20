import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const clientForm = read("src/components/client-form.tsx");
const propertyForm = read("src/components/property-responsive-form.tsx");
const picker = read("src/components/entry-file-picker.tsx");
const preview = read("src/components/entry-preview.tsx");
const draft = read("src/components/use-entry-draft.ts");
const newClient = read("src/app/clients/new/page.tsx");
const editClient = read("src/app/clients/[id]/edit/page.tsx");
const newProperty = read("src/app/properties/new/page.tsx");
const editProperty = read("src/app/properties/[id]/edit/page.tsx");

assert.match(picker, /ENTRY_FILE_INPUT_NAME = "uploadFile"/);
assert.match(picker, /MAX_ENTRY_FILES = 6/);
assert.match(picker, /application\/pdf,image\/png,image\/jpeg,\.pdf,\.png,\.jpg,\.jpeg,\.xlsx/);
assert.match(picker, /mixedExcel/);
assert.match(preview, /previewEntryDocumentsAction/);
assert.match(preview, /formData\.append\("uploadFile", file\)/);
assert.match(preview, /formData\.set\("previewKind", kind\)/);
assert.match(preview, /formData\.set\("previewContext", context\)/);
assert.match(preview, /entryFileKey/);
assert.match(preview, /getUnreadEntryFiles/);
assert.match(preview, /pendingRef/);
assert.match(preview, /allFilesRead/);
assert.match(preview, /name="entryReadProofs"/);
assert.match(preview, /name="entryPreviewDecisions"/);
assert.match(preview, /readProofs/);
assert.match(preview, /onConfirm: \(candidate: EntryPreviewCandidate\)/);
assert.match(preview, /onReadFileKeys: \(keys: string\[\]\)/);
assert.match(preview, /type="button" onClick=\{read\}/);
assert.match(preview, /applyEntryPreviewCandidate/);
assert.match(clientForm, /<EntryFilePicker/);
assert.match(propertyForm, /<EntryFilePicker/);
assert.match(clientForm, /<EntryPreview files=\{entryFiles\} kind="customer"/);
assert.match(propertyForm, /<EntryPreview files=\{entryFiles\} kind="property"/);
assert.match(clientForm, /name="entryReadFileKeys"/);
assert.match(propertyForm, /name="entryReadFileKeys"/);
assert.match(picker, /formData\.delete\(ENTRY_FILE_INPUT_NAME\)/);
assert.match(picker, /files\.forEach\(\(file\) => formData\.append\(ENTRY_FILE_INPUT_NAME, file\)\)/);
assert.match(clientForm, /replaceEntryFiles\(formData, entryFilesRef\.current\)/);
assert.match(propertyForm, /replaceEntryFiles\(formData, entryFilesRef\.current\)/);
assert.match(clientForm, /formData\.set\("entryReadFileKeys", JSON\.stringify\(entryReadFileKeysRef\.current\)\)/);
assert.match(propertyForm, /formData\.set\("entryReadFileKeys", JSON\.stringify\(entryReadFileKeysRef\.current\)\)/);
assert.match(clientForm, /entryUpload && entryFiles\.length > entryReadFileKeys\.length \? text\.saveAndRead/);
assert.match(propertyForm, /entryUpload && entryFiles\.length > entryReadFileKeys\.length \? text\.saveAndRead/);

assert.match(draft, /window\.sessionStorage/);
assert.match(draft, /appliedFields/);
assert.match(draft, /:applied/);
assert.match(draft, /appliedValues\[field\] === serverValues/);
assert.match(draft, /writeRecord\(storageKey, serverValues, merged\)/);
assert.match(draft, /buildEntryDraftKey/);

assert.match(newClient, /createClientEntryAction/);
assert.match(newClient, /entryUpload/);
assert.match(newProperty, /createPropertyEntryAction/);
assert.match(newProperty, /entryUpload/);
assert.match(editClient, /entryDraftKey/);
assert.match(editClient, /entryAppliedFields/);
assert.match(editProperty, /entryDraftKey/);
assert.match(editProperty, /entryAppliedFields/);
assert.doesNotMatch(editClient, /key=\{`client-form-\$\{client\.id\}-\$\{clientProfileVersion\}`\}/);
assert.match(editClient, /object_import_upload_failed/);
assert.match(editProperty, /object_import_upload_failed/);
assert.ok(editClient.indexOf("<ClientIdentityImportSection") < editClient.indexOf("<ClientForm"), "client reading area must precede the long form");
assert.ok(editClient.indexOf("<ClientForm") < editClient.indexOf("<ObjectAttachmentSection"), "client originals must follow the long form");
assert.ok(editProperty.indexOf("<PropertyObjectImportSection") < editProperty.indexOf("<PropertyResponsiveForm"), "property reading area must precede the long form");
assert.ok(editProperty.indexOf("<PropertyResponsiveForm") < editProperty.indexOf("<ObjectAttachmentSection"), "property originals must follow the long form");
assert.match(newClient, /parsed\.pathname === "\/import-center" && keys\.length === 0/);
assert.match(editClient, /parsed\.pathname === "\/import-center" && keys\.length === 0/);
assert.match(newClient, /\["client", "party"\]\.includes/);
assert.match(editClient, /\["client", "party"\]\.includes/);

console.log("Unified entry UI contract passed: uploadFile picker, explicit save/read action, scoped drafts, and page wiring.");
