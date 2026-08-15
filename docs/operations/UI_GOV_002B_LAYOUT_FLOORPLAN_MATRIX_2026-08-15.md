# UI-GOV-002B Layout Floorplan 映射矩阵

- 状态: Draft，作为 TASK-024 阶段 A 设计输入
- 规范来源: [`BROKER_DESK_LAYOUT_SYSTEM_V1.md`](BROKER_DESK_LAYOUT_SYSTEM_V1.md)
- 路由盘点来源: [`UI_GOV_001_PAGE_MIGRATION_MATRIX_2026-08-14.md`](UI_GOV_001_PAGE_MIGRATION_MATRIX_2026-08-14.md)
- 说明: 本矩阵只冻结页面类型语言和迁移顺序，不批准本轮页面代码迁移

## Floorplan 目录

| 代码 | 主 Floorplan | 适用任务 |
|---|---|---|
| WL | Worklist | 处理下一项任务、阻塞或待办 |
| LR | List Report | 查找、筛选、排序一批对象 |
| OP | Object Page | 通读一个复杂业务对象 |
| RF | Responsive Form | 创建/编辑一组资料 |
| WZ | Wizard | 有顺序的输入、识别和决策流程 |
| PC | Preview & Confirmation | 文书预览、确认和下载 |
| RE | Relationship Explorer | 阅读对象关系网络 |
| AS | Auth Shell | 登录/注册 |
| SS | System State | 加载、错误、Not Found 等支持状态 |

## 38 个业务路由

| 路由 | 主任务 | 主 Floorplan | 局部结构 | 迁移顺序 | 不允许改变 |
|---|---|---|---|---:|---|
| `/` | 判断今天先处理什么 | WL | 状态摘要、筛选、任务行 | 8 | 真实任务来源；不虚构 KPI |
| `/import-center` | 上传资料并完成识别、归属、新建/追加/合并决策 | WZ | 步骤、恢复、读取异常 | 6 | 资料处理、422 人工恢复、归属语义 |
| `/organize-center` | 找到需要补全/整理的对象 | WL | List Report 结果区、筛选 | 4 | 找对象和进入案件；不承担详情编辑 |
| `/cases/[id]` | 通读、编辑案件并进入输出 | OP | Dynamic Header、锚点、RF 字段组 | 2 | C+、案件字段、权限、输出门禁 |
| `/templates` | 搜索并安装租户可用模板 | LR | 过滤、结果、局部安装 | 7 | 租户可见性、安装持久化、非平台发布 |
| `/output-center` | 找到可输出或被阻塞的案件 | WL | 筛选、任务行、模板选择 | 5 | 案件/模板选择、失败恢复 |
| `/guarantee-applications/[templateId]/preview` | 预览正式申请书并进入下载门禁 | PC | 文书预览、阻塞、确认 | 5 | 模板数据、官方日文标题、下载语义 |
| `/guarantee-applications/friends-guarantee/preview` | 预览朋友保证申请书并下载 | PC | 文书预览、阻塞、确认 | 5 | PDF 内容、模板对应、返回路径 |
| `/cases/new` | 无资料直接创建案件 | RF | 创建表单、错误、返回 | P1 | 不与导入 Wizard 的新建/追加/合并混为一谈 |
| `/clients` | 搜索和快速创建客户 | LR | Filter Bar、结果、快速创建 | P1 | 客户与主体的业务边界 |
| `/clients/[id]` | 查看客户详情和关联事项 | OP | Header、Section、局部任务 | P1 | 客户领域和关联数据来源 |
| `/clients/[id]/edit` | 编辑客户资料 | RF | 字段组、保存/取消 | P1 | 保存、取消、返回和权限 |
| `/clients/new` | 创建客户 | RF | 字段组、错误、返回 | P1 | 创建语义和权限 |
| `/parties` | 搜索和维护主体 | LR | Filter Bar、结果、生命周期 | P1 | 主体角色、归档、租户边界 |
| `/parties/[id]/edit` | 编辑主体资料 | RF | 字段组、局部错误 | P1 | 主体字段和权限 |
| `/parties/new` | 创建主体 | RF | 角色提示、字段组 | P1 | 业务角色语义 |
| `/properties` | 搜索和维护物件 | LR | Filter Bar、结果、行操作 | P1 | 物件与案件/主体关系 |
| `/properties/[id]/edit` | 编辑物件资料 | RF | 复杂字段组、保存/取消 | P1 | 物件数据和权限 |
| `/properties/new` | 创建物件 | RF | 字段组、辅助填写、错误 | P1 | 创建语义；不扩张 AI 审核 |
| `/contracts` | 筛选、批量更新和处理合同 | WL | 结果区、批量动作、跨域入口 | P1 | 合同、报价、模板和审计边界 |
| `/service-requests` | 处理服务请求队列 | WL | 筛选、任务行、批量动作 | P1 | 服务请求状态和权限 |
| `/audit-log` | 检索并导出审计记录 | LR | Filter Bar、长表、导出 | P1 | 审计只读和导出权限 |
| `/settings/output-templates` | 设置输出说明和记录 | RF | 设置表单、历史折叠区 | P1 | 不引入 TASK-005 发布语义 |
| `/settings/case-workbench-fields` | 设置案件字段规则 | RF | 规则表单、保存反馈 | P1 | 不修改 149 项目录和适用性契约 |
| `/settings/members` | 管理租户成员和角色 | LR | 成员结果、局部编辑 | P1 | 权限、角色、租户隔离 |
| `/platform/templates` | 平台管理员查看官方模板 | LR | 过滤、结果、平台操作 | P1 | 普通租户不可见；不带入租户安装行为 |
| `/platform/templates/[templateId]` | 平台管理员查看/编辑模板 | OP | 详情、Authoring 局部区 | P1 | TASK-005 draft/publish 隔离 |
| `/platform/accounts` | 管理租户账号 | LR | 结果、创建表单、生命周期 | P1 | 平台权限和租户边界 |
| `/board` | 以看板查看任务阶段 | WL | Kanban 结果区 | P2 | 状态权威和入口是否保留 |
| `/workspace` | 进入工作区并查看下一步 | WL | 空态、入口任务 | P2 | 与首页的入口边界 |
| `/quotes` | 查看和筛选报价 | LR | Filter Bar、结果、创建入口 | P2 | 报价业务边界 |
| `/quotes/new` | 创建报价 | RF | 字段组、错误、取消 | P2 | 报价流程语义 |
| `/quotes/[id]` | 查看报价详情并复制 | OP | 详情章节、局部操作 | P2 | 报价数据和复制行为 |
| `/quotes/[id]/print` | 已退役打印入口 | SS | Not Found/返回 | P2 | 不为了视觉统一恢复退役能力 |
| `/relationship-tree` | 阅读案件、主体、物件关系 | RE | 关系分组、节点、返回 | P2 | 不建立第二套对象详情权威 |
| `/settings/ai-experience` | 管理 AI 经验候选 | WL | 状态筛选、审核任务 | P2 | 不把后台 AI 概念带回主业务流程 |
| `/sign-in/[[...sign-in]]` | 登录 | AS | 认证表单、错误、返回 | P2 | Clerk 认证语义 |
| `/sign-up/[[...sign-up]]` | 注册 | AS | 认证表单、错误、返回 | P2 | Clerk 注册语义 |

## 3 个系统状态入口

| 文件 | 主任务 | 主 Floorplan | 不允许改变 |
|---|---|---|---|
| `src/app/loading.tsx` | 表达路由加载中 | SS | 不伪装为空态或成功 |
| `src/app/error.tsx` | 表达可恢复路由错误 | SS | 不泄露数据，不吞掉恢复路径 |
| `src/app/not-found.tsx` | 表达资源不存在 | SS | 不恢复已退役业务能力 |

## 迁移顺序与依赖

1. TASK-024 阶段 A：Layout Contract、矩阵和目标图；不改代码。
2. TASK-024 阶段 C：目标图批准后，只实现公共组合组件和案件总览“申请人” Responsive Form 试点。
3. 案件总览试点通过后，按 `organize-center → output-center/preview → import-center → templates → home` 及 P1/P2 单独任务迁移。
4. 首页最后处理；不得提前生成 KPI、重复入口或脱离真实业务状态的卡片。

每个页面迁移任务必须单独验证桌面、平板、手机、中日韩长文本、键盘、空态、错误态、加载态和业务回归；不得用本矩阵代替页面级验收。
