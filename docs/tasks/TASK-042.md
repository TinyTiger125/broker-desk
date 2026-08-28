# TASK-042 / UI/UX Design System Wave 0/1

## 任务名称

UI/UX Design System Wave 0/1：页面级组合层与 `/cases/new` 首个模板

- 状态: In Progress

## 权威依据

- 设计与信息架构唯一计划：[`UIUX_DESIGN_SYSTEM_WAVE_0_1_PLAN_2026-08-26.md`](../operations/UIUX_DESIGN_SYSTEM_WAVE_0_1_PLAN_2026-08-26.md)
- 视觉与组件基线：[`BROKER_DESK_LAYOUT_SYSTEM_V1.md`](../product/BROKER_DESK_LAYOUT_SYSTEM_V1.md)
- 业务回归基线：[`TASK-041.md`](TASK-041.md)

本任务只追踪一个 Wave 0/1 专题。计划文件承载完整设计合同；本卡只记录实施状态、写集和门禁，不复制产品合同或逐页过程证据。

## 背景和用户结果

现有页面族存在页面级 Layout System 执行不一致；本专题先用 `/cases/new` 证明统一组合层能够承载案件信息、当前会话草稿和明确的提交操作，同时保留既有 TASK-041 用户行为。

## 本次范围

- 页面级纯组合层：PageFrame、PageHeader、ResponsiveFormShell、FormSection、ActionBar、StateSurface。
- 首个正式模板：`/cases/new`，保持 Case Thread、当前页面会话草稿摘要、低装饰分区、来源感知返回、局部状态、焦点与响应式合同。
- 已批准的 404 locale 最小切片：仅 `not-found`，不扩展到 `error` 或 `global-error`。
- 现有人物/物件创建表单的外部 footer 仍消费真实 pending，避免重复提交；业务 Action、权限、数据与保存合同不变。
- MVP 性能稳定化切片：将 Vercel Functions 固定到与非生产 Neon 数据库相同的新加坡区域，先消除页面导航中跨美东/新加坡的数据库往返；不改变权限、查询语义或数据结构。
- MVP 导航请求收敛切片：主导航不再强制完整预取所有动态认证页面，恢复 Next.js 对动态路由的默认分段预取策略，并为真实导航提供即时 pending 反馈；不引入客户端数据缓存框架，不缓存身份、租户或权限结果。
- MVP 数据读取切片：采用 PostgreSQL 主数据源、数据库侧投影与有界读取、请求级去重、共享缓存后置的经典 SaaS 读架构；第一步仅收口全局搜索，不再为每个关键词读取案件、人物、物件完整可见集合。保留 RequestContext、RLS、公司只读案件标题脱敏和既有搜索返回合同。

## 明确不做什么

- 不修改数据库、migration、Production deployment 或测试基线数据；区域配置只进入非生产 Preview 验证，Production 仍需独立发布授权。
- 不进入 `/cases/[id]` 或其他页面迁移，直到本任务的独立审查、工程门和真实 Staging 证据满足计划要求。
- 不在本切片引入 Redis、共享业务资料缓存、读副本、分片、离线同步或新的客户端数据框架；三类独立列表的数据库侧分页在搜索读模型验证后复用同一架构，不与本次搜索切片并行扩张。
- 不扩大到案件生命周期、Calendar、提醒、共同编辑、附件、关系图、AI 或输出业务。
- `AGENTS.md` 自动生成块、历史未跟踪文件和无关 workflow 差异不纳入写集；Layout 合同门由保留的 `test:layout-system` 与 `package.json` 的 `prebuild` 接线消费，不修改 workflow。

## 依赖关系

- 依赖唯一 Wave 0/1 计划、Layout System V1 和已验收的 TASK-041 业务基线。
- 依赖既有 UI Foundation、globals.css tokens 及现有表单 Action；不依赖 Production 数据或迁移。

## 当前写集

- `package.json`
- `scripts/check-layout-system-contract.mjs`
- `scripts/check-task041-case-association-contract.mjs`
- `scripts/test-task041-case-association-behavior.mjs`
- `src/components/form-submission-lock.ts`
- `src/components/focus-dialog-guards.ts`
- `src/app/cases/new/loading.tsx`
- `src/app/cases/new/page.tsx`
- `src/app/globals.css`
- `src/app/not-found.tsx`
- `src/components/case-association-draft.tsx`
- `src/components/client-form.tsx`
- `src/components/layout-system/index.tsx`
- `src/components/layout-system/layout-system.module.css`
- `src/components/property-responsive-form.tsx`
- `docs/operations/UIUX_DESIGN_SYSTEM_WAVE_0_1_PLAN_2026-08-26.md`
- `docs/tasks/TASK-042.md`
- `BACKLOG.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`
- `vercel.json`
- `scripts/check-production-security.mjs`
- `src/components/main-nav-links.tsx`
- `scripts/check-uiux-remediation-contract.mjs`
- `scripts/check-data-access-performance-contract.mjs`
- `scripts/check-global-visibility-surfaces.mjs`
- `scripts/test-global-visibility-surfaces.mjs`
- `src/app/api/hub/search/route.ts`
- `src/lib/data.memory.ts`
- `src/lib/data.postgres.ts`
- `src/lib/data.ts`
- `src/lib/hub.ts`

## 验收标准

- 组合层保持纯展示/布局职责；`/cases/new` 不复制领域权限、租户或数据逻辑。
- 案件草稿、快速创建、错误恢复、焦点、响应式和三语行为不回归；真实浏览器证据与静态工程门分开记录。
- `/cases/new` loading 边界保留 PageFrame、PageHeader、案件字段、案件草稿身份，并使用 Broker Desk 自身三语 StateSurface；permission/not-found 由服务端路由边界分别定义，不以全局 loading 冒充。
- loading boundary 不显示可点击返回动作，避免在无法读取来源时误导；真实页面解析来源后才显示准确返回。页面内 loading/empty 与路由级拒绝分开：`case.create` 权限失败在渲染前 fail-closed，`tenant_selection_required` 按既有路径重定向工作区并保留 returnTo，其余租户/认证拒绝走安全 not-found。
- P0/P1 为零且工程门通过后，才可考虑下一模板；Production 仍禁止。
- 性能切片以真实 Staging 点击耗时为准：与约 3.6 秒基线比较；区域修复若已取得主要收益，不为追求极限继续扩大数据库重构。
- 主导航不得使用 `prefetch={true}` 强制完整预取动态认证页面；运行日志不得再出现仅因主导航可见而并发完整请求全部主页面的请求放大。导航点击必须立即显示 pending 状态，完整页面数据仍由服务端按既有身份、租户和权限边界读取。
- 全局搜索必须只调用有界的 tenant read model；PostgreSQL 在一个受 RLS 保护的请求上下文中按案件、人物、物件分别投影并限制结果，不允许回退到三个完整列表后再筛选。`Server-Timing` 只记录搜索与总请求耗时，不记录 tenant、关键词、姓名、电话或 SQL 参数。

## 预计涉及的模块

- `src/components/layout-system/`、`src/components/case-association-draft.tsx`、人物/物件表单及 `src/app/not-found.tsx`。
- 现有 Build step、Vercel `npm run build` 生命周期与其专用布局契约脚本；Layout 门不修改 workflow。

## 风险和注意事项

- 静态门不能替代 1440/768/390 的真实渲染、键盘焦点和 Staging 业务回归。
- 表单 footer 必须继续消费真实 pending；移动固定栏预留必须覆盖完整高度和 safe-area。

## 验证命令

```text
npm run test:workflow-rules
npm run test:product-language
npm run test:layout-system
node scripts/check-task041-case-association-contract.mjs
node scripts/test-task041-case-association-behavior.mjs
npm run typecheck
npm run lint
npm run build
git diff --check
```

## 当前状态

- 本轮最新重跑顺序为 workflow → product-language → layout contract → TASK-041 contract/behavior → typecheck → lint → build（含 prebuild 先执行）→ diff check；本地门均通过。并行首轮 typecheck 曾因 `.next` 生成时序读到不完整目录，构建完成后串行重跑已通过。
- lint：0 errors；4 个 warning 均为既有文件/既有代码 warning。
- 前次独立复核提出的移动物件输入门、任务卡治理章节和桌面/768 fixed 栏预留问题已修正；针对最新 P1 的同步提交锁、Escape 实时锁、页面会话说明和 `/cases/new` loading 边界已收口，行为测试已覆盖同一提交事件周期的关闭阻断。当前等待新一轮独立只读复核；真实浏览器证据仍未取得。
- 真实提交、错误恢复、390/768/1440 浏览器运行证据仍未完成，不能将本地门等同于 Preview 或产品验收通过。
- 候选 `380101e` 已标记为 Superseded / Not Deployed；当前重打包候选只撤回 workflow 差异并新增 prebuild 接线。等待工程门与独立只读复核后再进入 Preview；Production 保持禁止。
- 区域候选 `27d57be` 已在固定 Staging READY 并把约 3.6 秒完整导航降至约 3.1 秒。首个导航收敛候选 `6ea302b` 仅恢复框架默认预取，但真实日志仍显示四个主页面同秒 cache MISS，完整导航约 3.13 秒，不能算关闭请求放大。后续严格采用用户意图预取：默认 `prefetch=false`，仅在单一链接 hover/focus 后交还框架分段预取；不在本任务内启用共享权限缓存、实验性 `staleTimes`、全局 Cache Components 或新的客户端数据层。

## 回退

回退为隔离实现工作树的上一已验证提交/版本，不触碰正式 main、脏 checkout 或历史未跟踪文件。
