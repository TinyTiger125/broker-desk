# TASK-046 / 退役输出与孤儿代码清理

## 任务名称

退役普通输出实现与确认孤儿代码一次性清理

- 状态: Done
- 基线: `origin/staging/broker-desk-acceptance` `8a2f6b273a59f67cbe701c16fd391a0bb3d4ff96`
- 隔离分支: `cleanup/output-orphans-20260831`

## 背景和用户结果

当前正式输出中心只展示保证公司申请书流程，但源码仍编译一整套固定不渲染的旧报价/物件输出界面、废止 Action 与退役打印路由；仓库还保留一组无运行消费者的历史 UI Module 和异常副本。清理后，现行保证申请书流程保持不变，仓库不再维护这些不可达实现。

## 本次范围

- 删除 Output Center 中固定不可达的 legacy proposal/property 输出读取、筛选、预览、打印和下载界面。
- 删除只会抛出“已废止”错误的 `generateOutputDocumentAction` 及其整块注释实现。
- 删除退役的 `/quotes/[id]/print` 路由。
- 删除已确认无运行消费者的 7 个 UI Module、其专属样式，以及两个 tracked 异常副本。
- 删除已失去对应运行实现的静态合同引用，并新增本任务的清理合同。

## 明确不做什么

- 不修改保证公司申请书生成、预览、下载、模板、权限或历史输出数据。
- 不修改 Client、Subject、Case Role、memory/PostgreSQL Adapter 或数据库 schema。
- 不删除用户未跟踪的 `src/app/clients/page 2.tsx`。
- 不清理测试专用 Module、历史 migrations、公共 API 或其他无主导航路由。
- 不执行 Production migration 或 Production deployment。

## 依赖关系

- 以已包含 TASK-045 附件修复的固定 Staging `8a2f6b2` 为唯一实现基线。
- 依赖现有保证申请书 Worklist、预览和下载合同；不依赖旧普通输出实现或数据库变更。

## 预计涉及的模块

以下同时是本任务唯一授权写集：

- `BACKLOG.md`
- `docs/tasks/TASK-046.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`
- `package.json`
- `scripts/check-code-asset-cleanup-contract.mjs`
- `scripts/check-output-center-worklist-contract.mjs`
- `scripts/check-global-visibility-surfaces.mjs`
- `scripts/check-button-interaction-contract.mjs`
- `src/app/output-center/page.tsx`
- `src/app/actions.ts`
- `src/app/quotes/[id]/print/page.tsx`
- `src/app/templates/page 2.tsx`
- `src/lib/excel-workbook 2.ts`
- `src/components/case-progress-experience.tsx`
- `src/components/global-search-box.tsx`
- `src/components/kpi-card.tsx`
- `src/components/object-workbench-shell.tsx`
- `src/components/pdfme-official-template-designer.tsx`
- `src/components/print-toolbar.tsx`
- `src/components/ui-gov-003-preview/case-object-preview.tsx`
- `src/components/ui-gov-003-preview/case-object-preview.module.css`

## 验收标准

- Output Center 不再 import、读取、渲染或链接退役普通输出链路。
- `/quotes/[id]/print` 与废止 Action 不再存在；现行保证申请书选择、预览和下载入口仍存在。
- 目标孤儿文件全部删除，仓库无对应 import、动态 import 或静态合同读取。
- build、typecheck、lint、output-center、button、visibility、product-language、workflow 与 cleanup 合同通过。
- 独立只读审查 P0=0、Product P1=0、Engineering P1=0。

## 风险和注意事项

- 无主导航入口不单独构成删除依据；本任务只删除已完成 import、动态 import、字符串入口与静态合同复核的目标。
- `global-search-box` 和 `pdfme-official-template-designer` 曾被静态合同读取但没有运行消费者；删除时必须同步移除失真的合同引用。
- 历史输出数据和当前保证申请书链路保持不变；如工程门发现运行消费者，立即停止而不是恢复整套旧界面。

## 验证命令

```text
npm run test:code-asset-cleanup
npm run test:output-center-worklist
npm run test:button-interactions
npm run test:global-visibility-surfaces
npm run test:product-language
npm run test:workflow-rules
npm run build
npm run typecheck
npm run lint
git diff --check
```

## 停止条件

如删除目标仍有运行消费者、需要恢复普通报价输出、影响保证申请书或要求数据迁移，立即停止并回报，不扩大本任务。

## 当前状态

- 3,219 行退役/孤儿实现已从候选移除；cleanup、Output Center、button、visibility、product-language、workflow、build、typecheck、lint 与 diff-check 均通过，lint 仅 2 个既有 warning。
- 独立只读审查结论：GO，P0=0、Product P1=0、Engineering P1=0、P2=1。
- P2：cleanup checker 目前只核对目标文件不存在并检查少量关键字符串，尚不是全仓 import/route/contract 自动扫描；本候选已由独立全仓反查与 production build 覆盖，不阻断本任务。
- 已以普通快进方式合入固定 Staging；尚未执行 Production deployment 或 migration。
