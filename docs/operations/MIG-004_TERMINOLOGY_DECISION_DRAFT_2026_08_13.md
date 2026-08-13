# MIG-004 日语术语裁决记录

> 状态：产品已确认；TASK-016 / MIG-004 正在实施文档迁移。
> 决策日期：2026-08-13。
> 本文件是决策与证据记录，不是第二个术语规范来源；当前有效术语只见 [`PRODUCT_TERMINOLOGY_CANONICAL.md`](PRODUCT_TERMINOLOGY_CANONICAL.md)。

## 目的和边界

MIG-004只迁移用户可见术语的唯一规范来源和活动文档路由，不修改业务代码、实际界面文案、数据库、运行配置或官方表单原文。内部数据模型名称不改；申请人、借主、贷主、连带保证人等具体业务角色保持准确名称。

## 来源层级

1. 产品已确认的五组决定记录于 `docs/tasks/TASK-016.md`。
2. 当前术语唯一规范为 `docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md`。
3. 本文件保留决策依据和迁移边界；活动工作流与风格指南只作路由和操作说明。
4. 两份 2026-07-14 字典、旧 handoff、CSV 快照和其他 dated/history 资料只作历史证据，不改写、不升格为当前权威。

## 已确认的五组决定

| ID | 业务含义 | 当前确认值 |
|---|---|---|
| H-01 | 首页名称 | 日文 `資料管理センター` |
| H-02 | 创建并读取资料 | 日文 `案件作成・資料読み取り` |
| H-03 | 整理案件信息 | 日文 `案件情報を整理` |
| H-04 | 输出申请书 | 日文 `申込書を出力` |
| H-05 | Party 用户界面集合名称 | 中文 `相关人员`；日文 `関係者`；韩文 `관계자` |

这些值替代旧草案中的候选或推荐值。第五组只规定集合名称；申请人、借主、贷主、连带保证人等具体业务角色不改成集合词。官方表单原始日文标题和栏目名称保持不变。

## 证据索引

决策整理参考了以下官方或行业资料，以及 2026-07-14 的历史字典和审校材料：

- [国土交通省：賃貸住宅標準契約書](https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk3_000023.html)
- [国土交通省：外国人の民間賃貸住宅への円滑な入居](https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk3_000017.html)
- [国土交通省：標準契約書本文](https://www.mlit.go.jp/jutakukentiku/house/torikumi/keiyaku/kei02.html)
- `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_2026_07_14.md`
- `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_JA_2026_07_14.md`
- `docs/operations/UI_TERMINOLOGY_REVIEW_HANDOFF_2026_07_14.md`
- `docs/operations/ui-terminology-*.csv`

历史材料继续保留原始候选和审校痕迹；判断当前产品选词时，以 canonical source 为准。

## 实施结论

- 已确认的五组决定进入 canonical source；不继续作为待确认事项。
- 活动术语流程、日语风格指南、当前上下文、BACKLOG 和本任务卡均应路由到 canonical source。
- 任何实际回填仍须另有任务卡、授权、验证和独立审查；本任务不执行代码或页面文案回填。
