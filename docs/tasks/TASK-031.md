# TASK-031 / W7-A：物件创建/编辑 Responsive Form 参考迁移

- 状态: In Progress
- 优先级: P0
- 负责人: 技术项目经理
- 当前阶段: Checkpoint C 有限实现完成，独立只读审查通过；D-Lite/运行证据待批次回归
- 前置任务: TASK-030
- 目标结果: 用户能够从物件列表进入新增或编辑，按稳定业务分组填写物件资料，理解必填/可选/空值/错误，保存或取消并尽量返回原列表上下文；页面不以伪完成度、AI审核或重复确认干扰主任务
- 审计报告: [`TASK-031_W7A_CHECKPOINT_A_AUDIT_2026-08-18.md`](../operations/TASK-031_W7A_CHECKPOINT_A_AUDIT_2026-08-18.md)
- 目标结构规格: [`TASK-031_W7A_TARGET_STRUCTURE_2026-08-18.md`](../operations/TASK-031_W7A_TARGET_STRUCTURE_2026-08-18.md)

## Checkpoint C 当前交付

- 创建与编辑已改为共享字段组合、术语、分组和服务端解析/校验，保留各自页面控制器与成功跳转。
- 已补齐 PostgreSQL `getPropertyById`/`updateProperty` 的租户作用域读写；售价留空使用兼容 `0`，显式 `0` 拒绝，费用真实 `0` 保留。
- 已移除新建页 `FormDraftAssist` 调用、编辑页完成度/进度工作台/sticky 保存；校验失败使用结构化错误摘要、字段关联和固定摘要焦点。
- 已通过 `check-property-form-contract.mjs`、TASK-030 契约脚本、lint、typecheck、build、workflow rules 和 `git diff --check`；独立只读审查无 P0/P1。
- D-Lite 仅执行一次本地服务探测，`npm run dev -- --port 3002` 返回 `Error: listen EPERM: operation not permitted 0.0.0.0:3002`；未启动服务、未进入认证/租户排查，页面运行证据保持 `UNVERIFIED`。
- 真实浏览器、1440/768/390、Tab/Enter/返回焦点、PostgreSQL 实际读写、权限/租户和完整无障碍仍未验证，不得写成通过。

## 任务名称

W7-A：物件创建/编辑 Responsive Form 参考迁移

## 背景和用户结果

物件创建和编辑应属于同一物件模型的 Responsive Form 页面族：用户从物件列表进入后，按稳定业务分组填写资料，能理解必填、可选、空值与错误，保存或取消，并尽量保留来源列表上下文；页面不应制造完成度、AI审核或重复确认。

## 本次范围

Checkpoint A 已完成只读审计；当前 Checkpoint B 只编写目标结构规格。规格覆盖两个共享物件模型的页面族，并分别保留创建与编辑差异：

- `/properties/new`
- `/properties/[id]/edit`
- 两页直接调用的 Server Action、数据适配、权限/租户/审计和返回边界；`FormDraftAssist`；Layout System、UI Foundation、TASK-024 Responsive Form 试点和当前 `/properties` List Report 作为对照

创建与编辑不强行合并为一个带大量 `mode` 判断的表单；共享字段组合、术语、解析、校验、错误语言和 Responsive Form 结构，保留各自页面控制器、初始值和成功跳转。Checkpoint B 规格已批准并已进入一次有限 Checkpoint C 实现。

## 明确不做什么

- 不修改数据库、migration、API、认证、权限或租户模型；
- 不迁移 `/properties`、`/organize-center`、`/relationship-tree`、`/output-center` 或其他 W7/W8 页面；
- 不把物件页面改成 Object Page、Wizard、卡片仪表盘或第二套表单系统；
- 不把字段非空比例、草稿、AI 辅助或状态徽章写成业务完成事实；
- 不创建、修改、归档、导出物件数据；
- 不进行双账号、邀请、第二租户、跨租户或端口排查循环；
- 不修改、提交或删除未跟踪的 `src/app/clients/page 2.tsx`。

## 运行与证据边界

- 本轮最多进行一次本地服务启动探测；已执行 `npm run dev -- --port 3002`，返回 `Error: listen EPERM: operation not permitted 0.0.0.0:3002`；服务未启动。
- 浏览器项目标记为 `UNVERIFIED`；没有把代码审计写成响应式、键盘、无障碍、权限、租户或保存闭环通过。
- 没有创建、修改或归档数据，也没有进入认证或环境排查循环。

## 验收标准

Checkpoint A 审计报告必须分别列出：

1. 已验证事实；
2. 代码推断；
3. 未验证项；
4. 非权威状态或算法；
5. 必须保留的业务能力；
6. 推荐保留、降级或移出表单的结构；
7. Checkpoint B 前真正需要产品负责人决定的问题。

必须覆盖字段来源、创建/编辑 Server Action、必填和服务端校验、空字符串/`0`/`null`、成功/失败、权限/租户/审计、草稿恢复和清理、返回上下文、未保存离开、桌面/768/390 候选、Tab/Enter/错误焦点及 Layout System 复用边界。

Checkpoint B 规格必须固定：

- 共同字段、术语、分组和创建/编辑模式差异；
- 名称必填、空值/零值/非法值和服务端错误规则；
- 单一主要保存、取消和白名单 `returnTo`；
- 错误摘要、字段错误、`aria-invalid`、`aria-describedby` 和焦点；
- 从新建页移除 `FormDraftAssist`，但不修改共享组件；
- lifecycle 和关系边界；
- Responsive Form 三/二/一列结构和 Layout System 复用；
- PostgreSQL 最小读写适配；
- Checkpoint C 允许文件、测试、独立审查、D-Lite 和停止条件。

## 验证命令

- `npm run test:workflow-rules`
- `git diff --check`
- `git status --short --branch --untracked-files=all`

## 依赖关系

- TASK-030 已按页面结构迁移层面 Done；本任务不重新打开其范围。
- TASK-020 保持 `Blocked`。
- 输出中心、模板版权、授权、售卖、预览和下载专题继续冻结；`/templates` W3、其他 W7/W8 页面保持冻结。
- `BROKER_DESK_LAYOUT_SYSTEM_V1.md`、TASK-024 Responsive Form 试点、`src/components/layout-system/`、`src/components/ui-foundation/` 和 `/properties` List Report 是本审计的结构对照，不在本轮扩展为全站重构。

## 预计涉及的模块

Checkpoint A 只读：

- `src/app/properties/new/page.tsx`
- `src/app/properties/[id]/edit/page.tsx`
- `src/app/actions.ts` 中物件创建、更新和生命周期动作
- `src/lib/data.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`
- `src/components/form-draft-assist.tsx`
- `src/components/object-workbench-shell.tsx`
- `src/components/layout-system/`、`src/components/ui-foundation/`
- `docs/product/BROKER_DESK_LAYOUT_SYSTEM_V1.md`、TASK-024 文档和当前 `/properties` 页面

Checkpoint B 治理规格：`docs/operations/TASK-031_W7A_TARGET_STRUCTURE_2026-08-18.md`。

Checkpoint C 实际修改文件已限于目标结构规格登记范围；审查后不再扩大实现或进入第二轮视觉优化。

## 风险和注意事项

- 新建页调用的 `createPropertyQuickAction` 同时承担完整表单提交，并在空名称时生成默认物件名；这与“明确必填”目标存在契约冲突。
- 编辑页使用 `ObjectWorkbenchShell`、章节完成度和状态徽章，尚未形成 Layout System 定义的 Responsive Form。
- `src/lib/data.postgres.ts` 当前未导出与 `data.ts` 代理所需的 `getPropertyById`、`updateProperty`；编辑页在 PostgreSQL 路径的运行读写能力不能按现状假定成立。
- `FormDraftAssist` 只挂在新建页，任何提交事件都会先清除草稿；服务端失败时是否应保留草稿尚无安全契约。
- 真实浏览器、输入法、焦点、长文本、空值持久化、权限和租户边界仍需后续批次回归或 Checkpoint C 证据，不能由静态代码推断为通过。

## 当前状态

Checkpoint A、B 产品复审已通过；Checkpoint C 有限实现和独立只读审查已完成，任务保持 `In Progress`，等待 D-Lite/产品收口决定。当前不启动新的实现或审查 Agent，不宣称浏览器、响应式、键盘、真实数据库/租户或完整无障碍通过。
