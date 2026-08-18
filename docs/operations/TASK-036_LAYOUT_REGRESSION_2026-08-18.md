# TASK-036 全产品 Layout System 统一批次回归报告

状态：`Blocked`（开发服务可启动，但当前合法 Development 身份不属于请求租户，页面级运行证据无法完整取得）

## 基线与安全边界

- 仓库：`/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev`
- 分支：`main`
- 基线 HEAD：`f671cff6a50fb6e38f440c61c62f10b136cc69f8`
- 工作区基线：仅原有未跟踪 `src/app/clients/page 2.tsx`
- `.env.local`：由 `.gitignore` 忽略；本报告不读取、不记录密钥或身份详情
- 身份：仅允许合法 Clerk Development 身份和非生产数据
- 不创建第二租户，不触碰认证、权限、租户、数据库、限流、TASK-020、输出/报价/模板专题

## 环境启动记录

| 尝试 | 命令/方式 | 结果 | 处置 |
|---|---|---|---|
| 1 | 正常开发服务 | 待执行 | 仅允许一次 |
| 2 | 同一命令合法提升权限 | 仅在 1 因 `listen EPERM` 失败时执行 | 最多一次 |
| 3 | 现有正式构建本地启动 | 仅在 2 失败时执行 | 最多一次 |

仍失败时，所有运行项标记 `UNVERIFIED`，任务保持 `Blocked`，停止环境排查。

## 路由与代表页证据

> 以下表格保留为采集前的路由清单模板，不单独构成运行结论；最终结果以“本次运行证据”及其后的结论为准。

### 22 个已迁移路由冒烟

> 初始计划表保留作为验收模板；实际执行结果以文末“本次运行证据”中的逐路由汇总为准。

| 路由 | 1440×900 | 390×844 | 标题/任务 | 溢出 | 主要结果 | 证据 |
|---|---|---|---|---|---|---|
| `/` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/import-center` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/organize-center` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/cases/new` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/clients` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/clients/[id]` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/clients/[id]/edit` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/clients/new` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/parties` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/parties/[id]/edit` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/parties/new` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/properties` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/properties/[id]/edit` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/properties/new` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/contracts` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/service-requests` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/audit-log` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/settings/members` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/platform/accounts` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/settings/ai-experience` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/board` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |
| `/relationship-tree` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 | 待补 |

### Floorplan 代表页

| Floorplan | 代表页 | 1440×900 | 768×900 | 390×844 | 溢出 | 键盘/焦点 |
|---|---|---|---|---|---|---|
| Wizard | `/import-center` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| Object Page | `/clients/[id]` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| List Report | `/clients` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| Worklist | `/service-requests` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| Responsive Form | `/clients/[id]/edit` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| Work Board | `/board` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| Relationship Explorer | `/relationship-tree` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| Workspace Selector | `/workspace` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| Settings Form | `/settings/ai-experience` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| System State | `/parties/new` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |
| Product Entry Page | `/` | 待执行 | 待执行 | 待执行 | 待执行 | 待执行 |

## 键盘、IME 与业务闭环

> 以下表格保留为采集前模板；最终 PASS/UNVERIFIED 结果以“本次运行证据”中的逐项记录为准。

| 类别 | 场景 | 结果 | 证据 |
|---|---|---|---|
| 键盘 | Tab/Enter/Escape/错误摘要/保存取消/返回焦点 | 待执行 | 待补 |
| IME | macOS Kotoeri 组合态第一次 Enter 不提交 | 待执行 | 待补 |
| 业务 | 列表筛选、分页、返回、表单非法/合法、取消、真实状态、入口闭环 | 待执行 | 待补 |

## 缺陷记录

| 编号 | 严重级别 | 页面/场景 | 事实 | 处置 | 状态 |
|---|---|---|---|---|---|
| — | — | — | 尚未执行 | — | — |

## 证据边界与审查

截图/录屏仅归档脱敏副本；原始录屏应放仓库外私有目录并记录哈希。独立审查必须分别标记真实运行证据、静态守卫和 `UNVERIFIED` 项，不得把静态检查写成运行通过。

## 执行前模板结论（已被下方运行证据覆盖）

该段仅保留任务启动前的停止条件模板，不作为本次运行结论。

## 本次运行证据（2026-08-18，Asia/Tokyo）

### 环境链与身份

- 正常 `npm run dev` 在沙箱内因 `listen EPERM` 失败。
- 对同一命令进行一次合法提升后成功，服务监听 `http://localhost:3000`；未再执行备用构建启动。
- Chrome 使用既有 Clerk Development 会话；未切换账号、租户或伪造身份。
- 访问租户页面时返回 `TenantSessionError: User does not belong to the requested tenant`。未继续端口、Clerk、双账号或第二租户排查。

### 全路由冒烟

22 个已迁移路由均可导航并返回可见页面；1440×900 与 390×844 的 `scrollWidth` 均等于 `clientWidth`，无横向溢出、白屏或 Next Build Error。由于租户身份阻塞，除下列可用 System State/表单外，标题、主任务和真实数据结构均记为 `UNVERIFIED`：

| 路由 | 1440/390 结果 | 运行结论 |
|---|---|---|
| `/`、`/import-center`、`/organize-center`、`/cases/new`、`/clients`、`/clients/[id]`、`/clients/[id]/edit`、`/parties`、`/parties/[id]/edit`、`/parties/new`、`/properties`、`/properties/[id]/edit`、`/properties/new`、`/contracts`、`/service-requests`、`/audit-log`、`/settings/members`、`/settings/ai-experience`、`/board`、`/relationship-tree` | 诚实错误状态：无法打开、重试、返回工作台；无白屏/构建错误/横向溢出 | `UNVERIFIED`（租户环境） |
| `/clients/new` | 三档表单可见；1440/390 无横向溢出 | `PASS`（结构可见；保存闭环未验证） |
| `/platform/accounts` | 权限不足 System State；1440/390 无横向溢出 | `PASS`（拒绝状态；平台数据未验证） |

### Floorplan 代表页

768×900 已检查 `/import-center`、`/clients/[id]`、`/clients`、`/service-requests`、`/clients/[id]/edit`、`/board`、`/relationship-tree`、`/settings/ai-experience`、`/parties/new`、`/`；均无横向溢出，但租户页面结构为 `UNVERIFIED`。`/workspace` 在 1440/768/390 均显示“当前登录邮箱没有可访问的工作区” System State，三档无横向溢出。

### 键盘、焦点与 IME

- `/clients/new` 真实 Tab 顺序：`name → phone → lineId`，通过。
- 返回客户列表原生链接按 Enter 导航至 `/clients`，浏览器返回恢复 `/clients/new`，通过。
- Escape、错误摘要焦点、保存/取消焦点、列表筛选/分页/滚动/触发链接焦点：`UNVERIFIED`（租户或未触发安全失败场景）。
- macOS Kotoeri 组合输入：`UNVERIFIED`；未用伪键盘事件替代真实 IME。

### 截图证据

脱敏运行截图保存在仓库外私有目录：
`/private/tmp/task036-layout-evidence-20260818/`

包含 22 路由的 1440/390 截图、768 代表页截图和 Workspace 三档截图；文件名后缀为 `.png`，实际内容为 JPEG。每个文件的 SHA-256 聚合复核记录见 [`evidence/TASK-036/2026-08-18/README.md`](evidence/TASK-036/2026-08-18/README.md)。原始证据未复制进仓库。

### 静态验证

- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm run build`：PASS
- `npm run test:workflow-rules`：PASS
- `git diff --check`：PASS

### 缺陷与结论

- 未发现已迁移页面范围内可在本轮安全修复的 P0/P1。
- 当前阻塞是合法 Development 身份与请求租户不匹配，属于统一批次运行环境问题，不是页面结构缺陷证据。
- 本任务保持 `Blocked`；不得将静态检查、错误 System State 或 `/clients/new` 单页结构证据写成全产品运行通过。其余真实数据、响应式密度、完整键盘/IME、错误焦点、筛选/保存闭环和危险操作进入统一批次回归。

## 独立只读审查

- 结果：`PASS`，无 TASK-036 范围 P0/P1。
- 环境链符合规则：正常启动因 `listen EPERM` 失败后，仅对同一命令进行一次提升；未进入端口、Clerk、双账号或第二租户循环。
- `/clients/new` 仅为结构可见 PASS，`/platform/accounts` 仅为权限拒绝 System State PASS；未宣称业务闭环通过。
- 多数租户路由因身份与请求租户不匹配保持 `UNVERIFIED`，任务必须保持 `Blocked`。
- P2：成员停用按钮的既有前端确认缺口继续登记，不在本任务扩展。

## 产品复审后的恢复契约

- 57 张截图、22 路由冒烟、三档宽度测量和键盘返回证据永久有效，恢复后不全量重跑。
- 唯一合法恢复条件：一个现有 Clerk Development 身份对一个非生产工作区具有 `active membership`。
- 第二租户隔离、跨租户拒绝和邀请激活归平台级 QA，不作为本任务前提。
- 恢复后仅补一个 List Report、一个 Responsive Form、一次真实 Kotoeri、一个 Object Page、一个 Worklist、Board 的 `Client.stage`、Relationship Explorer 显式关系、首页真实入口和 Settings 保存。
- 不重复 22 路由全量截图；仅对补测发现的 P0/P1 页面重跑。
- 当前状态：结构迁移 `Done`；响应式路由冒烟 `Pass`；真实业务运行验收 `Blocked`；输出专题未开始。

## 恢复预检（2026-08-18，Asia/Tokyo）

- 当前恢复基线：`main` HEAD `08a4de5232f688af342c5a9343196b14c47510e7`。
- 预检时工作区仅保留原有未跟踪 `src/app/clients/page 2.tsx`；未修改、暂存或提交业务代码。
- `.env.local` 继续由 `.gitignore` 忽略；本次未读取、输出或记录任何密钥、Cookie、Token、Clerk ID 或个人敏感信息。
- 正常 `npm run dev -- --port 3000` 因沙箱 `listen EPERM` 失败；对同一命令进行一次合法提升后成功监听 `http://localhost:3000`。未执行备用构建启动、端口循环或其他环境排查。
- 通过既有 Chrome Development 会话访问 `/workspace`，页面显示“尚未开通工作区 / 当前登录邮箱还没有可访问的工作区”；当前身份没有可用 `active membership`，未选择或固定工作区。
- 当前浏览器会话只暴露该现有身份；未发现可安全只读核对的第二既有身份会话，因此没有提出账号切换请求，也未尝试切换、登出、登录或反复验证。
- 由于未确认一个合法 `active membership`，本次停止在环境预检；不执行任何差额回归，不重复 57 张截图或 22 路由冒烟。
- 预检结论：恢复条件未满足，TASK-036 继续 `Blocked`；Layout System 结构迁移仍为 `Done`，响应式路由冒烟仍为 `Pass`，真实业务运行验收仍为 `Blocked`。
