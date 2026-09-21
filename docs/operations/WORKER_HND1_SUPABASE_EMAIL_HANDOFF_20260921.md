# Worker hnd1 与 Supabase Auth 邮件交接清单

- 日期：2026-09-21（Asia/Tokyo）
- 性质：只读源码对账、最小托管方案和平台输入清单
- 边界：未修改旧 `sin1` 合同，未改数据库、云端配置、Vercel 部署、Supabase 项目、SMTP 或邮件发送。

## 结论

现有 worker 已具备受保护的 drain 接口和可被托管调度器调用的 Node 脚本，不需要新增业务路由、表或身份凭据逻辑。当前最小安全方案是：保留应用函数及数据库的既有 `sin1` 合同，由一个位于 hnd1 或同等受控东京区域的托管调度任务运行 `npm run worker:import`，向现有 `BROKER_DESK_APP_URL` 发送 Bearer worker token。

不能把 hnd1 直接写进当前 `vercel.json`：现有安全门禁明确要求 `sin1`，并以 Singapore Neon 数据库共址为理由。切换到 hnd1 需要先确认数据库实际区域、连接延迟和备份/恢复边界，再单独更新区域合同与验证；本清单不扩大该范围。

## Worker 现有实现证据

| 项目 | 当前事实 | 证据 |
| --- | --- | --- |
| 启动命令 | `npm run worker:import`，执行一次 drain 请求 | `package.json`、`scripts/run-import-worker.mjs` |
| 目标地址 | `BROKER_DESK_APP_URL` 去除尾部 `/` 后拼接 `/api/internal/import-jobs/drain` | `scripts/run-import-worker.mjs` |
| 认证 | `Authorization: Bearer <worker token>`；服务端要求 token 至少 32 字符并使用恒定时间比较 | `scripts/run-import-worker.mjs`、`src/app/api/internal/import-jobs/drain/route.ts` |
| 批次 | 默认或请求体 `limit`，服务端限制为 1–5；脚本发送 3 | 同上 |
| 领取 | 数据库函数原子领取 queued job，使用 `FOR UPDATE SKIP LOCKED`；单任务诊断不回退到批量领取 | `src/lib/data.admin.postgres.ts`、`db/migrations/20260918_001_import_job_single_claim.sql` |
| 处理身份 | 每个 job 使用记录中的租户、用户和 external auth subject 建立 worker repository scope | `src/app/api/internal/import-jobs/drain/route.ts` |
| 失败 | 更新 `failed`、标准错误码/摘要并写审计；不会返回原始资料或堆栈 | `src/app/api/internal/import-jobs/drain/route.ts` |
| 生产门禁 | 正式生产必须同时有 worker 开关、非空调度说明和足够长 token | `src/lib/production-readiness.ts` |

## 最小托管调度方案（不改旧 sin1）

1. 在平台侧创建单个 hnd1/Tokyo 托管任务，运行仓库的 `npm run worker:import`；不在浏览器、Next 页面请求或客户端脚本中运行 worker。
2. 向该任务注入 `BROKER_DESK_APP_URL`、`BROKER_DESK_IMPORT_WORKER_TOKEN` 以及读取服务所需的服务端变量；凭据只放平台 Secret，不写仓库或日志。
3. 频率按产品约定设置为每分钟一次；`BROKER_DESK_IMPORT_WORKER_SCHEDULE="every 1 minute"` 只作为应用 readiness 的声明，不能证明调度器已存在或正在运行。
4. 每次任务保留开始时间、HTTP 状态、`requestId`、`claimed`、`completed`、`failed`，并对连续失败、持续 processing 和超时告警。
5. 先在非生产环境完成：双 worker 并发唯一领取、远程读取超时转 failed、重试不重复上传、租户隔离和任务状态轮询；再决定是否接入正式环境。

### Vercel 依赖与停止条件

- 当前 [`vercel.json`](../../vercel.json) 仅配置 `regions: ["sin1"]`，没有 `crons`、`CRON_SECRET` 或 scheduler 配置。
- Vercel `crons` 配置只作用于 Production deployment；分支 Preview alias 不能因此获得已证实的托管 worker。Hobby 计划也不能承载每分钟调度。
- 若未来选 Vercel Cron，需要单独确认 Production deployment、Secret 到 `Authorization` header 的映射、函数 region 和数据库 region；本次不改 `vercel.json`。
- 当前仓库没有 hnd1 平台地址或调度任务 ID。没有平台任务记录、最近运行日志和真实 job 状态转换证据前，worker 只能标记为 **代码具备、托管运行未验**。

平台核对依据：Vercel [regions](https://vercel.com/docs/regions)、[vercel.json cron 配置](https://vercel.com/docs/project-configuration/vercel-json)、[Cron 管理与计划限制](https://vercel.com/docs/cron-jobs/manage-cron-jobs)。

## Supabase Auth 邮件用户输入清单

以下值由环境管理员在 Supabase/Vercel 控制台提供，不写入仓库、报告或日志：

### Vercel 环境变量

- `BROKER_DESK_AUTH_MODE=supabase`
- `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>`
- `SUPABASE_SERVICE_ROLE_KEY=<server-only secret key>`
- `BROKER_DESK_SUPABASE_INVITE_REDIRECT_URL=https://<canonical-host>/auth/callback?next=/workspace/invitations`
- 每个环境的 `BROKER_DESK_DEPLOYMENT_ENV`、`VERCEL_ENV` 和数据库连接变量必须与目标 Supabase 项目一致。

### Supabase Auth URL 配置

- Site URL：当前环境的 canonical HTTPS origin。
- Allowed Redirect URLs：精确加入登录环境、`/auth/callback`、邀请目标和密码重置目标；不能以任意公网通配符代替。当前代码的重置回跳是 `/auth/callback?next=/reset-password`，邀请回跳由 `BROKER_DESK_SUPABASE_INVITE_REDIRECT_URL` 提供。
- Invite 和 Reset Password 模板必须使用 Supabase 提供的 `{{ .RedirectTo }}`/确认链接变量；模板不得硬编码另一环境域名。
- 确认邀请链接有效期、重置链接有效期和过期后的重新发送策略。

### SMTP 供应商输入

- SMTP host、端口、TLS/STARTTLS 模式。
- SMTP 用户名、密码或 API 级凭据；只进入 Supabase 控制台 Secret 字段。
- 发件人显示名、发件邮箱、Reply-To。
- SPF、DKIM、DMARC 和发件域验证结果。
- 发送速率、退信/投诉处理、测试收件人名单和支持联系人。
- Invite、Reset Password、确认邮箱三类邮件的主题、品牌文案和语言版本。

Supabase 内置 SMTP 仅适合受限测试收件人；正式向任意受邀邮箱发信前必须完成 custom SMTP 配置和真实投递验证。

Supabase 核对依据：[Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)、[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)、[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、[Users / inviteUserByEmail](https://supabase.com/docs/guides/auth/users)。

## 邮件闭环验收证据

必须分别留存以下事实，不能以 API 返回成功或页面显示“已发送”代替：

1. 管理员邀请成员后，本地 membership delivery 状态为 `pending`，且收件箱收到邀请邮件。
2. 点击邀请链接进入 callback，session 建立，进入 `/workspace/invitations`，只接受对应邮箱和对应邀请 token。
3. 接受邀请后 membership 变为 active，工作区切换成功，并有 acceptance audit。
4. 忘记密码请求对已知和未知邮箱显示相同结果；已知邮箱实际收到邮件，点击后可进入 `/reset-password` 并完成密码更新。
5. 错误、过期、错误邮箱、重复点击和 SMTP 失败均有可见可恢复结果；不泄露服务端密钥、token 或 PII。

## 已完成的本地静态证据

- `node scripts/check-auth-provider-contract.mjs`：PASS（25 checks）。
- `node scripts/test-supabase-account-e2e.mjs`：PASS（源码/迁移/生命周期契约；不是云端邮件 E2E）。
- `node scripts/test-import-single-job-claim-contract.mjs`：PASS。
- `node scripts/check-production-security.mjs`：PASS；同时证明当前安全合同仍要求 `sin1`。

## 未验证与停止条件

- 未读取或修改 Vercel、Supabase、SMTP、数据库或生产配置。
- 未运行真实 hnd1 调度任务，未观察 Vercel cron、worker 最近运行记录或 job 状态转换。
- 未发送测试邮件，未点击邀请/重置链接，未完成 Supabase Auth 真实 E2E。
- 迁移 `20260921_001_supabase_auth_lifecycle.sql` 自标为 `UNEXECUTED`；没有非生产 migration ledger 证据前，Supabase 邀请生命周期不能标记为运行就绪。
- 在区域决策、SMTP/URL 输入和非生产闭环证据齐全前，不改旧 `sin1` 合同，不部署，不购买平台资源，不发信。
