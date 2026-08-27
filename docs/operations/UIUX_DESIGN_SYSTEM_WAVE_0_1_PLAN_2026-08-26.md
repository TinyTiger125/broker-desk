# Broker Desk UI/UX Design System Wave 0/1 设计计划

- 状态：`Wave 1 First Slice In Implementation / Browser Acceptance Pending / Production Not Authorized`
- 日期：2026-08-26
- 适用范围：全产品页面结构一致性与 Layout System 执行化设计
- 依据：`docs/product/BROKER_DESK_LAYOUT_SYSTEM_V1.md`、`docs/operations/UI_GOV_002B_LAYOUT_FLOORPLAN_MATRIX_V2_2026-08-16.md`、TASK-022、TASK-023、TASK-024，以及本轮固定 Staging UI/UX 审计证据
- 正式只读基线：`origin/main` `d929e6c4dfc93328bc78ec6a5d1f4cdb0444dc00`

本文件定义唯一 Wave 0/1 专题的设计边界、组合层合同、代表模板和验收门；实现状态由 `TASK-042` 追踪。本轮实现仅限隔离工作树，仍不授权数据库、权限、迁移、部署或 Production。

## 1. 当前事实与设计判断

### 1.1 正式规范是什么

`BROKER_DESK_LAYOUT_SYSTEM_V1.md` 是唯一活动 Layout 规范。它参考 SAP Fiori 的 Object Page、Dynamic Page、List Report、Worklist、Wizard 和 Preview & Confirmation 的结构与交互原则，但明确不采用 SAP 品牌视觉、SAPUI5 或 Fiori Elements。

正式规范已经定义：

- 稳定 Shell、工作区身份、主内容区和全局反馈层级；
- Dynamic Page Header 的身份、压缩状态和单一页面主路径；
- Section/Subsection、锚点、返回上下文和焦点恢复；
- Worklist、List Report、Object Page、Responsive Form、Wizard、Preview & Confirmation、Relationship Explorer、Workspace Selector、Auth Shell、System State 的任务边界；
- 桌面/平板/手机重排、中日韩长文本、空/加载/错误/权限状态与键盘焦点原则；
- Layout 组合组件必须复用 `src/components/ui-foundation/` 和 `src/app/globals.css`，不能产生第二套 Token 或第二套领域编辑系统。

### 1.2 当前实现是什么

当前 `src/components/layout-system/index.tsx` 实际公开的主要是四个 Responsive Form 基础组件：

- `ResponsiveFormLayout`
- `ResponsiveFormRow`
- `ResponsiveFormField`
- `ResponsiveFormEditorSlot`

现状尚未形成可被页面直接复用和检查的页面级组合层：`PageFrame`、`DynamicPageHeader`、`ListReportShell`、`WorklistShell`、`StateSurface`、统一 `ActionBar` 和统一 `SectionNav` 仍缺少正式的组合合同与静态来源门。

本轮真实 Staging 审计还显示：

- 日文 locale 下真实触发的 404 页面仍出现中文文案，属于 confirmed P1；
- `/organize-center` 存在重复说明；
- `/settings/members` 仍出现 `active`、`removed` 等英文状态 token；
- `/output-center` 未选择文档时缺少明确的空状态和下一步说明；
- 多数抽样页面仍依赖本地表单、列表和 Tailwind 结构；
- 390px 抽样未见横向溢出，人物选择抽屉关闭按钮/Escape/焦点恢复抽样通过；
- zh/ko 真实页面、error/global-error 实际触发、成功/错误提交态、完整键盘、200% 缩放和屏幕阅读器仍未验证。

因此，本专题的核心问题不是“全站换皮”，而是把既有规范变成可复用、可检查、可分波次落地的页面组合语言。

## 2. 范围与明确不做

### 2.1 Wave 0/1 允许设计的范围

1. 统一 canonical route 与 floorplan 权威关系；
2. 为页面级组合层定义职责、插槽、变体和不可变业务边界；
3. 选择四类代表模板并完成目标结构与状态矩阵：
   - Workspace Selector：`/workspace`；
   - List Report：`/organize-center`；
   - Responsive Form：`/cases/new` 作为首个主模板；Object Page：`/cases/[id]` 作为紧随其后的对照/验证模板；
   - Worklist：`/output-center`；
4. 定义静态治理门，阻止页面重新复制 Shell、Header、Action Bar、State Surface、Token 和 Responsive Form 结构；
5. 将 404 locale 修复列为首个最小实现切片候选，但在本计划获得产品评审前不修改代码。

### 2.2 明确不做

- 不逐页修补，不进行全站 CSS 搜索替换，不建立第二套 Token；
- 不修改案件、主体、物件、模板、输出、权限、租户、数据库、migration 或历史数据合同；
- 不恢复 `/quotes/[id]/print`，不清理历史/孤立预览文件；
- 不进入 TASK-020 输出闭环、Calendar、提醒、附件、关系图、AI 或 Production；
- 不把设计目标图、静态检查或局部浏览器截图写成全站 WCAG 合规；
- 不把 404 P1、布局结构 P1 和业务功能 P1 混为同一类问题；
- 不在本专题内拆成多个页面任务。Wave 0/1 只保留一个后续专题，页面迁移须在该专题通过设计评审后另行授权。

## 3. Wave 0：canonical route 与 floorplan 设计收口

### 3.1 目标

建立一份无歧义的页面权威表：每个正式页面族只有一个 canonical route、一个主任务、一个主 Floorplan、一个页面级主路径和一组明确的局部结构。历史入口、退役路由、API/QA 入口和孤立预览不得混入正式页面数量。

### 3.2 必须核对的对象

以矩阵 V2 的 34 个业务/后台页面族、2 个 Auth Shell、4 个 System State 和 1 个退役路由为基线，重点复核：

- `/workspace` 是否始终是唯一 Workspace Selector，不由页面各自重建工作区身份；
- `/organize-center` 是否是正式 List Report 入口，局部异常不能演变为第二套 Worklist；
- `/cases/new` 的 Responsive Form 与 `/cases/[id]` 的 Object Page 如何共享 Shell、Header、Section、Action 和 State，但不共享领域数据编辑权威；
- `/output-center` 的 Worklist 与 Preview & Confirmation 页面族的边界，不能因空预览区而把输出工作流塞回案件页面；
- 未被当前矩阵完整表达的保证申请路径、历史预览、孤立 UI Foundation 预览和 `src/app/templates/page 2.tsx` 的权威/历史状态；
- `/quotes/[id]/print` 继续保持退役，不恢复、不静默重定向。

### 3.3 Wave 0 设计交付

1. Canonical route/floorplan 表：每行包含 route、主任务、主 Floorplan、局部结构、页面级主操作、返回路径、不可改变的业务边界、历史/运行证据状态。
2. 组合层依赖图：说明 Shell → Page Header → Page Body → Section/Filter/Form/State → Domain Component 的关系。
3. 代表模板选择记录：`/cases/new` 已确定为首个 ResponsiveFormShell 主模板，`/cases/[id]` 为紧随其后的 ObjectPageShell 对照/验证模板。
4. 历史与孤立入口清单：只记录，不删除、不移动、不改路由。
5. 运行证据标签规则：`confirmed`、`static-only`、`runtime-unverified`、`unreachable` 分开记录。

### 3.4 Wave 0 退出门

- 每个正式页面族的 canonical route、主 Floorplan 和主任务无冲突；
- Workspace Selector、Auth Shell、System State 与业务页面边界明确；
- 退役/历史/QA 入口不再被误称为正式页面；
- 代表模板和不变业务合同获得产品评审；
- 仍无 `src/`、数据库、配置、权限、migration 或部署差异。

## 4. Wave 1：页面级组合层设计

Wave 1 定义并实现页面级组合层的最小合同。所有组合层都必须使用现有 UI Foundation 与 `globals.css` Token；组合层不能读取或决定领域数据、权限、租户或输出资格。

### 4.1 `PageFrame`

职责：承载单个页面的内容编排、页面级宽度约束和页内组合层。RootLayout/AppNav 才是全局导航、当前工作区身份、全局反馈和用户菜单的权威；PageFrame 不得重复实现全局壳。

合同：

- 桌面、平板、手机保持页面身份和返回路径可见；
- 不把案件状态、模板状态、权限结果或输出资格放入全局壳；
- 不在页面内复制 RootLayout/AppNav 的工作区栏、侧栏和全局反馈；
- 只接收页内结构插槽和当前上下文显示值，不拥有业务数据来源。

### 4.2 `DynamicPageHeader`

职责：承载页面/对象身份、关键状态和一个明确页面级主路径。

合同：

- 展开态与压缩态都保留对象身份、当前上下文和必要操作；
- 页面级主操作只出现一次，不与固定底栏重复；
- 行级、字段级、局部错误处理不塞入 Header；
- Header 高度变化必须参与锚点偏移、焦点滚动和返回上下文。

### 4.3 `ListReportShell` 与 `WorklistShell`

两者必须是不同变体，不能用一个万能列表容器抹平任务差异。

`ListReportShell`：标题/主要动作、Filter Bar、结果计数、表格或响应式卡片、行级操作；筛选可读可清除，空结果与系统错误分开。

`WorklistShell`：任务身份、紧凑状态摘要、筛选/排序、第一项可操作任务、阻塞原因、下一步和返回路径；不虚构 KPI，批量动作不抢占单项任务。

共同合同：

- 窄屏不依赖横向滚动完成主要查找与操作；
- 结果、空、加载、错误、权限拒绝状态有明确 State Surface；
- 不决定业务字段、权限和租户过滤，只呈现已授权的数据结果。

### 4.4 `ResponsiveFormShell`

在现有四个 Responsive Form primitive 之上定义页面级组合层，不复制第二套编辑器。

合同：

- 宽屏/平板/窄屏分别采用可读的三/二/一列候选结构；
- 字段组、错误摘要、保存/取消/返回、局部反馈、焦点恢复具有稳定插槽；
- 允许领域字段组件通过 slot 注入，但不允许领域组件重建页面级 Header、Action Bar 或 State Surface；
- 保存失败保留输入、错误和返回上下文；
- 业务字段、验证、Action、权限和数据来源保持领域组件原合同。

### 4.5 `ObjectPageShell` 与 `SectionNav`

职责：承载复杂对象的身份、章节、锚点、当前章节和局部编辑。

合同：

- 章节有真实 heading、可定位 anchor 和可感知当前状态；
- 章节导航不成为第二套对象详情权威；
- 页面级操作与章节/字段级操作分层；
- 保存、取消、关闭后回到触发位置并保留当前上下文。

### 4.6 `ActionBar`

职责：表达页面级或局部操作层级，不承载业务判断。

合同：

- 一个主要动作，其余为次要或溢出动作；
- 桌面固定底栏、窄屏底栏和 Header 不重复同一提交动作；
- 固定区域不得遮挡错误摘要、最后字段或最后一项结果；
- disabled、loading、错误恢复和键盘焦点必须有可验证状态。

### 4.7 `StateSurface`

职责：统一表达 loading、empty、error、permission denied、not found 和正常状态边界。

合同：

- loading 不伪装为空；
- empty 说明原因并提供下一步；
- error 区分网络、权限、业务校验和资源不存在；
- permission denied 不泄露对象存在性或跨租户信息；
- locale 由 Broker Desk 自身语言设置决定，禁止硬编码单一语言；
- 404 作为首个最小实现切片候选，先补三语/安全恢复合同，再做真实页面抽验。

## 5. 四个代表模板

### 5.1 Workspace Selector：`/workspace`

验证问题：用户是否知道自己正在选择什么、可进入哪些工作区、失败后如何恢复。

必须设计：身份标题、可访问工作区列表、空态、切换失败、返回/重试和窄屏结构；当前工作区身份在进入后由 RootLayout/AppNav 统一显示，PageFrame 只组织选择页内容。

禁止：把案件任务队列、租户数据权威或权限推断塞进 Workspace Selector。

### 5.2 List Report：`/organize-center`

验证问题：用户是否能找到案件/主体/物件并进入后续处理，而不会把对象列表和详情编辑混成一页。

必须设计：标题与主路径、Filter Bar、结果计数、对象类型切换、结果行/卡片、空结果、系统错误、局部异常和行级操作。

已知审计问题：重复说明文案必须在目标图中只保留一个解释层级；案件、主体、物件继续保持独立权威。

### 5.3 Responsive Form/Object Page：`/cases/new` 与 `/cases/[id]`

产品裁决：`/cases/new` 作为首个 ResponsiveFormShell 主模板；`/cases/[id]` 作为紧随其后的 ObjectPageShell 对照/验证模板。

必须设计：同一 Shell、页面 Header、案件信息/关联区域、空/错误/保存中/失败恢复、单一主要提交动作、窄屏固定底栏、人物/物件层、焦点恢复和返回上下文。

不可改变：案件资料关联器已批准的草稿、权限、角色、主要物件、原子保存和历史输出合同。

### 5.4 Worklist：`/output-center`

验证问题：用户是否知道哪些案件可输出、哪些被阻断、下一步是什么。

必须设计：任务行、筛选、阻断原因、模板选择入口、空态、加载态、错误态和返回路径。

边界：输出产品专题与 TASK-020 仍独立阻塞；本模板只定义结构，不授权输出逻辑、案件确认、下载或 Production 行为。

## 6. 静态治理门设计

静态治理门只检查结构来源，不替代浏览器、权限、租户、数据和业务验收。

### 6.1 Route/Floorplan 门

- 每个正式页面声明 canonical route 与主 Floorplan；
- 退役、QA、历史和孤立入口不能进入正式页面清单；
- 页面级组合层只能由明确的 Layout System 目录提供。

### 6.2 组件来源门

- 页面不得本地复制 `PageFrame`、`DynamicPageHeader`、`ListReportShell`、`WorklistShell`、`ResponsiveFormShell`、`StateSurface` 或 `ActionBar`；
- 领域组件只能注入已定义 slot/variant；
- `src/components/ui-foundation/` 与 `src/app/globals.css` 是基础 Token 来源。

### 6.3 Token 门

- 禁止新增页面专属颜色、字体、圆角、阴影、焦点和状态 Token；
- 直接颜色、重复 rounded/shadow、固定宽度和局部底栏只允许有明确变体证据；
- 该门只报告偏差，不在 Wave 0/1 通过全局替换修复。

### 6.4 State/locale 门

- 页面必须声明 loading、empty、error、permission denied/not found 的状态覆盖；
- 用户可见文案必须来自自身 locale 映射；
- 禁止向用户暴露内部错误码、权限术语或服务端原始文本；
- 静态门不能冒充真实 locale 页面通过，必须另有浏览器证据。

### 6.5 Responsive/focus 门

- 设计目标必须覆盖桌面、平板和 390px 窄屏；
- 记录固定底栏、抽屉/全屏层、焦点进入、关闭/Escape/取消后的恢复位置；
- 静态门只检查是否存在结构与声明，实际行为仍需浏览器复验。

## 7. Wave 1 设计评审门

产品评审前必须同时提供：

1. 四个代表模板的桌面、平板、390px 目标图或等价结构说明；
2. 同一 Shell 承载四种 Floorplan 的组合关系；
3. Header 压缩态、主操作、Action Bar 和窄屏底栏的唯一动作规则；
4. 正常、空、加载、错误、权限拒绝、Not Found 的状态矩阵；
5. 中日韩长文案样本的换行、按钮和错误摘要规则；
6. 键盘焦点进入、关闭、取消、保存失败恢复和返回路径说明；
7. 组件/Token/route 静态治理门的可执行输入输出；
8. 业务不变清单：字段、权限、租户、数据来源、Action、保存、输出和历史资料；
9. 404 最小切片的范围、非范围、三语文案来源和回滚边界。

评审结论只能是：批准进入实现、要求修订或保持阻断。未获得批准前，不修改 `src/`。

## 8. 风险、未决事项与停止条件

### 风险

- 如果直接逐页修补，页面级结构会继续分叉，后续迁移成本和回归面都会扩大；
- 如果把 SAP 参考误写成 SAPUI5 实施要求，会引入不适用的复杂工具栏和企业配置层级；
- 如果把 Layout 组合层做成业务万能容器，会污染权限、租户、字段和输出边界；
- 如果只通过静态门而不补真实浏览器证据，会重复当前“规范已符合但运行 locale 混用”的治理错误。

### 仍需产品评审的事项

1. 四类代表模板的视觉目标是否准确表达既有 Layout System，同时不改变业务合同；
2. Dynamic Page Header 压缩态保留哪些操作；
3. `/output-center` 是否只做结构目标图，直到 TASK-020 输出门禁解除；
4. 页面级 Layout System 未执行化是否在实现前作为正式 P1 门；
5. 404 修复是否作为本专题首个最小实现切片进入实现授权。

### 停止条件

- 发现需要改业务数据、权限、租户、数据库、migration、Production 或 workflow；
- 需要新增第二套 Token 或领域编辑系统；
- canonical route 与历史/退役入口无法在不改运行代码的情况下区分；
- 目标图无法表达中日韩、空/错误/加载、焦点或返回路径；
- 需要把未取得的 runtime 证据写成已验证。

## 9. 本计划的状态与后续动作

当前状态：`Wave 1 First Slice In Implementation / Browser Acceptance Pending / Production Not Authorized`。

本轮只保留一份计划和 TASK-042 单一实施任务；第一切片已在隔离 worktree 实现页面级组合层、`/cases/new` 模板与 404 最小切片。实现写集仍受本计划、任务卡、独立只读复核和工程门约束，后续页面迁移不自动获授权。

## 10. 四类代表模板视觉目标

本节不是新设计稿，也不是生产页面截图。它把现有规范、Token 和本轮真实截图转成可评审的结构目标。截图只证明当前状态，不把当前偏差当作目标。

### 10.1 Workspace Selector：`/workspace`

现状证据：`/private/tmp/broker-desk-uiux-audit-20260826/02-workspace-desktop.png`、`10-workspace-mobile.png`。

视觉目标：

- 页面保持稳定的 PageFrame 语义，但内容区只表达“选择可访问工作区”这一件事；
- 桌面使用单一主卡/内容面板，标题、说明、工作区列表和失败恢复按明确垂直节奏排列；
- 手机保持同一阅读顺序，不把桌面卡片压缩成难以扫描的横向结构；
- 当前工作区名称、工作区切换反馈和返回路径由 RootLayout/AppNav 统一承载，不由 PageFrame 或各业务页面重复实现；
- 工作区按钮使用统一控件高度、焦点环和状态，不出现重复的工作区身份或任务摘要；
- 长日文、中文、韩文名称允许换行，不截断为不可辨认的短标签。

不变边界：不改变工作区成员关系、可访问范围、租户选择逻辑或认证语义。

### 10.2 List Report：`/organize-center`

现状证据：`/private/tmp/broker-desk-uiux-audit-20260826/03-organize-desktop.png`、`11-organize-mobile.png`、`21-case-list-desktop.png`。

视觉目标：

- 页面 Header 只保留页面身份与一个清晰的进入/创建主路径；
- `整理する対象を選択` 与解释文案只出现一个说明层级，不重复占用首屏垂直空间；
- Filter Bar、对象类型选择、结果计数、结果行/卡片和行级操作按固定顺序出现；
- 案件、人物、物件仍是三个独立对象入口，不在列表层合并领域权威；
- 桌面优先表格/宽卡片扫描，窄屏转换为可读行卡片，主要查找和打开操作不依赖横向滚动；
- 空结果、无权限、系统错误和加载分别使用 StateSurface，不用一个“没有资料”文案覆盖所有情况。

不变边界：不改变列表字段来源、筛选语义、分页、归档/保管动作、权限或租户隔离。

### 10.3 Responsive Form 主模板：`/cases/new`

现状证据：`/private/tmp/broker-desk-uiux-audit-20260826/04-case-new-desktop.png`、`12-case-new-mobile.png`、`19-case-person-selector-desktop.png`、`20-case-person-selector-mobile.png`。

视觉目标：

- 页面采用统一 PageFrame → Page Header → Form Body → Draft/Association Sections → ActionBar 层级；
- 案件基本信息、人物草稿、主要物件草稿和错误反馈使用明确 Section，不把草稿状态伪装成已落库关联；
- 桌面使用可读的两列候选结构，平板重排，390px 使用单列和单一底部“创建案件”主动作；
- 选择层在桌面使用抽屉、窄屏使用全屏层；打开后焦点进入，关闭按钮/Escape/取消后回到原触发控件；
- 快速创建入口、成功反馈、草稿计数、空状态、保存失败和恢复动作在同一垂直流程中可理解；
- 固定底栏不遮挡错误摘要、最后字段或最后一张资料卡；
- 业务文案由 Broker Desk locale 提供，内部权限术语和错误码不可见。

不变边界：不改变案件草稿会话、七种角色、主要申请人唯一、主要物件、快速创建保留、一次性保存、权限候选和失败原子性合同。

### 10.4 Object Page 对照模板：`/cases/[id]`

现状证据：`/private/tmp/broker-desk-uiux-audit-20260826/01-case-detail-desktop.png`、`22-person-detail-desktop.png`。

视觉目标：

- DynamicPageHeader 始终显示案件身份、关键状态和页面级主路径；压缩后仍可识别当前案件；
- 案件信息、人物关联、主要物件、输出入口和其他章节按稳定 Section/SectionNav 组织；
- 关联编辑是局部操作，不复制整套新建案件表单或第二个案件详情权威；
- 章节锚点、返回、刷新、保存反馈和错误恢复保留当前上下文；
- 局部人物/物件编辑沿用统一 FocusDialog/ResponsiveFormShell 规则；
- 桌面对象工作区可使用右侧局部编辑，窄屏转为全屏层，不让固定操作栏遮挡内容。

不变边界：不改变案件字段、关联关系、角色合同、历史 PDF、输出门禁、权限和租户边界；TASK-020 继续独立处理输出闭环。

### 10.5 Worklist 结构目标：`/output-center`

现状证据：`/private/tmp/broker-desk-uiux-audit-20260826/09-output-desktop.png`、`18-output-mobile-after-wait.png`、`26-output-desktop-loaded.png`。

视觉目标：

- 页面先说明“要处理哪些输出任务”，再显示筛选、任务行和下一步；
- 未选择文档时右侧/下方必须有明确的空状态与下一步，不保留无法解释的大面积空白；
- 加载、无任务、无权限、被业务条件阻断和系统错误分别表达；
- 桌面可保留任务列表与详情/选择区域，窄屏按任务优先级顺序堆叠；
- 文档选择、阻断原因和返回案件路径可被键盘和焦点感知；
- 本目标只定义 Worklist 的结构与状态，不定义输出资格、下载、案件确认或模板业务逻辑。

不变边界：`/output-center` 只做结构目标图，TASK-020 和输出产品专题未解除前不进入业务实现。

## 11. 四类代表模板状态矩阵

下表是设计覆盖矩阵，不代表本轮已取得每个状态的 runtime 证据。`目标` 表示必须设计；`已有证据` 表示本轮截图或行为已观察；`待验证` 表示实现/验收阶段仍需真实浏览器证据。

| 页面模板 | 正常数据/内容 | 空状态 | 加载状态 | 错误/恢复 | 权限/Not Found | 焦点/窄屏 | 当前证据边界 |
|---|---|---|---|---|---|---|---|
| `/workspace` Workspace Selector | 工作区列表、当前选择路径 | 无可访问工作区，说明原因与返回/重试 | 保留页面身份，避免跳变 | 切换失败、重试或返回 | 不泄露不可访问工作区；系统状态统一 locale | 390px 单列；按钮焦点可见 | 桌面/窄屏视觉已采集；完整键盘和失败态待验证 |
| `/organize-center` List Report | Filter Bar、结果计数、案件/人物/物件结果 | 无匹配结果与下一步 | 保留标题和筛选上下文 | 加载失败与可恢复动作 | 权限拒绝与不存在资源分开 | 窄屏卡片/行不横向滚动 | 桌面/窄屏视觉已采集；错误/权限态待验证 |
| `/cases/new` Responsive Form | 案件字段、草稿资料、单一创建动作 | 无人物/无主要物件仍说明草稿语义 | 保存中不丢输入和上下文 | 字段错误、关联错误、失败恢复 | 候选只显示可关联资料；系统状态统一 locale | 抽屉/全屏层焦点锁定、关闭/Escape/取消恢复；底栏不遮挡 | 桌面/窄屏与选择层焦点抽样已通过；提交失败态需补证 |
| `/cases/[id]` Object Page | 案件身份、Section、关联和局部操作 | 缺少主要申请人/物件的业务提示 | 局部加载不清空对象身份 | 保存失败、局部错误与返回上下文 | 不泄露跨租户对象；系统状态统一 locale | Header 压缩、锚点、局部编辑焦点恢复 | 桌面详情与焦点路径有证据；完整状态/窄屏待验证 |
| `/output-center` Worklist | 输出任务行、筛选、阻断原因、下一步 | 未选择文档/无任务必须解释下一步 | 页面身份与筛选保留 | 输出业务错误与可恢复动作分层 | 权限/不存在/业务不满足分开 | 列表与选择区重排，底栏不挡内容 | 加载后内容和窄屏已采集；错误/权限/真实输出逻辑不在本轮 |

## 12. 视觉目标评审门

产品评审本轮新增必须确认：

1. 四类模板是否共享同一 PageFrame、Header、StateSurface 和 ActionBar，但保留各自 Floorplan 任务差异；
2. `/cases/new` 是否按 ResponsiveFormShell 主模板进入后续实现设计；
3. `/cases/[id]` 是否按 ObjectPageShell 对照模板紧随验证，而不是与新建页合并为一个编辑系统；
4. `/output-center` 是否接受“仅结构目标图、不进入 TASK-020 业务逻辑”的边界；
5. 390px 底部主动作、抽屉/全屏层焦点、错误摘要和最后字段无遮挡是否满足目标；
6. 404 locale P1 是否授权为独立最小实现切片，且不触发 `error.tsx`/`global-error.tsx` 的未验证重构；
7. Figma 是否作为评审载体。当前未创建 Figma 文件、未导入截图，等待产品负责人明确回复。

联合方向已定，第一切片已获正式实现授权；在独立只读复核、正式工程门和受控 Staging 回归完成前，状态保持 `Browser Acceptance Pending`，不得宣称页面升级已通过产品验收。通过后也只允许经过明确范围审查的单一实现切片，不自动授权全站迁移。

## 13. Wave Resume：二维信息架构与入口边界

产品裁决：Broker Desk 的信息架构不是“对象列表 + 导入方式”的单轴菜单，而是两个正交维度：

```text
                         录入方式
              手动              文件读取              批量
工作对象
案件          新建/编辑案件     文件归属案件           批量案件台账
人物          主资料表单        文件待归属/识别         批量人物台账
物件          主资料表单        文件待归属/识别         批量物件台账

独立 Intake：文件先到、待归属、异步识别、批量台账、未归属资料收件箱
```

规则：

- 首页表达工作阶段和任务入口，不把案件、人物、物件与手动/文件/批量做成同一层的扁平卡片集合；
- 信息输入页明确分成“从业务对象开始”和“从收到的资料开始”，但保留独立 Intake 的收件箱、异步识别和批量处理路径；
- 信息整理是全局资料库管理，负责查找和进入对象，不替代 Intake，也不承载新建案件的局部草稿；
- `/cases/new` 只组装当前案件草稿：案件自身字段可直接编辑，人物/物件可选择已有主资料，也可复用正式人物/物件表单快速创建后加入当前草稿；
- `/cases/[id]` 只管理已创建案件及其关联和案件资料工作台；人物/物件详情继续维护独立主资料；
- 未归属资料收件箱是 Intake 的正当状态，不应被压平成“案件/人物/物件”中的第四种对象。

## 14. 四个入口的目标关系、职责与返回路径

| 入口 | 用户问题 | 允许承载 | 明确禁止 | 主要进入/返回路径 |
|---|---|---|---|---|
| 首页/工作区入口 `/workspace` | 我现在处于哪个工作阶段，下一步从哪里开始？ | 工作阶段、任务入口、当前工作区身份 | 对象列表、导入收件箱细节、案件草稿、跨流程数据编辑 | 工作区选择 → 首页/阶段入口；回到当前工作区上下文 |
| 信息输入 `/import-center` | 我从对象开始录入，还是从收到的资料开始？ | “从业务对象开始”入口、独立 Intake 收件箱、待归属、异步识别、批量台账 | 把文件处理对象冒充案件/人物/物件；案件关系编辑；全局对象详情维护 | 首页 → 信息输入；Intake 处理后进入目标对象或案件；无归属时回收件箱 |
| 信息整理 `/organize-center` | 我要查找哪个已存在的案件、人物或物件？ | 对象类型、关键字、生命周期、结果、分页、进入详情 | Intake 队列、当前案件草稿、角色/主要物件编辑、完整主资料创建合同 | 首页/信息阶段 → 信息整理 → `/cases/[id]`、`/parties/[id]/edit`、`/properties/[id]/edit`；详情返回原列表和焦点 |
| `/cases/new` | 我要创建这一件案件，并暂存它的资料关系 | 案件自身字段、当前会话草稿、已有主资料选择、正式表单快速创建、角色/主要物件草稿、一次创建案件 | 全局对象搜索/筛选、跨案件问题队列、主资料完整维护、归档/删除、证据历史、批量处理 | `/organize-center?type=case` 或 `/import-center?from=entry` 进入；取消返回来源；成功进入 `/cases/[id]` |
| `/cases/[id]` | 这件已创建案件现在的资料和关联是什么？ | 案件资料工作台、人物角色、主要物件、关联保存、局部案件操作 | 新建页草稿权威、全局对象中心、批量导入、主资料完整编辑的复制品 | 信息整理/新建保存进入；保存后保留案件、章节和焦点上下文 |
| 人物/物件详情 | 我要维护这一份独立主资料 | 主资料字段、对象自身状态、关系查看、按权限编辑 | 案件草稿、案件角色选择、主要物件唯一性、案件原子保存 | 信息整理进入；返回原列表或合法的 `returnTo` 来源 |

### 14.1 共享组件与不共享状态

可以共享的结构层：`PageFrame`、`DynamicPageHeader`、`StateSurface`、`ActionBar`、`ResponsiveFormShell`、`FocusDialog`、locale 映射、焦点恢复和权限候选解析。

不得共享为同一个领域权威的状态：

- `/organize-center` 的全局列表筛选状态；
- `/cases/new` 的当前页面会话草稿；
- `/cases/[id]` 的已持久化案件资料和关联草稿；
- 人物/物件详情的独立主资料编辑状态；
- Intake 的文件任务、未归属状态和异步识别状态。

## 15. 四入口关键状态矩阵

| 入口 | 正常 | 空 | 加载 | 错误/恢复 | 权限与边界 |
|---|---|---|---|---|---|
| 首页/工作区 | 工作阶段和入口清楚 | 无可访问工作区或无可用任务，说明返回/重试 | 保留页面身份，不跳成空白 | 工作区切换失败，可重试/返回 | 不泄露不可访问工作区，不展示对象数据 |
| 信息输入/Intake | 对象起点与资料起点分开，收件箱可处理 | 无待归属资料，说明如何从对象开始或等待资料 | 保留收件箱与任务身份 | 识别/归属失败，保留任务并提供重试或人工处理 | 不把未归属资料伪装为已关联对象 |
| 信息整理 | 对象类型、筛选、计数、结果和下一步 | 无对象/无结果分别说明原因和下一步 | 保留标题与筛选上下文 | 查询失败可重试，不显示服务端细节 | 只显示当前用户可读对象；详情权限单独生效 |
| `/cases/new` | 案件字段、当前草稿、一个创建动作 | 人物/物件为空仍明确是草稿，不暗示已落库 | 快速创建/候选读取/保存中不清空草稿 | 字段/关联/保存失败保留输入、草稿和恢复动作 | 候选只来自可使用主资料；独立新建主资料在取消案件后保留 |
| `/cases/[id]` | 案件身份、关联、资料章节和局部操作 | 缺少主要申请人/主要物件给出案件级提示 | 局部加载不清空案件身份 | 关联保存失败保留未提交修改并可重试 | 只允许案件当前权限范围内的编辑和关联 |
| 人物/物件详情 | 单一主资料字段和对象状态 | 无资料/无关系与对象不存在分开 | 保留对象身份和返回路径 | 保存失败保留字段并可恢复 | 只读对象隐藏编辑入口，禁止越权写入 |

## 16. 合并视觉方向与隔离原型边界

本轮视觉方向以 `Case Thread` 为主体，只吸收 `Draft Workbench` 的当前案件草稿摘要，不吸收全局队列语义；不采用 `Quiet Sections` 的章节向导语义。

合并方向必须表达：

- 桌面 1440×1024：稳定左侧导航、Page Header、案件自身字段、案件草稿双区、当前草稿摘要、选择/快速创建入口、一个页面级创建动作；
- 窄屏 390×844：单列重排、当前草稿摘要可收起、抽屉转全屏层、底部唯一“创建案件”动作，顶部不重复保存；
- 摘要只显示当前页面会话的人物数量、角色摘要、主要物件和案件必填字段缺失，不显示跨案件统计、全部草稿、未解决条件队列、生命周期或最近对象；七种角色是可分配的角色种类，不是人物数量上限；
- 案件缺少主要申请人或主要物件仍可创建，只影响后续保证申请输出资格；原型不得把缺失状态画成创建阻断；
- 快速创建后的正式主资料独立保留，案件草稿只保证当前页面会话，不暗示自动保存或跨刷新恢复；
- 返回动作必须明确来源：返回信息输入或返回案件列表，不使用“上一页”；
- 关联区最多一个主 Surface，人物/物件使用轻分区或分隔线；全页大 Surface 最多两层，不使用卡片套卡片堆叠；
- 响应式目标必须同时表达 1440px、768px 和 390px：≥1024 案件字段与关联区可二列，768–1023 字段二列但关联区单列，<768 全部单列；
- 首页与信息输入至少显示“工作阶段 → 业务对象/收到的资料 → 案件创建”的层级，但不把 Intake 或信息整理队列复制进案件页；
- 状态覆盖正常、空、加载、错误/保留输入、权限拒绝；权限状态使用产品语言，不显示内部权限名或错误码；
- 快速创建复用正式人物/物件表单，返回后恢复当前草稿；最终保存仍由案件 Action 一次性完成；
- Intake 入口、信息整理入口和案件新建入口保持不同的进入/返回语义，不在 `/cases/new` 内重建 Intake 或信息整理。

隔离原型只用于评审结构和交互路径：无真实认证、无数据库、无持久化、无 Action 调用、无生产部署。原型文案仅作布局示意，正式实现必须重新接入现有 locale 合同。

## 17. 本轮设计退出门

- 唯一 Wave 0/1 计划已包含二维信息架构、四入口关系图、职责/禁止项、返回路径和状态矩阵；
- 合并方向没有把 Intake、信息整理或案件详情工作台复制到 `/cases/new`；
- 隔离原型可在 1440/768/390px 目标宽度下演示正常、空、加载、错误、权限状态，并包含桌面抽屉与窄屏全屏层的焦点路径；
- 原型不修改正式 `src/`、数据库、权限、migration、Production 或验收候选；
- 产品负责人评审前，不把视觉稿或原型当作实现授权，也不创建实现任务。

## 19. 联合方向收口与修订视觉目标（2026-08-27）

产品负责人和独立 UI/UX 审查已完成联合裁决，本节覆盖本文件此前关于方向选择的未决描述。最终方向是 `Case Thread` 的结构主干，吸收 `Draft Workbench` 仅限当前页面会话的 Draft Summary，以及 `Quiet Sections` 的低装饰、轻分隔；不采用全局工作台/问题队列语义，也不采用章节向导或 1-2-3 步骤语义。

### 19.1 四入口的最低目标层级

```text
工作区首页：工作阶段 → 下一步入口
信息输入页：业务对象（案件/人物/物件）或收到的资料（Intake/未归属收件箱）→ 录入方式 → 目标流程
信息整理：全局已存在资料的查找与进入详情
案件新建：案件自身字段 → 当前页面会话案件草稿 → 创建案件
```

- `/workspace` 只表达阶段、工作区身份和任务入口；不承载对象列表、Intake 队列细节或案件草稿。
- `/import-center` 明确区分“从业务对象开始”和“从收到的资料开始”，保留文件先到、待归属、异步识别、批量台账与未归属资料收件箱。
- `/organize-center` 只负责全局人物/物件/案件查找和进入详情；不承载案件草稿、角色编辑或 Intake 队列。
- `/cases/new` 只组装当前案件草稿，允许直接编辑案件字段、选择已有主资料和复用正式人物/物件表单快速创建；不复制完整主资料管理。

### 19.2 统一视觉目标

| 区域 | 目标结构 | 状态与边界 |
|---|---|---|
| `/workspace` | 页面级内容编排与标题；工作阶段入口；当前工作区身份由 RootLayout/AppNav 提供 | 正常、无可访问工作区、切换失败、窄屏单列；不展示对象数据 |
| `/import-center` | “从业务对象开始”与“从收到的资料开始”两个明确入口；Intake 收件箱/待归属/异步识别/批量台账 | 空收件箱、加载、识别失败、无权限；不把资料任务冒充为对象详情 |
| `/cases/new` 1440 | Page Header → 案件字段与当前案件草稿；案件字段/关联区可二列；关联区一个主 Surface | 正常、空人物/空物件、加载、错误/保留输入、权限；缺少主要申请人/物件不阻断创建 |
| `/cases/new` 768 | Page Header 保留；案件字段二列；关联区单列；案件草稿标题、说明、摘要垂直排列，摘要全宽放在说明下方 | 长 CJK 可换行；返回信息输入/案件列表保持单行；选择层仍为桌面抽屉；主操作唯一 |
| `/cases/new` 390 | 全部单列；草稿摘要可收起；选择层全屏；底部约 64px 安全区 | 顶部不重复保存；底栏不遮错误摘要/最后字段；关闭/Escape/取消恢复焦点 |
| `/cases/[id]` | ObjectPageHeader/Section；已创建案件的关联管理；局部编辑 | 缺少主要申请人/物件只提示后续输出条件；不复制新建页草稿权威 |

视觉基线固定为冷静、可信、精密的业务操作台：保留深海军蓝 Shell、灰白表面、单一靛蓝强调和现有 CJK 字体栈；禁止金色、青绿色换色、渐变、玻璃拟态、装饰性阴影、Cinzel/Josefin 和仿 SAP 品牌皮肤。标题 28/700、Section 18–20/700、字段标签 14/600、正文 14–16、手机输入值至少 16；gutter 为 ≥1024/32px、768–1023/24px、<768/16px；Section 间距 24、组间 16、字段 12–16；大 Surface 12px、控件 8px；移动触控目标至少 44px。

### 19.3 原型退出门

- 原型只验证结构、响应式、状态、焦点和文案长度，不连接认证、数据库或 Action，不写入真实数据。
- 人物显示真实数量，并另行说明“可分配七种案件角色”；不出现人物数量上限。
- 草稿文案明确“当前页面会话”，不出现自动保存、跨刷新保留或全局队列暗示；快速创建反馈明确正式主资料独立保留。
- 选择已有资料、快速创建、空/加载/错误/权限状态均使用产品语言；不显示内部权限术语或错误码。
- 原型自检与独立只读复核达到 P0/P1=0、工程门通过后，才可进入正式组合层实现；404 locale 仍作为独立最小切片，不与组合层重构混做。

### 19.4 原型 P1 收口要求（2026-08-27）

- 页面内 empty/loading 必须保留 PageFrame、页面标题、案件字段和案件草稿身份；状态面只替换关联候选区域，不得让页面文案声称“仍可填写”却移除案件输入。路由级 permission/not-found 在渲染前 fail-closed，不显示案件字段或草稿，由真实路由边界处理。
- 768px 关联区保持单列；案件草稿标题、说明、摘要按垂直顺序全宽排列；返回信息输入/案件列表动作保持单行；ActionBar 采用不遮挡说明和状态的流内布局。
- 390px 维持单列和唯一底部“创建案件”动作；正文预留底栏安全空间；所有产品交互控件高度至少 44px，表单输入文字至少 16px，CJK 文案可自然换行。
- 390px 证据必须使用真实设备模拟，记录 `innerWidth`、`clientWidth`、`scrollWidth`、底栏与最后状态的几何关系；旧的固定 300/500px 诊断视口不作为证据。
- 案件人物/物件的四个次级操作保持至少 14px/600、44px 控件高度；语言切换等辅助工具可使用紧凑标签，但不得降低主要产品操作的可读性。
- 提交错误必须紧邻 Page Header 或案件信息区、使用 `role=alert` 且可聚焦；失败提交后焦点与滚动位置必须将错误摘要带入可见区域，同时保留案件字段和会话草稿。
- 人物角色选择项每项至少 44px 触控高度；最终原型证据须补齐 zh/ko 在 390px 与 768px 的最长文案换行与无溢出检查。
- 390px 抽屉/全屏层必须采用 Header（不滚动）→ Body（`min-height:0; overflow-y:auto`）→ Footer（固定可见并计入 safe-area）三段式；首屏与滚动到底部均须证明 footer、最后角色和键盘焦点可达。

## 18. 联合设计评审集中索引

本节是本专题唯一的评审索引，不创建平行设计文档。源图和截图保留在临时目录；本计划只记录路径、用途和证据边界。

### 18.1 三方向源图

| 方向 | 文件 | 设计差异 | 当前判断 |
|---|---|---|---|
| Case Thread | `/Users/laineyzhu/.codex/generated_images/01a03945-2c55-7ea2-ad61-4d7359a243a7/exec-a183becf-8001-4ce8-b5d7-2d2ce0bfadaa.png` | Page Header + 案件信息/案件草稿双区；当前案件范围摘要；桌面双栏、窄屏单列 | 最终结构主体，最贴近现有 `/cases/new` 与批准合同 |
| Draft Workbench | `/Users/laineyzhu/.codex/generated_images/01a03945-2c55-7ea2-ad61-4d7359a243a7/exec-d09faab8-5d7b-4601-b885-98210cfe40bb.png` | 草稿摘要栏、当前选择状态、回到草稿的工作台感 | 只可吸收当前案件摘要；不得吸收全局队列、跨案件计数或问题中心 |
| Quiet Sections | `/Users/laineyzhu/.codex/generated_images/01a03945-2c55-7ea2-ad61-4d7359a243a7/exec-60d39239-c5e7-4dee-87ae-544b81f70a36.png` | 安静分区、章节索引、长表单定位 | 暂不采用章节向导语义；若保留索引，必须证明只是当前表单定位 |

源图中的微文案仅用于层级、密度和中日韩换行示意，不是最终产品文案，也不能替代真实页面验收。

### 18.2 本轮真实截图

| 用途 | 桌面 | 窄屏 |
|---|---|---|
| `/cases/new` 起始页 | `/private/tmp/broker-desk-uiux-audit-20260826/04-case-new-desktop.png` | `/private/tmp/broker-desk-uiux-audit-20260826/12-case-new-mobile.png` |
| 人物选择层 | `/private/tmp/broker-desk-uiux-audit-20260826/19-case-person-selector-desktop.png` | `/private/tmp/broker-desk-uiux-audit-20260826/20-case-person-selector-mobile.png` |
| 页面族对照 | `/private/tmp/broker-desk-uiux-audit-20260826/01-case-detail-desktop.png`、`03-organize-desktop.png`、`02-workspace-desktop.png` | `10-workspace-mobile.png`、`11-organize-mobile.png` |
| 其他页面族 | `06-properties-desktop.png`、`07-members-desktop.png`、`08-templates-desktop.png`、`09-output-desktop.png` | `14-properties-mobile.png`、`15-members-mobile.png`、`16-templates-mobile.png`、`17-output-mobile.png` |

截图证明的是本轮真实观察到的当前实现状态；未覆盖的错误、权限、完整键盘、屏幕阅读器、200% 缩放和全部 locale 状态继续标记为待验证。

### 18.3 Tokens 与根组件

- 活动 Layout 规范：`docs/product/BROKER_DESK_LAYOUT_SYSTEM_V1.md`；不采用 SAP 品牌皮肤、SAPUI5 或 Fiori Elements。
- Wave 计划与 IA：本文件第 13–17 节；二维模型、四入口边界和案件草稿范围以此为准。
- 现有基础 Token：`src/app/globals.css` 的 `--bd-*` 颜色、间距、圆角、阴影、控件高度、断点、焦点环和 CJK 字体栈。
- 现有基础组件：`src/components/ui-foundation/`；已有 `Surface`、`SectionHeader`、`MessageStrip`、按钮/输入基础和状态样式。
- 现有表单基础：`src/components/layout-system/index.tsx` 的 `ResponsiveFormLayout`、`ResponsiveFormRow`、`ResponsiveFormField`、`ResponsiveFormEditorSlot`。
- 现有领域合同组件：`src/components/case-association-draft.tsx`、`src/components/case-association-manager.tsx`、`src/components/client-form.tsx`、`src/components/property-responsive-form.tsx`。
- 页面级组合层已在 TASK-042 第一切片中执行化：`PageFrame`、`PageHeader`、`ResponsiveFormShell`、`FormSection`、`StateSurface` 和统一 `ActionBar`；后续页面模板仍须按本计划的静态来源门、独立复核和真实浏览器证据逐波进入。

### 18.4 页面族边界速查

| 页面族 | 权威职责 | 不得复制的职责 |
|---|---|---|
| 首页/工作区 | 工作阶段、任务入口、当前工作区身份 | 对象列表、Intake 队列、案件草稿 |
| 信息输入/Intake | 从业务对象开始、从收到资料开始、未归属收件箱、异步识别、批量台账 | 把资料任务伪装成对象详情或案件关联 |
| 信息整理 | 全局案件/人物/物件查找、筛选、分页、进入详情 | 新建页草稿、案件角色、主要物件、Intake 处理 |
| `/cases/new` | 当前案件字段和会话内案件草稿装配，最终一次创建 | 全局问题队列、完整主资料管理、跨案件筛选 |
| `/cases/[id]` | 已创建案件工作台、人物角色、主要物件、关联保存 | 新建页本地草稿权威、全局对象中心 |
| 人物/物件详情 | 独立主资料字段和自身状态维护 | 案件草稿、案件原子保存、案件角色唯一性 |

### 18.5 联合设计后的实现核对项

1. Draft Summary 固定放在案件草稿 Section 顶部或可收起的当前会话摘要内，不形成第二个 Header。
2. 摘要只显示人物数量、角色摘要、主要物件和案件必填字段缺失；七种角色不是人物上限，也不形成全局队列。
3. 窄屏摘要可收起，但底部唯一“创建案件”主动作必须始终可操作且不遮挡内容。
4. 桌面人物/物件选择层继续使用抽屉，窄屏使用全屏层；焦点进入、关闭、Escape、取消和触发控件消失兜底保持既有合同。
5. “从业务对象开始”与“从收到的资料开始”按二维信息架构分组，不在同一层扁平化为对象类型。
6. 页面级组合层的正式命名、插槽和静态来源门已作为 TASK-042 实现输入；后续扩展必须先更新本计划，不在页面内复制组合层。
7. Figma 不是本轮实现前置条件；如继续作为评审载体，必须使用真实截图和本计划目标，不把本地技能文件误报为已创建或可编辑的 Figma 文件。

### 18.6 当前实施限制

- 当前已授权进入 TASK-042 的隔离正式实现；实现仅限本计划与任务卡明确的 Wave 1 第一切片，不扩大业务范围。
- 不修改数据库、migration、权限或 Production；不合并 main、不部署 Production、不执行 Production migration。
- 不创建新的设计文档、页面任务、实现任务或重复原型方向；沿用本计划与 TASK-042 作为唯一治理来源。
- 在独立只读代码复核、正式工程门和受控 Staging 回归完成前，不得宣称页面升级已通过产品验收或可发布。
