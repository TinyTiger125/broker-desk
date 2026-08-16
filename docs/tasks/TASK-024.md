# TASK-024 / UI-GOV-002B：Broker Desk Layout System 建设

- 状态: Done
- UI-GOV 编号: UI-GOV-002B
- 优先级: P0
- 负责人: 技术项目经理 / 实现 Agent / 独立审查 Agent
- 依赖关系: TASK-023 已 Done；TASK-020 仍独立 Blocked，不因本任务绕过其输出闭环门禁
- 当前阶段: 已完成；运行闭环收口检查点、三项正式证据门禁和独立只读审查均已收口

## 任务名称

建立 Broker Desk Layout System V1，并以案件总览“申请人”章节作为第一个 Responsive Form 参考试点。

## 背景和用户结果

当前仓库已有 UI Foundation 和案件 Object Page 参考实现，但全站路由仍由不同页面自行组合 Shell、标题、筛选、表单、状态和操作。用户需要在不同页面之间保持相同的页面语言，同时仍能理解 Worklist、List Report、Object Page、Wizard 和 Preview & Confirmation 的任务差异。本任务先冻结这套结构语言，再决定逐页迁移顺序。

## 任务目标

建立 Broker Desk 唯一的 Layout System：参考 SAP Fiori 的页面结构和交互原则，适配 Broker Desk 的案件、资料、模板、输出和平台管理业务，形成统一页面语言。

本任务不是全站换皮，也不是批量迁移页面。第一阶段只建立规范、Floorplan 映射和目标图；目标图获得产品负责人批准后，才允许建立公共组合组件，并以案件总览的“申请人”章节作为 Responsive Form 试点。

唯一规范来源为 [`BROKER_DESK_LAYOUT_SYSTEM_V1.md`](../product/BROKER_DESK_LAYOUT_SYSTEM_V1.md)。路由归属和迁移顺序记录在 [`UI_GOV_002B_LAYOUT_FLOORPLAN_MATRIX_2026-08-15.md`](../operations/UI_GOV_002B_LAYOUT_FLOORPLAN_MATRIX_2026-08-15.md)。二者都不替代产品术语规范、字段目录、业务规则或权限规则。

## 本次范围

- 建立唯一 Layout 规范、批准的 Floorplan 目录和完整路由映射。
- 建立目标图门禁，覆盖 Shell、案件 Object Page Form、List Report、Worklist、Wizard、Preview & Confirmation，以及桌面/平板/手机和中日韩长文本。
- 目标图批准后，建立必要的公共组合组件；只以案件总览“申请人”章节进行 Responsive Form 试点。
- 记录每个后续页面的主要任务、Floorplan、局部结构、迁移顺序、不可改变能力、验证和回退边界。

## 明确不做什么

- 不进行全站换皮、批量 CSS 改造、全局 class 替换或一次性页面迁移。
- 不在目标图批准前修改正式页面、Token、公共运行组件或业务代码。
- 不修改数据库、API、业务流程、权限、租户、输出门禁、149 项字段目录、术语或历史资料。
- 不创建第二套 Token、第二套页面 Shell、第二套字段编辑系统或 SAPUI5 依赖。

## 依赖关系

- TASK-023 已 Done，提供案件 Object Page 的结构和锚点/键盘证据。
- TASK-022 已 Done，提供唯一 Token 和最小基础组件；`src/app/globals.css` 仍是唯一 Token 来源。
- TASK-020 仍独立 Blocked；本任务不绕过其下载确认、数据版本失效和其他输出闭环门禁。
- UI-GOV-001 页面迁移矩阵提供当前 38 个业务路由和 3 个系统状态入口的盘点基线。

## 已批准的治理边界

- 采用 SAP Fiori Object Page、Dynamic Page、List Report、Worklist、Wizard 和 Preview/Confirmation 的结构思想；不采用 SAP 品牌视觉、SAPUI5、Fiori Elements、企业复杂工具栏或无关配置层级。
- 统一的是 Shell、页面层级、操作层级、字段和状态表达，不是把所有页面做成同一种长页面。
- 每个业务路由必须映射到一个主 Floorplan；允许在该 Floorplan 内使用明确的局部模式，但不得以“混合页面”逃避主要任务判断。
- 认证页和加载/错误/404 属于支持性 Shell/系统状态，不强行塞入业务 Floorplan；它们也必须有明确映射和状态规则。
- `src/app/globals.css` 仍是唯一 Token 来源；本任务不得创建第二套 Token、重复颜色变量或平行设计系统。
- 149 项字段目录、字段适用性、案件数据模型、候选/确认/来源/审计数据、权限、租户隔离、输出门禁和用户可见术语均不在本任务重新定义。

## 内部阶段

### 阶段 A：Layout Contract 与目标图（历史阶段）

只允许修改本卡列出的治理文档：

- 完成唯一 Layout 规范；
- 完成全部 38 个业务路由和 3 个系统状态入口的主 Floorplan 映射；
- 制作目标图需求和参考实现边界；
- 明确 Shell、Dynamic Page Header、全局/局部操作、Section/Subsection、Responsive Form、状态、响应式和无障碍验收规则。

本阶段禁止修改 `src/`、Token、公共组件、正式页面、数据库、API、权限、导航和业务文案。

### 阶段 B：目标图批准门禁

当时状态（2026-08-15）：阶段 A 的 Responsive Form 目标图已按产品负责人批准范围提交，等待视觉确认；正式组件实现尚未获批准。该门禁随后已解除。

### 阶段 A 目标图提交（2026-08-15）

本轮只提交案件总览“申请人”章节的 Responsive Form 目标图，不制作正式组件、不修改生产页面。正式目标图使用同一组代表性字段，覆盖短字段、长地址、缺失、资料冲突和当前编辑字段；中日韩并排长文本另列为 QA 附图，不进入生产组件：

- 1440：两列字段组；长地址跨列；局部编辑面板位于右侧。
- 768：两列字段组保持可读；编辑面板紧跟出生日期所在行展开，后续地址和收入字段顺序不变。
- 390：正式目标图补充为字段单列；编辑面板直接插入选中字段之后，错误信息与取消/保存按钮分行，不依赖横向滚动。
- 普通字段取消完整卡片边框，依靠网格、留白和轻分隔组织；异常字段继续强调。
- 当前编辑的出生日期保留独立选中状态；章节保留“编辑本组”；缺失/冲突字段保留“处理问题”。
- 不使用章节强制高度；`SECTION 01` 和任务说明文字仅不再出现在正式目标图/生产界面。

目标图证据（设计画布导出，不是正式页面浏览器验收）：

- [1440 目标图](/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/task-024-applicant-1440.png)
- [768 目标图](/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/task-024-applicant-768.png)
- [390 目标图](/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/task-024-applicant-390.png)
- [中日韩长文本 QA 附图](/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/task-024-applicant-cjk-qa.png)

本次条件批准复审修订（2026-08-15）：只更新 768px 和 390px 目标图；桌面目标图保持不变。平板/手机编辑器不再追加到章节末尾，目标交互要求为保存或取消后返回原字段及滚动位置。

当时门禁（2026-08-15，已解除）：等待产品负责人确认目标图；不得据此推断正式响应式、键盘、数据保存或业务回归已经通过。

目标图至少覆盖：

- 案件总览 Object Page：Dynamic Page Header、章节锚点、申请人章节 Responsive Form；
- List Report：模板库或信息整理中心的索引/筛选/结果结构；
- Worklist：首页或输出中心的任务队列结构；
- Wizard：资料导入的步骤、决策和恢复反馈；
- Preview & Confirmation：申请书预览、阻塞和下载确认；
- 桌面、平板、手机，以及中文、日文、韩文长文本关键状态。

目标图必须证明页面属于同一产品，但不得把所有 Floorplan 强行做成相同布局。产品负责人批准目标图前，不得进入阶段 C。

### 阶段 C：公共组合组件和单一试点（批准后才允许）

阶段 A 目标图已于 2026-08-15 获产品负责人批准。阶段 C 已按批准范围实施：

- `src/components/layout-system/index.tsx`
- `src/components/layout-system/layout-system.module.css`
- `src/components/case-overview.tsx` 中申请人 child 的 Responsive Form 接入

实现保留快速补全与案件总览的工作差异，只对 `participants_applicant_` 子组接入新布局；未迁移其他页面，未改变字段、保存、权限、租户或输出语义。宽屏编辑器使用右侧列，768px 编辑器跟随完整字段行，390px 通过字段顺序将编辑器置于选中字段之后；内嵌编辑器使用区域语义，当前字段有独立 selected 状态。

直接验收修复已提交为 `46f22d0`：申请人字段在宽屏显式保持前两列，编辑器保持右侧列；关闭编辑器后通过字段锚点恢复原触发按钮焦点，并使用 `preventScroll` 保持当前滚动位置。未修改其他页面、权限、租户、输出或保存语义。

只建立后续迁移必需的公共组合组件，例如 `AppShell`、`DynamicPageHeader`、`PageActions`、`SectionNav`、`ResponsiveFormLayout`、`ListReportShell`、`WorklistShell`、`WizardShell`、`PreviewConfirmationShell`、`StateSurface` 和焦点/反馈组合。

组件必须组合现有 UI Foundation 和唯一 Token，不复制案件领域数据组件，不建立第二套字段编辑系统。只在 `/cases/[id]` 的“申请人”章节进行 Responsive Form 试点；不得同时迁移其他正式页面。

### 阶段 D：独立审查与停止

实现 Agent 完成后退出，再启动一个独立审查 Agent。独立审查只检查本任务范围内的规范一致性、组件重复、案件申请人试点和响应式/无障碍证据；发现范围外问题必须记录并停止，不顺手修复其他页面。

## 运行闭环收口检查点（2026-08-15，已批准）

本检查点由真实浏览器录屏暴露的问题触发，仍属于 TASK-024 的案件 Responsive Form 投入门禁，但不改变原有 Layout System 目标。产品裁决后的三项正式证据门禁为 `3/3`，本检查点已完成，任务状态为 `Done`。

### 允许修改的最小范围

- `src/components/case-overview.tsx`：案件总览字段输入、局部编辑器和保存上下文。
- `src/components/case-workbench-field-form.tsx`：共享表单的客户端邮编校验、IME 组合键保护、滚动位置和视图参数传递。
- `src/app/cases/[id]/page.tsx`：案件总览保存反馈、错误提示和恢复参数接收。
- `src/app/actions.ts`：案件保存动作的服务端邮编校验及总览返回参数。
- `src/lib/japan-postal-code.ts`：客户端与服务端共用的日本邮政编码规则。
- `src/lib/japanese-postal-code-validation.ts`：无 Node 依赖的客户端/服务端共享邮编校验。
- `scripts/check-japan-postal-code-lookup.mjs`：同步检查共享校验模块的规则来源。
- `src/components/layout-system/layout-system.module.css`：申请人编辑器与字段网格的独立布局轨道。

### 必须解决

1. 六位或其他无效日本邮编不得保存、确认或增加完成度；客户端和服务端使用同一校验函数。
2. 保存后保留 `view=overview`、当前章节、当前字段、滚动位置和焦点目标。
3. 宽屏右侧编辑器不得参与左侧字段网格的行高计算。
4. 保存过程保持当前案件总览上下文和局部保存反馈；不得因本检查点重构全局路由或 App Shell。
5. 日文 IME 仍处于组合状态时，Enter 不得提交表单；多行文本 Enter 不得被误拦截。
6. 验收前确认录屏使用的案件只是非生产测试数据；验收后恢复有效邮编、清空并重新标记待补充，或改用一次性测试案件。

### 停止条件

- 如果邮编校验需要改动全局字段模型、数据库结构或完整 149 项验证体系，暂停并报告。
- 如果消除加载空白需要重构全局路由、App Shell 或所有保存动作，暂停并报告；本检查点只保留案件路径能够安全完成的最小修复。

### 收口门禁

- 六位邮编：客户端明确拒绝；服务端同样拒绝；案件数据、确认状态和完成度不变。
- 七位邮编：成功保存；仍在案件总览；章节、字段、滚动和焦点恢复；完成度按有效数据更新。
- IME 组合期间 Enter 只确认文字，不提交。
- 宽屏编辑器打开后左侧字段无巨大空白，编辑器不改变字段行高。
- 完整人工键盘验收和一次独立审查通过后，才能将 TASK-024 标记为 `Done`。

### 阶段 C/D 当前证据与本检查点关系

阶段 C/D 的 1440/768/390 响应式、Escape/取消焦点恢复、保存持久化、CJK 无溢出和下载阻塞证据，加上本检查点的正式 Chrome 768×900/390×844 证据，均已归档。768px 证据只证明实际视口、无横向溢出、编辑器位于选中字段之后且未越出视口，不包含输入框级矩形测量；修正版已删除无数据支持的断言。TASK-020 仍独立 `Blocked`，不因本检查点关闭。

### 运行闭环收口实现与证据（2026-08-15）

- 共享日本邮编校验已拆为无 Node 依赖模块；客户端表单和 `saveCaseWorkbenchAction` 使用同一规则，六位 `124125` 在客户端被明确拒绝，案件展示值、URL 和编辑上下文未改变，输入框保留焦点并显示“日本邮政编码必须为7位数字”的错误。
- 有效七位邮编保存后，浏览器返回地址保留 `view=overview`、`field=applicant.currentPostalCode`、`scrollTop` 和 `#case-section-participants`；保存反馈可见，当前字段按钮重新获得焦点，滚动位置稳定恢复，案件没有切换到快速补全。
- 返回锚点改为当前顶层案件章节，字段通过 `field` 参数保留；这样滚动监听不会把字段编辑返回错误改写到其他章节。
- 当前桌面浏览器实际测量（`innerWidth=1482`，接近目标 1440）：申请人字段区与右侧编辑器为独立布局轨道，字段区高度 `446px`、编辑器高度 `329.64px`，编辑器不参与左侧字段行高计算；同一时间只有一个编辑器。
- Escape 关闭编辑器后焦点回到原字段按钮；显式 Enter 键盘处理已加入并在浏览器中打开编辑器，随后输入框获得焦点。
- `isComposing`/`keyCode=229` 时 Enter 被阻止提交；正式 Kotoeri 录屏已证明组合态、候选确认、第一次 Enter 不提交、编辑器保持打开、Network 无案件保存 POST，且取消后原姓名仍在。正式来源为 `录屏2026-08-16 01.56.18.mov`（约 35.911667 秒，SHA-256 `d40e4a78228f52c2a470cf0d31f4fc2c0fb39015371530cfed0ae9308cc1905d`）；`录屏2026-08-16 01.53.30.mov` 不作为正式 IME 证据。
- 录屏测试案件 `case_bm4jsup9` 的临时邮编及对应状态已从非生产开发数据库清除；浏览器重新读取后显示“待补充”，没有保留临时有效值。

本轮静态与治理检查：`typecheck`、`lint`、`build`、`git diff --check`、workflow rules、邮编检查、字段目录、纠正事件、租户会话/数据边界/治理、生产安全、下载门禁和自动填充策略均通过。最终三项门禁为 `3/3`；服务端六位拒绝、不同七位写入和恢复来自同一正式 Server Action 的相互独立证据，不表述为单次连续事务录像。原始证据与脱敏副本边界见 [`TASK-024 evidence archive`](../operations/evidence/TASK-024/2026-08-16/README.md)。

## Floorplan 目录

本任务采用以下主 Floorplan：

| Floorplan | 回答的主要问题 | 允许的局部结构 |
|---|---|---|
| Worklist | 我现在先处理什么？ | 筛选、任务队列、状态摘要、批量动作 |
| List Report | 我如何找到一批对象？ | Filter Bar、结果表/卡片、行操作、局部详情 |
| Object Page | 这个业务对象整体是什么样？ | Dynamic Page Header、锚点、Section/Subsection、局部编辑 |
| Responsive Form | 我如何创建或编辑一组资料？ | 字段组、三/二/一列、复杂字段跨列、错误恢复 |
| Wizard | 我如何完成一个有顺序的决策流程？ | 步骤、前进/返回、草稿/恢复、结果反馈 |
| Preview & Confirmation | 我将输出什么，最后确认什么？ | 文书预览、阻塞说明、案件级确认、下载 |
| Relationship Explorer | 这些对象如何关联？ | 关系分组、节点/列表、返回上下文；只用于关系树类页面 |
| Auth Shell | 我如何登录或注册？ | 认证表单、错误、语言和返回路径 |
| System State | 当前页面为什么不可用？ | Loading、Error、Not Found、恢复和返回 |

`Auth Shell` 和 `System State` 是支持性 Floorplan，不承载业务对象；这样可以避免把认证和错误页错误地包装成 Worklist 或 Object Page。

## 验收标准

### 阶段 A 验收

1. `BROKER_DESK_LAYOUT_SYSTEM_V1.md` 是唯一 Layout 规范来源；没有同义 Layout 规则散落在第二份活动规范中。
2. 38 个业务路由和 3 个系统状态入口全部出现在 Layout Floorplan 矩阵；每个入口有主任务、主 Floorplan、局部结构、不可改变的业务能力和后续顺序。
3. 规范覆盖 Shell、Dynamic Page Header、全局/局部操作、Section/Subsection、Responsive Form、List Report、Worklist、Wizard、Preview & Confirmation、响应式、状态、空白/错误/加载和无障碍。
4. 明确区分页面类型规则、业务组件规则、Token 规则和业务数据规则；不能用 Layout System 重新定义案件字段、权限、租户、输出或术语。
5. 目标图集合、视口、长文本、空/错误/加载状态和批准人验收内容已记录；目标图批准前没有 `src/` 差异。

### 阶段 C 验收（目标图批准后）

6. 公共组合组件只位于明确的 Layout System 目录，复用 UI Foundation 和唯一 Token；没有第二套 Token、重复组件或全局批量 CSS 替换。
7. 只有案件总览“申请人”章节进入正式 Responsive Form 试点；其他页面没有顺手迁移。
8. 试点保留案件现有字段、适用性、异常、编辑、权限、租户隔离、保存和返回语义。
9. 试点通过桌面、平板、手机、中日韩长文本、键盘、空状态、错误状态、加载状态和案件业务回归验收。
10. 实现 Agent 与独立审查 Agent 顺序执行并全部退出；静态检查、差异检查、浏览器证据和回退提交齐全。

## 明确禁止

- 禁止全站统一换皮、批量改 CSS、全局搜索替换 class 或一次性迁移所有路由。
- 禁止创建第二套 Token、复制 `CaseOverview`/编辑器、复制页面级状态权威或引入 SAPUI5。
- 禁止修改业务流程、数据库、API、权限、租户逻辑、149 项字段目录、输出门禁、用户可见术语或历史资料。
- 禁止把案件总览的 Responsive Form 试点扩展为全站表单重构。
- 禁止在目标图未批准前修改正式页面或公共运行组件。
- 禁止把 lint、typecheck、build 或静态截图当作响应式、键盘、权限、业务回归或真实设备通过。

## 需要产品负责人批准的事项

- 阶段 A 的目标图是否代表统一产品语言，同时保留不同 Floorplan 的任务差异。
- Dynamic Page Header 的压缩状态、全局操作位置和手机端主要操作取舍。
- Responsive Form 三/二/一列在不同有效内容宽度下的视觉目标。
- 空、错误、加载和输出阻塞状态的优先级表达是否符合产品心智。

以下由技术项目经理和设计/实现执行：路由扫描、Floorplan 映射、组件边界、焦点语义、断点测量、截图/录屏、业务回归、差异检查和回退方式。

## 预计涉及的模块

### 阶段 A 只读/治理文档

- `docs/tasks/TASK-024.md`
- `docs/product/BROKER_DESK_LAYOUT_SYSTEM_V1.md`
- `docs/operations/UI_GOV_002B_LAYOUT_FLOORPLAN_MATRIX_2026-08-15.md`
- `BACKLOG.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`

### 阶段 C 目标图批准后

- `src/components/layout-system/`：公共组合组件的唯一目录，具体文件须在实现前登记。
- `src/app/cases/[id]/page.tsx`、`src/components/case-overview.tsx`：仅案件总览“申请人” Responsive Form 试点所需的最小差异。
- 不得因为本任务修改其他正式路由。

## 风险和注意事项

- 如果把所有路由强行套入 Object Page，列表、任务队列和步骤决策会失去效率；Floorplan 映射必须先看用户主要任务。
- 如果先做全局 CSS 或批量换皮，表面统一会掩盖业务权威、权限和返回路径冲突，且难以回退。
- 如果用案件申请人章节的 Form 试点推导全站表单，可能把复杂度、字段适用性和权限差异错误地复制到其他页面。
- 静态目标图不能证明真实滚动、键盘、权限、数据或业务回归；阶段 C 必须补充浏览器和业务证据。
- `Relationship Explorer`、`Auth Shell` 和 `System State` 是必要的支持性类型；强行把它们归为 Worklist 会制造错误的统一。

## 当前状态

`Done`。阶段 A 目标图、阶段 C 实现、运行闭环最小修复、正式 Chrome 768×900/390×844 响应式证据、Kotoeri IME 第一次 Enter 不提交证据、同一路径服务端六位拒绝/不同七位写入与恢复证据，以及独立只读审查均已完成。产品裁决明确：IME 门禁不要求整页刷新；768px 不宣称输入框级矩形测量；服务端证据不宣称单次连续事务录像。`TASK-020` 仍按自身门禁保持独立 `Blocked`。

## 最终行政收口（2026-08-16）

- 三项正式门禁：`3/3`；响应式、服务端邮编和 Kotoeri IME 均通过。
- 独立审查 Agent 已完成并退出；其条件意见已由产品负责人裁决并登记：不要求整页刷新；接受分段服务端证据但必须说明时间边界；768px 不得宣称输入框级测量；原始含测试身份录屏只限本地审查。
- 可分享脱敏证据、QA 调用器 patch、提交元数据和脱敏运行日志已归档至 [`docs/operations/evidence/TASK-024/2026-08-16/`](../operations/evidence/TASK-024/2026-08-16/)。原始截图已随临时 worktree 清理删除；正式 IME 原件仅保留在仓库外私有目录，不进入 Git。
- 临时 QA worktree 和本地分支已清理；QA 调用器未合并为正式产品代码，不得把它作为 TASK-020 证据。
- 本次只写回 TASK-024、BACKLOG、CURRENT_WORKING_CONTEXT 和脱敏证据归档；未修改 TASK-020、UI-GOV-002B 范围、权限、租户隔离、数据库结构或 149 项字段体系。

## 停止条件与交接

- 历史阶段规则：阶段 A 完成后停止，等待目标图批准；不得自行进入阶段 C。该阶段已于 2026-08-15 通过并进入后续实施。
- 阶段 C/D 完成后停止，不启动下一页面迁移任务；后续页面必须按矩阵逐项建立独立实施和验收边界。
- 首页最后处理；不得因为它视觉上最显眼而提前发明 KPI、卡片或状态权威。
- 当前任务完成交接时必须更新 `BACKLOG.md` 和 `docs/operations/CURRENT_WORKING_CONTEXT.md`，记录状态、提交、证据、未验证项和下一步。

## 验证命令

- `npm run test:workflow-rules`
- `git diff --check`
- `git status --short --branch --untracked-files=all`
- 阶段 C 另加 `npm run lint`、`npm run typecheck`、`npm run build` 和正式浏览器验收。
