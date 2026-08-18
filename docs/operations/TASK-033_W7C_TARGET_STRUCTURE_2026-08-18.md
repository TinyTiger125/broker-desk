# TASK-033 / W7-C Checkpoint B：主体安全编辑目标结构

- 日期：2026-08-18
- 状态：Checkpoint C 实现与独立审查完成；按页面结构迁移口径行政收口
- 目标路由：`/parties/new`、`/parties/[id]/edit`
- 结构基线：Layout System V1、TASK-024 Responsive Form 试点、TASK-029 主体 List Report

## 1. 产品定位与数据诚实边界

本任务只把主体页面收敛为：

> 可查找、可安全维护既有主体兼容资料的 Responsive Form。

当前没有独立主体表。`Client` 只能称为兼容持久化来源，不能写成“客户就是主体”。在独立主体事实层、多角色、案件级角色、法人代表、借主和贷主等领域契约成立前，不开放独立主体创建。

因此本任务采用单一方向：

- `/parties/new` 改为明确的 System State，不显示表单、不调用 `createPartyProfileAction`、不创建客户替代主体；
- `/parties/[id]/edit` 只维护已存在兼容主体的主体字段，不改变客户业务字段；
- `/parties`、`/relationship-tree`、`/clients` 和 `/clients/[id]` 继续保持现状，仅作为入口和兼容边界，不在本任务迁移。

## 2. `/parties/new` System State

页面身份继续是主体创建入口，但内容必须诚实说明：

> 当前数据模型无法在不生成客户记录的情况下独立创建主体。为避免改变客户用途、阶段和关系信息，独立主体创建暂未开放。

页面只提供：

- 返回主体列表 `/parties`；
- 明确说明这是数据模型边界，不是权限不足、系统故障或已完成状态。

页面必须移除或不渲染：

- `PartyProfileForm`；
- `createPartyProfileAction` 引用；
- `name`、`from`、`flash` 参数对草稿或事实的影响；
- 日期生成的默认名称；
- `FormDraftAssist`；
- “先创建客户”或其他替代入口。

不修改 `/parties` List Report 的新增入口；本任务只保证用户进入后不会产生错误客户数据。`createPartyProfileAction` 保留在 Action 文件中，以避免未知调用方被本任务删除；正式页面不得调用它。

## 3. 编辑页字段契约

`/parties/[id]/edit` 采用连续的 Responsive Form，分为四组：

### 3.1 基本信息

- 姓名/公司名
- 显式主体类型：`individual`、`corporate`

### 3.2 联系方式

- 电话
- 邮箱
- LINE ID

### 3.3 主体属性

- 显式单一角色

当前角色枚举保持不变：`applicant`、`tenant`、`co_occupant`、`emergency_contact`、`guarantor`、`owner`、`landlord`、`buyer`、`seller`、`broker_company`、`management_company`、`other`。不新增借主、贷主、法人代表或多角色。

### 3.4 明确不进入主体表单的字段

主体备注、状态行、客户备注和无法识别的历史 notes 行全部原样保留，不在本页展示为可编辑字段。

明确不进入主体表单：

- `relationHint`
- `preferredArea`、第一/第二意向区域
- `purpose`、阶段、温度、预算、预算类型
- 贷款、媒介合同、法定日期、AML
- 跟进和 `nextFollowUpAt`
- 案件、物件关系字符串、关系数量
- 完成度、输出资格、AI 状态、附件、CSV 和输出入口

关系图保留为次级导航，不在表单中维护关系模型。

## 4. 类型、角色和状态规则

- 类型和角色只接受显式主体 metadata；不得从姓名、`purpose`、`stage`、备注、案件内容或字符串匹配推断。
- 缺少显式类型或角色时，编辑页显示“未设置”；保存时可保持缺失。
- 不得把缺失回落为 `individual`、`applicant` 或其他默认事实。
- 用户明确选择后才写入对应 metadata。
- 当前只保存一个角色；不得在页面拼接多角色。
- `status` 不在本表单编辑；缺失 status 保持缺失，不自动写入 `active`。
- `party-profile.ts` 的现有枚举文案继续沿用；未来是否补充法人代表、借主、贷主或多角色另登记领域缺口，不在 W7-C 实现。

## 5. notes 安全合并契约

类型和角色当前兼容存储在 `Client.notes`。主体备注、状态行、客户备注和未知历史行不可编辑，更新不得重新构建整段字符串覆盖客户备注，必须采用最小安全合并：

1. 识别日文、中文、韩文全部已知“主体类型”行和全部已知“主体角色”行；
2. 保存时删除同类别的全部旧行，避免跨语言重复值、冲突值和旧值优先；
3. 在首个被替换位置写入最多一条当前语言规范行；没有旧行时按实现约定在 metadata 区稳定插入一条；
4. 用户选择“未设置”时，该类别不写入新行；
5. 状态行、主体备注行、客户备注、未知行及其相对顺序保持不变；
6. 不写入默认 `individual`、`applicant` 或 `active`，非法 metadata 不得静默转换；
7. 不修改 `purpose`、`preferredArea` 或其他客户字段；
8. 如果当前解析工具不能满足以上规则，可在 `src/lib/party-profile.ts` 增加最小安全合并函数，不修改数据库。

## 6. 客户字段保护

主体编辑必须原样保留当前 `Client` 中不属于主体表单的全部字段：

- `purpose`
- `stage`
- `temperature`
- `budgetMin`、`budgetMax`、`budgetType`
- `preferredArea`、`firstChoiceArea`、`secondChoiceArea`
- `loanPreApprovalStatus`
- `desiredMoveInPeriod`
- 媒介合同字段及法定日期
- `amlCheckStatus`
- `nextFollowUpAt`、`lastContactedAt`
- 其他未列入主体表单的客户字段

必须删除主体编辑保存路径中的 `inferPurposeFromPartyRole` 调用。主体更新不得写入 `preferredArea`，不得覆盖客户 notes 中无法识别的内容。

## 7. 保存、错误与返回

编辑页只保留：

- 一个主要“保存”按钮；
- 一个明确“取消”入口；
- 关系图作为页面级次级导航。

页面顶部以安静说明告知共享事实：

> 姓名和联系方式当前与客户档案共享，保存后会同步反映在相关客户信息中。

按界面语言提供等义的日文、中文、韩文文案；不使用警告徽章。

必须采用已批准的 Responsive Form 错误契约：

- 服务端结构化错误状态；
- 保存失败保留全部输入；
- 顶部可编程错误摘要固定获得焦点，并使用 `role="alert"`；
- 摘要错误可链接到字段；
- 字段使用 `aria-invalid` 和 `aria-describedby`；
- IME 组合态 Enter 防误提交作为代码机制；
- 错误不写客户字段、不写成功审计、不跳转成功页。

`returnTo` 只允许经过验证的产品内部路径：

- `/parties`，只保留 `q`、`type`、`lifecycle`、`page`；
- `/organize-center?type=party`，只保留该列表实际支持的筛选、分页参数。

必须拒绝并回退安全默认路径：

- `/import-center`、关系图、详情路径；
- 其他主体 ID；
- `focus` 或任何未知查询参数；
- 外部地址、协议相对地址、Host、反斜杠和路径穿越。

安全默认路径固定为 `/parties`。保存后留在当前编辑页并保留安全 `returnTo`；取消返回该来源。

保存成功后留在当前主体编辑页并显示短暂反馈；取消返回经过白名单校验的来源。浏览器返回、触发链接焦点和真实焦点行为进入运行回归，不得写成当前已通过。

## 8. 权限、租户、Not Found 与审计

- 继续使用现有 `record.update` 权限和租户会话。
- 编辑读取和更新必须维持当前主体兼容记录的租户范围与所有者边界。
- 主体不存在继续使用 Not Found；不得把不存在伪装成字段错误。
- 编辑继续保留既有更新审计能力；正式主体创建已冻结，不宣称 W7-C 保留正式创建审计闭环。
- `createPartyProfileAction` 作为未清理的兼容代码保留，但正式 `/parties/new` 不得引用或调用。
- 审计目标类型和动作命名的 `client`/`party` 语义差异登记为风险；不得用页面层伪造独立主体审计事实。

## 9. 草稿与高级能力边界

本任务从主体编辑和新建主流程移除 `FormDraftAssist`。不删除共享组件，也不改其他页面调用。

原因：现有 localStorage key 没有用户/租户/版本边界，提交事件先清理草稿，且 reuse 值可能跨主体复用。未来若恢复，必须另立共享草稿契约，至少明确作用域、版本、清理时点和成功确认。

高级关系、历史、附件、CSV、输出和案件能力继续留在各自页面或专题，不进入主体基本资料表单。

## 10. 响应式与 Layout System

编辑页复用 Layout System V1 与已批准 Responsive Form 语言：

- 页面身份、返回路径和单一主保存操作位于页面层；
- 四个业务组使用连续表单表面、网格、留白和轻分隔；
- 普通字段不使用每字段完整卡片、状态徽章或工作台进度；
- 桌面使用两至三列，768px 自然压缩或重排，390px 单列；
- 不使用 `ObjectWorkbenchShell`、左侧进度导航或 sticky 保存栏；
- 正常主体信息安静显示，只有错误或风险反馈突出；
- 不新增第二套颜色、圆角、阴影、焦点或状态 token。

真实 1440/768/390、横向溢出、键盘、IME 和焦点均属于运行回归，不在 Checkpoint B 规格中宣称通过。

## 11. Checkpoint C 建议允许范围

若产品负责人批准进入实现，原则上只允许：

- `src/app/parties/new/page.tsx`：改为 System State，移除正式表单调用；
- `src/app/parties/[id]/edit/page.tsx`：收敛为安全主体编辑 Responsive Form；
- `src/components/party-profile-form.tsx` 或新增 `/parties` 专属编辑字段组件；
- `src/lib/party-profile.ts`：仅增加 notes 安全合并/保留未知行的最小适配；
- `src/app/actions.ts`：仅结构化主体更新、客户字段保护、严格 `returnTo` 和兼容包装；保留但不从正式页面调用 `createPartyProfileAction`；
- 必要的有限契约/行为测试；
- TASK-033 治理文档。

默认禁止：

- 新增主体表、migration、数据库字段或新角色体系；
- 修改 `/parties`、`/clients`、`/clients/[id]`、`/relationship-tree`、案件、输出、权限、认证或租户模型；
- 修改 `FormDraftAssist` 共享组件或其他页面调用；
- 触碰 TASK-020 和 `src/app/clients/page 2.tsx`。

## 12. 测试与停止条件

Checkpoint C 至少需要证明：

1. `/parties/new` 是零个表单提交，不引用或调用 `createPartyProfileAction`，不生成默认名称、不接受 `name/from/flash` 形成事实；编辑页恰好一个主要保存提交；
2. 编辑缺失类型/角色显示并保持“未设置”，不回落 `individual/applicant`；
3. 编辑只替换已识别主体 metadata/备注行，未知 notes 行和顺序保留；
4. 编辑不会改变客户 `purpose`、阶段、温度、预算、区域、贷款、合同、AML、跟进或其他客户字段；
5. 主体编辑不再调用 `inferPurposeFromPartyRole`，也不写入 `preferredArea`；
6. 非法 metadata 不被静默转换；
7. 错误摘要、字段关联、输入保留和固定焦点契约成立；
8. `returnTo` 拒绝 `/import-center`、其他主体 ID、`focus`、未知参数、外部地址和路径穿越；
9. `FormDraftAssist` 不再出现在主体主流程；
10. 真实 PostgreSQL、权限、租户、响应式、键盘、IME、焦点和无障碍证据单独标记。

TASK-033 只允许一次有限实现、一次独立只读审查和一次 D-Lite/批次运行记录。完成定义是：独立主体创建诚实冻结，既有主体可安全编辑且不改变客户事实，静态检查和范围审查通过；无法取得的运行证据进入统一批次回归。

## 13. 领域缺口登记

独立主体创建、多角色、案件级角色、法人代表、借主、贷主、主体关系和独立主体事实层均属于未来领域任务。在这些契约成立前，不得通过 `/parties/new` 再次开放独立创建，也不得用页面层推导替代领域模型。
