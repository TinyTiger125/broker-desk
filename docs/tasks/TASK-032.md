# TASK-032 / W7-B：客户创建/编辑 Responsive Form 参考迁移

- 状态: Done
- 优先级: P0
- 负责人: 技术项目经理
- 当前阶段: Checkpoint C 通过；按页面结构迁移口径行政收口，D-Lite 运行证据 `UNVERIFIED`
- 前置任务: TASK-031
- 目标结果: 将 Responsive Form 的结构原则、错误语言和操作层级延伸到 `/clients/new` 与 `/clients/[id]/edit`，同时保留客户自己的阶段、用途、温度和跟进语义
- 审计报告: [`TASK-032_W7B_CHECKPOINT_A_AUDIT_2026-08-18.md`](../operations/TASK-032_W7B_CHECKPOINT_A_AUDIT_2026-08-18.md)
- 目标结构规格: [`TASK-032_W7B_TARGET_STRUCTURE_2026-08-18.md`](../operations/TASK-032_W7B_TARGET_STRUCTURE_2026-08-18.md)
- Checkpoint C 契约检查: `scripts/check-client-form-contract.mjs`

## 任务名称

W7-B：客户创建/编辑 Responsive Form 参考迁移

## 背景和用户结果

用户能够从客户列表进入新建或编辑，按稳定业务分组填写客户资料，理解必填、可选、空值和错误，保存或取消并保留合法的来源上下文。客户的阶段、用途、温度和跟进语义必须独立于物件模型；本轮只审计页面族，不提前设计或实现。

## 本次范围

- `/clients/new`、`/clients/[id]/edit`
- 两页直接使用的 `ClientForm`、Server Action、数据适配、审计、权限、租户和返回边界
- `/clients` 仅作为进入/返回对照；`/clients/[id]` 仅核对导航和跟进章节边界
- Checkpoint A 只读事实审计；Checkpoint B 只编写一份统一目标结构规格，不进入实现

## 明确不做什么

- 不复制物件字段模型，不把客户阶段/用途/温度替换成物件 lifecycle 或完成状态
- 不修改 `/clients`、`/clients/[id]`、跟进模型、权限、租户、数据库、认证或输出链路
- 不新增客户完成度、输出资格、AI 审核状态或第二套客户详情
- 不进入实现、视觉优化或行为验证
- 不创建、修改、归档、导出客户数据
- 不进行双账号、邀请、第二租户、跨租户或端口排查循环
- 不修改、提交或删除未跟踪的 `src/app/clients/page 2.tsx`

## 依赖关系

- 前置：TASK-031 / W7-A Responsive Form 页面结构迁移
- 对照：TASK-024 Layout System、TASK-027 `/clients` List Report；对照不扩大本任务范围
- TASK-020、输出中心和模板/版权/预览/下载专题继续冻结

## 验收标准

Checkpoint A 报告必须分开记录：已验证事实、代码推断、非权威表达、必须保留的客户业务语义、未验证项、推荐保留/降级/移出结构、Checkpoint B 前产品决定问题。必须覆盖共同事实模型与创建/编辑差异、字段来源、阶段/用途/温度权威性、跟进边界、空值/零值/非法值、Action/审计/权限/租户、草稿清理、返回上下文、错误焦点、IME、Tab/Enter 和三档响应式证据缺口。

## 预计涉及的模块

Checkpoint A 只读核对：

- `src/app/clients/new/page.tsx`
- `src/app/clients/[id]/edit/page.tsx`
- `src/components/client-form.tsx`
- `src/app/actions.ts` 中客户创建、更新、阶段和跟进 Action
- `src/lib/data.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`
- `src/lib/domain.ts`、`src/lib/client-form-template.ts`、`src/lib/client-intake-parser.ts`
- `/clients` List Report、`clients-list-return-state.tsx`、`/clients/[id]` 导航边界

## Checkpoint B 规格结论

- 两页共享同一个 `Client` 事实模型和 `ClientForm` 字段组合，但分别使用 `createClient` 与 `updateClientProfile`；创建与编辑的成功跳转、返回上下文、错误恢复和提交分支不一致。
- 姓名、电话、联系方式、阶段、用途、温度、需求条件、法定/合同字段、下次跟进日期和备注均可追溯到 `clients` 持久化记录；阶段、用途和温度是显式保存的客户业务状态，不是页面推导。
- 跟进记录属于独立 `follow_ups` 事实和 `/clients/[id]` Object Page 业务章节；表单中的 `nextFollowUpAt` 不能替代跟进记录。本任务不审计或迁移 Object Page。
- 新建页的模板和规则式备忘录抽取从默认主流程移除；仅移除页面调用和展示，不删除或重写共享源文件。
- memory 与 PostgreSQL 的客户读取、创建和更新均带租户作用域；真实 PostgreSQL、权限、租户隔离和审计运行证据尚未取得。

目标结构规格固定：五个连续业务分组、创建/编辑独立控制器、用途/温度明确选择、预算零值拒绝、单一保存、严格白名单 `returnTo`（不允许 `/import-center`）、保留 `not_applied/none/not_required` 原业务文案、顶部错误摘要焦点、跟进留在 Object Page、审计原子性风险登记但不在本任务重构。

## Checkpoint A 范围与禁止事项

只读核对：

- `/clients/new`
- `/clients/[id]/edit`
- 两页直接使用的 `ClientForm`、Server Action、数据适配、审计、权限、租户和返回边界
- `/clients` 仅作进入/返回对照；`/clients/[id]` 仅作导航和跟进章节边界核对

本阶段不做：

- 不修改 `src/`、数据库、权限、租户或跟进模型
- 不迁移 `/clients`、`/clients/[id]` 或输出链路
- 不复制物件字段模型，不新增客户完成度、输出资格或 AI 状态
- 不启动实现或审查 Agent
- 不触碰、修改、提交或删除未跟踪的 `src/app/clients/page 2.tsx`
- 不进行双账号、邀请、第二租户、跨租户或端口排查循环

## 运行边界

- 已执行唯一一次 `npm run dev -- --port 3002` 探测，返回 `Error: listen EPERM: operation not permitted 0.0.0.0:3002`；服务未启动。
- 浏览器、真实表单提交、响应式、键盘、焦点、权限和租户项目均标记 `UNVERIFIED`，不作为页面通过证据。
- Checkpoint B 规格完成后停止，等待产品负责人复审；未启动服务或 Agent。

## 风险和注意事项

- 当前 Action 在业务写入后才写审计；审计失败时可能出现已写入但无成功跳转的部分失败状态。
- 创建与编辑重复解析字段和默认值，存在规则漂移风险；不能仅因共用 `ClientForm` 宣称契约已统一。
- 模板/备忘录抽取包含置信度、关键词推断和自动日期，必须保持非权威，不得写成 AI 确认或用户已同意。
- 真实页面、PostgreSQL、权限/租户、键盘/IME/焦点和无障碍均无当前运行证据，统一标记 `UNVERIFIED`。

## 验证命令

- `npm run test:workflow-rules`
- `git diff --check`
- `git status --short --branch --untracked-files=all`

## Checkpoint C 实现与审查记录

- 实现 Agent 已退出；业务写集包含 `src/app/actions.ts`、`src/app/clients/new/page.tsx`、`src/app/clients/[id]/edit/page.tsx`、`src/components/client-form.tsx`，以及本次批准的 `src/app/clients/[id]/page.tsx` 仅 `client_created` 三语 flash 映射；新增有限契约脚本 `scripts/check-client-form-contract.mjs`。
- 已完成五组表单、用途/温度明确选择、预算/日期服务端校验、模板调用移除、单一保存、严格 `returnTo`、结构化错误摘要、快速创建兼容包装和 IME 代码机制。
- `npm run typecheck`、`npm run lint`、`npm run test:workflow-rules`、`node scripts/check-client-form-contract.mjs`、`git diff --check` 均通过；`npm run build` 通过。
- 先前独立审查发现的两个 P1 已按批准边界处理：错误返回后的输入同步保留在 `client-form.tsx`；创建成功后的 `client_created` 反馈仅在详情页现有 `flashMap` 增加三语映射，未修改详情页其他结构。
- 新一轮独立只读复审结论为 `PASS`，无 P0/P1；复审确认详情页仅有该映射变化，`src/app/clients/page 2.tsx` 仍未跟踪且未修改。
- `node scripts/check-client-form-contract.mjs`、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run test:workflow-rules`、`git diff --check` 均通过。
- D-Lite 仅执行一次本地服务探测，`npm run dev -- --port 3002` 返回 `listen EPERM`，服务未启动；1440/768/390、横向溢出、真实 PostgreSQL、权限/租户、Tab/Enter、Kotoeri、焦点、浏览器返回和完整无障碍均标记 `UNVERIFIED`，进入全产品迁移后的批次回归。

## 当前状态

Checkpoint A 已通过，Checkpoint B 条件批准，Checkpoint C 有限实现、成功反馈边界最小修正和独立只读复审已完成，任务按“客户创建/编辑 Responsive Form 页面结构迁移完成”标记 `Done`。详情页仅增加现有 `flashMap` 的 `client_created` 三语映射，不构成 Object Page 迁移。D-Lite 因 `listen EPERM` 未取得运行证据；真实页面、数据库、权限/租户、响应式、键盘/IME、焦点、浏览器返回和完整无障碍统一进入批次回归。不得启动第二轮视觉优化、端口/认证/租户排查或触碰 `src/app/clients/page 2.tsx`。
