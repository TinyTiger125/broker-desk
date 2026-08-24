# TASK-040 W9.2 首两个安全硬门运行验证

日期：2026-08-24

## 环境边界

- Neon 项目：`broker-desk-staging-nonprod`（project id `restless-sun-37465131`）
- 验证分支：`w92-003-creator-hard-gate-20260824`（已完成后销毁）
- 数据库：`neondb`
- 运行角色：`brokerdesk_runtime`
- 未连接或修改 Production；共享 Staging 分支未写入。
- 哨兵数据均为 `example.invalid` 合成数据，验证结束随分支销毁。

## Migration 003 与数据保护

隔离分支从当前 Staging 账本起步。001、002、003 首次执行成功，ledger 各保留一行，且本地文件 checksum 与账本一致：

- `20260819_001_guarantee_slice1_objects.sql`: `6a7d7ddfce267f27be32d796c1f4bbb69173045070d774121afe8554e304288d`
- `20260824_002_visibility_record_rls.sql`: `93ddd41101b31e47d692279b4d9570b225fbc0e2457a2ef7f68a92be1506d2dc`
- `20260824_003_creator_immutability.sql`: `34b27b0997ba0f31679d5ddfd078edbd29076651211cce4da4057202f66da3f9`

三份 SQL body 重跑成功且没有新增 ledger 行或重复默认键。故意在同一事务中创建哨兵表、写入一行后执行非法语句，事务失败后哨兵表不存在，证明整笔回滚。迁移前后（加入合成哨兵前）案件/人物/物件计数为 `0/0/3`，未发生迁移删除。

## `brokerdesk_runtime` 运行结果

角色属性：`rolsuper=false`、`rolbypassrls=false`。A 的合法 subject+active membership 对三张核心表均有非零授权读；伪造租户、无 subject、无效 subject、C 租户、B 的 private 资料、B suspended、B removed 均返回零可读行。负责人不明的 pending 记录对正常负责人查询也不可见。

对 `clients`、`properties`、`brokerage_cases` 分别执行：

- 直接 SQL 伪造 `created_by_user_id`：均以权限错误拒绝；原记录不变。
- 相同 creator 的普通内容更新：成功。
- visibility 修改并恢复：成功，creator 保持不变。
- 伪造 current owner：均拒绝；没有产生部分写入。
- company_read：另一 active member 可读，但三张表的写入 row count 均为 0。

Action 黑盒验证同样拒绝伪造 creator，并写入 `security_record_field_rejected` 审计；审计只含字段名，未包含提交值或客户内容。

## `/api/hub/search` 运行结果

在当前代码的 route handler 上用同一运行角色和合成上下文执行：

- A 合法上下文：`200`，合成 company_read 哨兵可见；
- B 合法上下文：`200`，仅在哨兵切换为 company_read 时可见，private 时为 0；
- C 经营主体和 A 伪造 C tenant：`200`、0 项；
- 无当前公司：`409 tenant_selection_required`；
- 稳定 Staging 地址的未登录 HTTP 请求由 Clerk 返回 `404`，无数据响应。

所有查询均使用显式 user+tenant context；没有默认用户回退。异常响应不回显内部错误。

## 结论边界

本记录只覆盖 W9.2 首两个安全硬门，不代表统一 visibility resolver、三类页面列表/详情/导出改造、关系图、附件、PDF 来源权限或接管流程已完成。正式状态须以独立审查结论为准。
