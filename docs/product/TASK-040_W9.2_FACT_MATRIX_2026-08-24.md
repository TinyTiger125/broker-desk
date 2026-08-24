# TASK-040 W9.2：案件、人物、物件事实矩阵

**盘点日期：** 2026-08-24
**盘点性质：** 只读事实盘点；未修改产品代码、数据库或 migration
**代码快照：** `b20d8a6fb96bb6cc5a7772b2ec143bb6dc39e999`
**前置状态：** W9.1 `Accepted / Runtime Verified / Integrated`；W9.2 已获准进入有限实现，当前仅实施首两个安全硬门。

## 0. 证据分层

- **F（代码事实）**：由当前仓库源码、migration 或脚本直接确认。
- **R（运行事实）**：由 W9.1 隔离非生产 PostgreSQL 运行记录确认。
- **U（未验证）**：当前没有足够运行证据，不能写成已通过。
- **D（设计要求）**：产品负责人已经批准、但尚未实现的 W9.2 约束。

本表把 F/R/U/D 分开。W9.1 的 R 只证明租户级和记录级数据库边界，不等于 W9.2 所有页面、搜索、导出和同公司成员可见性已经运行通过。

## 1. 三类核心对象统一矩阵

| 对象 | 主表/对象标识 | 旧字段当前语义（F） | W9.1 新字段当前语义（F） | 当前负责人/范围 | 旧数据结论 |
|---|---|---|---|---|---|
| 案件 | `public.brokerage_cases.id`；内存类型 `BrokerageCase` | `user_id` 是既有案件读取/写入路径使用的用户绑定；并非完整的可见范围模型 | `created_by_user_id` 记录创建事实；`current_owner_user_id` 记录当前负责人；`visibility_scope` 为 `private/company_read`；`owner_resolution_status` 为 `resolved/pending_confirmation` | W9.1 PostgreSQL RLS：`resolved` 且 `private` 仅当前负责人；`company_read` 同租户 active 成员可读、写入仍限当前负责人 | 可靠旧 `user_id` 回填 owner/creator，默认 private；不可靠时应保持 pending、fail-closed |
| 人物/客户 | `public.clients.id`；内存类型 `Client` | `owner_user_id` 是既有列表和写入路径使用的负责人字段；详情读取原先只带 tenant+id | 与案件相同，另保留 `owner_user_id` 作为兼容字段 | W9.1 RLS 同上；当前应用列表按 `owner_user_id`，详情层仍存在 tenant-only 入口 | 可靠旧 `owner_user_id` 回填；无法识别时不得猜测为负责人 |
| 物件 | `public.properties.id`；内存类型 `Property` | 没有被确认可靠的旧负责人列；旧详情/列表存在 tenant 范围路径 | `created_by_user_id`、`current_owner_user_id`、`visibility_scope`、`owner_resolution_status`；默认 pending | W9.1 RLS 同上；现有应用 `listQuoteFormData/getPropertyById/updateProperty` 仍有 tenant-only 风险 | 无可靠旧 owner 时统一 `pending_confirmation`，普通成员不可见 |

### 1.1 字段不可混同

`created_by_user_id` 是历史事实，不能当作当前负责人；`current_owner_user_id` 是未来可受控接管的状态；旧 `user_id/owner_user_id` 只能作为兼容/回填来源，不能继续作为唯一可见性依据。W9.1 已把三类对象的新增字段加入模型，但尚未把所有旧页面和入口统一切换到可见性解析器。

## 2. 创建、导入、复制、合并和系统生成

| 路径 | 案件 | 人物 | 物件 | 目前负责人语义/风险 |
|---|---|---|---|---|
| 正常新建 | `createBlankBrokerageCaseAction` → `saveBrokerageCaseExtractionReview`；新行把 `userId/createdBy/currentOwner` 设为当前用户 | `createPartyProfileAction`/`createPartyQuickAction` → `addClient`；`ownerUserId` 与新 creator/current owner 初始相同 | `createPropertyQuickAction` → `addProperty`；当前 action 传当前用户作为 creator/current owner | F：新建时创建者与当前负责人初始相同，但数据模型已分开；D：W9.2 普通创建不得让客户端提交 creator |
| 导入 | `input-files/upload`、`excel-import-processor`、`identity-import-processor` 最终调用案件/人物/物件写入适配器 | 同左 | `executePropertyImportAction` 等路径调用 `addProperty` | D：导入资料初始负责人应为执行导入成员，创建者仍记录导入动作的事实；不得使用被导入对象的外部联系人作为 owner |
| 复制/拆分 | `rollbackBrokerageCaseMerge` 创建拆分案件；当前实现显式继承源案件四个 W9.1 字段 | 无独立人物复制入口被确认 | 无独立物件复制入口被确认 | F：案件拆分不应凭空改变 creator；D：所有复制路径必须明确“继承 creator”还是“创建新 creator” |
| 合并 | `mergeBrokerageCaseExtractionReview` 更新内容和来源导入 ID，不更新 creator/current owner | 人物/物件没有统一合并事实入口 | 同左 | F：案件合并保留原行归属；D：合并不得覆盖 creator；来源 owner 冲突必须 fail-closed 或进入受控修复 |
| 系统生成 | `addGeneratedOutput`/`finalizeGuaranteePreviewOutput` 生成输出，记录 `user_id/actor_id`、案件及蒙板版本快照 | 不生成核心人物 | 不生成核心物件 | F：生成文件有操作者和快照；D：W9.2 只盘点，不改 PDF/附件来源权限链 |

## 3. 内容、负责人和可见范围更新入口

### 3.1 当前已确认入口（F）

| 更新类别 | 入口 | 当前行为 | W9.2 前必须关闭的风险 |
|---|---|---|---|
| 案件内容 | `updateBrokerageCaseConfirmedData`、`saveBrokerageCaseExtractionReview`、`mergeBrokerageCaseExtractionReview`、`saveCaseWorkbenchAction`、QA review API | 输入主要是案件内容、标题、来源导入 ID；当前不接受 creator 字段 | 必须统一 current owner/active membership 门；`getBrokerageCaseByImportJobId` 也必须排除 pending |
| 人物内容 | `updateClient`、`updatePartyProfileAction` 及 actions 中的联系人/跟进写入 | 当前输入不含 creator/current owner，但 memory/Postgres 适配器的更新查找主要是 tenant+id | 不能因“输入没带 creator”就把 tenant-only 更新视为安全；必须有服务端 actor 与 owner 约束 |
| 物件内容 | `updateProperty`、`updatePropertyProfileAction` | 当前按 tenant+id 更新；没有统一 actor/owner 门 | 同公司非负责人可能直接更新；W9.2 必须 fail-closed |
| 负责人更新 | `setRecordVisibilityScope`；W9.1 已要求 DB current subject 与 actor 绑定 | 仅当前 owner、active membership、resolved 可修改范围 | W9.2 不实现接管；普通内容更新不得顺带改变 owner |
| 默认值更新 | `setMemberVisibilityDefault`；按 tenant+membership+member+object_type upsert | 只能 active member 修改自己的默认值，三类 object_type 独立 | W9.2 读取页面须只读本人设置；默认值修改只影响之后新建资料 |
| 生命周期 | `setRecordLifecycleStatus` → 三类 lifecycle action | 案件/人物按 owner 过滤；物件状态路径仍较宽 | suspended/removed 后不能通过旧 lifecycle 或 tenant-only 入口恢复读取/写入 |

### 3.2 创建者字段覆盖检查

当前普通更新函数的 TypeScript 输入没有公开 `createdByUserId`/`created_by_user_id`，这是正向事实；但数据库策略尚未强制 creator 不可变，且 `addProperty` 等创建函数接收 creator/current owner 参数。W9.2 的创建者不可变门必须同时覆盖：正常更新、负责人变更、范围变更、客户端伪造字段、普通运行角色 SQL、合并/拆分和数据修复。

## 4. 读取路径统一矩阵

| 读取面 | 当前入口 | 当前过滤事实 | 当前缺口/状态 |
|---|---|---|---|
| 案件列表 | `/organize-center`、`/app`、保证申请页；`listBrokerageCases(userId, limit, tenantId)` | 案件列表按 `userId + tenantId + resolved + lifecycle`，不是 `visibility_scope` 的统一解析 | 只覆盖案件；分页和公司可见案件尚未产品化；W9.2 需同一 predicate 做 rows 与 count |
| 案件详情 | `/cases/[id]` → `getBrokerageCaseById` | 当前按 `userId + tenantId + id + resolved` | 需明确 company_read 同公司成员读取，以及统一 404/未找到语义 |
| 人物列表 | `/parties` → `listHubParties` → `listClients` | `listClients` 按 owner user + tenant + resolved；页面再做搜索/生命周期过滤 | 当前不能表示同公司 company_read；分页总数是应用层过滤结果 |
| 人物详情 | `/clients/[id]`、`/parties/[id]/edit` → `getClientById/getClientDetail` | 当前函数按 `tenantId + id + resolved`，无 actor | 这是 W9.2 高风险入口：同租户非 owner 可能直接 URL 读取；详情还附带 quotes/tasks/properties |
| 物件列表 | `/properties` → `listHubProperties` → `listQuoteFormData` | `listQuoteFormData` 按 tenant + resolved；不带 actor | 当前会将同租户 resolved 物件带入 hub；需改为统一可见性 predicate |
| 物件详情/编辑 | `/properties/[id]/edit` → `getPropertyById/updateProperty` | 当前按 tenant + id + resolved；更新亦按 tenant + id | 非负责人详情/更新风险；必须在 W9.2 收口 |
| 搜索 | `/api/hub/search` → `searchHubItems`；hub 内 properties/parties/contracts/requests/outputs 多路聚合 | 当前 route 没有 `requireTenantSession`，`resolveHubContext` 无 context 时可回退 `getDefaultUser()` | **当前 P1 事实缺口**：未认证/无 tenant 请求可能落到默认用户上下文；W9.2 必须先加 session+tenant，再做 visibility filter |
| 建议/空状态 | `searchHubItems` 和各页面 client-side filter | 依赖 hub 聚合结果；存在 tenant-only related maps | 搜索建议、数量、空状态不得暴露 pending/private 存在 |
| 分页数量 | `/parties`、`/properties` 页面对已取数据再过滤并计算 | 不是数据库层可见性 count | W9.2 必须“先授权过滤、再 count/分页”，不能把总量当 side channel |
| 导出 | `/api/hub/export` | route 有 `record.read` session，并传 user+tenant context；内部 hub 仍有 tenant-wide related data | 导出必须与页面同一授权查询，不能先全量取 tenant data 再 client filter |
| 直接 URL | 案件、人物、物件详情页和 API | 部分页面有 session/capability，但底层详情函数仍 tenant-only | 无权对象统一 404/“未找到或无权访问”，不得区分不存在/存在但无权 |

## 5. RLS 与应用授权的职责边界

### 5.1 已由 RLS 证明的内容（F/R）

- W9.1 002 对 `clients/properties/brokerage_cases` 强制 `owner_resolution_status='resolved'`。
- `private` 仅 `current_owner_user_id = brokerdesk_private.current_user_id()` 可读写。
- `company_read` 同租户 active 成员可读，写和删仍要求当前 owner。
- `pending_confirmation` 不可读。
- `can_access_tenant` 和 request-scope current subject 负责经营主体边界；`brokerdesk_runtime` 非 SUPERUSER、无 `BYPASSRLS`、不拥有业务表。
- W9.1 运行记录证明合法 A 上下文可读非零授权数据，伪造/失效/跨租户上下文不能扩大；C 空租户路径单独标记为 `inconclusive-empty`，另有非成员→有数据租户对照证据。

### 5.2 当前仍由应用层承担或尚未统一的内容

- 同公司页面入口、详情、搜索、导出、关系图、附件和 PDF 来源的 actor/来源权限组合。
- 旧函数的 user/tenant 参数完整性和调用方 session 绑定。
- 公司负责人、表格管理员没有内容绕过。
- 统一 404、搜索、计数和导出 side-channel 处理。
- 创建者不可变：当前 RLS 没有强制 `created_by_user_id` 不可修改。

结论：不能把 W9.1 的 RLS 运行证据写成“W9.2 页面/搜索/导出已通过”。W9.2 需要应用授权和 RLS 双门，并对每类对象分别验证。

## 6. 生命周期、多工作区与缓存事实

| 场景 | 当前事实 | W9.2 设计要求 |
|---|---|---|
| active membership | 默认值和 W9.1 record RLS 以 active membership/current subject 为前提 | 允许本人读取/写入；company_read 仅 active 成员读取 |
| suspended/removed | W9.1 默认值读取/写入和 record RLS 不再满足 active/resolved 条件；旧页面仍有部分 tenant-only 查找 | 统一拒绝内容读取、写入和范围变更；不自动公开、删除、转交 |
| pending/unknown owner | properties 及不可靠旧数据为 `pending_confirmation`；RLS 隐藏 | 列表、详情、搜索、导出、API 均不可见；只允许治理元数据/受控修复识别 |
| 多工作区切换 | tenant session/current company cookie 由 TASK-039 基线维护；数据适配器多数接受 tenantId | 每次请求重新绑定 Clerk subject + tenant；失效/外来 tenant fail-closed；不得使用默认第一家公司 |
| 服务端缓存 | `hub.ts` 只有 `cache(resolveHubParties(locale,userId,tenantId,lifecycle))`；key 含 user+tenant | 所有可见性 fingerprint 必须进入缓存 key；禁止 tenant-only 结果复用到用户；无默认 user fallback |
| 浏览器预取 | 没有发现项目专用 `unstable_cache/revalidate`；Next Link 预取仍可能触发服务器请求 | 预取也必须走 session/tenant/visibility；身份切换后旧数据不可复用 |

## 7. 附件、关系图、PDF 只读盘点（不改实现）

- 附件列表/读取：`listAttachments`、`getAttachmentById`、`readPrivateAttachmentContent` 主要按 user+tenant；`readPrivateAttachmentContentForTenant` 是 tenant-only 内部能力，必须由上游权限门保护。
- 关系图：`/relationship-tree` 调用 hub 的人物、物件、合同、附件聚合，并可展示关联节点/附件名称；当前尚未证明隐藏对象不会通过关系图或附件名称泄露。
- PDF/历史输出：TASK-038 已证明公司表格、案件生成、历史文件和私有附件的产品权限与跨部署耐久性；但 W9.2 尚未把“所有来源资料的当前可见性”接入 PDF 生成/历史下载交集。
- 本节是边界盘点，不授权 W9.3 修改。W9.3 才处理关系图、附件、API、PDF 来源权限链。

## 8. 测试与运行证据覆盖

| 范围 | 已有证据 | 尚未证明 |
|---|---|---|
| W9.1 defaults/RLS | visibility contract、memory behavior、隔离 Neon migration/RLS 运行、重复执行、失败回滚、pending fail-closed、跨租户负向 | creator 数据库不可变；页面读取/写入改造 |
| 案件 | TASK-038 B-1/B-2 产品闭环、W9.1 案件非零运行样本 | 两名普通成员同公司 private/company_read；案件搜索/count/export 完整矩阵 |
| 人物 | W9.1 clients RLS 运行样本；旧人物页面已有 owner 列表 | 人物详情/搜索/建议/导出/关联任务和报价的可见性 |
| 物件 | W9.1 properties RLS/unknown pending 运行样本 | 物件列表/详情/编辑、引用物件的 tenant-wide quote data |
| 跨租户 | W9.1 runtime role 对照和非成员→有数据租户探针 | 全部页面/API/缓存/导出路径的黑盒证据 |
| 附件/PDF/关系图 | TASK-038 私有文件权限和历史输出证据 | 来源资料权限交集、关系图/附件名称隐藏 |

## 9. W9.2 实施前风险与本轮门控状态

1. `/api/hub/search` 的无 session/tenant context 与默认用户 fallback 已在本轮入口收口；真实运行与独立审查仍需单独记录。
2. `getClientById/getClientDetail/getPropertyById/listQuoteFormData` 等 tenant-only 读取不能直接作为 W9.2 页面数据源。
3. `updateClient/updateProperty/setPropertyLifecycleStatus` 等入口缺少统一 current owner/actor 门；不能只依赖页面隐藏按钮。
4. `created_by_user_id` 的数据库触发器、运行角色列权限和服务端输入拒绝已加入本轮首个硬门；真实受限角色与迁移运行仍需验证。
5. `getBrokerageCaseByImportJobId` 当前未显式排除 pending/resolution failure，需纳入统一 resolver。

第2、3、5项属于后续统一 resolver 与逐类页面接入，当前仍未修改；本轮只关闭首两个硬门，不代表 W9.2 页面可见性已完成。

## 10. 盘点结论

- 三类核心对象已经有统一 W9.1 元数据，但现有读取/写入入口仍是混合语义。
- W9.2 的最小正确顺序是：先完成并审查创建者不可变门与搜索入口门，再统一 actor+tenant+visibility resolver，随后逐类收口列表/详情/搜索/导出；关系图、附件、PDF 留在 W9.3。
- 在上述实施前，不能宣称“公司成员只读可见”已在产品页面成立，也不能用负责人/管理员身份绕过 private。

## 11. W9.2 最终合同（2026-08-24 修订）

1. 运行期授权只使用 `current_owner_user_id`、`visibility_scope`、`owner_resolution_status`、当前 tenant 和 active membership。
2. 旧 `user_id/owner_user_id` 只用于 migration 来源、审计和兼容展示；不能作为运行期授权 fallback。新字段无法确认时必须 `pending_confirmation` 并拒绝普通读取。
3. 普通请求若提交 creator、current owner、tenant 或 actor 字段，必须明确拒绝并记录安全事件；普通内容更新不得静默接受或改写这些字段。
4. W9.2 可以修改列表、详情、搜索、建议、count、导出及其直接依赖的 API/Server Action；关系图、附件内容、PDF 来源交集和历史下载仍属于 W9.3。
5. 没有独立可见范围的子资料继承父对象权限；引用其他案件、人物或物件时必须重新检查被引用对象权限。
6. `company_read` 成员可以页面读取、搜索和导出，但不能修改内容、附件、关联、生命周期、范围或负责人；页面必须显示明确只读状态。

因此，第一实施顺序固定为：先收口 `/api/hub/search` 的认证、当前 tenant 和默认用户 fallback，再关闭三类对象 creator 的数据库及服务端不可变门；两项独立审查 P0/P1 为 0 后，才建立统一 RequestContext/resolver 并逐类接入页面。
