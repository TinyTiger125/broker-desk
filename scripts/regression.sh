#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

fail() {
  echo "[FAIL] $1"
  exit 1
}

echo "[INFO] BASE_URL=${BASE_URL}"

echo "[STEP] health check"
health_json="$(curl -fsS "${BASE_URL}/api/health/data")" || fail "health endpoint unreachable"
echo "$health_json" | grep '"ok":true' >/dev/null || fail "health check returned not ok"

echo "[STEP] intake parse API"
parse_json="$(curl -fsS -X POST "${BASE_URL}/api/clients/intake/parse" -H 'content-type: application/json' -d '{"text":"港区投資、予算8000万〜1億、月々30万円、本人確認は保留中"}')" || fail "intake parse endpoint failed"
echo "$parse_json" | grep '"recommendedTemplate"' >/dev/null || fail "parse response missing recommendedTemplate"

echo "[STEP] dashboard key modules"
dash_html="$(curl -fsS "${BASE_URL}/")" || fail "dashboard page unreachable"
echo "$dash_html" | grep '業務資料ハブ' >/dev/null || fail "dashboard missing 業務資料ハブ"
echo "$dash_html" | grep '取込ジョブ状況' >/dev/null || fail "dashboard missing 取込ジョブ状況"
echo "$dash_html" | grep '対応依頼' >/dev/null || fail "dashboard missing 対応依頼"

echo "[STEP] new IA routes"
curl -fsS "${BASE_URL}/import-center" >/dev/null || fail "import-center unreachable"
curl -fsS "${BASE_URL}/properties" >/dev/null || fail "properties unreachable"
curl -fsS "${BASE_URL}/parties" >/dev/null || fail "parties unreachable"
curl -fsS "${BASE_URL}/contracts" >/dev/null || fail "contracts unreachable"
curl -fsS "${BASE_URL}/service-requests" >/dev/null || fail "service-requests unreachable"
output_html="$(curl -fsS "${BASE_URL}/output-center")" || fail "output-center unreachable"
echo "$output_html" | grep '出力センター' >/dev/null || fail "output-center missing heading"
echo "$output_html" | grep '出力履歴' >/dev/null || fail "output-center missing history"
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
forward_json="$(curl -fsS -X PATCH "${BASE_URL}/api/clients/client_lin/stage" -H 'content-type: application/json' -d '{"stage":"contacted","reason":"回帰テスト"}')" || fail "board stage update failed"
echo "$forward_json" | grep '"ok":true' >/dev/null || fail "board stage forward not ok"
rollback_json="$(curl -fsS -X PATCH "${BASE_URL}/api/clients/client_lin/stage" -H 'content-type: application/json' -d '{"stage":"quoted","reason":"回帰テスト戻し"}')" || fail "board stage rollback failed"
echo "$rollback_json" | grep '"ok":true' >/dev/null || fail "board stage rollback not ok"

echo "[PASS] regression checks passed"
