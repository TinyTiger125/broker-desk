# Worker Tokyo Vercel 应用与 Supabase Auth 邮件交接清单

- 日期：2026-09-21（Asia/Tokyo）
- 性质：源码对账、独立 Tokyo 托管方案和环境输入清单
- 边界：未修改旧 `sin1` staging 合同，未改云端、数据库、Vercel 项目、SMTP 或邮件发送。

## 唯一推荐方案

创建一个独立的 Vercel 项目 `broker-desk-worker-tokyo`，从同一仓库部署 Production，使用本次新增的 [`vercel.worker-hnd1.json`](../../vercel.worker-hnd1.json)：函数区域固定为 `hnd1`，每分钟调用 `/api/internal/import-jobs/cron`。该项目的 `DATABASE_URL`、`DATABASE_ADMIN_URL`、迁移连接和 Supabase Auth 项目全部指向同一东京 Supabase 项目；应用函数和数据库因此形成一个独立的 Tokyo 运行单元。

旧 `sin1` staging 项目继续使用仓库根部既有 [`vercel.json`](../../vercel.json)，不加 Cron、不改区域、不切换数据库。两套项目必须使用不同的环境变量组、worker token、Cron secret 和 Supabase 项目，不能让 staging 的连接串或密钥泄漏到 Tokyo 项目。

部署入口是明确的 Vercel CLI 命令，而不是泛称“东京托管任务”：

```sh
vercel deploy --prod --local-config vercel.worker-hnd1.json
```

该命令应在已绑定 `broker-desk-worker-tokyo` 项目的受控发布环境执行。Vercel Cron 只对 Production deployment 生效，因此 Preview alias 只能用于构建/路由预览，不能作为 worker 调度验收依据。每分钟频率要求支持该频率的 Vercel 计划；Hobby 不满足这一要求，不能用 Preview 或 Hobby 规避。

## 独立 Tokyo Cron 机制

现有 drain 端点只接受 `POST`。Vercel Cron 通过 `GET` 访问，因此本次增加了一个窄入口 [`src/app/api/internal/import-jobs/cron/route.ts`](../../src/app/api/internal/import-jobs/cron/route.ts)：

1. 读取 `Authorization: Bearer <CRON_SECRET>`，以恒定时间比较验证 `CRON_SECRET`，长度少于 32 字符直接拒绝。
2. 读取独立项目的 `BROKER_DESK_IMPORT_WORKER_TOKEN`，缺失或过短返回 `503`。
3. 在服务端构造一次 `POST /api/internal/import-jobs/drain`，转发 Bearer worker token 和固定 `{ limit: 3 }`；旧 drain 认证、领取和处理逻辑保持不变。
4. 记录 `requestId`、HTTP 状态、`claimed`、`completed`、`failed`，不记录资料内容、提取值、邮箱或密钥。

本次新增的 [`vercel.worker-hnd1.json`](../../vercel.worker-hnd1.json) 只属于独立项目：

```json
{
  "buildCommand": "npm run build",
  "regions": ["hnd1"],
  "crons": [{ "path": "/api/internal/import-jobs/cron", "schedule": "* * * * *" }]
}
```

`CRON_SECRET` 与 `BROKER_DESK_IMPORT_WORKER_TOKEN` 是两个独立的随机密钥。前者只允许 Vercel Cron 进入新 GET 入口，后者只允许入口转发到既有 drain；不能把任一密钥写入仓库或日志。

## 超时、失败、重试和幂等

- Cron 入口不自行循环重试；Vercel 请求超时或返回非 2xx 时记录失败，下一分钟的下一次 Cron 执行作为一次新的尝试。连续失败、`processing` 长时间不结束和 90 秒客户端超时必须告警。
- 现有 [`scripts/run-import-worker.mjs`](../../scripts/run-import-worker.mjs) 的单次远程调用超时为 90 秒；本次 Cron 入口复用 drain，不增加第二个处理循环。
- drain 服务端将 queued job 原子领取为 processing，使用 `FOR UPDATE SKIP LOCKED`；成功转 ready，失败转 failed 并写审计。重复 Cron 不会重复领取同一 queued job。
- 网络断开不能被当作“未处理”而盲目重复提交；必须依靠 job 状态、`requestId` 和审计记录判断。持续 processing 必须人工/运维恢复流程确认后再处理。
- 每次 Vercel 函数日志至少保留 `requestId`、status、claimed/completed/failed、耗时和错误码；禁止保留文件名、文件内容、解析值、邮箱或 token。

## Worker 现有实现证据

| 项目 | 当前事实 | 证据 |
| --- | --- | --- |
| 启动/兼容入口 | `npm run worker:import` 执行一次 drain；Tokyo Vercel Cron 使用新增 GET 入口 | `package.json`、`scripts/run-import-worker.mjs`、`src/app/api/internal/import-jobs/cron/route.ts` |
| 目标接口 | `BROKER_DESK_APP_URL` 去尾部 `/` 后访问 `/api/internal/import-jobs/drain` | `scripts/run-import-worker.mjs` |
| 认证 | drain 要求至少 32 字符 Bearer worker token，使用恒定时间比较；Cron 入口另行要求 `CRON_SECRET` | 两个 route 文件 |
| 批次 | 服务端限制 1–5；Cron 固定发送 3 | `src/app/api/internal/import-jobs/drain/route.ts` |
| 领取 | 数据库函数原子领取 queued job，使用 `FOR UPDATE SKIP LOCKED` | `src/lib/data.admin.postgres.ts`、`db/migrations/20260918_001_import_job_single_claim.sql` |
| 处理身份 | 每个 job 使用记录中的租户、用户和 external auth subject 建立 worker repository scope | `src/app/api/internal/import-jobs/drain/route.ts` |
| 失败 | 更新 `failed`、标准错误码/摘要并写审计；不返回原始资料或堆栈 | `src/app/api/internal/import-jobs/drain/route.ts` |
| 生产门禁 | 正式生产必须有 worker 开关、非空调度说明和至少 32 字符 token | `src/lib/production-readiness.ts` |

## Tokyo Supabase 项目输入

独立 Tokyo Vercel 项目必须使用一个新建且区域为 Tokyo 的 Supabase 项目；不能复用旧 `sin1` staging 数据库。环境管理员在合法控制台完成项目、数据库区域、备份和连接池确认后，才可填入以下变量：

- `BROKER_DESK_DEPLOYMENT_ENV=production`、`VERCEL_ENV=production`。
- `DATA_DRIVER=postgres`、`DATABASE_URL=<Tokyo Supabase pooled runtime URL>`。
- `DATABASE_ADMIN_URL=<Tokyo Supabase pooled restricted admin URL>`；运行角色必须不是 superuser 或 `BYPASSRLS`。
- `DATABASE_MIGRATION_URL=<Tokyo Supabase migration owner URL>`；迁移只在受控发布步骤运行，不放入普通函数运行时。
- `BROKER_DESK_IMPORT_WORKER_ENABLED=true`。
- `BROKER_DESK_IMPORT_WORKER_SCHEDULE="every 1 minute"`；这是应用 readiness 声明，不是 Cron 存在证明。
- `BROKER_DESK_APP_URL=<独立 Tokyo Vercel 应用 canonical URL>`。
- `BROKER_DESK_IMPORT_WORKER_TOKEN=<至少 32 字符随机密钥>`。
- `CRON_SECRET=<另一个至少 32 字符随机密钥>`。
- 如同一项目承担 Supabase Auth：`BROKER_DESK_AUTH_MODE=supabase`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_ROLE_KEY`；service role 仅服务端使用。

## Vercel 与 Supabase Auth 邮件配置核对

工程可以从合法控制台确认的项目只有这些：

- Vercel 项目是否确实绑定 `broker-desk-worker-tokyo`、Production deployment 是否成功、函数实际区域是否为 `hnd1`、Cron 是否显示已创建且最近有运行记录。
- Tokyo Supabase 项目 ref、数据库区域、migration ledger、连接池端点和备份策略是否与 Tokyo Vercel 项目一致。
- Supabase Site URL 是否为 canonical HTTPS origin；Allowed Redirect URLs 是否精确包含 `/auth/callback`、邀请目标和密码重置目标。
- Invite、Reset Password、确认邮箱模板是否使用 `{{ .RedirectTo }}`/确认链接变量；默认 SMTP 是否仍只允许受限测试收件人；custom SMTP 的控制台状态、域名验证和投递日志是否可见。
- 邀请/重置闭环是否能从 membership 状态、session、审计和实际收件箱分别举证。

在这些控制台事实之外，当前真正缺失的商业选择只有：

1. 面向正式收件人的发件品牌域名、显示名、发件地址和 Reply-To。
2. 是否购买并选定支持正式投递、退信/投诉处理和所需速率的 custom SMTP 服务。

SMTP host、端口、账号、密码、模板文案等属于选定供应商后的受控输入，不应在此文档或仓库中预填。未完成 custom SMTP 和域验证前，不得把默认 SMTP 的受限测试能力当作正式邮件能力。

## 邮件闭环验收证据

必须分别留存以下事实，不能以 API 返回成功或页面显示“已发送”代替：

1. 管理员邀请成员后，本地 membership delivery 为 `pending`，收件箱收到邀请邮件。
2. 点击邀请链接进入 callback，session 建立，进入 `/workspace/invitations`，只接受对应邮箱和对应邀请 token。
3. 接受邀请后 membership 为 active，工作区切换成功，并有 acceptance audit。
4. 忘记密码对已知和未知邮箱显示相同结果；已知邮箱收到邮件，点击后进入 `/reset-password` 并完成密码更新。
5. 错误、过期、错误邮箱、重复点击和 SMTP 失败均有可见可恢复结果；不泄露服务端密钥、token 或 PII。

## 已完成的本地静态证据

- `node scripts/check-worker-tokyo-cron-contract.mjs`：PASS；验证 hnd1、每分钟 Cron、GET 入口、CRON_SECRET、worker token 转发、旧 drain 复用和结构化日志。
- `node scripts/check-auth-provider-contract.mjs`：PASS（25 checks）。
- `node scripts/test-supabase-account-e2e.mjs`：PASS（源码/迁移/生命周期契约；不是云端邮件 E2E）。
- `node scripts/test-import-single-job-claim-contract.mjs`：PASS。
- `node scripts/check-production-security.mjs`：PASS；同时证明旧 `vercel.json` 和安全合同仍要求 `sin1`。

## 未验证与停止条件

- 未执行 Vercel 部署、未读取 Vercel 项目/cron 日志，未购买计划或 SMTP，未发送邮件。
- 未读取 Tokyo Supabase 控制台、数据库区域、migration ledger、连接池或备份配置；未运行真实 job 状态转换。
- 未完成真实 hnd1 Cron 调度、超时告警、失败后下一轮重试和并发领取验收。
- 迁移 `20260921_001_supabase_auth_lifecycle.sql` 自标为 `UNEXECUTED`；没有 Tokyo Supabase 的非生产 migration ledger 证据前，邀请生命周期不能标记为运行就绪。
- 在 Tokyo Supabase 项目/区域、Vercel Production Cron、Secret、SMTP/URL 输入和非生产闭环证据齐全前，不部署、不购买、不发信，不改旧 `sin1` staging。

平台核对依据：Vercel [regions](https://vercel.com/docs/regions)、[vercel.json cron 配置](https://vercel.com/docs/project-configuration/vercel-json)、[Cron 管理与计划限制](https://vercel.com/docs/cron-jobs/manage-cron-jobs)；Supabase [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)、[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)、[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、[Users / inviteUserByEmail](https://supabase.com/docs/guides/auth/users)。
