#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

TARGET="src"

BANNED_TERMS=(
  "新規リード"
  "見積提出済み"
  "内見実施済み"
  "失注"
  "短文"
  "正式文"
  "管理費（年）"
  "修繕積立金（年）"
  "税費用"
)

failed=0

echo "[INFO] checking Japanese terminology in ${TARGET}"
for term in "${BANNED_TERMS[@]}"; do
  if rg -n --fixed-strings "$term" "$TARGET" >/tmp/ja_term_check.out 2>/dev/null; then
    echo "[FAIL] banned term found: $term"
    cat /tmp/ja_term_check.out
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "[PASS] terminology check passed"
