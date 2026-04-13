# Claude.md

## 1. 项目当前定位（已落地）
- 产品名：`Broker Desk`
- 当前版本定位：日本小微不动产业者的轻量业务资料中枢（Web SaaS）
- 核心模块：
  - Dashboard
  - Import Center
  - Properties
  - Parties
  - Contracts
  - Service Requests
  - Output Center
  - Templates / Output Template Settings
- 核心原则：
  - 先保证基础流程与数据可靠
  - AI 作为后续增强层，不作为 MVP 主叙事
  - 输出物标准化与可追溯优先

## 2. 技术架构（当前）
- 前端：Next.js App Router + Tailwind
- 后端：Next.js Server Actions + API Routes
- 数据层：Repository 抽象（`memory` / `postgres`）
  - 统一出口：`src/lib/data.ts`
  - 内存驱动：`src/lib/data.memory.ts`
  - Postgres 驱动：`src/lib/data.postgres.ts`
- i18n：`JA / ZH / KO` 三语统一 IA 与交互模型
- 运行模式：桌面优先，平板/移动可用

## 3. 关键业务能力（已实现）

### 3.1 客户与跟进
- 客户创建 / 编辑 / 列表筛选
- 客户详情时间线
- 跟进记录新增
- 阶段更新（含规则与日志）
- 合规任务与提醒处理

### 3.2 报价与文档输出
- 报价创建 / 复制 / 状态更新
- Output Center 文档生成（提案/估算明细/资金计划/前提条件说明）
- 文档生成记录持久化（generated outputs）
- 输出历史过滤（类型/语言/格式）
- 输出导出 API
- 真实下载接口：`/api/outputs/[id]/download`

### 3.3 导入与附件
- Import Job 创建
- 映射保存 / 自动映射 / 校验处理
- 附件登记（上传或外部路径）
- Import Center 附件历史展示（真实数据）

### 3.4 资产中枢页面
- Properties：快速创建 + 台账视图
- Parties：
  - 快速新增主体（后端 action）
  - focus 选中逻辑
  - 最近文档接真实附件
- Contracts：
  - 行内阶段推进（草稿/有效/完成/重开）
  - 上下文导航强化
- Service Requests：
  - 快速创建
  - 行内状态操作（再开/完成/取消）

## 4. 本轮及近期关键收口（重要）
- 修复 hydration 风险：移除 `layout` 中外链字体 `head link`
- 全站图片从 `img` 切换到 `next/image`
- 修复 CSS `@import` 顺序
- 增加 output download API 并接入 Output Center
- `HubContractItem` 增加 `clientId`，支持合同页直接触发阶段推进
- 顶部搜索框从静态输入变为可提交检索（`/clients?q=`）

## 5. 主要文件变更索引（持续更新）
- 导航/全局：
  - `src/components/app-nav.tsx`
  - `src/app/layout.tsx`
  - `src/app/globals.css`
- 页面：
  - `src/app/page.tsx`
  - `src/app/properties/page.tsx`
  - `src/app/parties/page.tsx`
  - `src/app/contracts/page.tsx`
  - `src/app/service-requests/page.tsx`
  - `src/app/import-center/page.tsx`
  - `src/app/output-center/page.tsx`
  - `src/app/templates/page.tsx`
- 动作与 API：
  - `src/app/actions.ts`
  - `src/app/api/outputs/[id]/download/route.ts`
  - `src/app/api/hub/export/route.ts`
- 数据层：
  - `src/lib/data.ts`
  - `src/lib/data.memory.ts`
  - `src/lib/data.postgres.ts`
  - `src/lib/hub.ts`

## 6. 运行与验证
- 开发：`npm run dev -- --hostname 127.0.0.1 --port 3000`
- 代码检查：`npm run lint`
- 构建验证：`CI=1 npm run build`
- 当前默认本地地址：`http://127.0.0.1:3000`

## 7. 当前已知限制（后续改进项）
- 合同实体仍主要由报价/客户关系派生，独立合同生命周期可继续深化
- 输出下载目前是标准化文本下载（便于联调），后续可切真实 PDF/DOCX 生成
- 更多跨页“工作流引导提示”还可统一成一个引擎（下一阶段）

## 8. 下一阶段建议（优先级）
1. 输出模板中心的版本比对/回滚与 Output Center 强绑定
2. 合同独立实体化（rent/sell/pm/agent）与 service request 追溯闭环
3. 产出物标准格式升级（符合日本业务文书规范）
4. 导入映射的半自动填充与错误恢复机制

## 9. 协作与学习规则（必须执行）
- 每次开发结束后，必须更新本文件：
  - 本次完成了什么
  - 改了哪些文件
  - 验证是否通过
  - 残留问题与下步计划
- 所有“看起来可点”的主要控件必须有真实后端动作或明确可追踪跳转。
- 新增功能优先保证：
  - 三语一致（JA/ZH/KO）
  - 数据可追溯
  - 可导出/可审计

---

## 10. 本次更新记录（2026-03-30）
- 补齐了 Parties / Service Requests / Contracts / Output Center 的多处弱绑定控件。
- 新增输出下载 API，并把历史下载接到真实后端。
- 增加 Import Center 的附件历史真实展示与 job 聚焦。
- 完成 `lint + build` 验证，服务恢复到 3000。

## 11. 本次更新记录（2026-03-30，功能收口）
- Dashboard 新增并显式展示「取込ジョブ状況」模块，改为真实读取导入任务状态，不再复用占位逻辑。
- Dashboard 右侧下方区块改为「対応依頼」真实列表，术语与 IA 统一。
- Import Center 将固定 sample 值替换为真实“源列 -> 目标字段”映射预览，移除硬编码示例值展示。
- Parties 页面清理样例主体/文档文案残留：联系人、时间线日期、附件回退内容改为真实数据或 `未設定`。
- 修复图标文字化风险：改为本地托管 `Material Symbols` 字体（`public/fonts/material-symbols-outlined.woff2`）并在 `globals.css` 显式声明 `@font-face`。
- 回归脚本同步产品术语与真实路径：
  - `サービス依頼` -> `対応依頼`
  - 排除 `/quotes/new`，避免模板回归误取路径。
- 验证结果：
  - `npm run lint` ✅
  - `npm run build` ✅
  - `npm run test:ja-terms` ✅
  - `npm run test:regression` ✅

## 12. 增强层规划总览（讨论版，未执行）
> 说明：以下为产品讨论规划，不进入实施。待用户明确“开始执行设计/开发”后再转为任务。

### 12.1 增强层功能板块（全量清单）
1. 模板治理中心 2.0（版本/差异/回滚/启停/适用范围）
2. 产出物专业化引擎（PDF/DOCX 高标准排版与文控）
3. 导入智能化层（OCR、映射建议、批量纠错、质量评分）
4. 自动化填写引擎（跨实体复用、字段自动补全）
5. 数据质量与合规校验层（格式/逻辑/合规检查）
6. 工作流引导与 SLA 层（步骤引导、超时提醒、优先级）
7. 通知中心（站内 + 邮件/LINE/Slack）
8. 全局检索与关联图谱（跨模块追溯）
9. 报表与经营分析层（运营效率、漏斗、闭环率）
10. 财务/税务输出增强层
11. 权限与审计层（角色权限 + 审计日志 + 回滚）
12. 外部系统集成层（电子签、会计、云盘、Webhook）
13. 移动端效率层（现场录入、拍照上传、扫码关联）
14. AI 增强层（摘要、建议、风险提示、辅助填写）
15. 运维稳定性层（异步任务、重试、监控、备份）

### 12.2 AI 融入原则（讨论共识）
- AI 不接管流程，只增强关键动作。
- 先“建议模式”，再“半自动”，最后“后台代理”。
- 高风险动作必须人工确认（合同关键字段、对外文书核心条款）。
- 全程可审计、可回滚、可解释（来源依据 + 置信度 + 应用记录）。
- 规则引擎优先于模型自由生成（先规则、后模型）。

### 12.3 AI 优先接入点（建议顺序）
1. 导入中心：字段识别、映射建议、缺失提示
2. 自动化填写：实体字段补全与一键应用
3. 输出中心：摘要/说明段落生成与润色（非核心法条）
4. 工作流引导：下一步动作建议与风险提醒
5. 质量与合规：冲突检测与校验建议单

### 12.4 “类 OpenClaw”方向（Agent + Skills）
- 方向判断：可行，且是中长期差异化方向。
- 核心定义：构建“会操作 Broker Desk 的业务代理”，而非聊天机器人。
- Skill 颗粒度：按业务动作拆分（导入、映射、建档、输出、校验、提醒）。
- 执行策略：
  - 优先调用内部 API/Server Actions（稳定、可审计）
  - UI 自动化仅作为 fallback（接口缺失时）
- 必要护栏：
  - 权限边界（能做什么）
  - 审计追踪（做了什么）
  - 可回滚（做错可撤）

### 12.5 未来待确认的 3 个关键参数（讨论项）
1. 首批 AI 接入页面：优先哪 2 个
2. 允许 AI 自动落库的字段范围（白名单）
3. 置信度阈值（低于阈值仅提示不落库）

---

## 13. 本次更新记录（2026-04-01）

### 战略共识（本阶段锁定）
- **AI 增强层全面暂停**：基础功能路通之前，不启动任何 AI 层开发。
- **当前唯一目标**：入（客户管理）和出（提案/文档输出）两条主线功能闭环、稳定可用、体验说得过去。
- **节奏**：持续通过真实用户（李杰明 / Cherry Investment）高频测试 + 反馈驱动迭代。

### Seed 数据更新（Cherry Investment 演示数据）
- 用户：`李 杰明 / lijieming@cherry-investment.co.jp`
- 7 位客户：覆盖 lead → won/lost 全部阶段，含 AML 待处理、合规超期、跟进逾期等典型场景
- 5 条物件：港区・渋谷・世田谷・川崎・文京区
- 5 条报价（seed 后 push 入库）
- 17 条跟进记录、3 条任务、5 条审计日志
- 输出模板：公司名 / 担当者 / 免许番号 均已替换为 Cherry Investment 信息

### Bug 修复
1. **`quote-form.tsx` 默认价格 bug**
   - 问题：初始 `useState` 使用 `properties[0].listingPrice`（¥135M），未选物件时仍预填该值
   - 修复：初始值改为全 `0`，选中物件时通过 `onChange` 注入
   - 文件：`src/components/quote-form.tsx`

2. **Memory 驱动跨请求数据丢失（核心 bug）**
   - 问题：Next.js App Router dev 模式下，server action（POST）和随后页面渲染（GET）可能跑在不同模块上下文，`const db = {...}` 模块级变量在 GET 时重置为 seed，导致新建的 quote/client 等在 redirect 后 404
   - 修复：改用 `globalThis.__brokerDb` 单例模式（Next.js 官方推荐），首次加载写入，后续请求复用
   - seed quote push 改为 `if (db.quotations.length === 0)` 守卫，防止重复 push
   - 文件：`src/lib/data.memory.ts`

### 验证结果
- TypeScript `--noEmit`：✅ 零报错
- 全部 18 个路由返回 200：✅
- 新建提案 → redirect → 提案详情页：✅（globalThis 修复后验证）

### 开发环境说明（重要）
- 主目录（新版 UI）与 git worktree `cranky-elion`（旧版）并存
- Preview 工具始终从 worktree 启服务，**不能用于主目录**
- 主目录服务启动方式：`cd <主目录> && PORT=3200 npm run dev &`
- 当前访问地址：`http://localhost:3200`

### 当前已知限制（下阶段关注）
- 新模块（Properties / Parties / Contracts / Service Requests）无独立详情/编辑页，数据由 hub.ts 从客户+报价派生
- Import Center、Output Center 的 seed 数据为空列表，初次进入无内容展示
- Memory 驱动数据随进程重启丢失（符合预期，Postgres 驱动切换后解决）

## 13. 讨论冻结规则（当前有效）
- 在用户明确发出“可以开始执行设计”或“可以开始开发”前：
  - 不新增实现代码
  - 不改动现有业务逻辑
  - 只做讨论整理、方案对比、文档沉淀

## 14. 产研收敛规则（长期有效）
> 作为未来所有产品/研发讨论的默认规则。目标：不漫无目的扩展，持续收敛。

### 14.1 功能准入标准（做/不做）
- 任一新功能，至少满足以下 5 条中的 3 条，才进入近期范围：
  1. 高频：核心用户每周使用 >= 3 次
  2. 强价值：显著节省时间 / 减少错误 / 提升对外专业度
  3. 可验证：2 周内可观察到量化效果
  4. 低耦合：无需重构全系统即可上线
  5. 可沉淀：能形成可复用规则、模板或数据资产

### 14.2 基础体验线（必须夯实）
1. 导入闭环提速：`导入 -> 映射 -> 校验 -> 可用`
2. 表单自动复用：跨页面自动带出已有字段，减少重复录入
3. 输出文档标准化：文控区 + 必填校验 + 版式统一
4. 错误可修复化：每条错误均附修复入口（可跳转）
5. 三语一致性：结构一致、术语一致、布局稳定

### 14.3 智能化科研线（严格收敛，只做两个试点）
1. 导入映射智能建议（建议模式）
2. 自动化填写建议（建议模式）

### 14.4 智能化护栏（必须遵守）
- 默认不自动落库（先人工确认）
- 必须返回“置信度 + 依据来源”
- 必须可审计、可回滚、可解释

### 14.5 当前明确暂缓项（不进入近期）
1. 通用聊天页 / AI 助手页
2. 全自动 Agent 直接多步写库
3. 法务核心条款自动改写
4. 复杂 OCR 全自动流水线
5. 重分析 BI 看板
6. 原生移动端与大规模外部集成

### 14.6 本阶段北极星指标（讨论与评估统一口径）
1. 首份合格输出物生成时长（持续下降）
2. 人工填写字段数量（持续下降）
3. 输出物退回/修改率（持续下降）

### 14.7 执行前置规则
- 任何新想法先通过 14.1 准入判断，再进入方案讨论。
- 未通过准入的提案默认归档，不进入开发排期。

## 15. 基础功能体验优化（独立项，已确认）
> 状态：已确认方向，进入任务拆解；尚未开始执行开发。

### 15.1 Epic 定义
- Epic 名称：Foundation UX Hardening（基础功能体验优化）
- 核心目标：让核心用户“更快完成、少犯错、不中断、可追溯”。

### 15.2 目标内容（10项）
1. UX-01 导入闭环提速：`导入 -> 映射 -> 校验 -> 可用`
2. UX-02 表单自动复用：跨页面自动带出已有字段
3. UX-03 自动保存与草稿恢复
4. UX-04 全局搜索与跨实体跳转
5. UX-05 批量操作（状态更新/归档/导出）
6. UX-06 输出前质量闸门（必填/文控/格式）
7. UX-07 错误可修复化（错误 -> 修复入口）
8. UX-08 列表状态记忆（筛选/排序/分页/焦点）
9. UX-09 空状态与首用引导
10. UX-10 统一反馈与可撤销

### 15.3 优先级与里程碑（6周）
- P0（必须先做）：UX-01 / UX-02 / UX-03 / UX-04 / UX-05
- P1（第二批）：UX-06 / UX-07 / UX-08 / UX-09 / UX-10
- 里程碑 A（第1-2周）：UX-02 / UX-03 / UX-08
- 里程碑 B（第3-4周）：UX-04 / UX-05 / UX-01
- 里程碑 C（第5-6周）：UX-06 / UX-07 / UX-09 / UX-10

### 15.4 评估指标（固定口径）
1. 首份合格输出物生成时长（持续下降）
2. 人工填写字段数量（持续下降）
3. 输出物退回/修改率（持续下降）

### 15.5 任务清单文档
- 任务级清单：`docs/foundation-ux-tasklist.md`

### 15.6 最近执行记录（2026-03-31）
> 本节用于持续追加“基础体验优化”的实际落地记录，避免讨论与实现脱节。

已完成（本轮集中优化）：
1. 统一操作反馈（UX-10）
   - 新增可复用组件：`src/components/page-flash-banner.tsx`
   - 在以下页面接入成功反馈条（flash）：
     - `properties`
     - `parties`
     - `service-requests`
     - `import-center`
     - `clients/[id]`（任务状态更新）
2. 表单自动保存与草稿恢复（UX-03）
   - 新增可复用组件：`src/components/form-draft-assist.tsx`
   - 已接入表单：
     - 物件快捷创建
     - 主体快捷创建
     - 服务请求快捷创建
     - 导入中心三类任务创建（Excel/PDF/手动）
     - 导入中心附件登记
     - 输出中心文档生成设置
3. 导入中心可操作性增强（UX-01 / UX-07）
   - 补回“导入任务创建入口”（Excel/PDF/手动三卡片）
   - 附件登记补齐完整字段（目标、文件名、外链、MIME、大小、上传）
   - 关键导入动作统一回跳并带状态提示：
     - 创建导入任务
     - 保存映射
     - 自动映射
     - 处理校验告警
     - 登记附件
4. 列表上下文保持（UX-08）
   - 服务请求页面状态切换动作增加 `returnTo`，提交后回到当前筛选上下文
   - 客户详情页任务操作也显式传递 `returnTo`

本轮验证结果：
- `npm run lint` ✅
- `npm run build` ✅
- `npm run test:ja-terms` ✅
- `npm run test:regression` ✅（含本地服务拉起后回归）

下一批建议（仍属于基础层，不进入 AI 增强）：
1. 输出中心“生成后回流”体验：生成后回到输出中心并保留当前筛选/选项（可选保留打印跳转）
2. 导入映射编辑可视化：从“隐藏字段提交”升级为可编辑映射面板
3. 批量操作与撤销：服务请求/合同列表支持批量状态变更 + 最近一次撤销

### 15.7 最近执行记录（2026-03-31 第二轮）
已完成（本轮新增）：
1. 全局搜索与跨实体跳转（UX-04）
   - 新增 API：`/api/hub/search`
   - 新增组件：`src/components/global-search-box.tsx`
   - 导航顶部接入跨实体即时搜索（物件/主体/合同/服务请求/输出物）
2. 服务请求批量操作（UX-05）
   - 新增 action：`batchUpdateServiceRequestStatusAction`
   - 服务请求页面新增批量勾选 + 目标状态一键更新
3. 输出前质量闸门（UX-06）
   - `generateOutputDocumentAction` 增加文档生成前校验规则
   - 缺失项阻断生成并回流到输出中心显示可修复清单
4. 错误可修复化（UX-07）
   - 输出中心新增校验失败清单（按问题码映射三语文案）
   - 通过保留上下文回跳参数，用户可原地修复再提交
5. 空状态与首用引导补强（UX-09）
   - properties/parties/service-requests 增加空列表可读提示与动作入口
6. 列表聚焦与跳转一致性（UX-08）
   - properties/contracts/service-requests 支持 `focus` 高亮行，配合全局搜索落点

本轮验证结果：
- `npm run lint` ✅
- `npm run build` ✅
- `npm run test:ja-terms` ✅
- `npm run test:regression` ✅

### 15.8 最近执行记录（2026-03-31 第三轮 / 基础优化收口）
已完成（本轮新增）：
1. UX-02 表单复用增强
   - `FormDraftAssist` 增加“最近输入复用（reuse）”能力
   - 支持应用/清空最近输入，减少重复录入
2. UX-05 批量操作覆盖扩展
   - Contracts：新增批量状态更新（按选中合同）
   - Properties / Parties / Contracts：新增“选中项 CSV 导出”
   - 导出 API 支持 `ids` 过滤（可选中导出）
3. UX-06 输出质量闸门增强
   - 生成前校验继续强化（按文书类型规则）
   - 审计日志记录文控信息：文档号、模板版本、文档分类、校验结果
4. UX-08 状态记忆增强
   - 新增 `ScrollMemory`，支持页面滚动位置记忆恢复
5. UX-10 可撤销增强（首批）
   - 服务请求状态更新支持“撤销上一步”入口（Undo）

阶段结论：
- 基础功能优化板块已完成本阶段收口，可进入”增强层/AI”规划与实施阶段。

---

## 15.9 执行记录（2026-03-31 第四轮 / Output Center 回流体验）

### 本次目标
修复 Output Center 生成后的上下文保留问题，确保用户在操作过程中（切换类型、调整缩放、完成生成）不丢失已选定的筛选/选项状态。

### 已完成

1. **类型卡片链接补全上下文（改动1）**
   - 文件：`src/app/output-center/page.tsx`
   - 问题：点击切换文档类型卡片时，href 只含 `?type=X`，导致 `format/lang/quoteId/historyType/historyLang/historyFormat` 全部丢失。
   - 修复：链接补全全部当前状态参数，切换类型时其余上下文保持不变。

2. **缩放按钮链接补全上下文（改动2）**
   - 文件：`src/app/output-center/page.tsx`
   - 问题：zoom_out / zoom_in 两个链接缺少 `quoteId` 及三个 history filter 参数，点击缩放会重置筛选器。
   - 修复：两个缩放链接同步补全上述参数。

3. **生成成功后高亮新条目（改动3，主流程）**
   - 文件：`src/app/output-center/page.tsx`
   - 修复：读取 URL 中的 `generatedOutputId`，在历史列表渲染时对匹配条目追加 `ring-2 ring-[#001e40] bg-[#edf2fd]` 视觉高亮，用户生成后立即可定位到该条目。
   - 暂缓：filter 恰好过滤掉新条目的边缘情况，留下一轮处理。

4. **action 回落 URL 补全（改动4）**
   - 文件：`src/app/actions.ts`
   - 问题：`generateOutputDocumentAction` 的 fallback `returnTo` 不含 history filter 参数，异常路径下会丢失筛选状态。
   - 修复：fallback URL 追加 `&historyType=all&historyLang=all&historyFormat=all`，防御性兜底。

### 变更文件
- `src/app/output-center/page.tsx`
- `src/app/actions.ts`

### 验证结果
- `npm run lint` ✅
- `npm run build` ✅（全部 26 个路由编译成功，无警告）

### 残留问题与下步计划
- [x] 边缘情况：生成后若 filter 恰好过滤掉新条目，顶部额外显示该条目 → 已在 §15.10 完成
- [ ] Output Center 第二步：模板版本绑定 + 生成记录与模板版本双向关联（对应 §8 第一条）
- [ ] 导入映射编辑可视化：从隐藏字段提交升级为可编辑映射面板

---

## 15.10 执行记录（2026-03-31 第五轮 / Output Center 边缘情况补全）

### 本次目标
补全 §15.9 暂缓的边缘情况：`generatedOutputId` 存在但被当前 filter 过滤掉时，在历史列表顶部额外渲染该条目并附三语提示。

### 已完成

1. **边缘条目检测（逻辑层）**
   - 文件：`src/app/output-center/page.tsx`
   - 新增 `highlightedOutput`：从全量 `outputs` 中按 `highlightOutputId` 查找对应条目。
   - 新增 `isHighlightFiltered`：判断该条目是否不在当前 `filteredOutputs` 中（即被 filter 过滤掉）。

2. **边缘条目渲染（视图层）**
   - 文件：`src/app/output-center/page.tsx`
   - 当 `isHighlightFiltered && highlightedOutput` 时，在历史列表顶部额外渲染该条目。
   - 样式：`ring-2 ring-[#001e40] bg-[#edf2fd]`（与主流程高亮一致）。
   - 顶部附三语提示标签：`今生成した帳票です` / `这是刚刚生成的文书` / `방금 생성된 문서입니다`。

### 变更文件
- `src/app/output-center/page.tsx`

### 验证结果
- `npm run lint` ✅
- `npm run build` ✅（全部 26 个路由编译成功，无警告）

### 残留问题与下步计划
- [ ] Output Center 第二步：模板版本绑定 + 生成记录与模板版本双向关联（对应 §8 第一条）
- [x] 导入映射编辑可视化 → 已在 §15.11 完成

---

## 15.11 执行记录（2026-03-31 第六轮 / 导入映射编辑可视化）

### 本次目标
将导入映射面板从"隐藏字段静态提交"升级为"用户可见可编辑的源列→目标字段对应面板"。

### 已完成

1. **新增 `targetFieldOptions` 常量（`import-center/page.tsx`）**
   - 按实体类型（properties / parties / contracts / service_requests）定义可选目标字段列表。
   - 与已有 `mappingPlaceholders` 保持字段一致，作为 `<select>` 的 options 数据源。

2. **重构 mapping 保存表单结构（`import-center/page.tsx`）**
   - 原 `updateImportJobMappingAction` 的 `<form>` 从 header 按钮区移除。
   - 新增 `<form id="mapping-form">` 包裹整个映射表格，含 `jobId` / `targetEntity` 隐藏字段。
   - "検証へ進む" 按钮保留在 header 右侧，通过 `form="mapping-form"` 属性与新表单关联，布局不变。
   - autoMap（"下書き保存"）的表单独立不变。

3. **目标字段列从静态 badge 改为可编辑 `<select>`（`import-center/page.tsx`）**
   - 每行增加 `<input type="hidden" name="sourceColumn" value={row.source} />`（保存用）。
   - 原静态 badge + `expand_more` 图标替换为 `<select name="targetField">`。
   - select 默认选中当前已映射字段（`defaultValue={row.target ?? ""}`），未映射时选中 `--未割当--`。
   - 已映射行：蓝色边框背景；未映射行：红色边框背景，与原有视觉语言一致。

4. **action 读取方式更新（`actions.ts`）**
   - `updateImportJobMappingAction` 从 `formData.get("sourceColumns/targetFields")`（单字符串）改为 `formData.getAll("sourceColumn/targetField")`（数组）再 join。
   - 后续 `parseCommaList` 及业务逻辑完全不变。

### 变更文件
- `src/app/import-center/page.tsx`
- `src/app/actions.ts`

### 验证结果
- `npm run lint` ✅
- `npm run build` ✅（全部 26 个路由编译成功，无警告）

### 残留问题与下步计划
- [ ] 目标字段名显示优化（本轮暂缓）：当前 options 显示英文 key，后续可加三语 label 映射
- [x] Output Center 模板版本绑定 → 已在 §15.12 完成

---

## 15.12 执行记录（2026-03-31 第七轮 / 模板版本双向绑定）

### 本次目标
实现文书生成与模板版本的双向可追溯：
- Output Center 历史列表中每条输出可见"使用了哪个模板版本"
- Templates 版本历史列表中每个版本可见"被使用了多少次"

### 关于 Postgres 迁移
**自动执行，无需人工介入。**
`ensureSchema()` 在每次 Postgres driver 首次操作时自动运行，内部通过 `ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS template_version_id TEXT` 安全添加列（已有数据库可重复执行，不报错）。只要连接了 Postgres，迁移在下次请求时自动完成。

### 已完成

1. **数据模型扩展（`data.memory.ts`）**
   - `GeneratedOutput` 类型加 `templateVersionId?: string`
   - `addGeneratedOutput` input 加 `templateVersionId?: string`
   - 写入存储时同步赋值

2. **Postgres driver 同步（`data.postgres.ts`）**
   - `ensureSchema` 加 `ALTER TABLE generated_outputs ADD COLUMN IF NOT EXISTS template_version_id TEXT`（自动迁移）
   - `mapGeneratedOutput` 加 `templateVersionId` 字段读取
   - `addGeneratedOutput` input / INSERT / values 同步扩展
   - 两个 driver 签名与返回字段完全对齐

3. **Action 写入（`actions.ts`）**
   - `generateOutputDocumentAction` 在调用 `addGeneratedOutput` 时传入 `templateVersionId: activeTemplateVersion?.id`

4. **Hub 层扩展（`hub.ts`）**
   - `HubGeneratedOutputItem` 加 `templateVersionId?` 和 `templateVersionLabel?`
   - `listHubGeneratedOutputs` 内加载模板版本列表，构建 `versionLabelMap`，映射每条输出的版本 label
   - 新增 `listHubOutputsByTemplateVersion(versionId, locale)` 供后续筛选使用

5. **Output Center UI（`output-center/page.tsx`）**
   - 历史列表每条记录：`templateVersionLabel` 有值时展示 `layers` 图标 + 版本标签 badge
   - 无版本记录（旧数据）安全降级，不渲染

6. **Templates UI（`templates/page.tsx`）**
   - 导入 `listHubGeneratedOutputs`，并行拉取版本列表 + 全量输出
   - 按 `templateVersionId` 统计每版本的使用次数（`versionOutputCountMap`）
   - 版本历史侧栏：使用次数 > 0 时展示 `N回使用済` / `已使用N次` / `N회 사용됨` 三语文案

### 变更文件
- `src/lib/data.memory.ts`
- `src/lib/data.postgres.ts`
- `src/app/actions.ts`
- `src/lib/hub.ts`
- `src/app/output-center/page.tsx`
- `src/app/templates/page.tsx`

### 验证结果
- `npm run lint` ✅
- `npm run build` ✅（全部 26 个路由编译成功，无警告）

### 阶段总结
§8 第一条（模板版本绑定）已完成。基础层悬挂任务全部清零。
当前可进入下一阶段：增强层功能规划 或 AI 试点接入。

---

## 15.13 下一步计划（2026-03-31 确认）

### 本周行动
- 用 `ngrok` 将本地服务（`127.0.0.1:3000`）暴露给种子用户试用
- 运行命令参考：`npm run dev -- --hostname 127.0.0.1 --port 3000`，配合 `ngrok http 3000`
- 当前数据层：memory driver（进程重启数据清零），种子用户试用阶段可接受

### Postgres 迁移（待定）
- **不在本周执行**，等种子用户试用反馈确认后再决策
- 迁移本身已就绪（`ensureSchema` 自动执行），切换只需设置两个环境变量：
  - `DATA_DRIVER=postgres`
  - `DATABASE_URL=<连接串>`
- 迁移触发时机：任何 postgres 路径下的首次请求，自动完成，无需人工 SQL

### 试用期间重点观察
1. 核心流程是否跑通（导入 → 映射 → 生成输出）
2. 用户卡在哪个步骤（对应 UX-01 导入闭环）
3. 哪些字段被反复手动填写（对应 UX-02 表单复用价值验证）
4. 输出文书质量反馈（是否需要优先升级 PDF/DOCX 真实生成）

### 后续排期（试用反馈后决定）
- Postgres 迁移上线（数据持久化）
- 增强层优先级确认（§12.3 AI 接入点选择）
- 目标字段名三语 label 优化（§15.11 暂缓项）

---

## 16. Claude 项目观察与开发规范沉淀（2026-03-31，初次全盘阅读后）

### 16.1 整体判断

项目结构清晰，工程化意识强，节奏感好。在没有测试框架的情况下通过回归脚本 + lint + build 三重卡口维持了较高代码质量。Foundation UX Hardening 10 项已全部落地，是本阶段的真实成果。

目前处于**基础收口已完成、增强层尚未启动**的关键窗口期，这是进行技术债清理和方向对齐的最佳时机。

### 16.2 技术层观察（重要）

1. **数据层风险**：`src/lib/data.ts` 默认走 memory driver，进程重启即数据清零。本地开发问题不大，但在任何 demo / staging 场景下都必须先切 Postgres。切换只需设 `DATA_DRIVER=postgres` + `DATABASE_URL`，但目前没有任何保护层阻止”忘记切换”。
   - 建议：在 Dashboard 或健康检查接口加 `[DATA: MEMORY]` 警告标识。

2. **类型安全妥协**：`data.ts` 中 `postgres as unknown as typeof memory` 是有意识的 cast，说明两个 driver 的类型签名尚未完全对齐。这不是 bug，但未来扩展时需注意 postgres driver 新增方法要同步到 memory driver，否则运行时会静默 undefined。

3. **没有测试框架**：只有 shell 脚本 (`regression.sh` / `check-ja-terms.sh`)，没有 Jest/Vitest 单元测试。对于业务逻辑（如 `compliance-alerts.ts`、`workflow-engine.ts`、`output-doc.ts`）这是一个潜在风险点，建议在增强层启动前至少为核心计算逻辑加轻量单元测试。

4. **Next.js 版本**：当前使用 `16.1.6`（非常新），配合 React 19 + Tailwind v4。注意这些版本都相对前沿，社区 bug 修复周期可能短。遇到框架层奇怪问题要优先确认版本兼容性。

5. **无鉴权层**：当前没有用户登录/权限体系，`getDefaultUser()` 返回硬编码用户。这是已知的 MVP 简化，但进入增强层后，特别是任何涉及”谁操作了什么”的审计逻辑都依赖用户身份，需提前规划。

### 16.3 产品层观察

1. **合同实体仍是派生态**：`Contracts` 页面实际上是从客户/报价关联出来的视图，不是独立实体。这意味着”合同本身的生命周期”（续签、变更、到期预警）目前无法独立管理。这是 §7 和 §8 中已知的限制，但要注意它会直接阻碍后续的工作流引导和 SLA 层建设。

2. **输出物是文本模拟**：`/api/outputs/[id]/download` 下载的是格式化文本，不是真实 PDF。对于日本小微不动产业者，**对外文书的排版规范性是专业度的核心感知点**，这是增强层中”产出物专业化引擎”优先级高的真实原因。

3. **i18n 覆盖质量**：三语（JA/ZH/KO）结构是对的，但从代码看 JA 是主语言，ZH/KO 是跟随。在真实部署时需确认非日语界面的文案完整性（不能有日语 fallback 出现在中韩界面）。

4. **全局搜索已落地**：`GlobalSearchBox` + `/api/hub/search` 是本轮亮点。但搜索结果的”落点跳转”（`?focus=id`）需要每个列表页显式支持，目前已覆盖 properties/contracts/service-requests，Parties 和 Import Center 的 focus 支持需确认。

### 16.4 我的开发原则（围绕本项目长期有效）

1. **不动已验证的数据层**：data.ts / data.memory.ts / data.postgres.ts 是稳定基础，改动前必须确认两个 driver 同步更新。
2. **每次改动都要跑四步验证**：`lint` → `build` → `test:ja-terms` → `test:regression`，顺序不可跳过。
3. **新组件优先放 `src/components/`，可复用性是判断标准**：如果某组件只服务一个页面，优先内联在页面文件。
4. **Server Action 是操作的唯一入口**：不绕过 actions.ts 直接操作数据层，保证审计可追溯。
5. **三语文案先写 JA，再补 ZH/KO**：从 `src/lib/i18n.ts` 统一维护，不允许页面内硬编码中文或日文字符串（除非是纯 UI 标签且已在三个地方同步）。
6. **增强层功能上线前必须通过 §14.1 准入判断**：不因”看起来很有用”就跳过准入评估。
7. **AI 相关功能只做”建议模式”试点**：不在本阶段让 AI 直接写库，必须有人工确认中间层。

### 16.5 当前待处理的悬挂任务（未完成但已讨论）

以下三项来自 §15.6 末尾的”下一批建议”，当前状态如下：
- [x] 输出中心”生成后回流”体验（保留筛选上下文）【已在 §15.9 / §15.10 落地】
- [x] 导入映射编辑可视化（从隐藏字段提交升级为可编辑面板）【已在 §15.11 落地】
- [ ] 批量操作撤销：服务请求/合同列表最近一次 Undo（已完成服务请求 Undo，合同侧待补齐）

以下来自 §8（下一阶段建议），属于中期目标：
- [ ] 输出模板版本比对/回滚与 Output Center 强绑定
- [ ] 合同实体独立化（rent/sell/pm/agent）
- [ ] 产出物标准格式升级（真实 PDF/DOCX）
- [ ] 导入映射半自动填充与错误恢复

## 17. 执行记录（2026-03-31 / Contracts 时间线重复 key 修复）

### 问题
- Contracts 页面出现 React 警告：`Encountered two children with the same key '5月'`。

### 根因
- 时间线月份生成逻辑基于“今天日期 + i 月”的 `setMonth` 写法。
- 当当天是月末（如 31 号）时，跨到短月会发生日期溢出，导致月份跳跃/重复（例如出现两个 `5月`）。
- 同时图表节点使用 `key={month}`，在重复月份时触发重复 key。

### 修复
- 文件：`src/app/contracts/page.tsx`
- 变更：
  1. 时间线日期生成改为固定锚点：`new Date(now.getFullYear(), now.getMonth() + i, 1)`，避免月末溢出。
  2. 时间线节点 key 改为复合 key：`${month}-${year}-${index}`，确保渲染键稳定唯一。

### 验证
- `npx eslint src/app/contracts/page.tsx` ✅
- 页面刷新后不再出现重复 key 警告。

---

## 18. 产品经理约束圣经（2026-04-13 新增，最高优先级约束）

> 来源：与产品经理的收敛讨论结论。  
> 适用范围：后续所有产品讨论、技术设计、开发排期与功能准入。  
> 约束级别：高于“灵感型提案”和“功能完备型冲动”，低于法律合规与数据安全硬约束。

### 18.1 文档目的
这不是灵感备忘录，也不是功能脑暴清单。  
这是一份用于约束后续设计、开发、讨论和取舍的产品规则文档。目标只有一个：

**防止 Broker Desk 在看起来越来越完整的过程中，逐渐失去真正的商业价值与执行聚焦。**

从现在开始，所有新功能、新页面、新增强层、新 AI 想法，都必须先经过本节判断，再决定是否进入设计或开发。

### 18.2 当前阶段真实判断
Broker Desk 当前最接近的形态是：

**面向日本小微不动产业者，围绕“资料整理、信息归档、文书生成、输出追溯”主线构建的轻量工作台。**

当前最有价值的不是“模块数量、架构完整、AI 叙事”，而是：

**能否把分散资料更快整理成可追溯、可输出、可对客展示的专业业务文书。**

### 18.3 主叙事收敛（替换旧叙事）
不再作为主叙事：
- 轻量业务资料中枢
- 不动产一体化工作平台
- 日本地产 SaaS 基础设施
- AI 驱动的不动产业务系统
- 面向全流程的智能业务中台

允许使用的主叙事：

**Broker Desk 帮助日本小微不动产业者，把分散资料快速整理成可追溯、可标准输出的专业业务文书。**

短句版本：

**让小微不动产从“资料散、输出慢、文书乱”变成“整理快、输出稳、可追溯”。**

### 18.4 当前仅承认的两条主线
#### A. 资料导入与整理
目标：不是“导入成功”，而是 **导入 -> 映射 -> 校验 -> 变成可用资料**。

判断标准：
- 能否快速导入 Excel / 手工资料 / 附件
- 错误是否可见
- 是否可立即修复
- 修复后是否能继续流程而非卡住

#### B. 文书输出与追溯
目标：不是“能下载文件”，而是 **生成专业、稳定、可回查来源的输出物**。

判断标准：
- 输出前是否有质量闸门
- 输出后是否可追溯
- 模板版本是否可见
- 谁在何时基于何资料生成是否可审计
- 文书是否达到“可对客展示”的专业度

### 18.5 北极星指标（唯一评估口径）
后续不再用“功能数/页面数”衡量进展，仅看：
1. 首份合格输出物生成时长是否下降
2. 人工重复填写字段数量是否下降
3. 输出物退回/修改率是否下降

任何需求评估必须回答：
**它改善这三个指标中的哪一个？**

### 18.6 核心价值判断：不是“全”，而是“顺”
当前优先投资：
- 导入映射可见化
- 错误可修复化
- 跨页面字段复用
- 输出前校验
- 模板版本绑定
- 输出历史与追溯
- 真实 PDF/DOCX 专业化

当前不优先：
- 聊天入口
- 通用 Agent
- 炫技式 AI 解释
- 重 BI 看板
- 重权限体系
- 低频边缘模块

### 18.7 三大风险
1. 叙事过宽 -> 开发扩张 -> 模块多但价值分散
2. 工程成熟快于商业卖点成熟 -> “系统好但购买理由弱”
3. AI 诱惑过强 -> 看起来高级但不提升成交与留存

结论：AI 不能抢主叙事，不能脱离主线独立扩张。

### 18.8 近期唯一允许持续强化的能力区
1. 导入闭环能力（创建、映射、校验、修复、附件关联）
2. 表单与资料复用能力（自动带出、草稿恢复、跨页复用）
3. 输出专业化能力（质量闸门、版本绑定、追溯、PDF/DOCX）
4. 错误修复路径能力（明确原因、修复入口、上下文回流、撤销）

### 18.9 近期默认不做（未经准入复审）
- 通用聊天页
- 通用 AI 助手页
- 全自动 Agent 跨模块写库
- 法务核心条款自动改写
- 重型 BI
- 原生移动端
- 大规模第三方集成
- 大而全权限体系
- 为“完整感”补低频页面
- 炫技型 AI 功能

### 18.10 Contracts 战略二选一（禁止长期中间态）
路线 A：合同升格为独立核心实体（生命周期、续签、变更、预警、强关系）。  
路线 B：合同保持配角，服务于输出与追溯，不再承诺全流程业务系统。

当前阶段默认保持：
- **以输出与追溯为中心**（未进入合同全面实体化改造前，不扩展重生命周期承诺）。

### 18.11 输出物优先级上调（冲突时优先）
当优先级冲突时，优先回答：

**该事项是否直接提升输出物的专业度、可靠性或可追溯性？**

若是，优先级上升。

### 18.12 AI 的唯一正确位置（本阶段）
只允许：
1. 导入阶段建议模式（字段识别、映射建议、缺失提示、可疑提醒）
2. 填写阶段建议模式（补全建议、说明建议、冲突提醒）

AI 护栏：
- 默认不自动写库
- 先建议后确认
- 显示依据来源
- 可回滚
- 可审计
- 高风险内容不交由 AI 决策

禁止方向：
- 聊天即入口
- AI 自主决定做什么
- 一次执行多步写库
- 改写关键法务条款
- 代替模板系统

AI 当前价值定义：

**减少人工整理与填写成本。**

### 18.13 技术现实约束（执行层）
1. Memory driver 仅可内部联调；对外稳定试用必须 Postgres。
2. 无真实身份无法支撑完整审计；需规划最小身份体系。
3. 无业务单测会放大增强层风险；质量闸门/输出规则需逐步补单测。

### 18.14 功能准入规则（强制）
五问筛选：
1. 是否属于导入整理或输出追溯主线
2. 是否改善三项北极星之一
3. 是否高频动作
4. 是否无需重构全系统
5. 是否沉淀可复用规则/模板/数据资产

准入标准：
- 满足 >=3 条，才进入近期范围
- 满足 1-2 条，默认归档
- 无法回答主线价值，直接否决

额外否决条件：
- 价值主要来自“看起来高级”
- 难在 2 周内验证
- 明显诱发边界扩张

### 18.15 当前推荐路线（1-2 版本）
近期重点：
1. 稳定导入闭环
2. 强化字段复用与错误修复
3. 升级输出物专业度
4. 强化模板/版本/历史追溯链路
5. 切换稳定持久化与最小身份能力

暂不追求：
- 大而全覆盖
- AI 炫技
- 平台化叙事
- 全自动代理
- 重生态整合

### 18.16 开发硬规则（执行前自检）
1. 不为“完整感”新增低频页面
2. 不为“智能感”加入无验证 AI
3. 不为“技术洁癖”拖延商业关键项（输出物/持久化/身份/追溯）
4. 未证明主线价值前，不横向扩张
5. 每次改动必须回答：

**这次改动是否让“资料 -> 专业输出物”链路更短、更稳？**

若回答不清楚，暂不开发。

### 18.17 最终判断（作为阶段共识）
Broker Desk 值得继续做，但不会靠“功能越来越多”或“AI 越来越强”获胜。  
唯一胜法：

**把日本小微不动产业者最繁琐、最易出错的资料整理与文书输出，做得更快、更稳、更专业。**

从现在开始，所有开发都必须服从这个目标。


---

## 19. 协作策略升级：持续需求访谈机制（2026-04-13 生效）

> 目标：Codex 不仅执行开发，还在每个阶段主动进行“需求访谈 + 反证提问”，持续校准方向，确保和产品初衷同频。

### 19.1 角色升级（执行 + 访谈双角色）
从本节生效后，Codex 的职责包含两部分：
1. **开发执行者**：落地需求、修复问题、验证结果。
2. **需求访谈者**：持续提问、质疑假设、暴露风险、推动共识收敛。

### 19.2 每轮交互默认流程（强制）
每一次进入新任务时，按以下顺序执行：
1. **复述目标**：一句话确认本轮要解决的业务目标。
2. **访谈提问**：提出 2-5 个关键问题（含至少 1 个反证问题）。
3. **收敛结论**：把答案转成明确的开发约束（做什么/不做什么）。
4. **执行开发**：按收敛结果落地实现。
5. **回报验证**：输出结果 + 未决风险 + 下一轮访谈问题。

### 19.3 问题类型配比（避免“只问不做”）
每轮提问应覆盖以下类型：
- 价值问题：这件事改善哪一个北极星指标？
- 边界问题：这是否诱发边界扩张？
- 反证问题：如果不做这个，会损失什么？
- 证据问题：是否有用户行为/流程证据支持？
- 风险问题：失败模式是什么，如何可回滚？

### 19.4 提问原则（防止空转）
- 不为了提问而提问：问题必须服务于“更快收敛、更稳执行”。
- 不做开放式发散：优先提出可决策的问题。
- 不阻塞开发：无法立即回答的问题，先做可逆实现并标记假设。
- 不脱离主线：所有问题必须围绕“导入整理 + 输出追溯”。

### 19.5 与当前产品约束的一致性
该机制必须服从 §18 的所有约束，尤其是：
- 功能准入五问（§18.14）
- AI 护栏（§18.12）
- 输出物优先级（§18.11）

### 19.6 本机制的衡量方式
若机制有效，应出现以下结果：
1. 需求返工次数下降
2. 偏离主线的提案进入率下降
3. 单次迭代“结论清晰度”提升
4. 北极星指标关联说明更加明确

### 19.7 执行口令
从现在开始，若用户未特别说明“只执行不提问”，则默认启用本机制。


## 20. 执行记录（2026-04-13 / 访谈驱动开发：Contracts Undo + Output 修复入口）

### 本轮访谈决策输入
- 用户确认决策：`1D 2D 3D 4A 5A`
  - 指标优先：A+B（首份合格输出时长 + 重复填写减少）
  - 验收产物：输出链路可演示 + 合同侧 Undo 补齐
  - 硬禁区：不做视觉大改
  - 节奏：可逆快迭代
  - 合同策略：保持配角，服务输出与追溯

### 已完成改动
1. **Contracts 批量状态更新新增可撤销（Undo）闭环**
   - `batchUpdateContractStatusAction`：在批量更新前记录每个 client 原 stage，更新后通过 URL 回传 `undoClientIds/undoStages`
   - 新增 `undoContractBatchStatusAction`：支持按 client 列表恢复原 stage，并记录审计日志
   - Contracts 页面接入 Undo 提示条与回滚按钮（JA/ZH/KO）
   - 新增 flash：`contract_batch_undone`

2. **Output Center 输出前问题新增“直达修复入口”**
   - 在缺失项提示区新增 `quickFixLinks`
   - 典型修复路径：
     - 提案字段缺失 -> 跳转提案编辑页
     - 目标物件缺失 -> 跳转物件台账
     - 目标主体缺失 -> 跳转关系者台账
   - 目标：缩短“发现问题 -> 修复 -> 再生成”链路

### 变更文件
- `src/app/actions.ts`
- `src/app/contracts/page.tsx`
- `src/app/output-center/page.tsx`

### 验证说明
- 由于本机当前存在长期的 dev/build 命令无回显问题（`next dev` 进程存在但端口未就绪），本轮暂未完成完整自动化验证回执。
- 已完成人工静态检查与关键路径代码复核；待环境恢复后优先补跑：
  1. `npm run lint`
  2. `CI=1 npm run build`
  3. `npm run test:regression`

### 与 §18 收敛原则一致性
- 本轮改动均属于主线：
  - 输出链路修复效率（错误可修复化）
  - 关键状态操作可撤销（降低操作风险）
- 无新增低频页面，无视觉重构，无 AI 扩张。


## 21. 执行记录（2026-04-13 / Git 链路修复 + Key 稳定性收口）

### 21.1 Git 链路修复（已完成）
- 背景：本地仓库曾出现元数据异常与远端历史不连续，`push` 受阻。
- 处理策略：
  1. 旧 `.git` 做外部备份（避免不可逆风险）
  2. 远端 `main` 作为基线对齐
  3. 将本地有效改动精确迁移为单独提交
  4. 重新 `push -u origin main`
- 结果：
  - 远端仓库已成功同步（`origin/main`）
  - 当前分支跟踪关系已建立
  - 后续可按常规 `commit + push` 持续迭代

### 21.2 前端小 Bug 收口（本轮）
- 目标：降低 React 列表渲染的重复 key 风险，减少运行期告警噪声。
- 改动点：
  1. Dashboard 导入任务列表：`key` 从 index 改为稳定实体 id
  2. Output Center 问题清单：`key` 改为 `index + msg` 组合
  3. Import Center Excel 预览与映射：
     - 表头 key 增加 index 前缀
     - 单元格 key 增加行列坐标
     - 映射行 key 增加 index 前缀
     - 跳过列表 key 增加 index 后缀
- 变更文件：
  - `src/app/page.tsx`
  - `src/app/output-center/page.tsx`
  - `src/app/import-center/page.tsx`

### 21.3 验证与环境说明
- 当前 CLI 环境存在长期进程锁/无回执问题（`next dev` / `eslint` / `tsc` 在本地工具链中易出现假启动或长时间挂起）。
- 已完成：
  - 静态代码审阅与关键路径比对
  - 运行进程与 lock 问题定位（`.next/dev/lock` 冲突）
- 待补（在稳定终端环境优先执行）：
  1. `npm run lint`
  2. `CI=1 npm run build`
  3. `npm run test:regression`

### 21.4 与收敛规则一致性
- 本轮不新增页面、不扩展边界、不引入 AI 能力。
- 仅做“稳定性 + 可维护性”修补，服务于主线：
  - 降低调试噪声
  - 保证协作链路（Git）可靠

### 21.5 构建根目录修正（next.config）
- 问题：Next 16 在本机检测到多个 lockfile 时，曾将 workspace root 误判到用户主目录。
- 处理：在 `next.config.ts` 中使用 `import.meta.url` 明确计算项目根目录，并设置：
  - `outputFileTracingRoot`
  - `turbopack.root`
- 目的：避免错误的根目录推断导致过宽扫描与不稳定行为。
