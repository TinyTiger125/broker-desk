#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.resolve("src/lib/friends-guarantee-fit.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;
const mod = new Module(sourcePath);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(process.cwd());
const originalRequire = mod.require.bind(mod);
mod.require = (request) => request === "@/lib/friends-guarantee-pdf" ? {} : originalRequire(request);
mod._compile(js, sourcePath);

const { getFriendsOverlayEstimatedTextFit } = mod.exports;
const box = { x: 0, y: 0, width: 150, height: 22 };
const addressField = {
  fieldKey: "applicant.currentAddress",
  label: "現住所",
  x: 0,
  y: 0,
  size: 8,
  minSize: 6,
  maxWidth: 150,
  box,
};
const baseAddressField = { ...addressField, box: undefined };
const nameField = { ...addressField, fieldKey: "applicant.name", label: "氏名" };
const companyField = { ...addressField, fieldKey: "applicant.employerName", label: "勤務先" };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fit(field, value) {
  return getFriendsOverlayEstimatedTextFit({ field, value, box });
}

const normal = fit(addressField, "東京都港区芝公園");
const reasonableTwoLine = fit(addressField, "東京都港区芝公園一丁目二番三号 港区グランドタワー西棟");
const englishContinuous = fit(addressField, "TokyoMetropolitanMinatoWardShibakoenPropertyAddress");
const extreme = fit(addressField, "東京都港区芝公園".repeat(20));
const baseAddress = fit(baseAddressField, "東京都港区芝公園一丁目二番三号 港区グランドタワー西棟");
assert(normal.status === "fits", `normal address must fit: ${normal.status}`);
assert(reasonableTwoLine.status === "wrapped", `reasonable long address must wrap: ${reasonableTwoLine.status}`);
assert(englishContinuous.status === "wrapped", `continuous Latin address must wrap: ${englishContinuous.status}`);
assert(extreme.status === "overflows", `extreme address must block: ${extreme.status}`);
assert(baseAddress.status === "wrapped", `base address without explicit box must use its effective box: ${baseAddress.status}`);

const longName = fit(nameField, "外国人氏名長大確認用ABCDEFGHIJKLMN".repeat(3));
const longCompany = fit(companyField, "InternationalPropertyManagementCoordinationOffice");
assert(longName.status !== "wrapped", `name must remain single-line: ${longName.status}`);
assert(longCompany.status !== "wrapped", `company must remain single-line: ${longCompany.status}`);

const segment = fit({ ...addressField, fieldKey: "applicant.phone", label: "電話", segment: { mode: "digits", cells: 4 } }, "12345");
const dateParts = fit({ ...addressField, fieldKey: "applicant.birthDate", label: "生年月日", dateParts: { year: box, month: box, day: box } }, "2026-10-01");
assert(segment.status === "segment_overflows", `phone segment must not wrap: ${segment.status}`);
assert(dateParts.status === "date_parts", `date parts must not wrap: ${dateParts.status}`);

console.log(JSON.stringify({
  ok: true,
  cases: { normal, reasonableTwoLine, englishContinuous, extreme, baseAddress, longName, longCompany, segment, dateParts },
}, null, 2));
