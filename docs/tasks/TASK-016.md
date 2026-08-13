# TASK-016：MIG-004 建立用户界面术语唯一规范来源

- 状态: Done
- 优先级: P0
- 负责人: 项目经理 / 实现Agent / 独立审查Agent
- 依赖关系: TASK-014；产品已确认本卡五组术语

## 任务名称

建立当前多语言用户界面术语的唯一规范来源，并把相关活动文档迁移到该来源；本任务不修改业务代码或实际界面文案。

## 背景和用户结果

当前存在两份 2026-07-14 术语字典、旧的日语风格指南、CSV审校包和交接材料。它们分别记录过候选词，但不能继续并列发出当前指令。产品已确认五组用户可见术语，需要把决定固化为单一可追溯来源，同时保留历史审校证据。

## 已确认产品决定

1. 首页名称：`資料管理センター`。
2. 创建并读取资料：`案件作成・資料読み取り`。
3. 整理案件信息：`案件情報を整理`。
4. 输出申请书：`申込書を出力`。
5. Party用户界面名称：中文`相关人员`、日文`関係者`、韩文`관계자`。
6. 内部数据模型名称不因界面术语修改。
7. 具体业务角色继续使用准确名称，例如申请人、借主、贷主、连带保证人。
8. 官方表单原始日文标题保持不变。

## 本次范围

- 新建 `docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md`，作为当前唯一术语规范来源。
- 将 `UI_TERMINOLOGY_WORKFLOW.md`、`JA_TERMINOLOGY_STYLE_GUIDE.md`、MIG-004 决策记录、当前上下文和 BACKLOG 改为引用或说明该唯一来源，不再另立冲突词表。
- 明确 CSV 审校包和两份 2026-07-14 字典是历史输入/证据，不是当前权威；不改写其历史正文。
- 保留官方表单原名、具体业务角色和内部数据模型边界。
- 更新本卡状态、验证和独立审查记录。

## 依赖关系

TASK-014 / MIG-003 已完成；本任务的五组术语决定已由产品负责人确认。

## 明确不做什么

- 不修改 `src/`、`db/`、`public/`、业务配置、实际页面行为或用户可见界面文案。
- 不修改内部变量名、数据库字段名、文件名或技术模型名称。
- 不改写、删除、移动 2026-07-14 字典、旧 handoff、CSV 审校快照或其他历史资料。
- 不执行 MIG-005、业务任务或其他迁移。
- 不建立第二个术语权威，不把风格指南或审校 CSV继续作为当前唯一来源。

## 验收标准

1. `PRODUCT_TERMINOLOGY_CANONICAL.md` 明确标记为当前唯一规范来源，并完整记录五组已确认术语、语言、业务含义、角色边界、官方表单原名和内部模型不变规则。
2. 五组术语与产品决定逐字一致：`資料管理センター`、`案件作成・資料読み取り`、`案件情報を整理`、`申込書を出力`、`相关人员 / 関係者 / 관계자`。
3. 活动术语流程和日语风格指南引用唯一来源，不再定义与其冲突的当前术语。
4. 两份 dated dictionary、旧 handoff 和 CSV 内容保留为历史证据，且不再被活动流程描述为当前唯一权威。
5. 官方表单原始日文标题和具体角色词没有被泛化词替代；内部数据模型没有被修改。
6. `src/`、`db/`、`public/`、业务配置和实际页面文案无差异。
7. 实现Agent完成后退出；独立审查Agent只读检查通过后退出。
8. `git diff --check`、`npm run test:workflow-rules`、文档引用和历史资料保留检查通过。

## 预计涉及的模块

`docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md`、
`docs/operations/UI_TERMINOLOGY_WORKFLOW.md`、
`docs/operations/JA_TERMINOLOGY_STYLE_GUIDE.md`、
`docs/operations/MIG-004_TERMINOLOGY_DECISION_DRAFT_2026_08_13.md`、
`docs/operations/CURRENT_WORKING_CONTEXT.md`、`BACKLOG.md`和本卡。

## 风险和注意事项

- 若直接把旧日语字典改成权威，会把未确认或已过时的候选词伪装成当前决定。
- 若修改代码或实际页面文案，会把文档迁移扩大成产品实现，违反本任务边界。
- 若保留多个活动词源，下一次审校仍会出现重复权威和术语漂移。
- `JA_TERMINOLOGY_STYLE_GUIDE.md`含有历史状态和业务词，必须明确服从新规范来源，不能整篇继续作为并列权威。

## 验证命令

- `git status --short --branch --untracked-files=all`
- `git diff --check`
- `npm run test:workflow-rules`
- 活动文档唯一来源和冲突词扫描。
- 五组术语逐字扫描。
- 历史字典、handoff、CSV未修改检查。
- `src/`、`db/`、`public/`和页面文案差异检查。

## 独立审查条件

- 实现Agent退出后，最多使用一个独立审查Agent；不得创建下级Agent。
- 审查Agent只读检查任务范围、五组术语逐字一致、唯一来源链、历史资料保留、官方标题/角色边界和禁止路径无差异。
- 审查Agent不得修改、移动、删除或提交文件；结论必须为通过、需要修改或阻塞，并附路径和行号证据。

## 当前状态

Done。产品决定已确认，唯一规范来源和活动文档路由已完成；本任务没有修改代码或实际界面文案。

## 实施记录（2026-08-13）

- 已建立 `docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md`，并记录五组已确认术语、来源层级、适用边界和历史资料定位。
- 已将 `UI_TERMINOLOGY_WORKFLOW.md`、`JA_TERMINOLOGY_STYLE_GUIDE.md`、MIG-004 决策记录、当前上下文和 `BACKLOG.md` 路由到该唯一来源。
- 两份 2026-07-14 字典、旧 handoff、CSV 快照和其他历史资料未修改；未修改 `src/`、数据库迁移、`public/`、运行配置、`.cursor`、`AGENTS.md`、MIG-005/TASK-015 或实际界面文案。
- 实现Agent验证：`git diff --check` 通过；`npm run test:workflow-rules` 通过。
- 实现 Agent 已退出；随后唯一独立审查 Agent 只读复核并判定 `PASS`，确认五组术语逐字一致、唯一来源链成立、历史资料和禁止路径无差异；审查 Agent 已退出。
- 项目经理最终复核：`git diff --check` 通过；`npm run test:workflow-rules` 通过；工作树改动仅限本卡授权的治理文档。
