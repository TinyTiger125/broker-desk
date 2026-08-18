# TASK-035 / W12：管理页面与首页 Layout System 最终收口

- 状态: Done
- 优先级: P0
- 负责人: 技术项目经理
- 当前阶段: 有限实现、独立只读审查与行政收口完成
- 前置任务: TASK-024、TASK-025、TASK-027–TASK-034
- 范围: `/settings/members`、`/platform/accounts`、`/settings/ai-experience`、`/`
- 排除: 输出/报价/模板专题、`/settings/output-templates`、`/settings/case-workbench-fields`、`/platform/templates*`、TASK-020、认证/权限/租户/数据库重构、已完成页面返工、`src/app/clients/page 2.tsx`

## 任务名称

W12：管理页面与首页 Layout System 最终收口

## 背景和用户结果

这是矩阵 V2 最后一批管理页面与首页结构迁移。用户应能在管理页完成现有成员、平台账户和 AI 候选任务，在首页明确从资料录入、信息整理或真实待处理项目开始工作；页面不制造 KPI、完成度、输出资格或入口重复。

## 本次范围

- `/settings/members`：Member Management / Settings Worklist
- `/platform/accounts`：Platform Administration List Report
- `/settings/ai-experience`：Settings Form / Review Queue
- `/`：Product Entry Page
- 矩阵 V2 最终状态对账与统一批次回归清单

## 明确不做什么

- 不修改 actions、API、数据适配、数据库、migration、认证、权限、租户或 Clerk
- 不进入输出、报价、模板专题；不修改 `/settings/output-templates`、`/platform/templates*` 或 TASK-020
- 不修改 `/settings/case-workbench-fields`、149 项字段契约或已完成页面
- 不启动服务、不进行认证/租户排查、不执行统一批次回归
- 不触碰 `src/app/clients/page 2.tsx`

## 依赖关系

- Layout 唯一规范：`BROKER_DESK_LAYOUT_SYSTEM_V1.md`
- 页面归属：`UI_GOV_002B_LAYOUT_FLOORPLAN_MATRIX_V2_2026-08-16.md`
- 已完成核心页面批次：TASK-024、TASK-025、TASK-027–TASK-034
- 输出/报价/模板页面继续独立专题；TASK-020 继续 `Blocked`

## 目标

完成矩阵 V2 中最后一批管理页面与首页的结构收口。只改变页面 Floorplan、层级、响应式排列和操作呈现，不改变现有数据来源、Action、权限、租户、数据库或业务模型。

## Checkpoint A 审计结论

- `/settings/members`：真实来源为当前租户成员、邀请状态、角色和外部登录绑定；保留邀请、角色更新、停用/恢复和重发邀请。移除或弱化硬宽表格与状态徽章堆叠，保留现有权限守卫。
- `/platform/accounts`：真实来源为平台租户账户、席位和负责人邀请状态；保留账户开通、生命周期/席位更新和邀请。平台模板入口属于独立专题，应从本页移出；不创建平台 KPI。
- `/settings/ai-experience`：真实来源为租户范围的 AI 经验候选和修正记录；候选审核是后台任务，不是普通设置表单。保留候选生成、按状态筛选、启用/不使用；移除四格伪 KPI 和复杂卡片竞争，明确 AI 仅为辅助参考。
- `/`：当前同时读取案件、主体、物件、资料、合同和输出，并自行计算 ready/needs_action、优先级、关系提示和输出入口。保留资料录入、信息整理、真实待处理摘要和必要搜索；移除输出入口、固定对象完成状态、合同/输出聚合和重复入口墙。

## 允许修改文件

- `src/app/settings/members/page.tsx`
- `src/app/platform/accounts/page.tsx`
- `src/app/settings/ai-experience/page.tsx`
- `src/app/page.tsx`
- TASK-035 专项契约脚本和治理文档
- `docs/operations/UI_GOV_002B_LAYOUT_FLOORPLAN_MATRIX_V2_2026-08-16.md` 的最终状态对账

## 禁止修改

- actions、API、数据适配、数据库/migration、认证、权限、租户和 Clerk
- 输出、报价、模板页面及 `TASK-020`
- `/settings/output-templates`、`/settings/case-workbench-fields`、`/platform/templates*`
- 已完成页面的视觉返工
- `src/app/clients/page 2.tsx`

## 验收标准

- 四页分别使用批准的 Floorplan，正常信息安静，异常和风险操作有明确层级。
- 成员/平台账户继续使用真实字段和既有 Actions；AI 页面不制造准确率、完成度或第二套配置。
- 首页只保留资料录入、信息整理、真实待处理摘要和必要搜索；不保留输出/合同聚合、对象推断、伪 KPI 或重复入口墙。
- 专项契约、typecheck、lint、build、workflow rules、`git diff --check` 和一次独立只读审查通过。
- 最终提交不包含历史未跟踪文件、禁止范围或已完成页面返工。

## 预计涉及的模块

- `src/app/settings/members/page.tsx`
- `src/app/platform/accounts/page.tsx`
- `src/app/settings/ai-experience/page.tsx`
- `src/app/page.tsx`
- `scripts/check-task-035.mjs`
- TASK-035、BACKLOG、CURRENT_WORKING_CONTEXT、矩阵和统一批次回归清单

## 风险和注意事项

- 成员角色、邀请、停用和平台账户生命周期均受现有权限与租户边界控制，本任务只调整呈现。
- AI 候选的启用状态不是业务事实确认；首页案件/导入待处理摘要只使用既有状态字段，不创建新算法。
- 真实浏览器、响应式、键盘、焦点、权限、租户和完整 Action 运行证据进入统一批次回归。

## 验证命令

- `node scripts/check-task-035.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:workflow-rules`
- `git diff --check`

## 验证与停止条件

- 一个实现 Agent 完成一次有限实现后退出；再启动一个独立只读审查 Agent。
- 执行 TASK-035 专项脚本、typecheck、lint、build、workflow rules 和 `git diff --check`。
- 不启动服务；真实运行、响应式、键盘、权限和租户证据进入统一批次回归。
- 独立提交只包含本任务批准文件；工作区只允许保留原有未跟踪 `src/app/clients/page 2.tsx`。
- 审查通过后标记 `Done` 并停止，不自动进入输出专题或批次回归。

## 当前状态

Checkpoint A 只读事实审计、有限实现和独立只读审查已完成；审查 `PASS`，无 P0/P1。真实服务、浏览器、响应式、键盘、权限和租户运行证据保持 `UNVERIFIED`，不阻塞页面结构迁移。成员停用按钮的显式前端确认仍是既有 P2 能力缺口，未宣称运行通过。
