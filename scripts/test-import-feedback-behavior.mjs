import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = readFileSync(resolve(root, "src/lib/import-feedback.ts"), "utf8");
const compiled = typescript.transpileModule(source.replace('import type { Locale } from "@/lib/locale";\n', ""), {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
Function("module", "exports", compiled)(module, module.exports);
const { getImportJobFeedbackMessage, getObjectImportTargetFeedbackMessage } = module.exports;

assert.match(getImportJobFeedbackMessage("zh", "queued"), /等待读取/);
assert.match(getImportJobFeedbackMessage("zh", "processing"), /正在读取/);
assert.match(getImportJobFeedbackMessage("zh", "completed"), /已处理.*读取结果/);
assert.match(getImportJobFeedbackMessage("zh", "mapped"), /已处理.*读取结果/);
assert.match(getImportJobFeedbackMessage("zh", "failed"), /读取失败/);
assert.match(getImportJobFeedbackMessage("zh"), /确认读取状态/);
assert.doesNotMatch(getImportJobFeedbackMessage("zh", "completed"), /正在开始读取/);
assert.doesNotMatch(getImportJobFeedbackMessage("zh"), /正在开始读取/);

assert.match(getObjectImportTargetFeedbackMessage("zh", "queued", 0), /等待读取/);
assert.match(getObjectImportTargetFeedbackMessage("zh", "processing", 0), /正在读取/);
assert.match(getObjectImportTargetFeedbackMessage("zh", "needs_review", 1), /已读取 1 项对象候选/);
assert.match(getObjectImportTargetFeedbackMessage("zh", "completed", 1), /已处理.*读取结果/);
assert.match(getObjectImportTargetFeedbackMessage("zh", "completed", 1), /本次上传未更改主资料/);
assert.match(getObjectImportTargetFeedbackMessage("zh", "failed", 0), /读取失败/);
assert.match(getObjectImportTargetFeedbackMessage("zh", "conflict", 0), /冲突/);
assert.doesNotMatch(getObjectImportTargetFeedbackMessage("zh", "completed", 1), /正在读取/);

console.log("import feedback behavior: PASS");
