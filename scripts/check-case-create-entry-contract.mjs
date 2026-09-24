import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/app/organize-center/page.tsx", "utf8");
const browser = fs.readFileSync("src/components/organize-center-object-browser.tsx", "utf8");
const newCase = fs.readFileSync("src/app/cases/new/page.tsx", "utf8");

assert.match(page, /capabilityHasTenantPermission\(getTenantCapability\(session\.membership\), "case\.create"\)/, "organize page uses the existing case.create capability");
assert.match(page, /canCreateCase=\{capabilityCanCreateCase\}/, "organize page passes the case creation capability to the list browser");
assert.match(browser, /canCreateCase: boolean/, "list browser receives an explicit case creation capability");
assert.match(browser, /selectedType === "case" && canCreateCase/, "entry is limited to the case list and authorized users");
assert.match(browser, /href="\/cases\/new"/, "entry reuses the existing new-case route");
assert.match(browser, /data-testid="organize-create-case"/, "entry has a stable review target");
for (const copy of ["案件を新規作成", "新建案件", "안건 새로 만들기"]) assert.match(page, new RegExp(copy), `localized create-case copy exists: ${copy}`);
assert.match(newCase, /requireTenantSession\(\{ permission: "case\.create" \}\)/, "new-case route retains its server-side case.create gate");
assert.match(newCase, /backHref=\{fromEntry \? "\/import-center" : "\/organize-center\?type=case"\}/, "new-case route retains its safe organize return path");

console.log("case create entry contract: PASS");
