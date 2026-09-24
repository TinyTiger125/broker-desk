# Tokyo 隔离验证环境最小接入合同

日期：2026-09-22 01:05 JST（本地工程读取时间）
范围：只读核对、无 Cron 的 hnd1 Preview 配置候选和后续执行合同。
基础版本：`816263839f6ddd3ac8716e8ff128a2baf762bcbe`（仅包含初始化恢复交付，不包含本合同和 Preview 配置）。
部署必须绑定本次合同提交生成的新 commit，不得把基础版本 `8162638` 写成已包含 Tokyo Preview 配置的部署版本。
本轮：未创建云端项目、未修改云配置、未迁移、未部署、未购买、未发信、未执行真实资料测试。

## 1. 配置选择

| 文件 | 用途 | 本轮处理 |
| --- | --- | --- |
| `vercel.json` | 旧 staging | 保留；继续 `sin1`，不指向 Tokyo |
| `vercel.worker-hnd1.json` | 旧独立 worker 候选 | 保留；含 Cron，不作为本轮 Preview 配置，也不据此创建独立项目 |
| `vercel.tokyo-preview.json` | 单一 Tokyo 应用的 Preview 候选 | 新增；固定 `hnd1`，无 `crons`，禁止 `main` 自动部署 |

选择方式：

1. 在**新建的单一 Tokyo Vercel 项目**中先执行项目绑定，并读取 `.vercel/project.json` 的项目 ID/名称；若仍绑定 `broker-desk-staging`，停止。
2. 从包含本合同和 Preview 配置的**新 commit**持久 worktree 执行 `vercel deploy --local-config vercel.tokyo-preview.json`，不加 `--prod`；基础版本 `8162638` 不可单独作为本接入部署版本。
3. 部署前后都核对 Preview、`hnd1`、准确 commit 和无 Cron；不得使用默认 `vercel.json`，不得使用 `vercel.worker-hnd1.json`。

该文件只指定 Preview 函数区域，不创建调度器。Vercel Cron 仍是后续部署类型决策，不能由 Preview 运行证明替代。

## 2. 依赖顺序和角色边界

### 固定顺序

1. **数据库初始化**：Tokyo 入口先只读 preflight，再由明确授权的受控命令完成初始化；marker 为 `complete`、迁移账本连续且 checksum 一致。
2. **受限数据库登录账号开通**：初始化完成后，才允许针对固定 Tokyo 目标开通 `brokerdesk_runtime` 和 `brokerdesk_admin` 的 LOGIN。现有通用脚本会读取环境中的 `DATABASE_URL`/`DATABASE_DEVELOPMENT_URL` 并写入 `.env.local`，本轮禁止直接调用它。
3. **独立只读身份/权限核对**：使用固定 Tokyo management/migration 连接执行 `BEGIN READ ONLY`，确认：
   - 当前数据库为 `postgres`、schema 为 `public`；
   - 两个角色均存在、`rolcanlogin=true`；
   - 两个角色均为 `rolsuper=false`、`rolcreaterole=false`、`rolcreatedb=false`、`rolbypassrls=false`、`rolreplication=false`；
   - runtime 与 admin 连接身份不同，runtime 不拥有 DDL；
   - preimport 表仍由 `brokerdesk_admin` 所有并启用 FORCE RLS；
   - worker 只能执行已审查的 claim 函数。
4. **绑定 Preview**：只有第 3 步通过，才把 Preview runtime/Auth 变量绑定到 Tokyo 项目；migration URL、CA 和管理凭据不进入页面 runtime。

### 为什么不能复用初始化检查

初始化前置检查要求 `brokerdesk_runtime`/`brokerdesk_admin` 为 `NOLOGIN`，以避免空库初始化时出现可登录角色。投入使用后角色必须变为 LOGIN；因此投入使用后的检查必须是上面的独立只读检查，不能通过放宽 `classifyTokyoInitialization` 来兼容。

### 恢复边界

- marker 已 `complete` 且 ledger 已到固定基线：重复初始化必须拒绝；只做只读身份/权限检查。
- marker 为 `initializing` 或 ledger 不完整：先解除 Preview/worker 绑定，断开 runtime/admin 会话；由固定 Tokyo 管理连接把两个受限角色临时恢复为 `NOLOGIN`，再执行现有受控 recovery。不能证明目标、角色属性或会话状态时停止，交 DBA 复核。
- 任何不确定提交均先查 marker/ledger，不盲目重跑；不修改历史 migration，不放宽初始化门禁。

## 3. Preview 验证范围

### 页面同步流程

当前 Preview/staging 使用同步处理。页面验收单独记录：上传/处理请求、同步响应、持久化候选、人工修正、保存、刷新/重开和审计。页面同步成功不等于 worker 已验证。

### worker 定向验证

Preview 无 Cron，只能手动调用受保护的 worker route；不得把空队列、HTTP 200 或接口返回成功写成端到端通过。

合成作业步骤：

1. 使用专用 synthetic tenant、synthetic user 和合成 Excel fixture，通过**受认证的 Excel 上传入口**创建真实 `queued` job；记录 job ID、tenant ID 和创建审计，不使用客户资料。
2. 上传返回后先通过受保护的 job 查询/页面确认状态确实为 `queued`。此步骤**不得调用** `/api/input-files/{jobId}/process` 或其他同步处理接口；Preview 的页面同步处理模式保持不变，worker 验证必须从 queued 状态开始。
3. 手动调用同一 Preview deployment 的 `/api/internal/import-jobs/cron`，同时提供仅用于 Preview 的 `CRON_SECRET`；该 route 再使用 `BROKER_DESK_IMPORT_WORKER_TOKEN` 调用既有 drain。
4. 正常样本必须观察 `queued → processing → mapped`（如该产品确认步骤存在，再观察其受支持的 `completed` 结果），并同时留存 worker request ID/claimed/completed/failed、数据库审计行、页面候选读回和刷新后状态。只有正常样本完成这条链路才算 worker 验收通过。
5. `failed` 样本只能证明失败处理、错误码和可恢复边界，不能替代正常链路验收。空队列、HTTP 200 或接口返回成功也不能替代端到端证据。
6. 清理优先使用产品已有的受保护 `deletePreimportPropertyUpload`，且仅限 job 仍满足可删除边界；若正常样本已到 `mapped` 或已开始最终导入，没有受支持删除入口时保留该 synthetic 记录并标记测试数据，不执行临时 SQL 删除。
7. worker route、页面同步流程、数据库审计和读回任一缺失，均为未通过；不冒充 Production，也不启用 Cron 绕过门禁。

## 4. 下一次云端操作合同

### 准确目标

- 项目：一个新建的 Tokyo Vercel 项目，页面和 worker 同项目；不得绑定旧 `broker-desk-staging`。
- 部署：本次合同提交生成的新 commit 的 Preview，配置文件为 `vercel.tokyo-preview.json`；`816263839f6ddd3ac8716e8ff128a2baf762bcbe` 仅为基础版本，不含本地新增配置。
- 数据库：Supabase `broker-desk-tokyo-validation`，ref `ilujuwuzaqwcbpnqixen`，Tokyo `ap-northeast-1`。

### 写入范围

仅允许在单一 Tokyo 项目 Preview 作用域写入：

- Tokyo Supabase URL 与 publishable key；
- 受限 `DATABASE_URL`；
- worker 的 server-only `DATABASE_ADMIN_URL`、worker token 和手动 route secret；
- `BROKER_DESK_DEPLOYMENT_ENV=staging`、Preview 认证配置。

不得写入：旧 staging 项目、Production 作用域、migration URL/CA、历史 migration、真实账号或真实资料。

### 停止条件

项目 ID、区域、Preview 状态、commit、数据库 ref、角色属性、TLS/session 锁、RLS 或审计任一不符，立即停止。不得通过切回 `sin1`、启用 Cron、使用管理角色作为 runtime 或放宽初始化门禁继续。

### 成功证据

必须保存项目 ID、Preview deployment ID、实际 `hnd1`、准确 commit、无 Cron 配置、Tokyo DB ref/区域、只读角色检查、页面同步链路、合成 worker 完整状态链、审计和页面读回。日志不得包含秘密、原始资料或用户凭据。

### 数据库初始化、账号开通、应用部署的隔离

- 初始化是独立数据库操作；不由 Vercel build/startup 触发。
- 受限账号开通是初始化完成后的独立数据库操作；不与 migration 同一条未审查通用命令混用。
- 应用部署只绑定已核对的 runtime/Auth 变量；Preview 部署成功不表示初始化或角色开通成功。

## 5. 当前事实时间边界

- 本地文件和 Git 状态：本轮读取于 `2026-09-22 01:05 JST`。
- Supabase/Vercel 控制台事实：沿用上次 `2026-09-21` 只读记录，执行前必须重新查询；未实时查询的 deployment、项目绑定、Cron、角色、ledger、备份和环境变量值均不得视为当前事实。

## 6. 费用与品牌决策

暂不购买。后续集中决策：Vercel Pro（Cron/商业用途时）、Supabase Pro（备份/PITR/持续运行时）、canonical 域名、Auth 邮件发件域/SMTP。它们不属于本轮本地配置候选。
