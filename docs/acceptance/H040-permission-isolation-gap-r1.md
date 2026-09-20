# H040 团队权限与公司资料隔离盘点（r4 候选）

日期：2026-09-20
基线：`19d7916`（`19d79163de45d85490934f45268d60d50e1cd476`）
范围：基于只读核查的窄修候选与纯内存合成回归；未创建邀请、未切换权限、未改数据库/配置/Production，未部署。

## 结论

当前代码已经把主要人物/物件列表、详情页和更新 action 接入同一 `RequestContext` 可见性解析器。旧 r1 中“人物/物件整体仍是 tenant-only”已过时，不能继续作为当前代码结论。

本轮又确认并修复了三处可达缺陷：报价列表/详情改用 context-bound 读取；报价附件下载与列表统一按关联人物/物件交集解析；导入中心附件列表和手动附件登记对人物/物件/报价父对象增加可见性/写入权检查。另修正了 import_job 在关联案件不可读时仍出现在列表中的绕过。候选尚未提交、推送或部署，等待 Tifa 独立审查。

同公司 `private` / `company_read` / 跨租户的 resolver、列表、详情、搜索、count、导出和 W93 附件/输出来源检查，纯内存合成测试均通过；这仍不是真实 Clerk 多身份、Staging 浏览器或 PostgreSQL 运行验收。

## 当前代码已核实

| 范围 | 证据 | 结论 |
|---|---|---|
| 上下文与 resolver | `src/lib/visibility-resolver.ts:52-92,108-129` | `createRequestContext` 只接受可信租户会话；租户、active membership、owner resolution、`private/company_read` 和 canWrite 均 fail-closed。 |
| 人物列表/详情 | `src/lib/data.memory.ts:5245-5287,5423-5439`；`src/app/clients/page.tsx:279-289`；`src/app/parties/[id]/edit/page.tsx:28-47` | 列表和详情先按 resolver 过滤；引用报价中的物件再次独立解析；详情页按 `canWrite` 渲染编辑或只读。 |
| 物件列表/详情 | `src/lib/data.memory.ts:5344-5370`；`src/app/properties/page.tsx:212-216`；`src/app/properties/[id]/edit/page.tsx:100-126` | 列表、详情同样按 resolver；`company_read` 进入只读页，不显示编辑表单。 |
| 人物/物件更新 action | `src/app/actions.ts:663-679,939-967,2146-2200,2385-2416` | action 先用 resolver 要求 `canWrite`，再调用 tenant-scoped 更新函数；正常页面 action 未发现绕过 resolver 的调用。 |
| 原始附件下载 | `src/lib/w93-access.ts:64-81`；`src/app/api/attachments/[attachmentId]/route.ts:19-64` | 先解析唯一父对象或导入案件，再读取租户私有存储；父对象不可读时返回 404。 |
| 生成输出与来源 | `src/lib/w93-access.ts:84-133`；`src/app/api/outputs/[id]/download/route.ts:19-85` | 输出必须属于可读案件，且快照中的人物/物件/报价来源全部可读；随后校验 MIME、ready、文件大小和 SHA-256。 |
| 普通成员最终输出能力 | `src/lib/tenant-permissions.ts:285-315` | 当前 `ordinary_member` 明确包含 `output.generate_final` 与 `output.download_final`。不能用旧 broker 文档把 H039 的普通员工最终生成/下载权限判为关闭。 |

### r4 增量证据

- 报价附件缺陷曾真实复现：报价所有者可看到附件，但 W9.3 父对象解析返回空，造成列表/下载不一致。现已增加显式 `quote` 分支，要求关联人物与物件均可读；覆盖 owner/private、`company_read`、撤销可见性、未知报价、跨租户。
- `contract` 旧附件类型保留兼容路径，但现在按真实 `targetId=quote` 要求关联人物与可选物件的完整可读交集；这修复了“人物 `company_read`、物件 `private` 时合同仍可下载”的 P1。`att_contract_yamada` / `att_demo_shinjuku_application` 具备真实报价链路，但其物件 fixture 的 owner resolution 未完成，因此按 fail-closed 隐藏；新增有效 owner/company_read 交集回归覆盖保留路径。`service_request` 与 `guarantee_*` 没有统一的普通附件父对象合同：列表继续 fail-closed；保证文件沿用专用下载路由，通用附件路由明确拒绝。当前 fixtures 没有可供普通附件列表展示的 `service_request`/`guarantee_*` 样本，不能宣称这些类型的展示验收。
- `import_job` 在无 object target、无 linked case、且没有任何 attachment link 时允许原上传者在同租户 active session 找回本人来源；一旦存在案件/物件父关联或任何不可读 link，则必须通过父对象可读性，不能回退到上传者身份绕过。附件列表现在直接复用同一 W9.3 判定，不再二次自判。跨租户、他人来源和有父但不可读均拒绝；“本人上传但存在不可读 link”已有精确回归。
- 报价列表与详情/人物报价 count 统一采用 `lifecycleStatus: "all"`。已覆盖“物件归档但授权用户仍可读”的列表与详情，未新增分页/count 接口；若产品决定归档报价应隐藏，需要同时改变列表、详情与 count，而不是只改一页。

## 当前代码缺口与候选修复

1. **附件元数据列表：已修复候选。** `src/lib/hub.ts:listHubAttachments` 现在要求可信 `requestContext`；人物/物件/案件附件经 `getW93AttachmentForContext` 过滤，报价附件经 `getQuotationByIdForContext` 过滤，未知目标类型 fail-closed。`src/app/import-center/page.tsx` 传入当前会话上下文。`registerAttachmentAction` 对人物、物件、报价登记增加父对象 owner-write 检查；直接下载路由仍保留 W93 父对象检查。
2. **报价列表/详情：已修复候选。** `src/app/quotes/page.tsx` 改用 `listQuotationsForContext`；详情新增 `getQuotationByIdForContext`，人物或物件不可读时直接 not found，`company_read` 仅显示只读状态控制。候选同时覆盖 memory/PostgreSQL repository 与 data facade。
3. 底层 `updateClient` / `updateProperty`（memory 与 PostgreSQL）本身只接受 tenant-scoped 参数，不携带 `RequestContext`；当前页面 action 已在调用前执行 ownership resolver，但底层 API 缺少防御性 actor 约束。当前未发现未受保护的正常页面调用，列为后续设计缺口，不在本候选中扩大写集。

## 保证申请书权限边界

最新切片合同（`docs/product/GUARANTEE_APPLICATION_G1_SLICE_1_TECHNICAL_DESIGN_2026-08-19.md:119-129`）规定普通成员只能读取案件权威事实、填写本次申请书专属补充数据、预览和生成文件，不能从输出页改写案件事实；并明确沿用 `output.preview`、`output.download_final`。这与当前 capability preset 一致。旧 r1 将“普通 broker 最终输出权限待定”写成当前阻塞，属于过时文档判断，已移除。

H039 已在同一 staging 案件上完成字段保存、模板专属选项保存、预览确认和 UI 的“下载可”状态；浏览器下载被客户端安全策略拦截，实际 PDF 文件/哈希仍未取得。因此 H040 不把 H039 的下载能力写成已完成的文件交付证明。

## 纯内存合成测试

以下测试均不连接数据库、不改共享数据，只在进程内创建合成身份和记录：

- `npm run test:visibility-resolver-behavior` — PASS
- `npm run test:global-visibility-surfaces-behavior` — PASS
- `npm run test:w93-access-behavior` — PASS
- `npm run test:visibility-resolver` — PASS
- `npm run test:global-visibility-surfaces` — PASS
- `npm run test:w93-access` — PASS
- `npm run typecheck` — PASS
- `npm run lint` — PASS（仅既有 2 条 warning，无 error）

测试覆盖 owner/private、同公司 `company_read` 只读、撤销可见性、跨租户负向、搜索/count/导出候选、报价列表/详情和附件/输出来源交集。它们不能替代真实身份、页面导航、数据库 RLS 或成员生命周期验证。

## 最小后续验收

无需平台管理员参与数据页验收。准备同一公司两名合成普通成员，再准备第二家公司一名合成成员；使用既有合成案件、人物、物件、附件和已生成输出，分别标记 `private`、`company_read`、`pending`。

1. 同公司两名成员：验证列表、详情、搜索、count、直接 URL、只读更新拒绝、附件元数据/下载和输出元数据/下载；额外覆盖报价附件、历史合同附件与关联 import_job。
2. 跨公司第三名成员：验证同一批对象、附件、输出和模板副本全部拒绝且不泄露存在性。
3. 在此之前，先决定 `service_request` 与 `guarantee_*` 是否需要纳入普通附件列表；当前代码按 fail-closed 和专用路由边界处理，未新增未定义的父对象权限模型。
4. 不创建邀请、不暂停/移除成员、不修改共享数据；仅使用已有 fixture 或经 Tifa 明确允许的受控测试数据。

## 状态

本报告是当前代码差距盘点及未部署窄修候选，不是团队隔离验收通过证明。候选写集待 Tifa 独立审查；通过后再安排固定 staging 集中提交、推送和两名同公司普通成员 + 一名跨公司成员的受控浏览器矩阵。

## 依据

- `docs/tasks/TASK-039.md`
- `docs/product/TASK-040_W9.2_FACT_MATRIX_2026-08-24.md`
- `docs/product/TASK-040_W9.2_RUNTIME_VERIFICATION_2026-08-24.md`
- `docs/tasks/TASK-043.md`
- `docs/operations/ROLE_AUTH_E2E_ACCEPTANCE.md`
- `docs/product/GUARANTEE_APPLICATION_G1_SLICE_1_TECHNICAL_DESIGN_2026-08-19.md`
- `src/lib/visibility-resolver.ts`
- `src/lib/w93-access.ts`
