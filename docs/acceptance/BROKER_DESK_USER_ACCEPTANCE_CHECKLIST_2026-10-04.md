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

- [x] 本轮取得 owner/demo Chrome 路径的首页渲染证据：`/` 显示「資料管理センター」「今日の重点」，截图与 DOM 报告保存在 `/tmp/broker-desk-ui-flow-8X2WHe/`。
- [ ] 首页主要任务的完整交互、写入和权限回归：未执行。
- Source/contract：本轮没有修改首页业务流程。
- Unit/memory：`test:home-resumable-work`、`test:work-center-behavior` 等既有检查不代表本轮完成首页人工验收。
- Browser：只有显式本地 demo auth 的 Chrome owner 路径；不是 Clerk/Supabase 真实认证证据。
- Gap：不能把本地构建通过写成首页验收通过。

### 导入

- [x] 本轮 Chrome owner 路径验证 `/import-center` 页面可加载并显示「情報入力」。
- [x] 本轮在隔离 PostgreSQL + Chrome owner/demo 中完成合成 Excel：上传 → 异步解析 → 字段映射 → 清空必填「物件名」并看到可操作错误 → 恢复映射 → 保存到物件台账 → 同一 job 两次同步提交 → 刷新/重开 → 物件列表；历史完整报告为 `/tmp/broker-desk-ui-flow-8X2WHe/report.json`，P1 修复后的真实 PG job 为 `import_6l6fvyg8`。
- [x] 物件台账结果持久化为成功 3 件：`合成タワー` 两价位、`合成空室`；无效价格与完全/疑似重复行保留在 validation result 中，未静默丢失。
- [x] 同一隔离 PG 中完成支持 workbook 的案件路径：上传 → 解析 → 手工编辑 → 单项确认 → 保存到 `case_demo_asakusa_mori_rent` → 刷新/重开；最终回归 job `import_zk9en6xn`、案件 `source_import_job_ids` 与 `edited` review item 均可直接查询。
- Source/contract：本轮发现并修复真实保存缺陷：高级映射有效恢复需要允许 `queued → mapped`；同时修正「列対応を開く」链接应进入 `job=` 作用域而不是 `xlsxJob=`。
- Unit/memory：`node scripts/test-import-mapping-form.mjs` 通过，并新增 `queued → mapped` 合同断言；完整浏览器流程使用真实 Next Action/adapter，不以 mock 代替。
- Historical browser evidence：MIG-007/TASK-003 已保留资料确认、追加/新建、持久化和失败恢复的本地 demo 浏览器基线；不因本轮未复测而抹去，也不扩大为本轮新证据。
- Browser/PG：`agent-browser` 不可用，使用已安装 Chrome headless CDP fallback；PG 为临时本地 16 集群、合成 workbook、demo owner，未连接远端 provider。
- Duplicate-submit/P1 CAS regression：job `import_6l6fvyg8` 的两次同步物件保存 POST 均返回 200；直接查询临时 PostgreSQL 得到 `status=completed`、`final_import_started_at` 非空、mapping/validation 保留首个请求、物件记录严格 3 条、`import_job_completed` 审计严格 1 条。此前仅浏览器文本层的 `/tmp/broker-desk-ui-flow-a8tJZh/report.json` 不再作为“无重复数据”的充分证据。
- Adapter interleaving：`node scripts/test-preimport-upload-lifecycle.mjs --postgres` 通过；真实 PostgreSQL 行锁下，旧 mapping 请求等待后返回既有 processing 状态，不能覆盖 mapping/validation；最终断言包含 job 状态、final marker、物件数量和审计数量。
- Gap：本地证据不等于 Supabase RLS、Supabase 邮件 provider、生产附件存储或真实认证矩阵；不使用真实证件、真实邮件或外部 OCR。

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
- Browser：本轮 Chrome owner 路径新增 `/cases/case_demo_asakusa_mori_rent/guarantee-application` 和 `/output-center` 证据；申込页常驻显示「生成中は同じファイルを重ねて作成しないため…」说明，具体截图为 `/tmp/broker-desk-ui-flow-8X2WHe/04-guarantee.png`。
- Route/PG：既有 route harness 与 isolated PostgreSQL 证据仍有效；本轮没有真实 authenticated browser、远端 Supabase、真实邮件、Staging 或 Production 证据。
- Gap：本轮完成的是申込页日语/恢复帮助的具体收敛；全产品常驻解释文案仍未完全收口，日文覆盖也未完成全站收敛，不能据此宣称整个产品的用户说明已验收。

### 常驻文案矩阵（本轮逐项核对）

| 页面 | 本轮处理 | 本轮未处理 |
|---|---|---|
| 首页 `/` | 以 Chrome owner 路径核对「資料管理センター」「今日の重点」可见；无新增文案改动。 | 首页任务说明、完整写入状态和权限提示未扩展。 |
| 导入 `/import-center` | 核对日文真实 locale `ja` 及已有 `zh`/`ko` 分支；补齐导入失败/映射恢复的可达路径，并修正 job-scoped 链接。 | 未做全站文案重写；真实 Supabase 邮件或外部 OCR 提示未处理。 |
| 管理 `/settings/members` | 以 Chrome owner 路径核对「ユーザー管理」「メンバー」常驻结构。 | 成员邀请的真实 Supabase 投递、收件箱与 provider 日志未处理。 |
| 保证申请 | 保留已有日文生成占用/恢复说明并核对页面可见。 | 其他输出专题的常驻解释未扩展。 |

### 成员 / 权限 / 邀请

- [x] 已将邀请可靠性修复保持在持久化发送占用/结果未知语义：超时不自动宣称发送成功，也不让 pending 作为无限制重试许可。
- [x] 已有 invitation reliability 行为测试覆盖 Supabase/Clerk 适配器边界、已知本地校验失败和正常成功；本轮没有真实 provider 调用。
- Source/contract：邀请 action、Clerk/Supabase adapter、迁移合同和 `test:invitation-reliability`。
- Unit/memory：`npm run test:invitation-reliability`、`npm run test:platform-subscription` 通过。
- PG：临时 PostgreSQL 验收覆盖保证申请生成占用与本轮 Excel/案件关联路径；没有远端 Supabase 或 Clerk 写入。
- Browser：本轮 Chrome owner 路径包含 `/settings/members` 页面渲染证据。隔离 PG 为满足受限函数 request-scope 固定 `app.external_auth_subject=demo:user_demo`；`user_ops` actor endpoint 的 session 返回 403，因此没有把成员 session 写成通过。第二租户只存在于 route harness synthetic session，不是浏览器认证。
- Staging/Production：没有成员邀请页面的真实会话矩阵，没有向邮箱发送测试邀请，也未执行远端 Supabase provider 操作。
- Gap/人工恢复：若发送状态为 `unknown`/processing，操作员必须先根据收件地址、Supabase provider 日志和后台记录确认远端状态；确认未投递后再走受控本地恢复/重发路径。撤销本地 membership 不等于撤销 Supabase 远端 invitation，不得把本地撤销写成远端撤销。

## 本轮工程门

- [x] `npm run typecheck`
- [x] `npm run lint`（仅保留既有 2 条 warning，无 error）
- [x] `npm run build`（含 prebuild/postbuild）
- [x] `git diff --check`
- [x] `BROKER_DESK_UI_FIXED_PG_SUBJECT=1 BROKER_DESK_SKIP_STATIC_ROUTES=1 npm run test:local-ui-flow` 的 Excel/action 子路径（P1 修复后的 Chrome owner/demo + 临时 PostgreSQL；直接 PG 查询补足 job/property/audit 数量证据）。
- [ ] 同命令的案件关联子路径：本次最小 PG fixture 缺少可读 source 记录而未通过，不能写成 P1 回归通过；历史完整案件证据仍见上方既有 job `import_zk9en6xn`。
- [x] 当前工作树仅保留预先存在且未触碰的 `AGENTS.md` 修改；本轮没有执行生产迁移、远端写入、push 或 deploy。

## 未解决风险与准备条件

1. 没有收件地址与 Supabase provider 日志，不能判断“正式版朋友邀请未收到邮件”的实际投递根因；本轮只证明重复 provider 调用风险已被占用状态阻断。
2. `agent-browser` 不可用，本轮改用已安装 Chrome headless；浏览器证据仍是显式 demo owner。隔离 PG 为满足受限函数 request-scope 固定 owner subject；`user_ops` session 返回 403，未把成员 session 写成通过；第二租户只在测试 route harness 中存在。
3. 本地临时 PostgreSQL 测试不代表 Supabase RLS、Supabase 身份、邮件 provider 或 Production 数据已验证。真实 RLS/远端验收还需要隔离数据库、授权测试身份和明确回滚窗口。
4. 本文不覆盖全产品信息架构、首页、导入、案件/客户/物件、成员页的完整人工评审；各节的未勾选项必须保持为缺口，不能合并解释为“整站通过”。本轮新 Chrome 证据只证明页面可观察加载和具体帮助展示，不证明所有按钮写入、真实身份或跨租户页面隔离。
