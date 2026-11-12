# TASK-049 / 2026-11-11 桌面窄窗口响应式与录入/整理导航反馈

## 任务名称

桌面浏览器窄窗口下的导航、设置入口和信息整理反馈修复

- 状态: Done
- 当前工作单：`BD-20261112-022-TASK049-PROD-QA-CLOSEOUT`（生产合成案件归档/恢复验收收口）；前序发布证据工作单：`BD-20261112-017-RELEASE-EVIDENCE-REGISTER`，构建修复工作单：`BD-20261112-012-PROD-BUILD-REMEDIATION`，前序实施工作单：`BD-20261112-010-TASK049-ACCEPTANCE-REGISTER`
- 基线：`b4b12e0a247c6a5f29e8f8241d5fa75e800271d0`
- 实施候选：隔离工作树 `/private/tmp/bd-ui-execution-20261111`
- 证据原件：`/Users/laineyzhu/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/ytyaillforever_6bd8/temp/drag/report1111.pdf`（9 页截图 PDF）

## 背景和用户结果

反馈截图来自桌面浏览器从常规宽度缩窄后的窗口，不是手机设备专项。验收必须覆盖同一桌面浏览器在常规宽度、窄宽度和恢复常规宽度之间切换；不得仅用 mobile media query 或把结果写成移动端专用。

PDF 逐页反馈登记如下：

- p1：账户菜单与工作区设置入口重复且分离；合并为一个可理解的入口，去掉无必要的下层重复框。
- p2：设置名称需要按实际目标页语义核对。红字候选为 `出力文書管理`、`ユーザー管理`、`入力情報/項目設定`、`自社情報設定`；候选不是无条件替换指令，必须在 ja/zh/ko 中核对语义一致性，功能不匹配时先回报产品裁决。
- p2 产品裁决：报告候选 `出力文書管理` 过宽，因为 `/templates` 实际仅为模板库；该入口精准改为 `出力文書テンプレート管理`，zh 为“输出文书模板管理”，ko 为“출력 문서 템플릿 관리”，不扩大 `/templates` 页面功能。
- p3：再次指出账户/工作区设置应合并，并检查齿轮入口在窄桌面窗口中的位置与可达性。
- p4：信息输入页的可见“资料的对象选择”标题/副标题重复；去掉冗余可见标题，不删除对象卡片、选择动作或已有功能。
- p5：信息整理案件列表的关联信息未设置时含义不清；保管/归档应保持可恢复并以紧凑、明确的状态表达。
- p6：案件数量与分页表达过于重复，简化其表达但保留准确数量和导航能力。
- p7：列表底部也要有与顶部呼应的数量/分页信息；归档必须仍可恢复，不能变成删除。
- p8：保留对象卡片的选择能力；窄桌面响应式分支不得出现账户和工作区设置的重复可折叠行。
- p9：从信息输入进入信息整理后，“返回对象选择”必须回到对应输入对象选择；直接从整理中心进入时仍保留原有整理中心返回语义。

## 产品裁决

- 本轮只做 UI、导航、文案和返回上下文；保留现有功能与权限。
- 桌面浏览器缩窄是核心响应式场景；至少覆盖约 600–700 CSS px、768、1024、1440 宽度，必要时补测 125% 浏览器缩放，并验证恢复常规宽度后无状态残留。
- 账户与工作区设置入口在窄、宽断点均只保留一个用户可理解的入口；菜单需要垂直可达，不得以水平溢出代替可达性。
- p2 名称只能在对应设置目标页语义确认后替换，且 ja/zh/ko 的同一功能语义必须一致；若候选名称与目标页不符，停止替换并列出产品裁决，不得盲改。
- 信息输入页不再显示冗余可见副标题，但对象选择卡片、操作、权限和数据流不变。
- 信息整理案件列表明确关联信息和“保管/归档”状态；归档继续是可恢复操作。
- 数量/分页在顶部与底部语义一致且简洁；不得通过改变查询、数据、分页边界或权限来实现视觉效果。
- 从输入页进入整理页时返回原输入对象选择；返回上下文必须同源、可验证、不会开放任意外部 URL。

## 本次范围

- 在桌面浏览器常规→窄窗口→恢复常规宽度的响应式路径中，把账户/工作区设置收口为单一垂直可达入口，并保留既有权限、语言、账户和退出行为。
- 按实际目标页语义核对 p2 四个候选名称；`/templates`、成员管理、输入项目设置和公司/发出方信息设置必须分别对应正确语义，ja/zh/ko 不得漂移；不匹配候选不得盲改。
- 保留输入对象卡片与动作，去除冗余可见标题层；明确整理列表关联、紧凑可恢复归档、上下数量分页和安全返回上下文。
- 为单入口产品行为修订现有过时的 `header-popover` 最小静态合同；只改该合同对弹层数量/结构的过时假设，不扩大到无关测试。

## 依赖关系

- 依赖基线 `b4b12e0a247c6a5f29e8f8241d5fa75e800271d0`、治理提交 `728f16e`、初版实现提交 `eae0bd3`、单入口修订提交 `f4520a8`、inline-focus 合同提交 `217d8af`、p2/layout 治理提交 `f92accb` 和归档生命周期修复提交 `162ab1a`。
- 依赖现有 HeaderPopover、导入对象选择、整理列表归档/恢复和返回状态机制；不重建数据模型或权限模型。
- 真实桌面浏览器验收依赖可控本地运行环境；本轮已取得本地 demo+memory 运行态证据，但该证据不等于线上发布授权或真实 PostgreSQL 验收。

## 严格写集

后续实施只能修改以下既有源文件：

- `src/components/app-nav.tsx`
- `src/app/import-center/page.tsx`
- `src/app/organize-center/page.tsx`
- `src/components/organize-center-object-browser.tsx`
- `src/components/archive-record-button.tsx`
- `scripts/check-header-popover-contract.mjs`（仅允许同步单一设置入口的最小静态合同）
- `scripts/check-inline-select-focus-contract.mjs`（仅允许同步两处 live mount 与 synthetic fixtures 的最小静态合同）
- `scripts/check-layout-system-contract.mjs`（仅允许同步安全 `returnTo` 下的生命周期、页码与分页重置调用合同）
- `src/app/actions.ts`（仅允许归档/恢复生命周期的案件可写检查窄修复）
- `scripts/check-archive-failure-contract.mjs`（仅允许覆盖生命周期专用授权与归档失败回归 fixture）
- `scripts/check-archive-atomic-contract.mjs`（仅允许同步生命周期专用 guard 的既有原子性合同）
- `scripts/check-platform-subscription-contract.mjs`（仅允许同步 TASK-049 合并菜单后的 live 平台导航组计数/fixture 合同）

允许在 `archive-record-button.tsx` 中为信息整理列表场景调整“保管/復元”按钮及每行说明文案，或新增显式的可选 compact 呈现；必须保留确认流程、归档/恢复动作、错误反馈、键盘焦点与可达性行为，不能通过父级 CSS 隐藏子组件内容。允许在 `check-header-popover-contract.mjs` 中移除“四个弹层”的过时假设，并改为验证单一合并入口及既有可达性/权限/语言约束；允许在 `check-inline-select-focus-contract.mjs` 中把固定的三个 LanguageSwitcher/ActorSwitcher 挂载假设修订为实际两处 live mount，并保留每个 live mount 可达、focus 与 actor availability 检查，同时更新必要的 synthetic fixtures；允许在 `check-layout-system-contract.mjs` 中把旧的 `buildListHref(selectedType, "", lifecycleFilter)` 静态片段合同更新为实际带 `page=1`、安全 `returnTo` 的调用形式，但必须继续检查 lifecycle、page reset 和 returnTo 约束；为修复已观察到的归档确认后错误页，允许在 `src/app/actions.ts` 中新增/调用 `requireWritableCaseForLifecycle`：该路径必须继续经过 `requireTenantSession({ permission: "record.archive" })`、`rejectForbiddenRecordInput`、`resolveCaseVisibilityForContext` 与 `resolution.canWrite`，并继续使用既有 `setRecordLifecycleWithAudit`、安全返回和审计/原子写入；仅可省略 `assertCaseSourcesReadable`，因为归档/恢复只改变案件生命周期、不读取或暴露 W93 源数据。一般案件写入的 `requireWritableCase` 必须继续保留 W93 源可读检查。允许在两个 archive 合同脚本中同步该 helper 名称、静态边界和 synthetic runtime fixture，并验证归档失败回归、权限/租户/禁止字段、状态和原子写入约束；不得借此改变权限授予、租户范围、数据库/字段/识别或其他生命周期行为；不得修改其他测试脚本。不得新增文件或修改上述列表之外的任何业务、样式、测试、配置、文档、数据库或迁移文件。若实现需要新增文件、修改共享 CSS/组件、改变返回协议或触及列表之外的文件，必须先停止并扩卡取得产品/项目经理裁决；不得以“顺手修复”扩大写集。治理登记文件（本卡、`BACKLOG.md`、当前上下文）只由本次治理提交维护。

允许在 `check-platform-subscription-contract.mjs` 中把 TASK-049 合并账户/工作区菜单后的过时四组静态计数改为实际三个 live 平台导航组，并更新必要的 synthetic fixture；必须继续检查唯一 `getPlatformOwnerSession()`、`hasPlatformAccess`、每个组的 `platformLinks.length > 0` 守卫、ja/zh/ko 文案、稳定链接图标/路由标题和目标页 `requirePlatformOwnerSession()`，不得新增重复 UI 以满足旧计数。该合同修订不授权修改 `src`、平台权限、租户范围、数据库、识别或字段。

## 明确不做什么

- 不改数据库、migration、识别/OCR、字段定义、数据模型、查询权限、租户边界或归档持久化语义。
- 不删除归档数据，不把可恢复归档改为删除，不扩大 `record.archive`、租户或对象写权限；归档/恢复只复用既有可写可见性判定，普通案件写入仍保留 W93 源可读门。
- 不以手机专项方案替代桌面缩窄响应式修复，不引入新的菜单入口或新的产品模块。
- 不访问或修改生产数据，不执行生产 migration，不发布、不部署、不推送 GitHub/Vercel，不提交真实客户资料、密钥或临时证据。

## 验收矩阵

| 反馈/场景 | 必须验证 | 失败即停止条件 |
|---|---|---|
| 桌面响应式 | 同一桌面浏览器在约 600–700、768、1024、1440 CSS px 之间切换；必要时 125% 缩放；无横向溢出、变形、遮挡、重复入口；恢复 1440/常规宽度后布局正常 | 任一宽度出现溢出、重复菜单、断点状态残留，或仅在手机 UA 下通过 |
| 账户/工作区菜单 | 宽/窄断点均只有一个设置入口；键盘 Tab/Enter、焦点、Escape 和垂直滚动可达；普通用户/管理员既有权限边界不变 | 出现两个入口、菜单不可达、权限变化或以水平滚动隐藏入口 |
| p2 设置名称 | 逐一核对四个候选名称的目标页语义；ja/zh/ko 对应语义一致；不匹配项保留旧名并形成产品裁决 | 未核对目标页就替换，或三语言中任一语言语义漂移 |
| 信息输入 | 冗余可见标题/副标题消失；案件/人物/物件等对象卡片、选择动作、错误/权限和原有数据流仍存在 | 误删对象选择、改变字段/识别/权限行为，或标题仍重复 |
| 信息整理列表 | 每行明确关联信息；未设置状态可理解；保管/归档操作明确且可恢复，恢复后记录仍可见 | 关联状态含义不清、归档不可恢复、删除数据或改变权限 |
| 归档生命周期回归 | 已有 `record.archive` 权限且 `canWrite` 的案件，即使关联源不满足 W93 可读，也能完成归档/恢复并安全返回；普通案件写入仍拒绝不可读源；跨租户、不可写、禁止字段、审计和原子写入边界不变 | 归档仍出现确认后错误页、越过租户/可写判定、普通写入失去 W93 门、审计/原子更新或恢复语义改变 |
| 数量/分页 | 顶部与底部数量、当前页/总页或等价分页信息一致且不重复；翻页边界、空态、刷新保持准确 | 上下信息不一致、数量被截断、分页查询边界改变 |
| 返回上下文 | 从输入对象选择进入整理，再返回，回到对应输入对象选择；从整理中心直达仍回原整理中心；同源安全参数保持 | 返回错误对象、回整理中心、丢失上下文或允许任意外链 |
| 工程门 | `npm run test:workflow-rules`、定向契约（含 `npm run test:inline-select-focus`）、`npm run typecheck`、`npm run lint`、`npx next build --webpack`、`git diff --check`；最终工作树干净且仅含本卡写集 | 任一门禁失败、存在未授权文件差异、或把静态通过写成浏览器通过 |

浏览器运行验收必须由独立验收角色在实现角色完成并退出后执行；静态门禁不能替代真实界面证据。无可控本地浏览器环境时，状态只能是 `In Review`/`Blocked`，不得标记 `Done`。

## 验收标准

- 宽度约 600–700、768、1024、1440 CSS px（必要时 125% 缩放）均只有一个设置入口，无横向溢出；恢复常规宽度后状态正常。
- p2 四个目标页语义与 ja/zh/ko 映射经代码核对；不匹配候选保留旧语义并形成裁决。
- 输入对象选择、整理关联、可恢复归档、上下数量分页和输入→整理→返回路径均通过对应定向契约。
- `npm run test:workflow-rules`、定向契约、typecheck、lint、webpack build、`git diff --check` 均有可复核结果；真实浏览器验收未取得时不得 Done。

## 预计涉及的模块

- 导航和响应式断点：`src/components/app-nav.tsx`
- 输入对象选择和返回上下文：`src/app/import-center/page.tsx`
- 整理中心返回/列表入口：`src/app/organize-center/page.tsx`
- 案件关联、数量/分页、可恢复归档展示：`src/components/organize-center-object-browser.tsx`
- 归档生命周期授权与原子链路：`src/app/actions.ts`、`scripts/check-archive-failure-contract.mjs`、`scripts/check-archive-atomic-contract.mjs`

## 风险和注意事项

- 当前导航仍可能在窄/宽分支分别呈现齿轮与账号两个触发入口，未满足单入口产品裁决；需在既有 `app-nav.tsx` 内收口。
- 旧 `check-header-popover-contract.mjs` 将四个 HeaderPopover 当作硬性合同，与当前单入口目标冲突；只能做最小合同修订，不能为通过测试保留错误 UI。
- `check-inline-select-focus-contract.mjs` 当前把三个 LanguageSwitcher/ActorSwitcher 挂载写死，但实际合并两断点只有两个 live mount；修订必须保留逐个 live mount 的可达、focus 与 actor availability 检查，不得删除覆盖。
- `check-layout-system-contract.mjs` 当前把旧的三参数 `buildListHref` 调用写死；实际调用增加 `page=1` 与安全 `returnTo` 以保持页码重置和返回上下文，合同修订不得删除 lifecycle/page/returnTo 检查。
- 初始实现 `eae0bd3` 的静态定向契约与工程门结果不能替代真实桌面浏览器证据；该缺口已由独立最终复验 `ba711bb` 补齐，本地证据仍不外推为线上发布证据。
- p2 中 `出力文書管理` 与 `/settings/output-templates` 的语义风险已按产品裁决收窄为模板管理文案，并由 `ba711bb` 的 ja/zh/ko 菜单复验覆盖；不扩大 `/templates` 页面功能。
- 独立浏览器曾发现归档确认后错误页；`162ab1a` 的生命周期专用可写检查已在 `ba711bb` 的归档→筛选→恢复→新标签/刷新回归中通过。剩余风险仅为本地 demo+memory 证据不能替代真实 PostgreSQL、线上发布、部署和回滚验收。
- `a78f8f1` 推送后 Vercel `broker-desk-staging` 与 `broker-desk-tokyo-validation` 构建失败，失败点为 `scripts/check-platform-subscription-contract.mjs:35` 固定要求四个平台组；代码实际只保留三个合并菜单后的 live 组。该项是合同过期回归，必须只修订合同计数/fixture，不得恢复重复入口或放宽平台权限。

## 验证命令

```text
npm run test:workflow-rules
npm run test:inline-select-focus
npm run test:archive-failure
npm run test:archive-atomic-contract
npm run test:platform-subscription
npm run typecheck
npm run lint
npm run build
npx next build --webpack
git diff --check
```

## 当前状态

- 历史状态：本地功能验收后曾因 `a78f8f1` 推送暴露旧平台订阅合同而重新进入 `In Review`；该合同已在 `104f00a` 以最小范围修复，未改变业务权限或导航目标。生产合成案件 QA 收口后，本卡当前状态为 `Done`。
- 独立最终审查在 `ba711bb` 给出功能验收 `GO`：桌面浏览器 600/640/700/768/1024/1440 CSS px 的缩窄与恢复、菜单/权限/ja-zh-ko 三语言、输入/整理/返回、分页，以及归档→筛选→恢复→新标签/刷新均通过；真实服务端 POST/GET 均为 200。
- `npm run build`（含 `prebuild` 合同）、staging/Tokyo 自动部署状态和正式域名只读 smoke 已在前序登记中通过；本次生产合成案件归档/恢复跨标签刷新证据完成最后的生命周期收口。未取得直接 DB/audit readback 和全角色生产写入矩阵，不能将本卡 Done 外推为完整运维证明。

## 发布门禁

- 必须在实现与独立浏览器验收均通过、写集干净、基线可追溯后才可讨论产品接受；本卡本身不授权任何发布动作。
- 任何生产数据、生产 migration、部署、GitHub 推送、Vercel 操作、真实客户资料或权限扩大均是硬阻断。
- 隔离工作树是 canonical repository 的 Git worktree：`git rev-parse --git-common-dir` 指向 `/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev/.git`；不是 sibling clone。治理分支为 `task049-report1111-responsive-ui`，当前分支从基线 commit 建立，实施前仍需按 AGENTS 规则复核状态与写集。

## 2026-11-12 BD-20261112-017-RELEASE-EVIDENCE-REGISTER / 发布与生产写入边界

- GitHub `main` 当前为 `104f00af142839443d7cfaa9beec0b4d1759adf5`；CI run `43130265960` 已成功。`broker-desk-staging` 与 `broker-desk-tokyo-validation` 的该 commit 状态均为 success；staging Vercel API 返回 `READY` 且 SHA 为 `104f00a`。Tokyo Vercel API 在当前连接下返回 404，故其部署详情不独立外推，只登记 GitHub Vercel status success。
- 正式域名 `https://project-6q8up.vercel.app/` 已完成只读浏览器 smoke：platform owner 会话可读 `/platform/accounts`、`/platform/templates`、`/import-center`、`/organize-center`；640/1024/1440 CSS px 无横向溢出且只有单一设置入口；ja/zh/ko 文案正确，恢复 ja 通过。该证据仅覆盖只读界面可达性，不覆盖写入、持久化或回滚。
- 生产归档链路未执行且保持 `UNVERIFIED`：platform owner 会话对合成案件 `TEST-SYNTHETIC-BrokerDesk-20261008v` 没有归档按钮，也没有 `record.archive` 权限；因此不能证明真实 PostgreSQL 中的归档/恢复持久化、审计或线上写入链路。未访问或修改生产数据，未执行 migration。
- TASK-049 保持 `In Review`，不得宣称全量 GO 或将本地/只读 smoke 解释为生产写入验收。关闭本卡仍需获得具备明确 `record.archive` 权限的受控测试身份与真实 PostgreSQL 写入/恢复证据，或由产品经理明确接受该未验证项并另立发布裁决。

## 2026-11-12 BD-20261112-022-TASK049-PROD-QA-CLOSEOUT / 生产合成案件生命周期验收

- 根 agent 使用获授权的业务测试账号在正式域名完成生产合成案件写入/恢复 UI 验收。目标案件 ID 为 `closed_beta_demo_case_cf01bc0bb8a9f96f_complete`，标题为 `【合成上手】確認済みの合成案件`。
- 归档路径通过：活动列表中目标行显示，原生 Chrome 点击该行“保管”并确认精确标题对话框；成功 flash 为 `record_archived`，活动列表数量 `4→3`。另一个浏览器标签刷新归档列表后仍显示同一目标及“復元”按钮，归档数量由 `1→2`；点击并确认“復元”后成功 flash 为 `record_restored`，归档数量恢复为 `1`。独立新标签刷新活动列表重新显示目标案件及 `ABCDマンション`，数量恢复为 `4`；目标详情页加载精确案件 ID 与标题。
- QA 过程中曾误操作归档 `ABCDマンション`；已通过原生 UI 恢复并确认 `record_restored`，归档数量 `2→1`，活动列表重新显示 `ABCDマンション`。收口时未观察到残留记录状态偏差；该临时状态变化作为本次验收事件登记，不视为产品功能缺陷。
- 结合 `ba711bb` 本地完整响应式/权限/语言/输入/整理/返回/分页验收、`104f00a` 的 CI 与两个 Vercel commit statuses success、staging READY、正式域名只读 smoke，以及本次生产合成案件跨标签归档/恢复/刷新证据，TASK-049 的用户结果与发布候选行为达到关闭条件，状态更新为 `Done`。
- 关闭范围必须严格解释为：生产合成案件的用户路径和服务端持久结果经界面刷新得到证据；未执行直接数据库查询或审计表 readback，也未覆盖所有租户角色的生产写入矩阵。Tokyo Vercel API 部署详情仍在当前连接下 404，但其 GitHub commit status 已 success。上述残余不阻止本卡关闭，但不得外推为全角色、全数据库运维或回滚演练证明。
