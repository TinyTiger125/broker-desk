import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const originalResolve = Module._resolveFilename;

function resolveCandidate(value) {
  if (!value || (!value.startsWith("/") && !value.startsWith("."))) return undefined;
  const candidates = [value, `${value}.ts`, `${value}.tsx`, `${value}.mjs`, `${value}.js`];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? resolve(root, "src", request.slice(2)) : request;
  const relative = request.startsWith(".") && parent?.filename ? resolve(dirname(parent.filename), request) : mapped;
  return resolveCandidate(relative) ?? originalResolve.call(this, request, parent, ...rest);
};

function compileTypeScript(module, filename) {
  const result = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}

require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;

const { localizeCaseAssociationError } = require(resolve(root, "src/lib/case-associations.ts"));
const approvedJaMappings = [
  ["案件草稿格式不正确，请重新选择资料。", "案件草稿の形式が正しくありません。資料を選び直してください。"],
  ["案件资料草稿格式不正确，请重新操作。", "案件資料の下書き形式が正しくありません。もう一度お試しください。"],
  ["一个案件最多只能有一位主要申请人。", "1案件につき、主たる申込人は1名までです。"],
  ["人物至少需要一个案件角色。", "人物には案件内の役割を1つ以上指定してください。"],
  ["选择的人物不存在或当前用户无法使用。", "選択した人物が存在しないか、利用する権限がありません。"],
  ["选择的物件不存在或当前用户无法使用。", "選択した物件が存在しないか、利用する権限がありません。"],
  ["案件保存失败，请保留当前草稿后重试。", "案件を保存できませんでした。現在の草稿を残したまま、もう一度お試しください。"],
  ["案件が見つからないか、保存できませんでした。", "案件が見つからないか、保存できませんでした。"],
];
const approvedZhMappings = [
  ["案件草稿格式不正确，请重新选择资料。", "案件草稿格式不正确，请重新选择资料。"],
  ["案件资料草稿格式不正确，请重新操作。", "案件资料草稿格式不正确，请重新操作。"],
  ["一个案件最多只能有一位主要申请人。", "一个案件最多只能有一位主要申请人。"],
  ["人物至少需要一个案件角色。", "人物至少需要一个案件角色。"],
  ["选择的人物不存在或当前用户无法使用。", "选择的人物不存在或当前用户无法使用。"],
  ["选择的物件不存在或当前用户无法使用。", "选择的物件不存在或当前用户无法使用。"],
  ["案件保存失败，请保留当前草稿后重试。", "案件保存失败，请保留当前草稿后重试。"],
  ["案件が見つからないか、保存できませんでした。", "未找到案件，或案件无法保存。"],
];
const approvedKoMappings = [
  ["案件草稿格式不正确，请重新选择资料。", "안건 초안 형식이 올바르지 않습니다. 자료를 다시 선택해 주세요."],
  ["案件资料草稿格式不正确，请重新操作。", "안건 자료 초안 형식이 올바르지 않습니다. 다시 시도해 주세요."],
  ["一个案件最多只能有一位主要申请人。", "하나의 안건에는 주요 신청인을 한 명만 지정할 수 있습니다."],
  ["人物至少需要一个案件角色。", "관계자에게는 하나 이상의 안건 역할이 필요합니다."],
  ["选择的人物不存在或当前用户无法使用。", "선택한 관계자가 없거나 현재 사용자가 사용할 수 없습니다."],
  ["选择的物件不存在或当前用户无法使用。", "선택한 매물이 없거나 현재 사용자가 사용할 수 없습니다."],
  ["案件保存失败，请保留当前草稿后重试。", "안건을 저장하지 못했습니다. 현재 초안을 유지한 채 다시 시도해 주세요."],
  ["案件が見つからないか、保存できませんでした。", "안건을 찾을 수 없거나 저장하지 못했습니다."],
];
const fallback = {
  ja: "案件の処理中に問題が発生しました。入力内容を確認して、もう一度お試しください。",
  zh: "处理案件时发生问题，请确认输入内容后重试。",
  ko: "안건 처리 중 문제가 발생했습니다. 입력 내용을 확인한 후 다시 시도해 주세요.",
};
const unknownServerError = "RequestContextError: owner_write; postgres relation case_associations failed; server text: relation does not exist";

for (const [message, expectedJa] of approvedJaMappings) {
  assert.equal(localizeCaseAssociationError("ja", message, "caller fallback"), expectedJa, `ja approved mapping: ${message}`);
  assert(!/(格式|不正确|当前用户|重新|请)/u.test(expectedJa), `ja approved mapping contains Chinese syntax: ${message}`);
}

for (const [message, expectedZh] of approvedZhMappings) {
  assert.equal(localizeCaseAssociationError("zh", message, "caller fallback"), expectedZh, `zh approved mapping: ${message}`);
}

for (const [message, expectedKo] of approvedKoMappings) {
  assert.equal(localizeCaseAssociationError("ko", message, "caller fallback"), expectedKo, `ko approved mapping: ${message}`);
}

for (const locale of ["ja", "zh", "ko"]) {
  const result = localizeCaseAssociationError(locale, unknownServerError, "caller fallback");
  assert.equal(result, fallback[locale], `${locale} unknown error fallback`);
  assert(!result.includes(unknownServerError), `${locale} unknown server error is hidden`);
  assert(!result.includes("RequestContextError"), `${locale} internal error type is hidden`);
  assert(!result.includes("owner_write"), `${locale} internal error code is hidden`);
  assert(!result.includes("postgres"), `${locale} database detail is hidden`);
  assert(!result.includes("relation does not exist"), `${locale} arbitrary server text is hidden`);
}

assert.notEqual(fallback.ja, fallback.zh, "ja and zh fallbacks are isolated");
assert.notEqual(fallback.ja, fallback.ko, "ja and ko fallbacks are isolated");
assert.notEqual(fallback.zh, fallback.ko, "zh and ko fallbacks are isolated");
assert.equal(localizeCaseAssociationError("ja", undefined, "caller fallback"), "caller fallback", "empty message preserves caller fallback");

console.log("TASK-041 case association behavior: PASS");
