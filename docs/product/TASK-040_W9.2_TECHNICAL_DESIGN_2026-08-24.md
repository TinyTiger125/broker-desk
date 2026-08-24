# TASK-040 W9.2：读取/写入与可见性统一技术设计

**设计日期：** 2026-08-24
**设计性质：** 只读盘点后的技术设计；本文件不授权本轮修改产品代码、数据库或 migration
**适用对象：** `brokerage_cases`（案件）、`clients`（人物/客户）、`properties`（物件）
**前置：** W9.1 已集成并运行验证；产品负责人已确认本设计和“创建者不可变门”，W9.2 当前仅进入首两个硬门的有限实现。

## 1. 目标、不变量和排除项

### 1.1 必须成立的不变量

1. `created_by_user_id` 是不可变历史事实；`current_owner_user_id` 是可在未来受控接管中变化的当前状态。
2. 普通内容更新、生命周期更新和可见范围更新不能提交或覆盖 creator。
3. 只有当前 active membership 下的资料负责人可以修改资料内容和可见范围。
4. `private` 只有负责人可读；`company_read` 同经营主体 active 成员可读但不可写；负责人仍是唯一写入者。
5. `pending_confirmation` 或 owner 缺失的数据对普通内容读取完全不可见；不以公司负责人或管理员身份绕过。
6. 所有列表、详情、搜索、建议、分页数量、导出和直接 URL 使用同一授权谓词；不能先读全量再在客户端隐藏。
7. 每次请求重新绑定 Clerk subject、active membership 和 tenant；无默认用户、默认公司或“第一家公司” fallback。
8. 三类对象分别解析，不能用案件结果代表人物或物件。
9. W9.2 不改变公司表格/蒙板共享语义，不进入关系图、附件、PDF 和完整接管改造。

### 1.2 明确不做

- 定向成员分享、共同编辑、部门/团队权限。
- 资料接管 UI、接管审计和长期保留/删除；只预留 owner 状态边界。
- 关系图、附件权限、PDF 来源交集和历史下载重构（W9.3）。
- Production migration、Production 数据迁移或正式环境开关。

## 2. 创建者不可变门（W9.2 入口硬门）

### 2.1 数据库层契约

三张核心表的 `created_by_user_id` 必须由数据库保护：普通 `brokerdesk_runtime` 更新尝试只要使新旧值不同就拒绝。当前以每表 `BEFORE UPDATE` 不可变触发器作为权威不变量；列级 `REVOKE` 仅是纵深防御，不能替代触发器，也不能假设它覆盖既有整表 `UPDATE` 授权。普通运行角色不能获得绕过触发器的路径。

触发器/函数应同时覆盖：

- `clients`、`properties`、`brokerage_cases` 的普通更新；
- 当前负责人变化；
- `visibility_scope` 变化；
- 合并、拆分和导入后的更新；
- 客户端伪造 `created_by_user_id` 字段；
- 运行角色直接 SQL 更新。

受控数据修复若确实需要改 creator，必须是独立的、显式命名的修复流程，要求单独权限、原因、旧值/新值、操作者和审计记录；不得复用普通更新接口。

### 2.2 应用层契约

- 所有普通 DTO/schema 均不接受 creator 字段；若客户端提交该字段，选择“忽略并记录输入异常”或“拒绝请求”，但不能静默写入。
- `createdByUserId` 只能在创建路径由服务端从当前 Clerk→本地用户解析得到；不能来自表单、query、导入文件中的联系人 ID。
- `currentOwnerUserId` 在 W9.2 普通内容更新中也不接受；未来接管另立 endpoint。
- 合并/拆分必须明确继承源 creator；已有 `rollbackBrokerageCaseMerge` 的四字段继承行为保留并纳入测试。

## 3. 统一请求与可见性解析器

### 3.1 请求上下文

所有页面、Server Action 和 API 先生成不可伪造的：

```text
RequestContext = {
  externalAuthSubject,
  userId,
  tenantId,
  membershipId,
  membershipStatus,
  capabilities
}
```

要求：

1. `requireTenantSession` 成功后才进入业务查询。
2. `tenantId` 必须来自当前有效工作区上下文并验证 membership；query/body 中的 tenant 只能作为候选，不能覆盖 session。
3. 每个 Postgres 事务在业务 SQL 前绑定 transaction-local subject；适配器再用数据库 current user 复核 actor。
4. 缺失、失效、suspended、removed、伪造或跨经营主体上下文统一 fail-closed；不得改造成“空列表但实际读取了全量”。

### 3.2 统一读取谓词

对三张表统一抽象为 `readableRecord(ctx, record)`：

```text
tenant_accessible(ctx.tenantId)
AND owner_resolution_status = 'resolved'
AND current_owner_user_id IS NOT NULL
AND (
  current_owner_user_id = ctx.userId
  OR (visibility_scope = 'company_read' AND ctx.membership.status = 'active')
)
```

数据库 RLS 作为底线；应用解析器不得扩大 RLS 结果。对于 `pending_confirmation`、无 owner、无 membership 的记录，列表、详情、搜索、建议、count、导出和 API 均表现为“不存在”。

### 3.3 统一写入谓词

```text
ctx.membership.status = 'active'
AND ctx.tenantId = record.tenant_id
AND record.owner_resolution_status = 'resolved'
AND record.current_owner_user_id = ctx.userId
```

- 内容编辑：只允许更新内容字段，不允许带 creator/current owner/scope 的混合 payload。
- 范围编辑：只允许负责人变更 `private ↔ company_read`，每次写审计。
- `company_read` 对其他成员永远没有写能力；公司负责人和表格管理员不增加内容绕过。
- lifecycle 写入也必须走同一 owner/actor 门；暂停/移除 membership 不能自动转移、公开或删除资料。

## 4. 各对象适配器和接口契约

### 4.1 案件

- 列表/详情/导入 review/merge/rollback 均接受完整 `RequestContext` 或不可伪造 actor，而不是只传可伪造的 userId。
- 既有 `user_id` 保留为兼容/历史绑定字段；新授权以 `current_owner_user_id + visibility_scope + owner_resolution_status` 为准。
- `getBrokerageCaseByImportJobId` 必须和其他案件读取一样排除 `pending_confirmation`。
- `rollbackBrokerageCaseMerge` 继承 creator/current owner/scope/resolution；不创建新 owner 事实，不覆盖 creator。

### 4.2 人物

- `listClients/getClientById/getClientDetail` 都必须带 actor+tenant，并在数据库查询层过滤 private/company_read。
- 详情返回的 quotations、followups、tasks、related properties 不能因人物可读而自动扩大关联物件可见范围；关联项各自再次解析。
- `owner_user_id` 仅兼容字段；新建时由服务端把执行成员写为 creator/current owner，普通更新不能改变 creator。

### 4.3 物件

- `listQuoteFormData/getPropertyById/updateProperty/setPropertyLifecycleStatus` 不得继续只用 tenant+id。
- 可靠 owner 由创建/导入路径设置；pending 的旧物件不进入普通成员列表、详情、建议或导出。
- 被人物/案件引用不等于可见；引用方必须同时有物件读取权。

## 5. 列表、搜索、建议、分页和导出

### 5.1 查询顺序

所有集合查询必须在数据库/适配器层先完成：`tenant + actor + status + visibility + lifecycle`，再做业务筛选、排序、分页。禁止先取 tenant 全量记录再由 React 或 route 过滤。

### 5.2 数量和分页

- `total_count`、`has_next_page`、空状态只基于 `readableRecord` 结果。
- 隐藏对象不占用 page size，不影响 count，不影响“还有更多”判断。
- client-side filter 只能处理已经授权的字段，不能承担权限。

### 5.3 搜索/建议

- `/api/hub/search` 必须先 `requireTenantSession({ permission: 'record.read' })`，禁止 `resolveHubContext` 的默认用户 fallback。
- 建议词、名称、电话、附件名、数量和错误均不得透露隐藏对象存在；无权对象和不存在对象统一空结果/404。
- 搜索跨对象聚合时，每类对象独立应用谓词，不能因为可见案件而暴露不可见人物/物件。

### 5.4 导出

- `/api/hub/export` 使用和页面相同的已授权集合查询；CSV 行、dashboard counts、关联字段都不能包含隐藏对象。
- `ids` 只能缩小已授权集合，不能直接点名读取未授权记录。
- 导出失败不能回显数据库错误、对象名称或是否存在。

## 6. 直接 URL、Server Action 和 API

### 6.1 直接 URL

案件、人物、物件详情页在 session/tenant 后查询单条记录；无权记录返回统一 `notFound` 或同等“未找到或无权访问”页面。不得返回不同的“无权限/不存在”细节。

### 6.2 Server Action

Action 不能信任隐藏表单中的 userId、tenantId、creator、owner 或 scope。先从 Clerk session 解析 context，再调用适配器；所有失败都留在当前对象上下文并使用脱敏错误。

### 6.3 API

所有读取 API 必须有：认证、当前 tenant、对象级可见性、输出脱敏和稳定错误码。公开健康检查例外只返回健康状态，不返回业务资料。无 session 的 hub search 是 W9.2 首个必须关闭的当前事实缺口。

## 7. 公司负责人、表格管理员和成员状态

- 公司负责人、表格管理员的 capability 只管理经营主体/公司表格，不构成私有案件、人物、物件内容通览权。
- `company_read` 只读；active 同公司成员可以读，不能编辑、转移负责人或改范围。
- suspended/removed membership 不能继续读取原公司私有内容，也不能写默认值/范围；资料本身保留，不自动转移、公开或删除。
- 重新加入形成新 active membership 时，不自动继承旧 membership 默认值；新默认值需显式建立。
- 多工作区切换每次重新校验 tenant；失效 cookie/外来 tenant 不得回退为第一家公司。

## 8. 缓存、预取与身份隔离

现有 `hub.ts` 的 `cache` key 已含 locale/userId/tenantId/lifecycle，但 W9.2 需要把可见性版本/权限指纹也纳入 key，并保证结果只由已授权集合生成。

- 禁止持久化 tenant-only 业务结果供不同用户复用。
- 不使用 `getDefaultUser()` 作为已认证请求 fallback。
- Next Link 预取、刷新、返回和切换公司都必须重新执行 session/tenant/visibility 查询；旧页面数据只能作为显示缓存，不能作为授权依据。
- 任何 server memoization 失效时，宁可重新查询，不返回上一身份/上一公司的数据。

## 9. 兼容、回滚和默认关闭

### 9.1 旧接口兼容

- 旧 `user_id/owner_user_id` 保留为读兼容字段和迁移审计来源；不再作为唯一授权依据。
- 旧调用若无法提供 actor+tenant，必须返回空/拒绝，而不是使用默认 tenant/user。
- 公司表格、蒙板和平台工具继续走原公司共享路径，不接入案件/人物/物件 visibility resolver。
- W9.2 采用双读兼容：先读取新字段；旧记录缺字段时只允许已验证的安全 fallback，无法确认 owner 就 pending，不自动归负责人或公开。

### 9.2 默认关闭

- W9.2 feature gate 默认关闭，仅在指定非生产 allowlist/staging 开启。
- Production 不连接、不迁移、不执行页面写入验证。
- TASK-039 已验收的成员/经营主体链路必须回归；TASK-038 公司表格和 PDF 基线不能被改动。

### 9.3 回滚边界

- 只允许追加式 migration；不要求破坏性 down migration。
- 实施验证使用可销毁 Neon 分支或快照恢复；中途失败必须整笔事务回滚，并保留 ledger/checksum 记录。
- 应用回退时旧读路径仍能读取兼容字段，但 pending 数据继续 fail-closed，不因回滚短暂公开。
- 已写入的 creator/owner/scope 数据不能靠 Git 回退删除；必要恢复使用数据库快照/分支销毁和受控修复审计。

## 10. W9.2 分阶段实现与验收顺序

1. 先关闭 creator immutable gate：数据库与服务层各一条证明；伪造 creator、普通更新、负责人/范围更新、合并/拆分均拒绝覆盖。
2. 建立统一 `RequestContext` 和 resolver，先案件、再人物、再物件；memory/Postgres 语义一致。
3. 收口列表、详情、直接 URL、Server Action；每类对象分别做 private/company_read/pending/active/suspended/removed/跨租户测试。
4. 收口搜索、建议、分页 count 和导出；要求隐藏对象没有数量/空状态/错误侧信道。
5. 在受控非生产 Staging 做两名普通成员、两家公司、三类对象的黑盒验证。
6. W9.2 通过前不进入 W9.3 的关系图、附件、API/PDF 来源权限链。

## 11. 设计验收门

进入有限实现前，产品负责人需要确认：

- creator 不可变门的“普通更新/负责人变化/范围变化/合并拆分/伪造输入/运行角色 SQL”覆盖范围；
- company_read 只读、不附带共同编辑；
- private 无存在泄露，管理员不绕过；
- 默认值按 membership+member+object_type 保存，且只影响未来新建资料；
- pending 旧数据继续 fail-closed；
- W9.2 不实现接管、关系图、附件、PDF、Production migration。

本文件完成的是设计，不是实现通过证明。任何一项设计门未确认，W9.2 不能进入写接口改造。

## 12. 最终合同修正与有限实现顺序

### 12.1 授权字段唯一来源

运行期授权只允许使用：

- `current_owner_user_id`
- `visibility_scope`
- `owner_resolution_status`
- 当前 tenant
- 当前 active membership

旧 `user_id/owner_user_id` 仅可用于 migration 来源、审计和兼容展示；不能在运行期作为授权 fallback。新字段无法确认时必须保持 `pending_confirmation` 并拒绝普通读取。

普通请求一旦提交 `creator`、`current owner`、`tenant` 或 `actor` 字段，必须明确拒绝并记录安全事件；普通内容更新不得静默忽略、接受或改写这些字段。服务端从 session 生成可信 actor/tenant，客户端不能提供替代值。

### 12.2 子资料继承规则

没有独立可见范围的子资料继承父对象权限。任何引用其他案件、人物或物件的查询都必须对被引用对象再次运行 `readableRecord`；父对象可读不自动授权被引用对象。

`company_read` 成员可在页面读取、搜索和导出，但写入内容、附件、关联、生命周期、范围和负责人全部拒绝。页面必须显示明确的“只读”状态，而不是仅隐藏按钮。

### 12.3 首两个安全硬门

有限实现不得同时大面积修改三类页面，顺序固定为：

1. **搜索入口硬门**：`/api/hub/search` 先执行认证、当前 tenant 和 `record.read` 权限检查；显式传递 user+tenant context；删除无 context 时 `getDefaultUser()` fallback；错误响应不回显内部消息。
2. **创建者不可变硬门**：三张核心表由数据库保护 `created_by_user_id` 不可变，服务层输入 DTO 排除 creator/current owner/tenant/actor；普通请求伪造字段拒绝并记安全事件。
3. 只有上述两项独立审查 P0/P1 为 0，才建立统一 `RequestContext`/`visibility resolver`，再按案件→人物→物件接入列表、详情、搜索、建议、count 和导出。

### 12.4 W9.2 边界重申

本轮不进入关系图完整改造、附件权限扩大、PDF 来源权限交集、历史下载、资料接管、定向分享、共同编辑、Production migration 或 Production 部署。W9.3 继续负责关系图、附件和 PDF 来源权限链。
