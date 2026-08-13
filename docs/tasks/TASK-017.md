# TASK-017：MIG-006 清理 Cursor 活动规则并建立薄适配入口

- 状态: Done
- 优先级: P0
- 负责人: 项目经理 / 实现Agent / 独立审查Agent
- 依赖关系: TASK-015 / MIG-005 已完成

## 任务名称

清理 `.cursor` 中会误导 Agent 的活动规则，使 Cursor 只通过一个带明确 Cursor 元数据的薄适配入口进入当前治理体系。

## 背景和用户结果

当前 `.cursor` 仍把 `CLAUDE.md` 放在最高优先级，规则正文重复产品、范围、领域和编码工作流，部分 Skill 继续引用旧入口或已废弃的 `.cursor/rules/*.mdc`。这会让 Cursor 在进入当前 `AGENTS.md`、活动交接、任务卡和角色 Playbook 之前，先读取过时或重复的权威。

用户结果：恢复业务开发前，Cursor 的启动路由必须明确、单一、可扫描；旧活动规则不能覆盖当前治理体系；仍有调用价值的 Skill 可以保留，但不能在 `.cursor` 内继续复制当前权威或产品事实。

## 本次范围

- 重写 `.cursor/README.md` 为非权威说明，只指向薄适配入口和按需 Skill 机制，不定义旧优先级。
- 新建 `.cursor/rules/00-governance-entry.mdc`，带明确 `description` 和 `alwaysApply: true` 元数据。
- 删除以下 7 个旧活动规则正文：
  - `.cursor/rules/00-product-positioning.mdc`
  - `.cursor/rules/01-scope-boundaries.mdc`
  - `.cursor/rules/02-domain-model.mdc`
  - `.cursor/rules/03-import-center.mdc`
  - `.cursor/rules/04-output-center.mdc`
  - `.cursor/rules/07-coding-workflow.mdc`
  - `.cursor/rules/08-ui-ux-constraints.mdc`
- 将以下 6 个高风险 Skill 改为薄指针，清除其旧权威、重复规则正文或失效规则引用：
  - `.cursor/skills/feature-planner/SKILL.md`
  - `.cursor/skills/import-mapper/SKILL.md`
  - `.cursor/skills/domain-model-guardian/SKILL.md`
  - `.cursor/skills/output-template-builder/SKILL.md`
  - `.cursor/skills/migration-safe-refactor/SKILL.md`
  - `.cursor/skills/service-request-traceability/SKILL.md`
- 保留其余 6 个低风险、按需调用的局部 Skill 原文，不扩大为完整 Cursor 技能重构：`import-center-ui`、`output-preview-ui`、`template-editor-ui`、`workspace-admin-ui`、`entity-detail-pattern`、`responsive-business-layout`。
- 在 `scripts/check-workflow-rules.mjs` 增加与本任务直接相关的 Cursor 入口、旧声明和失效规则引用检查。
- 更新本卡、`BACKLOG.md` 和 `docs/operations/CURRENT_WORKING_CONTEXT.md` 的状态、证据和开发恢复检查表。

## 依赖关系

TASK-015 / MIG-005 已完成；三类角色 Playbook 已可供薄适配入口按角色路由。

## 明确不做什么

- 不修改业务代码、数据库、用户界面、产品范围、架构、运行配置、`AGENTS.md` 或 `CLAUDE.md`。
- 不迁移 `PRODUCT_TERMINOLOGY_CANONICAL.md` 的目录，不处理 MIG-006 以外的术语问题。
- 不清理全部历史文档、普通内容重复或格式问题。
- 不新增 MIG-007，不做完整 Cursor Skill 重构，不把保留 Skill 全部改写成新体系。
- 不在真实 Cursor 环境不可用时伪称自动加载行为已验证。

## 验收标准

1. `.cursor` 内不再存在活动的 `CLAUDE.md wins`、`CLAUDE.md` 最高权威或旧权威顺序声明。
2. `.cursor/rules/00-governance-entry.mdc` 具有明确 Cursor 元数据，并且只路由到：`AGENTS.md`、`docs/operations/CURRENT_WORKING_CONTEXT.md`、当前任务卡 `docs/tasks/TASK-017.md`、以及按角色匹配的 `TECHNICAL_PM.md`、`IMPLEMENTATION_AGENT.md`、`INDEPENDENT_REVIEW_AGENT.md`。
3. 7 个旧活动规则文件不再存在；`.cursor` 内没有继续引用这些失效规则的活动入口。
4. 6 个高风险 Skill 改为薄指针，只指向当前治理入口/任务卡/角色 Playbook，不在 `.cursor` 内重复维护产品事实、旧工作流或永久规则。
5. 6 个低风险按需 Skill 保持未改，证明本任务没有扩大为完整 Skill 重构。
6. `scripts/check-workflow-rules.mjs` 能检查薄入口、Cursor 元数据、旧声明、旧规则残留和高风险 Skill 失效引用。
7. 引用扫描、治理检查和 `git diff --check` 通过；禁止业务路径无差异。
8. 真实 Cursor 加载行为不能在本地命令中证明，必须在任务卡、当前交接和最终汇报中明确记录为“需要人工验证”，不得写成通过。
9. 实现 Agent 先完成并退出，再启动一个独立只读审查 Agent；所有 Agent 完成后退出。
10. 更新 BACKLOG 和当前交接，形成开发恢复检查表；工作区最终干净并提交一个最小治理提交。

## 预计涉及的模块

- `.cursor/README.md`
- `.cursor/rules/00-governance-entry.mdc`
- `.cursor/rules/00-product-positioning.mdc`
- `.cursor/rules/01-scope-boundaries.mdc`
- `.cursor/rules/02-domain-model.mdc`
- `.cursor/rules/03-import-center.mdc`
- `.cursor/rules/04-output-center.mdc`
- `.cursor/rules/07-coding-workflow.mdc`
- `.cursor/rules/08-ui-ux-constraints.mdc`
- 上述 6 个高风险 `.cursor/skills/*/SKILL.md`
- `scripts/check-workflow-rules.mjs`
- `docs/tasks/TASK-017.md`
- `BACKLOG.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`

除上述文件外，不得修改其他文件。

## 风险和注意事项

- 删除旧活动规则后，任何失效的 Skill 引用都必须被清除或改成薄指针；不能留下“文件不存在但仍要求读取”的启动路径。
- “薄指针”只负责路由，不复制产品事实、架构事实、任务状态或永久治理规则。
- 保留的低风险 Skill 不是新的权威来源；它们只在任务卡授权后按需调用。
- Cursor 的真实规则加载顺序和 UI 行为无法由本地脚本证明，必须保留人工验证项。

## 验证命令

- `git status --short --branch --untracked-files=all`
- `git diff --check`
- `npm run test:workflow-rules`
- `.cursor` 内旧权威声明、旧规则路径和高风险 Skill 引用扫描。
- 薄入口元数据、四类路由目标和保留 Skill 未修改检查。
- `src/`、数据库迁移、public、业务配置、产品/架构文件、`AGENTS.md`、`CLAUDE.md`、历史资料和 MIG-007 无差异检查。
- 真实 Cursor 加载行为：需要人工验证，不自动宣称通过。

## 独立审查条件

- 实现 Agent 完成并退出后，最多创建一个只读独立审查 Agent；不得创建下级 Agent。
- 审查必须确认旧 `CLAUDE.md wins`/权威顺序已清除、薄入口元数据和四类路由正确、旧规则和失效引用不存在、高风险 Skill 已降级为指针、低风险 Skill 未被无谓改写、治理检查和业务路径边界通过。
- 审查 Agent 不得修改、移动、删除或提交文件；完成或阻塞后立即退出。
- 若为 `NEEDS_CHANGES`，项目经理只修复 MIG-006 范围内明确问题，并让同一审查 Agent 重新只读复核；不得创建第三个 Agent。

## 完成证据

- `.cursor` 只有一个活动治理入口；旧活动规则和 `CLAUDE.md wins` 声明已清除。
- 高风险 Skill 已成为薄指针；低风险 Skill 未被完整重构。
- 引用扫描、Cursor 专项治理检查、现有 workflow rules、差异检查通过。
- 业务文件和排除范围无差异；工作区干净；最小治理提交已记录。
- Cursor 真实加载行为明确标记为“需要人工验证”，没有伪称自动验证通过。
- 开发恢复检查表已提交给产品负责人；下一步只等待选择一个小型真实业务任务进行完整试运行。
- 实现 Agent 已完成并退出；独立审查首次指出两处状态记录滞后，项目经理只修复该 MIG-006 范围内问题；同一审查 Agent 复核后判定 `PASS` 并退出。
- `git diff --check`、`npm run test:workflow-rules`、Cursor 引用扫描和禁止路径检查均通过；MIG-006 收口提交号见 Git 历史。

## 当前状态

Done。MIG-006 已完成：唯一薄适配入口、旧活动规则清理、高风险 Skill 指针、治理检查、范围验证和独立只读审查均已完成。真实 Cursor 加载顺序/UI 行为仍是“需要人工验证”，未被伪称为自动通过。
