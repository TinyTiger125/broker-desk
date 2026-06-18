#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
QA_CURL_HEADERS=()
if [ -n "${BROKER_DESK_QA_TOKEN:-}" ]; then
  QA_CURL_HEADERS=(-H "x-broker-desk-qa-token: ${BROKER_DESK_QA_TOKEN}")
fi

fail() {
  echo "[FAIL] $1"
  exit 1
}

echo "[INFO] BASE_URL=${BASE_URL}"

echo "[STEP] guarantee template calibration ledger"
node scripts/check-guarantee-calibration-ledger.mjs || fail "guarantee template calibration ledger failed"

echo "[STEP] guarantee print fit checks"
node scripts/check-guarantee-print-fit.mjs || fail "guarantee print fit checks failed"

echo "[STEP] guarantee autofill policy"
node scripts/check-guarantee-autofill-policy.mjs || fail "guarantee autofill policy failed"

echo "[STEP] guarantee download gate"
node scripts/check-guarantee-download-gate.mjs || fail "guarantee download gate failed"

echo "[STEP] AI runtime model routing"
node scripts/check-ai-model-routing.mjs || fail "AI runtime model routing failed"

echo "[STEP] correction event builder"
node scripts/check-correction-events.mjs || fail "correction event builder failed"

echo "[STEP] AI experience draft builder"
node scripts/check-ai-experience-drafts.mjs || fail "AI experience draft builder failed"

echo "[STEP] approved AI experience retrieval"
node scripts/check-ai-experience-retrieval.mjs || fail "approved AI experience retrieval failed"

echo "[STEP] extraction review materialization"
node <<'NODE' || fail "extraction review materialization failed"
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const Module = require("module");

const sourcePath = path.resolve("src/lib/extraction-review-materialization.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(js, sourcePath);
const { materializeExtractionReviewValue } = mod.exports;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const accepted = materializeExtractionReviewValue({
  reviewStatus: "accepted",
  baseValue: "抽出値",
});
assert(accepted.finalValue === "抽出値", "accepted should keep extracted value");
assert(accepted.shouldConfirm === true, "accepted should confirm non-empty value");

const edited = materializeExtractionReviewValue({
  reviewStatus: "edited",
  editedValue: " 修正値 ",
  baseValue: "抽出値",
});
assert(edited.finalValue === "修正値", "edited non-empty should use edited value");
assert(edited.shouldConfirm === true, "edited non-empty should confirm");

const editedEmpty = materializeExtractionReviewValue({
  reviewStatus: "edited",
  editedValue: "   ",
  baseValue: "抽出値",
});
assert(editedEmpty.finalValue === undefined, "edited empty must not fall back to extracted value");
assert(editedEmpty.shouldConfirm === false, "edited empty must not be materialized into confirmed data");

const unknown = materializeExtractionReviewValue({
  reviewStatus: "unknown",
  baseValue: "抽出値",
});
assert(unknown.finalValue === undefined, "unknown must not confirm");
assert(unknown.shouldConfirm === false, "unknown must not materialize");
NODE

echo "[STEP] tenant session foundation"
node scripts/check-tenant-session.mjs || fail "tenant session foundation failed"

echo "[STEP] tenant data access boundary"
node scripts/check-tenant-data-access.mjs || fail "tenant data access boundary failed"

echo "[STEP] tenant governance boundary"
node scripts/check-tenant-governance.mjs || fail "tenant governance boundary failed"

echo "[STEP] production auth and RLS baseline"
node scripts/check-production-security.mjs || fail "production auth and RLS baseline failed"

echo "[STEP] health check"
health_json="$(curl -fsS "${BASE_URL}/api/health/data")" || fail "health endpoint unreachable"
echo "$health_json" | grep '"ok":true' >/dev/null || fail "health check returned not ok"

echo "[STEP] tenant session API"
tenant_session_json="$(curl -fsS "${BASE_URL}/api/tenant/session")" || fail "tenant session endpoint unreachable"
echo "$tenant_session_json" | grep '"ok":true' >/dev/null || fail "tenant session returned not ok"
echo "$tenant_session_json" | grep '"id":"tenant_cherry"' >/dev/null || fail "tenant session missing default tenant"
echo "$tenant_session_json" | grep '"role":"tenant_owner"' >/dev/null || fail "tenant session missing owner role"

echo "[STEP] intake parse API"
parse_json="$(curl -fsS -X POST "${BASE_URL}/api/clients/intake/parse" -H 'content-type: application/json' -d '{"text":"港区投資、予算8000万〜1億、月々30万円、本人確認は保留中"}')" || fail "intake parse endpoint failed"
echo "$parse_json" | grep '"recommendedTemplate"' >/dev/null || fail "parse response missing recommendedTemplate"

echo "[STEP] input file upload API"
if [ -f "/Users/laineyzhu/Desktop/房产专家资料库/14_a-03.xlsx" ]; then
  important_matters_upload_json="$(curl -fsS -X POST "${BASE_URL}/api/input-files/upload" -F "excelFile=@/Users/laineyzhu/Desktop/房产专家资料库/14_a-03.xlsx")" || fail "important matters upload API failed"
  echo "$important_matters_upload_json" | grep '"ok":true' >/dev/null || fail "important matters upload API not ok"
  echo "$important_matters_upload_json" | grep '"documentType":"important_matters_unit_sale"' >/dev/null || fail "important matters upload API wrong document type"
  echo "$important_matters_upload_json" | grep '"fieldCount":12' >/dev/null || fail "important matters upload API wrong field count"
fi
if [ -f "/Users/laineyzhu/Desktop/房产专家资料库/5_ippan_kubun.xlsx" ]; then
  sale_contract_upload_json="$(curl -fsS -X POST "${BASE_URL}/api/input-files/upload" -F "excelFile=@/Users/laineyzhu/Desktop/房产专家资料库/5_ippan_kubun.xlsx")" || fail "sale contract upload API failed"
  echo "$sale_contract_upload_json" | grep '"ok":true' >/dev/null || fail "sale contract upload API not ok"
  echo "$sale_contract_upload_json" | grep '"documentType":"sale_contract_unit_general_seller"' >/dev/null || fail "sale contract upload API wrong document type"
  echo "$sale_contract_upload_json" | grep '"fieldCount":14' >/dev/null || fail "sale contract upload API wrong field count"
fi

echo "[STEP] dashboard key modules"
dash_html="$(curl -fsS "${BASE_URL}/")" || fail "dashboard page unreachable"
echo "$dash_html" | grep '港区グランドタワー 8F 保証会社申込書' >/dev/null || fail "home page missing guarantee application task title"
echo "$dash_html" | grep '資料を入れる' >/dev/null || fail "home page missing step 1 input task"
echo "$dash_html" | grep '足りない項目だけ確認' >/dev/null || fail "home page missing step 2 missing-field task"
echo "$dash_html" | grep '申込書を出す' >/dev/null || fail "home page missing step 3 application task"
echo "$dash_html" | grep '今やること' >/dev/null || fail "home page missing single next-action section"
echo "$dash_html" | grep '情報を整理' >/dev/null || fail "home page missing workbench correction layer"

echo "[STEP] new IA routes"
curl -fsS "${BASE_URL}/import-center" >/dev/null || fail "import-center unreachable"
curl -fsS "${BASE_URL}/properties" >/dev/null || fail "properties unreachable"
curl -fsS "${BASE_URL}/parties" >/dev/null || fail "parties unreachable"
curl -fsS "${BASE_URL}/contracts" >/dev/null || fail "contracts unreachable"
curl -fsS "${BASE_URL}/service-requests" >/dev/null || fail "service-requests unreachable"
output_html="$(curl -fsS "${BASE_URL}/output-center")" || fail "output-center unreachable"
echo "$output_html" | grep '保証会社申込書' >/dev/null || fail "output-center missing simplified guarantee heading"
echo "$output_html" | grep '保証会社申込書' >/dev/null || fail "output-center missing guarantee application primary path"
echo "$output_html" | grep '残りの確認項目' >/dev/null || fail "output-center missing checklist task card"
echo "$output_html" | grep '全保連' >/dev/null || fail "output-center missing Zenhoren template"
echo "$output_html" | grep '日本セーフティー' >/dev/null || fail "output-center missing Nihon Safety template"
echo "$output_html" | grep 'Jリース' >/dev/null || fail "output-center missing J Lease template"
echo "$output_html" | grep 'インシュア' >/dev/null || fail "output-center missing Insure template"
echo "$output_html" | grep 'ふれんず保証' >/dev/null || fail "output-center missing Friends Guarantee template"
echo "$output_html" | grep '全保連株式会社' >/dev/null || fail "output-center missing Zenhoren company legal name"
echo "$output_html" | grep 'ジェイリース株式会社' >/dev/null || fail "output-center missing J Lease company legal name"
echo "$output_html" | grep '株式会社ふれんず宅建保証' >/dev/null || fail "output-center missing Friends Guarantee company legal name"
echo "$output_html" | grep '１全保連.pdf' >/dev/null && fail "output-center exposes template source file name in company selector"
friends_html="$(curl -fsS "${BASE_URL}/output-center?guaranteeTemplate=friends_guarantee_individual_v1")" || fail "friends guarantee output-center unreachable"
echo "$friends_html" | grep 'ふれんず保証プラン' >/dev/null || fail "output-center missing broker-facing company option label"
echo "$friends_html" | grep 'friendsGuarantee.planType' >/dev/null && fail "output-center exposes internal company option key"
echo "$friends_html" | grep 'ふれんず保証申込書をプレビュー' >/dev/null || fail "friends guarantee missing application preview entry"
echo "$friends_html" | grep '港区グランドタワー 8F 保証会社申込書' >/dev/null || fail "friends guarantee default current case not visible"
friends_fixture_case_id="case_fixture_friends_guarantee_pdf"
case_workbench_html="$(curl -fsS "${BASE_URL}/cases/${friends_fixture_case_id}")" || fail "case workbench fixture page unreachable"
echo "$case_workbench_html" | grep '情報を整理する' >/dev/null || fail "case workbench missing information review heading"
echo "$case_workbench_html" | grep 'いま優先する申込書' >/dev/null || fail "case workbench missing selected-template target header"
echo "$case_workbench_html" | grep 'この申込書で必要' >/dev/null || fail "case workbench missing selected-template required progress"
echo "$case_workbench_html" | grep "/cases/${friends_fixture_case_id}?guaranteeTemplate=j_lease_individual_v1" >/dev/null || fail "case workbench missing target template switch link"
echo "$case_workbench_html" | grep '要対応' >/dev/null || fail "case workbench missing attention-first filter"
echo "$case_workbench_html" | grep '出力に必要' >/dev/null || fail "case workbench missing output-required filter"
echo "$case_workbench_html" | grep 'id="guarantee-template-drafts"' >/dev/null || fail "case workbench missing guarantee template card anchor"
echo "$case_workbench_html" | grep '不足項目への近道' >/dev/null || fail "case workbench missing selected-template missing index"
echo "$case_workbench_html" | grep '確認済み' >/dev/null || fail "case workbench missing confirmed status label"
echo "$case_workbench_html" | grep '修正済み' >/dev/null || fail "case workbench missing edited status label"
echo "$case_workbench_html" | grep 'AI候補' >/dev/null || fail "case workbench missing AI candidate status label"
echo "$case_workbench_html" | grep '確認が必要' >/dev/null || fail "case workbench missing needs-review status label"
echo "$case_workbench_html" | grep '未入力' >/dev/null || fail "case workbench missing missing status label"
echo "$case_workbench_html" | grep '不一致' >/dev/null || fail "case workbench missing conflict status label"
echo "$case_workbench_html" | grep '不採用' >/dev/null || fail "case workbench missing rejected status label"
echo "$case_workbench_html" | grep '不明' >/dev/null || fail "case workbench missing unknown status label"
case_workbench_all_html="$(curl -fsS "${BASE_URL}/cases/${friends_fixture_case_id}?guaranteeTemplate=friends_guarantee_individual_v1&filter=all")" || fail "case workbench all-fields page unreachable"
echo "$case_workbench_all_html" | grep 'id="workbench-property_lease"' >/dev/null || fail "case workbench all-fields missing property/lease anchor"
echo "$case_workbench_all_html" | grep '物件・契約条件' >/dev/null || fail "case workbench all-fields missing property/lease group"
echo "$case_workbench_all_html" | grep '申込者・賃借人' >/dev/null || fail "case workbench all-fields missing applicant group"
echo "$case_workbench_all_html" | grep '勤務先・収入' >/dev/null || fail "case workbench all-fields missing employment group"
echo "$case_workbench_all_html" | grep '緊急連絡先' >/dev/null || fail "case workbench all-fields missing guarantor/contact group"
echo "$case_workbench_all_html" | grep '管理会社' >/dev/null || fail "case workbench all-fields missing broker/management group"
echo "$case_workbench_all_html" | grep 'name="field:property.name"' >/dev/null || fail "case workbench missing editable property name field"
echo "$case_workbench_all_html" | grep 'name="field:applicant.name"' >/dev/null || fail "case workbench missing editable applicant name field"
echo "$case_workbench_all_html" | grep 'select name="field:applicant.gender"' >/dev/null || fail "case workbench applicant gender should use a select control"
echo "$case_workbench_all_html" | grep 'name="field:applicant.phone"' >/dev/null || fail "case workbench missing typed applicant phone control"
echo "$case_workbench_all_html" | grep 'type="tel"' >/dev/null || fail "case workbench phone field should render as tel"
echo "$case_workbench_all_html" | grep 'name="field:applicant.email"' >/dev/null || fail "case workbench missing typed applicant email control"
echo "$case_workbench_all_html" | grep 'type="email"' >/dev/null || fail "case workbench email field should render as email"
echo "$case_workbench_all_html" | grep '1990年1月1日' >/dev/null || fail "case workbench date field missing business date placeholder"
echo "$case_workbench_all_html" | grep 'name="guaranteeTemplate" value="friends_guarantee_individual_v1"' >/dev/null || fail "case workbench save form does not preserve selected guarantee template"
echo "$case_workbench_all_html" | grep '保証会社別 追加項目' >/dev/null || fail "case workbench missing company-specific draft editor"
echo "$case_workbench_all_html" | grep '案件共通データではなく' >/dev/null || fail "case workbench missing draft/common-data boundary copy"
echo "$case_workbench_all_html" | grep 'name="templateId" value="friends_guarantee_individual_v1"' >/dev/null || fail "case workbench draft form does not preserve selected template id"
echo "$case_workbench_all_html" | grep 'name="draft:company_option.friends_plan_type"' >/dev/null || fail "case workbench missing editable friends guarantee plan draft field"
echo "$case_workbench_all_html" | grep 'name="draft:company_option.friends_consent"' >/dev/null || fail "case workbench missing editable friends consent draft field"
echo "$case_workbench_all_html" | grep '会社別項目を保存' >/dev/null || fail "case workbench missing company-specific draft save action"
echo "$case_workbench_all_html" | grep '項目保存' >/dev/null || fail "case workbench missing company-specific draft saved-at status"
echo "$case_workbench_all_html" | grep 'guaranteeTemplate=friends_guarantee_individual_v1&amp;filter=required' >/dev/null || fail "case workbench filter links do not preserve selected guarantee template"
echo "$case_workbench_all_html" | grep '申込書で止まる' >/dev/null || fail "case workbench missing current-application blocking queue"
echo "$case_workbench_all_html" | grep '高信頼候補' >/dev/null || fail "case workbench missing trusted-candidate queue"
echo "$case_workbench_all_html" | grep '低信頼' >/dev/null || fail "case workbench missing low-confidence queue"
echo "$case_workbench_all_html" | grep '候補なし' >/dev/null || fail "case workbench missing no-source queue"
echo "$case_workbench_all_html" | grep 'queue=trusted_candidates' >/dev/null || fail "case workbench queue links missing trusted-candidate route"
echo "$case_workbench_all_html" | grep 'name="status:property.name"' >/dev/null || fail "case workbench missing field decision selector"
echo "$case_workbench_all_html" | grep '入力値を使う' >/dev/null || fail "case workbench missing confirmed decision label"
echo "$case_workbench_all_html" | grep '不明として残す' >/dev/null || fail "case workbench missing unknown decision label"
echo "$case_workbench_all_html" | grep '候補を使わない' >/dev/null || fail "case workbench missing rejected decision label"
echo "$case_workbench_html" | grep '保証会社別 追加項目' >/dev/null || fail "case workbench missing guarantee template section"
echo "$case_workbench_html" | grep '全保連' >/dev/null || fail "case workbench missing Zenhoren template card"
echo "$case_workbench_html" | grep '日本セーフティー' >/dev/null || fail "case workbench missing Nihon Safety template card"
echo "$case_workbench_html" | grep 'Jリース' >/dev/null || fail "case workbench missing J Lease template card"
echo "$case_workbench_html" | grep 'インシュア' >/dev/null || fail "case workbench missing Insure template card"
echo "$case_workbench_html" | grep 'ふれんず保証' >/dev/null || fail "case workbench missing Friends Guarantee template card"
echo "$case_workbench_html" | grep '申込書を確認' >/dev/null || fail "case workbench missing application preview action"
normalization_tmp_dir="$(mktemp -d)"
node <<'NODE' >"$normalization_tmp_dir/case-field-normalization-regression.log" || fail "case field normalization regression failed"
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const tsModuleCache = new Map();

function resolveProjectAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  return path.resolve(`src/lib/${request.slice("@/lib/".length)}.ts`);
}

function loadTsModule(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (tsModuleCache.has(sourcePath)) return tsModuleCache.get(sourcePath);

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
  tsModuleCache.set(sourcePath, mod.exports);
  mod.require = (request) => {
    const aliasPath = resolveProjectAlias(request);
    return aliasPath ? loadTsModule(aliasPath) : originalRequire(request);
  };
  mod._compile(js, sourcePath);
  tsModuleCache.set(sourcePath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { clearCaseFieldValueAliases, getCaseFieldValue } = loadTsModule("src/lib/case-field-normalization.ts");

const confirmedData = {
  property_name: "抽出キー物件レジデンス",
  room_number: "202",
  broker_a_company_name: "抽出仲介株式会社",
};

assert(
  getCaseFieldValue(confirmedData, "property.name") === "抽出キー物件レジデンス",
  "raw property_name alias should be readable before clearing",
);

confirmedData["property.name"] = "修正後物件名";
assert(getCaseFieldValue(confirmedData, "property.name") === "修正後物件名", "non-empty edit should prefer canonical value");

clearCaseFieldValueAliases(confirmedData, "property.name");
assert(getCaseFieldValue(confirmedData, "property.name") === "", "cleared canonical field must not revive raw property_name alias");
assert(!("property_name" in confirmedData), "raw property_name alias should be removed from confirmed data");
assert(!("property.name" in confirmedData), "canonical property.name should be removed from confirmed data");
assert(getCaseFieldValue(confirmedData, "property.roomNumber") === "202", "clearing property.name should not clear room number");
assert(
  getCaseFieldValue(confirmedData, "broker.companyName") === "抽出仲介株式会社",
  "clearing property.name should not clear unrelated broker alias",
);

clearCaseFieldValueAliases(confirmedData, "broker.companyName");
assert(getCaseFieldValue(confirmedData, "broker.companyName") === "", "cleared broker field must not revive broker_a_company_name alias");

console.log("[PASS] case field alias clearing regression");
NODE
extractor_case_id="case_fixture_extractor_keys_workbench"
extractor_workbench_html="$(curl -fsS "${BASE_URL}/cases/${extractor_case_id}?filter=all")" || fail "extractor-key case workbench page unreachable"
echo "$extractor_workbench_html" | grep '港区グランドタワー 8F 抽出確認案件' >/dev/null || fail "extractor-key case title missing"
echo "$extractor_workbench_html" | grep 'name="field:property.name"' >/dev/null || fail "extractor-key case missing canonical property field"
echo "$extractor_workbench_html" | grep 'value="港区グランドタワー"' >/dev/null || fail "extractor-key property_name did not show in canonical property field"
echo "$extractor_workbench_html" | grep 'value="202"' >/dev/null || fail "extractor-key room_number did not show in canonical room field"
echo "$extractor_workbench_html" | grep 'value="Cherry Investment株式会社"' >/dev/null || fail "extractor-key broker_a_company_name did not show in canonical broker field"
echo "$extractor_workbench_html" | grep '出典を見る' >/dev/null || fail "extractor-key case missing source evidence disclosure"
echo "$extractor_workbench_html" | grep '候補判断' >/dev/null || fail "extractor-key case missing field-level candidate judgment summary"
echo "$extractor_workbench_html" | grep 'この値で確認保存' >/dev/null || fail "extractor-key case missing one-field candidate confirmation action"
echo "$extractor_workbench_html" | grep '表示中の候補をまとめて確認' >/dev/null || fail "extractor-key case missing visible candidate batch confirmation action"
extractor_trusted_queue_html="$(curl -fsS "${BASE_URL}/cases/${extractor_case_id}?guaranteeTemplate=friends_guarantee_individual_v1&queue=trusted_candidates")" || fail "extractor-key trusted-candidate queue unreachable"
echo "$extractor_trusted_queue_html" | grep '高信頼候補' >/dev/null || fail "extractor-key trusted-candidate queue missing label"
selected_friends_html="$(curl -fsS "${BASE_URL}/output-center?caseId=${friends_fixture_case_id}&guaranteeTemplate=friends_guarantee_individual_v1")" || fail "friends guarantee fixture-case page unreachable"
echo "$selected_friends_html" | grep '港区グランドタワー 8F 保証会社申込書' >/dev/null || fail "friends guarantee fixture case not visible"
echo "$selected_friends_html" | grep '準備済み' >/dev/null || fail "friends guarantee output missing ready status"
echo "$selected_friends_html" | grep '会社別追加項目' >/dev/null || fail "friends guarantee output missing draft source label"
echo "$selected_friends_html" | grep '住居用標準プラン' >/dev/null || fail "friends guarantee output missing saved draft plan"
echo "$selected_friends_html" | grep '収納代行利用有無' >/dev/null || fail "friends guarantee output missing collection agency draft field"
echo "$selected_friends_html" | grep -E '管理会社確認後に提出予定|QA 完成確認' >/dev/null || fail "friends guarantee output missing saved draft notes"
echo "$selected_friends_html" | grep '項目保存' >/dev/null || fail "friends guarantee output missing draft saved-at status"
echo "$selected_friends_html" | grep '情報整理で入力' >/dev/null || fail "friends guarantee output missing workbench fill action"
echo "$selected_friends_html" | grep "/cases/${friends_fixture_case_id}?guaranteeTemplate=friends_guarantee_individual_v1#guarantee-template-drafts" >/dev/null || fail "friends guarantee output missing company-draft workbench deep link"
echo "$selected_friends_html" | grep "/cases/${friends_fixture_case_id}?guaranteeTemplate=friends_guarantee_individual_v1#workbench-" >/dev/null || fail "friends guarantee output missing template-scoped workbench deep link"
echo "$selected_friends_html" | grep "/guarantee-applications/friends_guarantee_individual_v1/preview?caseId=${friends_fixture_case_id}" >/dev/null || fail "friends guarantee output missing preview draft deep link"
echo "$selected_friends_html" | grep "/api/guarantee-applications/friends_guarantee_individual_v1/download?caseId=${friends_fixture_case_id}" >/dev/null || fail "friends guarantee ready-state page missing direct PDF download link"
friends_preview_html="$(curl -fsS "${BASE_URL}/guarantee-applications/friends_guarantee_individual_v1/preview?caseId=${friends_fixture_case_id}")" || fail "friends guarantee preview page unreachable"
echo "$friends_preview_html" | grep '会社別草稿' >/dev/null || fail "friends guarantee preview missing company-specific draft status"
echo "$friends_preview_html" | grep '草稿保存' >/dev/null || fail "friends guarantee preview missing draft saved-at status"
echo "$friends_preview_html" | grep 'ワークベンチの会社別草稿へ' >/dev/null || fail "friends guarantee preview missing workbench draft edit link"
echo "$friends_preview_html" | grep "/cases/${friends_fixture_case_id}?guaranteeTemplate=friends_guarantee_individual_v1#guarantee-template-drafts" >/dev/null || fail "friends guarantee preview missing company-draft workbench deep link"
legacy_pdfme_preview_html="$(curl -fsS "${BASE_URL}/guarantee-applications/zenhoren_individual_v1/preview?caseId=${friends_fixture_case_id}&engine=pdfme")" || fail "legacy pdfme preview route unreachable"
echo "$legacy_pdfme_preview_html" | grep '公式底版精校' >/dev/null || fail "legacy pdfme preview should use clear official base editor"
echo "$legacy_pdfme_preview_html" | grep '申込書の上で直接なおす' >/dev/null || fail "legacy pdfme preview should render editable guided preview"
echo "$legacy_pdfme_preview_html" | grep '公式PDF精校モード' >/dev/null && fail "legacy pdfme preview must not render broken pdfme designer"
if [ -f "/Users/laineyzhu/Desktop/房产专家资料库/５ふれんず保証.pdf" ]; then
  friends_pdf="/tmp/broker-desk-friends-guarantee-smoke.pdf"
  no_case_body="/tmp/broker-desk-friends-guarantee-no-case.json"
  no_case_status="$(curl -sS -o "$no_case_body" -w '%{http_code}' "${BASE_URL}/api/guarantee-applications/friends-guarantee/download")"
  [ "$no_case_status" = "400" ] || fail "friends guarantee no-case download should return 400"
  grep '"case_required"' "$no_case_body" >/dev/null || fail "friends guarantee no-case response missing case_required"
	  head -c 4 "$no_case_body" | grep '%PDF' >/dev/null && fail "friends guarantee no-case response must not be a PDF"

	  invalid_case_body="/tmp/broker-desk-friends-guarantee-invalid-case.json"
	  invalid_case_status="$(curl -sS -o "$invalid_case_body" -w '%{http_code}' "${BASE_URL}/api/guarantee-applications/friends-guarantee/download?caseId=invalid_case_for_regression")"
	  [ "$invalid_case_status" = "404" ] || fail "friends guarantee invalid case should return 404"
	  grep '"case_not_found"' "$invalid_case_body" >/dev/null || fail "friends guarantee invalid-case response missing case_not_found"

	  invalid_template_body="/tmp/broker-desk-guarantee-invalid-template.json"
	  invalid_template_status="$(curl -sS -o "$invalid_template_body" -w '%{http_code}' "${BASE_URL}/api/guarantee-applications/not_a_real_template/download?caseId=${friends_fixture_case_id}")"
	  [ "$invalid_template_status" = "404" ] || fail "unknown guarantee template download should return 404"
	  grep '"template_not_found"' "$invalid_template_body" >/dev/null || fail "unknown guarantee template response missing template_not_found"

	  incomplete_case_body="/tmp/broker-desk-friends-guarantee-incomplete-case.json"
  incomplete_case_status="$(curl -sS -o "$incomplete_case_body" -w '%{http_code}' "${BASE_URL}/api/guarantee-applications/friends-guarantee/download?caseId=${extractor_case_id}")"
  [ "$incomplete_case_status" = "422" ] || fail "friends guarantee incomplete case download should return 422"
  grep '"friends_guarantee_required_fields_missing"' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing required-fields error"
  grep '"previewUrl"' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing previewUrl"
  grep '"blockedReasons"' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing blockedReasons"
  grep 'guarantee-template-drafts' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing draft deep link"

  if [ "${#QA_CURL_HEADERS[@]}" -gt 0 ]; then
    complete_fixture_json="$(curl -fsS -X POST "${BASE_URL}/api/qa/friends-guarantee/complete" "${QA_CURL_HEADERS[@]}" -H 'content-type: application/json' -d "{\"caseId\":\"${friends_fixture_case_id}\"}")" || fail "friends guarantee fixture QA completion failed"
  else
    complete_fixture_json="$(curl -fsS -X POST "${BASE_URL}/api/qa/friends-guarantee/complete" -H 'content-type: application/json' -d "{\"caseId\":\"${friends_fixture_case_id}\"}")" || fail "friends guarantee fixture QA completion failed"
  fi
  echo "$complete_fixture_json" | grep '"draftStatus":"ready"' >/dev/null || fail "friends guarantee fixture QA completion did not make draft ready"

  guarantee_templates=(
    "zenhoren_individual_v1"
    "nihon_safety_individual_v1"
    "j_lease_individual_v1"
    "insure_individual_v1"
    "friends_guarantee_individual_v1"
  )
  for template_id in "${guarantee_templates[@]}"; do
    template_pdf="/tmp/broker-desk-${template_id}-smoke.pdf"
    template_visual_pdf="/tmp/broker-desk-${template_id}-visual.pdf"
    template_direct_pdf="/tmp/broker-desk-${template_id}-direct.pdf"
    BASE_URL="$BASE_URL" CASE_ID="$friends_fixture_case_id" TEMPLATE_ID="$template_id" OUTPUT_PDF="$template_pdf" node scripts/friends-guarantee-pdf-fidelity.mjs >"/tmp/broker-desk-${template_id}-fidelity.json" || fail "${template_id} fixture PDF fidelity check failed"
    BASE_URL="$BASE_URL" CASE_ID="$friends_fixture_case_id" TEMPLATE_ID="$template_id" OUTPUT_PDF="$template_visual_pdf" OUTPUT_DIR="/tmp/broker-desk-${template_id}-visual" node scripts/guarantee-pdf-visual-smoke.mjs >"/tmp/broker-desk-${template_id}-visual.json" || fail "${template_id} fixture visual smoke failed"
    direct_status="$(curl -sS -o "$template_direct_pdf" -w '%{http_code} %{content_type}' "${BASE_URL}/api/guarantee-applications/${template_id}/download?caseId=${friends_fixture_case_id}")"
    echo "$direct_status" | grep '^200 application/pdf' >/dev/null || fail "${template_id} direct download returned ${direct_status}"
    head -c 4 "$template_direct_pdf" | grep '%PDF' >/dev/null || fail "${template_id} direct download is not a PDF"
  done
  BASE_URL="$BASE_URL" CASE_ID="$extractor_case_id" PDF_MODE="preview" OUTPUT_PDF="/tmp/broker-desk-friends-guarantee-extractor-keys.pdf" node scripts/friends-guarantee-pdf-fidelity.mjs >/tmp/broker-desk-friends-guarantee-extractor-keys-fidelity.json || fail "friends guarantee extractor-key fixture preview PDF fidelity check failed"
fi
echo "$output_html" | grep '出力履歴' >/dev/null || fail "output-center missing history"
property_overview_html="$(curl -fsS "${BASE_URL}/output-center?type=property_overview&targetProperty=prop_minato_tower")" || fail "property overview output-center unreachable"
echo "$property_overview_html" | grep '物件概要書' >/dev/null || fail "property overview missing document type"
echo "$property_overview_html" | grep '港区グランドタワー' >/dev/null || fail "property overview missing selected property"
missing_property_html="$(curl -fsS "${BASE_URL}/output-center?type=property_overview")" || fail "property overview missing-target page unreachable"
echo "$missing_property_html" | grep '対象物件が未選択です' >/dev/null || fail "property overview missing-target state not explicit"
invalid_property_html="$(curl -fsS "${BASE_URL}/output-center?type=property_overview&targetProperty=invalid")" || fail "property overview invalid-target page unreachable"
echo "$invalid_property_html" | grep '対象物件が未選択です' >/dev/null || fail "property overview invalid-target state not explicit"
curl -fsS "${BASE_URL}/templates" >/dev/null || fail "templates unreachable"

quotes_html="$(curl -fsS "${BASE_URL}/quotes")" || fail "quotes page unreachable"
quote_path="$(printf '%s\n' "$quotes_html" | rg -o '/quotes/quote_[A-Za-z0-9_-]+' | head -n 1 || true)"
[ -n "$quote_path" ] || fail "no quote link found on quotes page"

echo "[STEP] output templates"
proposal_html="$(curl -fsS "${BASE_URL}${quote_path}/print?type=proposal")" || fail "proposal template unreachable"
echo "$proposal_html" | grep '購入提案書' >/dev/null || fail "proposal template missing title"
echo "$proposal_html" | grep '文書番号' >/dev/null || fail "proposal template missing document control"
estimate_html="$(curl -fsS "${BASE_URL}${quote_path}/print?type=estimate_sheet")" || fail "estimate template unreachable"
echo "$estimate_html" | grep '費用見積明細書' >/dev/null || fail "estimate template missing title"

echo "[STEP] template center"
settings_html="$(curl -fsS "${BASE_URL}/settings/output-templates")" || fail "template center unreachable"
echo "$settings_html" | grep '出力テンプレート調整センター' >/dev/null || fail "template center missing heading"
echo "$settings_html" | grep '日本標準テンプレートを再適用' >/dev/null || fail "template center missing reset action"
ai_experience_html="$(curl -fsS "${BASE_URL}/settings/ai-experience")" || fail "AI experience review unreachable"
echo "$ai_experience_html" | grep 'AI経験レビュー' >/dev/null || fail "AI experience review missing heading"
echo "$ai_experience_html" | grep '草稿を生成' >/dev/null || fail "AI experience review missing draft action"
echo "$ai_experience_html" | grep '承認待ち' >/dev/null || fail "AI experience review missing draft status"

echo "[STEP] board stage API (forward + rollback)"
forward_json="$(curl -fsS -X PATCH "${BASE_URL}/api/clients/client_yamada/stage" -H 'content-type: application/json' -d '{"stage":"contacted","reason":"回帰テスト"}')" || fail "board stage update failed"
echo "$forward_json" | grep '"ok":true' >/dev/null || fail "board stage forward not ok"
rollback_json="$(curl -fsS -X PATCH "${BASE_URL}/api/clients/client_yamada/stage" -H 'content-type: application/json' -d '{"stage":"lead","reason":"回帰テスト戻し"}')" || fail "board stage rollback failed"
echo "$rollback_json" | grep '"ok":true' >/dev/null || fail "board stage rollback not ok"

echo "[PASS] regression checks passed"
