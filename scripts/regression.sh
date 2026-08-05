#!/usr/bin/env bash
set -eu

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
REGRESSION_LOCALE="${REGRESSION_LOCALE:-ja}"
REGRESSION_ACTOR_ID="${REGRESSION_ACTOR_ID:-user_demo}"
REGRESSION_TENANT_ID="${REGRESSION_TENANT_ID:-tenant_cherry}"
QA_CURL_HEADERS=()
if [ -n "${BROKER_DESK_QA_TOKEN:-}" ]; then
  QA_CURL_HEADERS=(-H "x-broker-desk-qa-token: ${BROKER_DESK_QA_TOKEN}")
fi

curl() {
  command curl -H "Cookie: brokerdesk_locale=${REGRESSION_LOCALE}; brokerdesk_actor_id=${REGRESSION_ACTOR_ID}; brokerdesk_tenant_id=${REGRESSION_TENANT_ID}" "$@"
}

fail() {
  echo "[FAIL] $1"
  exit 1
}

qa_post() {
  local url="$1"
  shift || true

  if [ "${#QA_CURL_HEADERS[@]}" -gt 0 ]; then
    curl -fsS -X POST "$url" "${QA_CURL_HEADERS[@]}" "$@"
  else
    curl -fsS -X POST "$url" "$@"
  fi
}

cleanup_business_data() {
  qa_post "${BASE_URL}/api/qa/reset-business-data" >/dev/null 2>&1 || true
}

trap cleanup_business_data EXIT

echo "[INFO] BASE_URL=${BASE_URL}"
echo "[INFO] REGRESSION_LOCALE=${REGRESSION_LOCALE}"
echo "[INFO] REGRESSION_ACTOR_ID=${REGRESSION_ACTOR_ID}"
echo "[INFO] REGRESSION_TENANT_ID=${REGRESSION_TENANT_ID}"

echo "[STEP] default Japanese locale smoke"
default_home_html="$(command curl -fsS "${BASE_URL}/")" || fail "default home page unreachable"
echo "$default_home_html" | grep '何をしましょうか' >/dev/null || fail "default home page should be Japanese without locale cookie"
echo "$default_home_html" | grep '検索' >/dev/null || fail "default Japanese home page missing global search"

echo "[STEP] seed QA business data"
seed_json="$(qa_post "${BASE_URL}/api/qa/seed-business-data")" || fail "QA business data seed failed"
echo "$seed_json" | grep '"ok":true' >/dev/null || fail "QA business data seed did not return ok"
SEED_JSON="$seed_json" node <<'NODE' || fail "QA business data seed missing brokerage cases"
const payload = JSON.parse(process.env.SEED_JSON ?? "{}");
const count = payload.counts?.brokerageCases ?? 0;
if (count < 7) {
  throw new Error(`expected at least 7 brokerage cases, got ${count}`);
}
NODE

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
echo "$dash_html" | grep 'ホーム' >/dev/null || fail "home page missing home navigation"
echo "$dash_html" | grep '顧客、物件、案件、資料、出力書類を検索' >/dev/null || fail "home page missing global search"
echo "$dash_html" | grep '情報入力' >/dev/null || fail "home page missing intake entry"
echo "$dash_html" | grep '未入力情報を補足しましょう' >/dev/null || fail "home page missing organize entry"
echo "$dash_html" | grep '文書出力' >/dev/null || fail "home page missing output entry"
echo "$dash_html" | grep '資料アシスト' >/dev/null || fail "home page missing condensed assistant"
echo "$dash_html" | grep '情報整理を開く' >/dev/null || fail "home page missing organize-center handoff"

echo "[STEP] new IA routes"
curl -fsS "${BASE_URL}/import-center" >/dev/null || fail "import-center unreachable"
curl -fsS "${BASE_URL}/properties" >/dev/null || fail "properties unreachable"
curl -fsS "${BASE_URL}/parties" >/dev/null || fail "parties unreachable"
curl -fsS "${BASE_URL}/contracts" >/dev/null || fail "contracts unreachable"
curl -fsS "${BASE_URL}/service-requests" >/dev/null || fail "service-requests unreachable"
friends_fixture_case_id="case_fixture_friends_guarantee_pdf"
output_html="$(curl -fsS "${BASE_URL}/output-center")" || fail "output-center unreachable"
echo "$output_html" | grep '文書出力' >/dev/null || fail "output-center missing output center heading"
echo "$output_html" | grep '出力する文書を選択' >/dev/null || fail "output-center missing document selection"
echo "$output_html" | grep '保証会社申込' >/dev/null || fail "output-center missing guarantee application primary path"
echo "$output_html" | grep '先に対象案件を選択' >/dev/null && fail "output-center opens case selection before a document is chosen"
echo "$output_html" | grep '補助機能を表示' >/dev/null && fail "output-center exposes retired secondary output flow"
echo "$output_html" | grep '１全保連.pdf' >/dev/null && fail "output-center exposes template source file name in company selector"
guarantee_selection_html="$(curl -fsS "${BASE_URL}/output-center?docGroup=application&doc=guarantee_application")" || fail "guarantee application selection page unreachable"
echo "$guarantee_selection_html" | grep '先に対象案件を選択' >/dev/null || fail "guarantee application selection missing case selector"
echo "$guarantee_selection_html" | grep '対象案件' >/dev/null || fail "guarantee application selection missing case selection label"
echo "$guarantee_selection_html" | grep 'この案件を選ぶ' >/dev/null || fail "guarantee application selection missing case selection action"
friends_html="$(curl -fsS "${BASE_URL}/output-center?docGroup=application&doc=guarantee_application&caseId=${friends_fixture_case_id}&guaranteeTemplate=friends_guarantee_individual_v1")" || fail "friends guarantee output-center unreachable"
echo "$friends_html" | grep '全保連' >/dev/null || fail "output-center missing Zenhoren template"
echo "$friends_html" | grep '日本セーフティー' >/dev/null || fail "output-center missing Nihon Safety template"
echo "$friends_html" | grep 'Jリース' >/dev/null || fail "output-center missing J Lease template"
echo "$friends_html" | grep 'インシュア' >/dev/null || fail "output-center missing Insure template"
echo "$friends_html" | grep 'ふれんず保証' >/dev/null || fail "output-center missing Friends Guarantee template"
echo "$friends_html" | grep '全保連株式会社' >/dev/null || fail "output-center missing Zenhoren company legal name"
echo "$friends_html" | grep 'ジェイリース株式会社' >/dev/null || fail "output-center missing J Lease company legal name"
echo "$friends_html" | grep '株式会社ふれんず宅建保証' >/dev/null || fail "output-center missing Friends Guarantee company legal name"
echo "$friends_html" | grep 'ふれんず保証プラン' >/dev/null || fail "output-center missing broker-facing company option label"
echo "$friends_html" | grep 'friendsGuarantee.planType' >/dev/null && fail "output-center exposes internal company option key"
echo "$friends_html" | grep 'ふれんず保証申込書をプレビュー' >/dev/null || fail "friends guarantee missing application preview entry"
echo "$friends_html" | grep '港区グランドタワー 8F 保証会社申込書' >/dev/null || fail "friends guarantee default current case not visible"
echo "$friends_html" | grep "/api/guarantee-applications/friends_guarantee_individual_v1/download?caseId=${friends_fixture_case_id}&amp;mode=preview&amp;format=png" >/dev/null || fail "friends guarantee selection missing immediate preview source"
case_workbench_html="$(curl -fsS "${BASE_URL}/cases/${friends_fixture_case_id}")" || fail "case workbench fixture page unreachable"
echo "$case_workbench_html" | grep '情報を整理する' >/dev/null || fail "case workbench missing information review heading"
echo "$case_workbench_html" | grep '資料を追加' >/dev/null || fail "case workbench missing case-scoped intake"
echo "$case_workbench_html" | grep '確認範囲' >/dev/null || fail "case workbench missing review scope summary"
echo "$case_workbench_html" | grep '要確認' >/dev/null || fail "case workbench missing review status"
echo "$case_workbench_html" | grep '確認済み' >/dev/null || fail "case workbench missing confirmed status"
echo "$case_workbench_html" | grep 'id="case-main-editor"' >/dev/null || fail "case workbench missing main editor anchor"
echo "$case_workbench_html" | grep '文書出力' >/dev/null || fail "case workbench missing output handoff"
echo "$case_workbench_html" | grep '項目設定' >/dev/null || fail "case workbench missing field requirement settings link"
case_property_node_html="$(curl -fsS "${BASE_URL}/cases/${friends_fixture_case_id}?node=property_basic")" || fail "case workbench property node page unreachable"
echo "$case_property_node_html" | grep '確認範囲' >/dev/null || fail "case workbench node missing review scope summary"
echo "$case_property_node_html" | grep '物件基本' >/dev/null || fail "case workbench node missing selected chapter"
echo "$case_property_node_html" | grep '現在値' >/dev/null || fail "case workbench node missing visible current values"
echo "$case_property_node_html" | grep '操作' >/dev/null || fail "case workbench node missing field review action"
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
extractor_workbench_html="$(curl -fsS "${BASE_URL}/cases/${extractor_case_id}")" || fail "extractor-key case workbench page unreachable"
echo "$extractor_workbench_html" | grep '港区グランドタワー 8F 抽出確認案件' >/dev/null || fail "extractor-key case title missing"
echo "$extractor_workbench_html" | grep '確認範囲' >/dev/null || fail "extractor-key case missing review scope"
echo "$extractor_workbench_html" | grep '要確認' >/dev/null || fail "extractor-key case missing review-required state"
echo "$extractor_workbench_html" | grep '確認済み' >/dev/null || fail "extractor-key case missing confirmed state"
echo "$extractor_workbench_html" | grep '現在値' >/dev/null || fail "extractor-key case missing current-value column"
echo "$extractor_workbench_html" | grep '操作' >/dev/null || fail "extractor-key case missing field actions"
echo "$extractor_workbench_html" | grep 'name="field:applicant.birthDate"' >/dev/null || fail "extractor-key case missing typed birth-date control"
echo "$extractor_workbench_html" | grep '1990年1月1日' >/dev/null || fail "extractor-key case date field missing business date placeholder"
echo "$extractor_workbench_html" | grep '確認済みにする' >/dev/null || fail "extractor-key case missing confirm decision"
echo "$extractor_workbench_html" | grep '確認できない' >/dev/null || fail "extractor-key case missing cannot-confirm decision"
echo "$extractor_workbench_html" | grep '使わない' >/dev/null || fail "extractor-key case missing not-used decision"
echo "$extractor_workbench_html" | grep '確認して保存' >/dev/null || fail "extractor-key case missing confirm-and-save action"
echo "$extractor_workbench_html" | grep '資料を追加' >/dev/null || fail "extractor-key case missing case-scoped intake"
friends_preview_html="$(curl -fsS "${BASE_URL}/guarantee-applications/friends_guarantee_individual_v1/preview?caseId=${friends_fixture_case_id}")" || fail "friends guarantee preview page unreachable"
echo "$friends_preview_html" | grep '申込書追加情報' >/dev/null || fail "friends guarantee preview missing application extra-info status"
echo "$friends_preview_html" | grep '追加情報保存' >/dev/null || fail "friends guarantee preview missing extra-info saved-at status"
echo "$friends_preview_html" | grep 'company-draft-fields' >/dev/null || fail "friends guarantee preview missing company draft section anchor"
echo "$friends_preview_html" | grep 'この申込書だけで使う会社別の選択肢' >/dev/null || fail "friends guarantee preview missing company draft boundary copy"
legacy_pdfme_preview_html="$(curl -fsS "${BASE_URL}/guarantee-applications/zenhoren_individual_v1/preview?caseId=${friends_fixture_case_id}&engine=pdfme")" || fail "legacy pdfme preview route unreachable"
echo "$legacy_pdfme_preview_html" | grep '申込書を確認する' >/dev/null || fail "broker preview should render the case-level confirmation heading"
echo "$legacy_pdfme_preview_html" | grep '申込書上の入力欄' >/dev/null || fail "broker preview should render the field confirmation index"
echo "$legacy_pdfme_preview_html" | grep 'この申込書の位置を調整' >/dev/null || fail "broker preview should retain case-only position adjustment"
echo "$legacy_pdfme_preview_html" | grep '公式テンプレートを校正する' >/dev/null && fail "broker preview must not expose template authoring"
echo "$legacy_pdfme_preview_html" | grep '入力欄を追加' >/dev/null && fail "broker preview must not expose add-field controls"
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
  [ "$incomplete_case_status" = "422" ] || fail "friends guarantee incomplete case download should return 422, got ${incomplete_case_status}"
  grep '"friends_guarantee_required_fields_missing"' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing required-fields error"
  grep '"previewUrl"' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing previewUrl"
  grep '"blockedReasons"' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing blockedReasons"
  grep 'company-draft-fields' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing draft deep link"

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
curl -fsS "${BASE_URL}/templates" >/dev/null || fail "templates unreachable"

echo "[STEP] template center"
settings_html="$(curl -fsS "${BASE_URL}/settings/output-templates")" || fail "template center unreachable"
echo "$settings_html" | grep '書類の発行元情報' >/dev/null || fail "issuer settings missing heading"
echo "$settings_html" | grep '設定を保存' >/dev/null || fail "issuer settings missing save action"
ai_experience_html="$(curl -fsS "${BASE_URL}/settings/ai-experience")" || fail "AI experience review unreachable"
echo "$ai_experience_html" | grep 'AI経験レビュー' >/dev/null || fail "AI experience review missing heading"
echo "$ai_experience_html" | grep '新しい経験候補を整理' >/dev/null || fail "AI experience review missing update action"
echo "$ai_experience_html" | grep '確認待ち' >/dev/null || fail "input support settings missing pending status"
echo "$dash_html" | grep '入力サポート' >/dev/null && fail "home page should not expose internal AI experience entry"

echo "[STEP] board stage API (forward + rollback)"
forward_json="$(curl -fsS -X PATCH "${BASE_URL}/api/clients/client_sato_kenichi/stage" -H 'content-type: application/json' -d '{"stage":"negotiating","reason":"回帰テスト"}')" || fail "board stage update failed"
echo "$forward_json" | grep '"ok":true' >/dev/null || fail "board stage forward not ok"
rollback_json="$(curl -fsS -X PATCH "${BASE_URL}/api/clients/client_sato_kenichi/stage" -H 'content-type: application/json' -d '{"stage":"viewing","reason":"回帰テスト戻し"}')" || fail "board stage rollback failed"
echo "$rollback_json" | grep '"ok":true' >/dev/null || fail "board stage rollback not ok"

echo "[PASS] regression checks passed"
