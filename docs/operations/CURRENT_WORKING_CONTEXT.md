# Broker Desk 当前工作交接

> 本文件是唯一活动交接和进度入口，不重复产品、架构或历史正文。
> Last updated: 2026-08-13.

## 当前任务

- `PM-HANDOFF-001` 接管验证已通过；下一阶段项目经理已正式接管。
- `TASK-016 / MIG-004` 已完成：已建立术语唯一规范来源并迁移相关活动文档，不修改业务代码或实际界面文案。
- `TASK-015 / MIG-005` 已完成：已建立技术项目经理、实现 Agent、独立审查 Agent 三类最小 Playbook，并通过独立只读审查。
- `TASK-017 / MIG-006` 已完成：已清理 `.cursor` 活动规则、建立薄适配入口并处理高风险 Skill 指针。
- `TASK-018 / MIG-007` 已建立并进入 In Progress：阶段一、二只读盘点与产品恢复矩阵已完成；当前等待产品负责人批准第一集成边界，尚未实施业务代码恢复。
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
- MIG-007 只读盘点事实：开发模式可启动并到达 `/sign-in`、数据健康入口和受保护路由重定向；`npm start` 生产模式因认证/限流就绪门禁返回 503。模板发布状态检查在连接开发数据库后仍有两个模板未达修正版 active version 要求。
- WIP 产品去向：TASK-003 资料确认/合并和 TASK-004 前台模板使用是推荐第一集成边界；TASK-005 官方模板 draft/publish、TASK-006 返回路径、TASK-007 视觉诊断、TASK-008 生命周期继续候选/隔离。矩阵见 `docs/operations/MIG-007_PRODUCT_RECOVERY_MATRIX_2026-08-13.md`。

## 状态判断与风险

- `TASK-002` 保持 `In Review`：任务卡明确要求未决片段继续为 `Needs Review`，没有新业务证据可改为 Done。
- `TASK-010` 保持 `Blocked`：仍依赖 TASK-005、TASK-007、TASK-009，并缺少真实环境、权限、恢复和双设备证据。
- `.cursor` 的旧活动规则和旧权威顺序已由 TASK-017 清理；旧 CLAUDE 内容、旧输出路由和两份日语术语字典仍按既有边界保留或另行处理，当前术语选择只以 `docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md` 为准。

## MIG-004结果

- 产品已确认五组用户可见术语；已按 `docs/tasks/TASK-016.md` 完成迁移，当前唯一规范来源为 `docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md`。
- 2026-07-14 字典、旧 handoff 和 CSV 只保留历史证据，不升格为当前权威；活动工作流和风格指南不得另立冲突词表。
- 未执行术语批量回填、代码修改或实际界面文案修改；独立只读审查已通过。
- `TASK-015 / MIG-005` 已完成：三类 Playbook 为 `docs/agents/TECHNICAL_PM.md`、`docs/agents/IMPLEMENTATION_AGENT.md`、`docs/agents/INDEPENDENT_REVIEW_AGENT.md`；包含建设性反对、证据分层、最小验证、停止条件、Agent 生命周期和交接要求。
- `PRODUCT_TERMINOLOGY_CANONICAL.md` 的 `docs/operations/` 目录归属问题已登记在 `TASK-017` 的明确排除项中，本轮不移动、不重命名、不返工。

## MIG-006结果

- `.cursor` 现在只通过一个带 Cursor 元数据的薄入口路由到 `AGENTS.md`、当前上下文、`TASK-017` 和按角色匹配的三类 Playbook。
- 已处理旧 `CLAUDE.md wins`/权威顺序、重复规则正文、失效规则引用和高风险 Skill；低风险按需 Skill 未做完整重构。
- `PRODUCT_TERMINOLOGY_CANONICAL.md` 的目录归属本轮未迁移；MIG-007 已建立任务卡但尚未实施业务代码恢复。
- 真实 Cursor 加载行为无法由本地检查证明，已明确记录为“需要人工验证”，未伪称通过。

## 开发恢复检查表

- 治理入口：静态检查通过；`.cursor/rules/00-governance-entry.mdc` 是唯一活动规则入口。
- 权威路由：入口指向 `AGENTS.md`、当前上下文、TASK-017 和三类角色 Playbook；旧 CLAUDE/wins/权威顺序已清除。
- Skill 风险：6 个高风险 Skill 已降为薄指针，6 个低风险 Skill 保持未修改。
- 范围安全：本阶段未产生业务代码、数据库、界面、产品/架构文件、历史资料或术语目录差异；新增内容仅为 TASK-018、恢复矩阵和交接状态记录。
- 验证：`git diff --check`、`npm run test:workflow-rules`、引用扫描和独立审查均通过。
- 未验证项：真实 Cursor 加载顺序/UI 行为需要人工验证。
- Git：MIG-006 收口提交号见 Git 历史；最终工作区收口后保持干净。

## 当前禁止事项

- 产品批准前不修改或合并业务代码、数据库、public、业务配置、页面行为、用户可见文字、历史资料、`main` 或 safety/WIP；不切换分支、合并、rebase、cherry-pick、reset。
- 不把 WIP 整体合入，不单独提取会破坏完整用户流程的 hunk；不把生产 503、外部数据库失败或真实隧道行为伪称为通过。
- 后续实施必须先有产品批准、独立恢复分支或明确回退点、验证和独立审查；MIG-007 完成后停止新增治理任务。

## Agent状态

- MIG-005 按顺序使用 1 个实现 Agent 和 1 个独立审查 Agent，均已退出；MIG-006 当前活跃子Agent：`0`，按本卡顺序调度。
