# Tokyo 初始化权限支持问题（只读事实，待审批）

> 历史平台支持材料。已被 r3 的 owner/ACL 模型、固定执行顺序和最小权限方案取代；本文件仅保留为审计记录，不作为当前操作依据。

查询时间：`2026-09-22T10:19:31.676Z`
目标：Supabase ref `ilujuwuzaqwcbpnqixen`，数据库 `postgres`，PG `17.6`。

## 已核实事实

- 当前连接身份 `postgres`：非 superuser，具备 `CREATEROLE/CREATEDB/BYPASSRLS/LOGIN`；database owner=`postgres`。
- public owner=`pg_database_owner`；postgres 的 public CREATE 来自 owner 能力，ACL 没有可见 grant option；brokerdesk_admin 只有 USAGE。
- brokerdesk_private owner=`postgres`；brokerdesk_admin 只有 USAGE、没有 CREATE。
- 云端只读快照显示 brokerdesk_admin 对 users、brokerage_cases、import_jobs、attachments 均无 REFERENCES。
- postgres→brokerdesk_admin/runtime 的现有 membership 为 `admin=true, inherit=false, set=false`。
- 本地 r3 已证明：在 database owner=`postgres` 的准确模型下，临时 SET、public/private CREATE 和 users/brokerage_cases REFERENCES 可由非超级用户 postgres 完成并撤销；import_jobs/attachments ownership 转移后不需要重复 REFERENCES。

## 需要平台/产品一次性确认的最小路径

1. 在维护窗口记录 public/private schema ACL、users/brokerage_cases ACL/owner、两条原始 membership。
2. 确认以下授予均由当前受支持的 `postgres` 执行身份完成，且无隐含长期授权：

```sql
GRANT brokerdesk_admin TO postgres
  WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
GRANT CREATE ON SCHEMA public TO brokerdesk_admin;
GRANT CREATE ON SCHEMA brokerdesk_private TO brokerdesk_admin;
GRANT REFERENCES ON TABLE public.users, public.brokerage_cases TO brokerdesk_admin;
```

3. 仅在上述授予路径和收尾主体均被确认后，运行固定 Tokyo 恢复入口；入口只对五个已审查 migration 切换 `brokerdesk_admin`，平台函数迁移保持 postgres。
4. 无论成功或失败，先撤销显式 grants，再撤销临时 membership：

```sql
REVOKE CREATE ON SCHEMA public FROM brokerdesk_admin;
REVOKE CREATE ON SCHEMA brokerdesk_private FROM brokerdesk_admin;
REVOKE REFERENCES ON TABLE public.users, public.brokerage_cases FROM brokerdesk_admin;
REVOKE brokerdesk_admin FROM postgres;
```

撤销不使用 `CASCADE`。迁移产生的对象、ownership、RLS/FORCE RLS 和 worker policies 必须保留；owner 的隐式权限不作为额外 ACL 撤销目标。

## 停止条件

- postgres 无法被平台确认是 private schema 或 referenced tables 的受支持授予者；
- 只能通过 supabase_admin、superuser、BYPASSRLS 或长期 grant option 才能完成；
- membership/ACL 与执行前快照不一致；
- 任一提交结果不确定。

本说明不是云端执行授权，也不表示上述 SQL 已执行。
