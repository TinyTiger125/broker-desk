# Broker Desk 当前工作交接

> 本文件是唯一活动交接和进度入口，不重复产品、架构或历史正文。
> Last updated: 2026-08-13.

## 当前任务

- `PM-HANDOFF-001` 接管验证已通过；下一阶段项目经理已正式接管。
- `TASK-016 / MIG-004` 已完成：已建立术语唯一规范来源并迁移相关活动文档，不修改业务代码或实际界面文案。
- `TASK-015 / MIG-005` 已完成：已建立技术项目经理、实现 Agent、独立审查 Agent 三类最小 Playbook，并通过独立只读审查。
- `TASK-017 / MIG-006` 已完成：已清理 `.cursor` 活动规则、建立薄适配入口并处理高风险 Skill 指针。
- `TASK-018 / MIG-007` 已进入实施：产品负责人批准 A→独立审查→B→独立审查；A 和 B 的实现审查、本地浏览器/数据行为门禁及从 A 案件到申请书下载的端到端验收已通过，隧道未开放。
- 不补建独立的 `PM-HANDOFF-001` 任务卡：`AGENTS.md` 要求实施任务使用指定任务卡，但没有要求只读接管单独建卡；本文件、`BACKLOG.md` 和 `TASK-014` 已提供足够交接证据。

## 已完成迁移证据

- `MIG-001 / TASK-012`：实现 `ee1850e`，审查收尾 `2cb8f45`。
- `MIG-002 / TASK-013`：实现 `3d4d345`，审查收尾 `baad0b9`。
- `MIG-003 / TASK-014`：实现 `5066a61`，审查收尾 `f81ef84`。
- 上述任务均为 `Done`，且没有业务代码、数据库、页面行为或用户可见文字修改。

## Git事实

- 正式仓库：`/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev`
- Branch: `recovery/mig-007-checkpoint-a`
- 当前分支：`recovery/mig-007-checkpoint-a`
- 当前 HEAD：以 `git rev-parse HEAD` 为准；MIG-004 收口提交号见 Git 历史。
- `main` HEAD：`fedb4c96e5f7b5e33caef977c5defd78ecf24ac9`
- `git merge-base main HEAD` 应等于 `main` HEAD；本轮核验结果相等。不得维护易漂移的“领先多少个提交”手工计数。
- `safety/wip-mixed-worktree-20260812`：`61bce515e4ad44a6c32da551377dbf427d8bd946`；仅作混合 WIP 隔离证据，保持不变。
- A/B 收口提交后工作区必须再次保持干净；运行 Next 开发服务生成的规则块不得保留在 `AGENTS.md`。
- MIG-007 当前事实：显式设置非生产 demo 身份和 `DATA_DRIVER=memory` 后，开发服务可监听，公开 `/api/health/data`、受保护 `/import-center`、`/organize-center` 和设置页均可由浏览器访问。A 已验证资料确认/修正/不采用、追加到既有案件、新建案件、工作台保存刷新持久化、普通运营角色的管理员权限拒绝，以及资料处理失败后的恢复链路。B 已验证租户模板安装持久化、输出中心选择 A 案件、申请书预览和 PDF 下载；预览/下载渲染内容一致。资料处理器本身返回过 `422`，不代表真实 OCR 或外部附件存储成功。`npm start` 的 `/`、`/sign-in`、`/api/health/data`、`/organize-center` 仍返回 503；首个明确阻断为边缘限流启用标志和策略 ID 缺失，生产数据发布批准、附件存储和文档读取配置也未满足。模板发布状态检查在连接开发数据库后仍有两个模板未达修正版 active version 要求。
- WIP 产品去向：TASK-003 资料确认/合并和 TASK-004 前台模板使用是推荐第一集成边界；TASK-005 官方模板 draft/publish、TASK-006 返回路径、TASK-007 视觉诊断、TASK-008 生命周期继续候选/隔离。矩阵见 `docs/operations/MIG-007_PRODUCT_RECOVERY_MATRIX_2026-08-13.md`。
- 朋友测试目标补充：当前目录有 167 个字段，其中 149 个案件事实字段；设置页已有 8 个主分类、分枝、搜索和必填/选填控制，但完整“专业分类”展示不属于 A/B，不能在 MIG-007 结束时伪称已完成。

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
- 范围安全：MIG-006 本身未产生业务代码差异；MIG-007 A 保留已审查的 TASK-003 资料确认/合并交互，B 只修改申请书 PDF 预览转换、输出中心失败反馈和模板预览失败反馈；未修改数据库、safety/WIP、main、TASK-005～008、149 项分类或术语目录。治理记录更新仅涉及 TASK-018、恢复矩阵、BACKLOG 和本交接。
- 验证：`git diff --check`、`npm run test:workflow-rules`、引用扫描和独立审查均通过。
- 未验证项：真实 Cursor 加载顺序/UI 行为需要人工验证。
- Git：MIG-006 收口提交号见 Git 历史；最终工作区收口后保持干净。

## 当前禁止事项

- A/B 以外不修改或合并业务代码、数据库、public、业务配置、页面行为、用户可见文字、历史资料、`main` 或 safety/WIP；不合并、rebase、cherry-pick、reset。
- 不把 WIP 整体合入，不单独提取会破坏完整用户流程的 hunk；不把生产 503、外部数据库失败或真实隧道行为伪称为通过。
- TASK-003 的 A 和 TASK-004 前台流程 B 本地运行门禁已通过；不得把 B 扩展到 TASK-005～008。真实 OCR、生产认证、外部服务、生产数据库、双租户真实浏览器隔离和隧道仍需人工验证；在这些检查前不得开放隧道。149 项专业分类、TASK-005～008 不得顺手迁入；MIG-007 完成后停止新增治理任务。

## Agent状态

- MIG-005 按顺序使用 1 个实现 Agent 和 1 个独立审查 Agent，均已退出；MIG-007 检查点 A 和 B 均按顺序各使用 1 个实现 Agent 和 1 个独立审查 Agent，均已退出；当前活跃 Agent 数量为 0。
