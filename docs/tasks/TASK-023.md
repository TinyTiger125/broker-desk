# TASK-023 / UI-GOV-003 Checkpoint A：案件 Object Page 视觉合同

- 状态: In Review
- UI-GOV 编号: UI-GOV-003 Checkpoint A
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

Checkpoint A 的目标截图交付后，必须由产品负责人确认共同外壳与两种布局方向。未确认前不得修改 `/cases/[id]`、实现真实模式切换或修复 TASK-020 锚点。确认后才可进入 Checkpoint B，并重新执行 TASK-020 的真实浏览器门禁。

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

Checkpoint A 桌面方向和窄屏收口均已取得本轮浏览器证据，最终独立复核通过，任务保持 `In Review`，等待产品负责人确认后再决定是否进入 Checkpoint B。不得修改 `/cases/[id]`、实现真实模式切换、修复 TASK-020 或进入 Checkpoint B。
