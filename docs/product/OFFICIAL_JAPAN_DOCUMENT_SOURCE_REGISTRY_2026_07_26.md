# 日本房产文书官方来源登记

更新日期：2026-07-26

## 产品规则

1. 只有完成字段映射、版式核验、适用场景审核和生成结果回归的文书，才可以标记为“可生成”。
2. 官方原件仅代表来源可信，不等于系统已经可以自动填写。
3. 国土交通省的示范合同、记载例和标准条款具有不同法律性质，产品必须分别标明。
4. 没有全国统一官方样式的文书，不使用任意企业样式冒充“标准版本”。
5. 本登记表只记录官方资料来源、原名和证据，不定义V1产品生成范围；查看或下载官方资料不等于生成产品输出。

## 已登记官方原件

| 文书 | 发布方 | 版本或基准日 | 法律性质 | 本地文件 | 官方来源 |
| --- | --- | --- | --- | --- | --- |
| 重要事項説明書（売買・交換）記載例 | 国土交通省 | 2026-04-01 | 现行记载例 | `mlit-important-matters-example-2026-04-01.pdf` | https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000268.html |
| 賃貸住宅管理受託契約 重要事項説明書 記載例 | 国土交通省 | 2021-04-23 页面公开版 | 管理委托契约签订前的记载例 | `mlit-rental-management-important-matters-2021-04-23.pdf` | https://www.mlit.go.jp/tochi_fudousan_kensetsugyo/const/tochi_fudousan_kensetsugyo_const_tk3_000001_00004.html |
| 標準媒介契約約款 | 国土交通省 | 2024-04-01 施行 | 国土交通省告示的标准约款 | `mlit-standard-brokerage-agreement-terms-2024-04-01.pdf` | https://www.mlit.go.jp/totikensangyo/const/content/001723420.pdf |
| 賃貸住宅標準管理受託契約書 | 国土交通省 | 2021-04-23 页面公开版 | 标准合同 | `mlit-standard-rental-management-agreement-2021-04-23.pdf` | https://www.mlit.go.jp/tochi_fudousan_kensetsugyo/const/tochi_fudousan_kensetsugyo_const_tk3_000001_00004.html |
| 賃貸住宅標準契約書（連帯保証人型） | 国土交通省 | 2018 版本；官方页面含后续说明 | 示范合同，非强制使用 | `mlit-standard-residential-lease-joint-guarantor-2018.pdf` | https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk3_000023.html |
| 賃貸住宅標準契約書（家賃債務保証業者型） | 国土交通省 | 2018 版本；官方页面含后续说明 | 示范合同，非强制使用 | `mlit-standard-residential-lease-rent-guarantee-2018.pdf` | https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk3_000023.html |

## 非当前V1生成输出：未来候选或历史兼容

下列文书在本任务中不属于当前V1生成输出。保留清单用于历史兼容和未来候选，不进入当前V1导航、任务范围或完成标准：

- 物件概要书
- 购买提案书
- 费用估算明细书
- 资金计划书（贷款试算）
- 试算前提条件说明书
- 入居申请书占位
- 购买申请书占位
- 募集图面占位
- 合同和交接类占位

其中买付申込书、一般入居申込书和募集图面没有单一的全国统一官方样式。后续若实现，应先明确具体接收方、行业系统或企业模板，再逐一建立版本登记。

## 升级为自动生成模板的验收条件

- 明确发布方、版本、适用交易类型和使用限制。
- 原件每个输入项均已映射到 Broker Desk 字段或明确标记为人工填写。
- 日期、金额、姓名、地址和复选项格式与原件一致。
- 多页分页、字体、字号、换行、印刷区域和 PDF 嵌字完成核验。
- 缺失值不会被猜测填充，所有模型建议均需可追溯并由用户确认。
- 至少使用三组完整案件和三组缺失案件完成逐项对照测试。
