# MIG-007 产品恢复矩阵

> 状态：阶段一、阶段二完成；产品负责人已批准 A→审查→B→审查。当前处于检查点 A，未开始 B。
>
> 事实、推断和建议分开记录。当前唯一产品基线候选是治理分支 `governance/clean-baseline-20260812` 的代码（与 `main` 的业务代码一致）；`safety/wip-mixed-worktree-20260812` 和 WIP 快照只作恢复证据，未被修改。

## 1. Git 和运行事实

| 项目 | 已验证事实 |
|---|---|
| 当前分支 | `governance/clean-baseline-20260812` |
| 当前 HEAD | `27ff1037f1aa2edc98d94ff37bfa3d168a0acb2a` |
| `main` HEAD | `fedb4c96e5f7b5e33caef977c5defd78ecf24ac9` |
| 当前分支与 main | `git merge-base main HEAD` 等于 `main` HEAD；当前分支的业务代码与 main 一致，差异是治理文件。 |
| 冻结 safety/WIP | `safety/wip-mixed-worktree-20260812` = `61bce515e4ad44a6c32da551377dbf427d8bd946`。相对 WIP 快照只新增治理记录；业务 WIP 仍可在两者中复查。 |
| WIP 快照 | `6f199375467bbfedd77bc90d80a53c423d4c9969`，父链上承载混合业务 WIP 和历史治理材料。 |
| 当前工作区 | 只读盘点副作用已清理；无业务代码或未解释的未跟踪文件。 |
| 静态能力 | `npm run typecheck`、`npm run lint`、`npm run build` 通过。 |
| 开发启动探测 | `PORT=3101 npm run dev` 可启动；`/sign-in` 与 `/api/health/data` 返回 200；根页和受保护核心页按预期重定向。开发服务器自动写入的 Next Agent 规则已恢复，未保留副作用。 |
| 生产启动探测 | `npm start` 进程可监听，但根页、登录页、健康检查和整理页均返回 503。代码将生产认证/限流就绪不足视为 Service unavailable；不能视为可开隧道。 |
| 外部状态检查 | `npm run test:guarantee-template-publication-state` 在可连接开发数据库后失败：两个模板未使用要求的修正版 v2 active version。该结果是外部数据库事实，不由静态脚本通过覆盖。 |
| 依赖变化 | `main..safety` 没有 `package.json`、`package-lock.json` 或数据库迁移新增/修改；WIP 业务片段主要是现有页面、Server Action、组件、会话辅助和检查脚本。 |

## 2. 产品恢复矩阵

| 完整用户流程 / 用户可感知行为 | 所在分支或提交 | 代码与依赖 | 产品一致性、冲突与重复 | 推荐去向 | 验证方式 / 回退方式 |
|---|---|---|---|---|---|
| **A. 登录 → 工作区 → 核心导航**：朋友进入登录页，登录后进入工作区，再进入资料、整理和输出入口。 | 当前治理 HEAD `27ff103`；业务代码与 `main` `fedb4c9` 一致。 | Clerk/本地开发认证模式、Next App Router、`src/proxy.ts`、`src/lib/auth-mode.ts`、`src/lib/tenant-session.ts`、核心页面。 | 已验证事实：开发模式入口可达，受保护页会重定向；生产模式因安全就绪门禁返回 503。WIP 没有改变核心登录实现。 | **保留当前基线**；不从 WIP 提取 UI 或认证片段。 | 自动：开发启动、HTTP 状态、健康检查、typecheck/lint/build。人工：真实测试账号登录、Clerk 会话、生产配置。回退：保持当前 HEAD，不触碰 safety/WIP。 |
| **B. 资料导入 → 读取 → 逐项确认 → 新建案件**：用户上传资料，查看识别结果，只把确认/编辑后的值保存到案件并回到案件工作台。 | 后端已在当前治理/main；WIP UI 在 safety `61bce51` / 快照 `6f19937` 的 `input-extraction-review.tsx`。 | `src/app/import-center/page.tsx`、`src/components/input-extraction-review.tsx`、`src/app/actions.ts`、导入队列/处理器、memory/Postgres 数据层；无新增依赖或迁移。 | 已验证事实：main 已有保存审查结果的 Server Action 和租户查询。WIP 主要增加保存模式文案、已确认数量、pending 状态和重复提交阻止；没有新的后端权威。推断：单独搬 UI 仍可能留下成功/冲突/刷新证据缺口。 | **保留为 TASK-003 的完整流程候选，拆分集成边界**。不要按单个按钮或单个 hunk 合入；若批准，应与现有 action、目标权限、结果页和恢复验证一起纳入。 | 自动：typecheck/lint、导入失败恢复、租户数据检查。人工浏览器：新建、追加、取消、冲突、失败、刷新恢复、目标租户权限。回退：恢复分支回到当前治理 HEAD；WIP 保持原状。 |
| **C. 资料导入 → 候选案件 → 显式合并 → 案件工作台**：用户看到匹配理由和差异，确认后把资料追加到已有案件，保留原始资料和合并历史。 | main/治理已有合并后端和基础 UI；显式确认增强在 safety/WIP 的 `input-extraction-review.tsx`。 | `src/app/actions.ts`、`src/lib/case-merge.ts`、导入页面与数据层；WIP 未新增数据库结构。 | 产品方向一致，但这是高风险写入和归属行为。已有后端会检查租户和候选置信度；WIP 客户端确认不能替代服务端权限、冲突和幂等验证。 | **与 B 作为一个完整 TASK-003 候选保留，不接受“只恢复合并按钮”的方案**。当前基线先保留 main 实现，待证据后决定是否纳入 WIP UI。 | 自动：现有导入失败恢复和静态检查。人工浏览器/数据：明确确认、未确认拒绝、低置信度拒绝、重复提交、冲突、回滚/刷新和审计记录。回退：恢复分支回退到当前 HEAD。 |
| **D. 案件/主体/物件整理 → 详情/编辑 → 返回整理中心**：用户完成编辑或生命周期操作后回到正确的对象列表和上下文。 | WIP 片段在 safety/快照：`cases/[id]/page.tsx`、`parties/[id]/edit/page.tsx`、`properties/[id]/edit/page.tsx`、`actions.ts`。 | Server Action 的 `returnTo`/flash、整理中心 query、三个实体页面；无新增依赖。 | WIP 新增案件返回按钮，但使用 `/organize-center`；并删除部分 `type`/`focus` 参数。TASK-002 已登记这可能丢失选择器上下文。单独恢复会造成“能返回但返回位置不对”的破碎体验。 | **保留为 TASK-006 候选，暂不纳入恢复基线；不得按页面逐个提取。** TASK-006A 的固定案件返回地址仍不是本矩阵批准证据。 | 人工浏览器：三种实体 deep-link、列表类型、搜索/focus、保存、归档、恢复、刷新。自动：typecheck/lint/regression。回退：不合入 WIP return path hunk。 |
| **E. 模板库 → 安装 → 输出中心 → 申请书预览/下载**：普通用户浏览官方模板，安装后在输出中心使用，未安装或资料不足时得到明确阻断。 | 当前治理/main 已有模板库、安装动作和输出门禁；WIP 页面增强在 safety/快照的 `src/app/templates/page.tsx`、`src/app/platform/accounts/page.tsx`、旧 `/platform/templates` 路由和预览页。 | 模板页面、`installGuaranteeTemplateForTenantAction`、租户模板安装数据、输出中心、PDF 下载路由、Clerk/租户权限。 | 产品方向一致。WIP 将旧总览重定向到统一模板库、增加管理员入口和更新时间；但普通用户、平台管理员、旧链接兼容性仍需真实角色验证。无新增依赖。 | **保留为 TASK-004 的完整流程候选，拆分为“发现/安装/使用”和“官方编辑/发布”两条边界；不直接整体合入 safety。** 当前 main 流程作为稳定回退。 | 自动：模板静态门禁、下载门禁、租户会话检查。人工：普通用户不可见编辑/发布、管理员可达编辑、安装幂等、未安装阻断、输出回到正确案件。回退：恢复分支回到当前 HEAD。 |
| **F. 平台管理员官方模板校准 → 保存 → 发布 → 租户使用新版本**：管理员调整官方表单，发布后租户看到不可变版本，历史输出仍指向原快照。 | WIP 在 safety/快照：`src/app/actions.ts` 模板保存 scope、`official-template-save-button.tsx`、预览页、模板库、`platform-session.ts`。当前 main 没有这些 WIP hunk。 | `publishGuaranteeTemplateLayoutVersion`、模板布局 runtime、模板版本/租户安装数据、平台会话和 Server Action；现有数据库迁移。 | **最大冲突**：WIP 所谓“保存”仍直接调用 publish action；快照比较只减少未变化发布，不等于 draft/publish 分离。pending 按钮只阻止客户端重复提交，不证明服务端幂等、失败回滚或 active pointer 安全。外部数据库检查还显示两个模板 active version 不符合修正版要求。 | **保留为 TASK-005 候选，当前放弃纳入唯一基线**；不得把 `official-template-save-button.tsx`、快照比较或检查脚本单独当作完成。只有完成 draft/publish 数据边界和外部状态修复后，才作为完整流程集成。 | 自动：发布状态、重现性、覆盖率检查；当前发布状态检查失败。人工：草稿不改变 active、明确发布、重复发布、失败恢复、历史输出、普通/平台角色。回退：独立恢复分支丢弃该流程，不改 safety/WIP 或外部数据库。 |
| **G. 模板校准预览 → 文字输入 → PDF 视觉结果**：字段文字只显示一层，输入值和 overlay 不重复，输出位置可被人信任。 | WIP `friends-guarantee-calibration-preview.tsx` 在 safety/快照；任务归属 TASK-007。 | React overlay、Friends Guarantee PDF 资产和 renderer、模板 layout runtime；无新增依赖。 | WIP 的透明输入文字样式是局部视觉修正；没有源 PDF/生成 PDF/overlay/状态的分层证据。直接合入会把症状修复当成根因结论。 | **保留为 TASK-007 诊断候选，暂不纳入基线；不按视觉 hunk 直接合入。** | `smoke:guarantee-visual`、`test:guarantee-print-fit`、源/生成 PDF 逐层比较和人工视觉验收。回退：不合入该 hunk，保持当前 main renderer。 |
| **H. 归档/恢复 → 审计 → 继续工作**：用户安全归档错误记录，恢复后关联关系可继续使用，管理员能看到审计。 | WIP `actions.ts` 生命周期 flash、`/cases` revalidate 和实体返回片段在 safety/快照；当前 main 有基础生命周期能力。 | `setRecordLifecycleAction`、实体页面、整理中心、审计日志、租户权限。 | 产品方向一致，但 WIP 的 flash/revalidate 与返回参数改变属于完整生命周期契约，不是可独立证明的页面改动。TASK-008 仍要求先选定一种记录类型并验证幂等、权限和审计。 | **保留为 TASK-008/TASK-006 候选，暂不从 WIP 恢复。** 不将生命周期 hunk 混入输入或模板恢复。 | 自动：tenant governance/data access。人工：授权拒绝、归档、恢复、重复操作、审计、跨租户隔离。回退：不合入生命周期 hunk。 |
| **I. 检查脚本和治理/契约文档**：不直接改变用户行为，只提供检查、契约或历史上下文。 | safety/快照相对 main 的 `scripts/*`、`docs/engineering/GUARANTEE_TEMPLATE_PUBLICATION.md`、`docs/operations/P0_P1_REMEDIATION_PLAN.md`、`DESIGN.md` 等。 | Node 检查脚本、文档；无运行时依赖。 | 静态检查不是用户流程证据。WIP 的 `check-workflow-rules.mjs` 是旧治理版本，当前治理分支已有更新后的权威检查；模板/公测脚本的新增断言依赖未批准 WIP 行为。 | **当前治理检查脚本保留；WIP 旧治理脚本放弃作为恢复来源。业务检查脚本和契约文档按对应 TASK-003/004/005/007/008 拆分，保留为证据候选，不作为产品代码集成。历史计划继续隔离。** | 运行对应脚本并核对其断言对象；不得以脚本 PASS 代替浏览器、PDF、数据库或权限验证。回退：不把 WIP 文档/脚本整体带入产品基线。 |

## 3. 推荐集成边界

### 主推荐：先恢复两个完整前台流程，暂缓高风险后台治理

**事实**：当前治理/main 已有可启动的开发模式和核心业务后端；WIP 没有新增依赖或迁移，主要是未验证的交互和治理补丁。

**推断**：如果把所有 WIP 一起恢复，会把资料合并、模板发布、返回路径、视觉症状和生命周期混成一次不可诊断的集成，无法知道朋友测试失败来自哪条链路。

**推荐**：产品批准后，恢复实施分支只以以下两个完整流程为第一集成边界：

1. `TASK-003`：资料导入 → 逐项确认 → 新建/追加/显式合并 → 案件工作台；包含现有 main 的 Server Action/数据层和 WIP 的确认体验，但必须一起验证冲突、失败、刷新、权限和审计。
2. `TASK-004` 的前台部分：模板库浏览 → 安装 → 输出中心 → 申请书预览/下载；统一旧入口和管理员可见性必须作为同一角色/路径契约验证，不单独提取链接改动。

以下内容不进入第一集成边界：

- `TASK-005` 官方模板 draft/publish：WIP 仍有“保存调用发布”的语义冲突，且外部数据库状态检查失败。
- `TASK-006`/`TASK-006A` 返回路径：参数删除可能丢失整理上下文，不能以单个返回按钮恢复。
- `TASK-007` 视觉校准：缺少逐层 PDF 证据。
- `TASK-008` 生命周期：缺少单一记录类型的完整权限/审计/幂等验收。
- WIP 的旧治理检查器、历史计划和未获批准的业务断言：保留隔离证据，不成为第二权威。

### 实施前的回退和停止条件

- 产品批准后才创建独立恢复分支，例如从当前治理 HEAD 建立 `recovery/mig-007-baseline`；本阶段不创建。
- safety/WIP 和 `6f19937` 永远只读保留；任何集成失败都通过丢弃恢复分支或回到当前治理 HEAD 回退，不修改冻结引用。
- 任一流程缺少服务端权限、租户隔离、失败恢复、结果返回或浏览器证据时，停止该流程，不把局部代码并入唯一基线。
- 生产认证、真实数据库、外部读取服务和临时隧道不能自动验证时，必须在开发恢复检查表中标为“需要人工验证”，不得开放给朋友。

## 4. 当前需要产品负责人决定的事项

1. 是否批准上述第一集成边界：`TASK-003` 完整资料流程 + `TASK-004` 前台模板使用流程。
2. 是否接受先恢复“可在开发模式本地演示”的基线，同时把生产配置/真实登录/隧道作为单独人工安全门禁；当前 `npm start` 已被生产安全门禁正确阻断。
3. 是否同意继续将 TASK-005、TASK-006、TASK-007、TASK-008 留在候选/隔离状态，而不是为了让 WIP 看起来完整而一次性恢复。

产品负责人已批准第一集成边界。当前只允许实施检查点 A；A 的实现和独立审查通过后才允许进入 B。

## 5. 朋友测试目标：149 项专业分类

### 已验证事实

- `CASE_FIELD_DEFINITIONS` 共 167 项：149 个 `case_fact`、1 个 `output_process`、17 个 `template_option`。
- 当前“必填项目”设置页 `/settings/case-workbench-fields` 只展示 149 个 `case_fact` 字段，并以 `tenant.update_settings` 做服务端权限保护。
- 149 个案件事实当前按 8 个主分类展示：物件・契约条件 24、申込者・賃借人 16、本人確認資料 10、勤務先・収入 15、連帯保証人 24、緊急連絡先 24、同居人・入居者 21、仲介会社・管理会社 15。
- 现有目录还带有内部重要性和适用条件：重要性为 core 23、conditional 119、low_frequency 7；适用条件按租赁、本人资料、工作、保证人、紧急联系人、同居人、关系公司分支计算。

### 范围判断

这证明“149 项在哪里”已有产品入口和可复查目录，但不证明朋友要求的“更专业分类”已经成为用户可见能力。当前 UI 主要展示主分类、分枝、搜索、必填/选填状态；重要性、适用条件、字段类型和资料来源没有完整作为用户可见分类维度展示。

### 推荐处理

- A/B 只验证现有设置入口不阻塞案件闭环，不新增专业分类 UI，不修改字段目录或规则模型。
- 将“149 项专业分类”作为 MIG-007 完成后的独立小型业务任务/朋友测试验收项；最低验证是用具备 `tenant.update_settings` 的测试账号逐一检查 149 项、8 个主分类、分枝、搜索和权限隔离。
- 在没有新增用户证据前，不把 149 项全部改成必填，也不把内部 `importance`/`appliesWhen` 自动升级为产品承诺。它们是当前代码的分类元数据，不等于已验证的行业分类。

## 6. 当前批准后的执行状态

| 检查点 | 状态 | 允许范围 | 进入条件 |
|---|---|---|---|
| A / TASK-003 | In Progress | 资料导入、确认、新建/追加/合并、案件工作台及必要权限/持久化/异常链路 | 实现 Agent 完成并退出，独立审查通过 |
| B / TASK-004 前台 | Pending | 模板库、租户安装、输出中心、申请书预览/下载 | A 通过；不得带入 TASK-005～008 |
| 端到端验收 | Pending | 从资料进入系统到申请书下载的浏览器和数据行为 | B 通过 |
| 演示运行检查 | Pending | npm start 503 原因、测试账号/租户/数据、隧道安全 | 端到端验收通过 |
