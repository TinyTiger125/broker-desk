# Broker Desk 文档地图

本文件只说明文档类别和读取路径，不复制其他文档正文。

## 永久规则

- `../AGENTS.md`：所有角色共同遵守的永久治理规则，也是唯一的L1规则来源。

## 当前任务和交接

- `../BACKLOG.md`：任务索引和状态。
- `tasks/`：任务卡；只读取当前任务卡，不默认读取全部任务卡。
- `operations/CURRENT_WORKING_CONTEXT.md`：唯一活动交接和进度入口。

## 产品与架构事实

- `../PRODUCT.md`：稳定产品事实和产品边界。
- `../ARCHITECTURE.md`：已提交的架构事实。
- `../CONTEXT.md`：领域上下文和术语基础。

## 专业资料

- `product/`：产品主题资料。
- `engineering/`：运行、数据和工程主题资料。
- `operations/`：运营、合规、术语和流程资料。
- `acceptance/`：验收证据和测试记录。
- `agents/`：Agent辅助资料；只有任务或角色明确需要时读取。

## 历史资料

- `archive/`：已降级的历史交接、设计和旧方案。
- `../PROJECT_MEMORY.md`：仅为兼容指针；完整原文位于 `archive/legacy-project-memory/PROJECT_MEMORY_2026_08_06.md`。根指针和归档快照都不是默认启动入口。
- `../CLAUDE 3.md` 和 dated handoffs：历史或参考资料，不是当前启动入口。

## 工具适配

- `../CLAUDE.md`：最小兼容入口，不定义规则、产品、架构或任务状态。
- `../.cursor/rules/`、`../.cursor/skills/`：工具专用适配；按任务需要读取，不替代L1、L2或L3来源。
