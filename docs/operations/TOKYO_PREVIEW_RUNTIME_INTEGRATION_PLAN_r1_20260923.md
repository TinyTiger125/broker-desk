# Tokyo Preview 运行时接入方案 r2

状态：仅方案和本地证据，未创建身份、恢复 LOGIN、生成长期凭据、写 Preview 变量或部署。数据库初始化验收沿用 `f5a3210aa1c5025c4ad9b593274fb66dca09abf8` 的既有 complete/44 基线，本轮不重跑。

本轮证据：[Supabase Auth 兼容与调用链证据](tokyo-pg17-recovery-permission-validation-20260922/tokyo-supabase-auth-compatibility-evidence-20260923.json)、[Tokyo runtime/admin TLS 证据](tokyo-pg17-recovery-permission-validation-20260922/tokyo-runtime-tls-evidence-20260923.json)。

## 1. 固定目标与版本

| 项目 | 固定值 | 当前边界 |
| --- | --- | --- |
| Vercel 项目 | `broker-desk-tokyo-validation` | 空项目已创建；部署前仍须复核归属 |
| Project ID | `prj_W4OClYmrW25iNApoSK2y7djJsZDM` | 执行前只读复核 |
| Team ID | `team_GLo3cH4K3Ef8xBWtno1fgcKg` | 执行前只读复核 |
| 部署源码 | `fc27b739e21d35a1ffa8f9f19cda8f6fd34a054b` | Preview 显示的 commit 必须完全一致 |
| 数据库基线 | `f5a3210aa1c5025c4ad9b593274fb66dca09abf8` | 仅数据库版本，不得称为部署版本 |
| Vercel 部署配置 | `vercel.tokyo-preview.json` | `hnd1`、无 Cron；不沿用 `sin1` 或每分钟 Cron |
| Supabase | ref `ilujuwuzaqwcbpnqixen`，Tokyo `ap-northeast-1` | 执行前复核 ref、区域、Session pooler、complete/44 |

不匹配即停止，不创建替代项目、不切换目标。

## 2. Supabase Auth 调用链与兼容点

现有 provider 已支持 Supabase，且不需要重开发：

1. `BROKER_DESK_AUTH_MODE=supabase`（或一致的 `BROKER_DESK_AUTH_PROVIDER`）显式选择 Supabase；未知值、模式/provider 不一致和缺配置均 fail closed。
2. `/sign-in` 渲染 `SupabaseSignInForm`，浏览器调用 `signInWithPassword`；`/auth/callback` 使用 `exchangeCodeForSession`，并限制安全的 `next` 路径。
3. `src/lib/supabase/proxy.ts` 刷新 cookie，会调用 `auth.getClaims()` 并校验 issuer、audience、role、非 anonymous；无效会话对页面重定向 `/sign-in`，对 API 返回 401。
4. `src/lib/supabase/auth.ts` 使用 server client 的 claims，并在 verified identity 路径要求确认邮箱；`auth-provider.ts` 将 subject/identity 接入既有 provider-neutral 契约。
5. `tenant-session.ts` 用外部 subject 查用户、active membership 和 tenant；缺 membership、tenant 或权限时拒绝。`data.ts` 在生产 Postgres 请求中以该 subject 建立请求范围，不走 demo/owner 恢复路径。
6. 上传入口先过 `assertProductionImportWorkerReady`，再 `requireTenantSession({ permission: "source.upload" })`，只将 Excel 入队；状态和处理入口复用同一 tenant 权限。

真实旧阻断已窄修：生产运行时此前无条件要求 Clerk，即使显式配置 Supabase 也返回 `production_auth_required`。`assertProductionAuthReady` 现在按 `getAuthMode()` 接受 Supabase，但仍要求 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`；不改变会话、租户、权限或 demo 边界。真实云端 Auth、tenant 映射和上传尚未部署验证。

## 3. 运行时变量与 TLS/CA 事实

### Auth

- `BROKER_DESK_AUTH_MODE=supabase`：server/runtime 门禁。
- `BROKER_DESK_AUTH_PROVIDER`：可选 server/runtime 选择器；若同时设置，必须与 mode 一致。
- `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`：浏览器和 server 使用的公开 Supabase 配置，不是秘密。
- `SUPABASE_SERVICE_ROLE_KEY`：仅 server-only Auth 管理生命周期需要时使用，绝不写入客户端或页面；本轮不生成、不写入。

### 数据与 worker

- `DATA_DRIVER=postgres`：Preview 显式设置，避免依赖推断。
- `DATABASE_URL`：server-only 页面/请求池，使用 `brokerdesk_runtime` 受限角色。
- `DATABASE_ADMIN_URL`：server-only admin/worker 后台路径，使用 `brokerdesk_admin`；页面不得读取。
- `BROKER_DESK_RUNTIME_TLS_PROFILE=tokyo`：Tokyo Preview TLS 门禁；缺失时连接配置拒绝启动。
- `DATABASE_RUNTIME_CA_CERT`：Tokyo Preview server-only 变量，保存公开的 CA PEM 链；runtime 与 admin 两个池共用，禁止使用本机路径、`DATABASE_MIGRATION_CA_CERT_PATH` 或数据库凭据变量。
- `BROKER_DESK_DEPLOYMENT_ENV=staging` 或 `preview`：保持 Preview 同步处理；不得误判为正式生产 worker 队列。
- `BROKER_DESK_IMPORT_WORKER_TOKEN`、`CRON_SECRET`：仅批准 worker 验收时写入 server-only；当前配置无 Vercel Cron。
- `BROKER_DESK_IMPORT_WORKER_ENABLED`、`BROKER_DESK_IMPORT_WORKER_SCHEDULE`：正式生产 worker 门禁字段，不在 Tokyo Preview 带入每分钟 Cron。

### 迁移与应用连接分离

- `DATABASE_MIGRATION_URL`、`DATABASE_MIGRATION_CA_CERT_PATH` 只供迁移 runner；不能当作应用运行时连接或 CA 配置。
- 当前应用池在生产读取 `DATABASE_URL`，admin/worker 池读取 `DATABASE_ADMIN_URL`。两者均调用同一 `buildDatabasePoolConnectionConfig`：校验 `sslmode` 只能为 `verify-full`，移除 URL 中的 TLS 参数，再显式传入 `rejectUnauthorized:true`、`servername=<URL host>` 和 `DATABASE_RUNTIME_CA_CERT`。因此 URL 参数不会覆盖显式 TLS 配置；Tokyo 缺 CA、CA 不受信或主机名不匹配均失败，不降级。

## 4. 执行顺序（审批后）

1. **代码候选收口**：审阅本 r2 兼容补丁及本地测试；确认 commit `fc27b739`、入口哈希和文档哈希。
2. **只读平台复核**：确认 Project/Team、Tokyo 区域、无 Cron、数据库 ref、owner/ACL/membership、marker/ledger/checksum；确认 Preview 变量包含 `BROKER_DESK_RUNTIME_TLS_PROFILE=tokyo` 和完整 `DATABASE_RUNTIME_CA_CERT`，否则停止。
3. **准备身份和凭据**：获批后才创建专用 Supabase Auth synthetic user、最小 synthetic tenant/membership，并在受控进程生成两份长期数据库凭据；不使用真实邮箱或资料，不记录密码/token。
4. **Preview 变量**：写入 server-only `DATABASE_URL`、`DATABASE_ADMIN_URL`、`DATABASE_RUNTIME_CA_CERT`、`BROKER_DESK_RUNTIME_TLS_PROFILE=tokyo`、Supabase Auth 所需 server-only secret（如确需）、`BROKER_DESK_AUTH_MODE`、`DATA_DRIVER`、`BROKER_DESK_DEPLOYMENT_ENV` 及批准的 worker secret。公开的 `NEXT_PUBLIC_SUPABASE_*` 只包含公开 URL/key。
5. **部署**：从完全匹配的 `fc27b739` 创建部署，复核 commit、`hnd1`、无 Cron、变量作用域。若 Supabase redirect/site URL 必须先有部署地址，可先做**仅取得 URL 的临时部署**；该部署不算验收，配置完成后必须用同一 commit 重新部署并重新验收。
6. **分别验收页面与 worker**，不得把一个流程的成功替代另一个。

## 5. Preview 验收

### 页面同步

用 synthetic Supabase 身份登录，确认 session subject、tenant membership、权限和页面读回；通过受保护 Excel 上传入口入队，按当前 Preview/Staging 同步处理路径完成候选持久化、人工修正、保存、刷新/重开和审计读回。接口返回 202/200 或页面显示成功单独不足以通过。

### 合成 worker

1. 仍用受认证身份通过 Excel 上传入口创建真实 `queued` job，并读回确认 `queued`。
2. 不调用 `/api/input-files/{jobId}/process` 作为 worker 证明；该入口在 Preview/Staging 是同步处理路径。
3. 在获批且写入 `CRON_SECRET`/`BROKER_DESK_IMPORT_WORKER_TOKEN` 后，手动触发现有受保护 worker drain/cron 入口；记录 claim、processing、成功状态、审计和页面读回。空队列或 HTTP 200 不算端到端通过；正常样本必须成功，failed 样本只能作为失败处理证据。

## 6. 身份与合成数据清理

清理顺序固定为：身份仍可用时，先通过受保护删除入口删除合成上传/作业，并读回确认；删除不确定或不允许时保留并标记 synthetic，停止，不执行临时 SQL。数据清理完成或明确标记后，再停用/删除 Supabase Auth synthetic identity。不得先删身份再失去受保护删除能力。

部署或验收失败时：停止流量和后续写入 → 关闭本轮页面/worker 连接并核对会话 → 仅对本轮确认变更的数据库角色执行 NOLOGIN/PASSWORD NULL → 删除 Preview server-only 变量 → 按上述顺序清理 synthetic 数据和身份。连接失效、提交不确定或清理不确定时，报告最后确认状态和残留，不重试、不终止无关会话。

## 7. 当前结论

- Supabase Auth 代码支持和 Clerk-only readiness 阻断已在本地收敛；无效会话、缺配置、未知 mode/provider 仍拒绝。
- 运行时 TLS/CA 窄修已完成：runtime/admin 共用 CA PEM 和显式主机名校验；本地已验证共享配置经 Node TLS 的可信证书成功、不受信证书拒绝、主机名不匹配拒绝，并用实际 `pg.Client` 检查解析结果。真实应用连接池在 Tokyo Preview 的握手仍待 Preview 验收。
- 真实云端身份、Preview 变量、部署、页面同步和 worker 端到端均未执行，本方案不把本地证据写成云端通过。

本方案只交付审批，不执行任何云端写入、LOGIN、凭据生成、身份创建或部署。
