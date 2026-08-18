# TASK-032 / W7-B Checkpoint A：客户创建/编辑 Responsive Form 只读审计

- 日期：2026-08-18
- 状态：`In Progress` / Checkpoint A 完成，等待产品负责人复审
- 审计方式：当前 `main` HEAD 的仓库代码、迁移文件、治理文档和一次本地启动探测；未修改 `src/`
- 当前 HEAD：`3798fe47dc05bfa6b2ec75c1c15fccdcd37f406b`
- 正式仓库：`/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev`
- 工作区例外：未跟踪的 `src/app/clients/page 2.tsx` 保持原状，未读取修改、未提交、未删除
- 服务探测：`npm run dev -- --port 3002` → `Error: listen EPERM: operation not permitted 0.0.0.0:3002`
- 浏览器项目：`UNVERIFIED`
- 活跃 Agent：`0`；本轮未启动 Agent

## 1. 审计结论

`/clients/new` 与 `/clients/[id]/edit` 使用同一客户事实模型和同一个 `ClientForm` 字段组合，但保留两个页面控制器和两个 Server Action。创建与编辑可以共享字段定义、术语和校验契约，不能把当前不同的成功跳转、错误恢复和返回语义伪装成已经统一。

当前最重要的边界是：阶段、用途、温度是 `clients` 记录中的显式客户业务状态；跟进记录是独立 `follow_ups` 事实，应继续属于客户详情 Object Page 的业务章节，而不是为了 Responsive Form 统一而塞进基本资料表单。新建页的模板/备忘录规则抽取是 UI 辅助和推断，不是权威事实或 AI 审核。

因此本页面族可以作为 Responsive Form 迁移的事实基础，但 Checkpoint B 必须先决定字段分组、默认值、错误返回、单一保存/取消、`returnTo` 和模板/抽取辅助的产品边界；本轮不进入目标设计或实现。

## 2. 审计证据与范围

核对文件：

- `src/app/clients/new/page.tsx`
- `src/app/clients/[id]/edit/page.tsx`
- `src/components/client-form.tsx`
- `src/app/actions.ts` 中 `createClient`、`updateClientProfile`、`updateClientStage`、`addFollowUp`
- `src/lib/domain.ts`、`src/lib/options.ts`
- `src/lib/data.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`
- `db/migrations/20260727_000_baseline_schema.sql`
- `src/lib/client-form-template.ts`、`src/lib/client-intake-parser.ts`
- `/clients` List Report 及 `clients-list-return-state.tsx` 的进入/返回边界
- `/clients/[id]` 仅核对编辑入口和跟进章节边界，不评价其 Object Page 设计

未核对或未迁移：`/clients` 页面本身、`/clients/[id]` Object Page、跟进模型实现、数据库结构修改、权限/认证/租户配置和输出链路。

## 3. 已验证事实

### 3.1 创建与编辑的共同模型及不同流程

| 项目 | `/clients/new` | `/clients/[id]/edit` |
|---|---|---|
| 页面控制器 | 读取 locale 和 GET 辅助参数，构造新建默认值 | 读取 locale、`id` 和当前租户会话，按租户加载既有客户 |
| 表单组合 | 共享 `ClientForm`，`mode="create"` | 共享 `ClientForm`，`mode="edit"`，以客户记录填充 defaults |
| Server Action | `createClient` | `updateClientProfile` |
| 进入链接 | 页头 `/clients`；`/clients` 另有直接新建入口和范围外的快速注册 | 页头 `/clients/{id}`；`/clients` 的主要姓名链接先进入 Object Page，再由其进入编辑 |
| 成功落点 | 默认 `/clients/{id}`；`afterSave=quote` 可去 `/quotes/new`，`afterSave=list` 去 `/clients` | 固定 `/clients/{id}`；没有来源列表参数或 flash 反馈 |
| 取消/返回 | 只有页头返回列表链接，没有取消动作或 `returnTo` | 只有返回详情链接，没有取消动作或 `returnTo` |

创建和编辑共享字段和服务端枚举校验，但创建页额外渲染模板与备忘录抽取辅助；两个 Action 各自解析字段并各自处理成功/审计，尚未形成单一失败恢复契约。

### 3.2 客户字段和权威来源

`Client` 类型、`clients` 表和两条数据适配均保存以下客户事实：

- 姓名 `name`、电话 `phone`、LINE ID、邮箱；
- 预算上下限和预算类型；意向区域及第一/第二希望区域；
- 用途 `purpose`、贷款预审状态、期望入住/运营时间；
- 阶段 `stage`、温度 `temperature`；
- 媒介合同类型及日期、35/37 条日期、个人信息同意日期、AML 状态；
- 下次跟进日期 `nextFollowUpAt`、备注 `notes`；
- `ownerUserId`、`tenantId`、创建/更新时间。

仓库迁移将 `name`、`phone`、`purpose`、`stage`、`temperature` 等列定义为 `clients` 的持久化字段；`budget_type`、贷款、媒介、AML 等有默认值，其他联系方式、区域、日期和备注允许空值。memory 的 `getClientById`、`addClient`、`updateClient` 按 `tenantId` 过滤/写入；PostgreSQL 的 `SELECT`、`INSERT`、`UPDATE` 均带 `tenant_id`，更新使用 `WHERE id = $1 AND tenant_id = $26`。

`CLIENT_STAGES`、`PURPOSES`、`TEMPERATURES` 是域层显式枚举。`createClient`、`updateClientProfile` 和独立的 `updateClientStage` 都对这些值做枚举校验，因此阶段、用途、温度是可保存、可更新的客户业务状态，不是从姓名、用途文案、跟进数量或页面显示推导的标签。

### 3.3 跟进记录边界

`follow_ups` 是独立集合，memory 和 PostgreSQL 的客户详情读取按 `clientId + tenantId` 返回跟进记录；`addFollowUp` 使用独立 Action 写入跟进、审计并返回 `/clients/{id}` 的时间线锚点。`ClientForm` 中的 `nextFollowUpAt` 只是客户记录上的下一次跟进日期，不等于历史跟进记录。

本任务范围只核对 `/clients/[id]` 的导航边界，不审计其 Object Page；不能为了让创建/编辑表单“看起来统一”而把跟进记录列表、跟进新增或时间线章节复制进 Responsive Form。

### 3.4 必填、空值、默认值和非法值

- 页面原生控件把姓名和电话标记为 `required`；两个 Action 也都以 `!name || !phone` 拒绝空值。
- 阶段、用途、温度、预算类型、贷款预审、媒介合同和 AML 均以 GET/表单缺失值补默认值，再通过域枚举校验；创建默认 `stage=lead`、`purpose=self_use`、`temperature=medium`，编辑 Action 缺失字段也回落同样默认值，而不是读取已有值。
- 文本联系方式、区域、期望时间和备注使用 `trim() || undefined`；空字符串因此被保存为 `undefined`（PostgreSQL 适配再写成 `NULL`）。日期通过 `parseDate`，空值为未设置。
- 预算数字使用 `parseNumber(...) || undefined`，因此缺失和非法输入经解析后可能变成 `undefined`，用户明确输入 `0` 也会被 `||` 丢失；当前没有一致的负数/数值范围字段校验。管理费等物件规则不能直接复制到客户字段。
- 服务端非法枚举、姓名/电话缺失均 `throw new Error`；没有结构化字段错误状态、错误摘要或输入保留协议。
- `clients` 表的 `name`、`phone`、`purpose`、`stage`、`temperature` 为非空；联系方式、区域、预算、日期、备注为可空。默认值部分由数据库和 Action 共同提供，实际运行迁移状态未验证。

### 3.5 保存、失败、审计和成功跳转

创建和编辑均要求 `requireTenantSession({ permission: "record.update" })`；编辑还先以 `clientId + tenantId` 读取并检查 `ownerUserId`。创建后调用 `addClient`，写 `client_created` 审计（`targetType="client"`）并按 `afterSave` 跳转；编辑后调用 `updateClient`，写 `client_updated` 审计并固定跳转详情。

两条 Action 都是“先写业务记录，再写审计，再 redirect”。如果审计写入失败，业务写入可能已经存在而没有成功跳转；如果校验或权限失败，Action 抛错并没有页面内错误恢复。创建可额外跳转 `/quotes/new?clientId=...`，这使“保存客户”和“保存并创建提案”成为两个提交意图；编辑没有对应分支。

`updateClientStage` 还可在详情页单独更新 `stage` 并审计，证明 stage 不是仅用于表单展示的计算字段。

### 3.6 草稿、完成度、AI和第二详情

- `/clients/new` 和 `/clients/[id]/edit` 当前未调用 `FormDraftAssist`，也未找到客户表单的本地草稿清理逻辑；没有证据表明客户表单在服务端成功前清除草稿。
- `ClientForm` 没有完成百分比、进度条、剩余计数、章节完成徽章、`ObjectWorkbenchShell` 或 sticky 保存栏。其普通字段按四个章节和一个整体带边框表单呈现。
- 新建页存在“输入辅助模板”和“ヒアリングメモ自动抽取（规则）”：它们通过 GET 参数生成默认值、列出置信度和“推定”原因，用户勾选后才把结果带入表单；没有直接写数据库，但这些 UI 信号不是权威客户状态，也不是 AI 确认。
- 当前编辑页的详情链接进入 `/clients/{id}`；该页面是范围外 Object Page。此审计不把它改写为第二套表单，也不对其详情结构下结论。

### 3.7 返回上下文、列表对照和原生语义

`/clients` List Report 的筛选 URL 当前保存 `q`、`stage`、`purpose`、`temperature`、`sort`、`page`。列表的 `ClientsListReturnState` 使用 `sessionStorage` 记录点击的 `[data-client-link]`、滚动位置并在返回列表时恢复焦点；该监听是 `MouseEvent` click，不等于键盘激活、表单保存后的 `returnTo` 契约。

创建/编辑页均没有读取或校验 `returnTo`，页头返回分别是固定 `/clients` 和 `/clients/{id}`。保存后也没有携带来源筛选、页码、滚动或触发链接标识，因此不能从代码证明浏览器返回上下文可恢复。编辑页没有取消入口；未保存离开没有确认机制。

## 4. 代码推断（不是运行或产品契约）

1. 两页使用同一 `ClientForm` 说明字段组合可以共享，但 Action 内重复解析和默认值会导致未来规则漂移；不能只凭组件复用宣称创建/编辑语义已统一。
2. 模板默认值（例如阶段、用途、温度、下次跟进日期和法律同意日期）是 UI 初始值，不是用户已确认事实；若默认选中或文案突出，用户可能把它理解为系统判断。
3. 备忘录解析用关键词、地名正则和固定置信度推断预算、区域、用途、阶段、温度、AML 和同意日期；这是可解释但非权威的辅助推断。`personalInfoConsentAt` 甚至可由关键词设为当天日期，不能代替真实同意记录。
4. 新建页的“30 秒一次登记”和自动填充准备是效率宣传，不是保存成功、资料完成或客户资格状态。
5. 新建页的两个 submit 按钮意味着表单存在两个后续工作流；若产品要求单一主要保存，提案创建应降级为保存后的次级动作，而不是复制物件表单的字段模型。
6. 缺少结构化 Action 状态意味着服务端错误可能离开表单页面；页面是否有全局错误边界、输入是否保留只能通过运行验证，不能从当前代码推断为已满足。

## 5. 非权威表达、算法和风险

- 模板“自动输入准备/自动填充”及“推荐模板”是默认值辅助，不是客户阶段、用途、温度或合规状态的权威来源。
- 备忘录抽取的“参考度/置信度”、关键词原因、第一/第二希望区域顺序和固定置信度是推断结果；不能升级为客户真实状态、AI审核或确认。
- 解析器把同意关键词转换成当前日期，把整段输入拼成“自动抽取备注”；这不证明用户同意或已人工确认。
- `parseNumber(...) || undefined` 把预算零值与空值混淆，是当前保存契约风险；不得用物件任务的零值规则未经产品决定直接套用。
- `ClientsListReturnState` 只记录点击事件，不能作为完整 Tab/Enter/浏览器返回焦点证明。
- 当前未发现客户创建/编辑页的完成度算法、进度条或第二个表单详情；详情 Object Page 属于范围外，不能在本任务扩大审计。

## 6. 必须保留的客户业务语义和能力

1. `Client` 持久化事实和租户作用域：姓名、电话/LINE/邮箱、预算、意向区域、备注、法定/合同字段及 owner/audit 边界。
2. `stage`、`purpose`、`temperature` 的显式枚举和客户业务含义；不能替换为物件生命周期或页面完成状态。
3. `nextFollowUpAt` 与独立 `follow_ups` 历史的区分；跟进新增、时间线和跟进审计继续留在 `/clients/[id]` 业务章节。
4. `record.update` 权限、租户过滤、owner 检查、现有 `addClient`/`updateClient` 和 `client_created`/`client_updated` 审计链路；不新增第二套保存 API。
5. 创建与编辑不同的初始值、对象存在性和成功落点，但应由产品明确返回/取消契约，不能固定丢失列表上下文。
6. 客户自己的阶段、用途、温度和跟进模型，不得被物件表单迁移中的区域、价格或 lifecycle 术语替代。

## 7. 推荐保留、降级或移出表单的结构

### 推荐保留

- 一个共享的客户字段定义、术语、服务端枚举/空值校验和错误语言；创建与编辑继续保留各自页面控制器。
- 基本联系方式、需求条件、客户状态、合同/法定字段和备注等现有客户事实，按业务阅读顺序分组；不改变数据模型。
- 详情 Object Page 的跟进记录和阶段独立操作边界；表单只处理客户档案字段及明确的 `nextFollowUpAt`。

### 推荐降级

- 模板和备忘录规则抽取只能作为可选输入辅助；默认主流程应安静，不把置信度、推荐或“自动填充”当状态徽章。若保留，必须显示为用户可逐项检查、可拒绝的草稿值，最终仍由表单保存。
- “保存并创建提案”应由 Checkpoint B 决定是否降为保存后的次级动作；不应与唯一客户保存主操作形成两个同等主要按钮。
- 页头返回详情/列表和表单取消应保留不同语义，但需要明确层级和未保存离开风险，不能依赖固定 `/clients` 或 `/clients/{id}` 丢掉来源。

### 推荐移出或冻结

- 任何基于字段填充比例、关键词置信度或默认值生成的客户完成度、AI确认、输出资格和进度表达。
- 将跟进历史、时间线记录或 Object Page 章节复制到创建/编辑 Responsive Form。
- 在本任务中顺手改 `/clients`、`/clients/[id]`、跟进模型、权限、租户、数据库或输出链路。

## 8. 未验证项与证据缺口

以下项目未取得运行证据，统一标记 `UNVERIFIED`：

- 真实登录后的创建/编辑渲染、加载、Not Found、权限拒绝和错误边界表现；
- 1440/768/390 的字段重排、长文本/标签截断和横向溢出；
- 真实 Tab、Enter、IME 组合态 Enter、保存失败后的错误摘要/字段焦点和取消后的焦点；
- 浏览器返回、列表筛选/页码、滚动位置和触发链接焦点恢复；
- 服务端错误是否保留输入、是否重复提交、审计失败后的恢复和成功反馈；
- memory 与 PostgreSQL 的真实创建/更新/读取、迁移应用状态、空字符串/`null`/零值和租户隔离；
- `record.update`、owner 检查、真实权限矩阵、审计落库和跨租户拒绝；
- 新建页模板/备忘录辅助在真实刷新、重复提交、多个标签页或用户明确拒绝后的行为；
- 完整无障碍，包括原生 label 关联、`aria-invalid`、`aria-describedby`、错误摘要、焦点可见性和屏幕阅读器语义。

本轮没有创建、修改、归档或导出客户数据，也没有进入双账号、邀请、第二租户或跨租户循环。

## 9. Checkpoint B 前需要产品负责人决定的问题

1. 创建与编辑的共同字段边界：姓名、电话是否继续同时必填；其余联系方式、预算、意向区域、法定字段、备注和 `nextFollowUpAt` 的分组与可选语义如何表达。
2. 空字符串、`null`、缺失、负数和显式 `0` 在预算/日期/文本字段中的最终保存契约；是否需要保留“空”和“零”的区分。
3. 创建默认的 `stage=lead`、`purpose=self_use`、`temperature=medium` 等是否仅作空表单初始值，还是必须要求用户明确确认；不得把默认值写成系统判断。
4. 模板与备忘录规则抽取是否从默认主流程移出；若保留，是否允许逐项应用草稿值、如何标示推断来源和如何防止同意日期等事实被自动生成。
5. 跟进表单边界：`nextFollowUpAt` 是否留在客户资料表单；跟进记录、内容、类型和下一动作继续只在 Object Page 维护。
6. 创建成功落点是详情、编辑页、列表还是保存后次级提案入口；编辑成功是否留在编辑页；取消和页头返回如何区分。
7. `returnTo` 是否支持带 `q/stage/purpose/temperature/sort/page` 的 `/clients`、`/organize-center?type=client` 或其他已批准内部路径，以及非法/外部路径的回退；是否要求保存后恢复滚动和触发链接焦点。
8. 是否采用统一的服务端错误摘要、字段错误、输入保留、`aria-invalid`/`aria-describedby` 和错误焦点契约；IME/Enter 的具体提交边界需以运行回归验证，不能只写静态承诺。
9. 是否把创建页“保存并创建提案”降为次级动作，避免两个同等级主提交；不得因此修改提案或输出产品专题。
10. PostgreSQL 真实迁移状态、权限和租户隔离由哪个统一批次回归验证；本任务不因环境不可用进入认证排查循环。

## 10. Checkpoint A 停止条件

Checkpoint A 只读审计已完成。未编写目标结构、未修改业务代码、未启动 Agent。等待产品负责人复审；在批准 Checkpoint B 前不进入实现，也不把代码推断写成视觉、响应式、键盘、无障碍或真实保存通过。
