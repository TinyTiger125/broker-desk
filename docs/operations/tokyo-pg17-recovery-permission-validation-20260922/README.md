# Tokyo PG17 恢复权限合并验证（2026-09-22）

## 范围与结论

- 候选基线：`60b8768a3e03bf9004cb3495ae5b8c3ff1ad1167`。
- 本轮只运行本地 PostgreSQL 17.11 隔离实例；Supabase ref `ilujuwuzaqwcbpnqixen` 保持云端 `initializing / ledger=38`，没有云端写入。
- 历史 migration 未改动。没有执行云端 `GRANT`、撤销、迁移续跑、部署或其他外部写入。
- `results-r3.json` 是本轮准确 owner/ACL 夹具下的最终结果；`results-r2.json` 保留上一轮旧夹具证据，不作为当前模型结论。
- 本 README、`results-r3.json`、`events-r3.stderr` 和 r3 独立审查是当前唯一操作依据；r2 夹具与旧平台支持材料仅作历史留档，已被 r3 取代。
- 真实云端执行归档见 `cloud-execution-20260922-final.json`、`cloud-execution-20260922-summary.json` 和 `cloud-execution-20260922.sha256`；执行版本为 `f5a3210aa1c5025c4ad9b593274fb66dca09abf8`，结果为 `complete/44`，临时权限已清理。

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
- [cloud-execution-20260922-final.json](./cloud-execution-20260922-final.json)：脱敏真实云端执行日志、权限前后差异和最终只读结果。
- [cloud-execution-20260922-summary.json](./cloud-execution-20260922-summary.json)：脱敏执行摘要。
- [cloud-execution-20260922.sha256](./cloud-execution-20260922.sha256)：上述真实执行日志 SHA-256 清单。
- [runtime-connection-access-plan-r1.md](./runtime-connection-access-plan-r1.md)：临时内存凭据登录验证合同；本轮执行结果见下方云端记录。
- [runtime-password-helper.c](./runtime-password-helper.c)：本地 libpq `PQchangePassword` API 证明器，conninfo/角色/密码均走匿名 stdin 帧；不是生产 Keychain writer。
- [runtime-access-local-fixture.mjs](./runtime-access-local-fixture.mjs)：PG17 隔离内存随机凭据登录、错误脱敏、拒绝与统一异常收尾入口；本轮只做该入口的定向回归。
- [runtime-access-local-evidence.json](./runtime-access-local-evidence.json)：正常路径脱敏事件证据；不含密码或验证值。
- [runtime-access-local-exception-evidence-20260922.json](./runtime-access-local-exception-evidence-20260922.json)：注入登录后异常的脱敏事件证据；故意以非零退出结束，但统一收尾完成。
- [runtime-access-cloud-entry.mjs](./runtime-access-cloud-entry.mjs)：持久云端入口；Session pooler 登录用户名固定为 `<role>.ilujuwuzaqwcbpnqixen`，SQL 目标和身份断言仍使用裸角色名。
- [runtime-access-cloud-entry-contract-r1.md](./runtime-access-cloud-entry-contract-r1.md)：云端入口输入、写入前门禁、登录断言和统一收尾合同。
- [runtime-access-cloud-entry-self-test-20260922.json](./runtime-access-cloud-entry-self-test-20260922.json)：无网络定向证据；证明裸用户名、错误 ref/角色、错误连接/TLS/CA 配置均在写入前拒绝，`writesBeforeGate=0`。
- 本地定向验证：PostgreSQL `17.11`、Node `v20.19.5`、`pg` `8.20.0`、Apple clang `17.0.0`；helper 源码 SHA-256=`929ba56e5422b93aa9a37c584f4c946b87e88df871e9655047a3df8be0b147e2`。正常路径在 `2026-09-22T14:39:06.320Z` 完成；异常路径在 `2026-09-22T14:38:56.221Z` 完成。两条路径均证明：关闭连接→NOLOGIN→仍持内存凭据执行拒绝探针（SQLSTATE `28000`）→会话为零→`PASSWORD NULL`→扫描服务端日志→擦除内存 Map/数组→记录 `cleanup_completed.finishedAt`。非超级用户 `fixture_manager` 读取 `pg_authid.rolpassword` 被 SQLSTATE `42501` 拒绝，直接密码为空状态仍是平台可见性缺口。
- 云端执行 evidence SHA-256：`cloud-runtime-access-20260922.json`=`1429c751c79f1285e750ef62e9f4730cc086b501dcffd4a5aa06bb724bd5c285`；helper 源码 SHA-256=`929ba56e5422b93aa9a37c584f4c946b87e88df871e9655047a3df8be0b147e2`。
- 本轮文件 SHA-256：fixture=`51ea10276372e917f5c5159cead5626242a1e124b94e20ed20366057742bd055`；正常 evidence=`180e26e7cc5dc69524ba51ff7eb67054b754c37fc3b0d98d033fc2dbe7ba1122`；异常 evidence=`de00c2cef196e1b01fc6ddcee894aeeb4f47575cd35048c95d593a7206687642`；诊断=`6f9df07ef1f4968449427eac094c2ac572954856f06a4962c0af652d5f7fe752`；plan=`4a2274f76b9b70069cc3c510f34037c0c6e06cacb32d51bc57868f3659e3edf0`。
- 本轮云端入口候选哈希在提交前由 `runtime-access-cloud-entry.sha256` 固定；self-test 是本轮唯一新验证证据。此前 [cloud-runtime-access-20260922.json](./cloud-runtime-access-20260922.json) 明确标记为“错误裸路由用户名的历史失败归档”，不是本轮成功证据。
- 当前入口候选哈希：entry=`1a7acd7ed50ebd8f306406c988fc657cdbaa05a476b980d7a7f3eb7d07c77d4f`；contract=`d920c81e4883dddaf5dfc5e61a9bfdfdfba55c7a4afc7f2ce263c00d1cb2becc`；self-test=`03885f40f637192486cef845ff52b30e415df47cae876ff7650b6c0118483906`；helper=`929ba56e5422b93aa9a37c584f4c946b87e88df871e9655047a3df8be0b147e2`。
- [cloud-readonly-20260922.json](./cloud-readonly-20260922.json)：云端只读事实。
- [independent-review.md](./independent-review.md)：独立审查原文。
- [results-r2.json](./results-r2.json)、[events-r2.stderr](./events-r2.stderr)：上一轮旧夹具证据，已被 r3 取代，仅保留历史对照。
- [platform-support-question-20260922.md](./platform-support-question-20260922.md)：旧平台支持材料，已被 r3 执行顺序与权限模型取代；其中 SQL 未执行，不能作为当前操作依据。

### 云端临时登录验证（2026-09-22）

- 执行版本为 `f5a3210aa1c5025c4ad9b593274fb66dca09abf8`，目标 `ilujuwuzaqwcbpnqixen / postgres`。前置核对通过：marker=`complete`、ledger=44、全部 checksum 匹配、`password_encryption=scram-sha-256`、两角色基线为 NOLOGIN，原 membership（grantor=`supabase_admin`、ADMIN=true、INHERIT=false、SET=false）保留。
- 管理连接使用固定 CA 与客户端 `verify-full`：CA SHA-256=`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`，客户端 socket 为已认证 TLSv1.3；Supavisor 后端 `pg_stat_ssl` 显示明文是池化层事实，不作为客户端 TLS 失败依据。
- 两个临时密码均由 OS CSPRNG 生成，经 `PQchangePassword` 匿名 stdin 帧提交；未进入 argv、环境、文件或证据。两角色 LOGIN 提交后，首个角色验证阶段返回 SQLSTATE=`XX000`，按合同停止，未重试登录。
- 失败状态只读确认两角色仍 LOGIN、密码非空、会话数为 0；随后按失败收尾提交两角色 `NOLOGIN` 与 `PASSWORD NULL`。最终只读确认两角色 NOLOGIN、`rolpassword IS NULL`、会话数为 0、原 membership 保留、marker=`complete`、ledger=44。由于验证失败后内存凭据已释放，NOLOGIN 后的拒绝探针未再执行，因此本轮不是“登录链路 PASS”，而是“写入后停止并完成清理”。
- [cloud-runtime-access-20260922.json](./cloud-runtime-access-20260922.json)：脱敏执行、停止原因、清理与最终只读核对；SHA-256=`1429c751c79f1285e750ef62e9f4730cc086b501dcffd4a5aa06bb724bd5c285`。
- [cloud-runtime-access-20260922.sha256](./cloud-runtime-access-20260922.sha256)：云端 runtime 证据校验清单。

### 登录失败定向诊断（2026-09-22）

- 首个角色的实际验证路由来自一次性编排脚本：host=`aws-0-ap-northeast-1.pooler.supabase.com`、port=`5432`、database=`postgres`、TLS=`verify-full`、SNI=同一 host、CA 已配置；但用户名是裸的 `brokerdesk_runtime`。共享 Session pooler 的预期自定义角色路由是 `brokerdesk_runtime.ilujuwuzaqwcbpnqixen`，因此当前证据支持“角色用户名缺少 project ref”的本地配置错误。管理连接本身使用的是 `postgres.ilujuwuzaqwcbpnqixen`，不能代替首个角色路由核对。
- Supabase 官方连接合同说明共享 pooler 使用 `:5432` Session mode，且自定义角色用户名带 `[ROLE].[PROJECT-REF]`：[Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres)。官方排障说明把缺少 project ref 的路由归入 tenant/user 路由问题：[Tenant or user not found when connecting through shared pooler](https://supabase.com/docs/guides/troubleshooting/tenant-or-user-not-found)。因此本次不把 XX000 猜成密码错误、缓存延迟或平台限制；平台内部 XX000 的具体类别仍未被日志证实。
- 平台日志仅查询 `2026-09-22T14:00:04Z–14:01:55Z`（Dashboard 显示为 `23:00:04–23:01:55 Asia/Tokyo`）。可见 ALTER USER 密码提交、两次 ClientHandler/DbHandler authenticated、两次 LOGIN 和一次 client terminate；必要记录中未找到 XX000、detail、hint 或 correlation ID，且没有重新登录制造日志。完整脱敏记录见 [runtime-access-diagnosis-20260922.json](./runtime-access-diagnosis-20260922.json)。
- 本地收尾修复保留内存凭据直到 NOLOGIN 拒绝探针结束，再清空数据库密码并释放凭据；异常路径由同一清理函数接管，最终结束时间写在 `cleanup_completed.finishedAt` 之后。正常与注入异常两条证据分别见 [runtime-access-local-evidence.json](./runtime-access-local-evidence.json) 和 [runtime-access-local-exception-evidence-20260922.json](./runtime-access-local-exception-evidence-20260922.json)。云端当前仍为两角色 NOLOGIN/PASSWORD NULL，本轮没有重试登录、改权限或切换连接方式。

### 云端入口收口（本轮）

- 已将一次性编排固化为 [runtime-access-cloud-entry.mjs](./runtime-access-cloud-entry.mjs)。入口先校验管理连接和两份角色连接的 host、port、database、路由用户名、TLS/SNI 和 CA hash，之后才允许密码设置或 LOGIN。
- 入口的 `--self-test` 不联网；实际输出证明裸角色用户名、错误 project ref、错误角色、错误 host/port/database、TLS 或 CA 均在写入前拒绝。未执行 `--execute-cloud`，本轮没有云端写入或登录重试。
- 当前入口将前置门禁与执行后收尾分开：基线失败时只关闭管理连接，不执行 NOLOGIN/PASSWORD NULL；每个角色记录密码/LOGIN 尝试与确认状态，提交不确定的角色才进入收尾。拒绝探针只有明确认证拒绝 SQLSTATE 才记为 verified，XX000、超时、TLS 错误均保持 unverified，但仍继续安全清理。
- 登录成功后接入 runtime 的事务回滚 CREATE/DDL/SET ROLE 拒绝探针，以及 admin 的只读 worker owner/RLS/SELECT/UPDATE/policy 核验；任何意外放行都会回滚并使入口失败。
- `cloud-runtime-access-20260922.json` 仍是历史失败尝试，不能与本轮 self-test 混称为成功；下一次云端验证必须以新入口和新执行证据为准。

## r3 历史权限边界（不影响已完成恢复）

本节保留 r3 执行前的权限边界说明；真实恢复已按 `cloud-execution-20260922-final.json` 归档为 `complete/44`。后续 runtime 登录验证不得把本节旧的“未获授权”措辞当作当前云端状态。

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
