import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const button = read("src/components/invitation-submit-button.tsx");
const foundation = read("src/components/ui-foundation/index.tsx");
const accounts = read("src/app/platform/accounts/page.tsx");
const members = read("src/app/settings/members/page.tsx");

function assertLoadingContract(buttonSource, foundationSource) {
  for (const token of ["useFormStatus", "loading={pending}", "pendingLabel"]) {
    if (!buttonSource.includes(token)) throw new Error(`shared invitation button missing ${token}`);
  }
  for (const token of ["disabled={disabled || loading}", "aria-busy={loading || undefined}"]) {
    if (!foundationSource.includes(token)) throw new Error(`shared Button loading semantics missing ${token}`);
  }
}
assertLoadingContract(button, foundation);
assert.throws(
  () => assertLoadingContract(button.replace("loading={pending}", "disabled={pending}"), foundation),
  /loading=\{pending\}/,
  "contract must reject a submit button that no longer propagates pending through Button loading",
);
assert.throws(
  () => assertLoadingContract(button, foundation.replaceAll("disabled={disabled || loading}", "disabled={disabled}")),
  /disabled=\{disabled \|\| loading\}/,
  "contract must reject a shared Button that no longer disables while loading",
);
if (!accounts.includes("<InvitationSubmitButton") || !members.includes("<InvitationSubmitButton")) {
  throw new Error("both invitation surfaces must use the shared submit button");
}
if (!accounts.includes('role={flashMessage.tone === "error" ? "alert" : "status"}') || !accounts.includes('aria-live={flashMessage.tone === "error" ? "assertive" : "polite"}')) {
  throw new Error("platform account flash must expose live feedback semantics");
}
for (const source of [accounts, members]) {
  if (!source.includes("sendPlatformTenantMemberInvitationAction") && !source.includes("sendTenantMemberInvitationAction")) {
    throw new Error("invitation server action wiring must remain present");
  }
}
console.log("Invitation submit feedback contract: PASS");
