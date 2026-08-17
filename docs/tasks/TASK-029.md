# TASK-029 / W6-B：主体索引 `/parties` List Report 参考迁移

- 状态: In Progress
- 优先级: P0
- 负责人: 技术项目经理
- 当前阶段: Checkpoint B 目标结构规格已提交，等待产品负责人复审
- 前置任务: TASK-028
- 目标结果: 用户能够找到一个个人或法人主体，理解其真实角色和关联关系，并进入正确的维护动作；列表不得自行判断主体资料是否完成、案件是否完成或能否输出
- 当前停止点: Checkpoint B 规格已提交；不进入 Checkpoint C 实现，等待产品负责人复审

## 产品边界

本任务只审计 `/parties` 主体索引及其直接数据、操作和入口边界。主体是独立业务对象的用户界面集合名称，但当前代码可能复用 `clients` 数据模型；审计必须区分界面命名、实际对象来源和权威业务事实。客户跟进模型、案件完成度、输出资格和输出产品专题不得被主体列表自行继承或推导。

## Checkpoint A 只读范围

只读检查：

- `src/app/parties/page.tsx` 及直接使用的主体列表组件；
- `src/lib/hub.ts`、主体档案解析、主体数据来源和相关 `Client`/quotation 映射；
- 主体归档/恢复动作、CSV 导出路由、权限边界和空选择行为；
- `/parties/new`、`/parties/[id]/edit` 的入口与返回关系，不迁移；
- `/relationship-tree` 的入口，不迁移；
- `/output-center` 的主体入口和越界文案，只登记，不进入页面；
- `/clients` 的业务边界，仅用于防止把阶段、用途、温度或跟进模型带入主体列表。

不触碰 `/properties`、TASK-020、模板、输出专题、认证、权限、租户、数据库、业务代码或未跟踪的 `src/app/clients/page 2.tsx`。

## Checkpoint A 必答问题

审计报告必须分别列出：

1. 已验证事实；
2. 代码推断；
3. 未验证项；
4. 非权威状态或算法；
5. 必须保留的业务能力；
6. 推荐保留、降级或移出列表的结构；
7. Checkpoint B 前真正需要产品负责人决定的问题。

必须核验：

- 主体权威对象来源、个人/法人类型和角色来源；
- 当前“关联案件数量”实际来源，禁止把合同/提案数量称为案件数量；
- 姓名、联系方式、角色、关联物件四项完成度是否有正式业务契约；
- `focus`、默认第一条和右侧面板是列表预览还是第二套主体详情页面；
- 搜索、个人/法人、有无关联、生命周期筛选的 URL 和返回上下文；
- 主体名称、编辑、关系图、归档的操作层级；
- 批量勾选、CSV 导出权限和空选择行为；
- “输出前检查”、`/output-center` 入口及越界文案；
- 空结果、无主体、加载、错误、窄屏和键盘当前行为；
- 客户与主体边界。

## 环境停止规则

- 优先使用现有合法开发登录会话；
- 登录环境排查上限 30 分钟；当前会话不可用时停止运行尝试，并将浏览器项目标记为 `UNVERIFIED`；
- 不进行双账号、邀请、第二租户或跨租户测试；
- 不创建、归档或修改主体数据；
- 不因环境问题进入多日认证排查。

## Checkpoint B 前置门禁

若审计确认列表依赖自行计算的完成度、将合同/提案数量冒充案件数量，或用右侧面板建立第二套主体详情，则当前状态不能直接作为 List Report 迁移基础；必须先由产品负责人决定删除、降级或拆出这些推断与重复结构。Checkpoint A 不授权目标设计、实现 Agent 或审查 Agent。

## 验证命令

- `npm run test:workflow-rules`
- `git diff --check`
- `git status --short --branch --untracked-files=all`

## 当前禁止事项

- 不修改 `src/`、数据库、API、认证、权限、租户或输出产品专题；
- 不启动实现或审查 Agent；
- 不修改、提交或删除 `src/app/clients/page 2.tsx`；
- 不创建主体数据或触发归档、导出写入以外的副作用；
- 审计报告完成后停止，等待产品负责人复审。

## 任务名称

W6-B：主体索引 `/parties` List Report 参考迁移

## 背景和用户结果

主体索引应帮助经纪人找到个人或法人主体、理解保存的角色与关系，并进入正确的主体维护动作。它不是客户跟进看板、案件完成度仪表盘或输出资格判断器。

## 本次范围

本轮只建立任务卡并执行 Checkpoint A 只读审计；审计对象、数据来源、筛选/返回、归档、CSV 和跨页面入口均以本卡范围为准，不修改业务代码。

## 明确不做什么

- 不进入目标结构设计、视觉方向、页面迁移或实现；
- 不修改主体数据模型、actions、API、数据库、认证、权限、租户或输出契约；
- 不把 `/clients` 的阶段、用途、温度、报价或跟进能力复制到 `/parties`；
- 不把合同/提案数量、字段填充比例或关系树状态写成案件完成、主体完成或输出就绪。

## 依赖关系

- TASK-028 页面结构迁移已 Done；本任务不重新打开 TASK-028；
- TASK-020 和输出产品专题继续冻结；
- `/parties/new`、`/parties/[id]/edit`、`/relationship-tree` 和 `/output-center` 只做入口/边界核对，不改变其行为。

## 验收标准

Checkpoint A 报告必须包含已验证事实、代码推断、未验证项、非权威状态/算法、必须保留的业务能力、结构去留建议和 Checkpoint B 产品决策问题；若首要反证成立，必须明确说明当前页面不能直接作为迁移基础。

## 预计涉及的模块

- `src/app/parties/page.tsx`；
- `src/lib/hub.ts`、`src/lib/party-profile.ts`、主体数据读取实现；
- `src/app/api/hub/export/route.ts`、`src/components/archive-record-button.tsx`；
- `/parties/new`、`/parties/[id]/edit`、`/relationship-tree`、`/output-center` 的相关入口。

## 风险和注意事项

- 当前主体界面可能只是 `clients` 的展示适配层，不能据界面名称推断存在独立主体表；
- 关联案件、完成度、类型、角色和关系树可能混用提案、备注、名称或字符串匹配，必须逐项标注权威性；
- 当前浏览器环境未连接本地服务，运行证据不足时只能写 `UNVERIFIED`，不能把代码审计写成浏览器通过。

## Checkpoint A 审计报告（只读）

### 审计结论

**当前 `/parties` 不能直接作为 List Report 迁移基础。** 首要反证目标全部命中：主体列表实际是 `clients` 的展示适配层；“关联案件”显示和筛选使用 quotation/contract 数；完成度是页面自算且没有正式业务契约；`focus` 和默认第一条驱动一个承载编辑、关系、输出和进度的右侧主体详情面板。另有 CSV 空选择导出全部主体、生命周期与关联数量口径脱节、主体到 `/output-center` 的参数不匹配等边界问题。

### 1. 已验证事实

- **主体权威对象来源**：`src/app/parties/page.tsx` 调用 `listHubParties`；`src/lib/hub.ts:264-299` 的 `resolveHubParties` 调用 `listClients`，返回 `Client` 记录的 id、name、phone、email、lifecycleStatus 等字段。仓库 schema 只有 `clients` 表（`db/migrations/20260727_000_baseline_schema.sql:39-70`；`src/lib/data.postgres.ts:903-934`），本轮未发现独立 `parties` 表或主体持久化接口。
- **个人/法人来源**：`src/lib/hub.ts:162-170` 先从 `client.notes` 的 `主体类型/関係者種別` 元数据读取；没有元数据时按名称是否含 `株式会社`、`有限会社` 或以 `法人` 结尾推为法人，否则推为个人。
- **角色来源**：`src/lib/hub.ts:172-190` 先从 `client.notes` 的主体角色元数据读取；没有元数据时从 `client.purpose` 推出自住/投资意向，再从 `client.stage` 推出买方候选或已成交。主体表单确实允许选择 `partyType`/`partyRole`，并把它们编码进 notes（`src/app/actions.ts:1694-1738`、`src/lib/party-profile.ts:202-248`），但旧 `Client` 记录可没有这些元数据。
- **关联案件数量实际来源**：`src/app/parties/page.tsx:198-208` 加载 `listHubContracts` 后按 `contract.clientId` 计数；`src/lib/hub.ts:301-320` 又把每条 quotation 映射成 `HubContractItem`，固定 `contractType: "sell"`，contract number 由 quotation id 拼出。页面将该值显示为“关联案件”，筛选 `with_cases/no_cases` 也依据该值（`src/app/parties/page.tsx:220-227`），不存在 `listBrokerageCases` 或案件关系表查询。
- **列表字段**：主体名称、首个角色、个人/法人标签、quotation 数、`relatedPropertyHint` 和一个展示日期来自列表；`relatedPropertyHint` 实际映射自 `client.preferredArea`（`src/lib/hub.ts:279-290`），编辑表单字段名称却是“关联物件 / 案件备注”。
- **`focus` 与默认选中**：`src/app/parties/page.tsx:230` 先找 `filtered.find(party.id === focus)`，找不到就使用 `filtered[0]`。列表主体名称链接回 `/parties?...&focus=id`（:413-429），不是对象详情路由。
- **右侧面板内容**：侧栏展示主体统计、姓名/类型/角色、完成度、业务关系、输出前检查、继续/创建案件、关系树、编辑、附件和输出中心入口（`src/app/parties/page.tsx:473-639`）。这已经是第二套主体详情页面，而非仅用于选择后的轻量预览。
- **URL 筛选和返回上下文**：页面读取 `q`、`type=corporate|individual`、`relation=with_cases|no_cases`、`lifecycle=active|archived|all`、`focus` 和 `flash`（:183-196）。`makeHref` 保留 query/type/relation/lifecycle，并按操作清除或设置 focus（:268-281）。搜索 form 用 hidden 字段保留 type/relation/lifecycle，但不保留 focus；筛选 chips 会清除 focus。生命周期筛选传给 `listClients`，但 `listHubContracts` 只使用 tenantId，不使用 lifecycleStatus（`src/lib/hub.ts:301-303`），所以列表主体范围与关联数量口径可能不一致。
- **操作层级**：主体名称是回到同一列表并改变 `focus` 的链接；编辑和关系树入口只出现在右侧面板（:482-496、:574-597）；归档按钮同时出现在每行和右侧面板（:452-459、:489-495）。编辑页返回 `/organize-center?type=party&focus=id`（`src/app/parties/[id]/edit/page.tsx:153-160`），不是带当前筛选上下文的 `/parties`。
- **归档边界**：`ArchiveRecordButton` 调用 `setRecordLifecycleAction`，服务端要求 `record.archive`，对 `party` 实际调用 `setClientLifecycleStatus`，审计 targetType 写为 `client`，并按安全 returnTo 重定向（`src/components/archive-record-button.tsx:50-73`、`src/app/actions.ts:330-383`）。这是现有可保留的对象生命周期能力。
- **CSV 边界和权限**：主体列表外层 form GET `/api/hub/export`，checkbox 使用 `name="ids"`，scope 为 parties（`src/app/parties/page.tsx:387-471`）。导出路由只要求 `record.read`（`src/app/api/hub/export/route.ts:40-60`），没有独立 export 权限；CSV 输出 `party_type`、`roles`、`related_property_hint`、`contract_count`（:104-123）。
- **空选择行为**：导出路由只有在 `ids.length > 0` 时创建 idSet，否则 `idSet=null`，因此空选择会导出当前权限范围内全部主体，而不是“只导出选中主体”（`src/app/api/hub/export/route.ts:43-49、104-106`）。页面提示却写成“只对勾选的主体执行 CSV 导出”。
- **输出边界**：右侧文案直接叫“输出前检查”，并按 quotation 数量决定“打开案件/创建案件”（`src/app/parties/page.tsx:567-583`）；“查看资料”链接为 `/output-center?partyId=${selected.id}`（:601-606），但 `/output-center` 的参数契约只读取 `targetParty`，其 `searchParams` 无 `partyId`（`src/app/output-center/page.tsx:343-363、585-614`），该入口不会按预期选中主体。输出页还要求 `output.preview`（:396-401）。
- **空结果/无主体/加载/错误**：过滤结果为空时显示 `emptyResult`（`src/app/parties/page.tsx:465-469`）；侧栏在无 selected 时仍显示通用 `notSet`（:636-638）。没有 `/parties/loading.tsx`、`/parties/error.tsx` 或专属 not-found；使用 app 级 loading/error，错误页提供重试和返回工作台（`src/app/loading.tsx`、`src/app/error.tsx`）。
- **响应式和键盘代码事实**：主体行在 `lg` 才切为三列，列表/侧栏在 `2xl` 才并排，控件使用原生 link、button、checkbox、details 和 select；本轮没有运行级视口或键盘证据。
- **客户边界代码事实**：`/clients` 明确使用 stage、purpose、temperature、sort 和 follow-up URL；主体页没有这些筛选，但 `buildRoleTags` 会从 purpose/stage 派生角色，说明两套业务语义在数据适配层发生泄漏。

### 2. 代码推断

- 当前 `Client` 是真实持久化对象，`party`/主体是面向导航和页面的业务集合名称，而不是独立聚合根；后续若要迁移主体 List Report，必须先确认是否继续沿用 Client 作为权威对象，或建立正式主体事实层。
- `partyType`/`partyRole` 写入 notes 的元数据可视为显式用户输入的候选权威来源；名称、purpose、stage 的 fallback 只能算兼容推断，不能作为列表的正式角色或类型事实。
- `preferredArea`、`relationHint` 和关系树中的字符串包含匹配不足以证明“关联物件”关系；它们更像搜索/展示提示。
- 右侧面板的 `outputCheck` 实质混合了 quotation 存在、案件下一步、输出中心入口和资料列表，功能上已经越过主体索引的对象选择职责。

### 3. 未验证项

- 浏览器项目：`UNVERIFIED`。现有 in-app browser 只有 `http://localhost:3002/import-center` 的 `ERR_CONNECTION_REFUSED` 页面，当前无服务和合法登录会话；按停止规则未启动服务、未进入认证排查。
- 未取得 `/parties` 的真实空列表、真实错误、加载完成、窄屏横向溢出、Tab/Enter/返回焦点和真实 CSV 下载行为证据。
- 未验证 Clerk 真实权限矩阵、导出下载审计、归档在真实数据库中的持久化和不同角色的 `record.read`/`record.archive` 结果。
- 未验证 `clients` 与 `brokerage_cases` 的产品层映射是否存在未被当前页面调用的正式关系来源；当前代码证据只能证明 `/parties` 自身没有使用该来源。
- 未验证 `output-center` 的 `partyId` 是否由兼容路由或其他中间层处理；当前页面代码未读取该参数。
- 未创建、修改或归档主体，未进行双账号、邀请、第二租户或跨租户测试。

### 4. 非权威状态或算法

- `selectedCompletion`：姓名、联系方式、角色、关联物件四项的 truthy 数量百分比（`src/app/parties/page.tsx:236-247`），没有正式主体字段目录、案件契约或输出资格契约依据。
- 右侧“必填信息”进度条和 `complete/missing` 徽章（:515-547）是 UI 自算状态，不得解释为主体完整、案件完整或可输出。
- `mapPartyType` 的公司名称字符串判断（`src/lib/hub.ts:162-170`）。
- `buildRoleTags` 的 purpose/stage fallback（:172-190）。
- 关联案件数量的 quotation/contract 计数（`src/app/parties/page.tsx:204-208`、`src/lib/hub.ts:270-277`）。
- `relatedPropertyHint = preferredArea` 与关系树的 `includesLoose` 字符串匹配（`src/lib/hub.ts:288`、`src/app/relationship-tree/page.tsx:282-292`）。
- 日期展示按列表索引写成本日/昨日/附件日期（`src/app/parties/page.tsx:253、447-449`），不是主体更新时间事实。
- `focus` 找不到时默认第一条，可能把 URL 中失效主体静默替换成另一主体（:230）。

### 5. 必须保留的业务能力

- 按租户和 `record.read` 读取主体对象；
- 个人/法人显式类型与角色维护入口（待产品确认权威存储）；
- 姓名、联系方式和主体档案编辑保存；
- 生命周期归档/恢复、`record.archive` 权限和审计记录；
- 搜索、类型、关联状态、生命周期筛选及可回放 URL 上下文；
- 关系树只读检查入口；
- 从主体进入正确维护动作，而不是把主体推进到客户跟进或输出页面；
- CSV 能力若继续保留，必须保留租户范围、权限、明确选择语义和安全字段口径。

### 6. 推荐保留、降级或移出列表的结构

**推荐保留**

- 单一主体 List Report：名称/名称类型、显式角色、联系方式摘要、生命周期和权威关系摘要；
- 搜索、个人/法人、有关联/无关联、生命周期筛选，但“有关联”必须先决定关联对象及权威来源；
- 名称进入明确主体维护动作，关系树作为次级检查入口，归档作为生命周期操作；
- 侧栏若保留，只做轻量预览，不复制编辑、完成度、输出检查和多组动作。

**推荐降级或移出默认列表**

- 完成度、进度条、`complete/insufficient` 徽章：移出默认列表，直到有正式契约；
- quotation/contract 数：改为诚实命名并从“关联案件”筛选中移出，直到案件关系权威确定；
- `relatedPropertyHint`/字符串匹配：降级为未确认提示或移出关系统计；
- 输出前检查、输出中心资料入口、打开/创建案件和 quotation 路由：移出主体列表，回归案件工作台或独立输出专题；
- 批量 CSV：放入次级批量工具，明确空选择行为和权限，不与主体主要维护动作竞争；
- 右侧完整详情面板：拆回 `/parties/[id]/edit` 或明确的主体工作台，不在 List Report 内建立第二套详情页。

### 7. Checkpoint B 前真正需要产品负责人决定的问题

1. “主体”是否继续以 `clients` 为权威对象，还是要定义独立主体事实层；若继续复用，产品术语和数据契约如何解释 Client/主体边界？
2. “关联案件”到底指 `brokerage_cases`、quotation/contract，还是另一种关系？在权威来源确定前，列表应显示哪一种诚实名称？
3. 个人/法人和角色是否以当前 notes 元数据为正式事实；旧记录缺少元数据时应显示未知、人工补齐，还是允许兼容推断？
4. 姓名、联系方式、角色、关联物件是否存在正式必填/完成度契约？若没有，是否删除所有完成度算法和徽章？
5. `/parties` 是纯 List Report，还是允许一个明确边界的 preview？编辑、关系树、归档和主要下一步应分别放在哪一层？
6. CSV 导出是否属于主体列表默认能力？需要什么角色/权限；空选择是导出 0 条、要求先选择，还是明确导出全部？
7. 输出前检查和 `/output-center` 是否继续冻结在输出专题之外？主体列表是否完全移除这些入口？
8. “有无关联”筛选的关系对象、归档主体与关联记录的生命周期口径，以及返回筛选上下文，需在目标结构前定案。

## 当前状态

- Checkpoint A 只读审计已完成；Checkpoint B 目标结构规格已提交至 `docs/operations/TASK-029_W6B_TARGET_STRUCTURE_2026-08-17.md`，TASK-029 保持 `In Progress`，等待产品负责人复审；未进入 Checkpoint C 实现。
- Checkpoint B 已收束为单一标准 List Report：Client 兼容持久化边界、显式主体元数据、无完成度/案件数量/输出资格推导、无 `focus` 和右侧第二详情、选中主体 CSV 次级工具，以及既有维护入口的明确层级。
- 本轮只修改治理文档；未修改 `src/`、数据库、API、认证、权限或租户；未创建主体数据，未启动实现或审查 Agent。
- 未跟踪的 `src/app/clients/page 2.tsx` 保持原状并排除所有提交。
