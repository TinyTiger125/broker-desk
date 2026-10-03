import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const ledgerPath = resolve(root, "docs/operations/RELEASE_VERSION_LEDGER.md");
const ledger = readFileSync(ledgerPath, "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const required = [
  ["canonical repository", "/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev"],
  ["remote", "https://github.com/TinyTiger125/broker-desk.git"],
  ["semantic rc rule", "v0.x.y-rc.n"],
  ["current online SHA", "701a8bdbdc86073f60cd07cfdfd79da73925295d"],
  ["previous Tokyo SHA", "0f18d6ccc1b4c2fc921ae05f0978de6b7ac0c3b5"],
  ["local candidate SHA", "9bc001b20c397bf054dc5fb23561c41d821d85f5"],
  ["Tokyo project", "prj_W4OClYmrW25iNApoSK2y7djJsZDM"],
  ["Tokyo deployment", "dpl_Rqf6ySXA91JKHpPRHkvgbBj6Z7Rt"],
  ["previous deployment", "dpl_BqYgpSjbArxFDUSxskzngSXpNQBK"],
  ["migration ledger", "public.broker_desk_schema_migrations"],
  ["migration", "20261002_001_invitation_delivery_claim.sql"],
  ["rollback migration", "db/migrations/rollback/20261002_001_invitation_delivery_claim.sql"],
  ["production blocker", "production_migrations_required"],
  ["APPONLY decision", "当前用户尚未批准 APPONLY"],
  ["no release claim", "不表示已发布/已验收"],
  ["package version policy", "package.json 的 \"version\": \"0.2.0-rc.2\" 是现有工程元数据"],
];

const failures = [];
for (const [label, value] of required) {
  if (!ledger.includes(value)) failures.push(label + ": missing " + value);
}

for (const file of [
  "db/migrations/20261002_001_invitation_delivery_claim.sql",
  "db/migrations/rollback/20261002_001_invitation_delivery_claim.sql",
]) {
  if (!existsSync(resolve(root, file))) failures.push("missing migration file: " + file);
}

if (packageJson.version !== "0.2.0-rc.2") {
  failures.push("package.json version changed unexpectedly: " + packageJson.version);
}

const statusRows = [
  ["v0.3.0-rc.1", "DEPLOYED_NOT_ACCEPTED"],
  ["v0.3.0-rc.2", "LOCAL_NOT_DEPLOYED"],
];
for (const [version, status] of statusRows) {
  const row = ledger.split("\n").find((line) => line.includes(version) && line.includes(status));
  if (!row) failures.push(version + " must remain " + status);
}

const candidateSha = "9bc001b20c397bf054dc5fb23561c41d821d85f5";
try {
  execFileSync("git", ["cat-file", "-e", candidateSha + "^{commit}"]);
  execFileSync("git", ["merge-base", "--is-ancestor", candidateSha, "HEAD"]);
} catch {
  failures.push("selected candidate application SHA is not an ancestor of the current worktree");
}

if (failures.length > 0) {
  console.error("[FAIL] release version ledger");
  for (const failure of failures) console.error("- " + failure);
  process.exitCode = 1;
} else {
  console.log("[PASS] release version ledger: one source records semantic rules, exact SHAs, targets, migration/rollback evidence and blocked states");
}
