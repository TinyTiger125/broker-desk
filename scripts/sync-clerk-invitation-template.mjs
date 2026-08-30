import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "config/clerk/invitation-email.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const body = await readFile(path.join(path.dirname(configPath), config.bodyFile), "utf8");
const apply = process.argv.includes("--apply");
const preview = process.argv.includes("--preview");

for (const required of ["{{action_url}}", "{{invitation.expires_in_days}}", "{{invitation.public_metadata.brokerDeskTenantName}}"] ) {
  if (!body.includes(required) && !config.subject.includes(required)) {
    throw new Error(`Invitation template is missing required variable: ${required}`);
  }
}

const secretKey = process.env.CLERK_SECRET_KEY?.trim();
if (!secretKey) throw new Error("CLERK_SECRET_KEY is required");

const endpoint = "https://api.clerk.com/v1/templates/email/invitation";
const headers = { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" };
const currentResponse = await fetch(endpoint, { headers });
if (!currentResponse.ok) throw new Error(`Unable to read Clerk invitation template (${currentResponse.status})`);
const current = await currentResponse.json();
const desired = {
  name: config.name,
  subject: config.subject,
  body,
  from_email_name: config.fromEmailName,
  delivered_by_clerk: config.deliveredByClerk,
};
const previewDesired = {
  subject: desired.subject,
  body: desired.body,
  from_email_name: desired.from_email_name,
};
const matches = current.subject?.trim() === desired.subject.trim()
  && current.body?.trim() === desired.body.trim()
  && current.from_email_name === desired.from_email_name
  && current.delivered_by_clerk === desired.delivered_by_clerk;

if (preview || apply) {
  const previewResponse = await fetch(`${endpoint}/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify(previewDesired),
  });
  if (!previewResponse.ok) {
    const error = await previewResponse.text();
    throw new Error(`Clerk rejected the invitation template preview (${previewResponse.status}): ${error}`);
  }
  await previewResponse.json();
  console.log("Clerk invitation template preview accepted.");
}

if (preview && !apply) {
  process.exitCode = 0;
} else if (!apply) {
  console.log(matches ? "Clerk invitation template is current." : "Clerk invitation template differs; rerun with --apply after review.");
  process.exitCode = matches ? 0 : 2;
} else {
  const updateResponse = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify(desired) });
  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    throw new Error(`Unable to update Clerk invitation template (${updateResponse.status}): ${error}`);
  }
  const updated = await updateResponse.json();
  if (updated.subject?.trim() !== desired.subject.trim() || updated.body?.trim() !== desired.body.trim()) {
    throw new Error("Clerk returned a template that does not match the requested content");
  }
  console.log("Clerk invitation template updated and verified.");
}
