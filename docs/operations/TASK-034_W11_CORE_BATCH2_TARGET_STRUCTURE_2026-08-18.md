# TASK-034 / W11-CORE 第二批目标结构与实现边界

- `/cases/new`：单表单 Responsive Form，页面身份、案件信息、明确主体/物件选择、取消/保存；不使用 Wizard、完成度、AI、输出状态或 FormDraftAssist。
- `/workspace`：保持现有 Workspace Selector/System State 和 `/api/workspace` 选择逻辑，不改权限、租户或 Clerk。
- `/board`：保留真实 `Client.stage` 七阶段 Kanban；桌面多列、768 压缩列、390 单列，保留现有拖拽 PATCH，不新增状态算法。
- `/relationship-tree`：Relationship Explorer 仅显示显式 ID 关系、来源导入任务和明确附件；不显示字符串匹配、默认首项、完成徽章、输出节点或关系写入。

允许修改：

- `src/app/cases/new/page.tsx`
- `src/components/board-kanban.tsx`
- `src/app/relationship-tree/page.tsx`
- `/workspace` 仅在不改变选择/权限逻辑的情况下允许页面结构性文件；本批预判无需修改
- TASK-034 专项契约脚本和治理文档

禁止修改：

- actions、API、数据库、migration、权限、认证、租户、Clerk；
- TASK-020、案件详情、149 项字段、输出/报价/模板页面；
- 第一批页面及 `src/app/clients/page 2.tsx`。

停止条件：专项脚本、typecheck、lint、build、workflow rules、diff check 和一次独立只读审查通过后独立提交并停止。
