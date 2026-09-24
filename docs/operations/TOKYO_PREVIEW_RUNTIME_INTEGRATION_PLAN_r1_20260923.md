# Tokyo Preview 运行时接入方案 r3 — Direct 本地候选（2026-09-24）

workId：`TOKYO-DIRECT-PREVIEW-R1`。本轮只收口本地候选；未进行云端操作、购买、LOGIN、变量写入或部署。03:15 UTC 的既有双角色 Direct 探针已通过并完成 NOLOGIN/PASSWORD NULL 清理，不重跑。数据库初始化验收沿用 `f5a3210aa1c5025c4ad9b593274fb66dca09abf8` 的既有 complete/44 基线，本轮不重跑。

沿用的 Auth/TLS 基线证据（2026-09-23）：[Supabase Auth 兼容与调用链证据](tokyo-pg17-recovery-permission-validation-20260922/tokyo-supabase-auth-compatibility-evidence-20260923.json)、[Tokyo runtime/admin TLS 证据](tokyo-pg17-recovery-permission-validation-20260922/tokyo-runtime-tls-evidence-20260923.json)。

## 1. 固定目标与版本

| 项目 | 固定值 | 当前边界 |
| --- | --- | --- |
| Vercel 项目 | `broker-desk-tokyo-validation` | 既有验证项目；部署前仍须复核归属 |
| Project ID | `prj_W4OClYmrW25iNApoSK2y7djJsZDM` | 执行前只读复核 |
| Team ID | `team_GLo3cH4K3Ef8xBWtno1fgcKg` | 执行前只读复核 |
| 部署源码 | 基线 `eaca68f2e882bce35bf404acfb74df5c3dbb1550` 加本轮明确补丁 | 最终候选提交及配置哈希由本轮交付报告给出；外部执行前逐项匹配，禁止继续归档旧 FIXED commit |
| 数据库基线 | `f5a3210aa1c5025c4ad9b593274fb66dca09abf8` | 仅数据库版本，不得称为部署版本 |
| Vercel 部署配置 | `vercel.tokyo-preview.json` | `hnd1`、无 Cron；不沿用 `sin1` 或每分钟 Cron |
| Supabase | ref `ilujuwuzaqwcbpnqixen`，Tokyo `ap-northeast-1` | 执行前复核 ref、区域、Direct endpoint、complete/44 |

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
- `BROKER_DESK_RUNTIME_TLS_PROFILE=tokyo`：必须在 Preview 显式设置；该值启用强制 CA/verify-full 校验。预检须拒绝配置缺失，不把代码中的非 Tokyo 兼容分支当作强制门禁。
- `DATABASE_RUNTIME_CA_CERT`：Tokyo Preview server-only 变量，保存公开的 CA PEM 链；runtime 与 admin 两个池共用，禁止使用本机路径、`DATABASE_MIGRATION_CA_CERT_PATH` 或数据库凭据变量。
- `BROKER_DESK_DEPLOYMENT_ENV=staging` 或 `preview`：保持 Preview 同步处理；不得误判为正式生产 worker 队列。
- `BROKER_DESK_IMPORT_WORKER_TOKEN`、`CRON_SECRET`：仅批准 worker 验收时写入 server-only；当前配置无 Vercel Cron。
- `BROKER_DESK_IMPORT_WORKER_ENABLED`、`BROKER_DESK_IMPORT_WORKER_SCHEDULE`：正式生产 worker 门禁字段，不在 Tokyo Preview 带入每分钟 Cron。

### 迁移与应用连接分离

- `DATABASE_MIGRATION_URL`、`DATABASE_MIGRATION_CA_CERT_PATH` 只供迁移 runner；不能当作应用运行时连接或 CA 配置。
- 当前应用池在生产读取 `DATABASE_URL`，admin/worker 池读取 `DATABASE_ADMIN_URL`。两者均调用同一 `buildDatabasePoolConnectionConfig`：校验 `sslmode` 只能为 `verify-full`，移除 URL 中的 TLS 参数，再显式传入 `rejectUnauthorized:true`、`servername=<URL host>` 和 `DATABASE_RUNTIME_CA_CERT`。因此 URL 参数不会覆盖显式 TLS 配置；Tokyo 缺 CA、CA 不受信或主机名不匹配均失败，不降级。

## 4. Direct 候选与执行顺序（外部操作须另行授权）

- 固定 host `db.ilujuwuzaqwcbpnqixen.supabase.co`、port `5432`、database `postgres`。`DATABASE_URL` 使用裸角色 `brokerdesk_runtime`；`DATABASE_ADMIN_URL` 使用裸角色 `brokerdesk_admin`，不能附加 `.ilujuwuzaqwcbpnqixen`。密码经 URL percent-encoding，只进入受控 server-only 配置；不使用管理角色作为应用身份。
- 迁移 runner、管理连接与初始化入口继续保留既有受控 pooler 路径；本轮只变更应用 runtime/admin 路由候选，不用 Direct 预检改写初始化合同。
- 保留共享 CA PEM、`rejectUnauthorized:true`、与 direct host 相同的 SNI，禁止降级 TLS。已通过回执为 `evidence/tokyo-db-fallback-compat-20260924/cloud-direct-runtime-login-verified-20260924.json`，其 SHA-256 清单同目录 `direct-login-verified-20260924.sha256`；它证明当时直接双角色探针，不证明 Vercel。
- 低并发 Preview 采用 Tokyo profile + Vercel `preview` 两条件同时成立时 runtime/admin 两池分别 max=1；其他部署仍沿用 4/2。实例可能扩容，所以是每实例最多两个应用连接，绝不是全项目最多两个。既有 idle=60s、connect timeout=10s 不变；遇连接排队/耗尽停止验收，不以增加池上限掩盖问题。
- [Supabase 官方连接文档](https://supabase.com/docs/guides/database/connecting-to-postgres)（2026-09-24 核对）推荐 serverless 每池1且默认推荐 transaction pooler。此 Direct 候选只用于低并发固定 Preview；不构成高并发生产架构。Direct 默认 IPv6，付费 IPv4 add-on 将 endpoint 改为 IPv4（不是双栈）。产品经理本轮通过 get_project/get_organization 与已登录 Dashboard 核对：broker desk 为 Free，目标 Tokyo 项目为 Nano，组织内该目标为唯一项目，未绑定付款方式；升级面板 Pro 为 USD25/月。[IPv4 官方价格](https://supabase.com/docs/guides/platform/ipv4-address)为 USD0.0055/小时，约 USD4/月，且不受 Spend Cap 覆盖。预算基线约 USD29/月，额外用量另计；本轮未购买，启用时须接受短暂 DNS 切换。

执行顺序：

1. 收口本地测试/构建与一次独立候选审查；冻结最终提交、精确写集及 `vercel.tokyo-preview.json` 哈希。现有配置明确 `framework=nextjs`、`buildCommand=npm run build`、`regions=[hnd1]`、没有 Cron/outputDirectory。旧 orchestrator 的 FIXED、pooler URL 构造及归档命令不可直接复用：仅归档 eaca68f 会遗漏本轮池修正及已存在 framework 改动。
2. 外部执行授权包含且仅包含固定 Project/Team 的 Preview、需要的 Supabase Pro/IPv4 条件和合成业务验收。先只读核对目标、计费选项、现有变量作用域和回滚边界；Vercel Preview 配置不由文件名自动决定，命令必须显式 `--target preview --local-config vercel.tokyo-preview.json`，禁止 `--prod`。
3. 经购买授权启用 IPv4 后，确认固定 direct host 的实际 A 记录及连接能力；不硬编码旧 IP。当前两角色是 NOLOGIN/PASSWORD NULL；另行批准后才在受控进程准备独立长期凭据和 LOGIN，保持所有既有 owner/ACL/RLS/membership，不迁库、不扩权。
4. 只在固定项目的 Preview 作用域设置第3节变量及 Direct 裸角色连接；确保平台系统 `VERCEL_ENV=preview` 可见，不能手工伪造 Production 环境。确认 Supabase Auth redirect/site URL 与固定 Preview匹配；仅在获批时准备专用 synthetic user/tenant/membership。不得把服务密钥写到 NEXT_PUBLIC 字段。
5. 用冻结后的同一源码/配置部署 Preview，读取实际 deployment target、函数 `hnd1`、Next.js runtime 和源码元数据。平台框架、函数区域或目标不匹配即停。只取得 URL 的部署不算业务验收。
6. 在实际部署环境先核对应用两池的身份/TLS，再执行第5节页面与手动 worker 验收。没有真实登录、保存重开和 worker 结果时，不宣布业务 Preview 可用。成功后保留受控 Preview；失败按第6节回滚，不影响 Production 或无关会话。

## 5. Preview 验收

### 页面同步

用 synthetic Supabase 身份登录，确认 session subject、tenant membership、权限和页面读回；通过受保护 Excel 上传入口入队，按当前 Preview/Staging 同步处理路径完成候选持久化、人工修正、保存、刷新/重开和审计读回。接口返回 202/200 或页面显示成功单独不足以通过。

### 合成 worker

1. 仍用受认证身份通过 Excel 上传入口创建真实 `queued` job，并读回确认 `queued`。
2. 不调用 `/api/input-files/{jobId}/process` 作为 worker 证明；该入口在 Preview/Staging 是同步处理路径。
3. 在获批且写入 `CRON_SECRET`/`BROKER_DESK_IMPORT_WORKER_TOKEN` 后，手动触发现有受保护 worker drain/cron 入口；记录 claim、processing、成功状态、审计和页面读回。空队列或 HTTP 200 不算端到端通过；正常样本必须成功，failed 样本只能作为失败处理证据。

## 6. 身份与合成数据清理

清理顺序固定为：身份仍可用时，先通过受保护删除入口删除合成上传/作业，并读回确认；删除不确定或不允许时保留并标记 synthetic，停止，不执行临时 SQL。数据清理完成或明确标记后，再停用/删除 Supabase Auth synthetic identity。不得先删身份再失去受保护删除能力。

部署或验收失败时：停止公共流量、worker 和后续验收写入 → 在受控合成身份及连接仍可用时按上述顺序清理 synthetic 数据；不能安全清理则保留并标记残留 → 停用合成身份 → 关闭本轮页面/worker 连接并核对会话 → 仅对本轮确认变更的数据库角色执行 NOLOGIN/PASSWORD NULL → 删除本轮新增的 Preview server-only 变量，既有值按受控备份恢复。若凭据泄露等情形必须先撤销，则优先撤销并记录待清理数据，不再声称已清理。连接失效、提交不确定或清理不确定时，报告最后确认状态和残留，不重试、不终止无关会话。

## 7. 当前结论

- Supabase Auth 代码支持和 Clerk-only readiness 阻断已在本地收敛；无效会话、缺配置、未知 mode/provider 仍拒绝。
- 运行时 TLS/CA 窄修已完成：runtime/admin 共用 CA PEM 和显式主机名校验；本地已验证共享配置经 Node TLS 的可信证书成功、不受信证书拒绝、主机名不匹配拒绝，并用实际 `pg.Client` 检查解析结果。真实应用连接池在 Tokyo Preview 的握手仍待 Preview 验收。
- 本轮未执行真实云端身份、Preview 变量、部署、页面同步和 worker 端到端；过往部署尝试不视为本 Direct 候选验收。本方案不把本地构建或既有 Direct 探针写成 Vercel/业务通过。

本方案只交付审批，不执行任何云端写入、LOGIN、凭据生成、身份创建或部署。
