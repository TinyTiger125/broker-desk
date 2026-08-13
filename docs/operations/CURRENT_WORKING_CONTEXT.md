# Broker Desk 当前工作交接

> 本文件是唯一活动交接和进度入口，不重复产品、架构或历史正文。
> Last updated: 2026-08-13.

## 当前任务

- `PM-HANDOFF-001` 接管验证已通过；下一阶段项目经理已正式接管。
- `TASK-016 / MIG-004` 已完成：已建立术语唯一规范来源并迁移相关活动文档，不修改业务代码或实际界面文案。
- `TASK-015 / MIG-005` 已完成：已建立技术项目经理、实现 Agent、独立审查 Agent 三类最小 Playbook，并通过独立只读审查。
- 下一项为 `MIG-006` 候选，尚未授权实施。
- 不补建独立的 `PM-HANDOFF-001` 任务卡：`AGENTS.md` 要求实施任务使用指定任务卡，但没有要求只读接管单独建卡；本文件、`BACKLOG.md` 和 `TASK-014` 已提供足够交接证据。

## 已完成迁移证据

- `MIG-001 / TASK-012`：实现 `ee1850e`，审查收尾 `2cb8f45`。
- `MIG-002 / TASK-013`：实现 `3d4d345`，审查收尾 `baad0b9`。
- `MIG-003 / TASK-014`：实现 `5066a61`，审查收尾 `f81ef84`。
- 上述任务均为 `Done`，且没有业务代码、数据库、页面行为或用户可见文字修改。

## Git事实

- 正式仓库：`/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev`
- Branch: `governance/clean-baseline-20260812`
- 当前分支：`governance/clean-baseline-20260812`
- 当前 HEAD：以 `git rev-parse HEAD` 为准；MIG-004 收口提交号见 Git 历史。
- `main` HEAD：`fedb4c96e5f7b5e33caef977c5defd78ecf24ac9`
- `git merge-base main HEAD` 应等于 `main` HEAD；本轮核验结果相等。不得维护易漂移的“领先多少个提交”手工计数。
- `safety/wip-mixed-worktree-20260812`：`61bce515e4ad44a6c32da551377dbf427d8bd946`；仅作混合 WIP 隔离证据，保持不变。
- 本轮收口前工作区干净；收口后必须再次保持干净。

## 状态判断与风险

- `TASK-002` 保持 `In Review`：任务卡明确要求未决片段继续为 `Needs Review`，没有新业务证据可改为 Done。
- `TASK-010` 保持 `Blocked`：仍依赖 TASK-005、TASK-007、TASK-009，并缺少真实环境、权限、恢复和双设备证据。
- `.cursor`、旧 CLAUDE 内容、旧输出路由和两份日语术语字典冲突仍未处理；历史资料继续保留，但当前术语选择只以 `docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md` 为准。

## MIG-004结果

- 产品已确认五组用户可见术语；已按 `docs/tasks/TASK-016.md` 完成迁移，当前唯一规范来源为 `docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md`。
- 2026-07-14 字典、旧 handoff 和 CSV 只保留历史证据，不升格为当前权威；活动工作流和风格指南不得另立冲突词表。
- 未执行术语批量回填、代码修改或实际界面文案修改；独立只读审查已通过。
- `TASK-015 / MIG-005` 已完成：三类 Playbook 为 `docs/agents/TECHNICAL_PM.md`、`docs/agents/IMPLEMENTATION_AGENT.md`、`docs/agents/INDEPENDENT_REVIEW_AGENT.md`；包含建设性反对、证据分层、最小验证、停止条件、Agent 生命周期和交接要求。
- `PRODUCT_TERMINOLOGY_CANONICAL.md` 的 `docs/operations/` 目录归属问题只登记为后续 `MIG-006` 候选，本轮不移动、不重命名、不返工。

## 当前禁止事项

- 不修改业务代码、数据库、public、业务配置、页面行为、用户可见文字、`.cursor`、历史资料、`main` 或 safety/WIP。
- 不切换分支、合并、rebase、cherry-pick、reset；MIG-005 收口后不继续创建 Playbook 或下级 Agent，等待 MIG-006 明确批准。
- 后续实施必须先有明确任务卡、授权范围、验证和独立审查。

## Agent状态

- MIG-005 按顺序使用 1 个实现 Agent 和 1 个独立审查 Agent；实现 Agent 已退出，审查 Agent 经一次明确问题修复后复核 PASS 并退出；当前活跃子Agent：`0`。
