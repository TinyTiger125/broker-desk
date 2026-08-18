# TASK-035 / W12 Checkpoint A 只读事实审计

日期：2026-08-18
范围：`/settings/members`、`/platform/accounts`、`/settings/ai-experience`、`/`
运行：不启动服务；统一运行探测已失败，浏览器/响应式/键盘/权限/租户项目进入批次回归。

## 已验证事实

### `/settings/members`

- 页面读取当前租户 `listTenantMembers(session.tenant.id)`。
- 角色、邀请状态、成员状态和外部登录绑定来自成员数据与既有枚举。
- 邀请、重发邀请、角色更新和停用/恢复分别调用现有 `inviteTenantMemberAction`、`sendTenantMemberInvitationAction`、`updateTenantMemberRoleAction`、`updateTenantMemberStatusAction`。
- 页面按当前成员权限决定操作可见性，没有创建新角色。

### `/platform/accounts`

- 页面通过 `requirePlatformOwnerSession` 保护，读取 `listPlatformTenantAccounts()`。
- 账户类型、生命周期、购买席位、已用/邀请/剩余席位和负责人邀请状态来自平台账户摘要。
- 开通账户、生命周期/席位更新和负责人邀请使用现有 Action。
- `/platform/templates` 是输出/模板专题入口，不属于平台账户列表的主任务。

### `/settings/ai-experience`

- 页面读取租户范围 `listAiExperienceDrafts` 与 `listCorrectionEvents`。
- `draft/approved/rejected` 是候选记录状态，不是案件事实完成度或 AI 准确率。
- 页面调用现有候选整理和审核 Action，支持状态筛选、启用和不使用。
- 当前四格数字是页面对候选/修正记录数量的聚合，不是业务 KPI。

### `/`

- 页面读取当前租户的案件、导入任务、物件、主体、合同和输出记录。
- 当前自行计算 `ready/needs_action/unassigned`、优先级、主体联系方式缺失、物件名称存在、案件 reviewed 等工作状态。
- 当前首页同时提供导入、整理、输出三张主入口卡，并包含资料助手、对象统计、关系提示、合同/输出聚合及 `focus` 链接。

## 代码推断、非权威表达与风险

- 成员和平台账户的状态/邀请/席位字段是权威数据，但页面的多重状态徽章、硬宽表格和模板入口造成操作竞争。
- AI 候选数量可用于任务筛选上下文，但不应以四格 KPI 或“审核 AI”工作台形式表达准确率、完成度或业务结果。
- 首页的 `ready/needs_action`、优先级和关系提示属于页面推导；主体 `relatedPropertyHint`、合同数量和输出数量不能代表首页业务完成或输出资格。
- 首页输出入口越过冻结输出专题；主体/物件 `focus` 入口与已收口索引契约不一致。

## 必须保留的真实业务能力

- 成员：邀请、角色调整、停用/恢复、重发邀请及现有权限守卫。
- 平台账户：平台身份拒绝状态、账户开通、生命周期/席位更新和负责人邀请。
- AI 经验：候选整理、状态筛选、明确启用/不使用和租户隔离。
- 首页：资料录入、信息整理、真实待处理摘要、必要的对象搜索和已有工作区身份。

## Checkpoint A 页面结论

| 页面 | Floorplan | 结论 |
|---|---|---|
| `/settings/members` | Member Management / Settings Worklist | 有限结构迁移；保留 Action/权限，改为窄屏可读结果结构，风险操作次级化 |
| `/platform/accounts` | Platform Administration List Report | 有限结构迁移；移除模板入口，保留平台账户/席位/邀请操作和拒绝 System State |
| `/settings/ai-experience` | Settings Form / Review Queue | 有限结构迁移；保留候选审核能力，移除伪 KPI 与卡片竞争，明确辅助边界 |
| `/` | Product Entry Page | 有限结构迁移；首屏收敛为录入、整理和真实待处理入口，移除输出越界与伪聚合 |

## 未验证项

真实服务、1440/768/390 页面表现、横向溢出、Tab/Enter/焦点、真实权限与租户拒绝、Action 运行反馈和完整无障碍均未运行验证，统一进入批次回归。

## 实现与独立审查收口

- `/settings/members`：保留成员、邀请、角色和状态 Action；改为 Settings Worklist，移除硬宽表格竞争，并在窄屏补充行内字段标签。
- `/platform/accounts`：保留平台账户、席位、生命周期和负责人邀请 Action；移除模板入口，改为平台 List Report，并补充窄屏字段标签。
- `/settings/ai-experience`：移除候选/修正数量伪 KPI和修正记录主流程，保留候选状态筛选与启用/不使用操作；增加 AI 仅作录入与整理辅助的说明。
- `/`：收敛为 Product Entry Page，只保留资料录入、信息整理、真实案件/导入待处理摘要和搜索；移除输出、合同、主体/物件聚合、关系提示、`focus` 和伪完成状态，并按现有任务事实生成恢复入口。
- 独立只读审查：PASS，无 P0/P1；成员停用前端确认仍为既有 P2 能力缺口，不在本批扩展。
- 专项契约脚本、typecheck、lint、build、workflow rules 和 `git diff --check` 均通过；未启动服务，运行与响应式项目保持 `UNVERIFIED`。
