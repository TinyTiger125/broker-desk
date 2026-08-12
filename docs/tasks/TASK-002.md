# TASK-002: 按 diff 片段登记混合 WIP

- 状态: In Review
- 优先级: P0
- 负责人: 主 Agent / 独立审查者
- 依赖关系: TASK-001

## 任务名称

把原始混合修改按 diff hunk 或具体行为登记到候选任务，不把一个文件强行整体归属到一个任务。

## 背景和用户结果

实现者和审查者能够区分输入合并、模板边界、模板发布、实体返回、视觉问题、
生命周期和检查脚本的证据边界。无法证明的片段继续保持 Needs Review。

## 本次范围

- 以 WIP 快照 6f199375467bbfedd77bc90d80a53c423d4c9969 和安全分支
  61bce515e4ad44a6c32da551377dbf427d8bd946 为原始证据。
- 登记文件路径、diff hunk 或具体行为、候选任务、证据、未决问题和当前判断。
- 将检查脚本拆成它实际验证的任务，不按脚本文件整体归属。
- 保留 TASK-002 为 In Review。

## 明确不做什么

- 不修改或提交业务代码。
- 不实施任何候选业务任务。
- 不把 Needs Review 改写为 Done、Ready 或业务验收结论。
- 不凭字符串或文件名自动判断业务 diff 归属。

## 依赖关系

TASK-001。

## 验收标准

1. 每个重点 diff 片段都有六项登记字段：文件路径、hunk/行为、候选任务、证据、未决问题、当前判断。
2. src/app/actions.ts、模板页面、案件页面和检查脚本均按行为拆分。
3. 一个文件可以出现多个候选任务。
4. 无法证明的片段保持 Needs Review。
5. 本轮治理分支不包含 src/业务代码变化。

## 预计涉及的模块

Git diff、BACKLOG.md、docs/tasks/、治理检查脚本和当前上下文。

## 风险和注意事项

静态检查通过不等于业务行为正确。尤其不能把模板保存路径、发布版本、
生命周期 returnTo 或视觉修复混为同一项完成证据。

## 验证命令

git status --short --untracked-files=all
git diff --name-status main..safety/wip-mixed-worktree-20260812
git show --name-status --format=fuller 6f199375467bbfedd77bc90d80a53c423d4c9969
git diff --check
npm run test:workflow-rules

## 当前状态

In Review。以下登记是候选归属，不是业务验收。原始证据来自安全分支的最终快照；
本治理分支不带入其中的 src/业务修改。

## 片段级归属登记

| 文件路径 | diff hunk 或具体行为 | 候选任务 | 证据 | 未决问题 | 当前判断 |
|---|---|---|---|---|---|
| src/app/actions.ts | setRecordLifecycleAction：增加 /cases 重新验证；safeReturnTo 后附加 record_archived 或 record_restored flash | TASK-006 | 61bce515 相对 main 的 actions.ts 约第 374 行 hunk | 是否应由统一实体返回任务定义 returnTo 与 flash 的共同契约；不属于 TASK-006A 的固定返回地址 | Needs Review |
| src/app/actions.ts | saveGuaranteeApplicationDraftAction / preview save scope 周边：保存草稿路径与模板校准保存路径共用动作文件 | TASK-005, TASK-002 | 61bce515 actions.ts 约第 3400 行上下文 | 需要拆清案件草稿持久化与官方模板保存是否改变 active release | Needs Review |
| src/app/actions.ts | stableSerializeTemplateLayout、hasTemplateLayoutSnapshotChanged：比较 baseline 与 next snapshot | TASK-005 | 61bce515 actions.ts 新增的模板快照 hunk | 比较是否覆盖所有 layout、删除字段和自定义字段；仍需行为测试 | Needs Review |
| src/app/actions.ts | layoutSaveScope=template：仅在 layoutChanged 时调用 publishGuaranteeTemplateLayoutVersion | TASK-005 | 61bce515 actions.ts 约第 3590 行 hunk | 保存是否仍然等同发布；重复提交、失败回滚和权限证据缺失 | Needs Review |
| src/app/actions.ts | 模板发布后的 revalidatePath、template_layout_saved / unchanged redirect | TASK-005 | 61bce515 actions.ts 模板分支尾部 hunk | 路径重新验证是否覆盖前台库、后台编辑页和预览页；flash 是否代表真实持久化 | Needs Review |
| src/app/templates/page.tsx | 平台管理员可见官方模板编辑入口；官方模板显示更新时间与安装状态 | TASK-004, TASK-005 | 61bce515 templates/page.tsx 文案、session、链接和时间戳 hunk | 入口可见性是否由服务端角色保护；更新时间是否是已发布版本时间 | Needs Review |
| src/app/platform/templates/page.tsx | 旧官方模板总览重定向到 /templates，保留单模板编辑入口的边界 | TASK-004 | 61bce515 platform/templates/page.tsx 替换为 redirect hunk | 重定向后的普通用户权限、管理员单模板入口和旧链接兼容性需浏览器验证 | Needs Review |
| src/app/platform/accounts/page.tsx | 官方模板入口从 /platform/templates 改为 /templates | TASK-004 | 61bce515 platform/accounts/page.tsx link hunk | 是否会让普通用户接触平台账户入口；需角色场景验证 | Needs Review |
| src/app/guarantee-applications/friends-guarantee/preview/preview-page-content.tsx | 模板校准返回入口与 breadcrumb 指向 /templates；保存结果增加 unchanged flash | TASK-004, TASK-005 | 61bce515 preview-page-content.tsx 约第 315、420、495 行 hunk | 入口、保存、发布和普通案件预览是否被同一页面状态混淆 | Needs Review |
| src/components/official-template-save-button.tsx | 新增 useFormStatus pending、禁用重复提交、保存中反馈 | TASK-005 | 61bce515 新增文件 | pending 只证明客户端状态，不证明 draft/publish 隔离和服务端幂等 | Needs Review |
| src/components/friends-guarantee-calibration-preview.tsx | 校准输入增加透明文字样式，避免原生 input 文本与单元格 overlay 重复 | TASK-007 | 61bce515 calibration preview 约第 2885 行 hunk | 需要源 PDF、overlay、预览状态的逐层视觉证据，不能直接视为修复完成 | Needs Review |
| src/app/cases/[id]/page.tsx | 新增页面内返回链接，但候选路径为 /organize-center | TASK-006A | 61bce515 cases/[id]/page.tsx 约第 905 行 hunk | 产品决定的候选标准是 /organize-center?type=case；现有片段未满足，不能进入 Ready | Needs Review |
| src/app/cases/[id]/page.tsx | lifecycle ArchiveRecordButton 的 returnTo 从带 type 参数改为 /organize-center | TASK-006 | 61bce515 cases/[id]/page.tsx 同一 hunk | 生命周期 returnTo 明确属于 broader TASK-006，排除在 TASK-006A 范围外 | Needs Review |
| src/app/parties/[id]/edit/page.tsx | 主体编辑页返回链接移除 type 与 focus 参数 | TASK-006 | 61bce515 parties/[id]/edit/page.tsx 约第 146 行 hunk | 是否应保留列表上下文；不属于 TASK-006A | Needs Review |
| src/app/properties/[id]/edit/page.tsx | 物件编辑页返回链接移除 type 与 focus 参数 | TASK-006 | 61bce515 properties/[id]/edit/page.tsx 约第 139 行 hunk | 是否应保留列表上下文；不属于 TASK-006A | Needs Review |
| src/components/input-extraction-review.tsx | 合并候选选择后要求 mergeConfirm；新增确认并保存区块与结果动作入口 | TASK-003 | 61bce515 input-extraction-review.tsx 约第 350 至 500 行 hunk | 需要成功、取消、冲突、失败、刷新恢复和目标权限证据 | Needs Review |
| src/lib/platform-session.ts | 新增 getPlatformOwnerSession 供可选 UI 控件读取平台角色 | TASK-004 | 61bce515 platform-session.ts 新增函数 | 可选 UI 判断不能替代受保护路由和 mutation 的 requirePlatformOwnerSession | Needs Review |
| scripts/check-guarantee-template-publication.mjs | 模板发布脚本同时检查发布版本、模板库入口、管理员入口、保存 pending、快照比较和视觉 input 泄漏 | TASK-004, TASK-005, TASK-007 | 61bce515 脚本新增读取和断言 | 必须拆成任务级结果；脚本通过不证明真实发布或视觉验收 | Needs Review |
| scripts/check-public-beta-readiness.mjs | 公测门禁增加 record lifecycle migration 文件存在性检查 | TASK-008, TASK-010 | 61bce515 migration 列表 hunk | 仅检查文件存在；不证明迁移、回滚、权限和完整公测 | Needs Review |
| scripts/check-tenant-session.mjs | 租户会话脚本增加平台角色 helper、模板库和旧路由入口断言 | TASK-004 | 61bce515 脚本新增断言 | 需区分会话基础回归与模板 IA/角色行为；不能整体归入脚本原任务 | Needs Review |
| scripts/check-workflow-rules.mjs | 原治理检查器检查权威文件、任务卡格式和活动上下文 | TASK-001, TASK-002 | 61bce515 脚本最终快照 | 本轮只增强确定性的状态、引用和唯一路径检查；不自动判断业务归属 | Assigned |
| docs/engineering/GUARANTEE_TEMPLATE_PUBLICATION.md | 官方模板保存、发布、租户安装和跨设备输出契约 | TASK-005 | 61bce515 文档最终快照 | 契约与 main 当前实现是否一致；不能把文档描述当实现证据 | Needs Review |
| docs/operations/P0_P1_REMEDIATION_PLAN.md | 历史修复计划与优先级描述 | TASK-002 | 6f19937 WIP 快照新增文件 | 计划是否仍有效；本治理基线不将其作为活动队列 | Needs Review |
| DESIGN.md | 设计契约候选，含页面、角色、布局、语言和视觉 QA 原则 | TASK-002 | 6f19937/61bce515 最终快照 | 后续拆入 PRODUCT 或 docs/product/ 的边界未审查；本轮不拆分 | Needs Review |

## 治理和历史路径处理

以下原始路径属于治理或历史材料，不是业务实现证据。它们需要降级声明或
权威关系修正，但不应被当作当前进度来源：

- AGENTS.md
- PRODUCT.md
- ARCHITECTURE.md
- BACKLOG.md
- CLAUDE.md
- CLAUDE 3.md
- docs/PROJECT_MEMORY.md
- docs/README.md
- docs/agents/issue-tracker.md
- docs/operations/CURRENT_WORKING_CONTEXT.md
- docs/operations/DEVELOPMENT_HANDOFF_2026_08_01_CONVERSATION_COMPACT.md
- docs/operations/PM_CONTROL.md
- docs/tasks/TASK-001.md through docs/tasks/TASK-010.md

本分支只保留经过重新验证的治理版本；不带入上述原始快照中的 src/ 变化、
业务检查脚本变化或业务计划变化。
