# Broker Desk 当前工作交接

> 本文件是唯一活动交接和进度入口，不重复产品、架构或历史正文。
> Last updated: 2026-08-24.

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
- `TASK-027` 已按页面迁移层面标记为 `Done`，代码提交为 `a81a857`，目标结构、静态验证和独立审查完成。Checkpoint A 的真实登录运行审计仍受共享登录/工作区环境限制，不被表述为真实 UX 通过；响应式、键盘、筛选、分页、滚动和焦点进入 List Report 批次运行回归，不再阻塞本任务。未跟踪文件 `src/app/clients/page 2.tsx` 所有者不明，本轮不删除、不修改、不提交，后续提交必须显式排除。第二账号、邀请、工作区成员、第二租户、跨租户和平台所有者流程继续作为共享平台回归项。
- `TASK-028` 已按页面迁移层面标记为 `Done`：Checkpoint A/B/C 及产品负责人有限通过的 Checkpoint D-Lite 已完成。目标结构与交互规格见 `docs/operations/TASK-028_W2_TARGET_STRUCTURE_2026-08-17.md`，结构/响应式证据归档于 `docs/operations/evidence/TASK-028/2026-08-17/checkpoint-d-lite-report.md`。原生链接及可聚焦语义已核对；真实 Tab、Enter 和浏览器返回焦点尚未取得合格运行证据，统一进入全产品迁移后的批次回归。本任务不宣称完整键盘可访问性、真实上传/OCR/保存、422/503 恢复或完整导入闭环通过。实现依据任务 payload、`sourceType` 和处理结果判断路径，不得按 `job`/`xlsxJob` 名称单独分流；TASK-020、输出产品专题、认证、权限、租户和数据库边界继续冻结。
- `TASK-029` 已按页面结构迁移层面标记为 `Done`：`/parties` 已收敛为纯 List Report，只显示主体名称、显式类型、显式角色、联系方式和生命周期；缺少显式类型/角色显示“未设置”；已移除兼容推断、完成度、案件数量、关联筛选、`focus`、右侧详情、输出/附件/案件动作和 CSV 控件。主体名称为主要维护入口，关系图与归档/恢复为次级操作；页面标题、桌面列标题、手机行内标签和空态操作层级已修正。静态检查和独立只读审查通过。D-Lite 不宣称通过：本地 3002 可监听但 `/parties` 因 `pg-connection-string` 解析 `fs` 及 Node 模块浏览器打包错误返回 500；`npm run build` 通过，服务已停止，未继续认证/租户/依赖排查。1440/768/390、横向溢出、Tab/Enter/返回焦点、真实空态/筛选/分页/归档、完整无障碍、权限/租户和 CSV 回归进入批次验证。`/api/hub/export?scope=parties` 未修改；如需恢复主体导出另立任务。`src/app/clients/page 2.tsx` 继续排除，不自动启动下一矩阵任务。
- `TASK-030` 已按页面结构迁移层面标记为 `Done`：W6-C `/properties` 已完成全量 lifecycle 空态事实修正、纯 List Report、area 事实链、区域/エリア术语、费用 null/零值、listing price 非正数、active/archived lifecycle 和完整 ARIA table 结构；实现严格限于批准文件，固定趋势、完整度、关系、活动、随机封面、focus/侧栏、输出和 CSV 继续冻结。静态检查和独立只读审查通过。一次 D-Lite 运行探测因 `npm run dev -- --port 3002` 返回 `listen EPERM` 未能启动服务；1440/768/390、键盘/焦点、空态视觉、横向溢出、完整无障碍、权限/租户和 CSV 下载均为 `UNVERIFIED`，统一进入全产品迁移后的批次回归，不继续认证或环境排查。
- `TASK-031 / W7-A` 已按“物件创建/编辑 Responsive Form 页面结构迁移完成”标记 `Done`：共享字段、业务分组、服务端校验、保存/取消、错误结构、PostgreSQL 租户作用域适配完成，独立代码审查无 P0/P1。售价留空使用兼容 `0`，显式 `0` 拒绝，管理费/修缮费真实 `0` 保留；创建审计 `targetType` 为 `property`。1440/768/390 真实表现、横向溢出、真实 Kotoeri、Tab/Enter/错误摘要与字段焦点、浏览器返回上下文、PostgreSQL 真实读写、权限/租户隔离和完整无障碍统一进入全产品批次回归；IME 仅有代码机制证据。页头返回列表是页面级导航，底部取消是放弃编辑，当前不构成阻塞；批次视觉回归检查操作层级。页面与 Server Action 的 `returnTo` 白名单重复实现登记为维护风险，本任务不重构。D-Lite 仅探测一次本地服务并因 `listen EPERM` 未启动；TASK-020、输出专题、`/templates` W3、其他 W7/W8 页面和 `src/app/clients/page 2.tsx` 继续冻结/排除。下一项建议建立 W7-B，仅先审计 `/clients/new` 与 `/clients/[id]/edit`，保留客户阶段、用途、温度和跟进语义，不复制物件字段模型。
- `TASK-032 / W7-B` 已按“客户创建/编辑 Responsive Form 页面结构迁移完成”标记为 `Done`：Checkpoint C 有限实现、成功反馈边界最小修正和新一轮独立只读复审均完成；复审为 `PASS`，无 P0/P1。`/clients/[id]/page.tsx` 仅在现有 `flashMap` 增加 `client_created` 日/中/韩三语映射，不构成 Object Page 迁移。`returnTo` 已严格排除 `/import-center`，`not_applied/none/not_required` 保留准确业务文案；五组 Responsive Form、单一保存、模板调用移除、预算/日期校验、错误摘要、输入保留和快速创建兼容已实现。一次 D-Lite 探测因本地 3002 `listen EPERM` 未启动服务，运行项为 `UNVERIFIED`；1440/768/390、横向溢出、真实 PostgreSQL、权限/租户、响应式、键盘/IME、焦点、浏览器返回和完整无障碍统一进入全产品迁移后的批次回归。不启动第二轮视觉优化，不触碰 `/clients` 其他代码或 `src/app/clients/page 2.tsx`。
- `TASK-033 / W7-C` 已按页面结构迁移口径标记 `Done`。Checkpoint A/B/C 已完成；`/parties/new` 为零表单 System State，不调用 `createPartyProfileAction`；`/parties/[id]/edit` 仅维护姓名/公司名、电话/邮箱/LINE、显式类型和单一角色，主体备注、状态、客户备注和未知 notes 行全部原样保留。类型/角色缺失保持“未设置”；日中韩类型/角色行按类别规范化为至多一条当前语言行；不写入默认 individual/applicant/active，不修改客户 purpose、区域、阶段、温度、预算、贷款、合同、AML、跟进或其他客户字段。移除 `inferPurposeFromPartyRole`、关系提示、完成度工作台、`ObjectWorkbenchShell`、sticky 保存栏和主体主流程 `FormDraftAssist`；编辑保留既有更新审计，W7-C 不宣称正式主体创建审计闭环；严格 returnTo 仅允许 parties 列表或 organize-center party 来源，其余回退 `/parties`；顶部增加共享事实安静说明。专项脚本、typecheck、lint、build、workflow rules、diff check 和独立只读审查通过；D-Lite 单次服务探测因 `listen EPERM` 未启动，浏览器、真实保存、权限/租户、1440/768/390、横向溢出、键盘/IME/焦点和完整无障碍均为 `UNVERIFIED`，进入全产品批次回归。TASK-020、输出专题和 `src/app/clients/page 2.tsx` 继续冻结/排除；不自动启动下一页面。
- `TASK-034 / W11-CORE` 第一批已按页面结构迁移口径标记 `Done`：`/clients/[id]` Object Page、`/service-requests` Worklist、`/audit-log` 只读 List Report 完成；`/contracts` 完成只读 Worklist，合同状态、金额、批量更新和导出因报价/客户阶段推导及空选择语义冻结。客户详情保留持久化阶段/用途/温度、跟进/报价/任务和编辑入口，移除推导阶段建议、路径徽章和重复工作流动作；服务请求移除预算比例、完成率、FormDraftAssist、随机证据、模板/导入入口、focus 和意向区域伪物件关系；审计记录保留真实日志筛选/导出/权限并改为窄屏行式结构。其基线为 `b9599c031ec9282ae3bf7e9890710711afb97cce`，不得重新审查或优化。矩阵 V2 已将 `/parties/new` 修正为 System State，并删除 `/properties/new` 主流程辅助填写描述；旧 UI-GOV-001 主体/物件建议已标记为历史并被 TASK-029–033 替代。
- `TASK-034 / W11-CORE` 第二批已完成有限实现、独立只读审查和行政收口，任务整体按页面结构迁移口径保持 `Done`：`/cases/new` 为单次提交 Responsive Form，移除 FormDraftAssist 和并列创建入口；`/workspace` 保持唯一 Workspace Selector/System State且未改选择/权限逻辑；`/board` 保留持久化 `Client.stage` 七阶段 Kanban 与现有 PATCH，仅改为 390 单列、768 双列和桌面多列；`/relationship-tree` 改为只显示显式案件主体/物件、来源导入任务、明确附件和直接合同关系的 Relationship Explorer，移除字符串推断、默认首项、focus、伪状态和输出节点。第二批专项脚本、typecheck、lint、build、workflow rules、diff check 和独立审查通过；未启动服务，1440/768/390、横向溢出、键盘/焦点、真实权限/租户和完整动作行为统一标记 `UNVERIFIED` 并进入批次回归。输出/模板/报价专题、TASK-020 未完成部分和 `src/app/clients/page 2.tsx` 继续排除/冻结；本批完成后不自动进入下一矩阵批次。
- `TASK-035 / W12` 已按页面结构迁移口径标记 `Done`：`/settings/members` 收敛为 Member Management/Settings Worklist，保留成员/邀请/角色/停用 Action 与权限守卫并移除硬宽表格；`/platform/accounts` 收敛为 Platform Administration List Report，移除模板越界入口，保留平台账户/席位/生命周期/邀请和拒绝 System State；`/settings/ai-experience` 收敛为 Settings Form/Review Queue，移除四格数量 KPI 与修正记录聚合，保留候选整理、状态筛选和启用/不使用；首页收敛为 Product Entry Page，只保留资料录入、信息整理、真实案件/导入待处理项和搜索，移除输出/合同聚合、对象推断、focus、伪完成状态和重复入口墙。独立只读审查 `PASS`、无 P0/P1；专项脚本、typecheck、lint、build、workflow rules 和 diff check 通过。成员停用显式前端确认仍为既有 P2 能力缺口，未宣称运行通过；真实浏览器、响应式、键盘、权限/租户和完整 Action 行为统一进入 [`UNIFIED_LAYOUT_BATCH_REGRESSION_CHECKLIST_2026-08-18.md`](UNIFIED_LAYOUT_BATCH_REGRESSION_CHECKLIST_2026-08-18.md)。TASK-020、输出/报价/模板专题、`src/app/clients/page 2.tsx` 继续排除/冻结；不自动进入下一任务。
- `TASK-036` 已完成一次统一运行回归但保持 `Blocked`：正常启动因 `listen EPERM` 失败后仅对同一命令提升一次并成功；既有 Clerk Development 会话与请求租户不匹配，22 路由无白屏/构建错误/横向溢出但多数业务页面只能记为 `UNVERIFIED`。当前口径固定为：Layout System 结构迁移 `Done`、响应式路由冒烟 `Pass`、真实业务运行验收 `Blocked`、输出专题未开始。57 张截图、22 路由冒烟、三宽度测量和键盘返回证据永久有效；恢复只需一个现有 Clerk Development 身份对一个非生产工作区的 `active membership`，不需要第二账号/第二租户，之后只补差额，不重跑全量截图。独立审查 `PASS`、无 P0/P1。证据报告为 [`TASK-036_LAYOUT_REGRESSION_2026-08-18.md`](TASK-036_LAYOUT_REGRESSION_2026-08-18.md)，截图索引为 [`evidence/TASK-036/2026-08-18/README.md`](evidence/TASK-036/2026-08-18/README.md)；不继续端口、Clerk、双账号或第二租户排查。
- TASK-036 恢复预检已停止：当前既有 Chrome Development 会话访问 `/workspace` 显示没有可访问工作区，未确认 active membership；当前浏览器未暴露可安全核对的第二既有身份，因此未提出切换请求，也未切换账号。未执行任何差额回归，不重复既有截图或 22 路由冒烟；TASK-036 继续 `Blocked`。
- 产品决定：TASK-036 剩余真实业务回归延期至服务器端预发布、Preview 或受控内部环境；本地不再继续账号/工作区测试。预发布必须绑定明确 Git SHA、单内部测试身份、单非生产 active workspace、非真实客户资料和可回滚路径；不要求第二账号/第二租户。恢复后只补既定差额，TASK-036 在独立审查和无 Layout System P0/P1 前保持 `Blocked`，输出专题继续冻结。
- `TASK-037 / G1-SLICE-0` 已 Done：五套现有平台蒙板的静态配置、资产、入口、调用关系、租户/权限门、版本指纹和回退要求已形成证据包。运行边界固定为 `UNVERIFIED — Clerk active membership environment unavailable`；HTTP 404 仅证明 Clerk 身份保护拦截，未进入蒙板或 PDF 逻辑，不得写成蒙板/预览/输出失败。当前无可重复 PDF 样本不阻断 TASK-038 技术设计或本次纯代码合并，但仍是 Production 部署前硬门。证据包为 [`GUARANTEE_APPLICATION_G1_SLICE_0_EVIDENCE_2026-08-19.md`](../product/GUARANTEE_APPLICATION_G1_SLICE_0_EVIDENCE_2026-08-19.md)。
- `TASK-038 / G1-SLICE-1` 当前为 `Product Acceptance Passed / Integration Deferred`；产品实现和 Staging 验收完成，尚未合入 main 或部署 Production，TASK-037 旧模板实际 PDF 回归仍是 Production 前硬门。
- `TASK-039 / W8` 当前为 `In Progress / Foundation Accepted — Visibility Follow-up Pending`；经营主体与成员基础阶段验收完成，案件、人物、物件可见范围、资料共享、递归授权、离职接管和停付费保留/删除继续后续阶段。
- TASK-038、TASK-039 及后续产品的统一交付顺序固定为：本地设计与实现 → 本地自动检查 → 形成可追溯代码版本 → 部署 Vercel Staging → 独立 Agent 真实产品验收 → 失败则回本地修正 → 产生新版本并重新部署 → 产品验收通过 → 获得明确授权后才允许合并 → Production 发布另行授权。产品代码只在本地工作区和 Git 仓库修改；Vercel 只用于运行和验收；每次 Staging 记录分支与准确版本；构建、部署 Ready、自动测试通过均不等于产品验收通过；Staging 验收通过不自动授权合并，合并也不自动授权 Production 发布。
- 实现前基线只读核对：`UI_GOV_002B_LAYOUT_FLOORPLAN_MATRIX_2026-08-15.md` 是由 V2 取代的历史兼容入口；`BROKER_DESK_LAYOUT_SYSTEM_V1.md` 是 2026-08-16 Layout System Approved baseline 并指向 V2。二者均已纳入当前 Git 历史；当前不修改、不删除、不把其视为未提交现场。
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

## 2026-08-24 当前状态覆盖

- 正式合并基准固定为 `origin/main=aa35b6ad0f45c3731993cbadc0fadca38107f5b2`；平台候选固定为 `28b021782051eb2375a5a2f0e8da82094520e04e`。
- TASK-038 为 `Product Acceptance Passed / Integration Deferred`；不再扩大产品范围，尚未合入 main 或部署 Production。
- TASK-039 仅经营主体与成员基础阶段验收通过；案件、人物、物件可见范围及后续资料授权继续未完成。
- 平台候选在 Production 隔离、工程检查和完整独立审查门关闭前保持 `Not Mergeable`；不得合并 main、部署 Production 或执行 Production migration。

## 当前禁止事项

- 不新增 MIG-008；后续只建立和执行普通业务任务。不得修改、合并或删除 safety/WIP；不得通过关闭认证、限流、同源检查或租户隔离来解决 TASK-019 的 503。
- 不把 WIP 整体合入，不单独提取会破坏完整用户流程的 hunk；不把生产 503、外部数据库失败或真实隧道行为伪称为通过。
- TASK-003 的 A 和 TASK-004 前台流程 B 本地运行门禁已通过；不得把 B 扩展到 TASK-005～008。真实 OCR、生产认证、外部服务、生产数据库、双租户真实浏览器隔离和隧道仍由 TASK-019 验证；在这些检查前不得开放隧道。149 项专业分类、TASK-005～008 不得顺手迁入。

## Agent状态

- MIG-005 按顺序使用 1 个实现 Agent 和 1 个独立审查 Agent，均已退出；MIG-007 检查点 A 和 B 均按顺序各使用 1 个实现 Agent 和 1 个独立审查 Agent，均已退出；TASK-023 最终证据审核复用 1 个独立审查 Agent，已退出；当前活跃 Agent 数量为 0。
