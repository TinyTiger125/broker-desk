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
  - 新增对象与案件租户触发器；附件若存在必须属于该导入任务。
  - 两表启用并强制 RLS；策略同步检查租户、案件 visibility、party/property visibility 与当前用户写权限。
- 处理器在已有 target 的 job metadata 被通用 mapping 改写时 fail-closed：`object_import_metadata_mutated`。
- review action 在单事务内锁定 target、对象和候选；版本、候选值、案件关联或权限不一致时回滚。
- 幂等键已包含 `caseId`，同案件重复上传去重，跨案件不会复用旧任务。

## 现有资料影响

- 迁移为加法，无历史数据回填；现有 `import_jobs`、`attachments`、party/property 记录保持不变。
- 新上传只有在通过案件/对象关联与可写校验后才创建对象导入 target。
- `sourceAttachmentId` 当前可为空；上传文件已经以 `attachments.target_type='import_job'`、`target_id=import_job_id` 保存，处理器按该 job 读取原文件，因此同租户可追溯性已有基础。候选 provenance 仍以来源 hash/位置为主。
- 处理器只产生 model draft；确认/拒绝才会写对象字段，拒绝不改对象。

## 事务、失败与恢复

- Postgres review 使用事务和 `FOR UPDATE`；对象更新、候选状态、target 状态、审计日志同一事务提交，任一 CAS/权限/关联失败均回滚。
- 主输入 action 调用 `saveCaseWorkbenchWithObjectReview`；Postgres 在同一 `withTransaction` 内锁定并更新对象、候选、target、审计和案件字段，任一步失败均回滚。内存驱动先完成全部校验，再在单次同步写入中更新两侧并保留回滚快照供测试。
- 内存驱动在检查与变更之间不插入 await，提供等价 CAS 合同。
- 处理器 metadata 改写、外租户、脱关联、失效版本均 fail-closed；上传/解析失败进入失败状态，不覆盖对象。
- 执行前恢复：保持当前未执行状态即可；若迁移执行失败，应由同一事务回滚并保留 migration ledger 记录。若已产生测试数据，优先回退应用到 720 基线并保留两张表数据，禁止直接删表作为常规回滚；删除仅限空库演练且需独立审批。

## 待执行验证（仍需明确授权）

1. 在隔离非生产数据库执行迁移，并核对两表 `relrowsecurity=true`、`relforcerowsecurity=true`、FK、触发器和策略。
2. 配置受限 `DATABASE_ADMIN_URL` 后运行 worker authorization 与真实事务/RLS 矩阵；当前未配置，之前检查在连接前停止。
3. 使用认证员工会话上传身份资料与 Excel，分别验证 party/property：解析、低置信黄色、冲突红色、确认、拒绝、刷新/重开。
4. 验证同案件重复上传去重、跨案件隔离、跨租户拒绝、对象归档/visibility 变化后的读取与写入拒绝。
5. 对真实 OCR/Excel fixture 做来源附件绑定与候选 provenance 检查。
6. 真实 Postgres 环境验证同一事务的第二段失败回滚、并发冲突、正常保存及刷新读回；当前环境缺少数据库连接配置。

## 仍缺少的必要条件

- 隔离非生产数据库标识、migration ledger/执行窗口与受限数据库凭据。
- 本次只读环境核对：`DATABASE_URL`、`DATABASE_ADMIN_URL`、`.env`、`.env.local`、`.env.test` 均缺失；没有可验证的测试数据库身份或隔离证据，未尝试连接。
- 可复现的认证浏览器会话及真实 OCR/Excel 测试文件。
- 对 `sourceAttachmentId` 是否必须强制绑定的产品/数据决定。
- Tifa 的最终产品决定；在此之前不执行迁移、不部署、不推送。
