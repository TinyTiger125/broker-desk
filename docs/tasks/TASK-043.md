# TASK-043 / 客户订阅台账、席位与服务有效期

## 任务名称

客户订阅台账、席位与服务有效期

- 状态: In Review
- 基线：`main` `f2955701003f90b0b6cf1c331edfd5e943d53967`
- 隔离分支：`task043-platform-subscription-ledger`

## 背景和用户结果

平台管理员可为客户公司设置总席位与服务开始/结束日期，查看占用、剩余席位、剩余天数与服务状态；客户负责人可查看本公司的订阅摘要并管理成员。服务到期后，用户仍可登录并看到到期说明与保留的数据事实，但业务操作和新增邀请统一阻断。平台后台入口只对真实 `requirePlatformOwnerSession` 授权身份可见。

## 本次范围

### 固定产品合同

- owner 占 1 席；membership `active`、`invited`、`suspended` 均占席；`removed` 释放。邀请 `revoked`、`expired` 不占席；不得对同一受邀人重复计数。
- `service_start_at`、`service_end_at` 为公司级日期。以 Asia/Tokyo 自然日判定：开始日前为 `pending`；结束日当天仍有效；结束日次日 00:00 JST 起为 `expired`；剩余 0–30 天为 `expiring`；更早为 `active`；持久化 `suspended`、`cancelled` 优先于日期状态。
- 迁移新增日期列但不编造历史商业日期。既有日期为空的 `trial`/`active` 账户按兼容 active 处理，`pending_activation` 按 pending；平台管理员配置日期后立即采用日期合同。
- `active`、`expiring` 可执行正常业务。`pending`、`expired`、`suspended`、`cancelled` 阻断业务写入与邀请；登录、工作区选择、只读订阅说明和数据保留不被删除。
- 客户负责人只能查看本公司订阅摘要与成员，并在服务有效时使用既有成员管理；不得修改席位、服务日期或商业状态。普通成员不能进入平台后台。
- 平台商业字段修改必须由 platform owner 执行，并写入可追溯审计；席位不能低于当前占用。
- 当前非生产测试身份必须通过既有受控 bootstrap 或持久化 active `platform_owner` membership 获权；禁止依据邮箱、页面入口或环境猜测身份，禁止通用 auth bypass。

## 明确不做什么

- 在线支付、账单、发票、自动扣款、套餐营销、邮件提醒。
- 新 schema 之外的业务模型扩建、客户数据删除、Production deployment、Production migration。
- 修改 Clerk 身份规则、宽放平台权限、trusted header/demo bypass。

## 依赖关系

- 依赖 TASK-042 已验收并正常合入的 `main` 基线 `f295570`。
- 依赖既有 Clerk 身份、active `platform_owner` membership/bootstrap、租户权限及审计基础；不依赖 Production migration。

## 预计涉及的模块

以下同时是本任务唯一授权写集：

- `docs/tasks/TASK-042.md`
- `docs/tasks/TASK-043.md`
- `BACKLOG.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`
- `db/migrations/20260828_001_tenant_service_period.sql`
- `src/lib/tenant-service.ts`
- `src/lib/data.ts`
- `src/lib/data.memory.ts`
- `src/lib/data.postgres.ts`
- `src/lib/tenant-session.ts`
- `src/lib/platform-session.ts`
- `src/components/app-nav.tsx`
- `src/app/platform/accounts/page.tsx`
- `src/app/settings/members/page.tsx`
- `src/lib/member-management-copy.ts`
- `src/app/service-status/page.tsx`
- `src/app/workspace/page.tsx`
- `src/app/workspace/invitations/page.tsx`
- `src/app/workspace/invitations/accept-invitation-form.tsx`
- `src/app/api/workspace/route.ts`
- `src/app/actions.ts`
- `scripts/check-platform-subscription-contract.mjs`
- `scripts/test-platform-subscription-behavior.mjs`
- `scripts/bootstrap-initial-platform-owner.mjs`
- `scripts/check-platform-owner-bootstrap-contract.mjs`
- `scripts/check-tenant-session.mjs`
- `scripts/check-task-035.mjs`
- `package.json`

任何必需文件不在此列表时立即停止，由项目经理判断是否重定范围；不得自行扩大。

## 实现边界

- 纯函数 `tenant-service` 是日期、剩余天数与派生状态的唯一语义来源；memory/PostgreSQL/UI/守卫不得各自复制真值表。
- PostgreSQL schema、memory adapter、facade 与正式迁移保持同构。平台更新与审计在同一事务/单一 memory 原子发布中完成。
- 标准 `requireTenantSession` 继续作为业务边界；服务不可用时必须 fail-closed 到安全说明路径。只有工作区选择、订阅说明和必要平台管理可使用明确的受限只读解析，不能形成第二套普通业务 session。
- 导航入口与 `requirePlatformOwnerSession` 使用同源判断；不能以 Clerk 已启用作为显示平台入口的条件。
- 不删除租户业务数据，不改变既有 record permission、visibility、RLS 或 membership capability 合同。

## 验收标准

### 确定性合同

- Asia/Tokyo：开始日前、开始日、剩余 31/30/1/0 天、结束日次日，以及 suspended/cancelled 优先级。
- 席位：owner、active/invited/suspended、removed、revoked/expired、重复邀请、缩减低于占用、达到上限邀请。
- 平台入口、平台更新 Action、客户负责人只读摘要、普通成员/客户管理员拒绝、过期后业务/邀请阻断与说明页可达。
- memory 与 PostgreSQL schema/查询/事务/审计同构；旧空日期兼容不把既有客户意外锁死。

## 验证命令

工程门必须按以下顺序执行：

1. `npm run test:workflow-rules`
2. `npm run test:product-language`
3. `node scripts/check-platform-subscription-contract.mjs`
4. `node scripts/test-platform-subscription-behavior.mjs`
5. `node scripts/check-tenant-session.mjs`
6. `node scripts/check-task-035.mjs`
7. `npm run build`
8. `npm run typecheck`
9. `npm run lint`
10. `git diff --check`

### 未执行的真实 PostgreSQL 双事务邀请探针

以下探针只供独立审查 GO 后的受控非生产数据库执行。本任务不连接数据库。先为两个 `psql` 会话设置 `tenant_id`、`actor_user_id`、`actor_membership_id`、`target_membership_id`、`target_email`、`target_name`；两个会话必须映射为同一个受测 actor。会话 B 保持默认 `ON_ERROR_STOP=off`，使预期权限异常后能够回滚到 savepoint 并验证零写。

```sql
-- TASK043_INVITATION_TENANT_SUSPEND_SESSION_A
BEGIN;
UPDATE public.tenants SET status = 'suspended' WHERE id = :'tenant_id';
SELECT pg_sleep(8); -- 在休眠期间启动对应 SESSION_B；其函数调用应等待 tenant row lock。
COMMIT;
```

```sql
-- TASK043_INVITATION_TENANT_SUSPEND_SESSION_B
BEGIN;
CREATE TEMP TABLE invitation_probe_before ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM public.users WHERE lower(email) = lower(:'target_email')) AS user_count,
  (SELECT COUNT(*) FROM public.tenant_memberships WHERE tenant_id = :'tenant_id') AS membership_count;
SAVEPOINT invitation_probe_call;
SELECT * FROM brokerdesk_private.create_tenant_invitation(
  :'tenant_id', :'actor_user_id', :'target_email', :'target_name', 'broker', 'ordinary_member'
); -- SESSION_A commit 后必须以 non-operational service 拒绝。
ROLLBACK TO SAVEPOINT invitation_probe_call;
SELECT
  (SELECT COUNT(*) FROM public.users WHERE lower(email) = lower(:'target_email')) = user_count
  AND (SELECT COUNT(*) FROM public.tenant_memberships WHERE tenant_id = :'tenant_id') = membership_count
  AS zero_write
FROM invitation_probe_before;
ROLLBACK;
```

```sql
-- TASK043_INVITATION_ACTOR_DOWNGRADE_SESSION_A
BEGIN;
UPDATE public.tenant_memberships
SET role = 'broker', capability = 'ordinary_member'
WHERE id = :'actor_membership_id' AND tenant_id = :'tenant_id' AND user_id = :'actor_user_id';
SELECT pg_sleep(8); -- 在休眠期间启动对应 SESSION_B；其函数调用应等待 actor membership row lock。
COMMIT;
```

```sql
-- TASK043_INVITATION_ACTOR_DOWNGRADE_SESSION_B
BEGIN;
CREATE TEMP TABLE invitation_probe_before ON COMMIT DROP AS
SELECT to_jsonb(target_membership) AS membership_record
FROM public.tenant_memberships AS target_membership
WHERE target_membership.id = :'target_membership_id' AND target_membership.tenant_id = :'tenant_id';
SAVEPOINT invitation_probe_call;
SELECT * FROM brokerdesk_private.refresh_tenant_invitation(
  :'tenant_id', :'target_membership_id', :'actor_user_id', :'actor_user_id'
); -- SESSION_A commit 后必须因 actor 已降级而拒绝。
ROLLBACK TO SAVEPOINT invitation_probe_call;
SAVEPOINT invitation_probe_call;
SELECT * FROM brokerdesk_private.record_tenant_invitation_delivery(
  :'tenant_id', :'target_membership_id', :'actor_user_id', 'manual', 'pending',
  NULL, NULL, NULL, NOW(), NULL, NOW() + INTERVAL '7 days'
); -- delivery 同样必须拒绝，不能依赖锁前 authority snapshot。
ROLLBACK TO SAVEPOINT invitation_probe_call;
SELECT to_jsonb(target_membership) = invitation_probe_before.membership_record AS zero_write
FROM public.tenant_memberships AS target_membership
CROSS JOIN invitation_probe_before
WHERE target_membership.id = :'target_membership_id' AND target_membership.tenant_id = :'tenant_id';
ROLLBACK;
```

受限 runtime 角色的发送上下文探针同样只在受控非生产数据库执行。预置 `platform_subject` 为不属于 `tenant_id` 的 persisted active `platform_owner`；`ordinary_subject` 与 `form_admin_subject` 分别为目标租户 active ordinary/company_form_admin，且都不是 platform owner。

```sql
-- TASK043_PLATFORM_INVITATION_CONTEXT_RUNTIME_PROBE
BEGIN;
SET LOCAL ROLE brokerdesk_runtime;
SET LOCAL app.external_auth_subject = :'platform_subject';
SELECT tenant_record, member_record
FROM brokerdesk_private.prepare_tenant_invitation_delivery(
  :'tenant_id', :'target_membership_id', :'platform_user_id', :'platform_user_id'
); -- 必须返回恰一条完整 tenant/member/user context；最终 ROLLBACK 不保留 refresh。
ROLLBACK;
```

```sql
-- TASK043_RESTRICTED_INVITATION_CONTEXT_RUNTIME_PROBE
BEGIN;
SET LOCAL ROLE brokerdesk_runtime;
CREATE TEMP TABLE invitation_probe_before ON COMMIT DROP AS
SELECT to_jsonb(target_membership) AS membership_record
FROM public.tenant_memberships AS target_membership
WHERE target_membership.id = :'target_membership_id' AND target_membership.tenant_id = :'tenant_id';
SET LOCAL app.external_auth_subject = :'ordinary_subject';
SAVEPOINT invitation_probe_call;
SELECT * FROM brokerdesk_private.prepare_tenant_invitation_delivery(
  :'tenant_id', :'target_membership_id', :'ordinary_user_id', :'ordinary_user_id'
); -- 必须拒绝。
ROLLBACK TO SAVEPOINT invitation_probe_call;
SET LOCAL app.external_auth_subject = :'form_admin_subject';
SAVEPOINT invitation_probe_call;
SELECT * FROM brokerdesk_private.prepare_tenant_invitation_delivery(
  :'tenant_id', :'target_membership_id', :'form_admin_user_id', :'form_admin_user_id'
); -- 必须拒绝。
ROLLBACK TO SAVEPOINT invitation_probe_call;
SELECT to_jsonb(target_membership) = invitation_probe_before.membership_record AS zero_write
FROM public.tenant_memberships AS target_membership
CROSS JOIN invitation_probe_before
WHERE target_membership.id = :'target_membership_id' AND target_membership.tenant_id = :'tenant_id';
ROLLBACK;
```

### 独立审查与 Staging

- 实现完成退出后，由独立只读 reviewer 从头审查；P0/P1 任一存在即 NO-GO。
- 只在代码审查 GO 后普通非强制推送固定 Staging，并记录精确 SHA、READY、health、无 Production deployment。
- 受控非生产 migration 后，以平台管理员、客户负责人、普通成员三身份验证入口、读写边界、席位、提醒与到期拦截；用确定性时间矩阵验证 30 天和到期边界。
- 平台测试身份仅通过既有 bootstrap/active membership 获权并形成审计，不读取或展示敏感身份值。

## 风险和注意事项

- 写集扩大、现有权限/RLS 被削弱、历史租户会被无意锁死、无法证明事务/原子性、非生产身份无法合法成为 platform owner、或需要 Production 操作时立即停止。
- 单一 Staging 候选 P0/P1=0 且证据齐全后汇报并停止，不开始支付、发票、邮件或套餐功能。

## 回退

- 代码回退点：`main` `f2955701003f90b0b6cf1c331edfd5e943d53967`。
- 非生产 migration 必须先记录目标与回退 SQL；Production 不执行。

## 当前状态

- 实现 Agent 已在授权写集内完成 TDD 实现：Asia/Tokyo 日期状态、席位计数与容量、业务/邀请 fail-closed、只读服务说明、platform owner 导航同源、客户负责人订阅摘要、memory/PostgreSQL/migration 与商业更新审计均已接线。
- 任务卡 10 个工程门已按顺序通过：workflow、product-language、专项合同、行为矩阵、tenant-session、TASK-035、build（含 prebuild/postbuild）、typecheck、lint 与 diff check；lint 仅保留两个任务外既有 warning。
- 数据库未连接，migration 未执行；未部署、未推送、未提交。真实 Clerk 三身份、受控非生产 migration、Staging 与浏览器矩阵仍待独立审查 GO 后执行。
- 第 29 轮已将邀请接受 Action 的七类失败结果固定为稳定 token，并由邀请页按既有 locale 向表单传递 `ja`/`zh`/`ko`，在客户端使用独立固定文案映射；未知 token 安全回退且不显示原始值。实际修改路径由 22 条扩大为 24 条，仅新增上述两个邀请 UI 路径。
- 第 30 轮已将邀请 create/refresh/delivery 的数据库边界统一为 tenant row lock、锁后 Tokyo service 复核、锁定并复核 actor membership、identity/target membership lock、capacity、write 的顺序；不再依赖锁前 `can_access_tenant` 或无锁 actor 快照。真实 PostgreSQL 双事务零写探针已记录但未执行。
- 第 31 轮已将平台邀请发送/重试改为单次 `prepare_tenant_invitation_delivery` SECURITY DEFINER context primitive，再执行外部 Clerk 发送并通过 delivery primitive 记录结果；平台路径不再经过普通 tenant RLS 的 tenant/member pre-read 或 post-read。受限 runtime 的非目标 platform owner 成功及 ordinary/form admin 拒绝探针已记录但未执行。
- 第 32 轮已将 Clerk delivery 状态与 `member_invitation_sent`/`member_invitation_failed` 审计收口为同一个 memory 单引用发布或 PostgreSQL `record_tenant_invitation_delivery` 事务；重复 finalize 不重复审计，membership/audit 任一步失败均不形成部分提交。FORCE-RLS 仅新增上述两个 member-target INSERT action，绑定当前 actor/user、同 tenant target membership，以及目标 tenant active company owner 或 persisted active platform owner。Action 不再分写审计；Clerk 已成功但数据库 finalize 失败时返回稳定 `invitation_delivery_uncertain`，平台账户页与客户成员页均以 ja/zh/ko warning 明示“可能已发送、先核对、勿盲目重发”。真实 PostgreSQL/FORCE-RLS 与 Clerk 故障组合仍未执行，保持 UNVERIFIED。
- 第 33 轮已将 delivery finalize 的 `null` 与异常统一视为未确认：只有取得非空持久化结果后才能返回 `sent: true` 或已确认 failed；平台新建/重试及客户新建/重试均映射至既有三语 `invitation_delivery_uncertain`。客户新邀请遇到 uncertain 会在任何 `member_invited` 分写审计前立即跳转。Memory 与 PostgreSQL finalizer 对 prepare 后并发 revoke/remove/accept 返回空且不写 delivery/audit，同时保留显式 manual released-state 恢复的既有容量校验。
- 受控非生产 initial platform owner bootstrap 已改为显式事务与 deterministic locks：仅在环境精确为 Staging/Preview、进程不存在任何非空 `PG*` 隐式覆盖，且 `DATABASE_MIGRATION_URL` 含非空密码、经严格 URL option 校验并命中固定完整目标指纹时可运行。Pool 只接收显式解析字段，强制证书验证、单连接、非复制模式、固定 application name、`pg_catalog,public` search path 及受控 channel binding；SQL 对 public 业务表与 pg_catalog 系统表全部 schema 限定，所有连接错误均使用不泄露 URL/host/database/user/password/port 的稳定文案。任何用户候选或业务读写前，authority query 必须恰返回一行并同时证明 audit table 的 RLS 与 FORCE RLS 均为 true，且当前连接角色明确为 superuser 或 BYPASSRLS；缺行或任一证据不成立均零业务访问 fail-closed。脚本要求精确一个既有 Clerk 用户；已有其他 active platform owner 时关闭，完全相同目标仅幂等复跑。固定 internal tenant id 已存在时必须与固定 name/slug/account type 精确一致，否则在 tenant/membership/audit 写入前 fail-closed；仅身份完全一致的租户允许恢复为 active。固定 bootstrap audit 仅在六个核心引用字段、固定 message，以及仅含精确 `source`/`mode` 两键的普通 context 对象全部一致时视为幂等；null、array、缺失、错误或额外 context 均按 collision 回滚。脚本不依赖 `ON CONFLICT (tenant_id,user_id)`，按实际 membership id 更新或固定 id 插入，固定 id/audit collision 均 fail-closed；tenant、membership 与唯一 bootstrap audit 任一步失败全部回滚。CLI 从 Pool 显式 `connect()` 取得唯一 PoolClient 并只把该 client 交给事务 primitive；成功、业务异常、COMMIT/ROLLBACK 异常均恰一次 release client/end pool，connect 自身失败时只 end pool，rollback 失败不覆盖原始业务异常。无数据库 fake-driver checker 已接入 `test:platform-subscription`/prebuild；真实 Staging bootstrap 尚未执行。
- 真实 Staging 双会话并发探针保持 UNVERIFIED，执行时必须使用可清理 fixture 并记录完整回滚/清理证据：会话 A 在 `BEGIN` 与 advisory lock 后以单条固定顺序 `LOCK TABLE users, tenant_memberships IN SHARE ROW EXCLUSIVE MODE` 冻结候选集；会话 B 分别尝试插入同邮箱不同大小写的 duplicate eligible Clerk user，以及比当前候选更新的 latest eligible Clerk user，两者在 A 释放前都必须阻塞。A 提交并释放锁、B 完成插入后，重新运行候选解析必须因候选不再唯一而 fail-closed；随后仅按 fixture id 删除探针数据并证明 tenant/membership/audit 基线恢复。禁止在本地或 Production 执行。
