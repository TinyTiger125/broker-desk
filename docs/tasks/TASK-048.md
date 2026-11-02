# TASK-048 / 2026-11-01 反馈修复与完整回归

## 目标与基线

- 状态：Release gate passed；生产迁移 001–006 已由获授权操作执行并通过独立 postflight；代码从指定基线进入本次最终快进发布提交；基线：`origin/main` 的 `81901825877b3c1ec7e32b68cfb1b8717ca47832`。
- 本轮使用隔离工作树 `bd-feedback-20261101`，保留旧工作树的未提交现场。
- 用户结果：正常入口中，客户、物件和案件的上传识别结果立即进入正式记录，原件留档，用户可反复编辑和复核；无可用结果不能显示成功。
- 反馈来源：`Repo1101.pdf` 十页；客户电话为空可建档并标记待补全，是 2026-11-01 明确决定。

## 开发顺序

1. **P0 识别与持久化**：区分“文件已接收”“识别中”“零可用值”“已保存”；零值、归属不明、模型错误不得报完成。只有字段归属明确、值有效、无跨文件冲突的候选可自动写入现有字段。原件、来源、状态与记录关联；重读不覆盖人工修改。新客户识别到姓名时允许电话为空，显示待补全。
2. **P1 录入和列表**：候选结果改为紧凑可编辑视图，去掉逐条反映/拒绝按钮；案件长字段区按现有分类折叠；客户列表与详情上传区缩小并提高行点击、悬停、编辑可见性；统一“读取”文案。
3. **P1 案件和归档**：案件类型只组织现有有效选项，不假造未实现流程；输入案件名时提示可访问的既有案件并链接打开，避免误建同名记录；“保管”作为归档放入次要操作并解释后果，过滤器用清楚的状态名称。

## 写集

- 本卡及 `docs/operations/CURRENT_WORKING_CONTEXT.md`、必要的 `BACKLOG.md`。
- 识别/持久化：`src/lib/identity-import-processor.ts`、`src/lib/identity-import-queue.ts`、`src/lib/object-import-processor-adapter.ts`、`src/lib/object-import-review.ts`、`src/lib/identity-document-extractor.ts`、`src/lib/entry-preview.ts`、`src/app/entry-preview-actions.ts`、`src/app/entry-actions.ts`、`src/app/case-entry-actions.ts`、`src/app/actions.ts`、`src/lib/data.memory.ts`、`src/lib/data.postgres.ts`、`src/lib/data.ts`、`src/lib/entry-preview-proof.ts`、`src/lib/object-import-target-service.ts`、`src/lib/domain.ts`、`src/lib/options.ts` 及必要的数据库 migration。
- 界面：`src/components/entry-preview.tsx`、`src/components/client-form.tsx`、`src/components/property-responsive-form.tsx`、`src/components/client-identity-import-section.tsx`、`src/components/property-object-import-section.tsx`、`src/components/object-import-upload.tsx`、`src/components/object-import-status-badge.tsx`、`src/components/case-association-draft.tsx`、`src/components/archive-record-button.tsx`、`src/components/organize-center-object-browser.tsx`、`src/components/party-profile-form.tsx`、`src/app/organize-center/page.tsx`、`src/app/cases/new/page.tsx`、`src/app/clients/page.tsx`、客户与物件的创建/详情页，以及其直接样式文件。
- 验证：本轮直接相关的 `scripts/test-*.mjs`，必要时更新 `package.json` 以注册检查。

## 验收与停止条件

- 正常用户入口：客户证件、物件文件、案件文件分别上传，检查正式记录已创建或更新、原件可查看下载、编辑后重开值不丢失、人工值不被重读覆盖。
- 新客户无电话、零识别值、冲突值、无权访问、重复请求、处理中超时均显示真实状态；不得制造空壳成功或重复记录。
- 1440/768/390 宽度下检查密度、对齐、折叠、键盘访问和日/中/韩文案。
- 定向测试、类型、lint、build、完整公开测试门、`git diff --check` 通过；浏览器实走和数据库回读形成证据后才可统一提交、推送 GitHub 并更新正式环境。
- 如必须扩充字段、覆盖人工资料、迁移无法安全回滚、缺少真实回归环境或证据，则停止发布并报告具体缺口。

## R11 发布收口（2026-11-02）

- 独立审查 R16：代码 GO；生产 postflight：ledger 共 62 条，20261102 的 6 条迁移 checksum 全部精确匹配，`entry_request_claims` 为 enabled + FORCE RLS，`brokerdesk_runtime` 仅保留 SELECT/INSERT/UPDATE（无 DELETE），`authenticated` 无 SELECT/INSERT/UPDATE。
- readiness 已要求 005 runtime ACL 与 006 authenticated ACL；停在 004 的 ledger 会被 `ensureSchema()` 拒绝，完整到 006 才接受。回退语义为应用先回退、claims 扩展表与 ledger 保留；数据库 rollback 003/001 对 UUID/非空数据 fail-closed，删表仅限空表且显式批准的应急路径。
- 本轮隔离证据不含真实证件、PDF、私有 fixture、密钥或个人值；临时 production packet/evidence 保留在 `/private/tmp`，不进入 Git。
- 定向 readiness、production-security、typecheck、lint、`npx next build --webpack` 与 `git diff --check` 已通过。默认 `npm run build` 的 Turbopack 在本机因子进程绑定端口 EPERM 失败；webpack 构建成功，未发现代码/类型编译错误。
