# TASK-045 / 对象附件 V1

## 任务名称

对象附件 V1：OCR 原件留存、对象绑定与基础分类

- 状态: In Review

## 背景和用户结果

用户读取或上传案件、人物、物件资料后，原始文件不会在 OCR 后消失，而是作为可追溯附件保留在目标对象中，并可按基础资料类型查看和下载。

## 本次范围

- 原始上传文件继续只保存一份，不复制二进制内容。
- 通过附件关联把原件绑定到案件、人物或物件。
- 当前 OCR 抽取结果保存或合并到案件时，自动把该导入任务的源文件关联到案件。
- 案件、人物、物件详情显示“原始资料”区域，包含文件名、基础分类、上传时间、大小和下载入口。
- 可写对象允许继续上传 PDF、图片或 Excel，并选择基础分类。
- 附件元数据和下载都复用目标对象的服务端可见范围；跨租户、无父对象权限和只读写入必须拒绝。
- 同一附件与同一对象的重复关联保持幂等。

## 明确不做什么

- 不做自定义文件夹、任意标签、全文检索、外链分享、拖拽排序和版本管理。
- 不把批量 Excel 自动分发到多个人物或物件。
- 不在本任务重写人物/物件专用 OCR 建档流程；现有抽取确认仍以案件保存链路为边界。
- 不执行 Production migration 或 Production 部署。

## 依赖关系

- 基线：`main` `10ccab1514a33e05a36463080d4c803a9ee89d6a`。
- 隔离分支：`feature/object-attachments-v1-20260830`。
- 依赖 TASK-040 附件父对象权限和现有导入任务、私有附件存储、案件抽取确认链路。

## 验收标准

- 一份附件可关联对象，重复关联幂等，分类受白名单约束，案件抽取保存自动关联源文件。
- 只有至少一个可读父对象时才能取得附件元数据与文件内容。
- 只有目标对象可写时才能上传和建立关联。
- 案件、人物、物件页面均展示相同附件组件；只读成员只看不传。
- 工程门通过；运行时浏览器证据与 Production migration/部署保持为后续独立门。

## 预计涉及的模块

- `db/migrations/20260830_001_object_attachment_links.sql`
- `db/migrations/20260830_002_object_attachment_runtime_grant.sql`
- `src/lib/data.memory.ts`
- `src/lib/data.postgres.ts`
- `src/lib/data.ts`
- `src/lib/w93-access.ts`
- `src/lib/hub.ts`
- `src/lib/object-attachments.ts`
- `src/app/actions.ts`
- `src/components/object-attachment-section.tsx`
- `src/app/cases/[id]/page.tsx`
- `src/app/parties/[id]/edit/page.tsx`
- `src/app/properties/[id]/edit/page.tsx`
- `scripts/check-object-attachments-contract.mjs`
- `scripts/test-w93-access-behavior.mjs`
- `package.json`

## 风险和注意事项

- 附件只建立元数据关联，不复制原文件；下载仍必须经过租户与父对象权限解析。
- 若实现要求自动拆分批量 Excel、放宽父对象权限或改写人物/物件 OCR 建档，应停止而不是扩大本任务。
- 新 migration 只能随候选进入非生产环境；Production migration 与 Production 部署禁止。
- 固定 Staging 首次运行发现 `brokerdesk_runtime` 缺少新表权限；跟进 migration 必须显式授权并由专项合同锁定。

## 验证命令

```text
npm run test:object-attachments
npm run test:w93-access
npm run test:w93-access-behavior
npm run test:import-center-object-actions
npm run test:product-language
npm run test:workflow-rules
npm run build
npm run typecheck
npm run lint
git diff --check
```

## 当前状态

- 本地实现与确定性工程门已通过；等待固定 Staging 候选和浏览器运行时验收，Production 未发布。
