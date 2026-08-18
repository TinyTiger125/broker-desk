# TASK-033 / W7-C：主体创建/编辑 Responsive Form 参考迁移

- 状态: Done
- 优先级: P0
- 负责人: 技术项目经理
- 当前阶段: 行政收口完成；页面结构迁移完成，运行证据转全产品批次回归
- 前置任务: TASK-032
- 目标路由: `/parties/new`、`/parties/[id]/edit`
- 对照范围: `/parties` 进入/返回；`/relationship-tree` 关系入口；`/clients`、`/clients/[id]` 兼容数据边界
- 审计报告: [`TASK-033_W7C_CHECKPOINT_A_AUDIT_2026-08-18.md`](../operations/TASK-033_W7C_CHECKPOINT_A_AUDIT_2026-08-18.md)
- 目标结构规格: [`TASK-033_W7C_TARGET_STRUCTURE_2026-08-18.md`](../operations/TASK-033_W7C_TARGET_STRUCTURE_2026-08-18.md)

## 任务目标

审计主体创建与编辑页面是否能够在不把客户业务模型伪装成主体模型的前提下，形成稳定的 Responsive Form。主体当前仍兼容存储在 `Client` 记录中；本任务不新增主体表、不修改客户或关系数据，也不提前编写目标结构。

## Checkpoint A 结论摘要

- 没有独立主体表或主体专属数据库字段；主体类型、单一角色和状态写在 `Client.notes` 的本地化元数据行中。
- 表单保存通过 `createPartyProfileAction` / `updatePartyProfileAction` 调用 `addClient` / `updateClient`，会同时写入客户字段。
- `purpose` 由主体角色推导；编辑主体会重写客户 `purpose`，关系提示会写入客户 `preferredArea`，备注会重建整个 `notes` 字符串。
- 类型和角色缺失时，表单层回落为 `individual` / `applicant`；这与列表层显示“未设置”的显式元数据契约冲突。
- 当前角色模型只有单个 `role`，不能表达一名主体的多个角色；`explicitRoles` 只是把单个值包装为数组。
- 编辑页仍使用 `ObjectWorkbenchShell`、完成度算法、状态徽章、进度条和 sticky 保存栏；创建页使用 `FormDraftAssist`、两个提交按钮和生成式默认名称。
- `FormDraftAssist` 的 localStorage key 没有用户/租户/版本边界，并在提交事件发生时先清除草稿，再等待服务端成功结果。
- 页面和 Action 没有 `returnTo` 白名单、结构化错误摘要、字段错误焦点或 IME 机制；运行页面因 `listen EPERM` 未启动，浏览器项目为 `UNVERIFIED`。

## Checkpoint B 规格结论（含强制修订）

- `/parties/new` 冻结为 System State，不显示表单、不调用 `createPartyProfileAction`，不提供“先创建客户”替代入口。
- `/parties/[id]/edit` 只维护姓名/公司名、电话、邮箱、LINE ID、显式类型和显式单一角色；主体备注、状态行、客户备注与未知 notes 行原样保留，不提供编辑控件。
- 类型/角色缺失显示并保持“未设置”，不回落 `individual/applicant`；status 不在表单编辑，不自动写入 `active`。
- notes 只识别日中韩三语类型/角色行，删除同类别旧行并在首个替换位置写入至多一条当前语言规范行；状态、备注、客户原始 notes、未知行及顺序必须保留；客户 `purpose`、区域、阶段、温度、预算、贷款、合同、AML、跟进和其他客户字段必须原样保留。
- 移除主体主流程中的 `FormDraftAssist`、`ObjectWorkbenchShell`、完成度、进度、状态徽章、关系提示和 sticky 保存栏；编辑使用单一保存、取消、共享事实安静说明、结构化错误摘要、固定焦点和严格 `returnTo`。
- `/parties/new` 是零表单 System State；`createPartyProfileAction` 仅作为兼容代码保留，正式页面不得调用，W7-C 不宣称正式主体创建审计闭环。

## Checkpoint C 实现、独立审查与收口

- `/parties/new` 已改为诚实 System State：零表单提交、零 `createPartyProfileAction` 调用，不接受 `name/from/flash` 生成事实。
- `/parties/[id]/edit` 已收敛为 Responsive Form，仅维护姓名/公司名、电话、邮箱、LINE、显式类型和显式单一角色；主体备注、状态、客户备注和未知 notes 行不展示为可编辑字段。
- 主体 metadata notes 已按日文、中文、韩文类型/角色类别安全合并；同类别旧行归一为至多一条当前语言规范行，“未设置”不写默认；客户业务字段保持原值。
- 已移除完成度、进度、状态徽章、ObjectWorkbench、sticky 保存栏、关系提示和主体主流程 `FormDraftAssist`；编辑保留既有更新审计，不宣称正式主体创建审计闭环。
- 专项契约脚本 `scripts/check-party-form-contract.mjs`、typecheck、lint、build、workflow rules 和 `git diff --check` 通过。
- 独立只读审查通过，无 P0/P1；审查指出专项脚本是静态守卫，notes helper 未在真实运行中执行。
- D-Lite 唯一服务探测 `npm run dev -- --port 3002` 因 `listen EPERM: operation not permitted 0.0.0.0:3002` 未启动；1440/768/390、横向溢出、真实 PostgreSQL、权限/租户、键盘、IME、焦点、浏览器返回和完整无障碍均为 `UNVERIFIED`，统一进入全产品批次回归。
- TASK-033 按“独立主体创建诚实冻结、既有主体安全编辑且不改变客户事实、页面结构迁移完成”口径标记 `Done`。不启动第二轮视觉优化或下一页面任务；`src/app/clients/page 2.tsx` 继续未跟踪、未修改、未提交、未删除。
- Checkpoint C 允许范围与领域缺口见目标结构规格；本轮不修改 `src/`、不启动服务或 Agent。

## 任务名称

W7-C：主体创建/编辑 Responsive Form 参考迁移

## 背景和用户结果

用户能够从主体列表进入新建或编辑，理解显式主体类型、角色、联系方式和备注，并在不改变客户阶段、用途、温度或关系事实的前提下完成主体资料维护。本任务先审计兼容 `Client` 存储边界，不把客户对象宣称为主体对象。

## 本次范围

- `/parties/new`、`/parties/[id]/edit`
- `PartyProfileForm`、`party-profile.ts`、主体 Server Action、`Client` 数据适配、审计、权限、租户和返回边界
- `/parties` 仅作进入/返回对照
- `/relationship-tree` 仅核对关系入口
- `/clients`、`/clients/[id]` 仅核对兼容数据边界
- 当前阶段只做 Checkpoint A 只读审计

## 明确不做什么

- 不修改 `/parties`、`/clients`、`/clients/[id]`、关系图、案件、输出或数据库
- 不新增主体表、角色枚举、字段体系或关系模型
- 不引入完成度、AI 确认、输出资格、案件数量、CSV、`focus` 或右侧主体详情
- 不启动实现或审查 Agent，不进行双账号、第二租户或认证排查循环
- 不修改、提交或删除未跟踪的 `src/app/clients/page 2.tsx`
- 不触碰 TASK-020、输出专题、模板版权、预览下载和其他页面迁移

## 依赖关系

- 前置：TASK-032 / W7-B 客户 Responsive Form 页面结构迁移
- 对照：TASK-029 / W6-B 主体 List Report；其显式字段和无完成度边界必须保留
- 共享约束：Layout System V1、当前 `Client` 兼容存储、既有权限/租户和审计链路

## 验收标准

Checkpoint A 报告必须分别记录：已验证事实、代码推断、非权威字段或算法、必须保留的主体业务能力、Client 兼容存储风险、未验证项和 Checkpoint B 前产品决定问题。必须覆盖权威来源、创建/编辑差异、角色枚举及单/多角色限制、客户字段副作用、草稿清理、权限/租户、Not Found、返回、错误、IME、焦点和三档响应式证据缺口。

## 预计涉及的模块

只读核对：

- `src/app/parties/new/page.tsx`
- `src/app/parties/[id]/edit/page.tsx`
- `src/components/party-profile-form.tsx`
- `src/components/form-draft-assist.tsx`
- `src/lib/party-profile.ts`
- `src/app/actions.ts` 中主体创建/更新 Action
- `src/lib/data.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`
- `src/lib/hub.ts`
- `/parties`、`/relationship-tree`、`/clients`、`/clients/[id]` 导航边界

## 风险和注意事项

- 当前类型/角色写入 notes metadata，不是独立主体列；语言化标签解析、缺失值和手工编辑存在契约风险。
- 主体更新会重写客户 `purpose`、`preferredArea` 和 notes，可能改变客户页面事实。
- 创建默认名称、默认类型/角色、单一角色和关系提示均不能在目标结构中默认为权威业务事实。
- `FormDraftAssist` 未绑定用户/租户并提前清理草稿；不得把其状态写成业务保存或成功确认。
- 数据写入与审计写入非同一事务；真实 PostgreSQL、权限和租户隔离未运行验证。

## 验证命令

- `npm run test:workflow-rules`
- `git diff --check`
- `git status --short --branch --untracked-files=all`

## 当前状态

Checkpoint A 已通过，Checkpoint B 条件批准并完成强制修订，任务保持 `In Progress`，进入一次有限实现与独立审查。独立主体创建冻结为零表单 System State，编辑仅维护姓名、联系方式、显式类型和单一角色；本轮尚未修改 `src/`。服务探测因 `listen EPERM` 失败，浏览器和真实数据行为均为 `UNVERIFIED`。

## 范围与禁止事项

只读核对：

- `/parties/new`
- `/parties/[id]/edit`
- 直接使用的 `PartyProfileForm`、`party-profile.ts`、Server Action、`Client` 数据适配和审计边界
- `/parties`、`/relationship-tree`、`/clients`、`/clients/[id]` 仅作导航与兼容边界对照

本阶段不做：

- 不修改 `src/`、数据库、migration、权限、认证、租户、客户、关系或输出数据
- 不新增主体表、角色枚举或字段体系
- 不迁移 `/parties`、`/clients`、客户详情或关系图
- 不启动实现或审查 Agent
- 不触碰 TASK-020 或未跟踪的 `src/app/clients/page 2.tsx`

## 运行边界

- 唯一一次服务探测：`npm run dev -- --port 3002`
- 结果：`listen EPERM: operation not permitted 0.0.0.0:3002`
- 服务未启动；真实页面、保存、Not Found、响应式、键盘、IME、焦点、权限和租户隔离均标记 `UNVERIFIED`

## 停止条件

Checkpoint C 仅允许一次有限实现、一次独立只读审查和一次 D-Lite/批次运行记录；不得进行第二轮视觉优化或启动下一页面任务。未跟踪的 `src/app/clients/page 2.tsx` 继续排除。
