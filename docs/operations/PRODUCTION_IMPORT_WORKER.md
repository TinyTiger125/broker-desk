# 正式资料读取后台任务

正式上传先进入私有队列。`.github/workflows/import-worker.yml` 在 GitHub Actions
默认分支每五分钟调用一次受 Bearer token 保护的
`POST /api/internal/import-jobs/drain`，每次最多认领五项；也可用
`workflow_dispatch` 执行一次受控检查。

部署前必须核对正式环境的 `DATABASE_ADMIN_URL`、
`BROKER_DESK_IMPORT_WORKER_TOKEN`、`BROKER_DESK_IMPORT_WORKER_ENABLED=true` 和
`BROKER_DESK_IMPORT_WORKER_SCHEDULE=github_actions_every_5_minutes`。
同一 token 仅保存在 Vercel Production Secret 与 GitHub Actions Repository Secret。
后台数据库连接仅使用受限 `brokerdesk_admin`，TLS 必须验证 Supabase 证书；
不得使用 `postgres` 或 service-role 数据库连接代替。

GitHub 的定时事件可能延迟或丢失，公开仓库连续 60 天无活动还会自动停用定时工作流。
发布后先手动触发一次，并检查 `ok=true`、失败数为零；随后核对定时运行记录与
队列中最老任务等待时间。若调度停止，暂停新的正式上传，恢复调度并处理积压后再开放。
五分钟调度适合初期试用，不能据此承诺实时识别或大客户吞吐量。
