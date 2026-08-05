# P0 生产准入与恢复运行手册

更新日期：2026-07-29  
适用范围：Broker Desk 从本地开发/朋友体验，迁移到 Staging 或 Production 前的基础设施与安全验收。

## 1. 使用原则

本手册不是上线批准，也不能由代码检查替代。只有每一项均有负责人、证据和复核记录后，才可进入受控真实试点。

当前状态：**禁止生产发布**。

已在开发分支实施的代码门禁，会在 Production 下阻止以下不完整状态运行：

- 内存数据驱动或未提供数据库连接；
- 未明确批准的生产数据运行时；
- 非 Clerk 的生产认证配置；
- 本地附件存储或缺少私有对象存储签名下载能力；
- 本机 Swift 文档读取，或缺少远程资料读取服务；
- 缺失基线迁移或租户 RLS 迁移；
- 缺少租户范围的资料访问。

这些门禁只防止“误启动”，不代表下列外部条件已经完成。

## 2. 发布前状态表

| 项目 | 当前状态 | 发布所需证据 | 负责人 |
| --- | --- | --- | --- |
| 可审查 Git 提交与远端备份 | 未完成 | 干净或已解释的工作区、审核提交、远端提交哈希 | 发布负责人 |
| 仓库私有化、分支保护、密钥扫描 | 未完成 | GitHub 设置截图/审计记录 | 仓库管理员 |
| 独立 Staging 与 Production 资源 | 未完成 | 各环境独立项目、数据库、存储桶、身份密钥清单 | 基础设施负责人 |
| PostgreSQL 基线迁移 | 待真实环境执行 | 迁移账本和迁移日志 | 数据库负责人 |
| RLS 跨租户负向验证 | 未完成 | 双租户 SQL/API 测试记录 | 数据库 + 应用负责人 |
| 私有对象存储与签名下载 | 未完成 | 上传、下载、越权、过期链接测试记录 | 应用负责人 |
| 云端异步资料读取 | 未完成 | 队列、重试、失败和 Linux 运行验证 | 应用负责人 |
| 备份、恢复、回滚 | 未完成 | 恢复演练记录与时间结果 | 数据库负责人 |
| 日志、告警与安全事件响应 | 未完成 | 错误追踪、告警测试、响应联系人 | 运维负责人 |

## 3. 环境隔离

必须同时具备三个彼此隔离的环境：

| 环境 | 数据 | 认证 | 文件 | 用途 |
| --- | --- | --- | --- | --- |
| Development | 模拟或脱敏数据 | 开发身份提供方 | 本地私有目录 | 研发与界面验证 |
| Staging | 专用测试数据，不使用真实客户证件 | Staging Clerk 实例 | Staging 私有存储桶 | 发布候选与安全验证 |
| Production | 真实租户数据 | Production Clerk 实例 | Production 私有存储桶 | 受控真实试点 |

不得复用数据库 URL、Clerk 密钥、对象存储桶、ngrok 链接或浏览器调试身份。朋友体验只允许在明确标记的 Development/Staging 环境中进行，并使用模拟或已获授权的资料。

## 4. 生产配置准入

Production 中必须设置以下配置。值只能写入云端密钥管理，不得提交到仓库、终端历史、截图或聊天记录。**注意：当前仓库尚未实现私有对象存储适配器；即使下列对象存储配置齐全，Production 仍会拒绝附件上传和下载。不得仅靠配置开关解除该限制。**

```text
NODE_ENV=production
DATA_DRIVER=postgres
DATABASE_URL=...
BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED=true

BROKER_DESK_AUTH_MODE=clerk
CLERK_SECRET_KEY=...

ATTACHMENT_STORAGE_MODE=object_private
BROKER_DESK_ATTACHMENT_SIGNED_URL_ENDPOINT=...

DOCUMENT_READING_PROVIDER=remote
DOCUMENT_READING_ENDPOINT=...
DOCUMENT_READING_API_TOKEN=...
```

还必须声明运行时数据库角色不可拥有表、不可具有 `BYPASSRLS`，并与迁移角色分离。迁移角色不能作为 Web 服务的 `DATABASE_URL` 使用。

## 5. 数据库迁移

### 5.1 前置检查

1. 在 Staging 做数据库快照。
2. 确认应用服务已停留在可回滚版本，且无长事务。
3. 使用仅用于迁移的数据库角色，确认其不是应用运行时角色。
4. 审阅本次迁移文件、校验和和回滚策略。

### 5.2 执行

迁移仅由发布负责人在目标环境执行：

```bash
NODE_ENV=production \
BROKER_DESK_RUN_MIGRATIONS=true \
DATABASE_URL='目标环境迁移连接串' \
npm run db:migrate
```

脚本会获取 PostgreSQL advisory lock，并写入 `broker_desk_schema_migrations`。已应用迁移的文件不得原地修改；需要变更时必须新增迁移。

### 5.3 验证

执行后确认：

```sql
SELECT name, checksum, applied_at
FROM broker_desk_schema_migrations
ORDER BY applied_at;
```

必须包含：

- `20260727_000_baseline_schema.sql`
- `20260727_001_tenant_rls.sql`
- `20260729_002_force_tenant_rls.sql`

然后检查所有含 `tenant_id` 的业务表和 `case_workbench_field_rules` 已启用并强制执行 RLS，且运行时数据库角色不拥有这些表。

## 6. 租户隔离与 RLS 验收

当前 RLS 策略通过身份主体解析内部用户，再依据活跃租户成员关系授权。策略需要每个请求在数据库事务中携带身份主体：

```sql
SELECT set_config('app.external_auth_subject', '<当前 Clerk subject>', true);
```

该设置必须与同一数据库事务中的业务查询绑定，绝不能写入共享连接的持久会话。当前开发分支尚未完成这条运行时事务上下文接入，因此此项为**阻塞生产发布的未完成项**。

迁移基线会对含 `tenant_id` 的业务表执行 `FORCE ROW LEVEL SECURITY`。`users`、`tenants` 和 `tenant_memberships` 保持 RLS 启用但不强制，因为授权策略需通过 `SECURITY DEFINER` 辅助函数读取这些表，强制执行会导致递归策略校验。这并不降低生产角色要求：Web 应用的数据库角色必须与迁移角色分离、不是表所有者，且 `rolbypassrls = false`。强制 RLS 也不能覆盖 superuser 或带 `BYPASSRLS` 属性的角色。未来实现请求级绑定时，必须同时为读取和写入路径设计、验证明确的 RLS policy，不能仅验证查询成功。

完成接入后，在真实 Staging 至少执行下列负向测试并保存结果：

先用 Web 应用的运行时数据库角色执行只读基线脚本（不能使用迁移角色、表所有者、superuser 或 `BYPASSRLS` 角色）：

```bash
psql "$STAGING_RUNTIME_DATABASE_URL" \
  -v subject_a='租户 A 的 Clerk subject' \
  -v tenant_a='tenant_A' \
  -v tenant_b='tenant_B' \
  -v case_a='tenant_A 的案件' \
  -v case_b='tenant_B 的案件' \
  -v attachment_b='tenant_B 的附件' \
  -f docs/engineering/postgres_rls_staging_verification.sql
```

脚本位于 [postgres_rls_staging_verification.sql](../engineering/postgres_rls_staging_verification.sql)，只读验证事务身份绑定、运行时角色属性、RLS 强制状态和 A 对 B 的读隔离。它不替代以下 API 层写入、下载和并发测试。

1. 创建租户 A、租户 B，各自创建一名 Clerk 用户和一条案件/主体/物件/附件记录。
2. 以 A 的身份查询、修改、下载 B 的所有对象，必须返回空、403 或 404，且不得泄露对象名称、尺寸或下载地址。
3. 以已移除成员、暂停成员、无选定租户成员的身份重复测试，必须拒绝。
4. 以平台管理员角色测试，必须仅可进入显式的后台治理路径，不能绕开普通租户策略。
5. 在连接池并发下交叉执行 A/B 请求，确认数据库会话身份不会串租户。

验收报告必须记录测试时间、环境、身份、目标租户、请求路径、预期结果、实际结果和复核人。

## 7. 私有附件与资料读取

生产资料不得落在应用容器本地目录，也不得以公开 HTTP URL 作为敏感资料的保存方式。

上线前必须完成：

1. 接入私有对象存储桶，按租户前缀存储并使用服务端授权下载。
2. 下载链接短时有效、仅在租户和权限验证后签发，并响应 `Cache-Control: private, no-store`。
3. 上传前校验文件大小、扩展名、MIME 和文件签名；接入恶意文件扫描。
4. 原始文件、处理副本、预览副本和删除任务均记录审计事件。
5. 异步资料读取服务运行在 Linux 可用环境，具备请求 ID、超时、重试、幂等键、失败队列和人工重试入口。
6. OCR/模型输入遵循最小化原则，模型输出只能形成候选值，不得直接覆盖已确认事实。

当前本地私有附件目录只用于 Development。当前代码会拒绝在 Production 中继续使用本地存储、公开外部 URL 或本机 Swift 读取。私有对象存储目前只有配置门禁，尚未具备上传、签名下载和删除适配器；在这三项作为同一受审计实现交付前，附件生产链路必须保持拒绝状态。

## 8. 备份、恢复与回滚

上线前必须先确定云数据库提供方的备份能力、保留天数和恢复窗口，并以实际服务能力填写 RPO/RTO。未完成恢复演练前不得对外承诺任何恢复指标。

最低演练：

1. 从指定时间点恢复 Staging 副本。
2. 校验用户、租户、案件、附件元数据、输出记录和迁移账本。
3. 验证恢复副本的 RLS 与下载权限。
4. 演练将应用版本回退到上一个已验证发布标签。
5. 记录耗时、丢失范围、异常和负责人签字。

发生异常发布时，优先停止写入、保留日志和证据，再按已验证发布标签回滚应用；数据库迁移不允许凭猜测手工回退，必须按对应迁移的回滚方案操作。

## 9. 可观测性和事故响应

进入真实试点前必须接入：

- 结构化日志和请求 ID；
- 服务异常、后台任务失败、下载拒绝、跨租户拒绝和迁移失败告警；
- 错误追踪服务，日志中默认脱敏姓名、地址、证件号、合同内容和文件 URL；
- 可查询的审计事件：谁在何时读取、修改、确认、导出或删除了哪个租户对象；
- 安全事件联系人、响应时限和客户通知流程。

## 10. 发布批准清单

只有以下项目全部勾选，发布负责人才能批准 Production：

- [ ] GitHub 仓库、分支保护、密钥扫描和发布标签已完成。
- [ ] Staging 与 Production 完全隔离。
- [ ] 数据库迁移账本、RLS 负向测试和并发连接池测试通过。
- [ ] 运行时角色非表所有者且无 `BYPASSRLS`。
- [ ] 私有对象存储、上传扫描、签名下载和越权测试通过。
- [ ] 异步资料读取在 Linux 环境通过超时、重试、幂等和失败恢复测试。
- [ ] 备份恢复与应用回滚演练通过。
- [ ] 监控、告警、审计查询和安全响应流程已演练。
- [ ] 固定样本的浏览器纵向流程与保证公司 PDF 视觉回归通过。
- [ ] 发布负责人和复核人已在变更记录中签字。

未满足任一项时，版本只能作为 Development 或 Staging 体验版本，不能存放真实客户资料，也不能宣称为正式 SaaS。
