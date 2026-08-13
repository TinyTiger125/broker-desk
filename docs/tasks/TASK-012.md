# TASK-012：MIG-001 统一治理入口

- 状态: Done
- 优先级: P0
- 负责人: 主 Agent / 实现Agent / 独立审查Agent
- 依赖关系: 当前治理基线已建立

## 任务名称

MIG-001：统一治理入口，使进入仓库的Codex、Claude和人工开发者能够找到唯一永久规则、当前交接和当前任务。

## 背景和用户结果

用户进入正式仓库后，应先读到唯一永久规则，再读当前交接和当前任务卡；CLAUDE.md、PROJECT_MEMORY和历史交接不得继续形成第二套默认入口或权威。

## 本次范围

- 收敛 AGENTS.md 的永久治理规则，不加入产品、页面、业务流程或历史流水账。
- 将 CLAUDE.md 缩减为不超过30行的兼容入口。
- 将 README.md 缩减为项目简介和开发者导航。
- 将 docs/README.md 收敛为不复制正文的文档地图。
- 将 docs/operations/CURRENT_WORKING_CONTEXT.md 更新为MIG-001的短交接和当前Git事实。
- 在 BACKLOG.md 登记本任务，不改变任何业务任务状态。
- 仅在治理检查器直接硬编码旧入口状态、导致正确新入口无法验证时，修改该直接引用方。

## 依赖关系

当前治理基线已建立；不依赖任何业务任务的实施。

## 明确不做什么

- 不新建或编写任何Playbook。
- 不修改 .cursor/rules、.cursor/skills、PRODUCT.md、ARCHITECTURE.md、CONTEXT.md、业务代码、数据库、public或运行配置。
- 不移动、归档或删除 CLAUDE 3.md、PROJECT_MEMORY、历史交接或其他历史文件。
- 不改变任何已有业务任务的状态、产品方向、架构事实或运行时行为。
- 不执行其他迁移任务。

## 验收标准

1. AGENTS.md只包含跨角色永久治理规则，并明确正式仓库、最小读取顺序、范围授权、Git安全、验证审查、Agent生命周期和停止交接条件。
2. CLAUDE.md不超过30行，只指向AGENTS.md、当前交接、当前任务卡和按需资料，不定义产品、架构、任务状态或执行规则。
3. README.md不定义Agent规则或当前任务；docs/README.md只提供分类地图和读取路径。
4. CURRENT_WORKING_CONTEXT.md只记录MIG-001当前状态、正式Git事实、边界、验证和下一步，不保留旧任务作为当前任务。
5. 对本任务允许修改范围内的启动入口完成扫描和修复，不再把CLAUDE、PROJECT_MEMORY或未限定路径的历史交接当作默认当前入口；明确禁止修改的`.cursor`工具适配和归档导航残留已登记到后续任务，不冒充本任务已解决。
6. 没有业务代码、产品事实或架构事实变化。
7. 实现验证、独立审查和最终提交均完成。

## 预计涉及的模块

AGENTS.md、README.md、docs/README.md、CLAUDE.md、
docs/operations/CURRENT_WORKING_CONTEXT.md、docs/agents/domain.md、
BACKLOG.md、docs/tasks/TASK-012.md；必要时仅修改直接硬编码旧入口状态的治理检查器。

## 实际修改文件

- `AGENTS.md`
- `BACKLOG.md`
- `CLAUDE.md`
- `README.md`
- `docs/README.md`
- `docs/agents/domain.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`
- `docs/tasks/TASK-012.md`
- `scripts/check-workflow-rules.mjs`

## 风险和注意事项

- CLAUDE.md中的部分方法入口可能是尚未归属的独有信息，缩减前必须登记到本卡的“待迁移证据”，交由后续角色Playbook任务处理。
- 当前工作区的产品/架构事实与文档入口存在版本漂移；本任务只修入口，不裁决产品或架构事实。
- 回退必须只恢复本任务提交，不得影响安全WIP分支或其他提交。

## 待迁移证据

- CLAUDE.md原有的Issue tracker使用说明与triage标签映射：已由 docs/agents/issue-tracker.md 和 docs/agents/triage-labels.md 承载，后续由角色Playbook任务决定读取位置。
- CLAUDE.md原有的工程技能域文档读取清单：已由 docs/agents/domain.md 承载，后续由角色Playbook任务决定读取位置。
- CLAUDE.md中历史产品、架构、功能、执行记录和讨论冻结内容：不在本任务直接删除，需由后续产品/架构/历史迁移任务按证据归属处理。
- `.cursor/README.md`和`.cursor/rules/*.mdc`仍有`CLAUDE.md wins`或CLAUDE最高真源类旧声明；本任务明确禁止修改`.cursor`，由工具适配迁移任务处理，不作为MIG-001的已解决项。
- MIG-001结束时发现的 `docs/archive/README.md` PROJECT_MEMORY历史导航残留，已由MIG-002更新；本条保留为MIG-001发现记录，不表示当前仍是默认入口。

## 验证命令

- `git status --short --branch --untracked-files=all`
- `git diff --check`
- `npm run test:workflow-rules`
- `npm run lint`
- `npm run typecheck`
- 全仓库Markdown入口与旧权威声明扫描
- `git diff --name-only`确认无业务代码和禁止范围文件

## 当前状态

实现提交、独立审查、审查问题修复和复验均已完成；等待MIG-002批准。

## 回退方式

仅回退MIG-001独立提交，恢复本任务修改前的入口文件、当前交接、BACKLOG和必要的直接检查器引用；不切换或改写main与safety/WIP分支。
