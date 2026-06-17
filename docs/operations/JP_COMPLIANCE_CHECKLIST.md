# 日本不动产经纪产品：权威映射清单（MVP版）

更新日：2026-03-11  
适用范围：日本房地产经纪（売買・媒介中心）  
说明：本清单用于产品设计与工程验收，不构成法律意见。正式合规请由日本律师/行政书士复核。

## 1. 权威来源（官方）
- 国土交通省：宅地建物取引業法関係（法令、報酬告示、標準媒介契約約款）  
  https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000266.html
- 国土交通省：重要事項説明における各法令に基づく制限等（宅建業法35条1項2号相关）  
  https://www.mlit.go.jp/tochi_fudousan_kensetsugyo/const/tochi_fudousan_kensetsugyo_const_tk3_000001_00054.html
- 国土交通省：書面電子化・IT重説（令和4年4月27日公表、5月18日施行）  
  https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo16_hh_000001_00036.html
- 国土交通省：犯罪収益移転防止法の概要（宅建業向け）  
  https://www.mlit.go.jp/totikensangyo/const/sosei_const_tk3_000069.html
- 国土交通省：不動産業におけるマネー・ローンダリング対策（犯罪収益移転防止法）  
  https://www.mlit.go.jp/totikensangyo/const/1_6_bf_000025.html
- e-Gov法令：個人情報の保護に関する法律（最新条文PDF）  
  https://laws.e-gov.go.jp/data/Act/415AC0000000057/605730_2/415AC0000000057_20250601_504AC0000000068_h1.pdf
- 個人情報保護委員会：個人情報保護法ガイドライン（通則編）  
  https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/
- 不動産公正取引協議会連合会：表示規約・必要表示事項（別表1〜10）  
  https://www.rftc.jp/koseikyosokiyaku/

## 2. 分级检查清单（MUST / SHOULD）

### A. 法规硬约束（MUST）
1. `MUST` 记录并管理媒介契约状态（一般/専任/専属専任）与关键日期。  
   - 依据：宅建業法関係、標準媒介契約約款（国交省）
2. `MUST` 对重要事项说明（35条）相关进度可追踪（至少留痕：是否已说明/说明日）。  
   - 依据：宅建業法35条関連、国交省“法令制限概要一覧”
3. `MUST` 对契约书面（37条）交付进度可追踪（至少留痕：是否交付/交付日）。  
   - 依据：宅建業法37条関連、書面電子化改正资料
4. `MUST` 报酬计算逻辑可被告示口径校验（上限规则不可“黑箱”）。  
   - 依据：宅建業法第46条1項・報酬告示（国交省）
5. `MUST` 涉及个人信息时，明确利用目的并可证明已通知/公示路径。  
   - 依据：个保法第17条、第21条（e-Gov/PPC）
6. `MUST` 具备个人数据安全管理措施（访问控制、最小权限、日志）。  
   - 依据：个保法第23条（e-Gov/PPC）
7. `MUST` 具备数据泄漏事件上报与通知流程字段/状态。  
   - 依据：个保法第26条（e-Gov/PPC）
8. `MUST` 对可疑交易与本人確認留痕（适用场景下），并支持保存期限管理。  
   - 依据：犯罪収益移転防止法（国交省不动产业说明）
9. `MUST` 面向客户输出/广告内容，按表示規約可检查“必要表示事項”。  
   - 依据：不動産表示規約（RFTC，別表1〜10）

### B. 行业强建议（SHOULD）
1. `SHOULD` 顾客预算应区分 `総額予算` 与 `月額返済予算`，避免误判购买力。  
2. `SHOULD` 顾客区域需求分 `第1希望` / `第2希望`，贴合一线带看筛选。  
3. `SHOULD` 贷款前置状态（事前審査）纳入跟进优先级。  
4. `SHOULD` 法定节点（35条/37条/媒介契约）进入Dashboard提醒，避免漏动作。  
5. `SHOULD` 输出“客户可读版提案摘要”，减少口头解释时间。

## 3. 字段落地映射（本次已实施）

### 3.1 新增客户字段（Client）
- `budgetType`：`total_price | monthly_payment`
- `firstChoiceArea`
- `secondChoiceArea`
- `loanPreApprovalStatus`：`not_applied | screening | approved | rejected`
- `desiredMoveInPeriod`
- `brokerageContractType`：`none | general | exclusive | exclusive_exclusive`
- `brokerageContractSignedAt`
- `brokerageContractExpiresAt`
- `importantMattersExplainedAt`（35条对应）
- `contractDocumentDeliveredAt`（37条对应）
- `personalInfoConsentAt`（利用目的通知/同意确认留痕）
- `amlCheckStatus`：`not_required | pending | verified | reported`

### 3.2 页面落地点
- 新建/编辑客户页：新增“契約・法定対応”区块。
- 客户详情页：新增“法定対応ステータス”卡片。
- 客户列表页：新增“予算種別”“ローン事前審査”列。

### 3.3 数据层落地点
- Memory 数据驱动：已支持全部新字段。
- Postgres 数据驱动：已支持全部新字段。
- Schema 兼容：`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 已加入，兼容存量库。

## 4. 待办（下一轮建议）
1. 增加“泄漏事件响应”实体（incident 表）以满足个保法第26条流程化留痕。  
2. 增加“報酬告示校验器”（按交易类型与金额给出上限提示）。  
3. 增加“表示規約 必要表示事項”检查器（按物件类型自动校验缺项）。
