# Broker Desk 当前工作交接

> 本文件是唯一活动交接和进度入口，不重复产品、架构或历史正文。
> Last updated: 2026-08-17.

## 当前任务

- `PM-HANDOFF-001` 接管验证已通过；下一阶段项目经理已正式接管。
- `TASK-016 / MIG-004` 已完成：已建立术语唯一规范来源并迁移相关活动文档，不修改业务代码或实际界面文案。
- `TASK-015 / MIG-005` 已完成：已建立技术项目经理、实现 Agent、独立审查 Agent 三类最小 Playbook，并通过独立只读审查。
- `TASK-017 / MIG-006` 已完成：已清理 `.cursor` 活动规则、建立薄适配入口并处理高风险 Skill 指针。
- `TASK-018 / MIG-007` 已完成：A→独立审查→B→独立审查、本地浏览器/数据行为门禁及从 A 案件到申请书下载的端到端验收均已通过。治理迁移阶段结束，`main` 已成为唯一正式开发基线。
- `TASK-020 实施 C+ 案件总览` 继续为 `Blocked`。TASK-023 已提供锚点/滚动/键盘的正式证据，但隔离模板下载确认、最终下载前案件级确认、数据修改后的确认失效和其他本卡输出闭环仍由 TASK-020 自身验收；`TASK-019` 外部演示环境仍独立保持 Ready，完成前不得开放产品隧道。
- `UI-GOV-001 / TASK-021` 已 Done。`Broker Desk 页面与交互规范 V1` 仍仅作为候选执行基线；页面迁移矩阵已收口 P0 页面类型、唯一主要任务、重复组件、公共组件候选、业务依赖、迁移顺序、当前截图/录屏证据和不可改变的业务能力。`/cases/new` 已按“无资料直接创建”从 P0 调整为 P1，不与资料导入 Wizard 混同。本轮未修改 `src/`、数据库、配置、公共资产或 `.cursor`，未开始全站换皮、批量 CSS 或逐页布局实施；后续页面迁移继续按独立批准任务执行。
- `TASK-022 / UI-GOV-002A 最小视觉基础` 已 Done；其基础组件已被 TASK-023 正式案件页参考实现使用。非导航开发预览路由已随 TASK-023 收口移除；TASK-024 另行承担 Layout System 的目标图和后续试点门禁。
- `TASK-023 / UI-GOV-003` 已 Done：Checkpoint A/B/C 完成；两个开发预览路由移除，正式案件页手动滚动/hash、原生锚点 Enter、点击及前进后退的可回放浏览器证据通过。隔离模板下载确认及数据修改后的确认失效已按产品决定归回 `TASK-020`；`TASK-020` 仍 `Blocked`，不启动 UI-GOV-002B。
- `TASK-024 / UI-GOV-002B` 已 `Done`：阶段 A 目标图、阶段 C 申请人 Responsive Form 试点、运行闭环最小修复和独立只读审查均已完成。正式 Chrome 响应式、同一 Server Action 的六位拒绝/不同七位写入与恢复、Kotoeri 组合输入第一次 Enter 不提交三项门禁为 `3/3`。产品裁决明确不要求整页刷新、不把 768px 输入框级测量写成已完成，并保留服务端证据的非连续时间边界。脱敏证据、QA patch、提交元数据和脱敏日志已归档于 `docs/operations/evidence/TASK-024/2026-08-16/`；临时 QA worktree 和本地分支已清理，原始截图已删除，正式产品未合并 QA 调用器。下一步不启动 UI-GOV-002B 后续页面迁移。
- 矩阵 V2 已冻结为 Approved baseline：34 个业务/后台页面族、2 个 Auth Shell 页面族、1 个退役路由、4 个系统状态入口；两个申请书预览路径合并为一个页面族，Workspace Selector 独立登记。API/QA、历史入口和删除候选独立登记，不计入正式页面数量。规范批准不等于页面迁移完成。
- `TASK-025` 当前为 `Done`：Checkpoint A、B、C、页面级 D 和独立只读审查已完成。W1 当前只交付案件、主体、物件三个可靠对象类型；待归属资料入口、列表、数量和状态徽章因缺少具体对象归属权威而冻结，不代表资料为零或页面已完成。分页、长列表滚动、浏览器返回、触发链接焦点、原生链接键盘行为、1440/768/390 响应式、三类入口和 `type=inbox` 诚实不可用状态已取得证据。完整归档执行/恢复、第二租户合法身份和跨租户隔离本轮未重新验证，作为共享平台/业务回归缺口记录，不构成本卡页面验收证据。`targetEntity`、案件 `sourceImportJobIds` 和导入处理状态不足以证明具体主体/物件归属；未来恢复需独立产品和数据决策。当前正式角色模型下所有角色均包含 `record.read`，已登录但无该权限的页面门禁为 `N/A`，不创建虚构角色。列表不建立独立 selected 状态，分页使用 URL 的 `page`，浏览器返回恢复触发链接焦点，一级导航继续返回对象选择器并重置列表上下文。状态契约不授权新建业务完成算法，不显示或推导输出资格。typecheck/build 因本地重复 `@types` 目录的依赖环境错误未通过，未涉及 `src/`；lint、workflow rules 和 diff check 通过。TASK-020 继续 Blocked，输出中心和最终预览/下载延期为独立输出产品专题，首页最后处理。
- `TASK-026` 当前为 `Blocked`：已创建 `TASK025 QA A` 和 `TASK025 QA B` 两个专用非生产租户并发送 Clerk 开发邀请。QA A 已实际进入对应工作区并通过正常路径创建 7 条 `TASK025-scroll-A-*` 合成案件，案件列表已形成第 2 页；QA B 的独立工作区证据尚未取得，归档/恢复和跨租户隔离仍未验证。任务仍只覆盖两个专用测试租户、合法 Clerk 身份、现有角色、同一对象类型至少 7 条合成记录、正常路径归档/恢复、跨租户隔离和脱敏交接；不得修改业务代码、数据库结构、生产数据、认证规则、权限模型或租户隔离。TASK-025 页面级 Checkpoint D 不再依赖 TASK-026；TASK-026 继续作为共享平台 QA 和后续任务的独立前提。
- 实现前基线只读核对：`UI_GOV_002B_LAYOUT_FLOORPLAN_MATRIX_2026-08-15.md` 是由 V2 取代的历史兼容入口；`BROKER_DESK_LAYOUT_SYSTEM_V1.md` 是 2026-08-16 Layout System Approved baseline 并指向 V2。两者均为本轮前已存在的未提交用户修改，本次不暂存、不提交、不删除，后续需独立归属或产品复核。
- B 锚点证据已覆盖实际滚动容器、动态偏移、IntersectionObserver/ResizeObserver、scroll-margin-top、hash push/popstate、手动滚动、返回顶部、property→contract→back→forward 和带 hash 刷新；390px overview 无横向溢出且首个字段进入首屏，quick 有窄屏“下一项任务”入口。完整外部权限、租户和下载证据前停止，不启动 UI-GOV-002B。
- C+ 案件总览设计基线已获产品负责人批准；中文字段/章节标签已接入 149 项中日对照，官方表单原始日文标题保持不变。`TASK-020` 不修改生产认证、租户隔离、数据库或 TASK-005～008；韩文字段完整对照源缺失，不能宣称三语言通过。
- 不补建独立的 `PM-HANDOFF-001` 任务卡：`AGENTS.md` 要求实施任务使用指定任务卡，但没有要求只读接管单独建卡；本文件、`BACKLOG.md` 和 `TASK-014` 已提供足够交接证据。

## 已完成迁移证据

- `MIG-001 / TASK-012`：实现 `ee1850e`，审查收尾 `2cb8f45`。
- `MIG-002 / TASK-013`：实现 `3d4d345`，审查收尾 `baad0b9`。
- `MIG-003 / TASK-014`：实现 `5066a61`，审查收尾 `f81ef84`。
- 上述任务均为 `Done`，且没有业务代码、数据库、页面行为或用户可见文字修改。

## Git事实

- 正式仓库：`/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev`
- Branch: `main`
- 正式开发分支：`main`
- 当前分支与 `main`：最终收口后当前分支为 `main`；`main` HEAD 与当前 HEAD 相同，且 Git 历史包含 MIG-001 至 MIG-007 的实现、审查和收口证据。不得维护易漂移的“领先多少个提交”手工计数。
- TASK-024 正式收口提交：`bf88506e9e671ba712c635c8a436aa57b57cbfa4`；本轮只补充其持久审计证据和历史状态措辞，不改变任务、业务代码或产品状态。
- 治理恢复分支：`recovery/mig-007-checkpoint-a` 已安全 fast-forward 合入 `main`，不再作为正式开发入口。
- `safety/wip-mixed-worktree-20260812`：`61bce515e4ad44a6c32da551377dbf427d8bd946`；仅作混合 WIP 隔离证据，保持不变。
- A/B 收口提交后工作区保持干净；运行 Next 开发服务生成的规则块不得保留在 `AGENTS.md`。
- MIG-007 最终事实：显式设置非生产 demo 身份和 `DATA_DRIVER=memory` 后，开发服务可监听，公开 `/api/health/data`、受保护 `/import-center`、`/organize-center` 和设置页均可由浏览器访问。A 已验证资料确认/修正/不采用、追加到既有案件、新建案件、工作台保存刷新持久化、普通运营角色的管理员权限拒绝，以及资料处理失败后的恢复链路。B 已验证租户模板安装持久化、输出中心选择 A 案件、申请书预览和 PDF 下载；预览/下载渲染内容一致。资料处理器本身返回过 `422`，不代表真实 OCR 或外部附件存储成功。`npm start` 的 `/`、`/sign-in`、`/api/health/data`、`/organize-center` 仍返回 503；首个明确阻断为边缘限流启用标志和策略 ID 缺失，生产数据发布批准、附件存储和文档读取配置也未满足。以上外部演示门禁已转入 TASK-019，不能把本地基线通过当作隧道可开放。
- WIP 产品去向：TASK-003 资料确认/合并和 TASK-004 前台模板使用已纳入当前 `main` 基线；TASK-005 官方模板 draft/publish、TASK-006 返回路径、TASK-007 视觉诊断、TASK-008 生命周期继续候选/隔离。矩阵见 `docs/operations/MIG-007_PRODUCT_RECOVERY_MATRIX_2026-08-13.md`。
- 朋友测试目标补充：当前目录有 167 个字段，其中 149 个案件事实字段；设置页已有 8 个主分类、分枝、搜索和必填/选填控制，但完整“专业分类”展示不属于 A/B，不能在 MIG-007 结束时伪称已完成。

## 状态判断与风险

- `TASK-002` 保持 `In Review`：任务卡明确要求未决片段继续为 `Needs Review`，没有新业务证据可改为 Done。
- `TASK-010` 保持 `Blocked`：仍依赖 TASK-005、TASK-007、TASK-009，并缺少真实环境、权限、恢复和双设备证据。
- `.cursor` 的旧活动规则和旧权威顺序已由 TASK-017 清理；旧 CLAUDE 内容、旧输出路由和两份日语术语字典仍按既有边界保留或另行处理，当前术语选择只以 `docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md` 为准。治理阶段已结束，不新增 MIG-008。

## MIG-004结果

- 产品已确认五组用户可见术语；已按 `docs/tasks/TASK-016.md` 完成迁移，当前唯一规范来源为 `docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md`。
- 2026-07-14 字典、旧 handoff 和 CSV 只保留历史证据，不升格为当前权威；活动工作流和风格指南不得另立冲突词表。
- 未执行术语批量回填、代码修改或实际界面文案修改；独立只读审查已通过。
- `TASK-015 / MIG-005` 已完成：三类 Playbook 为 `docs/agents/TECHNICAL_PM.md`、`docs/agents/IMPLEMENTATION_AGENT.md`、`docs/agents/INDEPENDENT_REVIEW_AGENT.md`；包含建设性反对、证据分层、最小验证、停止条件、Agent 生命周期和交接要求。
- `PRODUCT_TERMINOLOGY_CANONICAL.md` 的 `docs/operations/` 目录归属问题已登记在 `TASK-017` 的明确排除项中，本轮不移动、不重命名、不返工。

## MIG-006结果

- `.cursor` 现在只通过一个带 Cursor 元数据的薄入口路由到 `AGENTS.md`、当前上下文、`TASK-017` 和按角色匹配的三类 Playbook。
- 已处理旧 `CLAUDE.md wins`/权威顺序、重复规则正文、失效规则引用和高风险 Skill；低风险按需 Skill 未做完整重构。
- `PRODUCT_TERMINOLOGY_CANONICAL.md` 的目录归属本轮未迁移；MIG-007 已完成批准范围内的产品代码恢复和基线收口。
- 真实 Cursor 加载行为无法由本地检查证明，已明确记录为“需要人工验证”，未伪称通过。

## 开发恢复检查表

- 治理入口：静态检查通过；`.cursor/rules/00-governance-entry.mdc` 是唯一活动规则入口，治理迁移阶段已结束。
- 权威路由：入口指向 `AGENTS.md`、当前上下文、TASK-017 和三类角色 Playbook；旧 CLAUDE/wins/权威顺序已清除。
- Skill 风险：6 个高风险 Skill 已降为薄指针，6 个低风险 Skill 保持未修改。
- 范围安全：MIG-006 本身未产生业务代码差异；MIG-007 A 保留已审查的 TASK-003 资料确认/合并交互，B 只修改申请书 PDF 预览转换、输出中心失败反馈和模板预览失败反馈；未修改数据库、safety/WIP、TASK-005～008、149 项分类或术语目录。最终基线已 fast-forward 合入 `main`；治理记录更新仅涉及 TASK-018、TASK-019、恢复矩阵、BACKLOG 和本交接。
- 验证：`git diff --check`、`npm run test:workflow-rules`、引用扫描和独立审查均通过。
- 未验证项：真实 Cursor 加载顺序/UI 行为需要人工验证；TASK-019 负责的真实 Clerk、外部服务、隧道行为和关闭演练尚未开始。
- Git：MIG-001 至 MIG-007 的收口提交可由 Git 历史复查；最终工作区保持干净，`main` 为唯一正式开发基线。
- TASK-024 最终证据：三项门禁 `3/3`；脱敏副本已持久归档，原始含测试身份的录屏/截图仅限本地审查。独立审查已完成并退出，产品裁决已写入任务卡；TASK-020 仍独立 `Blocked`。

## 当前禁止事项

- 不新增 MIG-008；后续只建立和执行普通业务任务。不得修改、合并或删除 safety/WIP；不得通过关闭认证、限流、同源检查或租户隔离来解决 TASK-019 的 503。
- 不把 WIP 整体合入，不单独提取会破坏完整用户流程的 hunk；不把生产 503、外部数据库失败或真实隧道行为伪称为通过。
- TASK-003 的 A 和 TASK-004 前台流程 B 本地运行门禁已通过；不得把 B 扩展到 TASK-005～008。真实 OCR、生产认证、外部服务、生产数据库、双租户真实浏览器隔离和隧道仍由 TASK-019 验证；在这些检查前不得开放隧道。149 项专业分类、TASK-005～008 不得顺手迁入。

## Agent状态

- MIG-005 按顺序使用 1 个实现 Agent 和 1 个独立审查 Agent，均已退出；MIG-007 检查点 A 和 B 均按顺序各使用 1 个实现 Agent 和 1 个独立审查 Agent，均已退出；TASK-023 最终证据审核复用 1 个独立审查 Agent，已退出；当前活跃 Agent 数量为 0。
