# TASK-030 / W6-C：物件索引 `/properties` List Report 参考迁移

- 状态: In Progress
- 优先级: P0
- 负责人: 技术项目经理
- 当前阶段: Checkpoint A 产品复审已通过；Checkpoint B 目标结构规格已提交，等待复审；不进入实现
- 前置任务: TASK-029
- 目标结果: 用户能够查找一个物件，读取系统真实保存的名称、所在地、价格费用和生命周期，并进入正确的物件维护动作；列表不得自行制造台账走势、资料完整度、输出准备度、关系或活动记录
- 当前停止点: [`TASK-030_W6C_TARGET_STRUCTURE_2026-08-18.md`](../operations/TASK-030_W6C_TARGET_STRUCTURE_2026-08-18.md) 已提交；等待产品负责人复审后再决定是否授权 Checkpoint C

## 任务边界

本任务的当前交付是 `/properties` 标准 List Report 的 Checkpoint B 目标结构规格。Checkpoint A 已完成只读审计并通过产品复审；本轮只提交治理文档，不修改 `src/`、数据库、API、认证、权限、租户或任何物件数据。Checkpoint C 是否实现，须在本规格复审后另行授权。

不触碰：

- `TASK-020`、输出产品专题、数据库和 migration；
- 认证、权限、租户和共享保存逻辑；
- `/properties/new`、`/properties/[id]/edit`、`/relationship-tree`、`/output-center` 的页面迁移；本轮只核对入口与职责；
- 未跟踪的 `src/app/clients/page 2.tsx`：保持原状，不修改、不提交、不删除；
- 实现 Agent、独立审查 Agent、服务启动、登录排查循环和物件创建/修改/归档/导出。

## Checkpoint A 交付

只读审计报告：[`TASK-030_W6C_CHECKPOINT_A_AUDIT_2026-08-18.md`](../operations/TASK-030_W6C_CHECKPOINT_A_AUDIT_2026-08-18.md)。

报告分别列出：

1. 已验证事实；
2. 代码推断；
3. 未验证项；
4. 伪造或非权威数据；
5. 必须保留的业务能力；
6. 推荐保留、删除、冻结或移出列表的结构；
7. Checkpoint B 前需要产品负责人决定的问题。

Checkpoint A 首要结论：当前页面的固定比例趋势、字段填充准备度、行级伪准备度、静态活动、循环外部图片、字符串关系匹配、右侧第二详情和空选择导出全部不能作为业务事实。若产品负责人批准继续，Checkpoint B 必须先删除或冻结这些表达，再定义一个纯 List Report 结构。

产品复审修正：`properties.lifecycle` 具有仓库级 migration 契约，依据为 `db/migrations/20260808_001_record_lifecycle.sql`；数据库是否已实际应用该 migration 仍未取得运行证据。`updatedAt` 没有可用的列表契约，最近更新排序必须冻结，不能用 ID 或创建顺序替代。

## Checkpoint B 目标结构

目标结构规格：[`TASK-030_W6C_TARGET_STRUCTURE_2026-08-18.md`](../operations/TASK-030_W6C_TARGET_STRUCTURE_2026-08-18.md)。

规格将 `/properties` 收敛为纯 List Report：只显示真实保存的名称、area、价格费用和 lifecycle；移除固定趋势、完整度、输出准备度、关系、活动、随机封面、focus/侧栏、KPI、底部仪表盘、CSV 页面能力和快速创建表单；保留搜索、生命周期、有限排序、分页、唯一新增入口、名称维护链接和归档/恢复次级操作。缺失价格/费用的空值语义、area 推断移除和 lifecycle 迁移契约按规格处理，不修改服务端事实。

## 环境与证据边界

- Checkpoint A 审计基于当时 `main` 分支的仓库代码和治理事实；本次 Checkpoint B 文档以当前仓库 Git 状态为准，不把历史审计提交号当作当前 HEAD。
- 当前无 3000/3002 监听服务，未启动服务；没有可接受的当前浏览器截图、窄屏、键盘、真实空态、错误态或返回焦点证据，运行项标记为 `UNVERIFIED`。
- 未进入认证、双账号、邀请、第二租户、跨租户循环；未创建、修改、归档或导出物件数据。

## Checkpoint C 前置门禁

在 Checkpoint B 目标规格获得产品负责人批准前，不得启动实现：

- 实现只能在本规格允许文件内进行一次；不得修改 actions、API、数据库、migration、认证、权限、租户或禁止页面；
- 不得恢复 CSV、focus、右侧详情、类型/最近更新筛选、输出入口、关系推导或任何伪事实；
- 附件计数、`updatedAt`、关系权威、CSV 契约和输出专题未解决时必须冻结或另立任务，不得扩大 TASK-030。

## 验证命令

- `npm run test:workflow-rules`
- `git diff --check`
- `git status --short --branch --untracked-files=all`

## 当前禁止事项

- 不修改 `src/`、依赖、配置、数据库、API、认证、权限或租户；
- 不创建、修改、归档或导出物件数据；
- 不启动服务、实现 Agent 或独立审查 Agent；
- 不把代码审计写成视觉、响应式、键盘、无障碍或真实权限通过；
- 规格提交后停止，等待产品负责人复审；未获授权不得实现或启动 Agent。

## 任务名称

W6-C：物件索引 `/properties` List Report 参考迁移

## 背景和用户结果

物件列表应帮助用户找到一个物件、读取真实保存的名称/所在地/价格费用/生命周期，并进入正确的物件维护动作。它不是台账走势、资料完整度、输出准备度、关系图或活动看板。

## 本次范围

Checkpoint B 只编写 `/properties` 标准 List Report 目标结构规格，并同步本任务卡、BACKLOG 和 CURRENT_WORKING_CONTEXT；不修改 `src/`、服务或数据。

## 明确不做什么

- 不制作目标图或多套视觉方向；
- 不修改任何业务代码、数据库、API、认证、权限或租户；
- 不创建、修改、归档或导出物件数据；
- 不启动服务、实现 Agent 或独立审查 Agent；
- 不把静态代码审计写成真实浏览器、响应式、键盘、无障碍或权限通过。

## 依赖关系

- 依赖已收口的 TASK-029 和 Layout System/矩阵治理基线；
- TASK-020、输出专题和共享平台 QA 缺口继续独立；
- 任何 Checkpoint B/C 都必须等待本卡 A 审计复审及产品负责人批准。

## 验收标准

### Checkpoint A

- 完成物件权威来源、字段、统计、筛选/排序、行级入口、focus/侧栏、快速创建、CSV、底部越界、空态/错误/分页/返回/窄屏/键盘的事实分类；
- 明确列出伪造或非权威状态，尤其固定比例、静态活动、循环图片、字符串关系和空选择导出全部；
- 明确列出必须保留能力、删除/冻结结构和 Checkpoint B 决策题；
- 不修改 `src/`，审计后停止。

### Checkpoint B

- 明确页面 Floorplan、权威字段、禁止推导、URL、创建/归档/CSV/关系/输出边界、状态/空态/错误、响应式、键盘/返回上下文、允许文件和停止条件；
- lifecycle 以 repository migration contract 描述，数据库实际应用保持未验证；`updatedAt` 最近更新排序冻结；
- 目标结构只保留一个纯 List Report 方案，不引入第二详情或新状态算法；
- 本轮只提交治理文档，不修改 `src/`，不启动服务或 Agent。

### 后续阶段（待批准）

- 只有产品负责人批准目标结构后，才可进入一次有限实现、一次独立只读审查和页面级运行验收；
- 真实双账号、第二租户、跨租户、完整 CSV 下载和共享权限回归不在本阶段自动启动。

## 预计涉及的模块

- Checkpoint A 只读：`src/app/properties/page.tsx`、`src/lib/hub.ts`、`src/lib/data.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`、`src/app/api/hub/export/route.ts`、`src/app/actions.ts` 相关物件动作、`/properties/new`、`/properties/[id]/edit`、`/relationship-tree`、`/output-center` 入口；
- Checkpoint C 若获批准，目标文件范围见目标结构规格；本卡当前不授权修改其中任何文件。

## 风险和注意事项

- PostgreSQL `properties` 的 lifecycle 具有 repository migration contract，但数据库实际应用状态未取得运行证据；`updatedAt` 没有可用列表契约，不能在页面层猜测或补造；
- `listQuoteFormData` 名称容易掩盖独立 properties 来源，Checkpoint B 必须明确适配层职责；
- 现有页面伪事实与 CSV 空选择风险会误导用户，不能通过视觉重排掩盖；
- 未取得当前浏览器证据时，只能标记 `UNVERIFIED`，不能声称页面体验通过。

## 当前状态

Checkpoint A 只读代码审计已完成并通过产品复审，报告见 `docs/operations/TASK-030_W6C_CHECKPOINT_A_AUDIT_2026-08-18.md`。Checkpoint B 目标结构规格见 `docs/operations/TASK-030_W6C_TARGET_STRUCTURE_2026-08-18.md`。TASK-030 保持 `In Progress`，等待产品负责人复审；本轮不进入实现、不修改 `src/`、不启动 Agent。
