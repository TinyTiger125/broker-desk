# TASK-001: 建立纯治理基线

- 状态: Done
- 优先级: P0
- 负责人: 主 Agent / 产品负责人
- 依赖关系: 无

## 任务名称

从 main 建立不带业务 WIP 的治理分支，并建立唯一的任务、产品、架构和活动交接入口。

## 背景和用户结果

新任务可以从 committed main、BACKLOG.md、任务卡和短交接上下文恢复，不会把安全分支中的混合业务修改误认为已实现能力。

## 本次范围

- 建立治理分支。
- 建立或整理治理权威文件和任务卡目录。
- 增加确定性的治理一致性检查。
- 保留安全分支和 WIP 快照作为恢复入口。

## 明确不做什么

- 不修改 src/ 或任何业务代码。
- 不实施 TASK-003、TASK-004、TASK-005、TASK-006、TASK-006A 或其他业务任务。
- 不删除历史文档，不拆分 DESIGN.md。

## 依赖关系

无。

## 验收标准

1. 分支直接基于 main@11fe7fc。
2. 治理提交不包含 src/ 或业务行为变更。
3. BACKLOG.md、任务卡状态和当前上下文一致。
4. 只有一个活动交接路径。
5. workflow rules 检查通过。

## 预计涉及的模块

AGENTS.md、PRODUCT.md、ARCHITECTURE.md、BACKLOG.md、docs/README.md、
docs/tasks/、docs/operations/CURRENT_WORKING_CONTEXT.md、
scripts/check-workflow-rules.mjs。

## 风险和注意事项

安全分支和 WIP 快照包含混合业务修改，不能整体合并或 cherry-pick。

## 验证命令

git diff --check
npm run test:workflow-rules
git diff --stat

## 当前状态

治理基线已建立；业务候选仍按各自任务卡状态等待审查。
