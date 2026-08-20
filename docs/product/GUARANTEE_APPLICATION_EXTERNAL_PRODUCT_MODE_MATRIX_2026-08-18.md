# 保证公司申请书专题：外部产品模式与采用决策矩阵

- 制定日期：2026-08-18
- 研究范围：G0 产品合同补充
- 证据规则：仅使用厂商官方产品页、官方帮助或官方公告；访问日期均为 2026-08-18
- 当前结论：用于确定对象、版本、发布和工作流边界，不授权 G1 或任何实现
- 产品语言边界：本文件保留内部对象和技术术语；面向产品和用户的对象名称、核心流程和范围，以[《保证公司申请书：第一版产品基线》](./GUARANTEE_APPLICATION_PRODUCT_BASELINE_V1_2026-08-18.md)为准。

## 1. 研究方法与判读规则

本矩阵把每条信息分为两类：

- **厂商明确说明**：官方来源直接描述的产品对象、流程或权限边界。
- **Broker Desk 产品推论**：基于上述事实形成的本产品采用、调整采用或不采用决定。推论不回写成厂商承诺。

营销页只用于确认厂商公开描述的产品定位和流程入口；没有官方来源支持的隐藏能力、成功率、普遍失败率、法律效果和后台实现不在本矩阵中推断。若官方资料没有充分证明某一细节，记录为“未证实”，不以截图或单个用户反馈补足。

## 2. 对应矩阵

| 产品/模式 | 厂商明确说明 | Broker Desk 对应对象 | 采用决策 |
| --- | --- | --- | --- |
| Adobe Acrobat Sign | Library Templates 区分 Document Templates 与 Form Field Templates。字段模板是可复用的字段层，不包含文件正文，可套用到上传的新文件；字段可在套用后调整。共享范围包含个人、群组和组织，管理员可维护共享模板。Adobe 还说明：新文件可复用旧字段层，先仅自己可见测试，确认后再扩大到群组/组织。来源：[Admin Guide](https://helpx.adobe.com/sign/using/admin-guide.html)、[Document Templates](https://helpx.adobe.com/sign/using/document-templates.html)、[Transfer fields to new template](https://helpx.adobe.com/sign/using/transfer-fields-to-new-template.html)、[Create a template](https://helpx.adobe.com/sign/adv-user/library-templates/create-template.html)（访问 2026-08-18）。 | Document → 租户空白原件；Form Field Template → 平台基础填写层/租户填写层；Document Administrator → 填写层管理者；群组/账户共享 → 同一经营主体内部发布。 | **采用**对象分离、安装后校准、私有草稿到内部发布的顺序；**调整采用**共享范围只限经营主体，不复制 Adobe 的组织模型；**不采用**电子签署能力和 Adobe 权限/组织实现。 |
| SAP Forms + S/4HANA Output Management | SAP 文档把表单布局、表单接口/Schema、数据源和输出控制分开；预置模板可以复制为自定义模板，绑定明确数据源，并由 Output Control 决定当前输出使用的活动模板和规则。官方的 **Maintain Form Templates** 文档明确支持访问旧版本、下载版本并在对象层比较两个版本。来源：[Form template and form interface](https://help.sap.com/docs/SAP_S4HANA_CLOUD/2bba750d1e124e1ea2a039bb1cd9b6c5/219418e4f5ff4501a36e36c00296aa65.html)、[Maintain Form Templates](https://help.sap.com/docs/SAP_S4HANA_CLOUD/a376cd9ea00d476b96f18dea1247e6a5/da488f76078447b0b42792226cfcf9b1.html?locale=en-US&state=PRODUCTION&version=2508.500)、[Output Control/custom templates](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/a2b387872d4743989769c432a482008d.html)、[Output Control](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/2bc3ee8d1c83404e8cf62418640004f2/d736578415a340cba84b944798a699b5.html)、[Form template determination](https://help.sap.com/docs/SAP_S4HANA_CLOUD/2bba750d1e124e1ea2a039bb1cd9b6c5/c0308b046115426aa28b6688ea1256f6.html)（访问 2026-08-18）。 | Schema → Broker Desk 权威案件字段目录；Template → 填写层；Data Source → 案件事实和申请书补充数据；Custom Template → 租户覆盖层/自建层；Output Control → 预览、确认、下载门禁。 | **采用**Schema/Template/Data Source/Output Control 分离、不可变版本和历史比较作为治理参考；**调整采用**第一版保存可追溯历史，但不制作 SAP 式版本比较界面；**不采用**SAP 运行时、企业规则引擎或其完整表单产品。 |
| DocuSign Rooms for Real Estate | 交易或案件资料是中心，表单和文件在交易空间内组织、编辑、合规检查和发送；官方页面描述使用最新的协会、MLS 和经纪业务表单，并从交易数据预填。来源：[Rooms for Real Estate](https://www.docusign.com/products/rooms-for-real-estate)、[Real Estate solution](https://www.docusign.com/solutions/industries/real-estate)、[Transaction management](https://www.docusign.com/blog/simplifying-transaction-management-rooms-real-estate)（访问 2026-08-18）。 | 案件 → 输出上下文；申请书 → 案件输出载体；已确认案件事实 → 多份申请文件共用的数据源。 | **采用**普通成员从案件开始、表单作为输出载体、同一案件事实可复用；**调整采用**当前只生成兼容填写文件，不实现电子签名、合规工作流或第三方表单库；**不采用**Rooms 的交易协作和签署功能。 |
| Lone Wolf Transactions（zipForm Edition） | 官方页面描述在交易相关文件之间共享数据，填写一次后信息可自动带入其他文件，并以交易为中心管理文件和签署。来源：[Transactions – zipForm Edition](https://www.lwolf.com/transactions-zipform-edition)（访问 2026-08-18）。 | 交易/案件事实 → 共享数据源；多份申请书 → 同一案件的输出文件。 | **采用**案件事实单一来源和跨文档复用；**调整采用**以 Broker Desk 的案件权威字段为准，不复制 zipForm 的表单市场或签署能力；**不采用**未被该官方页面证明的更多功能。 |
| At Home「スマート申込」 | 官方资料描述无纸化 Web 申请、减少缺漏、仲介/管理之间共享、向保证公司传递、进度可见，以及与相关服务的数据联携。来源：[服务页](https://business.athome.jp/service/smart_moushikomi/)、[服务发布说明](https://www.athome.co.jp/corporate/news/release/services/smart-moushikomi-chintaikanri-201912/)、[API/Smart Rating 说明](https://www.athome.co.jp/corporate/news/release/services/smartrating-202202/)（访问 2026-08-18）。 | 申请接收方和流程状态 → 未来直接数据联携路线；案件事实 → 一次录入源。 | **采用**一次录入、缺漏检查、状态可追踪作为未来接口路线的产品方向；**不采用（当前）**保证公司 API、At Home 数据交换或其状态机；当前只做兼容填写层。 |
| ITANDI「申込受付くん」 | 官方产品页和公告描述申请人、管理、仲介、保证等参与者之间的申请处理和当前持有方；官方公告还描述与电子合同、保证公司之间的数据联携。来源：[申込受付くん](https://lp.itandibb.com/moushikomi-uketsuke/)、[电子合同与日本セーフティ联携公告](https://www.itandi.co.jp/news_posts/946)、[数据联携公告](https://www.itandi.co.jp/news_posts/746)（访问 2026-08-18）。 | 申请参与者与状态 → 未来直接联携时的接收方/状态模型；案件事实 → 一次录入源。 | **采用**角色清晰、状态追踪和一次录入的产品原则；**调整采用**Broker Desk 当前不新增保证公司接口或申请协作状态机；**不采用**ITANDI 的服务和电子合同。 |
| いえらぶ「Web申込み」 | 官方资料描述 Web 申请资料在仲介、管理、申请人和保证相关参与者之间共享，提供 API、审查进度和无纸化流程；公告还描述申请更新/取消等状态变化。来源：[Web申込み联携说明](https://ielove-cloud.jp/news/entry-1144/)、[Web申込み介绍](https://ielove-cloud.jp/news/entry-415/)、[集团服务页](https://www.ielove-group.jp/)（访问 2026-08-18）。 | 申请接收方、状态和共享 → 未来 API/直接联携路线；Broker Desk 案件事实 → 当前兼容输出的源数据。 | **采用**清楚的接收方、状态和异常反馈方向；**不采用（当前）**接口合作、审查 API、跨公司数据共享或其申请状态实现。 |
| Jotform Smart PDF Forms | 官方帮助说明可上传 PDF，把在线表单回答写回原 PDF；导入时可能漏掉字段，需要手动连接；字段可拖动、缩放和调整，在线字段与 PDF 字段保持连接，预览/下载仍使用原 PDF。来源：[PDF connection](https://www.jotform.com/help/874-how-does-the-pdf-connection-works-with-smart-pdf-forms/)、[Link fields](https://www.jotform.com/help/610-how-to-link-your-online-form-fields-with-pdf-through-smart-pdf-forms/)、[Import PDF](https://www.jotform.com/help/548-how-can-i-import-my-own-pdf-with-smart-pdf-forms/)、[Best practices](https://www.jotform.com/help/605-How-to-use-and-get-the-best-out-of-JotForm-Smart-PDF-Forms/)、[Annotations](https://www.jotform.com/help/how-to-edit-and-customize-annotations-in-pdf-editor/)（访问 2026-08-18）。 | 上传原件 → 租户空白原件；在线字段/PDF字段连接 → 填写层映射；手动拖动、缩放、连接 → 人工校准。 | **采用**原件与字段层连接、导入后人工校准和原 PDF 输出；**调整采用**第一版只做受控字段映射与测试，不承诺自动识别；**不采用**Jotform 的通用表单平台、公开发布和自动识别作为成功门槛。 |

## 3. 跨产品共同模式与 Broker Desk 决策

### 3.1 采用：案件事实、文档和填写层分离

Adobe 的 Form Field Template 不包含文档正文，SAP 把数据源、表单接口和布局分开，DocuSign Rooms 与 zipForm 都以交易资料为中心而不是把每份表单当成独立事实源。Broker Desk 因此冻结：

```text
Broker Desk 案件事实
        ↓
申请接收方
├─ 当前：兼容填写层生成指定申请书
└─ 未来：合作接口直接传送结构化数据
```

公共兼容配置只保存坐标、字段 ID、字段类型、格式/校验、原件匹配条件和测试元数据；不保存第三方原件正文、高清背景或完整缩略图。

### 3.2 采用：安装后形成租户版本

外部产品共同证明“可复用基础配置”和“客户自定义版本”应分离。Broker Desk 的版本链固定为：

```text
平台基础填写层
→ 租户安装
→ 租户覆盖版本
→ 已发布租户版本
→ 输出快照
```

平台基础层不能被租户直接修改；租户覆盖层和自建层有独立版本，发布动作必须明确且可追溯。

### 3.3 采用：Adobe 式草稿、测试、发布

填写层管理者的正式流程冻结为：

```text
上传租户空白原件
→ 选择并套用已有填写层
→ 人工校准
→ 使用测试案件预览
→ 检查溢出、复选框、日期和分页
→ 发布给本公司
```

新建配置在测试通过前只对创建者和获授权管理者可见。普通成员不进入编辑器，也不能绕过匹配和测试门禁强制输出。

### 3.4 采用：匹配状态与字段目录版本门禁

原件与填写层的匹配结果至少为：

| 状态 | 允许动作 |
| --- | --- |
| 精确匹配 | 可进入正常预览和确认输出 |
| 需要重新校准 | 只能进入填写层管理流程，普通成员不能强制输出 |
| 不兼容 | 停止套用，要求更换原件或填写层 |
| 无法判断 | 停止正常输出，要求管理员确认或重新验证 |

每个填写层记录适配的 Broker Desk 字段目录版本。字段目录出现不兼容变化时，相关租户版本进入“待重新验证”，不能继续用于新的正式输出。Jotform 官方资料证明导入可能漏字段并需要人工连接；这支持“自动检测只能生成候选，不能直接发布”的产品推论。

### 3.5 采用：普通成员从案件开始，编辑器作为低频管理工具

普通成员的日常流程固定为：

```text
选择案件
→ 选择保证公司
→ 系统选择已发布填写层
→ 补齐申请书差异字段
→ 预览
→ 确认输出
```

填写层编辑器属于低频管理工具，不应成为普通成员的首屏任务，也不应把坐标、字段目录版本或原件指纹暴露给日常用户。

## 4. 未证实内容与保留冲突

- SAP 官方 **Maintain Form Templates** 明确证明可访问旧版本、下载版本并比较两个版本；Broker Desk 采用“不可变版本和可追溯历史”，但第一版不制作 SAP 式版本比较界面。
- Lone Wolf 官方页面证明跨文件数据复用，但本次未以该页面证明其行业表单库范围；“最新行业表单”采用 DocuSign 的官方表述，不转嫁给 Lone Wolf。
- 日本产品的 API、保证公司联携和状态追踪是厂商公开的未来路线证据，不是 Broker Desk 已拥有的接口合同。
- Jotform 的官方帮助证明可能漏识别并要求手动连接；“自动检测不能作为第一版发布门槛”是 Broker Desk 推论，不是 Jotform 的失败率结论。

## 5. 对当前仓库的直接影响

本矩阵不授权代码修改，但要求 G0 合同把以下旧结构标记为差距而非目标：

1. 当前租户模板页仍以“官方模板/官方原件”语义展示并直接展示保证公司图片。
2. 当前平台配置和租户安装链存在，但没有完整的租户覆盖层、自建层和四态原件匹配合同。
3. 当前保证申请草稿含 `user_id` 个人维度；与“配置/草稿从创建起归经营主体”的目标冲突。
4. 当前输出快照已有部分版本和输入快照字段，但没有一等的租户空白原件指纹/版本合同。
5. 当前成员/账户页面仍使用席位占用语义；新专题要求按经营主体订阅，不按席位售卖。
6. 当前权限角色和模板动作存在，但尚未映射为公司管理、业务操作、填写层管理三个维度。
7. 当前现有公开资源、静态模板配置和旧工程文档的来源/权利状态必须单独核对；无证据的表格不得进入新的公开兼容目录。

这些差距进入 G0 的迁移影响清单，不在本研究中删除旧结构或启动实现。

## 6. 采用结论

| 主题 | 结论 |
| --- | --- |
| 对象模型 | 采用“案件事实、原件、填写层、输出快照”分离 |
| 版本治理 | 采用平台基础层 → 租户安装 → 租户版本 → 输出快照 |
| 日常入口 | 采用从案件进入，普通成员不先进入编辑器 |
| 管理流程 | 采用创建者/管理者私有草稿 → 测试 → 公司内发布 |
| 匹配门禁 | 采用精确匹配/重新校准/不兼容/无法判断四态 |
| 字段目录 | 采用字段目录版本进入发布合同 |
| 自动识别 | 不采用为第一版成功条件；未来只能生成候选并由人确认 |
| 直接接口 | 不采用当前实施；保留未来申请接收方接口路线 |
| 电子签名、模板市场、自有报价单 | 不采用，继续排除 |
