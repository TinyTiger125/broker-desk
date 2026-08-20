# TASK-039 Slice 1：受控非生产运行验证记录（2026-08-19）

## 结论

本次没有形成产品运行验收证据。TASK-039 继续保持 `In Progress`；TASK-038 不恢复真实浏览器闭环。

数据库前置已经建立，但受控浏览器和真实身份路径仍未建立：

1. 本机隔离 PostgreSQL 已创建；完整现有 migration 链及 `20260819_002_tenant_capabilities_invitation_contract.sql` 已应用，受限 `brokerdesk_runtime`/`brokerdesk_admin` 角色检查通过。但尚未写入测试经营主体、邀请或成员记录。
2. 受控浏览器连接未建立：当前 in-app Browser 没有可用 tab，创建本地验证 tab 时在 webview attach 阶段超时；没有提交任何登录、邀请或业务操作。

这不是业务功能失败的证据，也不证明 Clerk、邀请或权限逻辑本身不可用。

## 环境与安全边界

- 仓库：`broker-desk-web-dev`。
- 未读取或输出 `.env.local` 中的密钥值；数据库运行凭据由脚本写入被忽略的 `.env.local`，未输出。
- 未连接生产数据库。非生产容器仅绑定本机 `127.0.0.1:55432`，可在后续验证结束后停止/销毁。
- `npm start -- --port 3002` 首次因沙箱 `listen EPERM` 失败；按授权对同一命令提升一次后，以 `BROKER_DESK_DEPLOYMENT_ENV=staging`、`DATA_DRIVER=postgres` 启动成功。加入仅本地进程的就绪标记后，`/workspace` 返回 Clerk `307` 登录跳转，而非服务配置 `503`。
- Next 开发服务曾自动向 `AGENTS.md` 写入规则区块；该运行时生成差异已移除。当前 `AGENTS.md` 无差异，未发现新增运行时生成文件。
- 没有使用伪造 Clerk 身份、客户端角色参数、硬编码 membership 或测试后门。

## 运行结果

| 产品结果 | 状态 | 证据边界 |
|---|---|---|
| 负责人创建公司并进入工作区 | `UNVERIFIED` | 非生产持久化环境已备妥，但无真实浏览器身份操作 |
| 发送、接受、邮箱匹配邀请 | `UNVERIFIED` | 未提交邀请流程 |
| 过期、撤销、错误 token 和旧重发邀请拒绝 | `UNVERIFIED` | 未提交邀请流程 |
| 重复接受不产生重复成员关系 | `UNVERIFIED` | memory/静态检查不替代持久化运行 |
| invited/removed 不能直接恢复，suspended 可恢复 | `UNVERIFIED` | 未运行成员管理页面 |
| “切换账号”退出当前 Clerk 身份 | `UNVERIFIED` | 未建立浏览器 tab |
| 普通成员不能进入成员管理和蒙板编辑 | `UNVERIFIED` | 仅有服务端代码门禁与专项测试 |
| 表格管理员可以管理公司表格 | `UNVERIFIED` | TASK-038 仍等待真实成员关系 |
| 跨经营主体隔离 | `UNVERIFIED` | migration/受限角色已验证，尚未运行两个经营主体的真实读取拒绝 |
| 待开通主体与非生产测试主体区分 | `UNVERIFIED` | 未创建或读取受控测试主体 |
| 重新登录后成员、邀请、capability 仍存在 | `UNVERIFIED` | 数据库已备妥，但没有写入并重新读取真实记录 |
| 用户端统一显示“权限”而非把能力称作“角色” | `UNVERIFIED` | 未取得真实页面运行证据；代码仍有 P2 旧文案审查记录 |

## 已完成的静态/代码层检查

- `npm run test:tenant-slice1-contract`：PASS。
- `npm run test:tenant-session`：PASS。
- `npm run test:guarantee-slice1-contract`：PASS（TASK-038 相关检查，不等于 TASK-039 运行闭环）。
- `npm run typecheck`：PASS。
- `npm run build`：PASS，Next 路由构建完成。
- `npm run test:workflow-rules`：PASS。
- `git diff --check`：PASS。
- `npm run lint`：FAIL，错误集中在既有 TASK-038 页面/客户端的 `try/catch` JSX 与 Hook 规则；本次未修改这些报错文件。另有两个未使用函数 warning。
- `npm run test:tenant-auth-lifecycle-state`：PASS，确认完整 migration 链、受限 runtime/admin 角色和邀请/生命周期列；当前记录为空，未构成业务闭环证据。
- `npm run test:tenant-data-access`：BLOCKED，既有 TASK-038 检查脚本仍读取不存在的 `src/lib/guarantee-slice1-policy.mjs.ts`。

专项检查与 memory 行为只能证明代码路径存在，不能替代真实 Clerk 双身份、持久化 PostgreSQL、邀请生命周期或跨经营主体运行结果。

## 后续恢复硬门

恢复时只需补本次授权的差额，不重跑既有静态证据：

1. 一个现有内部 Clerk 测试身份作为负责人/表格管理员；
2. 同一非生产经营主体内的第二个真实 Clerk 测试身份作为普通成员；
3. 一个可附着的受控浏览器 tab；当前 Staging 服务保持运行，等待浏览器连接恢复。

在这些条件满足前，不得把 TASK-039 标记 `Done`，不得恢复 TASK-038 浏览器闭环，不得部署或连接生产环境。
