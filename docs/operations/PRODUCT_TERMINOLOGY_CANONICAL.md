# Broker Desk 产品术语唯一规范来源

> 状态：当前有效（Current）
> 决策日期：2026-08-13
> 适用范围：多语言产品用户界面术语的文档规范与后续经授权的实现引用。

本文是 Broker Desk 当前唯一有效的产品术语规范来源。活动工作流、风格指南、任务卡、当前上下文和 BACKLOG 只能引用本文或记录迁移状态，不得另立当前词表。本文不授权代码、数据库、运行配置或实际界面文案变更。

## 来源层级与决策记录

1. 产品已确认的五组用户可见术语：`docs/tasks/TASK-016.md`。
2. 当前规范：本文；发生冲突时以本文为准。
3. 决策与证据记录：`docs/operations/MIG-004_TERMINOLOGY_DECISION_DRAFT_2026_08_13.md`，仅记录已确认决定及其依据，不与本文并列为术语来源。
4. 活动路由：`docs/operations/UI_TERMINOLOGY_WORKFLOW.md`、`docs/operations/JA_TERMINOLOGY_STYLE_GUIDE.md`、`docs/operations/CURRENT_WORKING_CONTEXT.md`、`BACKLOG.md`。
5. 历史输入：2026-07-14 字典、旧 handoff 和 CSV 快照，仅用于追溯审校过程，不得升格为当前权威。

## 已确认的五组用户可见术语

| 组别 | 业务含义 | 语言 | 当前规范术语 |
|---|---|---|---|
| 1 | 首页名称 | 日文 | `資料管理センター` |
| 2 | 创建并读取资料 | 日文 | `案件作成・資料読み取り` |
| 3 | 整理案件信息 | 日文 | `案件情報を整理` |
| 4 | 输出申请书 | 日文 | `申込書を出力` |
| 5 | Party 用户界面集合名称 | 中文 | `相关人员` |
| 5 | Party 用户界面集合名称 | 日文 | `関係者` |
| 5 | Party 用户界面集合名称 | 韩文 | `관계자` |

前四组是已确认的日文用户界面表达；第五组明确记录三种语言的界面集合名称。除表中内容外，不在本文推导未确认的语言变体。

## 适用边界

- 内部数据模型名称不改；不得因界面术语修改内部变量名、数据库字段名、schema、mapping 或技术模型名称。
- `相关人员`、`関係者`、`관계자`只是界面集合名称。申请人、借主、贷主、连带保证人等具体业务角色必须保持准确名称，不得用集合词泛化替代。
- 官方表单的原始日文标题和栏目名称不变；产品界面简称不能改写或覆盖官方表单原文。
- 本任务只迁移规范来源和活动文档路由，不修改代码和实际界面文案。任何后续实现都必须另有明确任务卡、授权和验证。

## 历史资料定位

以下资料保留为历史证据，原文不改写、不删除、不移动，也不作为当前默认规范：

- `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_2026_07_14.md`
- `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_JA_2026_07_14.md`
- `docs/operations/UI_TERMINOLOGY_REVIEW_HANDOFF_2026_07_14.md`
- `docs/operations/UI_TERMINOLOGY_REVIEW_GUIDE_JA_2026_07_14.md`
- `docs/operations/ui-terminology-*.csv`

需要追溯历史候选、审校意见或快照时，直接读取上述文件；需要判断当前产品术语时，只读取本文。
