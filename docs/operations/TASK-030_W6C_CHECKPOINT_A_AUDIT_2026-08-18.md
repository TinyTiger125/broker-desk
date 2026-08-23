# TASK-030 / W6-C Checkpoint A 只读审计

日期：2026-08-18（Asia/Tokyo）
仓库：`/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev`
Branch：`main`
HEAD：`2d3903a05d490caf7a8a4bd7d187a57bcdf9c5d9`
范围：只读检查 `/properties`、`listHubProperties`、直接数据适配、创建/编辑/归档/关系图/CSV/输出入口边界；不修改业务代码和数据。

## 0. 审计结论

当前 `/properties` 不能直接作为 List Report 迁移基础。页面把可靠的物件字段与未经业务契约证明的趋势、资料完整度、输出准备度、关系、活动和封面混在一起；同时 `focus` 默认第一条和右侧面板形成第二套物件详情，CSV 空选择会导出全部物件。Checkpoint B 必须先删除或冻结这些伪事实，不得重新美化原页面。

## 1. 环境与证据级别

### 已核对

- 当前工作区只有未跟踪的 `src/app/clients/page 2.tsx`；本次未修改它。
- 3000、3002 均无监听服务；本轮未启动服务。
- 没有当前可接受的合法浏览器页面或截图。桌面、窄屏、键盘、真实空态/错误态、返回上下文和横向溢出均为 `UNVERIFIED`。
- 未创建、修改、归档或导出物件数据；未进入认证、双账号、邀请、第二租户或跨租户测试。

### 证据分类

- 下文“已验证事实”均来自当前 HEAD 的源代码、类型、SQL/内存适配和链接结构。
- “代码推断”是由这些实现推得的产品含义，不等于业务契约。
- “未验证项”不能由静态代码替代运行证据。

## 2. 持久化权威来源与 `listHubProperties` 字段来源

### 已验证事实

1. 存在独立 `properties` 持久化集合/表。
   - 内存驱动定义 `Property`：`src/lib/data.memory.ts:147-162`，数据集合为 `db.properties`。
   - PostgreSQL schema 创建 `properties` 表：`src/lib/data.postgres.ts:936-948`。
2. `listHubProperties` 并不直接读取 quotation；它调用 `listQuoteFormData`，再读取返回对象中的 `properties`：`src/lib/hub.ts:239-247`。
3. 内存 `listQuoteFormData` 从 `db.properties` 映射 `id/name/listingPrice/managementFee/repairFee/lifecycleStatus`：`src/lib/data.memory.ts:3544-3562`。
4. PostgreSQL `listQuoteFormData` 查询 `properties` 表的 `id/name/listing_price/management_fee/repair_fee/lifecycle_status`，按 `created_at DESC`：`src/lib/data.postgres.ts:4254-4281`。
5. `listHubProperties` 再叠加当前用户和租户范围的 property attachments，按 `targetType: "property"` 统计，限制最多读取 500 条：`src/lib/hub.ts:241-251`；底层同时限定 `user_id` 和 `tenant_id`：`src/lib/data.memory.ts:3095-3110`、`src/lib/data.postgres.ts:3656-3687`。
6. 当前 `HubPropertyItem` 只有 `id/name/area/listingPrice/managementFee/repairFee/attachmentCount/status`，没有 `type`、`updatedAt`、owner 或关系字段：`src/lib/hub.ts:48-57`。

### 字段权威矩阵

| 页面/适配字段 | 当前来源 | 权威性结论 |
|---|---|---|
| `name` | `properties.name` | 持久化字段，可保留 |
| `area` | `properties.area`；缺失时 `property.name.includes("区")` 以名称代替：`src/lib/hub.ts:254-262` | 真实 area 可保留；名称 fallback 是非权威推断，必须移除 |
| `listingPrice` | `properties.listing_price` / `Property.listingPrice` | 持久化字段，可保留 |
| `managementFee` | `properties.management_fee` / `Property.managementFee` | 持久化字段，可保留；缺失被适配为 `0` |
| `repairFee` | `properties.repair_fee` / `Property.repairFee` | 持久化字段，可保留；当前结果行没有展示 |
| `lifecycle` | `lifecycle_status` 映射为 `active/archived`，缺失默认为 `active` | 语义需要确认；内存 demo 物件没有显式 lifecycle，PostgreSQL schema 与查询存在漂移风险 |
| `attachmentCount` | 真实 attachment 记录聚合，但只读当前用户/租户、最多 500 条 | 可作为受限附件计数；必须说明范围/上限，不能等同资料完整度 |
| `updatedAt` | `HubPropertyItem` 未暴露；`Property` 内存类型也只有 `createdAt`；PostgreSQL mapper 读取 `created_at` 但丢弃 `updated_at` | 当前没有可供列表使用的真实 updatedAt |
| `type` | 没有字段或适配来源 | 不得显示或提供类型筛选 |
| owner/related party | `listHubProperties` 没有关系字段 | 当前列表没有权威主体来源 |

### 关键数据契约风险

- PostgreSQL 初始 `properties` 表定义只展示 `created_at`，未见 `lifecycle_status`、`archived_at`、`archived_by_id` 或 `updated_at`：`src/lib/data.postgres.ts:936-948`。但 `mapProperty`、`listQuoteFormData` 和生命周期更新又读取/写入这些列：`src/lib/data.postgres.ts:376-392`、`4254-4281`、`4329-4347`。这是待独立核验的 schema/运行风险，本任务不修复。
- `setPropertyLifecycleStatus` 写入 `updated_at`，而内存实现只更新 lifecycle/archive 字段，不更新 `updatedAt`：`src/lib/data.postgres.ts:4329-4347`、`src/lib/data.memory.ts:3603-3615`。不能据此声称最近更新可靠。
- `/organize-center` 读取 `item.updatedAt` 作为物件排序/展示字段，但 `HubPropertyItem` 没有该字段：`src/app/organize-center/page.tsx:340-363`。这进一步证明物件最近更新契约尚未闭合。

## 3. 页面统计卡、底部区和非权威算法

### 可追溯但不等同业务状态的聚合

- `totalPortfolioValue` 是当前 `properties` 列表中 `listingPrice` 的求和：`src/app/properties/page.tsx:263`。它只代表当前生命周期过滤结果的价格字段合计，不证明台账总价值、估值或经营趋势。
- `activeCount` 和 `archivedCount` 是当前返回集合按 `status` 计数：`src/app/properties/page.tsx:261-262`。它们可以表达生命周期数量，但页面把 `activeCount` 文案化为“可输出物件”，越过了状态契约。
- `totalAttachments` 是 `attachmentCount` 求和：`src/app/properties/page.tsx:268`；底层受用户/租户和 500 条读取上限影响，不是资料完整度。

### 明确伪造或非权威数据

- 价格变化百分比：先把当前总价乘 `0.96` 得到 previous，再计算变化：`src/app/properties/page.tsx:264-266`。这是固定比例，不是真实历史事件或时间序列。
- “资料完整度”：`Math.max(72, activeCount / properties.length * 100)`：`src/app/properties/page.tsx:267`。它把 active 比例和最低 72% 结合，既不是字段契约，也不是资料完成度。
- 行级“准备度”：`Math.max(70, 96 - index * 3)`，并随当前页面行索引变化：`src/app/properties/page.tsx:510-513`。同一物件换页或排序即可改变数值。
- “台账数据构成”四类：`properties.length` 乘固定 `0.54/0.31/0.12/0.03` 并取整：`src/app/properties/page.tsx:656-688`。没有物件类型或分类权威。
- 随机/循环封面：`propertyCovers[index % propertyCovers.length]` 使用四个 Unsplash URL：`src/app/properties/page.tsx:16-21,465-471`；它不是物件附件或封面字段。
- 相关主体/所有者：每行固定显示 `C`/“核心主体”和 `L`/“关联主体”，没有读取任何 property-party 关系：`src/app/properties/page.tsx:500-506`。
- 底部“下一步输出准备”的三条活动与“2小时前/昨日/2日前”是静态文案：`src/app/properties/page.tsx:693-723`，没有读取 audit log、task 或事件时间。
- 页面说明直接称“确认从 Excel 读取的物件信息，并复用于后续文书输出”：`src/lib/i18n.ts:100-101,283-284,466-467`，把列表职责与输出准备混合。
- 关系图和 related party 依赖字符串包含匹配：`preferredArea` 被暴露为 party 的 `relatedPropertyHint`，关系树用 `includesLoose` 匹配名称/area：`src/lib/hub.ts:301`、`src/app/relationship-tree/page.tsx:258-292`。这不是真实物件关系来源。

## 4. 筛选、排序、URL 与返回上下文

| 控件/参数 | 当前实现 | 事实判断 |
|---|---|---|
| lifecycle | `status=active/archived/all`；传入 `listHubProperties`，页面又按 status 过滤：`src/app/properties/page.tsx:228,233-240` | 有实际过滤路径，但底层 PostgreSQL lifecycle schema 需核验 |
| type | Link 只生成 `status=all&sort=...`：`src/app/properties/page.tsx:395` | 没有类型字段，控件是外观链接，不改变类型数据 |
| 价格区间 | Link 只生成 `sort=price`：`src/app/properties/page.tsx:400` | 没有 min/max 参数，也不做价格区间过滤 |
| 最近更新 | `sort=updated` 时按 `id` 字符串倒序：`src/app/properties/page.tsx:239-242` | ID 排序冒充最近更新；不权威 |
| 价格排序 | `sort=price` 按 `listingPrice` 倒序：同上 | 价格排序真实，但没有升/降方向契约 |
| 搜索 | 页面 `searchParams` 没有 `q`，页面没有搜索输入 | 不存在 |
| 页码 | `page` 解析，page size 固定 8，slice 当前集合：`src/app/properties/page.tsx:243-246` | 有分页；底部文案却固定写“1-10”：`src/app/properties/page.tsx:50,550-553` |
| `focus` | `focusId` 找不到时回退到 `pagedProperties[0]`：`src/app/properties/page.tsx:229,247` | 形成选中模型并默认第一条；不是单纯列表上下文 |
| `flash` | 仅识别 `property_created`：`src/app/properties/page.tsx:269-277` | 属于短暂操作反馈，不应成为筛选或业务状态 |

编辑链接只进入 `/properties/[id]/edit`，没有显式 `returnTo`；编辑页的“返回”进入 `/organize-center?type=property&focus=...`：`src/app/properties/page.tsx:520-525`、`src/app/properties/[id]/edit/page.tsx:149-153`。归档按钮的 `returnTo` 只保留 status/sort/page：`src/app/properties/page.tsx:526-532`。真实浏览器返回、滚动和焦点恢复尚未取得证据。

## 5. 列表行、focus、侧栏和关系入口

### 已验证事实

- 物件名称本身是 `<p>`，不是主要链接；主要维护入口是行尾“物件を整理/整理物件”链接，进入现有 edit 页：`src/app/properties/page.tsx:473-475,520-525`。
- 每行有 checkbox、生命周期徽章、价格/管理费、硬编码主体行、行级准备度和归档按钮；桌面表格最小宽度 1080，外层允许横向滚动：`src/app/properties/page.tsx:432-460`。
- `focus` 用于全局搜索、信息整理中心、关系图和输出中心返回到 `/properties?focus=...`：`src/lib/hub.ts:503-512`、`src/app/organize-center/page.tsx:638-655`、`src/app/relationship-tree/page.tsx:212-220`、`src/app/output-center/page.tsx:1667-1670`。
- `focus` 选中对象被放到右侧完整“物件ファイル/物件档案/매물 파일”面板，包含归档、字段必填计数、进度条、输出前确认和关系图入口：`src/app/properties/page.tsx:573-653`。

### 产品判断

`focus`、默认第一条和右侧面板不是轻量预览，而是在 List Report 内建立第二套物件详情。面板的必填计数、`complete/insufficient`、进度条和“可以关联案件继续使用”没有正式物件完整度/输出资格契约，必须移出默认列表。

## 6. 快速创建、Responsive Form 和 FormDraftAssist

- 列表头部表单只显示 `name`，但提交 `createPropertyQuickAction`：`src/app/properties/page.tsx:287-304`。
- action 只要求 `record.update`，名称为空时使用“新物件/新規物件/신규 매물”，价格默认为 0，area/address/managementFee/repairFee 未填写时为空：`src/app/actions.ts:1558-1588`。它会创建一个可以不完整的持久化 Property；并写入 `property_created` audit，但 `targetType` 写成 `compliance`：`src/app/actions.ts:1590-1601`。
- 成功后默认返回 `/properties`，`afterSave=organize` 才进入 `/organize-center?type=property&focus=...`：`src/app/actions.ts:1608-1612`。
- `/properties/new` 复用同一个 action，但提供完整名称、区域、地址、面积、价格和费用表单以及“保存/保存并去物件列表”两个动作：`src/app/properties/new/page.tsx:70-151`。这与列表快速创建存在职责重叠，且快速创建更容易制造不完整物件。
- `FormDraftAssist` 对列表快速创建和 new form 使用 `localStorage` 自动保存/恢复/复用：`src/app/properties/page.tsx:298-303`、`src/app/properties/new/page.tsx:82-91`、`src/components/form-draft-assist.tsx:110-210`。它属于表单辅助能力，不是主体查找任务，不能占据 List Report 主操作。

## 7. CSV、权限、租户和审计边界

- 页面每行显示 checkbox，并把 `ids` 放进 `/api/hub/export?scope=properties`：`src/app/properties/page.tsx:432-460`。
- 页面没有全选、选择计数或空选择禁用；批量工具按钮始终可提交。
- API 读取所有 `ids`；当 `ids.length === 0` 时 `idSet` 为 `null`，properties 分支过滤条件恒真，导出当前租户可读的全部物件：`src/app/api/hub/export/route.ts:40-60,82-101`。这重复了 TASK-029 已发现的“空选择导出全部”风险。
- API 只要求 `record.read`，使用当前 session 的 `userId/tenantId`；不新增权限，也没有在该 route 写入导出审计事件：`src/app/api/hub/export/route.ts:51-60,82-101`。
- 导出字段为 `id/name/area/listing_price/management_fee/repair_fee/attachment_count/status`，没有 type、updatedAt、owner 或关系字段：`src/app/api/hub/export/route.ts:84-94`。

Checkpoint A 不修改 API；页面 CSV 是否冻结、未来字段/空选择/筛选范围/权限/审计契约需产品负责人另立决定。

## 8. 输出中心、关系图与页面底部越界

- 台账构成卡片链接 `/output-center`，文案为进入 PDF 输出：`src/app/properties/page.tsx:656-662`。
- 底部活动卡链接 `/parties`，并把补齐卖方/买方候选写成下一步：`src/app/properties/page.tsx:693-723`。这把物件查找带入主体/输出任务。
- 关系图入口位于侧栏，不是独立的权威关系证明；其 property-party 关系使用 `preferredArea`/名称字符串匹配，property-contract 关系使用 quotation 派生的名称匹配：`src/app/relationship-tree/page.tsx:234-292`。
- `/output-center` 通过 `/properties?focus=...` 返回物件列表；这是现有跨页依赖，不证明 `/properties` 应承担输出前检查：`src/app/output-center/page.tsx:1667-1670`。

## 9. 空态、错误态、加载、窄屏和键盘

### 已验证代码事实

- 没有 `loading.tsx`、`error.tsx` 或页面级错误/权限状态文件；页面是 server component，读取失败依赖框架/上层错误处理。
- 空结果显示一行说明并再次提供“新建物件”链接；右侧侧栏同时显示相同空文案，形成重复空态区域：`src/app/properties/page.tsx:537-545,648-651`。
- 表格设置 `min-w-[1080px]` 且外层 `overflow-x-auto`：窄屏会产生横向滚动，而不是窄屏等价的单列结构：`src/app/properties/page.tsx:439-442`。
- 静态原生链接、checkbox、details/summary 和 button 具备浏览器基础语义，但本轮没有真实 Tab、Enter、焦点顺序或返回焦点证据。

### 未验证

- 真实无主体/有筛选无结果的页面表现、分页边界、服务器错误、权限拒绝、窄屏横向溢出和键盘行为。
- 真实 PostgreSQL schema 是否已由外部迁移补齐 lifecycle/archived/updated 列。

## 10. 必须保留的业务能力

- 当前租户范围内、具备 `record.read` 权限的物件读取；不得扩大租户或用户范围。
- 保存的物件名称、area/address、listing price、management fee、repair fee 和真实 lifecycle；缺失字段必须诚实显示未设置。
- 进入现有物件维护页，并保留其既有保存语义；不在 List Report 复制保存逻辑。
- 现有归档/恢复 action、`record.archive` 权限、租户范围和审计事实；列表只提供次级风险操作。
- 真实 attachment 关联与计数（若产品决定保留），但必须明确用户/租户范围及上限，不推导完整度或输出资格。
- `/properties/new` 和关系图入口的存在性及职责边界；本任务不迁移详情、新建或关系图页面。
- 现有 CSV API 的服务端边界在本任务不修改；页面是否显示 CSV 需先完成独立契约决定。

## 11. 推荐保留、删除、冻结或移出列表

### 推荐保留

- 单一 List Report 结果区：主体名称/物件名称、真实所在地、价格、管理费、修缮费、生命周期；名称应成为唯一主要进入维护链接。
- 搜索、生命周期筛选、分页和真实价格排序，前提是 URL 与数据查询契约被补齐。
- 归档/恢复作为行级次级风险操作，保留现有 action 和审计。
- 联系附件数量只在其权威范围、上限和空值语义明确后保留。

### 推荐删除或移出默认列表

- 台账价格变化百分比及其固定 previous 计算；
- active 数量的“可输出物件”命名、资料完整度卡和所有字段填充比例；
- 行级准备度、输出前检查、`complete/insufficient`、输出资格文案；
- 固定比例台账构成圆图；
- 静态活动时间线和“下一步输出准备”；
- 循环 Unsplash 封面、硬编码 C/L 主体行；
- `focus`、默认第一条和右侧完整详情面板；
- `/output-center`、`/parties` 和案件/输出动作；
- 列表快速创建作为主操作；默认应进入明确的新建入口，除非产品另行批准轻量草稿语义。

### 推荐冻结

- CSV checkbox、批量工具和导出按钮：沿用 TASK-029 原则，在导出字段、空选择、筛选范围、权限和审计契约可靠前从页面移除；不修改既有 API。
- 类型筛选和价格区间筛选：当前没有字段/查询契约，不应保留外观控件。
- “最近更新”排序：直到 `updatedAt` 权威字段贯通适配和查询前冻结。
- 关系图中的主体/物件关系：直到存在正式关系来源前，不显示关系摘要。

## 12. Checkpoint B 前需要产品负责人决定的问题

1. `/properties` 的权威对象是否明确为独立 `properties` 记录；`listQuoteFormData` 是否只作为兼容读取适配，还是存在 quotation/form data 投影语义？
2. PostgreSQL `lifecycle_status`、`archived_at`、`archived_by_id`、`updated_at` 的真实 schema 和 migration 事实是什么；内存和 PostgreSQL 生命周期语义是否必须一致？
3. 默认列表的字段契约是否为名称、所在地、listing price、management fee、repair fee、lifecycle；attachment count 是否保留，范围和上限如何表达？
4. 物件类型是否有明确保存字段；若没有，是否永久移除类型筛选和台账构成分类？
5. 最近更新排序是否需要正式 `updatedAt`；没有之前是否只保留价格排序和页码？
6. 物件名称是否作为唯一主要维护链接；是否移除“整理物件”重复入口，并如何安全保留列表返回上下文？
7. `focus`、默认第一条、右侧详情、必填/完成度/输出检查是否全部移出 List Report？
8. 快速创建是否冻结为 `/properties/new` 的次级入口；仅名称创建的不完整物件是否允许继续存在？FormDraftAssist 是否留在新建表单而非列表？
9. CSV 是否按 TASK-029 暂时从页面移除；未来恢复时由哪个独立任务决定字段、空选择、筛选、权限和审计？
10. 关系图、主体/物件关系和 `/output-center` 入口是否继续冻结在本页之外；输出专题冻结边界如何保持？
11. Checkpoint C/D 的桌面、768、390、键盘、空态、错误态、返回上下文和真实权限证据门禁由哪一批次统一验证？

## 13. 结束节点

Checkpoint A 只读审计已完成，TASK-030 保持 `In Progress`。本轮不制作目标结构、不修改 `src/`、不启动实现或审查 Agent。等待产品负责人复审并决定是否批准 Checkpoint B。
