# TASK-034 / W11-CORE Checkpoint A 只读事实审计

日期：2026-08-18
范围：`/clients/[id]`、`/contracts`、`/service-requests`、`/audit-log`
结论：四页均可在不改 API、权限、租户、数据库和保存核心的前提下进行页面结构迁移；运行、窄屏和真实权限证据未取得，统一标记 `UNVERIFIED`。

## `/clients/[id]` Object Page

### 已验证事实

- 页面通过 `requireTenantSession({ permission: "record.read" })` 和 `getClientDetail(id, tenantId)` 读取当前租户客户、报价、跟进和任务；memory/PostgreSQL 读取均带租户范围。
- 阶段、用途、温度来自客户持久化字段并通过现有 options 显示；跟进历史来自 `followUps`，任务来自 `tasks`，报价来自 `quotations`。
- 编辑入口为现有 `/clients/[id]/edit`；跟进新增、任务状态、阶段更新继续调用现有 Server Action。

### 代码推断与非权威表达

- `getStageSuggestion` 根据最近跟进类型和报价数量推导阶段建议，不是持久化业务状态；应移出默认主内容。
- `buildClientWorkflowGuide` 是工作流辅助解释，可保留为安静的次级说明，但不得当作完成度、AI确认或输出资格；工作流路径徽章和多组快捷动作不保留。
- 客户基本信息、法定信息、跟进、报价、任务被大量 `SectionCard` 分散，存在第二套工作流控制面板和徽章竞争；无独立完成度 KPI，但 workflow path、stage suggestion 和任务徽章会产生类似状态堆叠。

### 必须保留/降级

- 保留真实客户信息、持久化阶段/用途/温度、跟进独立章节、可证明报价关系、编辑入口、现有跟进/任务/阶段动作。
- 删除默认阶段建议卡；工作流说明降级为简短次级信息；不新增关系、完成度或输出状态。

## `/contracts` Worklist

### 已验证事实

- `listHubContracts` 从 `listQuotations` 读取报价记录并映射为合同关联条目；当前 `status` 由客户 `stage` 映射，`contractValue` 来自报价 listing price，`signedAt` 使用报价创建时间，均不是独立合同事实。
- `batchUpdateContractStatusAction` 实际将所谓合同状态映射为客户阶段更新；该状态、批量更新和空选择导出均冻结，不在页面继续暴露。
- 当前行链接指向 `/quotes/{id}`；新建入口指向 `/quotes/new`，均属于冻结的输出/报价专题，不应作为本批主要动作。

### 代码推断与非权威表达

- 续约时间线、未来 90 天、风险金额、记录检查、静态 alert 文案和模板/财务/输出入口不是独立合同事实；即使部分数字由条目计算，也会被理解为 KPI 或审计结论。
- `updateClientStage` 被用于合同状态批量动作，属于既有兼容保存语义；本批不改 Action，页面不再将其称为合同操作。

### 必须保留/降级

- 保留可追溯的关联记录、稳定编号、物件/主体事实、记录日期、分页和次级审计入口。
- 删除时间线、伪 KPI、状态徽章、批量状态/导出、模板/财务/报价新建等越界入口；当前无独立合同维护入口，稳定编号只作只读标识，主体链接不冒充合同入口。

## `/service-requests` Worklist

### 已验证事实

- `listHubServiceRequests` 从租户范围客户的 `tasks` 映射服务请求；状态由任务状态映射，标题、关联客户、创建时间来自任务/客户事实。`relatedProperty` 实际取自客户 `preferredArea`，不是物件关系。
- 单行状态动作使用现有 `changeTaskStatusAction`，批量使用 `batchUpdateServiceRequestStatusAction`，均需要明确选择并保留撤销反馈。
- 快速创建调用现有 `createServiceRequestQuickAction`；这是页面当前主创建能力，保持不变。

### 代码推断与非权威表达

- 费用总额、72% 分配比例、完成率、相关先验资料卡、静态证据图、上传资料入口和模板入口不构成服务请求权威事实；Unsplash 图片为随机内容。
- `focus` 行高亮是第二套选中模型，不能作为 Worklist 状态；应忽略或不渲染。

### 必须保留/降级

- 保留标题/状态筛选、快速创建、请求行、权威状态、明确选择批量更新、单行状态动作、撤销和客户维护链接；不展示 `relatedProperty`。
- 删除预算/完成率/证据图库/模板与导入入口；普通状态安静显示，风险操作保持行尾次级位置。

## `/audit-log` 只读 List Report

### 已验证事实

- 通过 `requireTenantSession({ permission: "audit.view" })` 调用 `listAuditLogs`，记录字段时间、执行人、动作、对象、消息、context 均直接来自审计记录；查询支持预设、执行人、动作、对象、文本和日期范围。
- CSV 入口是现有 `/api/hub/export?scope=audit_logs`，本批不修改 API、权限或保留期限。

### 代码推断与非权威表达

- 日志数、操作种类和执行账号数量虽由当前结果集计算，但不属于用户绩效或风险 KPI；默认 List Report 不再突出三张统计卡。
- 当前 `min-w-[980px]` 桌面表格在窄屏硬压缩/横向滚动，需改为桌面表格、窄屏行式信息分组。

### 必须保留/降级

- 保留只读筛选、分页/结果列表、真实日志字段、导出入口和权限边界；移除合同页面返回捷径造成的错误上下文，改为稳定工作区返回。
- 不推导绩效、风险评分或审计合规结论。

## 未验证项与批次回归

- 统一服务探测、真实浏览器、1440/768/390、横向溢出、Tab/Enter/焦点、真实 PostgreSQL、权限/租户隔离、空态和下载审计均未在本次只读审计中验证，统一进入批次回归。
- 本批不修改 API、Server Action、数据库、权限、认证、租户或输出/模板/报价专题。

## 页面结论

| 页面 | Checkpoint A 结论 |
|---|---|
| `/clients/[id]` | 迁移：Object Page；移除推导阶段建议，跟进/报价/任务作为真实独立章节保留 |
| `/contracts` | 有限迁移：只读 Worklist；合同状态、金额、批量更新和导出因报价/客户阶段推导冻结 |
| `/service-requests` | 迁移：Worklist；保留任务状态和批量动作，移除费用比例、随机证据和模板入口 |
| `/audit-log` | 迁移：只读 List Report；保留日志筛选/导出，窄屏改行式结构，移除 KPI 卡 |
