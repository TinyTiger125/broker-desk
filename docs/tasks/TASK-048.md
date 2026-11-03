# TASK-048 / 2026-11-01 反馈修复与完整回归

## 任务名称

反馈修复与完整回归

- 状态: Done
- 基线：`origin/main` 的 `81901825877b3c1ec7e32b68cfb1b8717ca47832`
- 实施候选：隔离工作树 `bd-feedback-20261101`

## 背景和用户结果

用户从正常入口上传客户、物件和案件资料时，识别状态必须真实可解释：清晰、归属明确且无冲突的字段才能进入正式记录；零可用值、归属不明、模型错误或归档失败不得显示成功。正式记录保存后，原件应可留存、查看和再次复核，人工值不能被重读覆盖。

反馈来源为 `Repo1101.pdf` 十页；客户识别到姓名时允许电话为空，但必须显示待补全状态。

## 本次范围

- P0 识别与持久化：区分文件接收、识别中、零可用值和正式保存，保留来源、状态、记录关联与重试语义。
- P1 录入和列表：候选结果紧凑可编辑，案件字段分组折叠，客户/物件列表与上传区改善密度、行点击、悬停和编辑可见性，统一读取文案。
- P1 案件和归档：案件类型只使用已有有效选项；案件名重复提示只链接可见记录；保管/归档为次要可恢复操作并清楚说明状态。
- 安全与发布门：001–006 migration、ACL、RLS、readiness、回退和本地/生产 postflight 证据。

## 明确不做什么

- 不把零结果、冲突值或读取失败写成成功，不创建空壳识别记录。
- 不新增无业务承接的字段、证件类型或专业工作流；不覆盖人工资料。
- 不把真实证件、PDF、私有 fixture、密钥或临时 production packet 放入 Git。
- 不以本地静态检查替代真实浏览器、数据库回读、权限/租户和生产 migration 证据。

## 依赖关系

- 依赖既有统一资料入口、对象资料归档、客户/物件/案件字段模型和租户可见性边界。
- 生产 001–006 migration 需由获授权操作执行，并以 ledger checksum、RLS、ACL 与 readiness postflight 验证。
- 代码发布只允许从指定基线快进；数据库回退遵循应用先回退、扩展表保留，危险删表必须 fail-closed 并显式批准。

## 验收标准

- 客户、物件、案件正常入口分别覆盖正式记录、原件留存/取回、刷新重开、人工值保护、重复请求和失败恢复。
- 新客户无电话、零识别值、冲突值、处理中超时和无权访问均显示真实状态，不制造重复记录。
- 1440/768/390 宽度下覆盖密度、对齐、折叠、键盘访问和 ja/zh/ko 文案。
- 定向测试、typecheck、lint、webpack build、workflow rules、`git diff --check` 通过；浏览器和数据库证据独立记录。

## 预计涉及的模块

- 识别/持久化：`src/lib/identity-import-processor.ts`、`src/lib/identity-import-queue.ts`、`src/lib/object-import-processor-adapter.ts`、`src/lib/object-import-review.ts`、`src/lib/identity-document-extractor.ts`、`src/lib/entry-preview.ts`、`src/app/entry-preview-actions.ts`、`src/app/entry-actions.ts`、`src/app/case-entry-actions.ts`、`src/app/actions.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`、`src/lib/data.ts`、`src/lib/entry-preview-proof.ts`、`src/lib/object-import-target-service.ts`、`src/lib/domain.ts`、`src/lib/options.ts` 及必要 migration。
- 界面：`src/components/entry-preview.tsx`、`src/components/client-form.tsx`、`src/components/property-responsive-form.tsx`、`src/components/client-identity-import-section.tsx`、`src/components/property-object-import-section.tsx`、`src/components/object-import-upload.tsx`、`src/components/object-import-status-badge.tsx`、`src/components/case-association-draft.tsx`、`src/components/archive-record-button.tsx`、`src/components/organize-center-object-browser.tsx`、`src/components/party-profile-form.tsx`、对象创建/详情页及直接样式。
- 治理与验证：本卡、`BACKLOG.md`、`docs/operations/CURRENT_WORKING_CONTEXT.md`、直接相关 `scripts/test-*.mjs` 与既有门禁脚本。

## 风险和注意事项

- 只有字段归属明确、值有效且无跨文件冲突的候选可自动写入现有字段；跨时间地址冲突必须留给用户核对。
- 原件归档失败或读取失败必须显示部分成功/可恢复动作；不能由预览成功覆盖失败状态。
- rollback 003/001 对 UUID/非空数据 fail-closed；删表不属于常规回退。
- 缺少真实回归环境、迁移无法安全回退、需要覆盖人工值或扩充字段时停止发布并报告。

## 验证命令

```text
npm run test:workflow-rules
npm run typecheck
npm run lint
npx next build --webpack
git diff --check
```

## 当前状态

- Release gate 已通过；生产 001–006 已由获授权操作执行并通过独立 postflight。
- postflight：ledger 共 62 条，20261102 的 6 条 migration checksum 精确匹配；`entry_request_claims` enabled + FORCE RLS；`brokerdesk_runtime` 仅 SELECT/INSERT/UPDATE、无 DELETE；`authenticated` 无 SELECT/INSERT/UPDATE。
- readiness 已要求 005 runtime ACL 与 006 authenticated ACL；停在 004 会拒绝，完整到 006 才接受。
- 最终候选以指定基线为父提交；临时 packet/evidence、真实证件/PDF、私有 fixture 和密钥不在 Git 写集内。默认 Turbopack 的本机 EPERM 限制不影响 webpack production build。
