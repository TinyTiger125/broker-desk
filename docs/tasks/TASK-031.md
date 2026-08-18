# TASK-031 / W7-A：物件创建/编辑 Responsive Form 参考迁移

- 状态: Done
- 优先级: P0
- 负责人: 技术项目经理
- 当前阶段: 行政收口完成；页面结构迁移完成，运行证据转全产品批次回归
- 前置任务: TASK-030
- 目标结果: 用户能够从物件列表进入新增或编辑，按稳定业务分组填写物件资料，理解必填/可选/空值/错误，保存或取消并尽量返回原列表上下文；页面不以伪完成度、AI审核或重复确认干扰主任务
- 审计报告: [`TASK-031_W7A_CHECKPOINT_A_AUDIT_2026-08-18.md`](../operations/TASK-031_W7A_CHECKPOINT_A_AUDIT_2026-08-18.md)
- 目标结构规格: [`TASK-031_W7A_TARGET_STRUCTURE_2026-08-18.md`](../operations/TASK-031_W7A_TARGET_STRUCTURE_2026-08-18.md)

## Checkpoint C 与行政收口

- 页面结构迁移完成：创建/编辑共享字段、业务分组、服务端校验、保存/取消和错误结构；PostgreSQL 租户作用域适配完成；独立代码审查无 P0/P1。
- 售价留空使用兼容 `0`，显式 `0` 拒绝；管理费/修缮费真实 `0` 保留；创建审计 `targetType` 为 `property`。
- D-Lite 仅执行一次本地服务探测，`npm run dev -- --port 3002` 返回 `Error: listen EPERM: operation not permitted 0.0.0.0:3002`；未启动服务、未进入认证/租户排查。
- 以下项目不宣称通过，统一进入全产品批次回归：1440/768/390 真实页面表现、横向溢出、真实 Kotoeri 组合输入、Tab/Enter/错误摘要与字段焦点、浏览器返回上下文、PostgreSQL 真实读写、权限/租户隔离和完整无障碍。
- IME 防误提交仅确认代码机制存在；页头返回列表属于页面级导航，底部取消属于放弃当前编辑，当前不构成阻塞；批次视觉回归检查二者是否产生重复主操作感。
- `returnTo` 白名单在页面与 Server Action 中重复实现，登记为维护风险；本任务不重构，待规则漂移或第二页面族复用时另行处理。

## 任务名称

W7-A：物件创建/编辑 Responsive Form 参考迁移

## 背景和用户结果

物件创建和编辑应属于同一物件模型的 Responsive Form 页面族：用户从物件列表进入后，按稳定业务分组填写资料，能理解必填、可选、空值与错误，保存或取消，并尽量保留来源列表上下文；页面不应制造完成度、AI审核或重复确认。

## 本次范围

Checkpoint A 已完成只读审计，Checkpoint B 规格已批准，Checkpoint C 已完成一次有限实现。规格覆盖两个共享物件模型的页面族，并分别保留创建与编辑差异：

- `/properties/new`
- `/properties/[id]/edit`
- 两页直接调用的 Server Action、数据适配、权限/租户/审计和返回边界；`FormDraftAssist`；Layout System、UI Foundation、TASK-024 Responsive Form 试点和当前 `/properties` List Report 作为对照

创建与编辑不强行合并为一个带大量 `mode` 判断的表单；共享字段组合、术语、解析、校验、错误语言和 Responsive Form 结构，保留各自页面控制器、初始值和成功跳转。

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

- 真实页面密度、1440/768/390 重排、横向溢出、Tab/Enter、错误摘要与字段焦点、浏览器返回上下文和完整无障碍未取得运行证据。
- IME 防误提交仅有代码机制证据，不能写成真实 Kotoeri 验收通过。
- PostgreSQL 实际读写、权限、租户隔离和完整保存闭环未取得运行证据。
- 页头返回列表与底部取消保留不同语义；批次视觉回归只检查操作层级，不改变返回语义。
- 页面与 Server Action 的 `returnTo` 白名单重复实现是维护风险，暂不在本任务重构。

## 当前状态

Checkpoint A、B、C 产品复审已通过；TASK-031 按“物件创建/编辑 Responsive Form 页面结构迁移完成”标记 `Done`。所有未验证运行项进入全产品批次回归，不启动第二轮视觉优化、端口/认证/双账号排查或新的 Agent。下一项建议建立 W7-B 任务并仅执行 `/clients/new`、`/clients/[id]/edit` 的 Checkpoint A 只读审计；客户阶段、用途、温度和跟进语义必须独立保留，不复制物件字段模型。
