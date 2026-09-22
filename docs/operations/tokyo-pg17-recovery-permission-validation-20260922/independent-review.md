# 独立审查原文（r3）

审查对象：`validate.mjs` 准确 PG17.11 owner/ACL 夹具、runner/Tokyo 入口窄修、`results-r3.json` 与 `events-r3.stderr`。

当前依据仅为 r3 文件；r2 结果、旧夹具说明和早期平台支持问题材料已被 r3 取代，仅保留审计历史。

## 结论

**PASS（本地隔离范围，云端未写）**。成功和失败均由真实 `executeTokyoMigrations` 入口运行；授权、迁移和撤销阶段全部由非超级用户 `postgres` 执行。没有用外层 Promise 失败替代数据库结果。

## 核对记录

1. **owner/ACL 基线**：database owner=`postgres`，public owner=`pg_database_owner`，private owner=`postgres`；公共平台角色 schema ACL 与云端只读快照一致。旧 `platform_db_owner` 夹具已取消。
2. **授予能力**：postgres 自行完成临时 SET membership、public/private schema CREATE，以及 users/brokerage_cases REFERENCES；authority 查询显示 current/session user 均为 postgres，database owner 亦为 postgres。没有 supabase_admin 角色或连接。
3. **权限最小化**：import_jobs/attachments 在前置 ownership 转移后属于 brokerdesk_admin，未重复授予 REFERENCES；收尾撤销显式 grants，不使用 CASCADE。最终 owner 的隐式权限仍存在，符合对象保留要求。
4. **membership 生命周期**：临时行是 `grantor=postgres, admin=false, inherit=false, set=true`；原 baseline admin 行保持不变。整条 `REVOKE brokerdesk_admin FROM postgres` 后临时行消失，SET ROLE 返回 SQLSTATE `42501`。
5. **真实成功路径**：`appliedCount=6`、`skippedCount=38`、marker `complete`、ledger=44；五张前置表均 owner=`brokerdesk_admin` 且 RLS/FORCE RLS 开启；两个 worker policy 存在。
6. **真实失败收尾**：副本最终迁移注入除零，入口返回 SQLSTATE `22012`；marker `initializing`、ledger=43，分类器返回 `resume / 43`。临时授权撤销后仍可恢复，已提交对象和 ownership 未删除。
7. **角色切换范围**：通用 runner 默认不发 SET ROLE；Tokyo 只对固定五个迁移切换，平台函数迁移保持 postgres，未来文件不因排序自动继承。
8. **旧结论修正**：旧“无法授予 public CREATE”来自 database owner=`platform_db_owner` 的错误夹具；准确 owner 模型下该结果不成立，已由 `legacyOwnerMismatch` 字段记录。

## 未覆盖与停止条件

- 云端仍为 `initializing / ledger=38`；没有云端 GRANT、REVOKE、迁移续跑或部署。
- 云端 private CREATE 与所需 REFERENCES 的受支持授予路径仍待产品/平台授权；本地成功不等于云端已具备路径。
- baseline membership 的 grantor 在本地是 fixture-only `platform_bootstrap`，因为云端 `supabase_admin` 未被创建或使用；membership 选项和实际临时行差异已完整记录。

## 定向回归

```text
node scripts/test-postgres-migration-runner.mjs        PASS
node scripts/test-postgres-migration-runner-utils.mjs  PASS
node scripts/test-tokyo-migration-entry.mjs            PASS
node .../validate.mjs                                  PASS (PG17.11, r3)
git diff --check                                       PASS
```

未修改历史 migration，未使用 CASCADE，未扩大云端权限边界。
