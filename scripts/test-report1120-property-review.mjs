import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const Module = require("module");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;
const resolveSource = (path) => [path, `${path}.ts`, `${path}.tsx`, `${path}.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
Module._resolveFilename = function(request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveSource(relative) ?? originalResolve.call(this, request, parent, ...rest);
};
const transpile = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename,
}).outputText, filename);
require.extensions[".ts"] = transpile;
require.extensions[".tsx"] = transpile;

const { groupPropertyReviewCandidates, validatePropertyReviewValue } = require(resolve(root, "src/lib/property-entry-review.ts"));
const { formatJapanesePostalCode, normalizeJapanesePostalCode } = require(resolve(root, "src/lib/japanese-postal-code-validation.ts"));
const { PropertyEntryCandidateReview } = require(resolve(root, "src/components/property-entry-candidate-review.tsx"));
const { localPropertyReaderFixture } = require(resolve(root, "src/lib/local-property-reader-fixture.ts"));
const { renderToStaticMarkup } = require("react-dom/server");
const React = require("react");

const candidates = [
  { id: "area-1", key: "sizeSqm", label: "専有面積", value: "23.47", fileName: "重要事項説明書.pdf", pageNumber: 3, uncertainty: "conflict" },
  { id: "area-2", key: "sizeSqm", label: "専有面積", value: "26.3", fileName: "重要事項説明書.pdf", pageNumber: 3, uncertainty: "conflict" },
  { id: "name-1", key: "name", label: "物件名", value: "架空マンション", fileName: "重要事項説明書.pdf", pageNumber: 1, uncertainty: "clear" },
  { id: "postal-1", key: "postalCode", label: "郵便番号", value: "８１３００１７", fileName: "登記資料.pdf", pageNumber: 2, uncertainty: "clear" },
  { id: "unknown", key: "wrongField", label: "未知", value: "do not write", fileName: "sample.pdf" },
];
const rows = groupPropertyReviewCandidates(candidates);
assert.deepEqual(rows.map((row) => [row.key, row.options.length]), [["sizeSqm", 2], ["name", 1], ["postalCode", 1]]);
assert.deepEqual(rows[0].options.map((option) => [option.value, option.fileName, option.pageNumber]), [["23.47", "重要事項説明書.pdf", 3], ["26.3", "重要事項説明書.pdf", 3]]);
assert.equal(validatePropertyReviewValue("sizeSqm", "26.8"), true, "a corrected scanned area can be accepted");
assert.equal(validatePropertyReviewValue("sizeSqm", "wrong"), false, "bad area stays pending");
assert.equal(validatePropertyReviewValue("sizeSqm", "1000001"), false, "out-of-range area stays pending");
assert.equal(validatePropertyReviewValue("listingPrice", "100.5"), false, "fractional yen cannot be confirmed");
assert.equal(validatePropertyReviewValue("listingPrice", "2147483648"), false, "oversize amount stays pending");
assert.equal(validatePropertyReviewValue("postalCode", "813-0017"), true);
assert.equal(validatePropertyReviewValue("postalCode", "813-00"), false);
assert.equal(validatePropertyReviewValue("wrongField", "value"), false, "unknown candidate keys cannot enter the form");
assert.equal(formatJapanesePostalCode("８１３００１７"), "813-0017");
assert.equal(formatJapanesePostalCode("8130017"), "813-0017");
assert.equal(formatJapanesePostalCode("813-0017"), "813-0017");
assert.equal(normalizeJapanesePostalCode(formatJapanesePostalCode("8130017")), "8130017", "display hyphen does not alter lookup key");
const fixtureBytes = Buffer.from("%PDF-1.4\nBROKER_DESK_REPORT1120_SYNTHETIC\n");
assert.equal(localPropertyReaderFixture(fixtureBytes, "report1120-synthetic-a.pdf"), null, "model fixture is disabled by default");
process.env.BROKER_DESK_LOCAL_RUNTIME = "1";
process.env.BROKER_DESK_READER_FIXTURE = "report1120";
assert.deepEqual(localPropertyReaderFixture(fixtureBytes, "report1120-synthetic-a.pdf")?.map((item) => item.value), ["架空テストマンション", "23.47", "8130017"]);
assert.deepEqual(localPropertyReaderFixture(fixtureBytes, "report1120-synthetic-b.pdf")?.map((item) => item.value), ["架空テストマンション", "26.3"]);
assert.equal(localPropertyReaderFixture(Buffer.from("%PDF-1.4"), "report1120-synthetic-a.pdf"), null, "a matching filename cannot activate the fixture without its marker");
delete process.env.BROKER_DESK_LOCAL_RUNTIME;
delete process.env.BROKER_DESK_READER_FIXTURE;

const collapsed = renderToStaticMarkup(React.createElement(PropertyEntryCandidateReview, { candidates, appliedCandidateIds: [], locale: "ja", onApply: () => true }));
assert.match(collapsed, /未確認 3/);
assert.match(collapsed, /aria-expanded="false"/);
assert.doesNotMatch(collapsed, /資料間で不一致|競合|衝突/);
const afterOneApply = renderToStaticMarkup(React.createElement(PropertyEntryCandidateReview, { candidates, appliedCandidateIds: ["area-1", "area-2"], locale: "ja", onApply: () => true }));
assert.match(afterOneApply, /未確認 2/);
const afterRetry = renderToStaticMarkup(React.createElement(PropertyEntryCandidateReview, { candidates: [...candidates, { ...candidates[0], id: "area-3", value: "26.8", fileName: "追加資料.pdf" }], appliedCandidateIds: ["area-1", "area-2"], locale: "ja", onApply: () => true }));
assert.match(afterRetry, /未確認 3/, "a new candidate from a retried file must remain reviewable");
console.log("Report1120 property review passed: one row per field, multiple sourced candidates, edit validation, pending count, and postal display.");
