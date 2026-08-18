# TASK-034 / W11-CORE：全产品 Layout System 核心对象与工作流结构收口

- 状态: Done
- 优先级: P0
- 负责人: 技术项目经理
- 当前阶段: 阶段 2 第一批行政收口完成
- 前置任务: TASK-024、TASK-025、TASK-027–TASK-033
- 目标页面: `/clients/[id]`、`/contracts`、`/service-requests`、`/audit-log`
- 排除页面: 输出/模板/报价专题、TASK-020 未完成部分、`src/app/clients/page 2.tsx`

## 任务名称

W11-CORE：核心对象与工作流页面批次 Layout System 结构收口

## 背景和用户结果

本任务不再为每个页面复制完整 A/B/C/D 流程，而是按同一批次核对 Floorplan、事实来源、状态语言、操作层级和响应式结构。业务逻辑、API、权限、租户、数据库和保存语义保持不变。

## 本次范围

- `/clients/[id]`：Object Page
- `/contracts`：Worklist
- `/service-requests`：Worklist
- `/audit-log`：只读 List Report
- 直接使用的页面组件、现有 Layout System/UI Foundation 组合和有限契约守卫
- 阶段 2 第一批治理文档、静态检查和一次独立只读审查

## 明确不做什么

- 不修改 API、数据库、migration、权限、认证、租户或保存核心
- 不修改 `/clients`、客户编辑页、报价、输出、模板、案件数据模型或 TASK-020
- 不把 KPI、完成度、时间线、关系、风险评分或状态徽章改造成新业务事实
- 合同状态、合同金额、合同批量更新和合同导出因当前报价/客户阶段推导及空选择语义不可靠而冻结；不在页面冒充合同事实
- 不创建第二套详情、编辑器、保存逻辑、状态算法或全局状态模型
- 不触碰 `src/app/clients/page 2.tsx`
- 不启动双账号、第二租户或认证排查循环

## 依赖关系

- Layout 唯一规范：`BROKER_DESK_LAYOUT_SYSTEM_V1.md`
- 页面归属：`UI_GOV_002B_LAYOUT_FLOORPLAN_MATRIX_V2_2026-08-16.md`
- 已完成参考：TASK-024/025/027–033
- 输出/模板/报价页面进入独立专题；TASK-020 继续 `Blocked`

## Checkpoint A 审计要求

在 60 分钟内只读核对四个页面的真实数据来源、权威状态、伪 KPI/推导、必须保留和可降级操作，以及不改 API/权限/数据库时能否完成结构迁移。状态来源不明的表达应删除或安静隐藏；只有整个页面无法诚实表达时才冻结页面。

## Checkpoint C 预期结构边界

- 客户详情使用 Object Page，保留持久化阶段/用途/温度、跟进章节和可证明关系；编辑进入现有客户编辑页。
- 合同与服务请求使用 Worklist，只认现有权威状态；批量动作必须基于明确选择；高风险操作降为次级；不使用伪 KPI。
- 审计记录使用只读 List Report；时间、执行人、对象、动作、结果只来自审计记录；窄屏使用行式分组，不硬压桌面表格。

## 允许修改文件

- 四个目标页面及其直接页面展示组件
- `/clients/[id]` 专属 Object Page 组合或样式
- 必要的有限契约测试/守卫
- 本任务治理文档、矩阵和当前上下文

默认禁止修改 actions、API、数据库、认证、权限、租户、共享数据适配、其他矩阵页面和 `src/app/clients/page 2.tsx`。如事实审计证明结构迁移必须越界，冻结该页面并报告。

## 验收标准

- 四个页面分别有迁移或局部冻结结论，且结论基于现有权威数据来源。
- 不新增 KPI、完成度、关系、状态算法、保存逻辑、API、权限、租户或数据库事实。
- 结构使用批准的 Object Page、Worklist 或 List Report；正常信息安静，异常和恢复动作有明确层级。
- 每个修改页面有契约守卫或已有相关测试；独立只读审查无 P0/P1。
- 完成后的提交不包含 `src/app/clients/page 2.tsx` 或其他矩阵页面。

## 预计涉及的模块

- `src/app/clients/[id]/page.tsx` 及其直接客户详情展示组件
- `src/app/contracts/page.tsx` 及其直接合同展示组件
- `src/app/service-requests/page.tsx` 及其直接服务请求展示组件
- `src/app/audit-log/page.tsx` 及其直接审计展示组件
- 必要的 `scripts/check-*` 契约守卫和本任务治理文档

不得默认修改 `src/app/actions.ts`、API、数据库、权限、认证、租户或共享数据适配；如无法在页面层诚实迁移，冻结该页面并报告。

## 风险和注意事项

- 合同和服务请求当前包含 KPI、卡片、时间线、批量表单和跨域入口，必须先区分真实状态与页面推导；服务请求不得将 `preferredArea` 展示为物件关系。
- 客户详情的跟进、报价、案件和关系来源必须分别核对，不得把客户字段填充比例当作完成度。
- 审计导出、权限、保留期限和窄屏行式结构只做页面边界核对，不改导出契约。
- 真实 PostgreSQL、权限、租户、响应式、键盘、焦点和完整业务闭环证据进入统一批次回归。

## 验证命令

- `npm run test:workflow-rules`
- `git diff --check`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- 本批页面专项契约脚本或已有相关测试

## 验证与停止条件

- 契约脚本/相关测试、typecheck、lint、build、workflow rules、`git diff --check`
- 一个实现 Agent 完成后退出，再启动一个独立只读审查 Agent；不创建下级 Agent
- 统一服务探测最多一次；`listen EPERM` 立即记为批次回归并停止环境排查
- 最终提交必须只包含本批获准页面、测试和治理文档；工作区只允许保留原有 `src/app/clients/page 2.tsx`
- 完成本批后停止，不自动进入第二批

## 当前状态

Checkpoint A 只读审计、一次有限实现和一次独立只读复审已完成，无 P0/P1。`/clients/[id]`、`/service-requests`、`/audit-log` 完成页面结构迁移；`/contracts` 完成只读 Worklist 迁移，合同状态、金额、批量更新和导出因报价/客户阶段推导及空选择语义冻结。统一服务探测因 `listen EPERM` 失败，真实浏览器、响应式、键盘、焦点、权限/租户和完整动作行为均为 `UNVERIFIED`，进入全产品批次回归。阶段 1 矩阵分类修正已同步写入 V2；旧 UI-GOV-001 建议已标记为历史并被后续任务替代。当前任务按“页面结构迁移完成/有限冻结已登记”口径标记 `Done`。
