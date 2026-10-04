import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => {
  const result = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const { getGuaranteeApplicationRecoveryAction } = require(resolve(root, "src/lib/guarantee-application-recovery.ts"));
assert.equal(getGuaranteeApplicationRecoveryAction("preview_confirmation_expired"), "retry_preview", "expired confirmation must require a new preview");
assert.equal(getGuaranteeApplicationRecoveryAction("generation_in_progress"), "refresh_generation", "active generation must retain the confirmation and refresh its status");
assert.equal(getGuaranteeApplicationRecoveryAction("generation_confirmation_not_found"), "retry_preview", "missing confirmation must require a new preview");
assert.equal(getGuaranteeApplicationRecoveryAction("preview_stale"), "retry_preview", "changed case or form data must require a new preview");
assert.equal(getGuaranteeApplicationRecoveryAction("preview_confirmation_required"), "retry_preview", "missing confirmation must require a new preview");
assert.equal(getGuaranteeApplicationRecoveryAction("mask_version_not_found"), "select_template", "missing form version must return to form selection");
assert.equal(getGuaranteeApplicationRecoveryAction("blank_form_unavailable"), "select_template", "unavailable blank form must return to form selection");
assert.equal(getGuaranteeApplicationRecoveryAction("permission_denied"), "none", "permission errors must retain their specific message");

const client = readFileSync(resolve(root, "src/app/cases/[id]/guarantee-application/client.tsx"), "utf8");
for (const copy of [
  "プレビューの有効期限が切れました。入力内容を確認して、もう一度プレビューを生成してからファイルを生成してください。",
  "预览已过期。请确认本次申请内容，重新生成预览后再生成文件。",
  "미리보기 유효 시간이 만료되었습니다. 이번 신청 내용을 확인한 뒤 미리보기를 다시 생성하고 파일을 만들어 주세요.",
  "案件に登録済みの情報または帳票が更新されたため、確認済みプレビューを使えません。現在の内容を確認して、もう一度プレビューを生成してください。",
  "案件中已登记的信息或表格已更新，无法使用之前确认的预览。请确认当前内容后重新生成预览。",
  "안건에 등록된 정보 또는 서식이 변경되어 이전에 확인한 미리보기를 사용할 수 없습니다. 현재 내용을 확인한 뒤 미리보기를 다시 생성해 주세요.",
]) {
  assert(client.includes(copy), `localized recovery copy is missing: ${copy}`);
}
for (const copy of [
  "申請資料の生成に失敗したか、状態の確認に時間がかかっています。連続送信せず、履歴または生成状態を確認してから再試行してください。",
  "ファイル生成を処理中です。同じファイルを重ねて作成しないため、連続送信せず、生成状態を更新するか履歴を確認してください。",
  "生成中は同じファイルを重ねて作成しないため、ボタンを連続して押さず、履歴または「生成状態を確認」から結果を確認してください。失敗しても案件資料は変更されません。",
  "申请资料可能仍在生成，或暂时无法确认状态。请勿重复提交，先查看历史记录或刷新生成状态后再重试。",
  "신청 자료가 아직 생성 중이거나 상태를 확인할 수 없습니다. 중복 제출하지 말고 이력 또는 생성 상태를 확인한 뒤 다시 시도해 주세요.",
]) {
  assert(client.includes(copy), `persistent generation recovery copy is missing: ${copy}`);
}
assert(client.includes("clearPreviewConfirmation();"), "failed or successful generation must clear the confirmation before another attempt");
assert(client.includes('postJson(locale, "generationStatus"') && client.includes("generationInProgress"), "active generation must retain a safe status refresh path");
assert(client.includes('postJson(locale, "preview"') && client.includes("setMessage(text.previewLocked)"), "the recovery path must be able to generate a new preview successfully");
assert(client.includes("templateUnavailable") && client.includes("会社の帳票管理者"), "unavailable forms must direct the user to select another form or contact the manager");

console.log("guarantee application recovery behavior: PASS (three locales, expired/stale retry path, form selection recovery, and confirmation clearing)");
