# TASK-027 Checkpoint A：`/clients` 真实登录只读审计报告

- 审计日期：2026-08-17
- 审计时间：2026-08-17 15:32:03 +09:00（本地时间记录）
- 审计状态：Blocked，环境阻塞；不代表 `/clients` 产品通过或失败
- 仓库：`/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev`
- 分支：`main`
- 审计时 HEAD：`29cf08e005c6eeacc0760b63f3581a88e90296dd`
- Agent：0

## 推荐结论

本次不能完成 Checkpoint A。当前本地服务可以启动，但正常访问 `/clients` 时应用将请求重定向到登录页，并明确显示登录服务未配置。没有合法登录会话，就不能把客户列表、筛选、排序、返回、权限或响应式表现写成运行事实。

恢复后的唯一推荐方向暂定为：继续以“查找客户并判断下一步跟进”为主任务的 List Report 作为参考方向，桌面端保留表格可能性；快速创建先作为次级能力验证，不能在没有真实使用证据时提升为主入口。该方向是基于代码结构的暂定建议，不是目标设计批准。

## 1. 已验证的运行事实

### 环境与登录阻塞

1. 审计前无服务监听 `localhost:3000`。
2. 使用仓库既有 `npm run dev` 启动开发服务成功：Next.js 16.3.0，加载 `.env.local`，服务监听 `http://localhost:3000`。
3. 直接访问 `http://localhost:3000/clients` 后，实际 URL 为：

   `http://localhost:3000/sign-in?reason=login_required`

4. 页面 DOM 明确显示：

   - `登录工作区`
   - `登录服务尚未配置`
   - `此环境未配置账号登录服务。为保护工作区数据，暂不能直接进入业务页面。`

5. 本次没有输入账号、密码、验证码或任何认证凭据，也没有关闭、绕过或修改认证、权限、租户隔离或限流。
6. 开发服务随后已停止；本次审计结束时不保留本地服务。

### 同日复核

在收到再次执行批准后，于同一日重新启动同一仓库 HEAD 的开发服务，并使用现有 Chrome 会话新开标签访问 `/clients`。结果仍为 `http://localhost:3000/sign-in?reason=login_required`，页面仍显示“登录服务尚未配置”。本次复核没有输入或提取任何认证信息，没有产生业务数据，也没有进入 `/clients`。

本次阻塞页测量为 `innerWidth=2560`、`innerHeight=1318`、`scrollWidth=2560`、`scrollHeight=1318`、`devicePixelRatio=1`。这些仍然不是 `/clients` 目标视口证据。复核结束时间记录为 2026-08-17 15:45:09 +09:00，开发服务已停止。

### 阻塞页测量

这不是 `/clients` 页面测量，只是阻塞登录页的运行记录：

```json
{
  "url": "http://localhost:3000/sign-in?reason=login_required",
  "innerWidth": 2560,
  "innerHeight": 1262,
  "scrollWidth": 2560,
  "scrollHeight": 1262,
  "devicePixelRatio": 1,
  "title": "Broker Desk"
}
```

截图证据位于本次 Codex 审计执行记录中“保存登录阻塞证据”和“记录本次登录阻塞复核”步骤的截图输出。截图只显示登录阻塞页，没有客户姓名、地址或其他客户资料；本轮没有把截图复制进 Git 仓库。

## 2. Checkpoint A 场景结果

| 场景 | 结论 | 原因 |
|---|---|---|
| `/clients` 初始状态 | UNVERIFIED | 未通过登录门禁 |
| 默认筛选、默认排序、首屏结构 | UNVERIFIED | 未进入页面 |
| 关键字有结果/无结果/清除 | UNVERIFIED | 未进入页面 |
| 阶段、用途、温度筛选 | UNVERIFIED | 未进入页面 |
| 跟进排序、组合筛选、刷新保留 URL | UNVERIFIED | 未进入页面 |
| 打开客户详情 | UNVERIFIED | 未进入页面 |
| 浏览器返回、查询、筛选、滚动、焦点恢复 | UNVERIFIED | 未进入页面；没有足够数据时也未制造数据 |
| 快速创建入口、打开和取消 | UNVERIFIED | 未进入页面；没有提交表单 |
| 空数据、加载、错误、权限状态 | UNVERIFIED | 未人为制造状态，且业务页不可达 |
| 1440×900、768×900、390×844 | UNVERIFIED | 未进入 `/clients`；阻塞页仅记录了 2560×1262 |
| Tab、原生链接、Enter | UNVERIFIED | 未进入业务页 |
| 窄屏表格可读性 | UNVERIFIED | 未进入业务页 |

因此本轮正式通过项为 `0`，不能把环境阻塞误记为页面失败，也不能记为页面通过。

## 3. 已核对的代码事实

以下内容来自当前 HEAD 的代码核对，不是浏览器运行证据：

- [src/app/clients/page.tsx](/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev/src/app/clients/page.tsx) 接收 `q`、`stage`、`purpose`、`temperature`、`sort` 查询参数；默认阶段、用途、温度为 `all`，默认排序为 `follow_up`。
- 页面要求 `requireTenantSession({ permission: "record.read" })`，并把当前用户和租户传给 `listClients`。
- 页面提供客户搜索、阶段/用途/温度筛选和排序选择；桌面结构是包含 12 个显示列的 HTML table，并带水平溢出容器。
- 页面存在 `/board` 和 `/clients/new` 入口；每行有客户详情、添加跟进和创建提案三个链接；页面下方还有一个直接绑定 `createClient` 的快速录入表单。
- 当前客户名称单元格不是链接，主要进入动作位于行末操作列的“详情”链接；是否足够可发现必须由真实键盘和视觉审计验证。
- `src/lib/data.memory.ts` 和 `src/lib/data.postgres.ts` 的 `listClients` 都按用户和租户范围读取，并按客户自身的 `stage`、`purpose`、`temperature` 过滤；没有在该列表函数中用字段存在性推导案件式“资料不足”或“已整理”状态。
- 代码定义的客户温度值为 `high`、`medium`、`low`；“温度感/温度”是否是业务人员稳定理解的语言，代码本身不能证明。
- `follow_up` 按 `nextFollowUpAt` 升序排列，空值排在后面；另有 `recent_contact` 和 `recent_created` 两种排序。该规则能证明系统意图，不等于已经证明它符合真实跟进任务。
- 当前 `ClientsPageProps` 没有 `page` 参数，也没有看到该页面自己的分页实现；分页、长列表滚动、返回后分页恢复因此不能从代码宣称完成。

## 4. 产品推断

这些是基于代码结构的推断，必须在真实登录后复核：

- `/clients` 的主任务意图确实是客户查找与跟进，而不是案件整理或主体台账；这一点由客户专属的阶段、用途、温度、最近联系和下次跟进字段支持。
- 阶段、用途、温度在数据模型中是三个独立字段，但是否给用户提供三个独立且不重复的决策维度，尚无运行和用户证据。
- 默认使用 `follow_up` 排序与“下一步跟进谁”的任务相符，但还不能证明空跟进日期、已结束阶段和高温客户之间的排序符合业务优先级。
- 页面顶部创建入口、`/board` 入口、表格行内三个动作和底部快速录入同时存在，可能分散“先找到目标客户”的注意力；这是需要真实页面观察的风险，不是已证实缺陷。
- 桌面表格保留了较多区分客户的信息，可能有助于同名客户识别；手机端是否仍能理解，当前完全没有证据。

## 5. 建议保留与建议降级

### 建议保留

- 客户与主体分离的业务对象边界。
- 客户自己的阶段、用途、温度和跟进排序语义，不能套用 W1 的案件/主体/物件状态语言。
- 用户和租户范围的数据读取约束。
- 搜索字段覆盖姓名、电话、区域和备注的能力，待真实使用验证其价值。
- 桌面端以表格作为候选结构，不预先改成卡片。

### 建议降级或暂不扩大

- 不在没有运行证据时扩大“快速创建”在首屏的视觉优先级。
- 不把 `follow_up` 排序直接宣称为正确的业务优先级。
- 不把“温度”直接宣称为日本房地产从业者自然理解的正式术语。
- 不把列表行内的详情、跟进、提案三个入口直接视为必须公共化的通用结果行。

## 6. 尚未验证与恢复条件

恢复 Checkpoint A 至少需要一个合法、非生产的 Clerk 开发登录会话，并从正常入口进入当前租户的 `/clients`。恢复后只补做本报告第 2 节的业务场景和目标视口，不创建或修改客户数据；没有分页或长列表时继续标记为 `UNVERIFIED`。

本轮没有验证：客户真实数据边界、任何列表内容、默认筛选/排序体验、筛选 URL、浏览器返回、焦点、快速创建取消、空/加载/错误/权限状态、1440/768/390 业务页面表现、窄屏可读性、客户与主体入口混淆程度。

## 7. 明确非目标

- 不制作目标图或视觉方案。
- 不修改 `src/`、数据模型、API、数据库、认证、权限、租户隔离或限流。
- 不创建、修改、归档或删除客户数据。
- 不审计或迁移 `/properties`。
- 不触碰 TASK-020、输出中心、申请书预览/下载、报价打印、首页或其他页面。
- 不启动实现 Agent 或独立审查 Agent。

## 8. Git、服务与 Agent 收口

- 审计基线：`main` / `29cf08e005c6eeacc0760b63f3581a88e90296dd`。
- 本轮仅新增/更新任务治理文档和本审计报告；无 `src/` 变化。
- 开发服务已停止；本地 3000 端口不作为后续页面证据。
- TASK-027 更新为 `Blocked（Checkpoint A 环境阻塞）`，不标记 Done。
- TASK-020 保持 `Blocked`。
- 当前活跃 Agent：0。

本报告完成后停止，等待合法非生产登录环境恢复；不进入 Checkpoint B、目标结构、实现或其他页面迁移。

## 9. 非敏感登录阻塞说明

### 直接触发条件

当前实现的认证决策链如下：

1. [src/lib/auth-mode.ts](/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev/src/lib/auth-mode.ts) 只有在 `BROKER_DESK_AUTH_MODE` 明确为 `demo`、`trusted_header`、`clerk` 或 `disabled` 时才直接采用该模式。
2. 如果没有明确模式，只有同时存在非空的 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 和 `CLERK_SECRET_KEY`，系统才自动选择 `clerk`；否则回退为 `disabled`。
3. [src/proxy.ts](/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev/src/proxy.ts) 在业务路由上发现认证模式不是 Clerk 且不是开发用 demo 时，重定向到 `/sign-in?reason=login_required`。
4. [src/app/sign-in/[[...sign-in]]/page.tsx](/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev/src/app/sign-in/[[...sign-in]]/page.tsx) 在 `isClerkAuthEnabled()` 为假时显示“登录服务尚未配置”。

因此本次实际观察到的不是“Clerk 身份登录失败”，而是 Clerk 登录路径没有被配置为可用。若显式设置了 Clerk 模式但两个必要密钥缺失，代理会走另一条 503 分支；本次没有观察到该分支。

### 环境变量状态

以下状态只来自名称和是否为空的检查，不记录任何值：

| 环境变量 | `.env.local` 状态 | 作用 |
|---|---|---|
| `BROKER_DESK_AUTH_MODE` | `MISSING` | 显式选择认证模式 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `MISSING` | Clerk 前端公钥；参与自动启用 Clerk 的判断 |
| `CLERK_SECRET_KEY` | `MISSING` | Clerk 服务端密钥；参与自动启用 Clerk 的判断 |
| `CLERK_JWT_KEY` | `MISSING` | 可选的 Clerk JWT 校验密钥；不是本次认证模式选择的直接条件 |
| `BROKER_DESK_CLERK_INVITATION_REDIRECT_URL` | `PRESENT` | 邀请回跳配置；单独存在不能启用登录 |

状态枚举含义：`PRESENT` 表示存在非空配置，`EMPTY` 表示变量存在但为空，`MISSING` 表示没有该变量，`NOT_LOADED` 表示无法证明当前进程加载了该变量。

### 文件与加载路径

- 正式仓库 `.env.local`：`PRESENT`。
- 正式仓库 `.env`：`MISSING`。
- 之前两次使用仓库既有 `npm run dev` 启动时，Next.js 启动输出明确列出 `Environments: .env.local`；因此可以确认那两个开发进程读取了 `.env.local` 文件。
- 当前没有运行中的开发进程，因此“当前进程读取情况”是 `NOT_LOADED`；本轮没有重新启动服务来重复验证。

### 缺口归因

已验证缺失的是 **Clerk 开发配置**，不是配置加载路径。合法登录身份是否存在无法进入验证，因为认证服务尚未启用；不能据此判定账号无效，也不能把账号本身写成失败原因。

只读检查未发现已批准、可直接恢复的其他本地配置来源。当前唯一确认存在的是仓库本地 `.env.local`，归属为本机开发环境配置，但其中缺少上述 Clerk 启用所需变量。本轮没有查看、输出或复制任何密钥，也没有检查外部密钥管理系统。
