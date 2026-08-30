import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, "config/clerk/invitation-email.json"), "utf8"));
const body = fs.readFileSync(path.join(root, "config/clerk", config.bodyFile), "utf8");
const invitationSource = fs.readFileSync(path.join(root, "src/lib/clerk-invitations.ts"), "utf8");
const actionsSource = fs.readFileSync(path.join(root, "src/app/actions.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(config.subject.includes("Broker Desk"), "invitation subject must identify Broker Desk");
assert(config.subject.includes("brokerDeskTenantName"), "invitation subject must identify the inviting company");
assert(config.deliveredByClerk === true, "Clerk delivery must remain enabled");
assert(body.includes("{{action_url}}"), "invitation email must contain the Clerk action URL");
assert(body.includes("{{invitation.expires_in_days}}"), "invitation email must explain expiry");
assert(body.includes("{{invitation.public_metadata.brokerDeskTenantName}}"), "invitation email must identify the inviting company");
assert(body.includes("このメールを受信したアドレス"), "invitation email must explain same-email identity verification");
assert(body.includes("パスワードを尋ねることはありません"), "invitation email must include a phishing safety note");
assert(invitationSource.includes("brokerDeskTenantName: context.tenant.name"), "invitation metadata must carry the tenant name");
assert(actionsSource.includes("createClerkInvitationForTenantMember(prepared)"), "delivery must use the locked tenant invitation context");
console.log("Clerk invitation template contract passed.");
