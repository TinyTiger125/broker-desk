# TASK-031 / W7-A Checkpoint B：物件创建/编辑 Responsive Form 目标结构

- 日期：2026-08-18
- 状态：`In Progress` / Checkpoint B 规格完成，等待产品负责人复审
- 前置：Checkpoint A 产品复审通过
- 目标：创建与编辑共享物件字段、术语、分组、校验和错误语言，但保留各自页面控制器、初始值和成功跳转
- 本轮：只提交治理规格；不修改 `src/`，不启动服务或 Agent，不进入实现

## 1. 产品任务和边界

页面族采用 `Responsive Form`，回答“如何创建或编辑一组物件资料”，不采用 Object Page、Wizard、List Report 侧栏或卡片仪表盘。

用户应能：

1. 从 `/properties` 进入新增或编辑；
2. 按同一组业务顺序填写物件资料；
3. 理解必填、可选、空值和错误；
4. 执行一次主要保存或明确取消；
5. 保存成功后得到符合模式的反馈和跳转；
6. 取消或返回时保留合法的来源上下文。

创建与编辑不合并为一个带大量 `mode` 分支的表单：两页保留各自页面控制器和 Server Action，但共用字段组合、术语、解析、校验、错误和结构样式。

## 2. 共同字段契约

创建和编辑都显示并提交以下字段，顺序和术语必须一致：

### 基本信息

- 名称 `name`：必填，必须由用户明确输入；空字符串或只含空白字符返回字段错误；不得生成“新物件/新規物件/신규 매물”等默认名称。
- 区域 `area`：可选；空字符串保存为未设置，不从名称推断。
- 所在地／地址 `address`：可选；空字符串保存为未设置，不与 `area` 合并。

### 价格费用

- 售价 `listingPrice`：可选；空值沿用当前持久化兼容值 `0`，界面以“未设置”显示；用户输入必须是有效、非负数字。真实输入 `0` 仍保存为 `0`，不宣称数据库能够区分它与空值兼容路径。
- 管理费 `managementFee`：可选；空值保持 `null/undefined`，真实 `0` 必须保存为零；有效填写必须为非负数字。
- 修缮费 `repairFee`：可选；空值保持 `null/undefined`，真实 `0` 必须保存为零；有效填写必须为非负数字。

### 面积与补充

- 面积 `sizeSqm`：可选；空值为未设置；填写时必须是大于 `0` 的有效数字，`0` 和负数返回字段错误。
- 备注 `notes`：可选；空字符串保存为未设置，非空文本按用户输入保存。

非法文本、负数和不符合规则的值必须返回字段错误；HTML `min`、`inputMode` 或 `required` 不能替代服务端校验。不得修改数据库结构或另造第二套数据模型。

`lifecycle` 不属于创建或编辑表单，继续由 `/properties` 列表的归档/恢复风险操作负责。编辑页可保留“查看关系”次级链接，但不显示关系推断、关系摘要或关系状态。

## 3. 创建和编辑模式差异

| 项目 | 创建 `/properties/new` | 编辑 `/properties/[id]/edit` |
|---|---|---|
| 初始值 | 所有字段为空 | 从当前租户的现有物件读取并填充 |
| 控制器 | 保留 `createPropertyQuickAction` 名称，但改为明确名称、完整字段和结构化校验契约 | 保留 `updatePropertyProfileAction`，使用同一解析和校验契约 |
| 主要操作 | 一个“保存”按钮 | 一个“保存”按钮 |
| 成功 | 创建后进入 `/properties/{id}/edit`，显示“已创建”反馈；继续携带已验证的 `returnTo` | 留在当前 `/properties/{id}/edit`，显示“已保存”反馈；继续携带已验证的 `returnTo` |
| 取消 | 返回合法 `returnTo`，无 `returnTo` 时回 `/properties` | 返回合法 `returnTo`，无 `returnTo` 时回 `/properties` |
| 关系 | 不显示关系入口 | 可保留“查看关系”次级链接，不改变表单主任务 |
| lifecycle | 不显示 | 不显示 |

不保留创建页“保存并去物件列表”并列主操作；不把编辑页保存改成另一个 Action；不要求两个 `<form>` 合并。

## 4. `returnTo` 契约

`returnTo` 是短期来源上下文，不是开放重定向、业务状态或对象事实。

允许的内部路径只有：

- `/properties`，可带 `q`、`lifecycle`、`sort`、`page`；
- `/organize-center?type=property`，可保留该页面已批准的参数；
- `/import-center`，可保留该页面已有恢复参数。

服务端必须使用现有安全路径校验规则：只接受以单一 `/` 开始的产品内部路径，拒绝 `//`、`/\`、绝对 URL、其他 pathname 和未批准的外部跳转。非法或缺失值回退 `/properties`。

`/properties` 页面只做来源链接传递：

- “新增物件”链接带当前 `q/lifecycle/sort/page` 组成的 `returnTo`；
- 物件名称编辑链接带当前列表上下文的 `returnTo`；
- 不重新打开 TASK-030 的列表结构、筛选逻辑或视觉范围。

浏览器返回、滚动位置和触发链接焦点属于运行回归；代码契约至少不得丢失上述 URL 筛选和页码。

## 5. 保存和数据适配契约

继续使用现有 `createPropertyQuickAction`、`updatePropertyProfileAction`、`addProperty`、`updateProperty`、`record.update`、租户作用域和审计链路，不新增 API 或第二套保存逻辑。

Checkpoint C 允许的最小保存修正：

1. 在 `actions.ts` 中提取创建/编辑共同解析和服务端校验；
2. 创建传递 `notes`；
3. 创建取消默认名称并在名称为空时失败；
4. 管理费/修缮费不再使用 `|| undefined` 吞掉真实零值；
5. 创建审计 `targetType` 从 `compliance` 修正为 `property`；
6. PostgreSQL 补齐 `getPropertyById`、`updateProperty`，并与 memory 实现相同的 `tenant_id` 作用域、未找到返回和字段映射；
7. 不修改数据库、migration、其他查询、生命周期动作或权限模型。

PostgreSQL 适配缺口属于本任务保存路径的核心事实，不能推迟到视觉迁移之后，也不能由页面绕过 `src/lib/data.ts` 代理。

创建和更新成功后才写成功审计、revalidate 和 success flash；校验失败不得写数据库、审计或 success flash。

## 6. 错误契约和焦点

服务端校验失败必须留在当前表单上下文，不跳转全局错误页，并返回结构化结果：

- 顶部错误摘要，使用 `role="alert"` 或等价可感知错误语义；
- 对应字段显示字段错误；
- 每个错误字段使用 `aria-invalid="true"`；
- `aria-describedby` 指向稳定的字段错误节点；
- 保存失败后焦点进入错误摘要，或进入按字段顺序排列的第一个错误字段；
- 所有已输入值继续显示；不依赖 localStorage 草稿恢复；
- `notFound()` 继续用于物件不存在；权限拒绝使用既有权限边界，不伪装成字段错误。

页面成功 feedback 是短暂状态：

- 创建使用“已创建”；
- 编辑使用“已保存”；
- 不把 feedback 解释为资料完成、可输出或 lifecycle 状态。

表单必须使用真实 `form`、`label`、`input`、`textarea`、`button`；标签通过 `id/htmlFor` 关联。Tab 顺序按页面身份、字段组、取消、保存排列；只有一个 submit，Enter 不得触发第二套保存路径，IME 组合输入不能误提交。真实键盘和焦点仍需 D-Lite/批次回归验证。

## 7. 草稿、完成度和关系边界

Checkpoint C 从 `/properties/new` 移除 `FormDraftAssist`，但不删除共享组件、不修改其他页面调用、不重写共享草稿能力。理由：当前提交前清理、reuse 复用和“自动保存/已保存”没有租户、用户、版本及成功确认边界。

创建和编辑均不得显示或计算：

- 完成百分比、剩余数量、进度条；
- `complete/missing` 章节徽章；
- 基于字段 truthy、大于零或字段数量的完成算法；
- AI 审核、输出准备、资料完整度或关系状态。

移除编辑页 `ObjectWorkbenchShell` 左侧进度工作台和 sticky 悬浮保存栏。关系图仅作为编辑页可选的次级链接；列表、表单和关系页不得互相复制详情权威。

## 8. 页面 Floorplan 和结构

页面结构固定为：

1. 页面身份与合法返回入口；
2. 短暂成功或错误反馈；
3. 基本信息：名称、区域、所在地；
4. 价格费用：售价、管理费、修缮费；
5. 面积与备注：面积、备注；
6. 底部稳定操作区：取消、保存。

普通字段使用网格、留白和轻分隔，不使用每字段完整卡片、状态徽章或重复按钮。创建与编辑使用同一分组、字段顺序、术语和错误语言；只有初始值、控制器、成功反馈和返回目的地不同。

### 1440px 桌面

- 使用统一页面 Shell、标题和返回上下文；表单使用可读的两至三列有效宽度；
- 名称和地址等长文本可跨列，区域、价格和费用在同一组内并列；
- 备注保留足够宽度，不用截断保持布局；
- 取消和保存位于稳定的表单底部，不使用 sticky 悬浮栏。

### 768px 平板

- 基本信息和费用允许两列；长字段按可读性跨列；
- 操作区保持两个清晰动作，避免折叠成不可见菜单；
- 标签、单位和错误说明允许换行，不依赖横向滚动。

### 390px 手机

- 所有字段单列连续排列；名称、地址、备注和错误摘要可自然换行；
- 输入、取消和保存满足现有触控尺寸；
- 取消/保存不被固定栏遮挡，返回路径始终可见；
- 不把每个字段转成卡片，也不复制章节状态条。

断点、密度、横向溢出和真实焦点不由静态规格宣称通过，必须在 D-Lite 或统一批次回归中验证。

## 9. Layout System 和组件复用

对照并复用：

- `BROKER_DESK_LAYOUT_SYSTEM_V1.md` 的 Responsive Form 结构、操作层级、状态语言和无障碍规则；
- `src/components/layout-system/` 中现有 `ResponsiveFormLayout`、`ResponsiveFormRow`、`ResponsiveFormField` 的组合能力，在不制造第二套编辑器的前提下使用；
- `src/components/ui-foundation/` 的字段标签、输入、错误关联、按钮和反馈基础；
- `/properties` 当前 List Report 的页面标题、返回上下文和唯一新增入口语言；
- TASK-024 申请人 Responsive Form 试点的三/二/一列与错误/焦点原则。

不得复制 `ObjectWorkbenchShell` 的案件工作台侧栏、进度卡或领域状态；不得新增第二套颜色、间距、圆角、焦点、字体或状态 Token。若现有公共组件需要有限变体，只登记为本任务允许的页面专属组合，不扩展为全站重构。

## 10. Checkpoint C 允许文件和禁止范围

允许修改：

- `src/app/properties/new/page.tsx`
- `src/app/properties/[id]/edit/page.tsx`
- `src/app/properties/page.tsx` 中仅用于传递经过构造的 `returnTo` 链接
- 一个物件专属共享 Responsive Form 字段组合组件及其样式
- `src/app/actions.ts` 中仅两个物件表单 Action 和共同解析/校验
- `src/lib/data.postgres.ts` 中仅 `getPropertyById`、`updateProperty`
- 对应有限契约/行为测试
- TASK-031 治理文档

禁止修改：

- 数据库、migration、API、认证、权限、租户模型；
- `FormDraftAssist` 共享组件或其他页面调用；
- lifecycle 归档动作、关系数据、输出中心、TASK-020；
- `/organize-center`、`/relationship-tree`、`/properties/new` 以外的其他页面迁移；
- `src/app/clients/page 2.tsx`；
- 全站表单组件重构、第二轮视觉优化或新的业务状态算法。

## 11. 测试和审查门禁

Checkpoint C 最低测试必须证明：

1. 创建和编辑共享字段顺序、术语和解析/校验规则；
2. 名称空值、非法文本、负数、面积零值均返回字段错误；
3. 售价空值/零值保存为兼容 `0` 并显示“未设置”；
4. 管理费/修缮费空值保持 `null/undefined`，真实 `0` 保留；
5. 创建保存备注，且创建审计 targetType 为 `property`；
6. 校验失败不写数据库、不写审计、不显示成功 flash，并保留输入；
7. 合法与非法 `returnTo` 行为符合白名单；列表链接保留 `q/lifecycle/sort/page`；
8. PostgreSQL 与 memory 的 `getPropertyById`/`updateProperty` 租户作用域和字段映射一致；
9. 新建页不再调用 `FormDraftAssist`；页面不生成完成度、进度条、状态徽章或第二保存路径；
10. 名称是主要维护入口，取消和保存各只有一个明确操作。

实现完成后先运行相关有限测试、lint、typecheck、build、workflow rules 和 `git diff --check`，再启动一次独立只读审查。审查只检查本规格、保存事实、错误/返回契约和范围，不修复其他页面。

## 12. D-Lite 和结束条件

独立审查通过后才进入一次 D-Lite，重点检查 1440/768/390 的页面身份、字段分组、错误摘要/字段错误位置、取消/保存层级、横向溢出和主要链接。真实 PostgreSQL、完整权限/租户、真实键盘、滚动与触发焦点证据若环境不可用，标记 `UNVERIFIED` 并进入统一批次回归。

TASK-031 仅在以下条件满足后结束：

1. 创建和编辑共享字段、术语、分组和服务端校验；
2. PostgreSQL 与 memory 读写契约成立；
3. 完成度和 ObjectWorkbench 进度结构移除；
4. 单一保存、明确取消和合法 `returnTo` 成立；
5. 错误保留输入、关联字段并定位焦点；
6. 有限测试、静态检查和独立审查通过；
7. 可取得的 D-Lite 证据完成，无法取得的运行项明确进入批次回归。

不得把安全草稿、全站表单重构、关系能力、lifecycle 扩展或其他 W7 页面吸入本任务。
