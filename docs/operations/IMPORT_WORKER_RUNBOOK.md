# 异步导入 Worker 运行手册

## 目的与边界

身份证件、Excel/PDF 读取和字段候选生成属于长耗时、不可信输入处理。页面请求只负责校验、保存私有资料并创建 `import_jobs`；不会同步等待 OCR 或解析完成。

该设计防止刷新页面、网络中断或文件耗时读取阻塞用户操作。它不允许候选值直接成为已确认业务事实。

## 作业状态

| 状态 | 含义 | 用户可见动作 |
| --- | --- | --- |
| `queued` | 已保存，等待后台读取 | 等待或稍后返回 |
| `processing` | worker 已领取 | 等待，不重复提交 |
| `mapped` | 已生成候选，等待资料确认 | 打开确认页面 |
| `completed` | 候选处理已完成 | 查看确认记录 |
| `failed` | 读取或解析失败 | 点击重试或改为手动录入 |

同一租户的相同幂等键只能对应一个有效作业。worker 使用 `FOR UPDATE SKIP LOCKED` 领取任务，避免多实例重复读取。

## 生产所需配置

```bash
DOCUMENT_READING_PROVIDER=remote
DOCUMENT_READING_ENDPOINT=https://reader.example.com/extract
DOCUMENT_READING_API_TOKEN=...
DOCUMENT_READING_ALLOWED_HOSTS=reader.example.com
BROKER_DESK_IMPORT_WORKER_ENABLED=true
BROKER_DESK_IMPORT_WORKER_SCHEDULE="every 1 minute"
BROKER_DESK_IMPORT_WORKER_TOKEN=<至少32位随机值>
BROKER_DESK_APP_URL=https://app.example.com
```

`DOCUMENT_READING_ALLOWED_HOSTS` 必须仅列出已审查的读取服务域名。HTTPS、token、host allowlist、worker 开关、调度说明和足够长的 worker token 缺少任一项时，生产模式会拒绝读取。

## 调度方式

托管调度器每分钟执行一次：

```bash
npm run worker:import
```

脚本向 `POST /api/internal/import-jobs/drain` 发送 worker bearer token。该接口不接受浏览器会话替代 worker token，并以恒定时间比较 token。每次执行领取有限批次；失败记录标准错误码和摘要，而不是把堆栈或原始证件内容返回给用户。

## 运维检查

1. 确认 worker 最近一次运行时间和已领取/完成/失败数量。
2. 对持续 `processing` 的作业检查 `processing_started_at`；超过约定处理时限应由调度器或人工重试策略接管。
3. 对 `failed` 作业检查不含敏感内容的 `error_code`、`error_summary`；用户可在资料页重新入队，不能复制旧候选为已确认值。
4. 定期检查失败率、队列等待时间、重试次数和远程读取延迟。告警系统部署后，这四项必须接入告警。

## 发布前演练

- 同一文件连续提交两次，确认不产生重复候选或重复输出。
- 在读取中关闭页面并重新登录，确认作业仍可查询。
- 强制远程服务超时，确认作业进入 `failed` 且可重新入队。
- 并发运行两个 worker，确认一个作业只被一个 worker 领取。
- 以其他租户身份查询 job ID，确认不能读取状态、文件或候选。

上述演练必须在部署到托管环境后留存证据；本地代码门禁不等于运行证据。
