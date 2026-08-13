# TASK-014：MIG-003 固化 V1 唯一主输出边界

- 状态: Done
- 优先级: P0
- 负责人: 主 Agent / 实现Agent / 独立审查Agent
- 依赖关系: TASK-013 / MIG-002

## 任务名称

MIG-003：固化“保证公司申请书是V1唯一主输出”的产品文档边界。

## 背景和用户结果

当前活动产品文档只把保证公司申请书（`保証会社申込書`）描述为 V1 唯一主产品输出。旧的物件概要、提案、费用明细、资金计划、报价、合同包等仅作为未来候选或历史兼容，不进入当前 V1 导航、任务范围或完成标准。官方资料索引仍然保留，但查看或下载官方资料不等于生成产品输出。

## 已确认产品决定

1. V1唯一主输出：保证公司申请书 / `保証会社申込書`。
2. 正式模板保留原始官方名称，例如 `保証委託申込書`、`入居申込書兼保証委託申込書`。
3. 官方资料查看或下载不等于产品生成输出。
4. 旧输出类型可以保留为历史读取、未来候选或旧页面兼容证据，但不得继续作为当前 V1 主流程、导航入口、完成标准或Agent默认范围。
5. 本任务只统一产品文档事实，不修改代码、实际页面行为或用户可见页面文字。

## 本次范围

- 建立当前活动产品文档的输出冲突对照表。
- 统一 `PRODUCT.md`、`CONTEXT.md`、`docs/product/PRODUCT_TOPOLOGY.md`、`docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`、`docs/product/V1_INPUT_FILE_MODEL.md`、`docs/product/V1_CASE_WORKBENCH.md`、必要的 `docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md` 和官方资料登记表的 V1 输出边界。
- 必要时更新 `docs/README.md`、BACKLOG、当前交接和本卡。
- 保留未来候选、历史兼容和官方资料证据，不删除旧类型。

## 明确不做什么

- 不修改 `src/`、`db/`、`public/`、业务配置或任何实际页面行为。
- 不修改用户可见页面文字、导航实现、旧页面、旧深链或历史数据兼容。
- 不执行 MIG-004 术语裁决，不修改 `.cursor`，不建立Playbook。
- 不改写历史验收、handoff、release、design-audit或带日期的历史产品资料。
- 不修改模板 draft/publish 实现，不删除官方资料索引，不开始后续迁移任务。

## 依赖关系

TASK-013 / MIG-002 已完成；本任务只处理活动产品文档边界，不依赖业务代码修改。

## 实施前冲突对照表

| 文件和行号（执行前） | 当前表述/语义 | 类型 | 是否冲突 | 规范来源 | 本次动作 | 历史是否保留 |
|---|---|---|---|---|---|---|
| `PRODUCT.md:5-7,17-19,37-39` | 泛称“官方业务文书”和“生成可追溯文书”，未说明唯一 V1 输出 | V1产品事实 | 是，可能被理解为多个主输出 | `PRODUCT.md` | 明确唯一主输出为保证公司申请书，收窄主流程措辞 | 否；旧泛称不构成独立历史证据 |
| `CONTEXT.md:118-142` | 已定义 `保証会社申込書`，但 `Output Artifact` 同时举例客户摘要、租约包、业主通知和报告 | 领域语义/输出边界 | 部分冲突；通用术语可能被读成当前V1范围 | `CONTEXT.md` | 保留通用术语，明确只有保证公司申请书是当前V1主输出，其余为未来/兼容示例 | 否 |
| `PRODUCT_TOPOLOGY.md:15,102-118` | 产出标准业务文书、官方或标准模板 | 当前V1拓扑 | 是，输出族未收敛 | `PRODUCT_TOPOLOGY.md` | 改为保证公司申请书及其官方模板族；其他文书不进入当前主链 | 否 |
| `PRODUCT_TOPOLOGY.md:180,218,235,338,342` | 输出中心可选择文书并生成；设置项使用泛称文书模板 | 当前导航/拓扑事实 | 是，容易形成并列生成入口 | `PRODUCT_TOPOLOGY.md` | 明确输出中心和模板设置只服务保证公司申请书族 | 否 |
| `PRODUCT_TOPOLOGY.md:240,398,435-436` | 报价、物件概要、合同等旧路径和输出 artifact 与当前输出并列出现 | 历史兼容/拓扑风险 | 是，旧路径可能被当作当前V1输出 | `PRODUCT_TOPOLOGY.md` | 标记为历史兼容、后台或未来候选，不改变实际路由 | 是，保留兼容事实 |
| `PRODUCT_TOPOLOGY.md:487,507-515,743` | 标准输出、many outputs、generated output availability 等泛称 | V1优先级/完成语义 | 部分冲突 | `PRODUCT_TOPOLOGY.md` | 改为保证公司申请书输出及保证公司模板扩展，不删除未来扩展方向 | 否 |
| `V1_GUARANTEE_APPLICATION_OUTPUT.md:5-13,68-85` | 已以保证申请为优先并列出未来输出，但“priority”仍不够明确为唯一当前主输出 | 单主题产品规范 | 部分冲突 | 本文件 | 固化唯一主输出、未来候选、导航和完成标准边界；补充官方标题/来源区别 | 否 |
| `V1_INPUT_FILE_MODEL.md:102,238` | 使用“first priority/current target”描述保证申请输出 | 输入侧产品事实 | 部分冲突，可能暗示还有当前并列输出 | `V1_INPUT_FILE_MODEL.md`引用 V1 输出规范 | 改为当前V1唯一生成输出，并只引用输出规范 | 否 |
| `V1_INPUT_FILE_MODEL.md:735` | 将 property overview PDF path列入输入侧验收标准 | 当前完成标准 | 是，旧输出进入当前完成标准 | 输入规范只负责输入兼容 | 改为兼容性保留，不作为V1完成条件 | 否 |
| `V1_CASE_WORKBENCH.md:183` | “before adding more output templates”范围不清 | 工作台扩展边界 | 轻度冲突 | 工作台规范引用 V1 输出规范 | 明确是保证申请模板族内扩展，其他输出族属于未来候选 | 否 |
| `V1_CASE_INFORMATION_ARCHITECTURE.md:13-15,357` | V1信息架构把报价、广告、合同等输出模块写成可直接启动的并列下游，并称事实复用于multiple outputs | 当前V1信息架构 | 是，容易被理解为当前V1并列输出 | `V1_CASE_INFORMATION_ARCHITECTURE.md` | 明确当前只有保证公司申请书；其余为未来候选/兼容；保留可复用事实模型 | 否 |
| `MULTI_TENANT_PERMISSION_MODEL.md:19-21` | 说明权限覆盖完整文档生命周期，并以保证申请作为一个重要V1输出消费者 | 权限覆盖范围 | 否；这是权限边界，不定义产品输出范围 | `MULTI_TENANT_PERMISSION_MODEL.md` | 不修改；权限仍覆盖完整生命周期，不能误收窄为单一输出权限 | 否 |
| `OFFICIAL_JAPAN_DOCUMENT_SOURCE_REGISTRY_2026_07_26.md:23-37` | 已登记旧输出清单，但未明确登记表不定义V1生成范围 | 官方资料索引 | 是，可能将资料登记误读为产品输出范围 | 官方资料登记表 | 明确查看/下载不等于生成，旧清单是未来候选或历史兼容 | 是，清单本身保留 |
| `docs/product/FRIEND_TEST_INPUT_WORKBENCH_PLAN_2026_07_09.md:157-165` | 旧输出已写明放在辅助区域 | 历史产品材料 | 否；方向已一致 | 历史证据 | 不修改 | 是 |
| `docs/product/BROKER_DESK_PRODUCT_TECHNICAL_CHARTER_2026_07_15.md` | 存在通用输出和文书流程描述 | 历史产品材料 | 不作为当前入口 | 当前活动产品规范 | 不修改；不让历史材料定义V1范围 | 是 |

## 预计涉及的模块

`PRODUCT.md`、`CONTEXT.md`、`docs/product/PRODUCT_TOPOLOGY.md`、
`docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`、
`docs/product/V1_INPUT_FILE_MODEL.md`、`docs/product/V1_CASE_WORKBENCH.md`、
`docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md`、
`docs/product/OFFICIAL_JAPAN_DOCUMENT_SOURCE_REGISTRY_2026_07_26.md`、
`BACKLOG.md`、`docs/operations/CURRENT_WORKING_CONTEXT.md`和本任务卡。

## 迁移对照

| 主题 | 唯一当前来源 | 其他内容处理 | 具体要求 |
|---|---|---|---|
| V1产品事实 | `PRODUCT.md` | 专业文档只引用，不另立产品范围 | 写明唯一主输出和未来候选边界 |
| 领域词义 | `CONTEXT.md` | 不提前统一完整日语词典 | 仅定义保证公司申请书族和官方资料/生成输出区别 |
| 页面与流程拓扑 | `docs/product/PRODUCT_TOPOLOGY.md` | 旧路由留作兼容/后台风险记录 | 主链固定为资料输入→整理确认→保证公司申请书预览→导出/打印 |
| 主输出规范 | `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md` | 其他输出只列未来候选或兼容，不复制流程正文 | 消费确认数据、模板选择、缺失字段、预览、导出/打印和官方标题边界 |
| 输入与工作台 | `docs/product/V1_INPUT_FILE_MODEL.md`、`docs/product/V1_CASE_WORKBENCH.md` | 只修正直接冲突，不复制主输出规范 | 输入/确认链只引用唯一主输出规范 |
| 官方资料 | `docs/product/OFFICIAL_JAPAN_DOCUMENT_SOURCE_REGISTRY_2026_07_26.md` | 保留登记清单和官方原名 | 明确索引、查看、下载不等于生成输出 |

## 验收标准

1. 活动产品文档中只有 `保証会社申込書` 被描述为 V1 唯一主产品输出。
2. V1主流程统一为：资料输入 → 案件信息整理与确认 → 保证公司申请书预览 → 导出或打印。
3. 旧输出类型仍可被读取、作为未来候选或兼容证据，但不出现在当前V1导航要求、任务范围或完成标准中。
4. 官方资料登记表、官方原名和来源证据仍然存在，并明确不等于生成输出。
5. 不提前完成MIG-004，不修改历史资料、代码、实际页面行为或用户可见文字。
6. PRODUCT、CONTEXT、拓扑和单主题输出规范职责不重复，不出现大段复制。
7. BACKLOG、TASK-014和CURRENT_WORKING_CONTEXT状态一致。
8. 实现Agent验证、独立审查和最终Git状态均通过。

## 风险和注意事项

- 泛化的“输出”“文书”“模板”措辞可能继续被误读为多个V1主输出，必须以冲突表逐项核对。
- 旧页面和代码可能仍存在其他输出类型；本任务只登记，不修改实际行为。
- 官方资料清单和正式模板原名不能因产品范围收敛而删除或改名。
- MIG-004术语裁决尚未完成，不能借本任务扩大日语词汇统一范围。

## 验证命令

- `git status --short --branch --untracked-files=all`
- `git diff --check`
- `npm run test:workflow-rules`
- `npm run lint`
- `npm run typecheck`
- 当前活动产品文档扫描多主输出、并列生成入口、旧输出进入V1完成标准的表述。
- `保証会社申込書`主流程和规范来源引用扫描。
- 官方资料/官方原名与生成输出边界扫描。
- 历史产品文件、代码、页面文字和禁止路径的修改范围扫描。
- 修改文档链接存在性和任务状态一致性检查。

## 回退方式

只回退本任务独立提交，恢复本任务修改的产品文档、BACKLOG、当前交接和TASK-014；不切换、不改写、不删除main、safety/WIP或历史提交。回退不得删除历史候选清单或官方资料索引。

## 独立审查条件

实现Agent退出后，独立审查Agent只读检查冲突表、每项文档修改、唯一主输出语义、官方资料边界、未来候选保护、历史文件未改、代码/页面文字未改、断链和验证证据。结论必须为通过、需要修改或阻塞，并附路径和行号证据。

## 实际修改文件与实现结果

- `PRODUCT.md`：明确稳定产品事实和V1唯一主输出。
- `CONTEXT.md`：明确领域输出语义、官方资料与生成输出的区别。
- `docs/product/PRODUCT_TOPOLOGY.md`：收敛当前页面和流程拓扑，旧输出标为兼容/后台/未来候选。
- `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`：固化保证公司申请书单主题规范、官方标题和来源边界。
- `docs/product/V1_INPUT_FILE_MODEL.md`：收窄输入侧输出目标，移除旧物件概要PDF作为当前完成标准的含义。
- `docs/product/V1_CASE_WORKBENCH.md`：仅修正保证公司模板族扩展边界。
- `docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md`：修正当前V1并列输出语义，保留未来复用信息架构。
- `docs/product/OFFICIAL_JAPAN_DOCUMENT_SOURCE_REGISTRY_2026_07_26.md`：保留官方资料和旧候选清单，明确不定义V1生成范围。
- `BACKLOG.md`、`docs/operations/CURRENT_WORKING_CONTEXT.md`、本卡：状态和交接同步。

没有修改代码、数据库、public、页面文字、`.cursor`或历史产品资料。实现Agent未产生补丁，项目经理在同一授权范围内完成了明确的文档修改；独立审查已通过。

## 验证与独立审查结果

- `git diff --check`：通过。
- `npm run test:workflow-rules`：通过。
- `npm run lint`：通过。
- `npm run typecheck`：通过。
- 11份修改Markdown共检查15个本地相对链接，断链0。
- 活动产品文档输出语义扫描通过；长段落重复扫描为0。
- 多租户权限模型原文与父提交一致，确认它只定义权限覆盖范围，不定义V1输出范围。
- `src`、`db`、`public`、`.cursor`、历史产品资料和用户可见页面实现均无差异。
- 独立审查Agent结论：通过；未修改、移动、删除或提交文件。
- 提交：`5066a61`（产品文档实现）和 `f81ef84`（审查通过后的状态收尾）。

## 当前状态

MIG-003已完成并通过独立审查，任务状态为 `Done`。不得执行MIG-004或其他迁移任务。
