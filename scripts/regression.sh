#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

fail() {
  echo "[FAIL] $1"
  exit 1
}

echo "[INFO] BASE_URL=${BASE_URL}"

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

echo "[STEP] health check"
health_json="$(curl -fsS "${BASE_URL}/api/health/data")" || fail "health endpoint unreachable"
echo "$health_json" | grep '"ok":true' >/dev/null || fail "health check returned not ok"

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
echo "$dash_html" | grep '保証会社申込書を作成' >/dev/null || fail "home page missing guarantee application task title"
echo "$dash_html" | grep '資料を入れる' >/dev/null || fail "home page missing step 1 input task"
echo "$dash_html" | grep '足りない項目だけ確認' >/dev/null || fail "home page missing step 2 missing-field task"
echo "$dash_html" | grep '申込書を出す' >/dev/null || fail "home page missing step 3 application task"
echo "$dash_html" | grep '保証会社申込書を続ける' >/dev/null || fail "home page missing current guarantee application CTA"

echo "[STEP] new IA routes"
curl -fsS "${BASE_URL}/import-center" >/dev/null || fail "import-center unreachable"
curl -fsS "${BASE_URL}/properties" >/dev/null || fail "properties unreachable"
curl -fsS "${BASE_URL}/parties" >/dev/null || fail "parties unreachable"
curl -fsS "${BASE_URL}/contracts" >/dev/null || fail "contracts unreachable"
curl -fsS "${BASE_URL}/service-requests" >/dev/null || fail "service-requests unreachable"
output_html="$(curl -fsS "${BASE_URL}/output-center")" || fail "output-center unreachable"
echo "$output_html" | grep '保証会社申込書' >/dev/null || fail "output-center missing simplified guarantee heading"
echo "$output_html" | grep '保証会社申込書' >/dev/null || fail "output-center missing guarantee application primary path"
echo "$output_html" | grep '次にやること' >/dev/null || fail "output-center missing next-action task card"
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
echo "$case_workbench_html" | grep '案件ワークベンチ' >/dev/null || fail "case workbench missing workbench heading"
echo "$case_workbench_html" | grep 'id="workbench-property_lease"' >/dev/null || fail "case workbench missing property/lease anchor"
echo "$case_workbench_html" | grep 'id="guarantee-template-drafts"' >/dev/null || fail "case workbench missing guarantee template card anchor"
echo "$case_workbench_html" | grep '物件・契約条件' >/dev/null || fail "case workbench missing property/lease group"
echo "$case_workbench_html" | grep '申込者・賃借人' >/dev/null || fail "case workbench missing applicant group"
echo "$case_workbench_html" | grep '勤務先・収入' >/dev/null || fail "case workbench missing employment group"
echo "$case_workbench_html" | grep '緊急連絡先・連帯保証人' >/dev/null || fail "case workbench missing guarantor/contact group"
echo "$case_workbench_html" | grep '取扱店・管理会社' >/dev/null || fail "case workbench missing broker/management group"
echo "$case_workbench_html" | grep '未入力・要確認' >/dev/null || fail "case workbench missing missing/needs-review group"
echo "$case_workbench_html" | grep '確認済み' >/dev/null || fail "case workbench missing confirmed status label"
echo "$case_workbench_html" | grep '修正済み' >/dev/null || fail "case workbench missing edited status label"
echo "$case_workbench_html" | grep 'AI候補' >/dev/null || fail "case workbench missing AI candidate status label"
echo "$case_workbench_html" | grep '確認が必要' >/dev/null || fail "case workbench missing needs-review status label"
echo "$case_workbench_html" | grep '未入力' >/dev/null || fail "case workbench missing missing status label"
echo "$case_workbench_html" | grep '不一致' >/dev/null || fail "case workbench missing conflict status label"
echo "$case_workbench_html" | grep '不採用' >/dev/null || fail "case workbench missing rejected status label"
echo "$case_workbench_html" | grep '不明' >/dev/null || fail "case workbench missing unknown status label"
echo "$case_workbench_html" | grep 'name="field:property.name"' >/dev/null || fail "case workbench missing editable property name field"
echo "$case_workbench_html" | grep 'name="field:applicant.name"' >/dev/null || fail "case workbench missing editable applicant name field"
echo "$case_workbench_html" | grep '保証会社別 申込書' >/dev/null || fail "case workbench missing guarantee template section"
echo "$case_workbench_html" | grep '全保連' >/dev/null || fail "case workbench missing Zenhoren template card"
echo "$case_workbench_html" | grep '日本セーフティー' >/dev/null || fail "case workbench missing Nihon Safety template card"
echo "$case_workbench_html" | grep 'Jリース' >/dev/null || fail "case workbench missing J Lease template card"
echo "$case_workbench_html" | grep 'インシュア' >/dev/null || fail "case workbench missing Insure template card"
echo "$case_workbench_html" | grep 'ふれんず保証' >/dev/null || fail "case workbench missing Friends Guarantee template card"
echo "$case_workbench_html" | grep '申込書を確認' >/dev/null || fail "case workbench missing application preview action"
normalization_tmp_dir="$(mktemp -d)"
./node_modules/.bin/tsc --target es2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --outDir "$normalization_tmp_dir" scripts/case-field-normalization-regression.ts src/lib/case-field-normalization.ts >/tmp/broker-desk-case-field-normalization-tsc.log || fail "case field normalization regression compile failed"
node "$normalization_tmp_dir/scripts/case-field-normalization-regression.js" >/tmp/broker-desk-case-field-normalization-regression.log || fail "case field normalization regression failed"
extractor_case_id="case_fixture_extractor_keys_workbench"
extractor_workbench_html="$(curl -fsS "${BASE_URL}/cases/${extractor_case_id}")" || fail "extractor-key case workbench page unreachable"
echo "$extractor_workbench_html" | grep '港区グランドタワー 8F 抽出確認案件' >/dev/null || fail "extractor-key case title missing"
echo "$extractor_workbench_html" | grep 'name="field:property.name"' >/dev/null || fail "extractor-key case missing canonical property field"
echo "$extractor_workbench_html" | grep 'value="港区グランドタワー"' >/dev/null || fail "extractor-key property_name did not show in canonical property field"
echo "$extractor_workbench_html" | grep 'value="202"' >/dev/null || fail "extractor-key room_number did not show in canonical room field"
echo "$extractor_workbench_html" | grep 'value="Cherry Investment株式会社"' >/dev/null || fail "extractor-key broker_a_company_name did not show in canonical broker field"
selected_friends_html="$(curl -fsS "${BASE_URL}/output-center?caseId=${friends_fixture_case_id}&guaranteeTemplate=friends_guarantee_individual_v1")" || fail "friends guarantee fixture-case page unreachable"
echo "$selected_friends_html" | grep '港区グランドタワー 8F 保証会社申込書' >/dev/null || fail "friends guarantee fixture case not visible"
echo "$selected_friends_html" | grep '申込書ドラフト準備' >/dev/null || fail "friends guarantee output missing draft readiness"
echo "$selected_friends_html" | grep '申込書ドラフト' >/dev/null || fail "friends guarantee output missing draft source label"
echo "$selected_friends_html" | grep '住居用標準プラン' >/dev/null || fail "friends guarantee output missing saved draft plan"
echo "$selected_friends_html" | grep '収納代行利用有無' >/dev/null || fail "friends guarantee output missing collection agency draft field"
echo "$selected_friends_html" | grep -E '管理会社確認後に提出予定|QA 完成確認' >/dev/null || fail "friends guarantee output missing saved draft notes"
echo "$selected_friends_html" | grep '案件ワークベンチで入力' >/dev/null || fail "friends guarantee output missing workbench fill action"
echo "$selected_friends_html" | grep '申込書ドラフトで入力' >/dev/null || fail "friends guarantee output missing draft fill action"
echo "$selected_friends_html" | grep "/cases/${friends_fixture_case_id}#workbench-" >/dev/null || fail "friends guarantee output missing workbench deep link"
echo "$selected_friends_html" | grep "/guarantee-applications/friends_guarantee_individual_v1/preview?caseId=${friends_fixture_case_id}" >/dev/null || fail "friends guarantee output missing preview draft deep link"
echo "$selected_friends_html" | grep '不足項目を確認' >/dev/null || fail "friends guarantee missing-state page should prioritize missing-field review"
echo "$selected_friends_html" | rg -o '/api/guarantee-applications/friends-guarantee/download\?caseId=[^"]+' >/dev/null && fail "friends guarantee missing-state page must not expose direct PDF download link"
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

  fixture_incomplete_body="/tmp/broker-desk-friends-guarantee-fixture-incomplete-case.json"
  fixture_incomplete_status="$(curl -sS -o "$fixture_incomplete_body" -w '%{http_code}' "${BASE_URL}/api/guarantee-applications/friends-guarantee/download?caseId=${friends_fixture_case_id}")"
  [ "$fixture_incomplete_status" = "422" ] || fail "friends guarantee fixture incomplete download should return 422"
  grep '"friends_guarantee_required_fields_missing"' "$fixture_incomplete_body" >/dev/null || fail "friends guarantee fixture incomplete response missing required-fields error"

  incomplete_case_body="/tmp/broker-desk-friends-guarantee-incomplete-case.json"
  incomplete_case_status="$(curl -sS -o "$incomplete_case_body" -w '%{http_code}' "${BASE_URL}/api/guarantee-applications/friends-guarantee/download?caseId=${extractor_case_id}")"
  [ "$incomplete_case_status" = "422" ] || fail "friends guarantee incomplete case download should return 422"
  grep '"friends_guarantee_required_fields_missing"' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing required-fields error"
  grep '"previewUrl"' "$incomplete_case_body" >/dev/null || fail "friends guarantee incomplete-case response missing previewUrl"

  complete_fixture_json="$(curl -fsS -X POST "${BASE_URL}/api/qa/friends-guarantee/complete" -H 'content-type: application/json' -d "{\"caseId\":\"${friends_fixture_case_id}\"}")" || fail "friends guarantee fixture QA completion failed"
  echo "$complete_fixture_json" | grep '"draftStatus":"ready"' >/dev/null || fail "friends guarantee fixture QA completion did not make draft ready"

  BASE_URL="$BASE_URL" CASE_ID="$friends_fixture_case_id" OUTPUT_PDF="$friends_pdf" node scripts/friends-guarantee-pdf-fidelity.mjs >/tmp/broker-desk-friends-guarantee-fidelity.json || fail "friends guarantee fixture PDF fidelity check failed"
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

quote_path="$(echo "$output_html" | rg -o '/quotes/[A-Za-z0-9_-]+' | rg -v '/quotes/new' | head -n 1)"
[ -n "$quote_path" ] || fail "no quote link found on output-center"

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

echo "[STEP] board stage API (forward + rollback)"
forward_json="$(curl -fsS -X PATCH "${BASE_URL}/api/clients/client_yamada/stage" -H 'content-type: application/json' -d '{"stage":"contacted","reason":"回帰テスト"}')" || fail "board stage update failed"
echo "$forward_json" | grep '"ok":true' >/dev/null || fail "board stage forward not ok"
rollback_json="$(curl -fsS -X PATCH "${BASE_URL}/api/clients/client_yamada/stage" -H 'content-type: application/json' -d '{"stage":"lead","reason":"回帰テスト戻し"}')" || fail "board stage rollback failed"
echo "$rollback_json" | grep '"ok":true' >/dev/null || fail "board stage rollback not ok"

echo "[PASS] regression checks passed"
