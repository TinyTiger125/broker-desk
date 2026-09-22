# Tokyo PG17 恢复权限合并验证（2026-09-22）

## 范围与结论

- 候选基线：`60b8768a3e03bf9004cb3495ae5b8c3ff1ad1167`。
- 本轮只运行本地 PostgreSQL 17.11 隔离实例；Supabase ref `ilujuwuzaqwcbpnqixen` 保持云端 `initializing / ledger=38`，没有云端写入。
- 历史 migration 未改动。没有执行云端 `GRANT`、撤销、迁移续跑、部署或其他外部写入。
- `results-r3.json` 是本轮准确 owner/ACL 夹具下的最终结果；`results-r2.json` 保留上一轮旧夹具证据，不作为当前模型结论。
- 本 README、`results-r3.json`、`events-r3.stderr` 和 r3 独立审查是当前唯一操作依据；r2 夹具与旧平台支持材料仅作历史留档，已被 r3 取代。

云端只读查询时间：`2026-09-22T10:19:31.676Z`。事实包括 PostgreSQL 17.6、database owner=`postgres`、public owner=`pg_database_owner`、private owner=`postgres`；`postgres` 为非 superuser，但有 `CREATEROLE/CREATEDB/BYPASSRLS/LOGIN`。现有两条 membership 的 `admin=true, inherit=false, set=false`。`brokerdesk_admin` 没有 private CREATE，也没有四张表的 REFERENCES；public CREATE 由数据库 owner 能力生效，不代表存在可转授的 grant option。

## 本地准确夹具

PG17.11 夹具在操作窗口前完成一次性归一化：数据库 owner=`postgres`，public owner=`pg_database_owner`，`brokerdesk_private` owner=`postgres`；五张迁移前置表和 30 个既有 private 函数 owner=`postgres`；`anon`、`authenticated`、`service_role` 的已观测 schema ACL 也建立。users/brokerage_cases 按云端 ACL/grantor 的有效 owner 模型置为 postgres，供 REFERENCES 前置验证。

一次性 bootstrap 只负责建立隔离夹具。夹具完成后，临时授权、Tokyo 入口迁移和收尾全部由非超级用户 `postgres` 执行；未创建或使用 `supabase_admin`。本地 baseline membership 的 grantor 是 fixture-only `platform_bootstrap`，选项与云端一致；该角色不参与操作窗口。

旧本地“postgres 无法授予 public CREATE”的结果来自旧夹具把 database owner 设置为 `platform_db_owner`。准确 owner 模型下不再复现该结论；`postgres` 能授予 public CREATE。该解释写入 `results-r3.json.legacyOwnerMismatch`。

## 最小权限方案

| 能力 | 必要性 | 授予者与 SQL | 收尾顺序 |
|---|---|---|---|
| 临时 SET membership | 让 postgres 在固定五个迁移中切换到 `brokerdesk_admin` | `postgres`：`GRANT brokerdesk_admin TO postgres WITH INHERIT FALSE, SET TRUE, ADMIN FALSE` | 最后 `REVOKE brokerdesk_admin FROM postgres`，删除独立临时行，保留原 admin 行 |
| public CREATE | 仅用于迁移创建 public 对象 | `postgres`：`GRANT CREATE ON SCHEMA public TO brokerdesk_admin`，无 grant option | 先撤销 schema CREATE |
| private CREATE | 仅用于固定迁移创建 private 函数/对象 | `postgres`：`GRANT CREATE ON SCHEMA brokerdesk_private TO brokerdesk_admin`，无 grant option | 随后撤销 private CREATE |
| REFERENCES | 仅 users、brokerage_cases 在迁移角色下创建 FK 时需要 | `postgres`：`GRANT REFERENCES ON TABLE public.users, public.brokerage_cases TO brokerdesk_admin`，无 grant option | 撤销这两张表的 REFERENCES；import_jobs/attachments 在 owner 转移后由 owner 隐式拥有，不重复授予也不能把 owner 的隐式权限当成额外 ACL |

撤销 SQL 不使用 `CASCADE`：

```sql
REVOKE CREATE ON SCHEMA public FROM brokerdesk_admin;
REVOKE CREATE ON SCHEMA brokerdesk_private FROM brokerdesk_admin;
REVOKE REFERENCES ON TABLE public.users, public.brokerage_cases FROM brokerdesk_admin;
REVOKE brokerdesk_admin FROM postgres;
```

顺序是先撤销 schema/table 临时授权，最后撤销 SET membership。迁移产生的对象、ownership、RLS/FORCE RLS 和 worker policy 必须保留；因此最终 `has_table_privilege` 对 owner=`brokerdesk_admin` 的 import_jobs/attachments 仍为 true，这是 ownership 的隐式能力，不是残留 grant。

## 云端执行固定顺序

云端获批后只能按以下顺序执行，不能把 SQL 未报错当作授权成功：

1. **执行前只读复核**：固定 ref、数据库、连接身份、TLS/连接模式、database/schema/table/function owner、完整 ACL、membership 属性、marker、ledger 连续性和全部 checksum。任一目标或基线不一致即停止。
2. **临时授权**：由已确认的 `postgres` 执行本节最小 GRANT；逐项查询 `has_schema_privilege`、`has_table_privilege`、membership `set_option` 及 ACL 差异，确认实际权限变化后才能继续。SQL 返回成功本身不构成证据。
3. **Tokyo 入口恢复**：只运行固定 Preview/Staging 入口和已审查 migration 集合。成功路径要求 marker=`complete`、ledger=44、checksum 全匹配、ownership/RLS/FORCE RLS/worker policies 正确；失败或提交不确定时停止，不自动重试、回滚或删除对象。
4. **撤销额外授权**：无论成功或失败，由同一受支持主体按本节顺序撤销 schema CREATE、REFERENCES 和临时 SET membership，不使用 `CASCADE`。
5. **最终只读核对**：复核 marker/ledger/checksum、最终对象 ownership/ACL、角色 NOLOGIN、原 membership 保留、`set_option=false`，并确认临时 ACL 已消失。只有这组差异证据完整，才可提交恢复结果。

## 入口收窄

- 通用 runner 默认不切换角色；只有调用者显式传入 `migrationExecutionRole` 与固定 `roleSwitchMigrations` 才会执行 `SET ROLE`。
- Tokyo 入口固定切换五个已审查文件：`20260908_001_preimport_upload_lifecycle.sql`、`20260917_001_object_import_targets.sql`、`20260917_002_case_review_locks.sql`、`20260918_001_import_job_single_claim.sql`、`20260921_002_import_worker_rls_admin_policy.sql`。
- `20260921_001_supabase_auth_lifecycle.sql` 不切换角色；未来文件不会因排序自动继承该策略。失败路径在回滚前尝试 `RESET ROLE`。

## 实际证据

### 成功路径（r3）

真实 `executeTokyoMigrations({ args: ["--prepare-empty-db"] })` 在准确夹具完成：

- `appliedCount=6`、`skippedCount=38`，marker=`complete`，ledger=44，分类器返回 `complete / 44`。
- 五张前置表 owner=`brokerdesk_admin` 且 `RLS=true/FORCE RLS=true`；两个 worker policy 存在。
- `brokerdesk_admin`、`brokerdesk_runtime` 仍为 NOLOGIN、NOSUPERUSER、NOCREATEROLE、NOBYPASSRLS。
- 清理后 public/private schema ACL 恢复到 baseline，users/brokerage_cases 的临时 REFERENCES 为 false，SET ROLE 返回 SQLSTATE `42501`；迁移对象 ownership 保留。

### 中途失败收尾（r3）

仅在迁移副本的最终文件注入 `SELECT 1 / 0`，未修改仓库 migration。入口返回 SQLSTATE `22012`；marker 保持 `initializing`，ledger=43，分类器返回 `resume / 43`。临时 public/private CREATE、REFERENCES 和 SET membership 随会话结束由 postgres 撤销；对象与已提交进度保留，状态仍可恢复。

## 可执行脚本与持久证据

```sh
node docs/operations/tokyo-pg17-recovery-permission-validation-20260922/validate.mjs
```

- [validate.mjs](./validate.mjs)：准确 owner/ACL 夹具、postgres 授权与撤销、真实 Tokyo 成功/失败入口。
- [results-r3.json](./results-r3.json)：最终结构化结果、owner/ACL、membership、marker、ledger、角色和分类。
- [events-r3.stderr](./events-r3.stderr)：最终原始阶段事件。
- [cloud-readonly-20260922.json](./cloud-readonly-20260922.json)：云端只读事实。
- [independent-review.md](./independent-review.md)：独立审查原文。
- [results-r2.json](./results-r2.json)、[events-r2.stderr](./events-r2.stderr)：上一轮旧夹具证据，已被 r3 取代，仅保留历史对照。
- [platform-support-question-20260922.md](./platform-support-question-20260922.md)：旧平台支持材料，已被 r3 执行顺序与权限模型取代；其中 SQL 未执行，不能作为当前操作依据。

## 当前阻断

云端仍未获得本轮权限变更授权。云端 `brokerdesk_private CREATE` 与所需 REFERENCES 仍需产品/平台明确授予路径；本地已证明在准确 owner 模型下由 `postgres` 完成临时闭环，不据此宣称云端可直接执行。若平台不能确认 `postgres` 对 private schema 与所需 referenced tables 的受支持授权能力，恢复必须停止并只读回报。

## r3 哈希清单

```text
scripts/postgres-migration-runner-utils.mjs  3d5b981c52fd01277ffdf49583a3f1753d9713dcbcd0d3fe20ebf1c546ff0178
scripts/run-postgres-migrations.mjs          4147ba8c7b013c75452cbb9f90bf124b2b035752ae60fb946d2224f5a3e06da3
scripts/run-tokyo-supabase-migrations.mjs   e6202644fcad12d82e2c1832eca6fadb28cb19e8ff349237de140588fd2cb284
scripts/test-postgres-migration-runner.mjs  30c4abbcad06df2326e972d5e7fbb333811d4e71bab78328548922f188e0ac7a
validate.mjs                                 5cc2a884bc1fd25754a6778101bac350f5ab33570754ae08870ee7d29b6a4258
independent-review.md                         041d0f4ea58e8c1e555a8e8980842b8a8a2d9332d3bf85dc3196160e5af46700
platform-support-question-20260922.md        ae5a7ab3181ac150caa8f952f65dd5aacba215cde39cee045520998aa7862c3e
results-r3.json                               9a2f5a55a91c00abb3400e41abbb6f42d72558db6d324f702510b0fa9f64631c
events-r3.stderr                              f65e299e5960d1a323bc51f9d379d5779115a0827acce51090661ef4373e256f
cloud-readonly-20260922.json                  9165402296c0ed81b2ba77393f8204e30ffe4076a1e9e0670b5a73cb0e1d2f71
```
