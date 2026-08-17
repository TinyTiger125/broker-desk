# TASK-030 / W6-C：物件索引 `/properties` List Report 参考迁移

- 状态: In Progress
- 优先级: P0
- 负责人: 技术项目经理
- 当前阶段: Checkpoint A 只读代码审计已完成，等待产品负责人复审；不进入目标设计或实现
- 前置任务: TASK-029
- 目标结果: 用户能够查找一个物件，读取系统真实保存的名称、所在地、价格费用和生命周期，并进入正确的物件维护动作；列表不得自行制造台账走势、资料完整度、输出准备度、关系或活动记录
- 当前停止点: Checkpoint A 审计报告已提交；等待产品负责人决定是否批准 Checkpoint B

## 任务边界

本任务只审计 `/properties`、`listHubProperties`、直接数据适配、物件创建/编辑/归档入口、关系图入口、CSV API 边界和输出中心越界依赖。不修改 `src/`、数据库、API、认证、权限、租户或任何物件数据。

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

## 环境与证据边界

- 审计基于当前 HEAD 的代码和治理事实；当前 HEAD 为 `2d3903a05d490caf7a8a4bd7d187a57bcdf9c5d9`，分支为 `main`。
- 当前无 3000/3002 监听服务，未启动服务；没有可接受的当前浏览器截图、窄屏、键盘、真实空态、错误态或返回焦点证据，运行项标记为 `UNVERIFIED`。
- 未进入认证、双账号、邀请、第二租户、跨租户循环；未创建、修改、归档或导出物件数据。

## Checkpoint B 前置门禁

在以下问题未得到产品负责人决定前，不得制作目标结构或启动实现：

- `properties` 独立物件记录、quotation/form data 投影和 `listHubProperties` 的权威边界；
- lifecycle、updatedAt、attachment count 和关系的真实契约；
- 是否冻结 CSV、focus/右侧详情、输出入口、快速创建和 FormDraftAssist；
- URL 搜索、类型、生命周期、价格和最近更新筛选的真实数据契约；
- 旧页面的伪趋势、伪准备度、静态活动、随机/循环封面和字符串关系是否全部移出默认列表。

## 验证命令

- `npm run test:workflow-rules`
- `git diff --check`
- `git status --short --branch --untracked-files=all`

## 当前禁止事项

- 不修改 `src/`、依赖、配置、数据库、API、认证、权限或租户；
- 不创建、修改、归档或导出物件数据；
- 不启动服务、实现 Agent 或独立审查 Agent；
- 不把代码审计写成视觉、响应式、键盘、无障碍或真实权限通过；
- 审计后停止，等待产品负责人复审。

## 任务名称

W6-C：物件索引 `/properties` List Report 参考迁移

## 背景和用户结果

物件列表应帮助用户找到一个物件、读取真实保存的名称/所在地/价格费用/生命周期，并进入正确的物件维护动作。它不是台账走势、资料完整度、输出准备度、关系图或活动看板。

## 本次范围

Checkpoint A 只读核对 `/properties`、`listHubProperties`、内存/PostgreSQL 物件来源、附件计数、创建/编辑/归档入口、关系图入口、CSV API 和输出中心越界依赖；不进入目标设计或实现。

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

### 后续阶段（未授权）

- 只有产品负责人批准目标结构后，才可进入一次有限实现、一次独立只读审查和页面级运行验收；
- 真实双账号、第二租户、跨租户、完整 CSV 下载和共享权限回归不在本阶段自动启动。

## 预计涉及的模块

- Checkpoint A 只读：`src/app/properties/page.tsx`、`src/lib/hub.ts`、`src/lib/data.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`、`src/app/api/hub/export/route.ts`、`src/app/actions.ts` 相关物件动作、`/properties/new`、`/properties/[id]/edit`、`/relationship-tree`、`/output-center` 入口；
- Checkpoint C 若获批准，文件范围另行由产品负责人批准；本卡当前不授权修改其中任何文件。

## 风险和注意事项

- PostgreSQL `properties` schema 与 lifecycle/updatedAt 读写字段可能漂移；不得在页面层猜测或补造权威字段；
- `listQuoteFormData` 名称容易掩盖独立 properties 来源，Checkpoint B 必须明确适配层职责；
- 现有页面伪事实与 CSV 空选择风险会误导用户，不能通过视觉重排掩盖；
- 未取得当前浏览器证据时，只能标记 `UNVERIFIED`，不能声称页面体验通过。

## 当前状态

Checkpoint A 只读代码审计已完成，报告见 `docs/operations/TASK-030_W6C_CHECKPOINT_A_AUDIT_2026-08-18.md`。TASK-030 保持 `In Progress`，等待产品负责人复审；不进入目标设计、不修改 `src/`、不启动 Agent。
