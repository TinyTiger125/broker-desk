# TASK-038 / TASK-039 `broker-desk-staging` 配置准备清单

> 状态：仅完成版本与配置准备，尚未创建 Vercel 项目、尚未部署、尚未连接非生产数据库。
> 本清单不保存任何密钥、Cookie、Token、密码或数据库连接值。

## 代码版本

- Vercel 项目名：`broker-desk-staging`
- 部署分支：`staging/task-038-039-20260820`
- 当前快照：`dd63a522e49cc359c69375f1ee8f9c93c3e86197`
- 基线：`35f0cd6541c4ce0e3e838e21d9dd282855ead37e`
- 生产 `main` 不在本次部署范围内。
- 未跟踪的 `src/app/clients/page 2.tsx` 未进入快照。

## Clerk Development（同一实例）

由环境管理员在 Vercel Preview 环境注入，不写入仓库：

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_KEY`（如该 Development 实例要求本地 JWT 验证）
- `BROKER_DESK_AUTH_MODE=clerk`
- `BROKER_DESK_CLERK_INVITATION_REDIRECT_URL=<staging-origin>/workspace/invitations`

要求：公开密钥、服务端密钥、JWT/JWKS 来源必须属于同一个 Clerk Development 实例；测试身份 A/B 由环境管理员管理，不写入环境文件、日志或验收材料。

## 独立非生产 PostgreSQL

仅使用独立非生产数据库，禁止复用正式连接：

- `DATA_DRIVER=postgres`
- `DATABASE_URL=<non-production runtime role>`
- `DATABASE_ADMIN_URL=<non-production admin role>`
- `DATABASE_MIGRATION_URL=<non-production migration role>`（仅一次性升级使用）
- `BROKER_DESK_RUN_MIGRATIONS=false`（应用运行时）

数据库准备顺序：使用当前仓库全部 migration 建立基础结构，再应用 TASK-038/TASK-039 追加 migration；应用服务只使用受限运行角色。不得回填正式数据，不得把未应用 migration 伪称为运行证据。

## 业务环境门禁

- `BROKER_DESK_DEPLOYMENT_ENV=staging`
- `GUARANTEE_G1_SLICE1_ENABLED=false`（取得明确非生产测试主体 ID 后才可按 allowlist 开启）
- `GUARANTEE_G1_SLICE1_TENANT_ALLOWLIST=<non-production tenant id>`
- `BROKER_DESK_ENABLE_DEMO_AUTH=false`
- `BROKER_DESK_ENABLE_PLATFORM_OWNER_TENANT_FALLBACK=false`
- 不设置 `BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED=true`。

验收前还需确认 Preview/Staging 运行模式不会被错误当作正式生产；不能用正式生产批准标志、伪造身份或放宽认证来绕过该门禁。

## 费用与回退

- 当前没有创建付费资源，也没有升级 Vercel 方案。
- Vercel 官方当前列出的 Hobby 为 `$0/月`；若该方案不适用于此次受控验收，Pro 当前列为 `$20/月`，升级前必须重新批准。[官方定价](https://vercel.com/pricing)
- 部署失败或验收结束时，删除 `broker-desk-staging` 项目及独立数据库即可，不影响现有 `web` 项目和正式环境。

## 一次性建项目请求前置条件

仅在上述代码快照、Clerk Development 配置、独立数据库和非生产门禁确认后，向产品负责人提交一次：

`Add New → Project` → 选择仓库 `TinyTiger125/broker-desk` → 分支 `staging/task-038-039-20260820` → 项目名 `broker-desk-staging`。
