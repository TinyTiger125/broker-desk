# TASK-022 / UI-GOV-002A：最小视觉基础

- 状态: Done
- UI-GOV 编号: UI-GOV-002A
- 优先级: P0
- 负责人: 技术项目经理 / 实现 Agent / 独立审查 Agent
- 依赖关系: UI-GOV-001 / TASK-021 已 Done；TASK-020 仍 Blocked，不能被本任务绕过

## 任务名称

建立 Broker Desk 唯一视觉 Token 和案件 Object Page 所需的最小基础组件，为后续 UI-GOV-003 统一快速补全与案件总览的视觉语言和编辑基础。

## 背景和用户结果

当前 `globals.css` 已有一组 Broker Desk 颜色变量和旧页面兼容规则，但缺少可供案件 Object Page 复用的明确基础组件契约。用户需要在后续页面改造中看到同一套按钮、字段、章节、异常、反馈和控件状态，而不是继续出现多个视觉语言和编辑基础。

## 设计方向

采用以现有 Broker Desk 中性色、深色文字和蓝色强调为基础的 Swiss-inspired 信息结构：细边界、明确层级、安静的正常状态、单一焦点轮廓；不引入 SAP 品牌色、SAPUI5 或新的品牌视觉。组件的差异化只体现在“正常字段安静、异常字段有语义、交互状态有可见焦点”，不通过渐变、装饰图形或大量阴影制造企业感。

## 用户和技术目标

- 后续案件 Object Page 可以使用同一套 Button、Field、Section、Message 和控件状态。
- 快速补全与案件总览未来可以共用基础组件，但本任务不修改两种模式的正式布局。
- 正常业务信息不被统一状态标签或 AI 过程信息污染；异常、错误和焦点清晰可见。
- 中文、日文、韩文长文本不因基础组件的固定宽度、单行截断或按钮最小宽度而失去含义。

## 本次范围

### 唯一 Token 来源

在现有 `src/app/globals.css` 的 `:root` / `@theme` 入口收敛或补齐：

- 品牌色与中性色；文字、背景、边框和语义色。
- CJK 兼容字体、字号、行高和字重。
- 4px 间距体系、圆角、阴影、层级、控件高度。
- 页面边距、内容最大宽度、响应式断点、z-index、焦点轮廓。
- 紧凑桌面和触控密度规则。

现有正式页面兼容规则可以保留，但不得新增第二个 Token 文件或另一套同义变量。Tailwind 主题值若继续保留，必须引用同一组 CSS 变量而不是重新硬编码同义颜色。

### 最小基础组件

只建立后续案件 Object Page 必需的组件及统一状态：

- `Button`
- `IconButton`
- `StatusBadge`
- `FieldLabel`
- `DisplayField`
- `IssueField`
- `SectionHeader`
- `Surface`
- `MessageStrip`
- `TextInput`、`SelectInput`、`DateInput`

组件必须使用真实产品语义示例，不得创建假业务数据或把开发预览伪装成正式页面。

非交互组件的状态边界：`StatusBadge`、`FieldLabel`、`DisplayField`、`SectionHeader`、`Surface`、`MessageStrip` 和 `IssueField` 不承担按钮式悬停、按下、禁用或加载交互；它们分别通过语义 tone、异常内容和可见文本表达状态。输入控件的加载不属于原生输入自身状态，由外层业务流程负责。`Button` 与 `IconButton` 覆盖交互状态，`StatusBadge`、`MessageStrip`、`IssueField` 和输入控件覆盖错误/警告语义。

### 开发预览

仓库没有 Storybook/Ladle。可以建立最小开发预览入口，例如 `/ui-foundation-preview`：

- 不加入 `AppNav`、不加入任何正式业务入口。
- 只展示组件的默认、悬停、聚焦、按下、禁用、加载、错误/警告、CJK 长文本和触控尺寸。
- 明确页面为开发预览，不承载业务数据、不写入数据库、不改变权限。
- 该入口会随 Next 构建进入产物；若后续保留，必须转为明确的内部 QA 入口；若不保留，UI-GOV-003 开始前删除。

## 明确不做什么

- 不批量替换全站 CSS，不全局搜索替换 class，不迁移首页、导入、模板库、输出中心或任何正式业务页面。
- 不改变快速补全和案件总览布局，不修复 TASK-020 锚点 Bug。
- 不修改业务流程、数据模型、权限、租户隔离、用户可见业务文案或正式术语。
- 不建立列表、Wizard、首页卡片、图表或完整设计系统组件。
- 不引入 Storybook、新的大型依赖或 SAPUI5。
- 不照搬 SAP 品牌色、组件外观、企业工具栏或技术框架。
- 不删除旧组件，不建立第二套永久设计系统，不使用大量 `!important` 覆盖旧样式。

## 依赖关系

依赖 UI-GOV-001 / TASK-021 的页面类型和组件边界；依赖当前 `main` 的旧页面兼容样式。TASK-020 仍为 Blocked，本任务不得把基础组件完成误报为案件总览验收通过，也不得修改 TASK-020 的锚点实现。

## 允许修改的文件

- `docs/tasks/TASK-022.md`
- `src/app/globals.css`
- `src/components/ui-foundation/*.tsx`
- `src/components/ui-foundation/ui-foundation.module.css`
- `src/app/ui-foundation-preview/page.tsx`
- `BACKLOG.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`

实现 Agent 不得修改允许列表之外的文件。独立审查 Agent 只能修复本任务范围内的明确问题。

## 组件状态验收

每个组件必须有可验证的：

- 默认、悬停、聚焦、按下、禁用、加载状态。
- 错误或警告状态（不适用于的状态要明确说明）。
- 中文、日文和韩文长文本。
- 鼠标、键盘和触控可达尺寸；触控目标至少 44px。
- 焦点轮廓不依赖颜色单一表达；禁用态不靠低对比度隐藏文字。

## 视觉验证

- 优先使用 `/ui-foundation-preview` 开发预览；它不进入导航，但进入生产构建，必须在交接中明确。
- 使用浏览器检查桌面、窄屏、键盘 Tab、触控尺寸、CJK 长文本和组件状态。
- 截图只证明当前视口与状态，不替代键盘、响应式或构建检查。
- 不能连接浏览器时，必须标记具体 `UNVERIFIED`，不得用 lint/typecheck/build 代替视觉通过。

## 验收标准

1. Token 只有 `src/app/globals.css` 一个规范来源；`@theme` 不重复硬编码同义 Token。
2. 基础组件只位于 `src/components/ui-foundation/`，没有明显重复实现或页面专用副本。
3. 组件默认、悬停、聚焦、按下、禁用、加载、错误/警告、CJK 长文本和触控尺寸均有预览证据。
4. 焦点清晰可见，控件文字和状态的颜色对比可读，日文长标签不被固定宽度截断。
5. 新样式仅通过新组件类和 Token 生效；正式业务页面的已有表现不得被批量改变。
6. 开发预览不进入生产导航、不访问业务数据、不修改数据库和权限；是否随构建进入产物有明确记录。
7. `npm run lint`、`npm run typecheck`、`npm run build`、`npm run test:workflow-rules`、`git diff --check` 通过。
8. 独立审查确认没有隐性全局样式污染、没有第二套永久 Token、没有 SAPUI5/大型依赖、没有业务页面差异。
9. 工作区干净；实现 Agent 退出后才启动独立审查 Agent；全部 Agent 完成后退出。

## 兼容策略

新 Token 和基础组件先与旧页面共存。只有 UI-GOV-003 的案件 Object Page 真实浏览器验证通过后，才能将新体系宣布为正式页面基线；旧组件暂不批量删除。

## 预计涉及的模块

- `src/app/globals.css`：唯一 Token 入口和新组件所需的全局基础变量；保留旧页面兼容选择器。
- `src/components/ui-foundation/`：本任务新增的基础组件和局部样式。
- `src/app/ui-foundation-preview/page.tsx`：不进入导航的开发预览入口；不读取业务数据。
- `BACKLOG.md`、`docs/operations/CURRENT_WORKING_CONTEXT.md`：任务状态、验证、风险和交接记录。

不应修改 `src/app/**/page.tsx` 的正式业务页面、现有业务组件、数据库、认证、权限、运行配置或公共资产。

## 风险和注意事项

- `globals.css` 已含旧页面兼容规则；修改 Token 值可能产生隐性全局视觉回归，必须保持现有值或证明没有正式页面表现变化。
- 新组件只能使用作用域类和同一组 CSS 变量，不能通过全局标签选择器或大量 `!important` 污染旧页面。
- 开发预览路由会进入 Next 构建产物，即使不进入导航；必须明确其后续删除或转内部 QA 的去向。
- 静态 lint、typecheck 和 build 不能证明颜色对比、键盘焦点、窄屏和 CJK 长文本通过；缺少浏览器证据时必须保留 `UNVERIFIED`。
- Token/组件通过不等于 UI-GOV-003 通过，不得提前进行页面批量迁移。

## 验证命令

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:workflow-rules`
- `git diff --check`
- 浏览器访问 `/ui-foundation-preview`，验证状态、CJK、键盘、触控尺寸和窄屏
- 检查 `git diff --name-only`，确认没有正式业务页面差异

## 停止条件

- UI-GOV-002A 通过后立即停止，不进行页面批量迁移。
- 下一阶段只能是 UI-GOV-003：统一快速补全与案件总览 Object Page，并修复 TASK-020 锚点缺陷。
- 任何业务页面差异、数据/权限变化、Token 多源或浏览器关键证据缺失，都不得标记 Done。

## 独立审查结果

- 实现 Agent 已完成并退出；独立审查只修改了本任务允许范围内的基础组件状态和无障碍缺陷，未提交 Git、未修改正式业务页面、业务组件、数据库、权限、配置、导航或 TASK-020。
- Token 和新组件均集中在允许路径；组件 CSS 使用 CSS Module，未发现新的全局标签选择器、批量 `!important` 或第二套颜色文件。
- 已修复：原生输入的 `required` 传递、`IssueField` 对数值 `0` 的空值误判、IconButton 加载态、按钮 warning/error 状态和输入错误/警告边框区分。
- 已通过：`npm run lint`、`npm run typecheck`、`npm run build`、`npm run test:workflow-rules`、`git diff --check`。
- 初次审查发现 `src/app/__ui-foundation/` 被 Next 识别为私有目录；PM 在本任务允许范围内将预览移至普通非导航路由目录 `src/app/ui-foundation-preview/`，最终复核确认构建路由包含 `/ui-foundation-preview`，旧私有目录已不存在。
- 浏览器证据：开发预览可访问；桌面 1280px 和窄屏 390px 均无横向溢出；触控 Button 与 IconButton 为 44px；中日韩长标签可换行且未截断；按钮本地状态交互、IconButton 加载禁用、输入错误 `aria-invalid`/`aria-describedby` 和 3px 可见焦点轮廓均已核对。
- 自动化浏览器未单独证明屏幕阅读器和真实设备触控反馈；这些不属于本任务的可自动验证范围，后续案件 Object Page 仍需重新验收。

## 当前状态

`Done`。UI-GOV-002A 只建立 Token、基础组件和开发预览，没有迁移正式业务页面；下一步只能在另行批准后进入 UI-GOV-003。TASK-020 的锚点缺陷仍保持 Blocked，不由本任务绕过。
