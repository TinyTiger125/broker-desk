# UI-GOV-002B Layout Floorplan 映射矩阵 V2

- 状态: **Approved baseline**
- 批准含义: 冻结页面归属、主任务和迁移边界；不等于全产品页面迁移完成
- 规范来源: [`BROKER_DESK_LAYOUT_SYSTEM_V1.md`](../product/BROKER_DESK_LAYOUT_SYSTEM_V1.md)
- 路由盘点来源: UI-GOV-001 只读盘点、当前 `src/app` 页面文件和导航/内部入口扫描
- 版本修正: 34 个业务/后台页面族、2 个 Auth Shell 页面族、1 个退役路由、4 个系统状态入口；两个申请书预览路径合并为一个页面族
- 范围边界: API/QA、历史入口、空目录和删除候选独立登记，不计入正式页面数量

## Floorplan 目录

| 代码 | 主 Floorplan | 适用任务 |
|---|---|---|
| WL | Worklist | 处理下一项任务、阻塞或待办 |
| LR | List Report | 查找、筛选、排序一批对象 |
| OP | Object Page | 通读一个复杂业务对象 |
| RF | Responsive Form | 创建/编辑一组资料 |
| SF | Settings Form | 管理已持久化的产品设置或后台候选 |
| WZ | Wizard | 有顺序的输入、识别和决策流程 |
| PC | Preview & Confirmation | 文书预览、确认和下载 |
| RE | Relationship Explorer | 阅读对象关系网络 |
| WS | Workspace Selector | 选择可访问工作区并确认当前工作区 |
| AS | Auth Shell | 登录/注册 |
| SS | System State | 加载、错误、Not Found 等支持状态 |
| PE | Product Entry Page | 从首页选择今天要开始的实际工作 |

## 业务/后台页面族（34）

| 页面族 | 用户主要任务 | 主 Floorplan | 局部结构 | 波次 | 不允许改变 |
|---|---|---|---|---:|---|
| `/` | 判断今天先处理什么 | Product Entry Page | 真实待处理摘要、任务入口 | W12 | 真实任务来源；不虚构 KPI |
| `/import-center` | 上传资料并完成识别、归属、新建/追加/合并 | WZ | 步骤、恢复、识别异常 | W2 | 资料处理、422人工恢复、归属语义 |
| `/organize-center` | 查找对象并进入后续处理 | LR | 局部异常 Worklist、筛选、结果行 | W1 | 案件、主体、物件权威不合并；不承担详情编辑 |
| `/cases/[id]` | 通读、编辑案件并进入输出 | OP | Dynamic Header、锚点、RF字段组 | 已有参考 | C+、案件字段、权限、输出门禁；TASK-020独立验收 |
| `/templates` | 搜索并安装租户可用模板 | LR | 过滤、结果、局部安装 | W3 | 租户可见性、安装持久化、非平台发布 |
| `/output-center` | 找到可输出或被阻塞的案件 | WL | 筛选、任务行、模板选择 | W4 | 输出产品专题决策依赖；受TASK-020输出门禁阻塞；案件/模板选择和失败恢复 |
| `/guarantee-applications/[templateId]/preview` + `/guarantee-applications/friends-guarantee/preview` | 预览申请书并完成下载前确认 | PC | 文书预览、阻塞、确认 | W5 | 输出产品专题决策依赖；一个页面族；模板数据、官方日文标题、下载语义 |
| `/cases/new` | 无资料直接创建案件 | RF | 创建表单、错误、返回 | W7 | 不与导入Wizard的新建/追加/合并混同 |
| `/clients` | 搜索和快速创建客户 | LR | Filter Bar、结果、快速创建 | W6 | 客户与主体业务边界 |
| `/clients/[id]` | 查看客户详情和关联事项 | OP | Header、Section、局部任务 | W8 | 客户领域和关联数据来源 |
| `/clients/[id]/edit` | 编辑客户资料 | RF | 字段组、保存/取消 | W7 | 保存、取消、返回和权限 |
| `/clients/new` | 创建客户 | RF | 字段组、错误、返回 | W7 | 创建语义和权限 |
| `/parties` | 搜索和维护主体 | LR | Filter Bar、结果、生命周期 | W6 | 主体角色、归档、租户边界 |
| `/parties/[id]/edit` | 编辑主体资料 | RF | 字段组、局部错误 | W7 | 主体字段和权限 |
| `/parties/new` | 表达独立主体创建当前不可用的系统状态 | SS | 数据模型边界说明、返回主体列表 | W7 | 不生成 Client；独立主体领域模型和多角色语义冻结 |
| `/properties` | 搜索和维护物件 | LR | Filter Bar、结果、行操作 | W6 | 物件与案件/主体关系 |
| `/properties/[id]/edit` | 编辑物件资料 | RF | 复杂字段组、保存/取消 | W7 | 物件数据和权限 |
| `/properties/new` | 创建物件 | RF | 字段组、错误、返回 | W7 | 创建语义；主流程不使用辅助填写或AI审核 |
| `/contracts` | 筛选、批量更新和处理合同 | WL | 结果区、批量动作、跨域入口 | W8 | 合同、报价、模板和审计边界 |
| `/service-requests` | 处理服务请求队列 | WL | 筛选、任务行、批量动作 | W8 | 服务请求状态和权限 |
| `/audit-log` | 检索并导出审计记录 | LR | Filter Bar、长表、导出 | W8 | 审计只读和导出权限 |
| `/settings/output-templates` | 设置输出说明和记录 | RF | 设置表单、历史折叠区 | W9 | 不引入TASK-005发布语义 |
| `/settings/case-workbench-fields` | 设置案件字段规则 | RF | 规则表单、保存反馈 | W9 | 不修改149项目录和适用性契约 |
| `/settings/members` | 管理租户成员和角色 | WL | 成员结果、局部编辑 | W9 | 权限、角色、租户隔离 |
| `/platform/templates` | 平台管理员查看官方模板 | LR | 过滤、结果、平台操作 | W10 | 普通租户不可见；不带入租户安装行为 |
| `/platform/templates/[templateId]` | 平台管理员查看/编辑模板 | OP | 详情、Authoring局部区 | W10 | 独立管理员工作台；TASK-005 draft/publish隔离 |
| `/platform/accounts` | 管理租户账号 | LR | 结果、创建表单、生命周期 | W10 | 平台权限和租户边界 |
| `/board` | 以看板查看任务阶段 | WL | Kanban结果区 | W8 | 状态权威和入口是否保留 |
| `/workspace` | 选择可访问工作区 | WS | 空态、工作区选择、错误恢复 | W10 | 不再归为普通Worklist；租户成员关系权威 |
| `/quotes` | 查看和筛选报价 | LR | Filter Bar、结果、创建入口 | W8 | 报价业务边界 |
| `/quotes/new` | 创建报价 | RF | 字段组、错误、取消 | W7 | 报价流程语义；统一纳入W7 |
| `/quotes/[id]` | 查看报价详情并复制 | OP | 详情章节、局部操作 | W8 | 报价数据和复制行为 |
| `/relationship-tree` | 阅读案件、主体、物件关系 | RE | 关系分组、节点、返回 | W8 | 不建立第二套对象详情权威 |
| `/settings/ai-experience` | 管理AI经验候选 | SF | 状态筛选、审核任务 | W9 | 不把后台AI概念带回主业务流程 |

## Auth Shell 页面族（2）

| 页面族 | 主任务 | 主 Floorplan | 不允许改变 |
|---|---|---|---|
| `/sign-in/[[...sign-in]]` | 登录 | AS | Clerk认证语义 |
| `/sign-up/[[...sign-up]]` | 注册 | AS | Clerk注册语义 |

## 退役路由（1）

| 路由 | 当前行为 | 处置 |
|---|---|---|
| `/quotes/[id]/print` | 直接 `notFound()` | 输出产品专题决策依赖；保持退役；不恢复、不静默重定向、不删除；输出中心的残留链接另行处理 |

## 系统状态入口（4）

| 文件 | 主任务 | 主 Floorplan |
|---|---|---|
| `src/app/loading.tsx` | 表达路由加载中 | SS |
| `src/app/error.tsx` | 表达可恢复路由错误 | SS |
| `src/app/global-error.tsx` | 表达全局错误 | SS |
| `src/app/not-found.tsx` | 表达资源不存在 | SS |

## 独立入口清单（不计入正式页面数量）

### API/QA入口

- `src/app/api/qa/extraction-review/accept/route.ts`
- `src/app/api/qa/friends-guarantee/complete/route.ts`
- `src/app/api/qa/reset-business-data/route.ts`
- `src/app/api/qa/seed-business-data/route.ts`
- `src/app/api/qa/zenhoren-auto-demo/route.ts`
- `src/app/api/internal/import-jobs/drain/route.ts`

当前QA API由非生产环境、回环地址或明确QA Token限制；它们不是页面Floorplan，不得混入正式页面数量。

### 历史/开发入口

- `/ui-foundation-preview`：当前无页面文件，历史文档仍有引用。
- `/ui-gov-003-checkpoint-a`：当前无页面文件，历史目标图入口。
- `src/components/ui-gov-003-preview/*`：当前无正式路由引用的孤立预览组件。

### 删除候选（本轮只登记，不删除）

- `src/app/templates/page 2.tsx`：非路由重复文件。
- `src/components/ui-gov-003-preview/*`：孤立旧预览组件。
- `/quotes/[id]/print`：已退役路由，但当前文件和残留调用仍需单独清理决策。

## Floorplan统计

| 主Floorplan | 页面族数量 |
|---|---:|
| Worklist | 5 |
| List Report | 9 |
| Object Page | 4 |
| Responsive Form | 10 |
| Settings Form | 1 |
| Wizard | 1 |
| Preview & Confirmation | 1 |
| Relationship Explorer | 1 |
| Workspace Selector | 1 |
| Product Entry Page | 1 |
| **合计** | **34** |

## 迁移波次与门禁

| 波次 | 范围 | 门禁 |
|---|---|---|
| W0 | 矩阵、Workspace Selector、退役入口和依赖边界 | 只读核对，不改页面 |
| W1 | `/organize-center` List Report参考实现 | 先完成真实流程审计，再制作目标图 |
| W2 | `/import-center` Wizard | 保留识别、归属、新建/追加/合并和422恢复 |
| W3 | `/templates` List Report | 只处理租户模板检索和安装 |
| W4 | `/output-center` Worklist | 输出产品专题决策依赖；TASK-020解除相关输出门禁后才能实施 |
| W5 | Preview & Confirmation页面族 | 输出产品专题决策依赖；TASK-020解除最终确认、下载和数据变化失效门禁后才能实施 |
| W6 | `parties`、`properties`、`clients`列表 | 每个页面独立验收，不机械批量替换 |
| W7 | 各领域创建/编辑Responsive Form | `/quotes/new`统一纳入本波次 |
| W8 | contracts、service requests、audit、board、quotes、relationship | 按页面任务逐一迁移 |
| W9 | settings | 不改变149项字段、权限和发布语义 |
| W10 | platform/admin、Workspace Selector、Auth/System State | 平台Authoring保持独立管理员工作台 |
| W11 | 首页最终收口 | 只能汇总已验证的真实任务状态，不虚构KPI |

每个波次仍须逐页通过桌面、平板、手机、中日韩长文本、键盘、空态、错误态、加载态、权限、租户和业务回归验收。Approved baseline 不代表任何页面已经完成迁移。

## 输出产品专题延期

输出中心、申请书预览与下载、报价单打印、模板版权/授权/售卖形式、文件版本、案件确认、下载权限和审计规则统一延期到独立输出产品专题。TASK-020 继续 `Blocked`，W4/W5 不进入本轮实施；`/quotes/[id]/print` 保持退役，不恢复、不重定向、不删除。该专题不阻塞 TASK-025。

## 最终状态对账（2026-08-18）

本节是矩阵 V2 的唯一最终状态，不再保留“待决定”页面族。状态只描述页面结构迁移，不代表真实运行、权限、租户或业务闭环已经验证。

### 已迁移（22）

`/`、`/import-center`、`/organize-center`、`/cases/new`、`/clients`、`/clients/[id]`、`/clients/[id]/edit`、`/clients/new`、`/parties`、`/parties/[id]/edit`、`/parties/new`、`/properties`、`/properties/[id]/edit`、`/properties/new`、`/contracts`、`/service-requests`、`/audit-log`、`/settings/members`、`/platform/accounts`、`/board`、`/relationship-tree`、`/settings/ai-experience`。

### 已符合，无需修改（1）

`/workspace`：继续作为唯一 Workspace Selector/System State，本轮未修改选择、权限或租户逻辑。

### 真实冻结（2）

`/cases/[id]`：TASK-020 独立门禁仍未解除；`/settings/case-workbench-fields`：149 项字段契约未纳入本轮。

页面内部能力冻结但不冻结整页：`/contracts` 的合同状态/金额/批量更新/导出仍因报价、客户阶段推导和空选择语义冻结。

### 独立输出专题排除（9）

`/templates`、`/output-center`、两个正式申请书预览路由、`/settings/output-templates`、`/platform/templates`、`/platform/templates/[templateId]`、`/quotes`、`/quotes/new`、`/quotes/[id]`。

### 认证、系统状态与退役入口

- Auth Shell `/sign-in/[[...]]`、`/sign-up/[[...]]`：已符合，无需修改；Clerk 运行证据进入批次回归。
- 系统状态 `loading`、`error`、`global-error`、`not-found`：已符合，无需修改。
- `/quotes/[id]/print`：退役，保持 `notFound()`，不恢复、不重定向、不删除。

### 统一批次回归

所有 `UNVERIFIED` 项汇总于 [`UNIFIED_LAYOUT_BATCH_REGRESSION_CHECKLIST_2026-08-18.md`](UNIFIED_LAYOUT_BATCH_REGRESSION_CHECKLIST_2026-08-18.md)。
