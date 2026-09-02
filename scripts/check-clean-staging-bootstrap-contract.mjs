import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const script = await readFile(path.join(root, "bootstrap-clean-staging.mjs"), "utf8");

assert.match(script, /BROKER_DESK_CLEAN_STAGING_BOOTSTRAP_DATABASE_URL/);
assert.match(script, /broker_desk_internal_alpha/);
assert.match(script, /BROKER_DESK_DEPLOYMENT_ENV|BROKER_DESK_CLEAN_STAGING_BOOTSTRAP_ENV/);
assert.match(script, /CREATE|INSERT INTO public\.users/);
assert.match(script, /invitation_status/);
assert.match(script, /pg_advisory_xact_lock/);
assert.match(script, /BEGIN/);
assert.match(script, /ROLLBACK/);
assert.match(script, /writesClerkUsers/);
assert.match(script, /BROKER_DESK_STAGING_AUTH_ALLOWLIST/);
assert.match(script, /exactly match the three configured role emails/);
assert.match(script, /set_config\('app\.broker_desk_nonprod_marker', \$1, true\)/);
assert.match(script, /set_config\('app\.broker_desk_deployment_env', \$2, true\)/);
assert.match(script, /current_setting\('app\.broker_desk_nonprod_marker', true\)/);
assert.match(script, /bootstrap session marker verification failed/);
assert.doesNotMatch(script, /--(?:email|tenant-id|actor-user-id|database-name)/);
assert.doesNotMatch(script, /fetch\s*\(/);
assert.doesNotMatch(script, /process\.env\.[A-Z_]*(PASSWORD|OTP)|--password|--otp|createExternalUser|sendExternalEmail/i);
assert.doesNotMatch(script, /\b(UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/);
for (const forbiddenWrite of [
  "INSERT INTO public.clients",
  "INSERT INTO public.properties",
  "INSERT INTO public.brokerage_cases",
  "INSERT INTO public.tasks",
  "INSERT INTO public.follow_ups",
  "INSERT INTO public.import_jobs",
  "INSERT INTO public.attachments",
]) {
  assert.doesNotMatch(script, new RegExp(forbiddenWrite.replaceAll(".", "\\.")));
}

console.log("clean staging bootstrap contract: PASS");
