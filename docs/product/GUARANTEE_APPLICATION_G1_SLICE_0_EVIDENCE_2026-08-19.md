# TASK-037 / G1-SLICE-0：现有行为保护基线证据包

- 日期：2026-08-19（Asia/Tokyo）
- Git HEAD：`35f0cd6541c4ce0e3e838e21d9dd282855ead37e`
- 任务状态：`Done`（结构与静态基线已验收）
- 运行边界：`UNVERIFIED — Clerk active membership environment unavailable`
- 证据性质：只读仓库审计、现有静态检查、一次本地非生产服务探测
- 运行身份：未取得已登录的合法 Clerk Development 身份；未输出身份标识、Cookie、Token 或密钥
- 生产数据：未访问、未写入

## 结论先行

切片 0 已建立代码和路由层面的现状基线，但**没有取得当前可重复下载的生成 PDF 样本**。原因是：

1. 本地开发服务可以在一次提升权限探测后启动，但受保护预览路由返回 `404`，响应头明确为 `x-clerk-auth-status: signed-out`、`x-clerk-auth-reason: protect-rewrite, dev-browser-missing`；
2. 仓库内只有 PNG 表单资产和内存输出元数据，没有可复用的生成 PDF 文件；
3. 没有为了凑样本修复旧功能、补造数据、安装模板或触发下载写入。

因此五套平台蒙板均记录为“运行未验证：身份环境阻断”，而不是把代码中的 `active/verified` 误写成运行成功。请求在 Clerk 身份门被拦截，尚未进入蒙板、案件、租户安装、匹配或 PDF 渲染逻辑；HTTP 404 是认证保护结果，不是业务路由不存在或蒙板故障证据。本证据包不伪造历史生成文件。

## 1. 五套现有平台蒙板的真实状态

代码配置均位于 `src/lib/guarantee-application.ts:80-351`。配置中的 `outputStatus: active`、`qualityStatus: verified` 和 `allowDirectDownload: true` 是仓库静态事实，不是本次运行或法律授权结论。

| 平台蒙板 | 代码/版本事实 | 仓库资产事实 | 现有入口 | 内存输出元数据 | 本次运行状态 | 当前实际结论 |
|---|---|---|---|---|---|---|
| 全保连 `zenhoren_individual_v1` | `zenhoren:v1`；2 页；`overlay:zenhoren_v1_full_boxes_2026_06_08` | `zenhoren-v1.png`、`zenhoren-v1-hd.png` 存在；配置声明的 `１全保連.pdf` 不在仓库 | 通用 `/guarantee-applications/[templateId]/preview` 与对应下载 API | 未发现该模板的 `demoOutputs` 条目 | 身份门拦截，未进入蒙板逻辑 | **运行未验证：身份环境阻断** |
| 日本セーフティー `nihon_safety_individual_v1` | `nihon_safety:v1`；1 页；`overlay:nihon_safety_v1_calibrated` | `nihon-safety-v1.png`、`nihon-safety-v1-hd.png` 存在；配置声明的 `日本セーフティー(1).pdf` 不在仓库 | 同上 | `out_demo_kachidoki_nihon_pdf`、`out_demo_hiroo_nihon_pdf` 仅为内存元数据 | 身份门拦截，未进入蒙板逻辑 | **运行未验证：身份环境阻断** |
| Jリース `j_lease_individual_v1` | `j_lease:v1`；2 页；`overlay:j_lease_v1_calibrated` | `j-lease-v1.png`、`j-lease-v1-hd.png` 存在；配置声明的 `３Jリース.pdf` 不在仓库 | 同上 | 未发现该模板的 `demoOutputs` 条目 | 身份门拦截，未进入蒙板逻辑 | **运行未验证：身份环境阻断** |
| インシュア `insure_individual_v1` | `insure:v1`；1 页；`overlay:insure_v1_calibrated` | `insure-v1.png`、`insure-v1-hd.png` 存在；配置声明的 `４インシュア.pdf` 不在仓库 | 同上 | `out_demo_shinjuku_insure_pdf` 仅为内存元数据 | 身份门拦截，未进入蒙板逻辑 | **运行未验证：身份环境阻断** |
| ふれんず保証 `friends_guarantee_individual_v1` | `friends_guarantee:v1`；1 页；`overlay:friends_guarantee_v1_calibrated` | `friends-guarantee-v1.png` 存在；没有 HD 资产；配置声明的 `５ふれんず保証.pdf` 不在仓库 | 特殊 `/guarantee-applications/friends-guarantee/preview`、动态通用入口及对应下载 API | `out_demo_setagaya_friends_pdf` 仅为内存元数据 | 身份门拦截，未进入蒙板逻辑 | **运行未验证：身份环境阻断** |

公共资产目录中没有五份原始 PDF；这只记录仓库事实，不推导权利结论，也不改变当前生产行为。现有五套蒙板不在本切片删除、修复、重解释或商业上架。

### 运行取证记录

- 正常启动 `npm run dev -- --port 3002`：沙箱返回 `listen EPERM`。
- 对同一非生产启动命令进行一次提升权限探测：Next.js 报告 `http://localhost:3002` ready。
- 仅读取一次预览 URL：
  `/guarantee-applications/friends-guarantee/preview?caseId=case_fixture_friends_guarantee_pdf`
- 响应：HTTP `404`，`x-clerk-auth-status: signed-out`，`x-clerk-auth-reason: protect-rewrite, dev-browser-missing`，重写目标为 Clerk 保护路由。
- 未提交表单、未调用下载写入、未选择租户、未创建或修改测试数据。
- 服务已停止；未再次启动服务。

## 2. 固定回归样本与无样本阻塞

当前没有符合“来自现有可工作非生产流程、可重新打开或下载”的固定生成文件。具体证据：

- `src/lib/data.memory.ts` 的 `demoOutputs` 只保存输出记录字段（模板、案件、文档编号、快照元数据）；
- 仓库检索未发现对应生成 PDF 文件；
- `case_fixture_friends_guarantee_pdf` 和 `draft_fixture_friends_guarantee_pdf` 是内存测试夹具，不是已经验证过的下载文件；
- 旧截图可作为历史视觉参考，但不能冒充当前 HEAD 的生成文件。

准确阻塞：**缺少已登录的非生产 Clerk 会话，且仓库没有持久化生成文件，因此无法在本次只读窗口固定一份可重复 PDF 样本。** 这不是允许修复旧功能或补造数据的理由。恢复时由项目运行环境提供符合既定安全要求的内部测试身份和非生产 active workspace；不要求产品负责人提供 Cookie、Token、密码或新建账号。恢复后只需补一份样本，不重跑五套全量证据。

该无样本事实是 TASK-038 的合并/发布前硬门：技术设计和默认关闭、单非生产经营主体隔离的实现可以先进行；合并、预发布验收、部署和发布前必须固定至少一份旧流程基线输出。若届时仍无法取得，不能声称新流程没有破坏旧输出，也不能进入这些门禁。

## 3. 切片 1 将触及的入口、数据和调用关系

以下是当前调用关系盘点，不是切片 1 实现授权：

```text
案件/模板旧入口
  → /guarantee-applications/[templateId]/preview
  → friends-guarantee/preview/preview-page-content
  → requireTenantSession({ permission: "output.preview" })
  → getBrokerageCaseById(userId, tenantId, caseId)
  → getActiveTenantGuaranteeTemplateInstall(tenantId, templateId)
  → resolveGuaranteeTemplateLayout(templateId, tenantId)
  → getGuaranteeApplicationDraft(userId, tenantId, caseId, templateId)
  → 现有预览 Action（案件范围）或校准 Action（模板范围）

普通成员下载/预览
  → /api/guarantee-applications/[templateId]/download
  → requireTenantSession(output.preview / output.download_final)
  → tenant + user 范围案件读取
  → 租户安装与 layout fingerprint 校验
  → evaluateGuaranteeDownloadGate
  → renderFriendsGuaranteePdf
  → 仅正式下载时 addGeneratedOutput + addAuditLog
```

切片 1 预计复用的现有对象和入口：

- 静态平台蒙板配置：`src/lib/guarantee-application.ts`；
- 字段与坐标运行时：`src/lib/guarantee-template-layout-runtime.ts`、`src/lib/friends-guarantee-pdf.ts`；
- 案件、草稿、租户安装和生成输出读写：`src/lib/data.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`；
- 现有预览/校准 Action：`src/app/actions.ts:3811-4005`；
- 现有预览和下载入口：`src/app/guarantee-applications/**`、`src/app/api/guarantee-applications/**`；
- 旧模板入口：`/templates`、`/platform/templates`、`/output-center`。本切片 0 未修改这些入口。

当前输出快照包含 `tenant_id`、`actor_id`、案件、模板版本、输入数据、草稿值、字段映射和布局快照；尚未证明它包含客户空白表格指纹这一未来对象关系。该事实留给切片 1 技术设计验证，不在切片 0 修改数据库。

## 4. 已有隔离机制盘点

| 机制 | 当前证据 | 可用于的边界 | 本切片结论 |
|---|---|---|---|
| 租户会话与权限 | `src/lib/tenant-session.ts:150-177` 的 `requireTenantSession`；预览要求 `output.preview`，下载要求 `output.download_final` | 身份、active membership、租户和权限门禁 | 已存在，但本次没有合法登录身份可验证 |
| 案件租户/用户读取 | 预览和下载调用 `getBrokerageCaseById({ userId, tenantId, caseId })` | 防止跨用户/跨租户取得案件 | 代码路径存在，未做跨租户运行测试 |
| 租户蒙板安装隔离 | `getActiveTenantGuaranteeTemplateInstall({ tenantId, templateId })`，memory/PostgreSQL 均按 `tenant_id` 过滤 | 未安装时阻断；租户安装与公共布局分开 | 已存在；未安装会导致预览重定向或下载 `template_not_installed` |
| 版本与原件指纹 | `resolveGuaranteeTemplateLayout` 先取租户安装，再取发布版本，并比较 asset fingerprint；生产禁止 `legacy_development` fallback | 防止布局版本与部署资产错配 | 已存在；运行状态未验证 |
| 模板管理权限 | 模板校准保存由服务端选择 `template` scope，并要求 `template.edit_draft`、`template.publish`，作者模式另需平台 owner | 普通成员不能仅靠隐藏字段取得模板编辑权限 | 代码机制存在；本切片不改变 |
| 输出租户范围 | `generated_outputs` 查询和写入包含 `tenant_id`；下载写入同时使用当前租户 | 历史输出按租户隔离 | 代码契约存在；未做真实数据库回归 |
| 现有功能开关/隔离 | 对 `src/lib`、`src/app`、`next.config.ts`、`package.json` 的 flag/rollout/isolation 检索未发现适用于保证申请书新流程的 feature flag | 没有可直接关闭新流程的现有开关 | **切片 1 必须提供可关闭的隔离边界；切片 0 不创建开关** |

`legacy_development` 是仅非生产环境的布局 fallback，不是新流程 feature flag，也不能作为切片 1 的回退开关。

## 5. 切片 1 必须满足的回退要求

以下是进入切片 1 技术设计前的硬条件，不是本切片实现：

1. 新流程必须有服务端可关闭的隔离边界；关闭后旧入口、旧活动布局、历史输出和旧下载行为继续可达。
2. 新流程失败不能覆盖或删除五套现有平台蒙板、旧租户安装、旧输出记录或历史文件。
3. 公司自建蒙板必须以版本追加/发布方式保存；发布失败可以回到上一已发布版本，不能原地覆盖历史版本。
4. 输出必须记录实际使用的版本关系；后续蒙板修改不能重算或覆盖既有输出。
5. 预览、正式生成和管理员校准必须继续在服务端检查租户、身份和权限；不能由 URL、隐藏字段或客户端状态授予权限。
6. 任何新入口、数据对象或字段必须可在不破坏旧数据的前提下关闭、双读或回滚；若无法证明，切片 1 不得扩大实现。
7. 普通成员在本切片及第一版产品中始终不能移动坐标或进入蒙板编辑入口；错位只能停止并返回公司表格管理员流程。

## 6. 未修改生产行为的证明

- `git diff --name-only -- src` 为空；没有业务代码差异。
- 未执行数据库迁移、数据库写入、数据导入、模板安装、预览保存或正式下载。
- 服务仅以本地开发模式启动并已停止；未连接或操作生产环境。
- 未读取或输出 `.env.local` 内容；该文件仍被 `.gitignore` 忽略。
- 未关闭认证、未伪造租户上下文、未创建账号/租户/邀请、未切换账号。
- 未启动 Agent；活跃下级 Agent 为 `0`。
- 现有静态专项检查只读取仓库代码和 fixture；没有修改生产数据。

## 7. 检查结果

以下现有检查通过：

- `npm run test:guarantee-download-gate`
- `npm run test:guarantee-autofill-policy`
- `npm run test:guarantee-calibration`
- `npm run test:guarantee-template-publication`
- `npm run test:guarantee-template-reproducibility`
- `npm run test:guarantee-template-coverage`
- `npm run test:guarantee-print-fit`
- `git diff --check`

`npm run test:workflow-rules` 的原失败原因是切片任务卡文件名不符合仓库脚本要求；本次已将其重命名为 `TASK-037.md` 与 `TASK-038.md`，并在修正后重新执行检查。

未运行需要数据库连接或正式身份的检查（例如模板发布状态数据库检查）；它们不能在没有合法环境的情况下被写成通过。

## 8. 切片 0 结束判断与下一步

TASK-037 / G1-SLICE-0 已完成。运行证据保持 `UNVERIFIED — Clerk active membership environment unavailable`；无当前生成文件样本不阻断 TASK-038 技术设计或默认关闭、单非生产经营主体隔离的实现，但阻断合并、预发布验收、部署和发布前旧流程回归门。TASK-038 / G1-SLICE-1 现进入只读 `Technical Design`，仍不授权实现。后续技术设计必须说明：

- 五套蒙板的“运行未验证：身份环境阻断”状态；
- 由项目运行环境在受控预发布环境提供既有内部测试身份和 active workspace，以补一份可重复样本；
- 切片 1 的可关闭隔离边界如何在技术设计中证明。
