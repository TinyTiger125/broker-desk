# Broker Desk Backlog

> BACKLOG.md and the linked local task cards are authoritative for task
> scope, status, dependencies, and completion evidence. GitHub Issues and
> historical handoffs may mirror information but do not define it.
>
> Valid statuses: Proposed, Ready, In Progress, In Review, Blocked, Done.

| ID | Priority | Task | Status | Depends on | Card | Completion evidence |
|---|---:|---|---|---|---|---|
| TASK-001 | P0 | Establish the pure governance baseline | Done | — | [TASK-001](docs/tasks/TASK-001.md) | Governance-only commit; checker and diff checks pass |
| TASK-002 | P0 | Decompose and register the mixed WIP by diff fragment | In Review | TASK-001 | [TASK-002](docs/tasks/TASK-002.md) | Fragment-level candidates recorded; unresolved fragments remain Needs Review |
| TASK-011 | P0 | Repair governance baseline metadata and document residue | Done | TASK-001 | [TASK-011](docs/tasks/TASK-011.md) | No patch residue; branch and baseline metadata agree; governance checks pass |
| TASK-012 | P0 | MIG-001 unify governance entrypoints | Done | — | [TASK-012](docs/tasks/TASK-012.md) | Entry documents converge on AGENTS.md, current context, and the assigned task card |
| TASK-013 | P0 | MIG-002 decompose and downgrade PROJECT_MEMORY | Done | TASK-012 | [TASK-013](docs/tasks/TASK-013.md) | Archive, compatibility pointer, direct references, checker, validation, and independent review complete |
| TASK-014 | P0 | MIG-003固化V1唯一主输出边界 | Done | TASK-013 | [TASK-014](docs/tasks/TASK-014.md) | Product-document boundary, validation, and independent review complete; no business-code changes |
| TASK-016 | P0 | MIG-004建立日语用户界面术语唯一规范来源 | Done | TASK-014 | [TASK-016](docs/tasks/TASK-016.md) | Canonical source, active-document routing, historical-source preservation, exact five-term check, workflow-rules check, and independent read-only review PASS |
| TASK-015 | P1 | MIG-005建立三类核心角色 Playbook | Done | TASK-016 | [TASK-015](docs/tasks/TASK-015.md) | Three role Playbooks, fixed constructive-dissent protocol, evidence labels, minimal validation, lifecycle/hand-off rules, review-fix, and independent review PASS |
| TASK-017 | P0 | MIG-006清理 Cursor 活动规则并建立薄适配入口 | Done | TASK-015 | [TASK-017](docs/tasks/TASK-017.md) | Thin Cursor governance entry, legacy authority cleanup, high-risk skill pointers, reference scan, governance checks, manual-load verification record, review-fix, and independent review PASS |
| TASK-018 | P0 | MIG-007恢复唯一可运行产品基线 | Done | TASK-002, TASK-017 | [TASK-018](docs/tasks/TASK-018.md) | A/B implementation and independent review, static checks, local browser/data gate, and end-to-end application preview/download pass; external demo gates moved to TASK-019; tunnel not opened |
| TASK-019 | P0 | 外部演示环境准备 | Ready | TASK-018 | [TASK-019](docs/tasks/TASK-019.md) | Diagnose npm start 503; verify real Clerk, dedicated synthetic-data tenants, callbacks, isolation, security and rollback before tunnel sharing |
| TASK-020 | P0 | 实施 C+ 案件总览 | Blocked | TASK-018 | [TASK-020](docs/tasks/TASK-020.md) | Implementation and independent review completed; latest recording shows stale active anchor and possible disappearing anchor bar after scroll/header transition; unique scroll container, header height, sticky offset, observer/hash/scroll-margin and full browser evidence remain |
| TASK-021 | P0 | UI-GOV-001 页面与组件只读盘点、迁移矩阵和优先级 | Done | TASK-018 | [TASK-021](docs/tasks/TASK-021.md) | 38 个路由、3 个系统状态入口、P0 类型、公共组件候选、依赖、顺序、截图证据和业务边界已收口；无业务代码修改，等待 UI-GOV-002A 批准 |
| TASK-022 | P0 | UI-GOV-002A 最小视觉基础 | Done | TASK-021 | [TASK-022](docs/tasks/TASK-022.md) | 唯一 Token、Object Page 最小基础组件和非导航开发预览 `/ui-foundation-preview` 已完成；静态、浏览器桌面/窄屏、焦点、触控、CJK 和范围门禁通过；未迁移正式业务页面 |
| TASK-023 | P0 | UI-GOV-003 案件 Object Page 参考实现 | Done | TASK-022 | [TASK-023](docs/tasks/TASK-023.md) | 两个开发预览路由已移除；手动滚动/hash、原生锚点 Enter、点击及前进后退的可回放浏览器证据通过；隔离模板下载确认及数据修改失效归 TASK-020；真实 Clerk/第二租户/生产环境另列发布门禁 |
| TASK-024 | P0 | UI-GOV-002B Broker Desk Layout System 建设 | Done | TASK-023 | [TASK-024](docs/tasks/TASK-024.md) | 阶段 A 目标图、阶段 C 实现和直接修复提交 `46f22d0` 已完成；响应式、服务端六位拒绝/不同七位写入与恢复、Kotoeri IME 第一次 Enter 不提交均通过，正式门禁 `3/3`；脱敏证据见 [`TASK-024 evidence archive`](docs/operations/evidence/TASK-024/2026-08-16/) |
| TASK-025 | P0 | W1 信息整理中心 List Report 参考实现 | Done | TASK-024 | [TASK-025](docs/tasks/TASK-025.md) | Checkpoint A/B/C/D及独立只读审查完成；页面级证据通过；共享归档执行/恢复、第二租户和跨租户隔离本轮未重新验证，保留为共享平台QA缺口 |
| TASK-026 | P0 | 建立可复用非生产 QA 环境 | Blocked | TASK-025 | [TASK-026](docs/tasks/TASK-026.md) | QA A 已实际进入并创建7条合成案件，已形成第2页；QA B独立工作区尚未核实，归档/恢复和跨租户隔离未验证 |
| TASK-027 | P0 | W6-A：客户索引 List Report 参考迁移 | Done | TASK-025 | [TASK-027](docs/tasks/TASK-027.md) | 页面迁移层面目标、静态检查和独立审查完成；真实登录后的响应式、键盘、筛选、分页、滚动和焦点进入 List Report 批次运行回归，不宣称本任务已通过；未跟踪 `src/app/clients/page 2.tsx` 保留且排除 |
| TASK-028 | P0 | W2：导入资料 /import-center Wizard 参考迁移 | Done | TASK-027 | [TASK-028](docs/tasks/TASK-028.md) | Checkpoint A/B/C 及 D-Lite 页面结构收口完成；结构、互斥路径和 1440/768/390 响应式证据已归档；真实 Tab/Enter/返回焦点、OCR、上传/保存、422/503 和完整闭环进入批次回归，不宣称已通过 |
| TASK-029 | P0 | W6-B：主体索引 /parties List Report 参考迁移 | Done | TASK-028 | [TASK-029](docs/tasks/TASK-029.md) | 页面结构迁移完成：纯 List Report、显式字段、页面标题/桌面表头/手机标签/空态层级已收口；静态检查和独立审查通过。1440/768/390、横向溢出、键盘/返回焦点、真实空态/筛选/分页/归档、完整无障碍、权限/租户和 CSV 回归待批次验证；D-Lite 因本地 Next.js `fs`/Node 模块构建错误为 UNVERIFIED |
| TASK-030 | P0 | W6-C：物件索引 /properties List Report 参考迁移 | Done | TASK-029 | [TASK-030](docs/tasks/TASK-030.md) | 页面结构迁移完成：全量 lifecycle 空态事实、area 事实链、区域术语、费用 null/零值、listing price 非正数、active/archived lifecycle、完整 ARIA table 结构已落实；静态检查和独立只读审查通过。D-Lite 因本地 3002 绑定 EPERM 为 UNVERIFIED；1440/768/390、键盘/焦点、空态视觉、横溢出和完整无障碍进入批次回归 |
| TASK-031 | P0 | W7-A：物件创建/编辑 Responsive Form 参考迁移 | In Progress | TASK-030 | [TASK-031](docs/tasks/TASK-031.md) | Checkpoint A 只读审计完成，分别核验 `/properties/new` 与 `/properties/[id]/edit` 的字段、Server Action、空值/错误、草稿、返回、响应式和 Layout System 边界；浏览器因 3002 `listen EPERM` 为 UNVERIFIED；不进入目标设计或实现 |
| TASK-003 | P0 | Close the input-material merge completion loop | Proposed | TASK-002 | [TASK-003](docs/tasks/TASK-003.md) | Selection, confirmation, result, failure, and refresh evidence |
| TASK-004 | P0 | Consolidate template-library and official-template boundaries | Proposed | TASK-002 | [TASK-004](docs/tasks/TASK-004.md) | Role-aware entry, visibility, and installation evidence |
| TASK-005 | P0 | Separate official template draft and publish states | Proposed | TASK-004 | [TASK-005](docs/tasks/TASK-005.md) | Independent draft save, publish, immutable version, and failure evidence |
| TASK-006 | P1 | Normalize entity-detail return paths | Proposed | TASK-002 | [TASK-006](docs/tasks/TASK-006.md) | Broader case, party, and property return-path evidence |
| TASK-006A | P1 | Case detail return to the organize center | Proposed | TASK-002 | [TASK-006A](docs/tasks/TASK-006A.md) | Candidate-only card; browser evidence required before Ready |
| TASK-007 | P0 | Diagnose duplicated template field characters | Proposed | TASK-002 | [TASK-007](docs/tasks/TASK-007.md) | Layer-separated visual diagnosis |
| TASK-008 | P0 | Complete archive/restore/audit for one record type | Proposed | TASK-002 | [TASK-008](docs/tasks/TASK-008.md) | Permission, lifecycle, idempotency, and audit evidence |
| TASK-009 | P1 | Resolve homepage output-state ambiguity | Proposed | TASK-003 | [TASK-009](docs/tasks/TASK-009.md) | Missing-field and output-ready acceptance evidence |
| TASK-010 | P0 | Re-run closed-pilot acceptance | Blocked | TASK-005, TASK-007, TASK-009 | [TASK-010](docs/tasks/TASK-010.md) | External, browser, PDF, permission, recovery, and two-device evidence |

## Current status boundary

- TASK-002 remains In Review; Needs Review is an evidence label, not a task
  lifecycle status.
- TASK-011 is Done and governance-only; it did not change business code or
  historical recovery references.
- TASK-003 and TASK-006A remain Proposed. Neither is Ready.
- TASK-025 is Done. Checkpoints A, B, C, and page-level D are complete, and the independent read-only review found no TASK-025 scope blocker. W1 delivers only case, party, and property object types; the unassigned-materials entry is frozen because current data cannot prove concrete party/property ownership. Pagination, long-list scrolling, browser return, triggering-link focus, native link keyboard behavior, responsive layout, three object entrances, and the honest inbox-unavailable state were verified on the current HEAD. Full archive execution/recovery and second-tenant/cross-tenant isolation were not re-verified because TASK-025 did not modify those shared boundaries; they remain shared platform/business regression gaps. Lint, workflow rules, and diff checks passed; typecheck/build hit the local dependency-directory error involving duplicated `@types` names with spaces and are not claimed as passed. All formal roles currently include `record.read`, so the logged-in/no-read page gate is N/A and does not justify inventing a role.
- TASK-027 is Done at the page-migration level. Its Checkpoint A runtime audit was constrained by the shared login/workspace environment and remains historical evidence, not a UX pass. The approved result is the `/clients` List Report: find a customer and decide who to follow up next, while preserving customer/party separation and existing stage, purpose, temperature, follow-up, detail-entry, and create/save semantics. The page migration changed only `/clients`, customer-specific presentation components, and approved List Report/UI Foundation structure; it did not modify auth, permissions, tenancy, database, customer domain logic, `/properties`, TASK-020, or output pages. Shared platform regression items remain outside the page-level completion claim.
- TASK-028 is Done at the page-migration level after a product-approved limited Checkpoint D-Lite. Its evidence archive covers the mutually exclusive case/ledger paths, primary/secondary entry hierarchy, current-task/secondary-content composition, and 1440/768/390 responsive checks. Native link/focusable semantics were checked, but qualified runtime Tab, Enter, and browser-back focus evidence was not obtained; real upload/OCR/save, 422/503 recovery, and complete import closure remain batch-regression items and are not claimed as passed. No new Agent was started for administrative closeout, and `src/app/clients/page 2.tsx` remains untracked and excluded.
- TASK-026 is Blocked as a separate shared-QA-environment preparation task. Two dedicated non-production QA tenants were created through the formal platform account flow and Clerk development invitations were sent. QA A has browser evidence for `TASK025 QA A` and seven synthetic case records with page 2; QA B has no independent workspace evidence yet. Archive/restore and cross-tenant evidence remain outstanding. It may establish only two dedicated non-production tenants, legal Clerk identities using existing roles, synthetic data, normal-path archive/restore, and cross-tenant evidence. It must not modify product code, business models, production data, authentication rules, permissions, or tenant isolation. TASK-025 page-level Checkpoint D no longer depends on TASK-026; TASK-026 remains relevant to shared platform QA and later tasks.
- TASK-006A is the only narrowed candidate business trial in this baseline.
- TASK-013 is Done; implementation, validation, review-fix, and independent read-only review are complete.
- TASK-014 is Done; product-document scope, validation, and independent review are complete with no business-code or page-behavior changes.
- PM-HANDOFF-001接管验证已通过并完成收口；它只记录治理状态，不是业务实施任务，也未单独建立任务卡。
- TASK-016 / MIG-004已完成；当前唯一规范来源为[`PRODUCT_TERMINOLOGY_CANONICAL.md`](docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md)。本次只迁移术语规范来源和相关文档，不修改业务代码或实际界面文案；独立只读审查已通过。
- TASK-015 / MIG-005已完成；本轮只建立三类核心角色 Playbook及其任务治理记录，不修改`AGENTS.md`、业务代码、产品功能或 MIG-006；独立审查 PASS。
- TASK-017 / MIG-006已完成；本轮只清理 `.cursor` 活动规则和高风险 Skill 入口，不修改业务文件、产品范围、架构、术语目录或 MIG-007；真实 Cursor 加载行为仍需人工验证。
- TASK-018 / MIG-007已完成：A 和 B 的实现、独立审查、静态检查和本地端到端浏览器/数据行为门禁已通过；资料处理器失败后的恢复链路已验证，但真实 OCR/外部附件存储、生产登录、生产数据库、双租户真实浏览器隔离和隧道仍需人工验证。治理阶段结束，`main` 是唯一正式开发基线；TASK-019 是下一项普通业务任务。TASK-005/006/007/008 继续暂缓。149 项专业分类已登记为独立朋友测试验收缺口。
- 显式非生产 demo 身份和 `DATA_DRIVER=memory` 下开发服务可启动，公开数据健康检查为 `200 ready`，受保护资料流程可由浏览器完成；`npm start` 的四个探测路由仍为 `503`，首个明确阻断为生产边缘限流启用标志和策略 ID 缺失，其他生产就绪门禁也未满足。真实登录、外部数据库发布状态和隧道行为仍需人工验证。safety/WIP 与 WIP 快照保持冻结。
- TASK-019 已建立为 Ready；其完成前不得关闭安全门禁、开放隧道或向朋友分享地址。
- C+案件总览设计基线已获产品负责人批准；`TASK-020` 已完成实现 Agent 和独立审查 Agent 的顺序执行，静态检查通过。产品负责人提供录屏补充证明桌面动态头部、锚点、章节定位、高亮、更多菜单和局部编辑；录屏发现的重复固定底部操作已删除，中文字段/章节标签已接入 149 项中日对照。TASK-020 仍为 Blocked：键盘、响应式、完整下载状态、数据确认失效、三语言和第二租户隔离尚未取得证据。TASK-019 的真实外部演示门禁仍独立保留，不由 TASK-020 绕过。
- 最新录屏 `录屏2026-08-14 19.12.07.mov` 已登记到 TASK-020：点击“房产”后手动滚回“相关人员”时激活锚点仍停留在“房产”，动态头部切换后返回顶部时锚点栏可能消失。TASK-020 继续 `Blocked`；修复前必须检查唯一滚动容器、动态头部高度、sticky 偏移、`IntersectionObserver`、URL hash 和章节 `scroll-margin-top`，并通过锚点点击、手动滚动、前进后退、带 hash 刷新、键盘、窄屏和头部展开/收起验收。
- 后续页面治理边界已登记：UI-GOV-002A 只建立共享 Token 和基础组件；UI-GOV-003 要求“快速补全”和“案件总览”共享动态头部、模式切换、字段、异常、编辑和反馈组件，案件总览采用三/二/一列，快速补全保留任务队列效率。上述证据和批准完成前，不启动页面批量迁移；UI-GOV-001 保持 Done，不重新打开。
- `UI-GOV-001 / TASK-021` 已 Done。候选 V1 仍只作为后续讨论基线；矩阵已补充 P0 页面类型、唯一主要任务、重复组件、公共组件候选、业务依赖、迁移顺序、截图证据和不可改变的业务能力。`/cases/new` 已按用户任务从 P0 调整为 P1 独立创建分支。本轮未修改 `src/`、数据库、配置或公共资产；未开始全站换皮、批量 CSS 或逐页布局实施。下一步只等待 UI-GOV-002A 批准。
- `TASK-022 / UI-GOV-002A` 已收口：只修改 `globals.css`、`ui-foundation` 基础组件、非导航开发预览 `/ui-foundation-preview` 和治理记录；没有迁移正式业务页面，没有修复 TASK-020 锚点，也没有改变业务流程/数据/权限。仓库没有 Storybook/Ladle；预览入口会进入 Next 构建产物但不进入正式导航，后续可在 UI-GOV-003 前删除或转内部 QA。
- `TASK-022 / UI-GOV-002A` 已 Done：实现 Agent 和独立审查 Agent 按顺序完成并全部退出；独立审查确认 Token/组件范围和预览路由，静态门禁通过；浏览器确认桌面/窄屏无横向溢出、44px 触控控件、CJK 长文本、焦点轮廓、ARIA 错误关联和本地交互。没有正式业务页面差异，下一步只等待 UI-GOV-003 批准。
- `TASK-023 / UI-GOV-003` 的 Checkpoint A 目标图已获产品负责人批准。当前进入 Checkpoint B，只迁移正式 `/cases/[id]` 的已批准共同视觉结构；快速补全继续任务导向，案件总览继续对象导向。TASK-020 的锚点、滚动、焦点和下载确认仍须正式页面真实浏览器证据，不能因 B 代码变化自动关闭；不迁移其他页面、不改变数据/权限/租户/输出语义。
- `TASK-023 / UI-GOV-003` Checkpoint C 收口未通过：正式案件页的模式切换、编辑焦点、锚点点击、390/768 响应式和输出中心入口取得本地证据；手动滚动未同步 hash、键盘锚点未证明、当前 demo 无模板无法完成最终下载确认/数据修改失效；`/ui-foundation-preview` 与 `/ui-gov-003-checkpoint-a` 仍可直接访问且未见会话保护。TASK-023 保持 `In Review`，不启动 UI-GOV-002B；真实 Clerk/第二租户/生产服务只作为发布环境门禁记录。
- TASK-023 授权最小修复已完成：两个开发预览路由移除，`case-overview.tsx` 加入手动滚动 hash 同步，原生锚点语义保持不变。独立审查 Agent 一次性复验确认路由移除通过，但未取得其余三项的修复后独立浏览器闭环证据：手动滚动/hash、键盘聚焦/Enter、隔离模板下载确认及修改后确认失效。因此 TASK-023 仍为 `In Review`，TASK-020 仍独立 `Blocked`，不启动 UI-GOV-002B；不扩大检查范围。
- TASK-023 最终证据收口完成：在不重复启动浏览器复验 Agent 的前提下，补全了包含环境、视口、9 步操作序列、逐步断言、结果和截图映射的回放 JSON；同一独立审查 Agent 静态复核通过，TASK-023 标记 `Done`。隔离模板下载确认及数据修改后的确认失效正式归回 TASK-020；TASK-020 继续 `Blocked`，不启动 UI-GOV-002B。
- TASK-024 / UI-GOV-002B 已 `Done`：阶段 A 目标图、阶段 C 实现和运行闭环收口均完成；响应式、服务端邮编和 Kotoeri IME 三项正式门禁为 `3/3`，独立只读审查已完成。首页仍最后处理，后续不得据此启动全站迁移。
- TASK-024 阶段 A 目标图已提交：只覆盖案件总览“申请人” Responsive Form 的 1440/768/390 视口、正常字段、缺失/冲突字段和局部编辑面板；长期规范已移至 `docs/product/BROKER_DESK_LAYOUT_SYSTEM_V1.md`，迁移矩阵仍保留在 `docs/operations/`。等待产品负责人确认，不进入正式组件实现。
- TASK-024 阶段 A 目标图完成一次修订：普通字段改为网格/留白/轻分隔，当前编辑字段增加选中态，章节取消强制高度，编辑器按 1440/768/390 断点定位；中日韩并排文本仅保留 QA 附图。任务仍 `In Review`，不进入公共组件实现。
- TASK-024 条件批准复审修订完成：仅更新 768px 和 390px 目标图，编辑器改为紧跟选中行/字段，移动端错误信息与按钮分行；桌面目标图不变。等待复审通过后才进入公共组件实现。
- TASK-024 阶段 A 已获批准并进入阶段 C：实现 Agent 与独立审查 Agent 顺序完成并退出；仅新增 `src/components/layout-system/`、修改 `src/components/case-overview.tsx` 的申请人试点。typecheck、lint、build、workflow、字段目录和 diff check 通过。宽屏/768/390 的真实浏览器布局、键盘焦点、保存/取消恢复、CJK 长文本和移动端无横向滚动仍未验证；本地正式案件页被 Clerk 登录门禁阻断，不能标记 Done。
- TASK-024 最终验收收口：已在非生产 Clerk 测试身份下取得 1440/768/390 编辑器位置、单编辑器、无横向溢出、Escape/取消后的焦点与滚动恢复、原值保存持久化、CJK 区域无溢出和下载阻塞反馈证据；直接修复提交为 `46f22d0`，正式 Chrome 响应式、同一 Server Action 六位拒绝/不同七位写入与恢复、Kotoeri 组合输入第一次 Enter 不提交均已通过，正式门禁 `3/3`，独立只读审查已完成。产品裁决明确不要求整页刷新、不把 768px 输入框级测量写成已完成，并保留服务端证据的非连续时间边界。脱敏证据、QA patch、提交元数据和脱敏日志见 `docs/operations/evidence/TASK-024/2026-08-16/`；临时 QA worktree 和本地分支已清理，正式产品未合并 QA 调用器。
- 矩阵 V2 已冻结为 Approved baseline：34 个业务/后台页面族、2 个 Auth Shell 页面族、1 个退役路由、4 个系统状态入口；两个申请书预览路径合并为一个页面族，Workspace Selector 独立登记。规范批准不等于全产品迁移完成；API/QA、历史入口和删除候选不计入正式页面数量。
- W1 已完成 Checkpoint A 真实流程审计、Checkpoint B 目标结构与交互规格批准和 Checkpoint C 最小实现；代码提交 `4e80716` 已通过独立只读审查。Checkpoint D 的长列表、权限、第二租户、安全归档和完整业务回归仍未完成。TASK-020 继续阻塞输出中心和最终预览/下载；首页最后处理。
- 输出中心、正式申请书预览/下载、报价单打印及版权/授权/版本/确认/下载权限/审计规则延期为独立输出产品专题，不阻塞 TASK-025；`/quotes/[id]/print` 保持退役/待决，不恢复、不重定向、不删除。
- TASK-025 最新产品裁决：W1 只保留案件、主体、物件三个可靠对象入口；待归属资料入口、列表、数量和状态徽章冻结。`targetEntity`、案件 `sourceImportJobIds` 和导入处理状态不足以证明具体主体/物件归属；未来恢复待归属能力需独立产品和数据决策，不纳入 TASK-025。`e7aba60` 不能作为最终实现提交。
- No business task is implemented by the pure governance baseline commit.
