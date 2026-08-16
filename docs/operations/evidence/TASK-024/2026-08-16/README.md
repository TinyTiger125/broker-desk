# TASK-024 最终证据归档（2026-08-16）

本目录只保存可分享的脱敏副本和可持久审计的 QA 文本证据，不保存原始录屏、原始截图或完整测试案件身份信息。

## 证据边界

- 正式代码基线：`64c7e1e440a55f749e85dbba7f64f85755e55e9d`。
- 临时 QA 调用器：分支 `qa/task-024-server-action-20260816`，提交 `9985b4dafb90ecf2e7a93e56b79773126596c642`，仅存在于隔离 worktree，未合并、未推送、未部署。
- 测试案件：`case_bm4jsup9`，已核实为非生产测试数据；正常保存产生的历史记录仍保留，恢复不等于无痕恢复。
- `shareable/` 内的 PNG/JSON 已裁剪或脱敏，可用于任务审查。原始截图目前仅存在隔离 worktree，独立审查已完成后将随临时 worktree 清理删除；持久审计不依赖原始截图。正式 IME 原件另存于仓库之外的私有目录，不进入 Git。

## 临时 QA 调用器审计

- [`qa-caller.patch`](qa-caller.patch) 保存 `64c7e1e..9985b4d` 的完整差异。
- [`qa-commit-metadata.txt`](qa-commit-metadata.txt) 保存正式基线、临时提交、父提交、分支名、文件统计和哈希。
- [`server-action-runtime.log`](server-action-runtime.log) 是脱敏运行日志，只证明临时调用器调用了未修改的正式 `saveCaseWorkbenchAction`；它不属于产品代码，也不证明 QA 页面应进入正式构建。
- 三个文件 SHA-256：`qa-caller.patch` = `67f76bc964a485dadb17b4cbea201308e8cfff623c1592c1636d9ad585886009`；`qa-commit-metadata.txt` = `f76af394f10e9a476992f0d74595e84f0a2f064c12f434a736c076fc38677638`；`server-action-runtime.log` = `0051cb7f9b29e3b14bdcc26dcdbf13532974468f84d778e30063f5cd483fcb32`。
- 已检查完整 patch 和日志：不包含凭据值、认证请求头或真实客户资料；源代码中提到凭据的文字仅是 QA 页面安全提示。

## 三项门禁

- Chrome 响应式：768×900 与 390×844 的实际视口、无横向溢出、编辑器位于选中字段之后均有原始截图和状态记录。
- Server Action：同一正式 `saveCaseWorkbenchAction` 路径下，六位邮编被拒绝；不同七位值被写入并重新读取；原值通过同一路径恢复。六位与七位证据来自相互独立的状态快照和日志，不应描述为单次连续事务录像。
- Kotoeri IME：正式证据为仓库外私有目录中的 `10-ime-kotoeri-original.mov`，源文件 `录屏2026-08-16 01.56.18.mov`，时长约 35.911667 秒，SHA-256 为 `d40e4a78228f52c2a470cf0d31f4fc2c0fb39015371530cfed0ae9308cc1905d`。录屏证明组合态、候选确认、第一次 Enter 不提交、无保存请求及取消后原值仍在。

## 明确不采用的证据表述

- 768px 记录不包含有效的输入框级矩形测量；修正版已删除无数据支持的 `inputWithinViewport` 断言，仅依据截图、章节/编辑器矩形和无横向溢出作结论。
- IME 门禁不要求整页刷新；产品裁决的门槛是第一次 Enter 不提交，录屏已同时显示候选确认、编辑器仍开、无保存 URL 参数、Network 无案件保存 POST，取消后原姓名未改变。
- `录屏2026-08-16 01.53.30.mov` 不是正式 IME＋Network 证据，不在本归档中引用。

## 隐私

原始 IME 录屏可能显示合成测试姓名/地址，只限本机审查，私有目录权限为仅所有者可读写；原始截图将在临时 worktree 清理时删除。本目录不包含凭据值、认证请求头或真实客户资料。正式任务附件只引用本目录的脱敏副本和审计文本。
