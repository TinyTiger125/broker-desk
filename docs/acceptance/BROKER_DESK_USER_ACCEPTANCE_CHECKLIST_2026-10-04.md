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

- [ ] 本轮新增改动的首页主要任务、入口文案和工作台完整回归：未执行。
- Source/contract：本轮没有修改首页业务流程。
- Unit/memory：`test:home-resumable-work`、`test:work-center-behavior` 等既有检查不代表本轮完成首页人工验收。
- Browser：无本轮新的真实 authenticated browser 证据。
- Gap：不能把本地构建通过写成首页验收通过。

### 导入

- [ ] 上传、候选复核、保存、刷新/重开和进入案件的完整用户路径：未纳入本轮修复验收。
- Source/contract：当前候选未修改导入解析或导入权限。
- Unit/memory：既有导入合同/失败恢复检查可作为回归参考，但不是本轮的完整导入验收。
- Browser/PG：未取得本轮导入浏览器证据；本轮临时 PostgreSQL 只覆盖保证申请生成占用，不覆盖导入流程。
- Gap：需要单独用合成 Excel/证件样本验证原件留存、候选状态和重新打开；不使用真实证件或外部 OCR。

### 案件 / 客户 / 物件

- [ ] 案件、客户、物件列表/详情/只读写入边界的全角色浏览器回归：未纳入本轮。
- Source/contract：保证生成路由使用现有 `RequestContext` 和案件可写/来源可读检查；本轮没有扩大客户/物件数据权限。
- Unit/memory：现有 visibility/W93 检查可证明 resolver 的 fail-closed 规则；route harness 使用一个合成无外部来源案件验证 owner context。
- Browser/PG：没有本轮真实多身份浏览器矩阵；临时 PostgreSQL 未承担页面权限验收。
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
- Browser/Staging/Production：本轮没有真实 authenticated browser、远端 Clerk、真实邮件、Staging 或 Production 证据。
- Gap：局部申込页已经有 processing/refresh 文案，但全产品常驻解释文案仍未完全收口；日文覆盖也未完成全站收敛，不能据此宣称整个产品的用户说明已验收。

### 成员 / 权限 / 邀请

- [x] 已将邀请可靠性修复保持在持久化发送占用/结果未知语义：超时不自动宣称发送成功，也不让 pending 作为无限制重试许可。
- [x] 已有 invitation reliability 行为测试覆盖 Supabase/Clerk 适配器边界、已知本地校验失败和正常成功；本轮没有真实 provider 调用。
- Source/contract：邀请 action、Clerk/Supabase adapter、迁移合同和 `test:invitation-reliability`。
- Unit/memory：`npm run test:invitation-reliability`、`npm run test:platform-subscription` 通过。
- PG：临时 PostgreSQL 验收仅针对保证申请生成占用；没有远端 Supabase 或 Clerk 写入。
- Browser/Staging/Production：没有成员邀请页面的真实会话矩阵，没有向邮箱发送测试邀请，也未核对收件箱/Clerk 日志。
- Gap/人工恢复：若发送状态为 `unknown`/processing，操作员必须先根据收件地址、provider 日志和后台记录确认远端状态；确认未投递后再走受控本地恢复/重发路径。撤销本地 membership 不等于撤销 Clerk 远端 invitation，不得把本地撤销写成远端撤销。

## 本轮工程门

- [x] `npm run typecheck`
- [x] `npm run lint`（仅保留既有 2 条 warning，无 error）
- [x] `npm run build`（含 prebuild/postbuild）
- [x] `git diff --check`
- [x] 当前工作树仅保留预先存在且未触碰的 `AGENTS.md` 修改；本轮没有执行生产迁移、远端写入、push 或 deploy。

## 未解决风险与准备条件

1. 没有收件地址与 Clerk provider 日志，不能判断“正式版朋友邀请未收到邮件”的实际投递根因；本轮只证明重复 provider 调用风险已被占用状态阻断。
2. `agent-browser` 不可用，且当前没有安全的本地 authenticated session fixture，因此没有浏览器角色矩阵。最小准备条件是受控的本地/Preview session fixture，能正常建立至少 owner、同公司普通成员和第二租户成员身份，不增加生产登录旁路。
3. 本地临时 PostgreSQL 测试不代表 Supabase RLS、Clerk 身份、邮件 provider 或 Production 数据已验证。真实 RLS/远端验收还需要隔离数据库、授权测试身份和明确回滚窗口。
4. 本文不覆盖全产品信息架构、首页、导入、案件/客户/物件、成员页的完整人工评审；各节的未勾选项必须保持为缺口，不能合并解释为“整站通过”。
