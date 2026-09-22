# Tokyo runtime 登录云端入口合同 r1

## 固定目标

- Supabase ref：`ilujuwuzaqwcbpnqixen`
- host：`aws-0-ap-northeast-1.pooler.supabase.com`
- port：`5432`（Session pooler）
- database：`postgres`
- TLS：`verify-full`、`rejectUnauthorized=true`、SNI 等于 pooler host、CA SHA-256=`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`
- 代码版本：`f5a3210aa1c5025c4ad9b593274fb66dca09abf8`
- 逻辑角色白名单：`brokerdesk_runtime`、`brokerdesk_admin`

## 角色名与路由用户名

两者必须分开处理：

| 用途 | runtime | admin |
|---|---|---|
| PostgreSQL SQL 目标 | `brokerdesk_runtime` | `brokerdesk_admin` |
| Session pooler 登录用户名 | `brokerdesk_runtime.ilujuwuzaqwcbpnqixen` | `brokerdesk_admin.ilujuwuzaqwcbpnqixen` |
| 登录后身份断言 | `current_user/session_user = brokerdesk_runtime` | `current_user/session_user = brokerdesk_admin` |

管理连接使用 `postgres.ilujuwuzaqwcbpnqixen`。`ALTER ROLE`、身份断言和 SQL 权限检查使用裸逻辑角色名；连接配置绝不把裸角色名当作 pooler 用户名。

## 输入与执行边界

[runtime-access-cloud-entry.mjs](./runtime-access-cloud-entry.mjs) 默认只运行 `--self-test`，并要求从仓库根目录启动。真实入口必须显式使用 `--execute-cloud`，并从 stdin 接收一个长度前缀 JSON 帧。帧包含管理连接配置、两份完整角色路由配置、CA 路径及管理密码；密码不接受 argv、环境变量或文件输入，脚本不把帧内容写入日志或证据。两份测试密码由 `node:crypto.randomBytes` 在进程内存生成，再通过 helper 的匿名 stdin 帧设置。

连接配置必须同时通过以下检查后，才允许任何 `PQchangePassword` 或 `ALTER ROLE ... LOGIN`：

1. ref、host、port、database 精确匹配固定目标。
2. 管理用户为 `postgres.ilujuwuzaqwcbpnqixen`。
3. 两个登录用户分别为 `<role>.ilujuwuzaqwcbpnqixen`。
4. TLS 为 `verify-full`，启用证书校验，SNI 匹配 host，CA 文件 SHA-256 匹配固定值。
5. 逻辑角色必须属于白名单，且路由配置不得携带密码字段。

## 写入前无网络检查

```sh
node docs/operations/tokyo-pg17-recovery-permission-validation-20260922/runtime-access-cloud-entry.mjs --self-test
```

该检查不打开 socket。它逐一证明裸角色名、错误 project ref、未授权角色、错误 host/port/database、关闭 TLS 校验和错误 CA hash 均在写入门禁前拒绝；输出 `writesBeforeGate=0`。本地证据见 [runtime-access-cloud-entry-self-test-20260922.json](./runtime-access-cloud-entry-self-test-20260922.json)。

## 云端执行顺序

1. 校验两份完整连接配置并读取 CA，失败即停止。
2. 以 `postgres.<project-ref>` 建立管理连接；只读确认身份、`password_encryption=scram-sha-256`、marker=`complete`、ledger=44、全部 checksum、角色基线及会话为空。
3. 通过 `runtime-password-helper.c` 为两个裸 SQL 角色设置临时密码；helper 只接受白名单角色，conninfo 与密码通过匿名 stdin 帧传递。
4. 执行 `ALTER ROLE brokerdesk_runtime LOGIN`、`ALTER ROLE brokerdesk_admin LOGIN`。
5. 分别用带 project ref 的 pooler 用户名登录，并断言 `current_user`、`session_user`、database 与裸角色一致。
6. 成功或异常均进入统一收尾：关闭本轮连接 → 两角色 `NOLOGIN` → 用仍在内存的临时密码验证新连接被拒 → 查询本轮会话为零 → 两角色 `PASSWORD NULL` → 只读核对角色、密码状态和会话 → 释放内存凭据 → 记录最终 `finishedAtUtc`。
7. 管理连接失效或收尾失败时只记录最后确认状态及可能残留，不宣称清理完成，不自动重试。

## 证据边界

- `runtime-access-cloud-entry-self-test-20260922.json` 是本轮入口收口的唯一新验证证据，证明无网络配置拒绝门禁。
- `cloud-runtime-access-20260922.json` 是此前使用错误裸路由用户名的历史失败归档，不能标记为本轮成功，也不能证明修正后的云端登录。
- 本轮不执行 `--execute-cloud`，不写云端 LOGIN、密码、权限或业务对象。
