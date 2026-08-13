# Broker Desk 当前工作交接

> 本文件是唯一活动交接和进度入口。它不重复产品、架构或历史记录。
> Last updated: 2026-08-13.

## 当前任务

- `TASK-012 / MIG-001`：统一治理入口，状态为 `In Review`。
- 用户结果：进入仓库后先找到唯一永久规则、当前交接和当前任务，不把CLAUDE或历史文档当作第二套权威。

## Git事实

- 正式仓库：`/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev`
- Branch: `governance/clean-baseline-20260812`
- HEAD: `9d12c0a`
- local main: `fedb4c9`
- safety/WIP分支：`safety/wip-mixed-worktree-20260812`，保持不变。
- 本任务开始前工作区干净；本任务只允许治理入口文件和必要的直接检查引用。

## 本任务边界

- 只收敛 `AGENTS.md`、`CLAUDE.md`、README、文档地图、当前交接和本任务登记。
- 不新建Playbook，不修改产品/架构事实，不修改 `.cursor`、业务代码、数据库、public或运行配置，不移动、归档或删除历史文件。

## 验证与下一步

- 必须完成任务卡中的治理检查、差异检查、lint、typecheck、入口扫描和独立审查。
- 实现和审查通过并形成MIG-001提交后，停止当前任务，等待MIG-002批准；不在本交接中启动下一项迁移。
