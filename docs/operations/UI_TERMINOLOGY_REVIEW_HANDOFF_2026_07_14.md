# UI 术语审校交接说明

更新日: 2026-07-14

## 目的

这套文件用于把 Broker Desk 当前产品里的界面词汇抽出来，让业务审校者像游戏本地化审校一样统一替换术语。

它解决的问题是:

- 不让业务方直接改代码。
- 不让工程方凭感觉改业务术语。
- 不把人名、地址、楼名、公司名这类原始资料硬翻译。
- 让可以自动导入的 i18n 文案和仍需工程迁移的硬编码文案分开处理。

## 已生成文件

当前版本已重新导出以下 CSV:

| 文件 | 用途 | 当前规模 | 推荐使用 |
| --- | --- | ---: | --- |
| `docs/operations/UI_TERMINOLOGY_REVIEW_GUIDE_JA_2026_07_14.md` | 中文写的日语快速审校说明 | - | 和快速 CSV 一起发送 |
| `docs/operations/ui-terminology-ja-starter-review.csv` | 日语快速审校包，高优先级日语前台文案 | 253 条 | 默认发给朋友审 |
| `docs/operations/ui-terminology-ja-business-review.csv` | 日语业务审校包，日语 i18n + 日语前台硬编码文案 | 971 条 | 暂不发给朋友，后续内部使用 |
| `docs/operations/ui-terminology-starter-review.csv` | 多语言高优先级前台文案 | 300 条 | 工程检查用，不作为默认朋友包 |
| `docs/operations/ui-terminology-zh-business-review.csv` | 中文业务审校包，中文 i18n + 前台硬编码文案 | 2528 条 | 开发者中文测试和内部讨论用 |
| `docs/operations/ui-terminology-core-review.csv` | 更完整的前台产品文案 | 2870 条 | 第一轮稳定后再审 |
| `docs/operations/ui-terminology-review.csv` | 全量 CJK 文案，包含系统、后台、库文件 | 6324 条 | 工程清理用 |

第一轮不要直接发全量表。全量表太厚，会把测试者拖进工程细节，反而降低审校质量。

当前只发 `ui-terminology-ja-starter-review.csv`，让朋友快速确认最影响体验的日语词。不要同时发完整业务审校表，避免审校范围过重。

发送给朋友时，建议同时发送 `UI_TERMINOLOGY_REVIEW_GUIDE_JA_2026_07_14.md`，里面用中文说明了 CSV 怎么填、哪列能改、哪些内容不要翻译。

## 审校者只需要改什么

只修改 CSV 的 `suggested_text` 列。

不要改这些列:

- `id`
- `surface`
- `source`
- `file`
- `line`
- `occurrences`
- `locale`
- `key`
- `current_text`
- `notes`

如果某一行术语可以接受，`suggested_text` 留空即可。留空表示保持原文。

如果需要解释原因，建议单独写在反馈文档里，不要改 CSV 结构。

## 每一列是什么意思

| 列 | 含义 |
| --- | --- |
| `locale` | 文案语言。`zh` 是中文界面，`ja` 是日文界面，`ko` 是韩文界面。 |
| `current_text` | 当前产品里显示的文字。 |
| `suggested_text` | 审校者建议替换成的新文字。 |
| `source=i18n` | 可以由导入脚本自动写回 `src/lib/i18n.ts`。 |
| `source=hardcoded` | 目前还写死在页面或组件里，不能自动导入，需要工程迁移。 |
| `surface=frontstage` | 用户会直接看到的前台产品文案。 |

## 什么不应该翻译

以下内容属于业务资料或测试数据，不属于 UI 术语，不应该硬翻译:

- 人名: `ガルシア マリア`, `佐藤 健一`, `李 美玲`
- 地址: `東京都港区芝公園...`
- 楼名和房号: `港区グランドタワー 8F`, `勝どきリバーサイド 1503`
- 公司名: `Lu Trading合同会社`
- 文件名: `港区グランドタワー_申込資料.xlsx`
- 官方表格上的原始日文栏目名

这些内容如果出现在界面上，应保留原文。产品可以在旁边用中文解释类型，但不应把原文改造成中文名字。

## 什么应该审校

审校重点是用户操作和产品概念:

- 模块名: `资料管理中心`, `建档入口`, `整理信息`, `输出文件`
- 对象名: `案件`, `关系人`, `物件`, `待归类资料`
- 操作名: `读取资料`, `新建案件`, `继续整理`, `输出申请书`
- 状态名: `待整理`, `待补全`, `待确认`, `已整理`, `未填写`, `不一致`
- 页面说明: 是否符合房地产经纪的日常说法
- 字段说明: 是否像业务语言，而不是 IT 语言

## 术语判断原则

1. 能用用户的日常业务语言，就不要用工程语言。
2. 能用动词说明动作，就不要用抽象名词。
3. 对普通经纪没有帮助的内部能力词不要展示，例如 `字段映射`, `系统判断`, `保存项 key`。
4. 状态词要能指导下一步动作，例如 `待补全` 比泛泛的 `异常` 更可用。
5. 日文原始资料不要为了中文界面而改名。
6. 中文界面不是把日文直译成中文，而是帮助中文使用者理解日本不动产业务流。

## 导入流程

重新导出当前代码里的词汇:

```bash
npm run terms:export
```

审校完成后先 dry run:

```bash
npm run terms:import -- --csv docs/operations/ui-terminology-starter-review.csv
```

确认结果没问题后写回:

```bash
npm run terms:import -- --csv docs/operations/ui-terminology-starter-review.csv --write
```

写回后重新导出并验证:

```bash
npm run terms:export
npm run lint -- --quiet
npx tsc --noEmit --pretty false
```

## 当前建议执行顺序

1. 发 `docs/operations/ui-terminology-ja-starter-review.csv` 给朋友。
2. 同时发 `docs/operations/UI_TERMINOLOGY_REVIEW_GUIDE_JA_2026_07_14.md` 作为填写说明。
3. 暂时不要发完整表和术语字典，避免信息过载。
4. 收回后只导入 `source=i18n` 且 `suggested_text` 非空的行。
5. 对 `source=hardcoded` 且有建议的行，单独排工程迁移任务。
6. 第一轮稳定后，再处理 `ui-terminology-core-review.csv`。
