# Broker Desk 用户可读验收清单（本地候选）

日期：2026-10-04
范围：邀请投递可靠性候选、保证申请书生成占用/未知状态及其恢复 UI。
基线：`8a10f8f28a0f60c2ed1cbaa171944b0512c3c22d`。
结论边界：这是一份本地候选的有界验收记录，不是全产品验收、Staging/Production 验收或真实邮件投递证明。

## 证据等级

| 等级 | 含义 |
|---|---|
| Source/contract | 源码、类型、静态合同检查；证明代码边界，不等于运行体验。 |
| Unit/memory | 真实内存适配器或行为测试；不连接远端数据库。 |
| Isolated PostgreSQL | 临时本机 PostgreSQL 16 集群，临时数据库、合成数据，测试后销毁。 |
| Route harness | 实际 Next route `POST` 处理器，使用测试进程内合法 fixture session/provider 注入；不添加生产登录绕过。 |
| Browser | 真实浏览器、真实会话和页面交互证据。本轮未取得新的 authenticated browser matrix。 |
| Staging/Production | 固定环境的部署、数据和用户验收。本轮未执行。 |

## 页面/能力清单

### 首页 / 工作台

- [x] 本轮取得 owner/demo Chrome 路径的首页渲染证据：`/` 显示「資料管理センター」「今日の重点」，截图与 DOM 报告保存在 `/tmp/broker-desk-ui-flow-vS4QyW/`。
- [ ] 首页主要任务的完整交互、写入和权限回归：未执行。
- Source/contract：本轮没有修改首页业务流程。
- Unit/memory：`test:home-resumable-work`、`test:work-center-behavior` 等既有检查不代表本轮完成首页人工验收。
- Browser：只有显式本地 demo auth 的 Chrome owner 路径；不是 Clerk/Supabase 真实认证证据。
- Gap：不能把本地构建通过写成首页验收通过。

### 导入

- [x] 本轮 Chrome owner 路径验证 `/import-center` 页面可加载并显示「情報入力」。
- [ ] 上传、候选复核、保存、刷新/重开和进入案件的完整用户路径：本轮未复测。
- Source/contract：当前候选未修改导入解析或导入权限。
- Unit/memory：本轮 `test:import-failure-recovery` 等导入检查作为回归通过；它们不是完整导入人工验收。
- Historical browser evidence：MIG-007/TASK-003 已保留资料确认、追加/新建、持久化和失败恢复的本地 demo 浏览器基线；不因本轮未复测而抹去，也不扩大为本轮新证据。
- Current gap evidence：`CURRENT_WORKING_CONTEXT.md` 2026-09-30 记录的合成 Excel 选择文件动作曾被浏览器工具中断，因此本轮仍不宣称上传→映射→保存→刷新/重开闭环通过。
- Browser/PG：本轮页面加载证据仅为 `/import-center`；临时 PostgreSQL 只覆盖保证申请生成占用，不覆盖导入流程。
- Gap：需要单独用合成 Excel/证件样本验证原件留存、候选状态和重新打开；不使用真实证件或外部 OCR。

### 案件 / 客户 / 物件

- [x] 本轮 Chrome owner 路径渲染通过：案件 `/organize-center?type=case`、客户 `/clients`、物件 `/properties`。
- [ ] 案件、客户、物件详情、写入边界和全角色浏览器回归：未纳入本轮。
- Source/contract：保证生成路由使用现有 `RequestContext` 和案件可写/来源可读检查；本轮没有扩大客户/物件数据权限。
- Unit/memory：现有 visibility/W93 检查可证明 resolver 的 fail-closed 规则；route harness 使用一个合成无外部来源案件验证 owner context。
- Browser/PG：只有本地 demo owner 页面证据；临时 PostgreSQL 未承担页面权限验收。
- Gap：仍需同公司 owner/company-read、第二租户和直接 URL 的 authenticated browser/真实 RLS 证据。

### 文件 / 模板 / 保证申请书输出

- [x] 生成占用持久化：`issued` 与 `processing`、`consumed`、`expired`、`not_found` 分开处理；processing 不向客户端泄漏 claim token。
- [x] 并发保护：同一 confirmation 的两个实际 route 请求只有一个进入 provider，另一个得到 409 `generation_in_progress`；完成后 status refresh 可取得 output id。
- [x] 失败恢复：provider 失败后持久化占用释放为可重试状态，下一次请求可成功；不会永久卡死。
- [x] consumed 重入：返回既有 output，标记 `idempotent`，不再次调用 provider 或创建第二条 output。
- Source/contract：`src/app/api/guarantee-g1-slice1/route.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`、恢复 UI 与对应合同检查。
- Unit/memory：`npm run test:guarantee-slice1-behavior`、`npm run test:guarantee-application-recovery`、`npm run test:guarantee-slice1-contract` 通过。
- Isolated PostgreSQL：`npm run test:guarantee-preview-concurrency-postgres` 通过，覆盖临时真实 PostgreSQL 的双并发、provider 次数、单 output、失败释放/重试。
- Route harness：`npm run test:guarantee-generation-route` 通过：unauthorized=403、cross-actor=404、cross-tenant=404；并发 providerCalls=1；失败+重试后 providerCalls=3、outputs=2。
- Browser：本轮 Chrome owner 路径新增 `/cases/case_demo_asakusa_mori_rent/guarantee-application` 和 `/output-center` 证据；申込页常驻显示「生成中は同じファイルを重ねて作成しないため…」说明，具体截图为 `/tmp/broker-desk-ui-flow-vS4QyW/04-guarantee.png`。
- Route/PG：既有 route harness 与 isolated PostgreSQL 证据仍有效；本轮没有真实 authenticated browser、远端 Clerk、真实邮件、Staging 或 Production 证据。
- Gap：本轮完成的是申込页日语/恢复帮助的具体收敛；全产品常驻解释文案仍未完全收口，日文覆盖也未完成全站收敛，不能据此宣称整个产品的用户说明已验收。

### 成员 / 权限 / 邀请

- [x] 已将邀请可靠性修复保持在持久化发送占用/结果未知语义：超时不自动宣称发送成功，也不让 pending 作为无限制重试许可。
- [x] 已有 invitation reliability 行为测试覆盖 Supabase/Clerk 适配器边界、已知本地校验失败和正常成功；本轮没有真实 provider 调用。
- Source/contract：邀请 action、Clerk/Supabase adapter、迁移合同和 `test:invitation-reliability`。
- Unit/memory：`npm run test:invitation-reliability`、`npm run test:platform-subscription` 通过。
- PG：临时 PostgreSQL 验收仅针对保证申请生成占用；没有远端 Supabase 或 Clerk 写入。
- Browser：本轮 Chrome owner 路径包含 `/settings/members` 页面渲染证据；同租户 `user_ops` 通过真实本地 `/api/actor` 与 `/api/tenant/session` fixture endpoint 验证为 `tenant_cherry` 成员。第二租户只存在于 route harness synthetic session，不是浏览器认证。
- Staging/Production：没有成员邀请页面的真实会话矩阵，没有向邮箱发送测试邀请，也未执行远端 provider 操作。
- Gap/人工恢复：若发送状态为 `unknown`/processing，操作员必须先根据收件地址、provider 日志和后台记录确认远端状态；确认未投递后再走受控本地恢复/重发路径。撤销本地 membership 不等于撤销 Clerk 远端 invitation，不得把本地撤销写成远端撤销。

## 本轮工程门

- [x] `npm run typecheck`
- [x] `npm run lint`（仅保留既有 2 条 warning，无 error）
- [x] `npm run build`（含 prebuild/postbuild）
- [x] `git diff --check`
- [x] `npm run test:local-ui-flow`（Chrome owner/demo 路径：首页→导入→案件→保证申请书帮助→客户→物件→文书输出→成员；同租户成员 session fixture；第二租户 route-harness-only）
- [x] 当前工作树仅保留预先存在且未触碰的 `AGENTS.md` 修改；本轮没有执行生产迁移、远端写入、push 或 deploy。

## 未解决风险与准备条件

1. 没有收件地址与 Clerk provider 日志，不能判断“正式版朋友邀请未收到邮件”的实际投递根因；本轮只证明重复 provider 调用风险已被占用状态阻断。
2. `agent-browser` 不可用，本轮改用已安装 Chrome headless；浏览器证据仍是显式 demo owner。现有 actor/session fixture 可建立 owner 与同租户成员，第二租户只在测试 route harness 中存在；没有安全的真实 authenticated browser 第二租户身份。最小准备条件仍是受控的本地/Preview session fixture，不增加生产登录旁路。
3. 本地临时 PostgreSQL 测试不代表 Supabase RLS、Clerk 身份、邮件 provider 或 Production 数据已验证。真实 RLS/远端验收还需要隔离数据库、授权测试身份和明确回滚窗口。
4. 本文不覆盖全产品信息架构、首页、导入、案件/客户/物件、成员页的完整人工评审；各节的未勾选项必须保持为缺口，不能合并解释为“整站通过”。本轮新 Chrome 证据只证明页面可观察加载和具体帮助展示，不证明所有按钮写入、真实身份或跨租户页面隔离。
