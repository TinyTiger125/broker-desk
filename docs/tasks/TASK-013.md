# TASK-013：MIG-002 拆解并降级 PROJECT_MEMORY

- 状态: In Review
- 优先级: P0
- 负责人: 主 Agent / 实现Agent / 独立审查Agent
- 依赖关系: TASK-012 / MIG-001

## 任务名称

MIG-002：消除 `docs/PROJECT_MEMORY.md` 作为综合性第二权威的作用，将仍有效且独有的信息归入唯一规范来源，保留历史原文并退出活动启动路径。

## 背景和用户结果

进入项目后，Agent和开发者不会把 PROJECT_MEMORY 当作产品、架构、任务或执行规则的第二套来源；有效事实有唯一归属，历史内容仍可追溯但不会发出当前指令。

## 本次范围

- 逐节审计 `docs/PROJECT_MEMORY.md`，按段落或行为块记录来源、证据、分类和去向。
- 建立逐节迁移对照表，区分迁移、仅保留历史、不迁移和 Needs Review。
- 将经当前代码、Git、已批准决定或可靠专业文档支持且规范来源缺失的少量事实迁入 `PRODUCT.md`、`ARCHITECTURE.md` 或 `CONTEXT.md`。
- 只更新 `docs/operations/CURRENT_WORKING_CONTEXT.md`、`docs/README.md`、`BACKLOG.md` 和必要的直接引用。
- 建立带日期和来源说明的 `docs/archive/legacy-project-memory/PROJECT_MEMORY_2026_08_06.md` 历史快照。
- 在确认引用安全后，将原 `docs/PROJECT_MEMORY.md` 缩减为最小历史指针或移入归档路径；不得删除历史原文。
- 保留 TASK-012 的旧CLAUDE待迁移证据，并明确后续MIG-008负责核销，不把本任务当作旧CLAUDE内容的完整迁移。

## 明确不做什么

- 不修改业务代码、数据库、public、运行配置或产品方向。
- 不修改 `.cursor`，不处理 `CLAUDE 3.md`，不建立Playbook，不实施MIG-003及后续任务。
- 不根据 PROJECT_MEMORY 自述认定功能已实现，不把旧路线图、当前任务状态、发布记录或无法验证内容升级为当前事实。
- 不删除历史原文，不整段复制 PROJECT_MEMORY 到新的权威文件。
- 不提前执行MIG-004的日语术语裁决，不改变BACKLOG中既有业务任务状态。

## 依赖关系

TASK-012 / MIG-001 已完成；不依赖业务代码任务。

## 原文件逐节清单

实现前必须逐项填入本卡附录A；至少覆盖原文件全部标题、无标题段落、表格和行为说明，并记录精确行号。

## 信息迁移对照表

实现前必须逐项填入本卡附录B；每行至少包含：原行号、摘要、信息类型、现有规范来源、代码/Git/产品证据、建议去向、最终处理、风险和验证方法。

## 验收标准

1. `docs/PROJECT_MEMORY.md` 全部段落或行为块有逐项记录，没有按文件整体粗略判断。
2. 每项判断都有文件行号，并明确是否有当前代码、Git、已批准产品决定、规范文档或可重复测试支持。
3. PRODUCT、ARCHITECTURE、CONTEXT只接收经证据支持且各自职责范围内的独有内容，不互相复制。
4. 历史原文完整保存在带日期和来源说明的归档快照中，归档文件明确不得作为当前任务、产品、架构或执行授权。
5. 当前启动路径不依赖 PROJECT_MEMORY；必要引用已更新或明确标记为历史/非默认读取。
6. 原 PROJECT_MEMORY 不再保留综合性当前事实、任务状态、路线图或执行指令；若保留，只能是最小历史指针。
7. TASK-012 的旧CLAUDE待迁移证据仍存在，并明确由后续MIG-008处理；不得宣称旧CLAUDE独有信息已全部核销。
8. 没有业务代码变化、没有删除历史原文、没有修改 `.cursor` 或 `CLAUDE 3.md`。
9. 实现验证、独立审查、审查问题修复和最终Git状态检查全部通过。

## 预计涉及的模块

`docs/PROJECT_MEMORY.md`、`PRODUCT.md`、`ARCHITECTURE.md`、`CONTEXT.md`、
`docs/operations/CURRENT_WORKING_CONTEXT.md`、`docs/README.md`、`BACKLOG.md`、
`docs/tasks/TASK-013.md`、`docs/archive/legacy-project-memory/`、
必要的直接引用文件和 `scripts/check-workflow-rules.mjs`。

## 风险和注意事项

- 旧文件混合当前事实、历史记录和未来路线图；不得根据自述升级状态。
- 归档必须保留逐字原文，原路径只保留最小指针。
- `.cursor`、`CLAUDE 3.md`和业务代码禁止修改；旧CLAUDE独有内容由MIG-008负责。

## 验证命令

- `git status --short --branch --untracked-files=all`
- `git diff --check`
- `npm run test:workflow-rules`
- `npm run lint`
- `npm run typecheck`
- 全仓库 `PROJECT_MEMORY` 引用扫描，并逐项判断是否会改变默认启动路径。
- 全仓库历史入口、starting context、当前任务和默认读取声明扫描。
- 原文逐节与迁移对照检查：每个原块均有迁移、归档、不迁移或Needs Review结果。
- 当前规范来源重复定义检查，确认产品、架构、术语职责未互相复制。
- 归档路径默认读取检查，确认历史快照不会成为默认入口。
- `git diff --name-only`确认无业务代码、`.cursor`、`CLAUDE 3.md`或未授权文件变化。

## 回退方式

仅回退 MIG-002 独立提交，恢复迁入事实、当前交接、引用、归档快照和原 PROJECT_MEMORY 指针的提交前状态；不得切换、改写或删除 main、safety/WIP或历史提交。归档快照本身不得用删除方式回退，若需撤回以Git提交回退恢复原路径。

## 独立审查条件

- 实现Agent退出后，独立审查Agent只读核对原 PROJECT_MEMORY 全部行段、附录A/B、迁移目标、归档原文、引用扫描和验证证据。
- 审查重点：独有信息丢失、旧事实升级、重复定义、断链、历史文件发出当前指令、越权修改、归档原文不完整。
- 审查Agent不得修改、移动、删除或提交文件；结论必须为通过、需要修改或阻塞，并带行号证据。

## 当前状态

逐节审计和迁移对照表已完成；已确认没有需要新增到 PRODUCT、ARCHITECTURE 或 CONTEXT 的独有当前事实。实现Agent已完成归档、最小历史指针、直接引用和规则检查器修复，当前进入独立审查前的 `In Review` 状态。

## 实际修改文件与下一步

- 实际修改：`BACKLOG.md`、`docs/PROJECT_MEMORY.md`、`docs/README.md`、`docs/agents/domain.md`、`docs/agents/skill-writing-checklist.md`、`docs/archive/README.md`、`docs/archive/legacy-project-memory/PROJECT_MEMORY_2026_08_06.md`、`docs/engineering/RUNTIME_STABILITY_AND_ARCHITECTURE.md`、`docs/operations/CURRENT_WORKING_CONTEXT.md`、`docs/tasks/TASK-012.md`、`docs/tasks/TASK-013.md`、`scripts/check-workflow-rules.mjs`。
- 未修改：`PRODUCT.md`、`ARCHITECTURE.md`、`CONTEXT.md`、业务代码、数据库、public、运行配置、`.cursor`、`CLAUDE 3.md`。
- 下一步：完成本卡验证命令、归档逐行对照和引用分类；随后由独立审查Agent只读复核。不得在本任务内执行 MIG-003 或创建提交。

## 附录A：原文件逐节审计表

证据索引：

- E1：`PRODUCT.md:3-43`；产品定位、用户、核心流程、产品边界和稳定产品决定。
- E2：`ARCHITECTURE.md:1-53`；提交到 main 的运行、路由、数据、租户和验证架构。
- E3：`CONTEXT.md:1-227`；领域边界、工作流、术语、信任状态、输出和权限语义。
- E4：当前提交代码和迁移：`src/app/actions.ts:2857-2860,3142`、`src/lib/guarantee-application.ts:70`、`src/lib/friends-guarantee-pdf.ts:86,1825`、`src/lib/data.memory.ts:435,1701-1704,1740`、`db/migrations/20260805_004_tenant_guarantee_template_installs.sql:1-43`、`scripts/check-guarantee-template-publication.mjs:1-90`。
- E5：`docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md:1-25,71-72,200-206,317-325`、`docs/product/V1_CASE_WORKBENCH.md:1-13,89-93,206-231`、`docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md:5-9,37-89,430-438`、`docs/product/CANONICAL_FIELD_CATALOG.md:120-147`、`docs/product/AI_EXPERIENCE_MODEL_CONTEXT_CHAIN.md:1-112`、`docs/product/MULTI_TENANT_PERMISSION_MODEL.md:1-21,428-463`。
- E6：`docs/engineering/GUARANTEE_TEMPLATE_PUBLICATION.md:1-69`、`docs/engineering/POSTGRES_SETUP.md:1-142`、`docs/operations/PUBLIC_BETA_RELEASE_GATE.md:1-15`、`docs/operations/PM_CONTROL.md:301-371,469-500`；单主题工程、发布和PM资料。
- E7：Git事实：当前 `HEAD=2cb8f45`，当前分支为 `governance/clean-baseline-20260812`，main=`fedb4c9`，safety/WIP=`61bce51`；PROJECT_MEMORY:3、135-143、344、592-601、616-622 中的旧分支、外部路径、开发分支和未合入声明不属于当前架构事实。

| 原文件行段 | 内容摘要 | 信息类型 | 已有规范来源 | 当前代码/Git/批准决定支持 | 建议去向与最终处理 |
|---|---|---|---|---|---|
| 1-15 | 标题、日期、历史文件自述、更新规则；把稳定事实和发布门槛集中在本文件 | 重复内容；操作方法；权威声明 | E1-E3；MIG-001已规定入口 | 部分；入口已由AGENTS、当前交接和任务卡接管 | 不迁移；原文归档；原路径改为最小历史指针 |
| 17-34 | “可记录/不可记录”清单 | 操作方法；重复内容 | `AGENTS.md:45-83`、`TASK-013` | 有；治理规则已有唯一来源 | 不迁移；原文归档 |
| 36-43 | 固定读取顺序 | 重复内容；权威声明 | `AGENTS.md:10-16`、`docs/README.md:9-17` | 有；MIG-001已验证 | 不迁移；原文归档；直接引用改为AGENTS/当前交接 |
| 45-63 | 产品定位、三步主链路、不是CRM/PDF编辑器/AI聊天 | 稳定产品事实；重复内容 | E1、E3、`docs/product/PRODUCT_TOPOLOGY.md:1-118` | 有；规范来源已完整覆盖 | 不迁移；原文归档 |
| 65-72 | 整理信息是案件资料工作台，不是保证申请预填表；树、队列、搜索、状态和证据 | 稳定产品事实；领域边界；重复内容 | E3、`docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md` | 有；代码含`not_applicable`，文档有结构定义 | 不迁移；原文归档 |
| 74-82 | AI/RPA边界、Skill/Tool/Agent边界、产品数据库是记忆、先归属再上传 | 稳定产品事实；领域术语；重复内容 | E3、E5、`docs/product/V1_INPUT_FILE_MODEL.md` | 有；产品文档和代码边界已存在 | 不迁移；原文归档 |
| 84-93 | 2026-06-27输入系统实现检查点和未完成UX判断 | 历史事件；当前产品事实；重复内容 | `docs/operations/DEVELOPMENT_HANDOFF_2026_06_27.md`、E5 | 部分；实现状态须以当前代码和当前验收为准 | 仅保留历史；不迁移当前事实 |
| 95-111 | 2026-07-01友测、seed模式、QA重置、命令和Next缓存告警 | 历史事件；操作方法；运行风险 | `docs/operations/DEVELOPMENT_HANDOFF_2026_07_01.md`、脚本 | 部分；命令和环境状态会漂移 | 仅保留历史；不迁移 |
| 113-121 | 2026-07-14术语评审资料和不翻译原始业务数据规则 | 领域术语；重复内容；待MIG-004 | 两份术语字典、`JA_TERMINOLOGY_STYLE_GUIDE.md`、MIG-004决策 | 部分；用户可见冲突尚未裁决 | 不迁移；保留历史引用；MIG-004处理 |
| 123-133 | 2026-07-15产品/AI charter、验证阶段、AI-native定位、模型版本 | 稳定产品事实；架构事实；重复内容；时效性风险 | `docs/product/BROKER_DESK_PRODUCT_TECHNICAL_CHARTER_2026_07_15.md`、E3/E5 | 部分；模型版本和阶段描述会漂移 | 不迁移；原文归档，规范来源按需读取 |
| 135-143 | 两套外部本地环境、分支、端口和发布节奏 | 历史事件；操作方法；无法验证内容 | 无当前仓库规范来源；E7与当前正式仓库冲突 | 无；路径在当前机器不存在且不属于正式仓库 | 不迁移；仅保留历史；高风险旧入口信息 |
| 145-150 | 智能填写下线、AI经验链和检索边界 | 稳定产品事实；领域边界；重复内容 | `docs/product/AI_EXPERIENCE_MODEL_CONTEXT_CHAIN.md`、E3 | 有；代码和产品文档支持 | 不迁移；原文归档 |
| 152-160 | 官方模板共享发布、租户安装、快照、跨设备验收条件 | 当前架构事实；发布门槛；重复内容 | E2、E4、E6、`RELEASE_V0.2.0_RC2_2026_08_09.md` | 有/部分；代码和迁移支持机制，生产验收仍有门槛 | 不迁移；以E2/E6为规范，原文归档 |
| 162-170 | 目标用户、Excel/PDF痛点、保证申请切入点 | 稳定产品事实；重复内容 | E1、`docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md:5-9` | 有；已被PRODUCT和V1文档覆盖 | 不迁移；原文归档 |
| 172-181 | 官方PDF不可重绘、工作台中心、AI不是真相、模板权限 | 稳定产品事实；发布/安全门槛；重复内容 | E1-E3、E5-E6 | 有；多处规范来源已有定义 | 不迁移；不得再复制 |
| 183-207 | Next、数据驱动、PDF叠加、模板坐标、Responses API、模型默认值 | 当前架构事实；操作方法；重复内容；时效性风险 | E2、E5-E6、源码 | 有/部分；架构细节已有单主题来源，模型默认值可能变动 | 不迁移；原文归档 |
| 209-233 | 标准字段目录、确认数据、输出绑定、render fragment | 当前架构事实；领域术语；重复内容 | E3、`CANONICAL_FIELD_CATALOG.md`、E5 | 有；规范字段目录和源码支持 | 不迁移；原文归档 |
| 235-248 | 输入、抽取、审核、确认、选择保证公司、预览和官方PDF流程 | 稳定产品事实；领域边界；重复内容 | E1、E3、E5 | 有；当前代码有保证申请输出路径 | 不迁移；原文归档 |
| 250-295 | “已实现/阶段1-6”功能状态、租户、Clerk、RLS、QA和权限 | 当前任务状态；当前架构事实；历史事件；重复内容；无法验证内容 | E2、E4、E6、发布门禁 | 部分；代码支持部分机制，但“已实现/生产就绪”不能由旧文档自述证明 | 不迁移；以代码、Git和发布门禁为准；原文归档 |
| 296-303 | 2026-06-27路由和对象中心实现清单 | 历史事件；当前产品事实；重复内容 | E5、旧handoff、当前代码 | 部分；当前代码可验证，但状态仍属历史检查点 | 仅保留历史；不迁移 |
| 305-322 | 未达发布条件的模板、Clerk、RLS、UX和权限风险 | 发布/安全门槛；历史状态；重复内容 | E6、`PUBLIC_BETA_RELEASE_GATE.md`、`PUBLIC_BETA_REMEDIATION_PLAN_2026_08_09.md` | 部分；门禁是当前风险来源，PROJECT_MEMORY状态本身不权威 | 不迁移；以发布门禁和单主题Runbook为准 |
| 324-366 | 五家模板质量、Jリース历史校准和未完成选项框 | 历史事件；发布/质量门槛；重复内容；无法验证内容 | `V1_GUARANTEE_APPLICATION_OUTPUT.md`、`GUARANTEE_TEMPLATE_PUBLICATION.md`、E6 | 部分；代码有模板和渲染逻辑，但历史质量数字需重新验证 | 仅保留历史；不迁移 |
| 368-375 | 数字分段、下载门禁、durationYears和视觉Smoke原则 | 当前架构事实；操作方法；重复内容 | E4、`V1_GUARANTEE_APPLICATION_OUTPUT.md`、测试脚本 | 有；源码和测试可验证 | 不迁移；保留在源码/工程Runbook，避免塞入ARCHITECTURE |
| 377-384 | PDF、扫描件、模板坐标、memory driver和运行时风险 | 发布/安全门槛；重复内容；时效性风险 | E5-E6、`PUBLIC_BETA_RELEASE_GATE.md` | 有/部分；风险已有单主题来源，运行状态需重新验证 | 不迁移；原文归档 |
| 386-438 | 模板编辑权限、租户生命周期、归档恢复、禁止物理删除 | 稳定产品事实；当前架构事实；安全门槛；重复内容 | E3、`MULTI_TENANT_PERMISSION_MODEL.md`、`RECORD_LIFECYCLE.md` | 有；规范文档和代码权限模型支持 | 不迁移；原文归档 |
| 440-448 | 保证表单高覆盖但非全自动、手工确认和安全输出衡量 | 稳定产品事实；发布/质量门槛；重复内容 | `V1_GUARANTEE_APPLICATION_OUTPUT.md`、E5/E6 | 有；V1输出文档已有边界 | 不迁移；原文归档 |
| 450-482 | 2026-06-11运行事故、恢复命令、架构教训和CLAUDE降级 | 历史事件；操作方法；安全门槛；重复内容 | `RUNTIME_STABILITY_AND_ARCHITECTURE.md`、AGENTS/CLAUDE | 部分；事故是历史证据，恢复方法属工程Runbook | 仅保留历史；直接引用PROJECT_MEMORY改到工程Runbook |
| 484-510 | 历史下一步、未来路线图、封闭公测前清单 | 当前任务状态；历史事件；路线图；发布门槛 | BACKLOG、产品/运营Runbook、发布门禁 | 无/部分；不是当前任务授权 | 不迁移；原文归档 |
| 511-541 | 通用检查、视觉Smoke、预览和下载URL | 操作方法；重复内容；时效性风险 | ARCHITECTURE验证入口、任务卡、工程Runbook | 有/部分；命令和URL随代码变化 | 不迁移；按任务卡或Runbook读取 |
| 543-550 | 2026-06-11变更日志、邮编主数据规则 | 历史事件；领域事实；重复内容 | `CANONICAL_FIELD_CATALOG.md:131-147`、Git历史 | 有；规范字段目录和脚本支持 | 仅保留历史；不重复迁移 |
| 552-561 | 2026-06-18租户、账号、邀请、Clerk bootstrap历史 | 历史事件；当前架构事实；安全门槛；重复内容 | E2、E6、源码和迁移 | 有/部分；实现存在但生产配置仍有门禁 | 仅保留历史；不迁移 |
| 563-567 | 2026-06-21工作台与输出分离决定 | 稳定产品事实；领域边界；重复内容 | E1、E3、E5 | 有；已批准产品方向和规范文档支持 | 不迁移；原文归档 |
| 569-574 | AI/RPA、Agent/Skill/Tool、产品数据库记忆、owner-first | 稳定产品事实；领域术语；重复内容 | E3、E5 | 有；当前规范来源已完整覆盖 | 不迁移；原文归档 |
| 576-582 | 2026-06-27设备交接、对象中心脚手架、UX未完成 | 历史事件；当前任务状态；重复内容 | 旧handoff、E5、当前代码 | 部分；只能作为历史证据 | 仅保留历史；不迁移 |
| 584-590 | 2026-07-12开发分支交接、友测变化和验证 | 历史事件；当前任务状态；操作方法 | `DEVELOPMENT_HANDOFF_2026_07_12.md`、Git历史 | 无；不属于当前main架构 | 仅保留历史；不迁移 |
| 592-615 | 明确标为开发分支未合入的P0改动和验证 | 历史事件；当前任务状态；无法验证内容 | E7；safety/WIP规则 | 无；当前HEAD不含这些改动 | 仅保留历史；绝不迁入当前规范 |
| 616-622 | 2026-08-01压缩交接、开发环境预览验证和下一步 | 历史事件；当前任务状态；操作方法 | `DEVELOPMENT_HANDOFF_2026_08_01_CONVERSATION_COMPACT.md` | 部分；明确是开发环境证据，不能代表当前main | 仅保留历史；不迁移 |
| 624-633 | 2026-08-06模板库、登录、workspace、云Postgres和beta边界 | 当前架构事实；发布/安全门槛；历史事件；无法验证内容 | E2、E4、E6、`RELEASE_V0.2.0_RC2_2026_08_09.md` | 部分；部分代码支持，外部配置和生产验证不能由文件自述证明 | 不迁移；以代码/发布门禁为准，原文归档 |

审计总判断：PROJECT_MEMORY 的“综合性第二权威”内容没有一项同时满足“当前有效、规范来源缺失、代码/Git/批准决定支持、迁入不制造第二定义”而必须新增到 PRODUCT、ARCHITECTURE 或 CONTEXT。因此本次实际迁移目标是退出活动路径、保留完整历史原文、修复直接引用；PRODUCT、ARCHITECTURE、CONTEXT不改写。

## 附录B：信息迁移对照表

| 信息簇 | 原始行段 | 唯一规范来源 | 从原文提取的独有信息 | 冲突裁决 | 最终处理 | 验证 |
|---|---:|---|---|---|---|---|
| 治理规则与读取顺序 | 1-43 | `AGENTS.md`、`docs/README.md`、当前交接、任务卡 | 无；全部是治理入口或索引 | 以MIG-001后的AGENTS和当前交接为准 | 不迁移；归档原文；原路径改指针 | `test:workflow-rules`、入口扫描 |
| 产品定位与核心流程 | 45-72,162-181,235-248,563-567 | `PRODUCT.md`、`CONTEXT.md`、E5 | 无；已完整存在 | 以当前PRODUCT/CONTEXT及已批准V1决定为准 | 不迁移；归档 | 重复定义扫描 |
| AI、记忆和输入边界 | 74-82,145-150,569-574 | `CONTEXT.md`、E5 | 无；产品数据库记忆和人工确认规则已存在 | 以CONTEXT和AI专文为准，不把PROJECT_MEMORY当更新入口 | 不迁移；归档 | 引用和术语扫描 |
| 术语审查 | 113-121 | 两份2026-07-14字典、MIG-004 | 无；冲突词尚未获用户裁决 | 不在MIG-002裁决用户可见词 | 不迁移；归档 | 确认MIG-004仍在BACKLOG/任务范围 |
| 当前架构、字段和权限 | 183-248,250-295,368-438,552-561,624-633 | `ARCHITECTURE.md`、CONTEXT、E4-E6 | 无；可验证事实已有单主题来源 | 代码/Git优先；生产配置和未验证状态不得升级 | 不迁移；归档 | code/Git对照、架构职责扫描 |
| 模板质量与输出边界 | 152-160,324-366,440-448 | `V1_GUARANTEE_APPLICATION_OUTPUT.md`、`GUARANTEE_TEMPLATE_PUBLICATION.md`、发布门禁 | 无；质量和模板机制已有来源 | 以当前代码、模板测试和发布门禁为准，不复制旧质量数字 | 不迁移；归档 | 相关测试、重复扫描 |
| 环境、命令和运行事故 | 95-111,135-143,450-482,511-541 | 工程Runbook、任务卡、测试脚本 | 运行事故叙述只作为历史证据；外部机器路径没有当前归属 | 当前正式仓库和可重复命令优先；外部环境信息不进入架构 | 归档；更新直接引用到Runbook或任务卡 | 路径存在性、命令扫描 |
| 历史路线图和任务队列 | 84-93,484-510,576-622 | BACKLOG、历史handoff、归档 | 历史决策和时间线 | 当前任务只由BACKLOG/任务卡决定 | 仅保留历史 | 旧入口扫描 |
| 邮编主数据和字段微拆分 | 209-233,543-550 | `CANONICAL_FIELD_CATALOG.md`、源码 | 无；邮编和render fragment已有唯一来源 | 不在ARCHITECTURE重复 | 不迁移；归档 | 字段目录与源码对照 |
| 旧CLAUDE保护证据 | 与PROJECT_MEMORY重叠的74-482、552-633 | `TASK-012.md`，后续MIG-008 | PROJECT_MEMORY不能替代旧CLAUDE全部独有历史 | 保留MIG-008责任，不提前核销 | 归档并在TASK-013保留风险说明 | 任务卡和引用扫描 |

## 迁移执行清单

1. 创建 `docs/archive/legacy-project-memory/PROJECT_MEMORY_2026_08_06.md`，加历史元数据和“不得作为当前权威”声明，正文逐字保留。
2. 将 `docs/PROJECT_MEMORY.md` 改为最小历史指针，只指向归档快照、`docs/README.md`、当前交接和任务卡，不再包含综合正文。
3. 更新直接活动引用：`docs/agents/domain.md`、`docs/agents/skill-writing-checklist.md`、`docs/engineering/RUNTIME_STABILITY_AND_ARCHITECTURE.md`、`docs/archive/README.md`、`scripts/check-workflow-rules.mjs`；历史handoff和旧任务卡中的历史引用只登记，不改写。
4. 不修改 PRODUCT.md、ARCHITECTURE.md、CONTEXT.md，因为本审计没有发现满足迁移门槛的独有当前事实。
5. 保留 `TASK-012.md` 中的旧CLAUDE待迁移证据，并在本任务完成记录中明确MIG-008仍未完成。
