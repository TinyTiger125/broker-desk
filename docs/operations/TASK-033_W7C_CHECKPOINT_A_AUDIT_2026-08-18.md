# TASK-033 / W7-C Checkpoint A：主体创建/编辑只读事实审计

- 日期：2026-08-18
- 状态：Checkpoint A 审计完成，等待产品负责人复审
- 目标路由：`/parties/new`、`/parties/[id]/edit`
- 对照范围：`/parties`、`/relationship-tree`、`/clients`、`/clients/[id]`
- 运行状态：`UNVERIFIED`

## 1. 审计边界与证据方法

本报告只读检查页面、直接调用的表单组件、主体适配、Server Action、`Client` 数据读写、审计和导航入口。不修改 `src/`、数据库、migration、权限、认证、租户、客户、关系或输出数据，不启动 Agent。

仓库事实主要来自：

- `src/app/parties/new/page.tsx`
- `src/app/parties/[id]/edit/page.tsx`
- `src/components/party-profile-form.tsx`
- `src/lib/party-profile.ts`
- `src/app/actions.ts` 中 `parsePartyProfileForm`、`createPartyProfileAction`、`updatePartyProfileAction`
- `src/lib/data.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`
- `src/lib/hub.ts`
- `src/components/form-draft-assist.tsx`
- `src/app/parties/page.tsx`、`src/app/relationship-tree/page.tsx`
- `db/migrations/20260727_000_baseline_schema.sql`

## 2. 已验证事实

### 2.1 权威持久化来源

1. 仓库没有独立的 `parties`/主体表或主体专属 migration。基线 schema 只有 `clients` 表；`Client` 模型包含姓名、电话、LINE、邮箱、`preferredArea`、备注，以及预算、用途、阶段、温度、合同、AML、跟进等客户字段。
2. `/parties/new` 使用 `createPartyProfileAction`；`/parties/[id]/edit` 使用 `updatePartyProfileAction`。两者最终分别调用 `addClient` 与 `updateClient`，没有第二套主体持久化核心。
3. 主体类型、主体角色和主体状态不是独立列，而是通过 `buildPartyProfileNotes` 写入 `Client.notes` 的本地化键值行；`extractPartyProfileFromNotes` 再从这些行读取。
4. `src/lib/data.ts` 根据运行配置转发到 memory 或 PostgreSQL repository。两条路径均按 `tenantId` 读取/写入 `clients`；创建写入当前用户为 `ownerUserId`，更新 Action 先检查当前用户与租户归属。
5. 创建和更新之后才分别调用 `addAuditLog`，动作名为 `party_created`/`party_updated`，但 `targetType` 写为 `client`。数据写入与审计写入不是同一事务；审计失败的原子性未被解决。

### 2.2 当前真实主体字段与客户字段

| 表单字段 | 当前写入位置 | 事实判断 |
|---|---|---|
| 姓名 | `clients.name` | 兼容主体基本字段，同时也是客户姓名 |
| 电话 | `clients.phone` | 兼容主体联系方式，同时是客户必需列 |
| 邮箱、LINE ID | `clients.email`、`clients.line_id` | 共享联系方式字段 |
| 主体类型 | `clients.notes` 元数据行 | 显式值存在，但不是独立列 |
| 主体角色 | `clients.notes` 元数据行 | 只保存一个显式角色 |
| 关联提示 | `clients.preferred_area` | 实际是客户意向区域字段，不是关系事实 |
| 备注 | `clients.notes` 元数据与备注混合字符串 | 会与客户备注共享并可能重建 |
| `purpose` | `clients.purpose` | 客户业务字段；当前由主体角色推导写入 |
| 阶段、温度、预算、合同、AML、跟进 | 对应 `clients` 列 | 客户业务字段，不属于已证明的主体基本资料 |

`Client` 只能称为当前兼容持久化来源，不能在产品规范中写成“客户就是主体”。

### 2.3 类型、角色和角色数量

`src/lib/party-profile.ts` 当前显式类型只有：

- `individual`
- `corporate`

当前角色枚举只有：

- `applicant` 申请人
- `tenant` 入居者/租客
- `co_occupant` 同居人
- `emergency_contact` 紧急联系人
- `guarantor` 连带保证人
- `owner` 所有者
- `landlord` 贷主/出租方
- `buyer` 买主
- `seller` 卖主
- `broker_company` 仲介公司
- `management_company` 管理公司
- `other` 其他

没有独立的 `borrower`、`lender` 或“法人代表”枚举；不能把近似词自动当作同一业务含义，也不能在本任务补新值。

数据模型和表单字段均为单个 `role`。编辑表单是单选 `<select>`，notes parser 也只返回一个 `role`；`HubPartyItem.explicitRoles` 只是把单值包装成数组。因此当前不能表达“一名主体多个角色”，页面不得临时拼接多角色。

### 2.4 创建与编辑差异

- 创建使用共享 `PartyProfileForm`；编辑页没有复用该组件，而是内联另一套 JSX。
- 两者共用 `parsePartyProfileForm` 和 `buildPartyProfileNotes`，但页面字段布局、按钮数量、返回路径和错误表现不同。
- 创建页面姓名输入没有 `required`，Action 缺少姓名时会生成按日期命名的 `新規関係者/新主体/새 관계자`；编辑页面姓名有 HTML `required`，Action 缺少姓名时抛错。
- 类型和角色在创建/编辑表单均默认 `individual`/`applicant`。编辑读取缺失显式元数据时也回落到这两个值，而不是显示“未设置”。
- 创建有“保存”与“保存并返回列表”两个 submit；编辑只有一个保存按钮。
- 创建成功默认进入 `/parties/{id}/edit?flash=party_created`，也可进入 `/parties?focus={id}&flash=party_created`；编辑成功默认留在编辑页，也可进入带 `focus` 的列表。
- `/parties` 当前只读取 `q/type/lifecycle/page/flash`，不建立 `focus` 选中模型，因此 Action 传回的 `focus` 不会恢复对象选中或触发链接焦点。

### 2.5 保存副作用

`createPartyProfileAction` 创建 `Client` 时还会写入客户默认值：

- `purpose = inferPurposeFromPartyRole(partyRole)`
- `stage = lead`
- `temperature = medium`
- `budgetType = total_price`
- `loanPreApprovalStatus = not_applied`
- `brokerageContractType = none`
- `amlCheckStatus = not_required`

`updatePartyProfileAction` 虽然保留大部分既有客户字段，但会：

- 根据主体角色重写客户 `purpose`；
- 把 `relationHint` 写回客户 `preferredArea`；
- 用新构建的 metadata + 备注字符串覆盖 `clients.notes`。

因此编辑主体可能直接改变 `/clients` 中的客户用途、意向区域和备注显示；这不是仅维护主体事实。

### 2.6 草稿行为

只有共享 `PartyProfileForm`（当前由新建页使用）接入 `FormDraftAssist`；编辑页使用内联表单，不接入该组件。

已验证行为：

- 自动保存监听 `input`/`change`，300ms 后写入浏览器 `localStorage`；
- 新建 key 为固定的 `draft:parties:new`，复用 key 为固定的 `reuse:parties:profile`；没有用户、租户、版本或来源上下文；
- 提交事件先把复用字段写入 reuse key，再立即删除当前草稿；它不等待 Server Action 成功；
- 服务端校验失败、权限失败或网络失败时，草稿仍可能已被清除；复用值还可能被另一用户或另一租户的同一浏览器 profile 看到。

这不是业务保存、审计或成功确认，不能在目标结构中称为可靠草稿恢复。

### 2.7 导航、权限、错误和响应式现状

- 两页都要求 `record.update`；更新 Action 使用租户范围读取并额外核对 `ownerUserId`，不存在对象时抛错或页面 `notFound()`。
- 新建页返回链接只有 `/parties` 或 `from=entry` 时的 `/import-center`；编辑页返回链接固定为 `/organize-center?type=party&focus={id}`。没有 `returnTo` 白名单，也不携带 `/parties` 的筛选、页码、滚动或触发焦点上下文。
- 表单没有结构化 Action state、错误摘要、字段错误、`aria-invalid`、`aria-describedby` 或错误焦点；服务端错误以抛出异常处理。
- 没有 IME 组合态 Enter 防误提交机制。原生 label/input/select 提供基础 Tab 顺序，但没有运行证据。
- 新建页和编辑字段主要使用 `md:grid-cols-3`；编辑页额外使用 `ObjectWorkbenchShell`，桌面宽度达到 `2xl` 才形成左右工作台，较窄桌面和 768px 会自然堆叠/压缩。390px 的单列表现仅是代码推断。

## 3. 代码推断

- 当前主体页面的“表单成功”实际意味着一次 `Client` 写入加 notes 元数据更新，而不是独立主体事实写入。
- 类型/角色显式元数据只在 notes 行可追溯；缺失时 Hub 列表能显示“未设置”，但编辑表单默认值会把未设置转换为显式 `individual/applicant`，保存后改变原事实。
- 编辑页的主体资料工作台不是独立 Object Page 路由，但左侧进度工作台、章节状态和右侧编辑表面构成了第二套“主体资料完成”叙事。
- 返回链接和 `focus` 参数看起来提供上下文恢复，但当前列表忽略 `focus`，因此不能据此宣称返回上下文恢复成立。
- `relationship-tree` 是独立次级入口；其部分主体/物件关系使用 `preferredArea` 与名称的字符串匹配，不能视为本表单可维护的权威关系模型。

## 4. 非权威字段或算法

必须登记为非权威、不得带入目标结构：

1. `mapPartyType` 在缺少显式 metadata 时根据名称包含“株式会社/有限会社/法人”推断法人，否则推断个人。
2. `buildRoleTags` 在缺少显式 role 时根据 `purpose`、`stage` 生成“自住/投资意向、买方候选、已成交”等角色标签。
3. `inferPurposeFromPartyRole` 把主体角色映射为客户 `self_use` 或 `investment`，不是主体角色事实。
4. 编辑页 `basicCompleted`、`completed/total`、百分比、`complete/missing/optional` 状态只由字段是否 truthy 计算，没有主体完成度契约。
5. `relatedPropertyHint`/`relationHint` 是 `preferredArea` 字段的兼容别名，不是主体-物件关系。
6. `focus` 不是已成立的主体 selected 状态；当前列表只把它当作未消费的查询参数。
7. `FormDraftAssist` 的“自动保存/保存済み”只是浏览器 localStorage 状态，不是业务写入或审计事实。

## 5. 必须保留的主体业务能力

- 在现有权限和租户边界内创建、读取、编辑主体兼容记录。
- 明确保存的主体名称、联系方式、显式类型和显式角色；缺失时保持“未设置”，不以客户字段补造。
- 当前角色枚举及其现有业务文案，直到产品负责人决定是否另立领域任务调整枚举。
- 个人/法人共用当前已验证字段模型；没有权威契约的法人扩展字段暂不添加。
- 审计记录、Not Found、权限拒绝和租户作用域；不因页面迁移删除现有能力。
- 关系图作为次级导航入口，不把关系图内容复制进基本资料表单。
- 与客户列表兼容读取的必要字段，但必须明确哪些是客户字段、哪些是主体兼容字段。

## 6. Client 兼容存储造成的产品风险

1. 主体更新会重写客户 `purpose`，使客户阶段/用途/温度模型与主体角色发生隐式耦合。
2. 关系提示写入 `preferredArea`，会把非权威关系文本显示为客户意向区域，并可能被客户列表搜索读取。
3. notes 同时承载主体 metadata、主体备注和其他客户备注；编辑保存可能丢弃未被 `extractFreeformPartyNote` 识别的文本行。
4. 当前 `Client.phone` 在数据库中是非空列，主体表单却允许空电话；真实 PostgreSQL 写入契约需另行确认，不能用页面静态行为替代。
5. 审计 `targetType=client` 而动作名为 `party_created/party_updated`，下游按主体或客户筛选时存在语义分裂。
6. 类型和角色无独立列，按 notes 文案解析受语言、历史文案和手工编辑影响；缺失与非法 metadata 的修复语义未定义。
7. 单角色存储无法表达同一主体在不同案件中承担多个角色；页面不得通过拼接字符串制造假多角色。

## 7. 未验证项

- 服务启动后仍返回 `listen EPERM: operation not permitted 0.0.0.0:3002`，因此没有浏览器页面或截图证据。
- 真实新建、编辑、空字段、非法字段、Not Found、权限拒绝、审计失败和成功跳转行为。
- memory 与 PostgreSQL 在当前数据库实例上的实际写入结果、schema 应用状态和租户隔离。
- 1440px、768px、390px 的真实布局、横向溢出和长文本表现。
- Tab/Enter、IME 组合输入、错误焦点、浏览器返回和触发链接焦点。
- `FormDraftAssist` 在真实多用户、多租户浏览器环境中的泄漏与清理表现。
- 关系图使用的字符串匹配是否在真实数据中产生误关联。
- 现有角色枚举是否满足申请人、借主、贷主、所有人和法人代表的业务覆盖。

## 8. Checkpoint B 前需要产品负责人决定的问题

1. W7-C 是否继续使用 `Client` 作为兼容存储；若继续，哪些字段被批准为主体字段，哪些客户字段必须禁止由主体表单写入？
2. 类型和角色继续放在 `notes` 适配层是否是本任务可接受的临时契约；缺失时是否只显示/记录“未设置”，并禁止表单默认回落？
3. 当前单一角色模型是否足够；若需要多角色，应另立领域模型任务，不在页面层拼接。
4. 当前枚举是否覆盖法人代表、借主、贷主等业务角色；若不覆盖，是否另立枚举/领域任务？
5. `relationHint` 是否从主体基本表单移除；真实主体-物件/案件关系应由哪个权威数据源维护？
6. 是否禁止主体编辑修改客户 `purpose`、`preferredArea` 和非主体备注；若不能在兼容模型中隔离，是否先冻结 W7-C 实现？
7. 是否移除 `FormDraftAssist` 的主体默认调用，直到补齐用户/租户/版本边界和成功后清理契约？
8. 创建是否必须由用户明确输入名称，还是继续允许日期生成的默认主体名称？电话是否受当前 `clients.phone NOT NULL` 兼容约束？
9. 创建/编辑是否统一为一个保存主操作、严格 `returnTo` 白名单、结构化错误摘要和固定错误焦点；`/import-center` 是否继续作为任何返回来源？
10. 关系图仅作为次级入口，是否明确冻结其字符串推导关系，不在 W7-C 解决关系模型？

## 9. Checkpoint A 结论与停止条件

当前页面不能原样作为 Responsive Form 迁移基础：主体兼容写入与客户事实、副作用、完成度工作台和草稿清理边界尚未分离。建议 Checkpoint B 先由产品负责人确定兼容字段契约、角色模型和关系入口边界，再制定单一目标结构。

本轮审计已完成；不编写目标结构、不修改业务代码、不启动实现或审查 Agent，等待产品负责人复审。
