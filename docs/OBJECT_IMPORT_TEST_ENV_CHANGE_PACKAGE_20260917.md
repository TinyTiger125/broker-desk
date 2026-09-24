# Object Import 测试环境变更包（2026-09-17）

## 目的与边界

- 候选基线：`720b768dceb28186f05ad8767dc9d7b92ea8d0d8`。
- 当前隔离环境：`/private/tmp/broker-desk-vertical`，仅非生产候选；未提交、未部署、未执行数据库迁移。
- 内存合同使用合成租户/用户数据；当前候选没有可宣称的 Preview 或真实 Postgres 运行结果。
- 不涉及 Production、主分支、权限三态或现有业务数据回填。

## 同范围五项产品要求映射

| 要求 | 当前候选证据 | 判定 |
| --- | --- | --- |
| 移除 4 个快速入口 | quick 视图 `CaseIdentityHeader.actions` 已移除资料补充、关系确认、文书输出、申请书生成四个入口 | 代码完成，运行时待验 |
| 摘要/进度唯一且不重复 | quick 视图删除重复的申请人/物件/担当/保证公司摘要卡；顶部保留案件身份摘要，workbench 保留进度 | 代码完成，运行时待验 |
| 关联与上传合并 | [CaseAssociationManager](/private/tmp/broker-desk-vertical/src/components/case-association-manager.tsx:243) 在 party/property 卡内提供上传与状态入口，卡片不再承载第二套保存表单 | 代码完成，运行时待验 |
| party/property 对称 | [upload action](/private/tmp/broker-desk-vertical/src/app/object-import-actions.ts:12) 与 [review CAS](/private/tmp/broker-desk-vertical/src/lib/data.postgres.ts:6868) 均按两类目标分支 | 代码完成，运行时待验 |
| 模型值进入主输入并保存 | quick 字段列表 `当前值` 主输入读取未完成候选；同一 `CaseWorkbenchFieldForm` 提交时携带 review 基线，由单一数据层保存操作同时提交对象 CAS 与案件字段 | 接线完成；Postgres 使用同一事务，内存驱动提供等价单次写入语义，真实环境待验 |

## 确切变更

- 迁移文件：[20260917_001_object_import_targets.sql](/private/tmp/broker-desk-vertical/db/migrations/20260917_001_object_import_targets.sql)
  - 新增 `object_import_targets` 与 `object_import_fields`，状态约束、唯一键、索引、案件/导入任务/附件外键。
  - 新增对象与案件租户触发器；来源附件必须属于该导入任务。
  - 两表启用并强制 RLS；策略同步检查租户、案件 visibility、party/property visibility 与当前用户写权限。
- 处理器在已有 target 的 job metadata 被通用 mapping 改写时 fail-closed：`object_import_metadata_mutated`。
- review action 在单事务内锁定 target、对象和候选；版本、候选值、案件关联或权限不一致时回滚。
- 幂等键已包含 `caseId`，同案件重复上传去重，跨案件不会复用旧任务。
- 来源追溯已收紧：对象 target 必须绑定同租户、同用户、同导入任务的唯一私有附件；模型候选 provenance 写入该附件 ID 与实际内容 SHA-256。缺失、跨任务、不可读、多附件歧义或来源被删除时，processor/review/原子保存均 fail-closed。
- 关联卡的“查看来源”入口只生成 `/api/attachments/[attachmentId]` 鉴权路径（要求 `source.download_original`），不暴露对象存储直链；静态合同已覆盖该边界。

## 现有资料影响

- 迁移为加法，无历史数据回填；现有 `import_jobs`、`attachments`、party/property 记录保持不变。
- 新上传只有在通过案件/对象关联与可写校验后才创建对象导入 target。
- 上传文件以 `attachments.target_type='import_job'`、`target_id=import_job_id` 保存；当前本地候选会从该 job 唯一私有附件派生并强制写入 `sourceAttachmentId`，候选 provenance 同时保存权威附件 ID 与内容 hash。数据库迁移将 `source_attachment_id` 设为 `NOT NULL` 且 `ON DELETE RESTRICT`。
- 处理器只产生 model draft；确认/拒绝才会写对象字段，拒绝不改对象。

## 事务、失败与恢复

- Postgres review 使用事务和 `FOR UPDATE`；对象更新、候选状态、target 状态、审计日志同一事务提交，任一 CAS/权限/关联失败均回滚。
- 主输入 action 调用 `saveCaseWorkbenchWithObjectReview`；Postgres 在同一 `withTransaction` 内锁定并更新对象、候选、target、审计和案件字段，任一步失败均回滚。内存驱动先完成全部校验，再在单次同步写入中更新两侧并保留回滚快照供测试。
- 内存驱动在检查与变更之间不插入 await，提供等价 CAS 合同。
- 处理器 metadata 改写、外租户、脱关联、失效版本均 fail-closed；上传/解析失败进入失败状态，不覆盖对象。
- 执行前恢复：保持当前未执行状态即可；若迁移执行失败，应由同一事务回滚并保留 migration ledger 记录。若已产生测试数据，优先回退应用到 720 基线并保留两张表数据，禁止直接删表作为常规回滚；删除仅限空库演练且需独立审批。

## 受控测试环境执行方案（待 Tifa 一次性批准）

- **目标**：Neon project `restless-sun-37465131`，branch `main` / `br-sparkling-sunset-az98ha2x`，database `broker_desk_internal_alpha`，schema `public`；Vercel Preview 作用域为 `staging/broker-desk-acceptance`。
- **角色**：使用专用 migration role 的 `DATABASE_MIGRATION_URL` 执行 DDL；Web runtime 使用受限 `DATABASE_URL`，不得 DDL、不得 `BYPASSRLS`；`brokerdesk_admin`/`neondb_owner` 控制台角色不能作为 Web runtime 证据。迁移前必须取得实际 role 名称与 Production 连接隔离证据。
- **执行前强制比对**：在 migration 连接上只读执行 `SELECT current_database(), current_schema(), current_user`，必须分别等于 `broker_desk_internal_alpha`、`public` 和获批 migration role；任一不符立即停止。再以 `pg_roles` 核对该 role 的 `rolsuper=false`、`rolbypassrls=false`，确认与 Web runtime role 不同；不能以 `brokerdesk_admin` 控制台会话代替 runtime 证明。
- **迁移文件闸门**：先列出 `db/migrations/*.sql` 的完整排序清单并逐文件计算 SHA-256；只读查询 `broker_desk_schema_migrations`。若存在任何未登记且名称不是 `20260917_001_object_import_targets.sql` 的文件，立即停止，不运行整目录 runner；若目标迁移已有记录，checksum 必须等于当前文件 `dd32f95fcd3a6bd07a4e6d909934eab886e70ca66bb05c39d6333f0d3e445c57`，不允许改写已应用迁移。
- **执行路径**：仅在上述比对通过、恢复点已确认且获批窗口内，使用专用 migration role 的 `DATABASE_MIGRATION_URL` 运行 `npm run db:migrate`。runner 按文件名排序、advisory lock、逐迁移事务和 `broker_desk_schema_migrations(name, checksum)` 记录执行；禁止使用 Vercel Query 页或 runtime 连接代替迁移。若无法取得受控凭据或无法验证目标，保持未执行状态，不向用户索取明文密钥。
- **最小顺序**：①先保留/部署 readiness 兼容候选；②确认快照/恢复点、连接目标/角色和“仅目标迁移待执行”闸门；③执行一次迁移；④只读核对账本 checksum、两表字段/FK/触发器/RLS/policy、角色属性；⑤认证 Preview 做 party/property 上传、候选审核、主输入保存、刷新读回与跨租户/并发/失败回滚；⑥全部通过后再评估 Preview 验收。每一步失败即停止，不自动推送、回滚或重试破坏性操作。
- **数据影响**：本迁移为加法，无历史回填；新增两表及索引、复合 tenant-target FK、来源附件强制约束、对象/案件可见性策略和审计写入路径。附件删除受 `RESTRICT` 约束，来源追溯不可静默断开。
- **失败恢复**：迁移事务失败回滚且不写成功账本；保留错误日志/快照。应用验证失败时保留两表数据与账本，优先回退应用版本到已知基线，禁止常规 `DROP TABLE`。

## 迁移执行与数据库结构验证（2026-09-17）

- 已在 Neon 原生 SQL Editor 通过受控 `brokerdesk_admin` 连接执行且提交唯一授权迁移 `20260917_001_object_import_targets.sql`；目标为 project `restless-sun-37465131`、branch `main` / `br-sparkling-sunset-az98ha2x`、database `broker_desk_internal_alpha`、schema `public`。
- 迁移前只读闸门通过：账本原有 39 条记录，目标迁移唯一未登记；本地文件 SHA-256 为 `dd32f95fcd3a6bd07a4e6d909934eab886e70ca66bb05c39d6333f0d3e445c57`。当前连接 `current_database=broker_desk_internal_alpha`、`current_schema=public`、`current_user=brokerdesk_admin`，数据库/schema CREATE 权限为 true，`brokerdesk_admin` 与 `brokerdesk_runtime` 均 `rolsuper=false`、`rolbypassrls=false` 且角色分离。
- 提交结果：SQL Editor 返回 `Statement executed successfully`；仅出现预期的不存在对象上的 `DROP ... IF EXISTS` 跳过提示，无错误。
- 迁移后只读核对：账本 checksum 精确匹配；账本总数 40；`object_import_targets` 与 `object_import_fields` 存在；两表 `relrowsecurity=true`、`relforcerowsecurity=true`；策略共 4 条、对象 guard trigger 1 条；约束计数分别为 24/12；source attachment 外键删除动作 `r`（RESTRICT）；fields tenant-target 复合 FK 为 `ON DELETE CASCADE`；`source_attachment_id` 为 `NOT NULL`；两表当前均 0 行，未发生历史数据回填。
- Neon Backup & Restore 页面显示当前分支可回溯 6 小时历史窗口；未创建额外快照，未执行恢复动作。

### 执行路径只读复核（2026-09-17）

- 原批准方案要求 `npm run db:migrate` + `DATABASE_MIGRATION_URL`。本地曾尝试启动 runner，但因本地没有该环境变量在连接前停止；没有发生审批拒绝、网络拒绝或数据库失败回滚。
- 随后为完成已授权的非生产测试，改用 Neon SQL Editor 的 `brokerdesk_admin` 会话手动提交；这是执行路径偏离，未取得单独的路径变更批准。该会话目标与权限可见且不具 `SUPERUSER`/`BYPASSRLS`，但不能据此证明它等同于预定的专用 migration role。
- SQL Editor 历史显示本次为一个 `BEGIN` 到 `COMMIT` 的 26 语句批次，包含迁移语句和账本插入；实际批次没有 `pg_advisory_lock`，也未由本地 runner 枚举并逐文件处理。成功提示与账本写入可见，但未执行失败回滚演练。
- 去除手动追加的账本插入后，实际批次文本 SHA-256 为 `87776de5eb8d570ea3c84abd8199261f3a5902cbb1e574ec5f7d9efc4c647b22`，与批准文件 `dd32f95fcd3a6bd07a4e6d909934eab886e70ca66bb05c39d6333f0d3e445c57` 不同；两者压缩空白后的 SHA-256 与长度均一致，现有证据支持差异仅为空白字节，不能宣称逐字节一致。账本却记录了批准文件 checksum，因此属于迁移可追溯性例外，暂不回滚或改写已应用账本。
- runner 本身会获取 advisory lock、创建/检查账本、按文件排序并写 checksum；其 `client.query(sql)` 外层事务与迁移文件自带 `BEGIN/COMMIT` 的交互仍需单独修正或验证，不能把本次手动执行称为 runner 等价执行。

### 本地 runner 修正与候选提交

- 新增 `scripts/postgres-migration-runner-utils.mjs` 的 `stripEmbeddedTransaction()`；runner 仍按原文件字节计算 checksum，只移除最外层事务包装后执行，使 runner 的单一事务覆盖迁移体与 ledger insert。函数体内的字面量不会被处理。
- 新增 `scripts/test-postgres-migration-runner-utils.mjs`，覆盖有/无包装及 `$$`/字符串字面量场景；该测试与 pipeline、target contract、readiness、data-driver、diff-check 均通过。
- 历史预执行记录中的本地候选 `85e3b31` 已被后续精确提交 `fe690521e0aac26beb829df10e2853d81efe4ed9` supersede；当前分支推送与 Preview 状态见下节。
- 远端旧 Preview 曾运行 `6d42a4f`，其代码与已执行数据库的新 `source_attachment_id NOT NULL` 约束不匹配；本轮已获一次 Preview 更新授权并生成新部署，但完整认证验收仍受登录阻塞。

### 本轮 Preview 生成与综合验收边界（2026-09-17）

- `staging/broker-desk-acceptance` 已从 `6d42a4f` 快进至 `fe690521e0aac26beb829df10e2853d81efe4ed9`；Vercel deployment `D1rzyeHBKHyRviHCEytDpCMaSdwZ` 状态为 `Ready`，Preview URL 为 `https://broker-desk-staging-gm0du98rr-neos-projects-d66edfc8.vercel.app`。
- Preview 环境变量页面只读确认 `DATABASE_URL`、`DATABASE_MIGRATION_URL`、`DATABASE_ADMIN_URL`、Neon 生成的数据库变量均作用于 Preview + `staging/broker-desk-acceptance`；值未读取。测试资源仍为 `broker-desk-staging-nonprod`。
- 访问 Preview 根路径立即转到 Clerk 登录页；当前浏览器没有获准测试账号或认证会话，未输入、索取或传输任何凭据。健康端点可返回 HTTP 200，但不能证明业务认证读回或 runtime 角色对应关系。
- 因认证缺失，标题/入口、人物与物件上传对称、模型读取、候选低置信/冲突、保存刷新重开、来源鉴权/归属、隔离并发及失败恢复全部保持 `UNVERIFIED`。最小阻塞是产品方提供已认证 Preview 会话或在浏览器完成登录后交接；不得自行换路径。

### 认证 Preview 复验与运行时 P1（2026-09-17）

- 现有 Chrome 会话已认证；`/import-center`、`/cases/new` 可打开。首页仅见两张主操作卡；人物/物件的既存选择与快速创建输入布局对称，这些为观察级 PASS。
- 两个合成案件页均返回“このページを一時的に開けません”，请求编号 `1959907781`；浏览器控制台记录 Minified React error `#441`。实际模型读取、候选审核、主输入保存、刷新/重开、来源鉴权、归属隔离、并发和失败恢复均未完成。
- Neon SQL Editor 只读 catalog 现已确认 `brokerdesk_runtime`：`rolsuper=false`、`rolbypassrls=false`、`rolinherit=false`、`member_of={}`，schema USAGE 为 true，但两张对象表的 SELECT/INSERT/UPDATE/DELETE 均为 false；两表仍为 `relrowsecurity=true`、`relforcerowsecurity=true`，无显式 relacl。Preview 控制台只记录通用 React #441 与路由错误，没有 SQLSTATE，因此“权限导致路由失败”是高置信因果推断，不冒充直接日志根因。
- 本地诊断发现迁移仅向 `authenticated` 授予对象导入表权限，未向 `brokerdesk_runtime` 授权；新增 `has_table_privilege` 探针与 `permissions_incomplete` fail-closed 分支，仅要求当前运行路径所需的 SELECT/INSERT/UPDATE（没有 DELETE 业务路径），使案件页在 ACL 不足时跳过对象表读取并禁用上传，避免路由崩溃或伪成功。
- 本地修复提交为 `0c17923`；`npm run build`、`npx tsc --noEmit --incremental false`、readiness/pipeline 测试和 `git diff --check` 均通过。尚未对真实 `brokerdesk_runtime` 做数据库 ACL 反例或在 Preview 部署修复后复验；后续 Preview 更新由 Tifa 接手。

## 待执行验证

1. 在隔离非生产数据库执行迁移，并核对两表 `relrowsecurity=true`、`relforcerowsecurity=true`、FK、触发器和策略。
2. 配置受限 `DATABASE_ADMIN_URL` 后运行 worker authorization 与真实事务/RLS 矩阵；当前未配置，之前检查在连接前停止。
3. 使用认证员工会话上传身份资料与 Excel，分别验证 party/property：解析、低置信黄色、冲突红色、确认、拒绝、刷新/重开。
4. 验证同案件重复上传去重、跨案件隔离、跨租户拒绝、对象归档/visibility 变化后的读取与写入拒绝。
5. 对真实 OCR/Excel fixture 做来源附件绑定与候选 provenance 检查。
6. 在已定位的 Neon `broker_desk_internal_alpha`/`public` 上由受限 runtime 连接验证同一事务的第二段失败回滚、并发冲突、正常保存及刷新读回；当前仓库本地仍无可用 runtime 连接配置。
7. 验证 source attachment 必填、同 job 唯一、附件删除/重绑/多来源拒绝，以及候选 provenance 的附件 ID/hash 与内容一致。

## 仍缺少的必要条件

- 仍需取得受控 migration role 凭据、执行窗口、快照/恢复点和 Production 对应资源元数据，以完成非共用证明。
- 本地仓库仍缺失 `DATABASE_URL`、`DATABASE_ADMIN_URL`、`.env*`；但已通过登录 Neon Console 进行只读身份、数据库、schema、表目录与角色属性核对，未执行应用迁移。
- 可复现的认证浏览器会话及真实 OCR/Excel 测试文件。
- source attachment 强制追溯契约已确定并在本地候选与迁移草案中落实；真实数据库约束和端到端读回仍待验证。
- 在 Tifa 另行授权前不执行迁移、不部署、不推送；普通工程准备继续在本地完成。

## 推送后影响核对（2026-09-17）
- 本轮较新控制要求已暂停新的 push、deploy、migration；不自动回滚。
- GitHub 只读状态：`6d42a4f5df2d21f1f2f191cb40948282ba443921` 对应 Vercel `Preview` deployment 已 `success`。非敏感 URL：`https://broker-desk-staging-f6d41akhp-neos-projects-d66edfc8.vercel.app`。
- 旧 `720b768dceb28186f05ad8767dc9d7b92ea8d0d8` Preview deployment 仍 `success`，旧 URL：`https://broker-desk-staging-4ukfnqyk5-neos-projects-d66edfc8.vercel.app`。新旧登录入口均 HTTP 200；未登录案件页受保护返回 404，未产生认证读回证据。
- 新旧 `/api/health/data` 均 HTTP 200 `status=ready`；这只证明应用健康端点可响应，不证明数据库身份、迁移已执行或 RLS 隔离。
- 本地仓库仍缺失 `DATABASE_URL`、`DATABASE_ADMIN_URL`、`.env*`；实际 Neon 只读核对已确认数据库与 schema，但迁移尚未执行，未就绪时由 readiness gate 跳过对象表读取。

## 迁移顺序与案件页阻断（2026-09-17 复核更正）
- 独立只读复核确认：`src/app/cases/[id]/page.tsx:632` 在认证案件详情主渲染中无条件调用 `listObjectImportTargets`；Postgres repository `src/lib/object-import-repository.postgres.ts:35` 直接查询 `object_import_targets`，缺表时返回 `relation "object_import_targets" does not exist`。候选列表随后还查询 `object_import_fields`。
- 影响所有认证 `/cases/[id]` 详情路径（owner/write、company-read、有/无对象关联）；memory 驱动不受影响。`/import-center` 等未直接调用该列表的入口不受此特定缺表查询影响。
- 因此总体发布判定更正为 **P0=0，P1=1，P2=2**：P1 是迁移尚未执行导致认证案件页可能整体失败；此前 P1=0 仅适用于本地原子保存实现审查，不能覆盖部署 schema/runtime 门槛。
- 早先 CLI/API 读取失败（无本机 token）已由浏览器登录核对取代；当前已获得 Vercel Preview 作用域与 Neon 资源/分支/数据库标识，但 Production 对应资源仍未核对。
- 解阻最小步骤：在确认隔离与执行窗口后，由专用 migration role 通过 `DATABASE_MIGRATION_URL` 运行 `npm run db:migrate`；核对账本、目录/RLS/角色后，再进行认证案件页读回。不得由 runtime role 或页面 Query 控件代替迁移。

## 未就绪兼容性修复（2026-09-17，本地未推送）
- 新增 readiness 合同：Postgres 先核对 migration ledger 与 `to_regclass`，未应用迁移或表不完整时返回明确不可用状态，不直接查询缺失表；memory 路径保持 ready。
- `/cases/[id]` 先检查 readiness；未 ready 时跳过对象表读取，保留原案件加载/编辑，禁用上传并显示短状态提示。ready 时保持对象候选读取与主输入接线。
- `uploadObjectImportAction` 在队列/target 写入前再次检查 readiness，以明确错误停止，不使用通用 catch 吞掉权限/数据库错误，也不伪造解析成功。
- 新增 `scripts/test-object-import-readiness.mjs` 覆盖未迁移、表不完整、已就绪三态及页面/上传门控；定向 pipeline、readiness、tsc、lint、diff-check 通过。
- 本地改动未推送；仍待一次性批准测试数据库迁移与认证浏览器读回，普通工程准备已完成。

## 已登录 Vercel/Neon 元数据核对（2026-09-17，前置阶段记录）
- 通过用户现有 Chrome 登录会话确认实际 Vercel 项目 `broker-desk-staging`（team `neos-projects-d66edfc8`）；环境变量页面显示 Preview + `staging/broker-desk-acceptance` 作用域。
- 只读观察到数据库/运行时配置名称：`DATABASE_URL`、`DATABASE_MIGRATION_URL`、`DATABASE_ADMIN_URL`、`DATA_DRIVER`、`BROKER_DESK_DEPLOYMENT_ENV`、`BROKER_DESK_AUTH_MODE`、`BROKER_DESK_STAGING_AUTH_ALLOWLIST`、Clerk/边缘限流配置及 Neon 生成的 `PG*`/`POSTGRES_*`；从未显示或复制值。
- 关联 Neon 资源：`broker-desk-staging-nonprod`，状态 `Available`，Free 计划，Neon ID `restless-sun-37465131`；Vercel project/integration 标识仅作资源定位。
- 该段记录的是完成 2FA 前的中间状态；后续同日已完成 Neon Console/SQL Editor 只读核对，最终事实以“已登录 Neon Schema 只读确认”和“Vercel 正式/测试项目资源绑定核对”两节为准。
- 新 Preview 继续不作为测试入口；本地兼容修复未推送，未执行迁移、部署或回滚。

## 已登录 Neon Schema 只读确认（2026-09-17）
- 在同一 Vercel Neon integration 的只读 Schema 页面完成现有登录会话核对，资源为 `broker-desk-staging-nonprod`（Neon ID `restless-sun-37465131`），对应 Preview 分支作用域 `staging/broker-desk-acceptance`。
- Neon Console 页面明确显示 branch `main` / ID `br-sparkling-sunset-az98ha2x`、project `broker-desk-staging-nonprod` / ID `restless-sun-37465131`；Databases 页面列出 `broker_desk_internal_alpha`（owner `brokerdesk_admin`）和 `neondb`（owner `neondb_owner`）。Vercel Neon resource 的 Schema/Query 页面 URL 使用 database `broker_desk_internal_alpha`、schema `public`。
- Neon SQL Editor 只读目录核对返回：`current_database=broker_desk_internal_alpha`、`current_schema=public`、`current_user=brokerdesk_admin`；`object_table_count=0`。账本表存在，指定迁移账本查询无结果；RLS/强制 RLS计数均为 0，因为两张新表尚不存在。
- Neon 角色只读核对：`brokerdesk_admin` 与 `brokerdesk_runtime` 均 `rolsuper=false`、`rolbypassrls=false`；`neondb_owner` 为 `rolbypassrls=true`，仅 SQL Editor/数据库 owner 角色，不得作为 Web runtime。该核对不证明 Vercel runtime 实际使用的连接角色，需迁移后从 Preview runtime 配置/受控 catalog 再验证。
- Schema 页面列表此前未显示两张新表；现在已用无客户数据的 `information_schema` 聚合查询交叉确认缺失，未读取客户记录。`broker_desk_schema_migrations` 中未找到 `20260917_001_object_import_targets.sql`，当前本地迁移文件（含强制附件追溯与租户复合 FK）SHA-256 为 `dd32f95fcd3a6bd07a4e6d909934eab886e70ca66bb05c39d6333f0d3e445c57`。
- Vercel Query 页初始 Run disabled 的可验证原因是编辑器为空（仅占位文本）；输入只读 SQL 后按钮启用，但执行返回 `Connection terminated unexpectedly`。随后 Neon 原生 SQL Editor 对受控只读目录查询成功，说明 Vercel Query 页的失败不能作为数据库缺表结论依据。
- 当前观察范围内已确认资源只绑定测试项目：`broker-desk-staging` Storage 显示 Connected Projects，`web` Storage 仅显示 Connect 且无 Production deployment；不再扩大到未知团队外或未来项目。剩余唯一运行时未知是 Preview Web runtime 实际 database/role 是否与上述目标一致，迁移前必须执行“目标/角色比对”并在不符时停止。
- 在 Tifa 另行授权前，不执行迁移、推送、部署、回滚，也不把新 Preview 宣称为可验收入口。

## Vercel 正式/测试项目资源绑定核对（2026-09-17）
- Vercel team 项目列表可见 `broker-desk-staging` 与 `web`。测试项目 Storage 页面显示 Neon resource `broker-desk-staging-nonprod` 的 Connected Projects 为 `broker-desk-staging`，状态 `Available`，环境 `Preview`，并提供 `Browse data`。
- 正式项目 `web` 的 Storage 页面对同名数据库仅显示可连接资源与 `Connect` 动作，没有 Connected Projects；其 Environment Variables 页面无项目变量。由此支持该资源当前绑定测试项目而非正式项目，但不证明其他团队/项目没有同一 Neon 资源引用。
- `web` 项目 Overview 当前 `Production Deployment` 为空、Production Checklist 为 `0/5`；该项目没有可见生产部署，仍不能替代对未来/团队外正式资源的隔离证明。
- 两个 Vercel 项目都能看到 Neon team integration 配置；这是共享 integration 安装层，不等于共享数据库连接。资源绑定结论以 Storage 页 Connected Projects 为准。
- 测试项目 Preview + `staging/broker-desk-acceptance` 作用域的数据库变量名已观察；正式项目没有同类项目变量。变量值从未查看或复制。
- 仍需受控 Preview runtime metadata 或非敏感连接元数据确认实际 Web runtime 的 database/role 与 Neon SQL Editor 连接一致；不能从变量名推断。
