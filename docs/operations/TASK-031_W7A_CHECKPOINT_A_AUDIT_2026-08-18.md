# TASK-031 / W7-A Checkpoint A：物件创建/编辑 Responsive Form 只读审计

- 日期：2026-08-18
- 状态：`In Progress` / Checkpoint A 完成，等待产品负责人复审
- 审计方式：当前 `main` HEAD 的仓库代码、治理文档和一次本地启动探测；未修改 `src/`
- 当前 HEAD：`bfa0cec5d2896d33a697376f85fdf6ac1c60b63e`
- 浏览器项目：`UNVERIFIED`
- 服务探测：`npm run dev -- --port 3002` → `Error: listen EPERM: operation not permitted 0.0.0.0:3002`
- 工作区例外：未跟踪的 `src/app/clients/page 2.tsx` 保持原状，未读取修改、未提交、未删除

## 1. 审计结论

`/properties/new` 与 `/properties/[id]/edit` 使用同一组物件字段和同一物件数据模型，但当前不是同一个表单实现，也不是同一保存/返回契约：

- 新建页调用 `createPropertyQuickAction`，空名称会生成默认名称，提供“保存”与“保存并去物件列表”两个提交分支，并挂载本地 `FormDraftAssist`；
- 编辑页调用 `updatePropertyProfileAction`，强制名称非空，只有一个保存按钮，固定回到当前编辑页并显示 flash；它使用 `ObjectWorkbenchShell`、三张字段卡、章节进度和完成度算法；
- PostgreSQL 适配文件没有导出 `getPropertyById` 或 `updateProperty`，而 `src/lib/data.ts` 的代理会在 PostgreSQL 驱动下调用这两个同名方法。编辑页的数据库读写能力因此不能按当前代码假定成立；本轮不修复，只登记为 Checkpoint B/C 前的技术事实；
- 新建和编辑都没有明确的服务端字段错误呈现、保存失败焦点恢复或来源列表上下文参数。新建草稿在任何 submit 事件时先清除，失败时可能丢失本地恢复内容。

因此当前页面族不能直接作为已批准的 Responsive Form 迁移基础。下一步必须先由产品负责人在 Checkpoint B 决定字段/空值/错误/返回/草稿语义，再由技术范围解决 PostgreSQL 读写适配缺口；本轮不进入设计或实现。

## 2. 证据和范围

本审计核对：

- `src/app/properties/new/page.tsx`
- `src/app/properties/[id]/edit/page.tsx`
- `src/app/actions.ts` 的 `createPropertyQuickAction`、`updatePropertyProfileAction`、`setRecordLifecycleAction`
- `src/lib/data.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`、`db/migrations/20260808_001_record_lifecycle.sql`
- `src/components/form-draft-assist.tsx`、`src/components/object-workbench-shell.tsx`
- `src/components/layout-system/`、`src/components/ui-foundation/`
- `docs/product/BROKER_DESK_LAYOUT_SYSTEM_V1.md`、`docs/tasks/TASK-024.md`、当前 `/properties/page.tsx`

本轮未读取或修改其他 W7/W8 页面，也未执行真实提交、归档、取消、导出或跨租户操作。

## 3. 已验证事实

### 3.1 页面入口和创建/编辑分支

| 项目 | `/properties/new` | `/properties/[id]/edit` |
|---|---|---|
| 页面读取 | 只读取 `locale`、`record.update` 会话和 `from` 查询参数 | 读取 `locale`、`record.update` 会话、`id`，并按租户读取物件 |
| 主要表单 Action | `createPropertyQuickAction` | `updatePropertyProfileAction` |
| 返回链接 | 默认 `/organize-center?type=property`；`from=entry` 时 `/import-center` | `/organize-center?type=property&focus={id}` |
| 成功后 | `afterSave=organize` → `/organize-center?type=property&focus={id}`；其他值 → `/properties` | 固定重定向回 `/properties/{id}/edit?flash=property_updated` |
| 草稿 | `FormDraftAssist`，`draft:properties:new` 和 `reuse:properties:create` | 没有 `FormDraftAssist` 或其他草稿恢复逻辑 |
| 页面结构 | 一个带边框/背景的表单，两个字段区 | `ObjectWorkbenchShell` 左侧进度区 + 右侧三张字段卡 + sticky 保存 |

来源：`src/app/properties/new/page.tsx:70-151`、`src/app/properties/[id]/edit/page.tsx:122-270`、`src/app/actions.ts:1558-1692`。

### 3.2 字段、模型和 lifecycle

当前两页涉及的字段如下：

- 物件名称 `name`：新建和编辑都有；编辑有 HTML `required`，新建没有；
- 区域 `area`：两页都有；字段名和物件模型一致；
- 所在地/地址 `address`：两页都有；新建描述写“所在地”，编辑中文写“地址”；
- 面积 `sizeSqm`：新建放在基本信息区，编辑放在“面积与补充说明”；
- 售价 `listingPrice`：新建和编辑都有；底层模型为必需数字；
- 管理费 `managementFee`、修缮费 `repairFee`：新建和编辑都有，可选数字；
- 备注 `notes`：只有编辑页提交；新建页没有输入，也没有传给创建 Action；
- `lifecycle`：不属于新建或编辑表单；归档/恢复由列表行的 `ArchiveRecordButton` 调用统一 `setRecordLifecycleAction`。

`src/lib/data.memory.ts:147-163` 的 `Property` 类型包含上述字段及 `lifecycleStatus`、归档字段；内存 `addProperty`/`updateProperty` 写入同一模型（`src/lib/data.memory.ts:3619-3670`）。PostgreSQL `mapProperty` 读取 `area/address/size_sqm/listing_price/management_fee/repair_fee/notes` 和 lifecycle（`src/lib/data.postgres.ts:376-392`），`addProperty` 插入这些字段（`src/lib/data.postgres.ts:4351-4384`）。

仓库迁移 `db/migrations/20260808_001_record_lifecycle.sql:1-23` 为 `properties.lifecycle_status` 提供 `NOT NULL DEFAULT 'active'` 的迁移契约，并维护 lifecycle 索引；数据库是否已应用该迁移仍未取得运行证据。页面没有把 lifecycle 当作表单字段，这与当前列表归档边界一致，但是否允许编辑页修改它需由产品在 B 决定。

### 3.3 保存契约、权限和审计

**创建：** `createPropertyQuickAction` 要求 `record.update` 会话，使用会话租户和用户；名称为空时使用 locale 默认值“新規物件/新物件/신규 매물”；`addProperty` 后写 `property_created` 审计，targetType 为 `compliance`；重新验证 `/properties`、首页、`/output-center`、`/organize-center`，按 `afterSave` 重定向并带 `property_created` flash（`src/app/actions.ts:1558-1612`）。

**编辑：** `updatePropertyProfileAction` 同样要求 `record.update`，先按 `propertyId + tenantId` 读取现有物件；名称为空直接抛出 locale 错误；更新后写 `property_updated` 审计，targetType 为 `property`，重新验证编辑页、`/properties`、`/organize-center`、`/output-center` 和首页，固定回编辑页并带 `property_updated` flash（`src/app/actions.ts:1615-1692`）。

**统一能力：** 归档/恢复使用 `record.archive`、租户作用域、`setPropertyLifecycleStatus` 和 `record_archived`/`record_restored` 审计；这不属于当前表单提交（`src/app/actions.ts:330-383`、`src/components/archive-record-button.tsx:50-73`）。

### 3.4 空值、`0` 和服务端校验

`parseNumber` 对缺失/空值和非法数字使用 `0` fallback（`src/app/actions.ts:196-200`）：

- `listingPrice` 经过 `Math.max(0, ...)`，空值、非法值和负数最终为 `0`；
- `sizeSqm`、`managementFee`、`repairFee` 使用 `parseNumber(...) || undefined`，空值/非法值/零值会变成 `undefined`，随后在 PostgreSQL 插入为 `NULL`；负数是 truthy，不会被服务端拦截；
- `area/address/notes` 使用 trim 后空字符串转为 `undefined`；
- HTML `min=0` 只出现在编辑页的数字控件，不能替代服务端校验；新建页数字字段只是 `inputMode`，没有 `type=number` 或 `required`；
- 当前模型无法由表单契约区分“用户输入真实 0”与“空值被解析为 0/undefined”，尤其管理费和修缮费的真实零值会丢失；
- `lifecycle` 不随创建/更新动作提交，也不会被表单误改。

### 3.5 成功、失败和返回

- 编辑成功有 `PageFlashBanner` 的 `role=status`/`aria-live=polite` 成功反馈；新建页没有自己的成功 banner，成功反馈位于目标页面的 flash 机制（`src/components/page-flash-banner.tsx:1-31`）。
- Action 失败主要通过 `throw new Error(...)` 结束；两页没有字段级错误、错误 summary、`aria-invalid`、`aria-describedby` 或失败后焦点定位。当前错误页/边界是否呈现这些错误属于运行未验证。
- `/properties/page.tsx` 的物件名称链接只进入 `/properties/{id}/edit`，没有携带 `q/lifecycle/sort/page` 返回参数；新建页仅理解 `from=entry`，编辑页不读取 `returnTo`。保存后固定重定向，因此不能从代码证明筛选、页码、滚动和触发链接焦点可恢复。
- 页面没有显式取消按钮。头部返回链接是普通导航，未保存编辑离开没有确认；新建草稿可能仍在 localStorage，编辑内容直接丢失。

### 3.6 FormDraftAssist 的真实职责和风险

`FormDraftAssist` 是客户端 `localStorage` 辅助，不是 AI 审核，也不写业务数据库：

- 监听 `input/change`，300ms 防抖保存列出的字段；
- `draft:properties:new` 提供恢复/清除；`reuse:properties:create` 提供上次输入应用/清空；
- 任何 `submit` 事件先把当前值写入 reuse（如配置），再删除当前 draft；无论 Server Action 后续成功还是失败，清理都已发生；
- 没有 `beforeunload`、路由离开拦截、版本/租户隔离、过期策略或编辑页恢复；
- 文案“自动保存/已保存”描述的是本地草稿状态，不能解释为业务保存、AI 确认或物件已写入。

来源：`src/components/form-draft-assist.tsx:110-337`、新建页 `:80-102`。

### 3.7 交互结构和操作层级

- 新建表单按“物件信息/费用”分组，普通字段使用一个整体带边框的表面；同一组内未为每个字段建立完整卡片。两个 submit 按钮分别改变 `afterSave`，不是两个独立保存 Action。
- 编辑页的 `ObjectWorkbenchShell` 提供页面 header、返回/关系图链接、左侧进度卡、章节导航和右侧三张 `WorkbenchFieldCard`；每张卡有 complete/missing/optional 状态徽章，进度卡有百分比和条形进度。
- 编辑页 `basicCompleted` 以 `name` 和 `area || address` 的 truthy 计数；`moneyCompleted` 以 `listingPrice > 0`、管理费/修缮费大于 0 计数；总计固定为 5。没有找到字段目录、物件完整度、输出资格或章节完成的正式业务契约。
- 关系图是编辑页 header 的次级链接；生命周期风险操作不在编辑表单内，而在 `/properties` List Report 行操作。

### 3.8 响应式和原生语义代码事实

- 新建：外层表单 `md:grid-cols-2`，费用在 `md` 以上三列，默认单列；没有独立的 768/390 运行证据。
- 编辑：外层 shell 在 `2xl` 才出现左右列；字段组使用 `md:grid-cols-2`、`md:grid-cols-3`，补充区使用 `2xl` 两轨；390px 的静态 CSS 倾向单列，但真实溢出和顺序未验证。
- 两页均使用原生 `label` 包裹输入，基础键盘可聚焦；但没有显式 `id/htmlFor`、字段错误关联或 Foundation `TextInput` 的 `aria-describedby`/`aria-invalid` 机制。
- 编辑页 DOM 顺序包含 header 返回/关系图、左侧进度链接、右侧输入和 sticky 保存；新建页包含草稿按钮、字段和两个保存按钮。Tab 顺序只能从 DOM 推断，未进行真实 Tab/Enter。
- 两页没有 IME 组合态 Enter 保护，也没有阻止普通 Enter 在输入中触发表单提交的逻辑；保存失败、保存成功或取消后的焦点恢复没有代码证据。

## 4. 代码推断

以下是基于代码结构的推断，不是运行或产品契约事实：

1. 新建页的 `createPropertyQuickAction` 是历史快速创建动作被完整表单复用；它制造默认名称和 `listingPrice=0` 的不完整物件，可能与“名称明确必填、空值可理解”目标冲突。
2. 编辑页的进度导航和状态徽章把“已填写”表达成“已确认/完成”，容易被理解为物件资料完整或可输出，且与 Responsive Form 的安静字段原则冲突。
3. 两页字段顺序和术语不一致：新建先面积后地址，编辑先地址后费用再面积；新建使用“价格/修缮积立金”，编辑使用“租金 / 价格/修缮基金”等，可能形成不同业务心智。
4. 新建成功后可回 `/properties`，编辑成功后只留在编辑页，说明两页目前没有统一的“保存并返回来源列表”语义。
5. `src/lib/data.ts` 的 `DataRepository = typeof memory` 和代理访问方式要求 Postgres 实现提供内存同名方法；当前 Postgres 文件缺失 `getPropertyById`/`updateProperty`，在启用 Postgres 时编辑路径很可能出现运行时方法缺失，而不是正常表单错误。这需要独立技术验证，不应由页面层绕过。

## 5. 未验证项

浏览器和数据环境均标记 `UNVERIFIED`：

- `/properties/new` 和 `/properties/[id]/edit` 的真实登录渲染、加载、错误页和实际 CSS 密度；
- 1440/768/390 的长标签、单位、长地址、textarea、窄屏重排和横向溢出；
- Tab 顺序、Enter 提交、IME、错误焦点、保存/取消后的返回焦点和浏览器历史；
- 新建/编辑在 memory 与 PostgreSQL 的实际写入、空值/零值、负数、notes 丢失和 lifecycle 迁移应用状态；
- 真实 `record.update`/`record.archive` 权限、租户范围、审计落库、跨租户拒绝；
- 服务端错误在 Next 错误边界中的呈现、重试和表单值保留；
- 列表筛选/页码/滚动/触发链接焦点在保存前后是否可恢复；
- `FormDraftAssist` 在真实刷新、多个标签页、租户切换和失败提交中的清理/恢复表现；
- 未创建、修改、归档或导出任何物件，未进入双账号、邀请、第二租户或跨租户循环。

## 6. 非权威状态或算法

- `basicCompleted`、`moneyCompleted`、`completed/total`、百分比和进度条：用字段 truthy/大于零比例推导“确认/完成”；没有正式业务契约。
- `hasLocation = Boolean(area || address)`：把两个不同字段合并为一个“位置已完成”状态，不代表地址或区域业务完整。
- `hasPrice = listingPrice > 0`：把正数当作已完成，不能证明价格有效、已核验或可输出；`0` 的语义也未被统一。
- `FormDraftAssist` 的“自动保存/已保存”：仅表示 localStorage 草稿，不表示数据库写入、AI 确认或用户审核。
- `createPropertyQuickAction` 的默认名称“新物件/新規物件/신규 매물”：是兼容创建策略，不是用户明确提供的名称事实。
- `formatCurrency` 下方重复价格摘要：是显示推导，不是新的保存事实。

## 7. 必须保留的业务能力

1. 以当前 `properties` 记录和租户作用域读写物件名称、区域、地址、面积、价格、费用和备注；
2. 创建与编辑必须继续使用既有 `addProperty`/`updateProperty` 以及 `record.update` 会话、审计和权限边界，不另建第二套保存 API；
3. `active/archived` lifecycle、`record.archive`、归档/恢复审计和列表安全返回继续由现有生命周期动作负责，除非产品明确把 lifecycle 纳入编辑范围；
4. 新建/编辑的服务端校验、空值、零值、非法数字和错误恢复必须可解释且一致；
5. 从 `/properties` 进入维护后，保存/取消应有明确的来源列表、筛选、页码、滚动和焦点策略；
6. 本地草稿若保留，必须明确为可选恢复能力，不能替代业务保存或被描述为 AI 审核；
7. 关系图入口继续作为独立关系能力的次级入口，不把关系推导复制进表单；
8. 不改变数据库、认证、权限、租户和输出专题边界，除非 Checkpoint B 明确登记最小技术缺口。

## 8. 推荐保留、降级或移出表单的结构

### 推荐保留

- 两条路由和同一物件字段事实，但以一个可复用 Responsive Form 结构表达创建/编辑差异；
- 稳定分组：基本身份（名称、区域、地址）、价格费用、面积与备注；具体顺序和术语在 B 统一；
- 顶部页面身份、一个主要保存动作、明确取消/返回和统一的错误反馈；
- 当前 `record.update`/租户/审计/现有保存动作作为唯一业务写入路径；
- lifecycle 归档/恢复作为表单外风险操作，除非产品决定把状态编辑纳入范围。

### 推荐降级

- `FormDraftAssist` 仅作为显式、可清理的本地恢复辅助；不在默认流程宣称“业务已保存”，不自动覆盖编辑资料；
- 关系图链接保留为次级页面动作，不与保存竞争；
- 保存后 flash 继续作为短暂反馈，但必须有失败状态和错误关联，不把 flash 当持久业务状态。

### 推荐移出或冻结

- 编辑页整体 `ObjectWorkbenchShell` 左侧进度卡、章节进度、完成度百分比、条形进度、complete/missing 徽章：在正式契约存在前移出默认表单；
- 每个章节的重复状态装饰和固定“确认済み/已确认”语言；
- 创建页调用快速创建默认名的隐式补全，除非产品明确允许“只填名称即可创建不完整物件”；
- `/output-center`、案件动作、输出准备、AI审核、关系推导、随机媒体和与任务无关的附件摘要，不进入创建/编辑主流程；
- 不新增顶部/底部/每章节重复保存按钮；保留一个主要保存动作，另一个“保存并返回列表”是否存在必须在 B 统一。

## 9. Checkpoint B 前需要产品负责人决定的问题

1. **新建必填语义**：名称是否必须由用户明确输入？是否允许默认名称创建不完整物件？新建与编辑是否必须采用同一必填规则？
2. **字段范围**：`notes` 是否必须在新建和编辑都可填写？`lifecycle` 是否明确不属于表单，还是允许编辑页操作？
3. **空值/零值/非法数**：listing price、面积、管理费、修缮费的空字符串、真实 `0`、负数和非法文本如何保存、显示和报错？是否需要保留 `null` 与 `0` 的区分？
4. **保存动作数量**：是一个“保存”后回来源列表，还是保留“保存并继续编辑/保存并返回列表”？取消是否只是返回，是否需要未保存离开确认？
5. **返回上下文**：从 `/properties?q&lifecycle&sort&page` 进入后，保存/取消/浏览器返回是否必须恢复筛选、页码、滚动和触发链接焦点？`/organize-center` 是否仍是默认返回目的地？
6. **错误契约**：服务端错误应显示为字段级、摘要级还是页面级？失败后是否保留输入值和本地草稿？哪个元素获得焦点？
7. **草稿边界**：只为新建保留 `FormDraftAssist`，还是编辑也需要；草稿按租户/用户/物件如何隔离；提交失败是否不得清理；清除条件和过期策略是什么？
8. **完成度和状态**：是否正式存在物件资料完成度/章节完成契约？若不存在，是否批准移除所有进度和徽章？
9. **PostgreSQL 缺口处理**：`data.postgres.ts` 缺少 `getPropertyById`/`updateProperty` 是否作为 W7-A 最小适配修复，还是独立技术任务；不得在页面层绕过 `data.ts` 代理或新增第二套保存逻辑。
10. **统一表单语言**：是否以 TASK-024 Responsive Form 的字段组、三/二/一列、原生标签、错误关联和单一主要操作作为唯一目标；哪些 `ObjectWorkbenchShell` 结构仅属于案件 Object Page，不能复制？
11. **运行证据门禁**：在环境恢复前，哪些桌面/平板/手机、键盘、权限和数据库回归进入统一批次；不能把本轮静态审计写成通过。

## 10. 停止条件

- 本轮只完成 Checkpoint A 治理文档；不写目标结构、不改 `src/`、不启动实现或审查 Agent。
- 如 Checkpoint B 需要修改超出任务批准范围的 actions、API、数据库、认证、权限或租户，必须暂停并报告，不自行扩大。
- PostgreSQL 读写缺口、字段零值契约、失败恢复和返回上下文未获产品/技术决定前，不开始视觉迁移。
- 等待产品负责人复审后再决定是否进入 Checkpoint B。
