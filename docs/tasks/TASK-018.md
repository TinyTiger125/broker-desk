# TASK-018：MIG-007 恢复唯一可运行产品基线

- 状态: Done
- 优先级: P0
- 负责人: 技术项目经理 / 实现Agent / 独立审查Agent
- 依赖关系: TASK-002、TASK-017

## 任务名称

以完整用户流程为单位，从当前治理分支、main、冻结的 safety/WIP 分支和 WIP 快照中恢复一个可安装、可启动、可演示、可继续开发的唯一产品基线。

## 背景和用户结果

治理完成不能只证明文档和规则正确。产品负责人需要一个不带未解释重复实现、权限边界和数据风险的本地产品基线，能够完成朋友测试所需的完整流程，并在恢复后继续进行小型真实业务试运行。

## 本次范围

- 阶段一：只读盘点当前治理分支和 main 的启动能力，以及冻结 WIP 中实际存在的完整用户流程。
- 阶段二：提交产品恢复矩阵和推荐集成边界，标明每个 WIP 片段的纳入、拆分、放弃或保留去向。
- 阶段三：产品负责人已批准 A→审查→B→审查的顺序；当前在独立恢复分支上完成检查点 A 和 B，safety/WIP 和快照保持不变。
- 阶段四：独立审查、安装/构建/启动、核心导航与权限、数据隔离、浏览器验收，以及隧道开放前安全检查。

## 明确不做什么

- 阶段一、二不修改或合并业务代码，不切换当前分支，不修改或删除 safety/WIP 和 WIP 快照。
- 不按文件整体合并，不把单一 UI hunk 伪装成完整用户流程，不恢复全部混合 WIP。
- 不在本卡内新增业务功能、修改数据库 schema、迁移术语、重做架构或开启 MIG-008。
- 不把静态检查通过升级为真实登录、外部服务、数据库发布状态或隧道行为通过。
- 不把朋友所需的 149 项专业分类展示混入 A/B；不把现有设置页可见性伪称为已完成专业分类。

## 依赖关系

TASK-002 的片段登记仍是 WIP 归属证据；TASK-017 / MIG-006 已完成治理入口收口。TASK-010 继续保持 Blocked，不因本卡的本地启动探测自动解除。

## 验收标准

1. 产品恢复矩阵按完整用户流程记录用户行为、分支/提交、代码与依赖、产品一致性、冲突/重复、推荐去向、验证方式和回退方式。
2. 每个 safety/WIP 和 WIP 快照中的业务代码片段、检查脚本和相关文档都有明确去向；未证明的片段保持候选或隔离，不进入唯一基线。
3. 当前治理分支、main、safety/WIP 和快照的关系可由 Git 复查；safety/WIP 不被修改、删除或整体合并。
4. 产品负责人批准后，恢复实施使用独立分支或明确回退点，并以完整流程为最小集成单位。
5. 唯一基线能够安装、构建、启动；朋友测试流程能在本地完成；核心导航、登录、权限和租户数据隔离有自动或浏览器证据。
6. 生产配置、真实登录、外部服务、真实数据库状态和临时隧道无法自动验证时，报告明确写为“需要人工验证”。
7. 独立审查在实现完成后执行；审查、本地运行和隧道前检查完成后，工作区干净且所有 Agent 已退出。
8. MIG-007 完成后停止新增治理任务；下一步建立普通业务任务 TASK-019 处理外部演示环境，未通过其安全门禁前不得开放临时隧道。
9. 检查点 A 通过前不得开始 B；检查点 B 通过前不得进行端到端闭环验收。
10. 朋友测试的 149 项专业分类目标单独记录：现有设置页能展示 149 个案件事实字段，但完整的业务分类解释尚未作为 A/B 功能验收。

## 预计涉及的模块

- 只读阶段：`src/app/`、`src/components/`、`src/lib/`、`scripts/`、`package.json`、`db/migrations/`、`PRODUCT.md`、`ARCHITECTURE.md`、`docs/operations/PRODUCT_TERMINOLOGY_CANONICAL.md`。
- 治理记录：本卡、`BACKLOG.md`、`docs/operations/CURRENT_WORKING_CONTEXT.md`、产品恢复矩阵。
- 当前实施：TASK-003 检查点 A 和 TASK-004 租户前台检查点 B。TASK-005、TASK-006、TASK-007、TASK-008 继续暂缓。

## 风险和注意事项

- 当前 main 与治理分支的业务代码一致；治理分支领先 main 的内容是治理文件，不是自动可演示的新产品功能。
- WIP 的模板布局保存路径仍直接调用发布动作；在 draft/publish 分离和失败恢复证据不足时，不得纳入基线。
- WIP 的实体返回路径删除了部分 `type`/`focus` 上下文；单独提取会破坏整理中心体验，必须作为返回契约整体验证。
- 本地开发模式可达不等于生产运行时可开放隧道；生产认证、限流、数据库和导入 worker 必须逐项安全检查。
- 当前连接开发数据库的模板发布状态检查仍有两个模板未达到修正版 active version 要求；不能把模板静态检查通过当作发布状态通过。

## 验证命令

- `git status --short --branch --untracked-files=all`
- `git diff --check`
- `git diff --name-status main..safety/wip-mixed-worktree-20260812`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:workflow-rules`
- 与候选完整流程匹配的模板、租户、导入、输出和回归检查。
- 开发模式本地 HTTP/浏览器检查；生产登录、外部服务、开发数据库发布状态和隧道行为按需人工验证。

## 当前状态

Done。检查点 A 和 B 的实现审查、静态验证、本地浏览器/数据行为门禁及从已确认案件到申请书下载的端到端闭环均已通过。真实 Clerk 登录、外部 OCR/附件存储、生产数据库、双租户真实浏览器隔离和隧道安全检查不属于本卡的本地基线收口，已转入普通业务任务 TASK-019；149 项专业分类仍未修改。

## 2026-08-13 检查点 A 收口证据

- 已验证：A 只修改 `src/components/input-extraction-review.tsx` 的资料确认/新建/追加/合并交互；后端 Action、租户权限、持久化和审计链路未被旁带修改。
- 已验证：实现 Agent 完成后退出，独立审查 Agent 随后复核通过并退出；审查指出的保存提示文案和交接分支记录已修正。
- 已验证：`npm run typecheck`、`npm run lint`、`npm run build`、导入失败恢复、纠正事件检查和 `git diff --check` 通过。
- 已验证：显式设置非生产本地 demo 身份后，开发服务可监听，公开 `/api/health/data`、受保护 `/import-center`、`/organize-center` 和设置页均可由浏览器访问。
- 已验证：浏览器完成待确认资料的批量确认、一个缺失值修正、两个缺失值不采用，并追加到既有案件；案件工作台显示合并结果。新建案件后进入工作台；工作台字段保存后刷新仍保留；普通运营角色访问平台账户页时显示平台管理员权限拒绝。
- 已验证：资料处理器本身对演示来源返回 `422`，但失败后的确认/修正/不采用/追加恢复路径可完成；这证明异常恢复，不证明真实 OCR 或外部附件存储成功。
- 结论：A 的本地运行门禁通过；B 随后按批准范围完成并通过。生产认证、真实外部服务、生产数据库、隧道和真实文件处理仍需人工验证；不得把本地 demo 通过升级为生产演示通过。
- 已验证：`src/proxy.ts` 仅在非生产且显式 `BROKER_DESK_AUTH_MODE=demo` 时放行本地 demo 身份；生产认证、限流和同源检查路径未被绕过。
- `npm start` 诊断：生产构建成功、进程可监听，但 `/`、`/sign-in`、`/api/health/data`、`/organize-center` 均为 `503`。`src/proxy.ts` 的生产门禁先通过认证检查，再因 `production_rate_limit_required` 条件不满足而统一返回 503；当前边缘限流启用标志和策略 ID 均缺失。即使补齐该门禁，生产数据发布批准、附件存储和文档读取配置仍分别未满足，不能开放隧道。

## 2026-08-13 检查点 B 收口证据

- 已验证：实现 Agent 按顺序完成并退出；独立审查 Agent 随后复核，先发现本地 `pdftoppm` 缺失导致 PNG 预览 500，后复核 B 范围内修复通过并退出。当前没有 Agent 活跃。
- 已验证：普通租户模板库显示 5 个允许安装的官方模板；安装全保連模板后刷新页面仍显示当前工作区已添加，输出中心只使用该租户的安装状态。
- 已验证：使用 A 已确认的 `case_demo_park_ikebukuro_share` 案件进入输出中心和申请书预览；预览显示池袋シェアハウス、パク ジス等确认数据。补齐 A 中明确不采用后留下的两个缺失字段后，预览状态变为可下载。
- 已验证：预览 PNG 返回 `200 image/png`；下载 PDF 返回 `200 application/pdf`，`pdf-lib` 可打开并读取 1 页；预览 PDF 和下载 PDF 的渲染页哈希一致。PDF 预览改用仓库已有的 `@pdfme/converter.pdf2img`，使用其 0 起始页码，不再依赖本机 `pdftoppm`。
- 已验证：未安装模板进入模板库并显示添加入口；普通运营角色访问 `/platform/accounts` 显示“需要平台管理员权限。”；A 的资料入口仍可访问。
- 已验证：模板下载门禁、租户会话/数据/治理、导入失败恢复、纠正事件、生产安全、workflow、typecheck、lint、build 和 `git diff --check` 通过。
- 已验证：预览生成失败时，租户前台显示明确失败提示并提供“刷新预览”恢复动作。
- 降级说明：资料处理器返回 `422` 的人工确认/修正/不采用恢复路径仍只算降级路径；不能称为真实 OCR 或自动处理通过。
- 未验证：真实 Clerk 登录、真实生产数据库、外部附件/文档服务、双租户真实浏览器隔离和隧道开放安全检查。B 本地功能通过不等于朋友测试或隧道可以开放。

## 2026-08-14 最终基线收口证据

- 已验证：当前治理分支与 `main` 的共同祖先为 `main` HEAD，具备 fast-forward 条件；MIG-001 至 MIG-007 的实现、独立审查和收口提交均可由 Git 历史复查。
- 已验证：`npm run typecheck`、`npm run lint`、`npm run build`、`npm run test:workflow-rules`、`npm run test:import-failure-recovery`、`npm run test:production-security`、`npm run test:tenant-auth-lifecycle-state`、`npm run test:tenant-session`、`npm run test:tenant-data-access`、`npm run test:tenant-governance`、`npm run test:import-worker-authorization`、`npm run test:correction-events`、`npm run test:guarantee-download-gate`、`npm run test:guarantee-autofill-policy`、`npm run test:request-rate-limit`、`npm run test:guarantee-template-publication`、`npm run test:upload-validation` 均通过；`git diff --check` 通过。
- 已验证：A/B 浏览器闭环回归仍成立：资料确认/修正/不采用、追加/新建/合并、案件工作台持久化、模板安装持久化、输出中心、申请书预览和下载均已完成；预览与下载的渲染页面一致。
- 已验证：工作区干净；`safety/wip-mixed-worktree-20260812` 及 WIP 快照未修改、未合并、未删除；所有子 Agent 已退出，当前活跃数量为 0。
- 收口结论：MIG-007 作为本地可运行、可演示、可继续开发的产品基线已完成。生产 503、真实 Clerk、专用测试账号、虚假数据、双租户真实浏览器隔离、隧道域名回调和关闭/回退方案由 TASK-019 验证；未完成前不得把隧道地址交给朋友。
