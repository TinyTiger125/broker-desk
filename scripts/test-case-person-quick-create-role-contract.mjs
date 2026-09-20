import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync("src/components/case-association-manager.tsx", "utf8");
const draft = fs.readFileSync("src/components/case-association-draft.tsx", "utf8");

for (const [name, source] of [["case-association-manager", manager], ["case-association-draft", draft]]) {
  assert.match(source, /quickCreateRoles:/, `${name}: role selector copy is present`);
  assert.match(source, /setPersonCreateRoles\(parties\.some\(\(party\) => party\.roles\.includes\("主要申请人"\)\) \? \["其他关联人"\] : \["主要申请人"\]\)/, `${name}: create default follows existing primary applicant`);
  assert.match(source, /personCreateRoles\.includes\("主要申请人"\) && parties\.some\(\(party\) => party\.roles\.includes\("主要申请人"\)\)/, `${name}: duplicate primary applicant is checked before create`);
  assert.match(source, /setParties\(\(current\) => .*\b(?:personCreateRoles|roles)\b/, `${name}: successful create uses selected roles`);
  assert.match(source, /onSubmitCapture=\{\(event\) => \{ if \(!validatePersonCreate\(\)\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); \} \}\}/, `${name}: submit capture blocks invalid create before ClientForm lock`);
  assert.match(source, /checked=\{personCreateRoles\.includes\(role\)\} disabled=\{personCreatePending\}/, `${name}: role changes are disabled while create is pending`);
  assert.match(source, /onPendingChange=(?:\{setPersonCreatePending\}|\{updatePersonCreatePending\})/, `${name}: pending state is wired to ClientForm`);
  assert.match(source, /personCreateRolesRef\.current/, `${name}: submitted role snapshot is retained independently of live state`);
}

assert.match(draft, /onClick=\{\(event\) => \{ if \(!validatePersonCreate\(\)\) event\.preventDefault\(\); \}\}/, "draft: external create action button blocks invalid create");
assert.match(manager, /onClick=\{openPersonCreate\}/, "manager: quick create opens role selector defaults");
assert.match(draft, /onClick=\{openPersonCreate\}/, "draft: quick create opens role selector defaults");
assert.match(manager, /closeDisabledRef=\{personCreatePendingRef\}/, "manager: drawer close and escape use synchronous pending guard");
assert.match(manager, /if \(!force && personCreatePendingRef\.current\) return;/, "manager: closeDrawer guard blocks pending close");
assert.match(manager, /guardPersonCreateCancel/, "manager: ClientForm cancel link is guarded while pending");
assert.match(manager, /const roles = \[\.\.\.personCreateRolesRef\.current\];/, "manager: success reads submitted role snapshot");
assert.match(manager, /updatePersonCreatePending\(false\);/, "manager: success explicitly clears pending before unmount");
assert.match(draft, /const roles = \[\.\.\.personCreateRolesRef\.current\];/, "draft: success reads submitted role snapshot");
assert.match(draft, /updatePersonCreatePending\(false\);/, "draft: success explicitly clears pending before unmount");
assert.match(draft, /if \(personCreatePendingRef\.current\) \{\s*event\.preventDefault\(\);\s*return;/, "draft: page return and cancel links are guarded while pending");
assert.match(manager, /returnTo=\{`\/cases\/\$\{caseId\}`\}/, "manager: person master return target remains unchanged");
assert.match(draft, /returnTo="\/cases\/new"/, "draft: person master return target remains unchanged");

console.log("case person quick-create role contract: PASS");
