# TASK-034 / W11-CORE 第二批 Checkpoint A 代码与数据事实审计

日期：2026-08-18
范围：`/cases/new`、`/workspace`、`/board`、`/relationship-tree`
运行：不启动服务；真实浏览器、响应式、键盘、权限和租户项目直接进入统一批次回归。

## `/cases/new`

### 已验证事实

- 页面只有一个 `createBlankBrokerageCaseAction` 提交，读取当前租户的 `listQuoteFormData`，提供案件标题、工作流类型、主体和物件选择。
- Action 将案件保存为 `draft`，写入 `confirmedDataJson` 中的显式选择标记，并写入现有审计；新建成功进入 `/cases/{id}`。
- 页面当前使用 `FormDraftAssist`，且通过 `from=entry` 在导入中心和整理信息之间切换返回。

### 代码推断与非权威表达

- 没有多步顺序业务事实；使用 Wizard 会制造假步骤，应采用 Responsive Form。
- Action 在标题为空时生成默认标题，在工作流类型上提供默认 `rental_application`；本批不改 Action，但该兼容行为应在审计中如实保留。
- `FormDraftAssist` 不是业务保存事实，且可能造成草稿与案件保存语义混淆；从本页移除调用。

### 结论

有限迁移为 Responsive Form：保留一次保存、主体/物件选择、成功返回和安全来源；移除草稿助手及并列创建主体/物件入口。错误摘要和服务端保存语义不扩张到第二套 Action。

## `/workspace`

### 已验证事实

- 页面使用 `listTenantMemberships`、`getTenantById` 和 `isTenantAccessibleStatus`，只构造 active 且租户状态可访问的工作区选项。
- 工作区名称是 `WorkspaceSelector` 的主要按钮；选择通过现有 `/api/workspace` 写入工作区上下文后进入 `/`。
- 无工作区时显示明确 System State；选择失败显示错误提示。

### 运行/兼容边界

- 页面通过当前兼容 `getDefaultUser` 获取用户，真实登录身份和租户隔离未运行验证；不修改选择或权限逻辑。

### 结论

已符合唯一 Workspace Selector / System State，不修改。

## `/board`

### 已验证事实

- `getBoardData` 按当前用户、租户和持久化 `Client.stage` 分组，阶段为 `lead/contacted/quoted/viewing/negotiating/won/lost`。
- `BoardKanban` 的拖拽调用现有 `/api/clients/{id}/stage` PATCH；卡片名称链接进入客户详情，数量来自各阶段实际记录。

### 非伪事实与结构问题

- 阶段、数量、预算和联系日期均来自客户记录；未发现随机时间线或伪优先级。
- 组件使用 `min-w-[1120px]` 七列硬宽布局，窄屏结构不符合 Layout System；只改布局为响应式单列/多列，不改拖拽保存契约。

### 结论

迁移为真实阶段 Work Board/Kanban；保留拖拽和阶段 API，修正 390/768 结构，不新增阶段算法。

## `/relationship-tree`

### 已验证事实

- 页面读取案件、主体、物件、合同关联记录、附件、导入任务和输出记录。
- 案件 `primaryPropertyId`、`sourceImportJobIds`、附件 `targetType/targetId` 和合同 `clientId` 是可追溯字段。

### 非权威表达

- `includesLoose` 使用姓名、区域、`relatedPropertyHint` 进行字符串匹配，不能证明主体、物件或案件关系。
- 缺少选择时默认使用各集合第一条；这会伪造用户选择上下文。
- 节点 `complete/insufficient/unconfirmed` 由联系方式、价格、状态推导，不是关系状态。
- 输出节点越过冻结的输出专题；合同 `focus` 链接与已迁移合同页契约不一致。

### 结论

改为 Relationship Explorer：只显示显式案件主体/物件、来源导入任务、明确附件和主体直接关联记录；删除字符串推断、默认首项、关系状态徽章、输出节点和关系写入能力。没有显式关系时显示诚实 System State。

## 页面结论

| 页面 | Floorplan | 结论 |
|---|---|---|
| `/cases/new` | RF | 有限迁移，移除草稿/并列创建入口 |
| `/workspace` | SS / Workspace Selector | 已符合，无需修改 |
| `/board` | WB / Kanban | 有限响应式修正，保留真实阶段拖拽 |
| `/relationship-tree` | Relationship Explorer | 删除推断关系和输出越界，显式关系不足时诚实展示 |

## 未验证项

真实服务、浏览器、1440/768/390、键盘/焦点、登录身份、权限、租户隔离、保存失败恢复和关系数据完整性均未运行验证，统一进入批次回归。

## 第二批实施与独立复审收口

- `/cases/new` 已完成有限 Responsive Form 收口：保留现有单次 `createBlankBrokerageCaseAction`、租户范围主体/物件选择和来源返回；移除 `FormDraftAssist` 及并列创建主体/物件入口。
- `/workspace` 无需修改，继续作为唯一 Workspace Selector/System State。
- `/board` 已完成有限响应式修正：继续使用持久化 `Client.stage` 七阶段和现有 `/api/clients/{id}/stage` PATCH；移除最小桌面宽度与横向硬滚动，改为窄屏单列、平板双列和桌面多列。
- `/relationship-tree` 已完成 Relationship Explorer 收口：只读取显式 ID 关系、来源任务、附件目标和直接合同 `clientId` 关系；合同关系无详情链接，避免制造不存在的 `focus` 契约；移除字符串推断、默认首项、伪状态、输出节点和写入能力。
- 独立只读审查结论：`PASS`，无 P0/P1；范围未越界至 actions、API、数据适配、权限、租户、数据库、第一批页面或 `src/app/clients/page 2.tsx`。
- 专项契约脚本、typecheck、lint、build、workflow rules 和 `git diff --check` 通过；第二批不启动服务，真实浏览器、响应式、键盘、焦点、权限/租户和完整动作行为保持 `UNVERIFIED`，进入统一批次回归。
