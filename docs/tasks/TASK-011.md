# TASK-011: 修复治理基线元数据与文档残留

- 状态: Done
- 优先级: P0
- 负责人: 主 Agent / 独立审查者
- 依赖关系: TASK-001

## 依赖关系

TASK-001。

## 任务名称

修复纯治理基线中残留的补丁文本，并让分支、架构基线和活动交接记录与实际仓库状态一致。

## 背景和用户结果

项目负责人能够从正式工作副本和治理分支恢复工作，不会把补丁残留误认为文档内容，也不会被过期的架构基线误导。

## 本次范围

- 从 AGENTS.md、PRODUCT.md、ARCHITECTURE.md 和 BACKLOG.md 移除末尾的补丁残留行。
- 将 ARCHITECTURE.md 的基线更新为当前本地 main 与治理分支共同指向的提交。
- 更新 BACKLOG.md 和 CURRENT_WORKING_CONTEXT.md 的任务记录。
- 保持其他仓库副本、安全分支、WIP 快照和 src/ 业务代码不变。

## 预计涉及的模块

AGENTS.md、PRODUCT.md、ARCHITECTURE.md、BACKLOG.md、
docs/operations/CURRENT_WORKING_CONTEXT.md、docs/tasks/TASK-011.md、
scripts/check-workflow-rules.mjs。

## 明确不做什么

- 不删除、移动或合并 broker-desk、broker-desk-clean 或任何历史恢复引用。
- 不实施 TASK-002 或任何业务任务。
- 不修改 src/、数据库迁移、运行时行为或产品契约。

## 风险和注意事项

检查器中的治理基线文本必须与权威文档同步，否则会把已修复的状态判定为失败。
本任务只修复治理证据，不证明浏览器、数据库、权限或业务运行时行为。

## 验收标准

1. 四个治理文档不再含有补丁残留。
2. ARCHITECTURE.md 指向提交 fedb4c96e5f7b5e33caef977c5defd78ecf24ac9。
3. 当前活动上下文、BACKLOG.md、任务卡和实际治理分支状态一致。
4. 本任务不包含 src/ 或业务行为变化。
5. 治理检查、差异检查、独立审查和最终 Git 状态检查全部通过。

## 验证命令

- `git status --short --branch --untracked-files=all`
- `git diff --check`
- `npm run test:workflow-rules`
- `git diff --name-only origin/main..HEAD`

## 当前状态

治理文件修复、治理验证和独立审查均已完成。
