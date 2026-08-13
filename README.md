# Broker Desk

面向日本不动产经纪业务的响应式 Web 工作台，用于整理业务资料、确认案件信息，并生成可追溯的业务文书。

## 开发者导航

- [产品事实](PRODUCT.md)
- [架构事实](ARCHITECTURE.md)
- [领域上下文](CONTEXT.md)
- [文档地图](docs/README.md)
- [任务清单](BACKLOG.md)
- [当前交接](docs/operations/CURRENT_WORKING_CONTEXT.md)
- [运营与专业资料](docs/operations/)
- [产品资料](docs/product/)
- [工程资料](docs/engineering/)
- [历史资料](docs/archive/)

## 本地开发

```bash
npm install
npm run dev
```

常用检查：

```bash
npm run test:workflow-rules
npm run lint
npm run typecheck
```

真实客户资料、生产凭据和发布操作应遵循对应的产品、架构和运营资料；本 README 不重复这些规则。
