# TASK-023 / UI-GOV-003：案件 Object Page 参考实现

- 状态: Done
- 当前阶段: UI-GOV-003 Checkpoint C 最终证据收口完成
- 优先级: P0
- 负责人: 技术项目经理 / 实现 Agent / 独立审查 Agent
- 依赖关系: TASK-022 已 Done；TASK-020 仍 Blocked，Checkpoint A 不得绕过或修复它

## 任务名称

以现有案件数据、`CASE_INFORMATION_TREE` 和 UI Foundation 为基础，制作
`/cases/[id]` 的两种工作模式视觉合同：快速补全与案件总览，并补充一张窄屏关键状态图。
本检查点只证明共同外壳和信息组织方向，不实施正式案件页面。

## 背景和用户结果

UI-GOV-002A 已建立唯一 Token 和案件 Object Page 所需的最小基础组件，但尚未证明快速补全与案件总览能共享一个稳定的产品外壳。用户需要在高效率处理问题和通读完整案件之间切换时，仍能识别同一案件、同一状态和同一套编辑语言；本检查点先用目标图验证这一方向，避免凭文字直接改正式页面。

## 设计锚点

沿用 Broker Desk 现有中性蓝 Token 的 Swiss-inspired 信息结构：细边界、明确层级、正常字段安静、异常字段语义清晰、焦点可见。不照搬 SAP 品牌视觉、SAPUI5、企业工具栏或复杂企业配置界面。视觉差异化是一个共同案件外壳下的两种工作布局，而不是两套页面风格。

## 依赖关系

依赖 TASK-022 的 UI Foundation 和当前 `main` 的已审查案件基线；TASK-020 仍为 Blocked，不能由本任务绕过。产品负责人必须在 Checkpoint A 三张目标图交付后确认共同外壳与两种布局，确认前不得进入正式实现。

## 本次范围

- 建立不进入正式导航的临时视觉合同预览，例如 `/ui-gov-003-checkpoint-a`，并用 CSS Module 或明确作用域样式实现。
- 使用仓库已有演示案件数据或现有字段语义；不得虚构产品事实，不写入数据库，不调用正式保存动作。
- 两种模式必须共同呈现：动态案件头部、案件身份与关键状态、全局预览/下载入口、模式切换、紧凑状态摘要、正常字段、异常字段、编辑面板的视觉形态、保存/取消/错误反馈。
- 快速补全保留任务队列效率：待补充/差异/格式问题集中处理、快速定位字段、连续处理下一项；正常字段不进入默认队列。
- 案件总览采用全宽长页信息结构：有效内容宽度足够的宽屏可呈现三列，常规桌面两列，窄屏一列；按业务组展示适用字段，复杂字段可跨列；异常在字段原位置提供业务化处理入口，编辑面板按需出现。
- 同一桌面尺寸下形成快速补全和案件总览两张目标图，再形成一张窄屏关键状态图。三图必须证明共同外壳、模式切换、字体、间距、圆角、颜色和控件语言一致，而内容组织方式不同。
- 原型可以使用局部 UI 状态切换来展示编辑面板或异常队列，但不伪造保存成功、下载成功、权限、租户隔离或真实数据行为。

## 明确不做什么

- 不修改 `/cases/[id]`、现有正式案件组件、数据库、API、认证、权限、租户隔离、字段目录、候选/确认/来源/审计数据、输出门禁或用户可见业务术语。
- 不修复 TASK-020 锚点缺陷，不修改滚动容器、`IntersectionObserver`、hash、sticky 或 `scroll-margin-top`。
- 不迁移首页、导入、模板库、输出中心或其他正式页面；不启动 UI-GOV-002B，不批量替换 CSS，不建立第二套永久 Token/编辑系统。
- 不引入 SAPUI5、新的大型依赖或生产导航入口。
- `/ui-gov-003-checkpoint-a` 仅为临时开发预览，虽可能进入 Next 构建路由但不代表生产可访问；正式 Checkpoint B 收口前必须删除、保护或明确转为内部 QA 入口，不能宣称已完成 Preview 生产边界治理。

## 允许修改的文件

- `docs/tasks/TASK-023.md`
- `src/app/ui-gov-003-checkpoint-a/page.tsx`
- `src/components/ui-gov-003-preview/*`
- `BACKLOG.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`

不得修改允许列表之外的文件。独立审查 Agent 只能修复 Checkpoint A 范围内的明确问题。

## 验收标准

1. 同一桌面视口（推荐 1440×900）分别截取快速补全和案件总览目标图；另截取 390×844 左右的案件总览关键状态图。
2. 三张图一眼可辨认属于同一产品：案件头部、模式切换、状态摘要、字段/异常/按钮/编辑面板、字体、间距、圆角和颜色一致。
3. 快速补全保留任务队列和连续处理意图；案件总览展示分组字段和通读意图；两者不是同一布局换标题，也没有两套视觉语言。
4. 正常字段保持安静，缺失/冲突/格式问题使用紧凑且业务化的异常表达；不默认展示 AI 来源、置信度或证据历史。
5. 中文、日文、韩文长度不会让按钮、字段或模式切换失去含义；窄屏无明显横向溢出。
6. 预览中的编辑面板、保存/取消/错误反馈仅为视觉合同，不得伪称真实业务行为通过。
7. 浏览器证据记录实际 URL、视口、截图路径/结果和未验证事项；静态检查不能替代真实视觉证据。
8. 变更不包含正式 `/cases/[id]` 或 TASK-020 相关文件；不产生业务数据、权限、API 或文案变化。
9. `npm run lint`、`npm run typecheck`、`npm run build`、`npm run test:workflow-rules`、`git diff --check` 通过。
10. 实现 Agent 完成并退出后才能启动独立审查 Agent；两个 Agent 均退出后，任务保持 `In Review`，停止等待产品负责人确认，不进入 Checkpoint B。

## 预计涉及的模块

- `src/app/ui-gov-003-checkpoint-a/page.tsx`：非导航、非正式业务的视觉合同入口。
- `src/components/ui-gov-003-preview/*`：Checkpoint A 专用的局部原型结构和 CSS Module；优先复用 `src/components/ui-foundation/`。
- `docs/tasks/TASK-023.md`、`BACKLOG.md`、`docs/operations/CURRENT_WORKING_CONTEXT.md`：范围、证据和交接记录。
- 不应修改 `src/app/cases/[id]/page.tsx`、`src/components/case-overview.tsx`、数据库、API、认证、权限、公共导航或全局 Token。

## 风险和注意事项

- 视觉合同截图只能证明视口内的布局和视觉一致性，不能证明正式案件页的滚动、hash、编辑保存、权限、租户隔离、输出或数据行为。
- 临时预览路由可能随 Next 构建进入产物，即使不进入导航也不等于生产安全；Checkpoint B 收口前必须处理其删除或保护边界。
- 复用现有案件数据时只读展示，不能把原型局部状态误报成已持久化的业务事实。
- 不得为了证明“像 Object Page”而引入 SAP 视觉、技术框架、额外层级或全局复杂度。

## 验证命令

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:workflow-rules`
- `git diff --check`
- 浏览器在相同桌面视口分别访问快速补全和案件总览预览，并在窄屏视口访问案件总览；记录 URL、视口、截图和未验证事项。

## 复核重点

独立审查必须确认：共同外壳没有重复实现；只复用 UI Foundation，没有隐性全局样式污染；快速补全没有被案件总览吞并；案件总览没有再次变成异常处理页；没有修改正式业务页；三张目标图来自同一桌面/窄屏证据；没有把静态图误报为真实锚点、编辑、权限或输出验收。

## 产品决定门

Checkpoint A 的目标截图交付后，必须由产品负责人确认共同外壳与两种布局方向。产品负责人已正式批准目标图，允许进入 Checkpoint B。Checkpoint B 不重新探索产品方向，也不自动关闭 TASK-020；仍须用正式 `/cases/[id]` 的真实浏览器证据单独核验并关闭 TASK-020。

## Checkpoint B：正式案件页面迁移

### 目标

将已批准的共同案件外壳和视觉结构迁入正式 `/cases/[id]`，使快速补全与案件总览属于同一个 Object Page 产品体系，同时保留两者不同的工作布局：快速补全回答“现在还要处理什么”，案件总览回答“这个案件整体是什么样、是否可以输出”。

### 允许范围

- 仅修改正式案件页及其直接共享案件组件；优先复用 `CaseOverview`、`CaseViewSwitch`、`CaseWorkbenchFieldForm` 和 UI Foundation，不复制第二套案件头、字段或编辑器。
- 快速补全保留分类、进度、异常/待补充队列、快速定位和连续处理效率；案件总览保留业务章节、锚点、安静字段、字段旁操作和按需编辑面板。
- 两种模式共享动态案件头、模式切换、状态摘要、按钮、字段、异常、编辑面板及保存/取消/错误反馈的视觉语言和交互契约。
- 保留现有 `saveCaseWorkbenchAction`、候选/确认/来源/审计数据、输出模板选择、案件级下载确认和现有返回路径；共享组件迁移不得改变其提交语义。
- 390px 窄屏至少保证案件身份、模式切换、章节或任务入口、首个可用字段/任务可见；桌面、窄屏和键盘行为均以正式页面验收。

### 明确不做什么

- 不新增数据模型、数据库字段、API 契约、业务字段目录或新的确认/版本语义。
- 不改变 `requireTenantSession`、权限判断、租户过滤、输出下载门禁、模板安装可见性、候选值/confirmedDataJson 分离或申请书数据来源。
- 不修改首页、资料导入、信息整理中心以外的页面、模板库、输出中心、预览页、公共导航或全局 Token；不启动 UI-GOV-002B 或其他页面迁移。
- 不把快速补全改造成案件总览；不把案件总览退回异常审核页；不删除读取、候选、冲突、证据或确认数据。
- 不把 Checkpoint B 中发生的代码变化直接当作 TASK-020 关闭证据。TASK-020 仍需逐项通过锚点点击、手动滚动、前进后退、带 hash 刷新、键盘、窄屏和动态头部展开/收起的正式浏览器验收。
- 不修改或合并 `safety/wip-mixed-worktree-20260812`。

### B 验收标准

1. `/cases/[id]` 的快速补全和案件总览共用案件头、模式切换、状态摘要、字段、异常、编辑面板和反馈组件/视觉语言，但保留任务导向与对象导向的布局差异。
2. 模式切换、字段保存、字段取消、保存后当前字段和滚动位置保持可理解；现有保存动作、返回参数和失败反馈不回归。
3. 案件总览的锚点点击、手动上下滚动、当前章节高亮、返回顶部、动态头部展开/收起、URL hash、前进后退、带 hash 刷新和章节定位取得正式浏览器证据；这些证据仍单独归档到 TASK-020，未通过前 TASK-020 保持 Blocked。
4. 390px 窄屏无横向溢出，案件内容进入首屏；编辑器打开后焦点进入正确控件，保存/取消后焦点和上下文恢复；无法自动验证的屏幕阅读器行为明确标记为人工验证。
5. 无权限用户或不具备案件读取权限的用户继续被拒绝；不同租户不能读取案件、字段、编辑结果、模板安装或输出状态；不得用 demo 绕过认证来宣称这些门禁通过。
6. 预览与下载仍使用当前案件数据和既有输出门禁；有阻塞时预览可按既有语义进入，下载确认和数据修改后确认失效语义不变。
7. 未引入 SAPUI5、SAP 品牌视觉、全局整页编辑、公共页面批量迁移或隐性全局样式污染。
8. `npm run lint`、`npm run typecheck`、`npm run build`、`npm run test:workflow-rules`、必要的案件/租户/输出回归、`git diff --check` 通过；工作区最终干净。
9. 实现 Agent 完成并退出后，才启动独立审查 Agent；审查只能修复 Checkpoint B 范围内明确问题；两个 Agent 最终全部退出。

### B 允许修改文件

- `docs/tasks/TASK-023.md`
- `BACKLOG.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`
- `src/app/cases/[id]/page.tsx`
- `src/components/case-overview.tsx`
- `src/components/case-workbench-field-form.tsx`（仅在共享保存/焦点结构确有必要时）
- `src/components/ui-foundation/*`（仅修复直接阻塞正式案件页的基础组件问题；不得扩展为设计系统）

其他页面、公共导航、数据库、API、认证/权限、全局样式、Checkpoint A 预览和历史资料不在 B 范围内，除非独立审查证明存在由 B 直接造成的明确失效引用且修复不扩大范围。

## Checkpoint B 执行记录（2026-08-15）

- 产品负责人已批准 Checkpoint A 目标图；本轮只迁移正式 `/cases/[id]`，未进入其他页面治理。
- 实现 Agent 已完成并退出；独立审查 Agent 顺序复核后确认共享组件和锚点结构已覆盖，但因真实权限、第二租户、下载确认和部分窄屏/键盘门禁仍缺证，结论为 `FAIL / In Review`。两个 Agent 均已退出，当前活跃数量为 0。
- 快速补全保留分类、进度、任务队列、连续处理和任务表；案件总览保留章节锚点、业务分组和对象阅读结构。两者共同使用 `CaseIdentityHeader`、`CaseViewSwitch`、`CaseStatusSummary`、`CaseFieldValue`、`CaseFieldState`、`CaseFieldInput`、`CaseEvidenceSummary`、`CaseEditPanel` 和现有保存表单，不复制第二套字段控件或证据面板。
- 正式 `localhost:3001/cases/case_demo_kachidoki_rent?view=overview` 浏览器证据：1440 桌面锚点点击定位、动态头部收缩、章节高亮、手动滚动、返回顶部锚点栏仍在；property→contract→back→forward 和带 hash 刷新均正确定位，目标章节顶部约 214–230px。390×844 下 `scrollWidth=390`、`bodyScrollWidth=390`，案件总览首个字段约在 `y=649`；快速补全首个“下一项任务”约在 `y=415`，无横向溢出。编辑面板焦点进入字段控件，取消后焦点回到原字段；输出按钮按现有语义进入输出中心。
- 锚点实现已处理实际滚动容器、动态头部/锚点偏移、`IntersectionObserver` root/rootMargin、`ResizeObserver`、动态 `scroll-margin-top`、hash 初始定位、`pushState`、`popstate` 和滚动后校正；这些证据不自动关闭 TASK-020，TASK-020 仍为 `Blocked`。
- 静态和回归门禁通过：`npm run lint`、`npm run typecheck`、`npm run build`、`npm run test:workflow-rules`、`npm run test:case-field-catalog`、`npm run test:case-applicability`、`npm run test:guarantee-download-gate`、`npm run test:tenant-session`、`npm run test:tenant-data-access`、`git diff --check`。

### 仍未验证、不得伪称通过

- 真实 Clerk 登录、无权限拒绝和第二租户真实浏览器隔离；当前浏览器证据使用显式 demo 身份和内存数据。
- 真实模板已安装后的预览/下载文件、最终案件级下载确认、数据修改后确认失效，以及保存成功后的真实持久化与回滚。
- 平板/窄屏完整操作链、键盘遍历全流程和屏幕阅读器；当前仅证明 390px 布局、编辑字段焦点和取消焦点恢复。
- 以上缺口取得正式证据前，TASK-023 不标记 `Done`，也不关闭 TASK-020；本轮不开始 UI-GOV-002B 或其他页面迁移。

## Checkpoint A 证据

## Checkpoint A 窄屏修正收口（产品复核后）

- 桌面快速补全目标图通过；桌面案件总览方向通过；Checkpoint A 不整体进入 B，先补一轮 390×844 窄屏目标图。
- 窄屏修正只限临时预览：首屏移除开发提示条，压缩案件头部为案件身份、待处理状态、模式切换和一个直接输出入口；不重复展示待处理/输出状态；章节导航和第一个真实字段必须进入首屏；移除预览截图中的 Next 开发浮层。
- 窄屏全局壳层的账户/工作区展开行和图标导航不属于本任务允许修改的正式 `AppNav`；预览只允许使用明确带清理逻辑的临时作用域适配，不能修改共享导航或把该适配宣称为正式导航修复。正式导航图标/文字一致性仍需后续页面壳层任务验证。
- 不改变桌面案件分组方向；响应式证据按“宽屏有效内容足够 3 列、常规桌面 2 列、窄屏 1 列”记录，不为满足文字而强制 3 列。
- 本轮不得修改正式 `/cases/[id]`、`src/components/app-nav.tsx`、TASK-020、全局样式、业务能力或用户可见产品文案；完成新图和独立复核后任务回到 `In Review`，不进入 Checkpoint B。
- 本轮浏览器证据使用显式 `BROKER_DESK_AUTH_MODE=demo`、`DATA_DRIVER=memory` 和 `NEXT_PRIVATE_DISABLE_DEV_OVERLAY_UX=1` 的临时本地预览；不连接真实数据库、不代表 Clerk、生产启动、权限或租户隔离通过。生产 `npm start` 曾返回 503，单独保留为后续演示环境问题。

- 实现 Agent 已完成并退出；独立审查 Agent 随后完成并退出，审查结论为 `PASS`（仅限 Checkpoint A），未修改文件。
- 产品复核要求的窄屏收口已完成；实现 Agent 和独立审查 Agent 均已退出，最终独立复核确认本轮预览范围、截图证据和 390×844 首屏通过。`AGENTS.md` 中由 Next 自动生成的越界区块已移除，当前差异回到允许范围。
- 本轮浏览器目标图均来自 `http://localhost:3001/ui-gov-003-checkpoint-a`：快速补全使用 `?mode=quick`，案件总览使用 `?mode=overview`；两张桌面图同为 `1440×900`，窄屏图为 `390×844`。
- 本轮截图证据：
  - `/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/ui-gov-003-checkpoint-a-quick-correction.png`
  - `/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/ui-gov-003-checkpoint-a-overview-correction.png`
  - `/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/ui-gov-003-checkpoint-a-narrow-correction.png`
- 旧 `ui-gov-003-checkpoint-a-quick.png`、`overview.png`、`narrow.png` 为修正前证据，不能继续证明本轮窄屏通过；1440 旧图的三列表述已被本轮修正证据替代。
- 桌面图证明两种模式共用案件头部、模式切换、状态摘要、UI Foundation 字段/异常/按钮语言和全局输出入口；快速补全保留队列，案件总览使用业务分组、锚点和响应式分组结构。1440 视口实际呈现两列业务分组，不强制三列。
- 窄屏浏览器检查的 `innerWidth=390`、`innerHeight=844`、`scrollWidth=390`、`bodyScrollWidth=390`，导航四个文字入口均在可见范围；案件标题、待处理状态、模式切换、章节导航、申请人和“姓名/永田沙織”进入首屏；没有 Next 开发浮层。
- 静态门禁最终通过：`npm run lint`、`npm run build`、构建后 `npm run typecheck`、`npm run test:workflow-rules`、`git diff --check`。
- 差异范围核对通过：没有 `src/app/cases/[id]/page.tsx`、`src/components/case-overview.tsx`、`src/app/globals.css`、`src/components/ui-foundation/` 或 TASK-020 相关差异；没有数据库、API、认证、权限、租户或业务数据变化。

## 未验证事项

- 这是临时非正式预览，不是正式 `/cases/[id]`；未验证正式案件页面的真实滚动、sticky、`IntersectionObserver`、hash、`scroll-margin-top`、保存/取消焦点恢复、权限、租户隔离、数据持久化或申请书输出。
- 原型中的编辑、保存、取消和下载按钮仅展示视觉形态，不执行真实业务行为；完整韩文页面与生产预览路由边界仍待 Checkpoint B 处理。
- 生产 `npm start -- --port 3002` 返回 `Service unavailable`（503）；因此本轮截图是隔离的内存 demo 预览证据，不是生产启动或外部演示证据。

## 当前状态

Checkpoint A 桌面方向和窄屏收口均已取得浏览器证据，产品负责人已批准目标图。Checkpoint B 的正式页面迁移和可验证的本地浏览器/静态门禁已完成；因真实环境与剩余浏览器门禁未齐，任务保持 `In Review`，TASK-020 保持 `Blocked`。停止在此等待下一项产品/环境决定，不开始其他页面迁移。

## Checkpoint C：正式页面验收收口（2026-08-15）

- 结论：`FAIL / In Review`。本轮不进入 UI-GOV-002B，也不把缺少生产环境单独当作阻塞理由。
- 直接验收通过：正式 `/cases/case_demo_kachidoki_rent?view=overview` 在 1440×900 无横向溢出；快速补全与案件总览可切换；案件总览锚点点击可写入 hash、定位到“房产”并高亮；手动滚动时当前高亮会变化；390×844 的 `scrollWidth=390` 且首个案件字段约在 `y=649`；768px 平板宽度无横向溢出；编辑器打开后焦点进入输入控件，取消后焦点回到原字段；申请书预览入口进入既有输出中心。
- 直接验收未通过或未完成：当前实现的手动滚动只改变高亮，不同步更新已有 URL hash；本轮键盘 Enter 未取得锚点激活证据；当前演示案件没有可用输出模板，无法在本地完成最终下载确认及“修改数据后确认失效”闭环。此前保存/刷新证据仅证明 `DATA_DRIVER=memory` 下的本地演示状态，不证明生产持久化。
- 生产 Demo 路由边界存在直接问题：`/ui-foundation-preview` 与 `/ui-gov-003-checkpoint-a` 均可在本地直接访问，且页面代码未调用 `requireTenantSession` 或其他环境保护；它们进入 Next 构建路由，不应被宣称为已完成生产边界治理。未获授权本轮不删除或保护这些路由，只登记为 TASK-023 未通过项。
- 发布环境门禁单独记录：真实 Clerk 登录、真实无权限拒绝、第二租户真实浏览器隔离、生产数据库和外部服务仍需 TASK-019/发布环境验证；认证、权限和租户过滤代码未在 `6b543261` 修改，自动化租户/会话/输出边界检查继续通过，因此不能仅因缺少生产环境无限期阻塞 UI 任务，但也不能用 demo 证据代替发布门禁。
- `6b543261` 核对：当前 `main` HEAD 即该提交，直接父提交为 `f78b5cb`，提交范围仅含 TASK-023 允许的正式案件页面、共享案件组件、任务卡、BACKLOG 和当前交接；未修改认证、权限、数据库、API 或其他页面。
- TASK-020 仍按自身条件保持 `Blocked`；本轮证据不得自动关闭它。两个 Agent 均不在本轮创建，当前活跃数量为 0。

## Checkpoint C：授权最小修复与独立复验（2026-08-15）

### 本轮授权边界

本轮只允许在 TASK-023 内处理四项收口问题：移除两个开发预览路由；同步手动滚动后的当前章节与 URL hash；保持锚点的原生键盘语义；使用隔离测试模板复验下载确认及数据修改后的确认失效。不得重新设计页面、修改权限或租户逻辑、扩展输出功能、处理其他页面、启动 UI-GOV-002B 或扩大 TASK-020 验收范围。

### 实施结果

- 删除 `src/app/ui-foundation-preview/page.tsx` 和 `src/app/ui-gov-003-checkpoint-a/page.tsx`；当前源码不再提供这两个可执行路由入口。
- 在 `src/components/case-overview.tsx` 中补充手动滚动的 hash 同步，并保留点击、`popstate`、动态布局变化和程序化滚动的抑制逻辑。章节控件继续使用原生 `<a href="#...">`，未引入自定义按钮语义或重复键盘处理。
- 静态检查通过：`npm run lint`、`npm run typecheck`、`npm run build`、`npm run test:workflow-rules`、`npm run test:case-field-catalog`、`npm run test:case-applicability`、`npm run test:guarantee-download-gate`、`npm run test:tenant-session`、`npm run test:tenant-data-access`、`git diff --check`。

### 独立复验结论

独立审查 Agent 已按顺序启动、完成并退出；未修改文件。四项门禁结果如下：

1. **PASS：两个开发预览路由已移除。** 独立审查确认两个路由文件已删除，源码未发现可执行入口；部署产物尚未作为独立生产证据验证。
2. **FAIL：修复后的手动滚动—当前章节—URL hash 闭环缺少独立浏览器复验。** 独立审查确认代码已加入 `replaceState`，但没有采纳为正式通过证据的手动滚动、点击、前进/后退和刷新闭环记录。
3. **FAIL：锚点键盘门禁缺少独立浏览器证据。** 独立审查确认原生 `<a href="#...">` 语义仍在，但没有取得正式页 Tab 聚焦和 Enter 激活的运行时证据。
4. **FAIL：隔离模板下载确认及数据修改后确认失效缺少独立复验。** 独立审查未确认隔离测试模板、实际下载确认和修改后重新要求确认的完整浏览器闭环；现有静态下载门禁测试不能替代该证据。

主执行过程曾取得部分本地运行观察，但未由本轮独立审查 Agent 重新复核；按验收门禁不能将其折算为独立通过证据。因此 TASK-023 继续保持 `In Review`，不标记 `Done`。TASK-020 继续按自身条件保持 `Blocked`，本轮不自动关闭；UI-GOV-002B 不启动。

## Checkpoint C：最终证据收口与验收归属修正（2026-08-15）

产品负责人已明确：隔离模板下载确认及数据修改后的案件级确认失效属于 TASK-020 的输出闭环验收；本轮 UI 迁移未修改其业务语义，因此不再作为 TASK-023 的完成条件。TASK-020 继续保持 `Blocked`，等待其自身输出闭环证据。

本轮 TASK-023 只收口以下范围：

- 两个开发预览路由已移除，源码不再提供可执行入口。
- 手动滚动时当前章节与 URL hash 同步；返回顶部后锚点栏仍可见且回到“相关人员”。
- 锚点继续使用原生 `<a href="#...">`；增加对应的 Enter 键处理，Tab 聚焦和 Enter 激活取得正式页断言。
- 点击锚点、手动滚动、前进/后退的 hash 与当前章节断言均通过。

### 可回放浏览器证据

- 断言报告：`/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/task-023-anchor-evidence.json`
- 截图：
  - `/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/task-023-anchor-property.png`
  - `/Users/laineyzhu/.codex/visualizations/2026/08/13/019ff978-5813-7073-8e44-920871b81849/task-023-anchor-top.png`
- JSON 已包含浏览器标识、视口、临时服务模式、完整 9 步操作序列、每步断言、实际观察结果和截图对应关系；断言结果全部为 `true`。
- 断言覆盖：原生锚点唯一性、Enter 激活、手动滚动到“房产”后的 hash、返回顶部后的“相关人员” hash、锚点栏可见、点击以及前进/后退。

### 最终审查与状态

- 独立审查 Agent 未重新启动浏览器，只审核实现和补全后的证据；证据复核 `PASS`，确认 TASK-023 可标记 `Done`。
- `npm run build`、`npm run lint`、`npm run typecheck`、`npm run test:workflow-rules`、`npm run test:case-field-catalog`、`npm run test:case-applicability`、`git diff --check` 均通过。
- TASK-020 仍为 `Blocked`；UI-GOV-002B 不启动；两个开发预览路由不再重复审查。
