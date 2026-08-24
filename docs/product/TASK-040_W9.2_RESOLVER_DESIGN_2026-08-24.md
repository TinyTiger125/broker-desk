# TASK-040 W9.2 — RequestContext / Visibility Resolver Foundation

状态：有限实现候选；仅非生产验证，未接入页面。

## 目标

统一案件、人物、物件的服务端授权基础，不改变现有页面、列表、详情、搜索、导出、关系图、附件或 PDF 路径。

## 受信请求上下文

`RequestContext` 只由 `requireTenantSession` 产生的当前 `TenantSession` 创建：

- 当前 Clerk subject；
- 当前本地 user；
- 当前 tenant；
- 与该 user 和 tenant 完整匹配的 active membership。

`TenantSession` 只在 `resolveTenantSession` 完成真实 Clerk subject→本地 user→tenant membership 查找后登记 provenance；`createRequestContext` 拒绝普通结构化 session。上下文在创建后冻结，并登记在进程内 `WeakSet`。因此 JSON、query/body/form、对象展开或调用参数不能伪造或覆盖受信上下文。没有当前认证 subject、subject 与本地 user 不一致、membership 非 active、membership 与 user/tenant 不一致或 tenant 不可用时，创建失败。

## 统一判定

解析器只读取 `current_owner_user_id`、`visibility_scope`、`owner_resolution_status`、tenant 和 active membership：

- `owner_write`：当前负责人可读写；
- `company_read`：同一经营主体的 active 成员可读、不可写；
- `not_accessible`：无权、不存在、pending、无负责人、未知范围、失效 membership、伪造 tenant 或跨经营主体。

旧 `user_id`/`owner_user_id` 不参与运行期授权。解析器对无权和不存在返回相同的 `not_accessible`，适配器不返回记录。

## 适配器边界

memory 与 Postgres 各提供三类 foundation probe，均先按 `id + context.tenantId` 取候选，再经过同一解析器；Postgres 在受信 Clerk subject 的事务作用域中执行，并继续交由既有 RLS 限制。当前没有任何页面或正式读写入口使用这些 probe。

## 明确排除

本候选不接入三类页面、列表/详情/搜索/导出、关系图、附件、PDF、历史下载、接管、共同编辑、定向分享或 Production。

## 回滚边界

本候选不新增 migration，不修改既有 schema。回滚仅需回退应用代码和契约/证据文件；已销毁的非生产验证分支不影响共享 Staging 或 Production。
