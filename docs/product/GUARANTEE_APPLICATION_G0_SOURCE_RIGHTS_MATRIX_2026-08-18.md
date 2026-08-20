# 五份保证公司申请书：来源与分层权利矩阵

- 制定日期：2026-08-18
- 目的：G0 产品边界、G1 通用能力建设和具体表单商业上架判断
- 证据标准：仓库记录、文件元数据或权利文件才算证据；代码中的 `official`、`verified`、`allowDirectDownload` 不是权利证明
- 当前产品纠偏：五套现有平台蒙板可以作为 G1 真实测试样本，并继续支持现有生产行为；没有权利证据只阻断向新客户正式上架和公开分发，不把它们判定为永久不能输出

## 1. 四类独立判断

不能用“租户分发”统称权利。每个对象必须分别判断：

1. 第三方空白原件及完整预览图的公开展示权；
2. 第三方空白原件的复制、下载和分发权；
3. Broker Desk 自制填写层/兼容配置的安装和使用边界；
4. 租户使用自己上传原件进行内部业务输出的边界。

本矩阵中的“无证据”只关闭五份旧资产面向新客户的正式上架门，不否定通用对象模型，也不替租户补造其自有原件的权利声明。

## 2. 逐项矩阵

| 保证公司/配置 | 当前文件/技术版本 | 公开展示权 | 复制/下载/分发权 | Broker Desk 自制填写层安装/使用 | 租户自有原件内部输出 | 证据位置 | 当前结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 全保連 `zenhoren_individual_v1` | 配置声明 `１全保連.pdf`；`public/guarantee-templates/zenhoren-v1.png`、`zenhoren-v1-hd.png`；代码/迁移为技术 `v1` | **无证据**：不向新客户公开完整原件/高清图 | **无证据**：不由 Broker Desk 提供原始 PDF 下载/分发 | 平台蒙板可继续用于 G1 测试、匹配、校准、预览和现有生产行为；是否面向新客户正式提供，列上线前法律确认 | 客户上传自己合法取得的空白 PDF 后，可按匹配和产品门使用；不由本行旧资产授权 | `src/lib/guarantee-application.ts`；`public/guarantee-templates/*`；`docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`；`db/migrations/20260805_003_guarantee_template_layout_versions.sql` | 不公开、不分发原始 PDF；蒙板不废弃，商业上架待法律确认 |
| 日本セーフティー `nihon_safety_individual_v1` | 配置声明 `日本セーフティー(1).pdf`；`public/guarantee-templates/nihon-safety-v1.png`、`nihon-safety-v1-hd.png`；技术 v1，指纹修复产生 v2 | **无证据**：不向新客户公开完整原件/高清图 | **无证据**：不由 Broker Desk 提供原始 PDF 下载/分发 | v1/v2 可作为 G1 测试样本并维持现有生产行为；商业上架待法律确认 | 仅限客户自有空白 PDF 的独立权利声明、匹配和发布门 | `src/lib/guarantee-application.ts`；`db/migrations/20260810_001_repair_nihon_safety_template_fingerprint.sql`；对应公开资产 | 蒙板不废弃；不向新客户正式上架原始表格 |
| Jリース `j_lease_individual_v1` | 配置声明 `３Jリース.pdf`；`public/guarantee-templates/j-lease-v1.png`、`j-lease-v1-hd.png`；技术 `v1` | **无证据**：不向新客户公开完整原件/高清图 | **无证据**：不由 Broker Desk 提供原始 PDF 下载/分发 | 可继续用于 G1 匹配、校准、预览、输出链路和现有生产行为；商业上架待法律确认 | 仅限客户自有空白 PDF 的独立权利声明、匹配和发布门 | `src/lib/guarantee-application.ts`；`public/guarantee-templates/*`；旧输出文档 | 蒙板不废弃；不公开原始表格 |
| インシュア `insure_individual_v1` | 配置声明 `４インシュア.pdf`；`public/guarantee-templates/insure-v1.png`、`insure-v1-hd.png`；技术 `v1` | **无证据**：不向新客户公开完整原件/高清图 | **无证据**：不由 Broker Desk 提供原始 PDF 下载/分发 | 可继续用于 G1 匹配、校准、预览、输出链路和现有生产行为；商业上架待法律确认 | 仅限客户自有空白 PDF 的独立权利声明、匹配和发布门 | `src/lib/guarantee-application.ts`；`public/guarantee-templates/*`；旧输出文档 | 蒙板不废弃；不公开原始表格 |
| ふれんず保証 `friends_guarantee_individual_v1` | 配置声明 `５ふれんず保証.pdf`；`public/guarantee-templates/friends-guarantee-v1.png`；技术 v1，指纹修复产生 v2 | **无证据**：不向新客户公开完整原件/高清图 | **无证据**：不由 Broker Desk 提供原始 PDF 下载/分发 | v1/v2 可继续用于 G1 测试并维持现有生产行为；商业上架待法律确认 | 仅限客户自有空白 PDF 的独立权利声明、匹配和发布门 | `src/lib/guarantee-application.ts`；`db/migrations/20260810_002_repair_friends_guarantee_template_fingerprint.sql`；`public/guarantee-templates/*` | 蒙板不废弃；不向新客户正式上架原始表格 |

## 3. 权利与 G1/发布门的分离

| 能力 | 当前结论 |
| --- | --- |
| 通用平台蒙板、公司自建蒙板、客户空白表格和已生成文件链路的技术建设 | **不被五套现有平台蒙板的权利证据缺口阻断**；可进入 G1 测试和技术合同 |
| 五套现有平台蒙板面向新客户正式上架 | **暂不正式上架**，等待上线前法律确认；公共目录可以暂时为空 |
| 五套现有平台蒙板的内部测试、匹配、校准、预览和现有生产行为 | **继续允许**；本轮不改变现有生产行为 |
| 客户自有空白表格的内部输出 | 可建设并按客户声明、匹配、权限和质量门使用；不依赖 Broker Desk 分发原始 PDF |
| 租户自行上传并声明有权使用的空白 PDF | 可建设通用流程；具体生产发布仍受匹配、权限、安全和上线前法律门约束 |
| 历史输出和配置 ID/指纹追溯 | 保留；不因公共目录关闭而重新计算或覆盖 |

## 4. 证据判读

- `sourcePdfFileName` 只能证明代码引用了某个文件名，不能证明取得许可。
- `qualityStatus: "verified"` 只能解释为当前工程的技术校准状态，不能解释为法律授权、官方关系或保证公司认证。
- `allowDirectDownload: true` 是当前代码行为开关，在权利矩阵关闭前不得作为产品准入结论。
- 公开 PNG、布局快照和坐标迁移只能证明存在可渲染资产，不能证明可以公开展示、向租户分发或修改原件。
- `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md` 和 `docs/engineering/GUARANTEE_TEMPLATE_PUBLICATION.md` 是工程/产品历史记录，不是外部权利文件。

## 5. 公共目录准入规则

一份表单要进入公共兼容配置目录，至少需要独立保存：

1. 原件取得来源与日期；
2. 版本或发布日期依据；
3. 公开展示许可；
4. Broker Desk 自制兼容配置的安装/使用许可；
5. 允许在空白原件上叠加字段并输出的许可；
6. 证据文件位置、审核人和复核日期。

任一关键项为“无证据”，该具体表单不得作为面向新客户的正式商业目录项，也不得由 Broker Desk 分发原始 PDF 或完整表格图片；但现有平台蒙板可保留为 G1 测试样本和现有生产兼容资产。平台自制蒙板是否需要额外授权，记录为上线前法律确认，不由产品经理推导。

## 6. 撤下和历史处理

- 公共配置撤下：立即停止新的公共展示和安装。
- 已安装租户版本：冻结升级并进入影响评估，不自动停止租户业务。
- 租户自行上传的私有原件及自建配置：不因公共目录撤下自动失效。
- 只有有效法律要求、安全风险或原件不再精确匹配时，才阻断相关新输出。
- 历史输出按合法保留规则追溯，不重新计算、不覆盖。
