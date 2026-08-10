# 封闭公测发布门禁

本清单用于托管环境上线前的最终判定。当前本地开发可以完成代码和迁移验证，但不得以本机通过替代以下外部运行证据。

## 必须通过

- [x] 在已配置的开发环境运行 `npm run verify:public-beta` 并保存通过输出（2026-08-10，`v0.2.0-rc.2`）。这是代码、迁移与已连接开发数据库的统一门禁，不替代以下托管环境验证。
- [ ] 干净克隆执行 install、migration、lint、build 与静态门禁均通过。
- [x] `npm audit --omit=dev --registry=https://registry.npmjs.org` 无未处理 Critical/High（2026-08-09）；本地镜像源不支持 audit API，不能以其错误替代真实审计结论。
- [ ] 两台真实设备对同一共享工作区、同一固定案件完成五张保证公司模板的跨设备视觉验收，并保存两端 `manifestDigest`、模板版本与视觉冒烟输出。执行步骤见 `GUARANTEE_TEMPLATE_CROSS_DEVICE_ACCEPTANCE.md`。
- [ ] 平台管理员、租户管理员和普通经纪人三个真实 Clerk 身份完成正向与越权拒绝验证。执行步骤见 `ROLE_AUTH_E2E_ACCEPTANCE.md`。
- [x] 资料导入的格式错误、权限拒绝、读取服务不可用和未知失败均在产品内显示可恢复状态；页面不暴露堆栈或内部错误码（2026-08-10 自动门禁通过）。上线前仍需在托管环境手动验证一次读取服务不可用场景。自动检查见 `test:import-failure-recovery`，用语边界见 `P0_UI_LANGUAGE_BOUNDARY.md`。
- [x] migration role、runtime role、webhook admin role 已分离；runtime role 不是 owner、superuser 或 BYPASSRLS（2026-08-10 已连接开发数据库验证）。
- [x] RLS 负向测试使用真实 runtime role，通过跨租户数据读取拒绝验证（2026-08-10 已连接开发数据库验证）。上线前仍需覆盖页面、附件与后台 job 的托管环境路径。
- [ ] Clerk production instance、数据库、附件存储和读取服务均与开发环境隔离。
- [ ] 远程读取服务符合 `REMOTE_DOCUMENT_READER_CONTRACT.md`，其域名已加入 allowlist。
- [ ] import worker 已由托管调度器启动，幂等、失败、超时、重试和并发领取演练通过。
- [ ] 私有附件、导出文件和模板版本均有访问控制与留存审计。
- [ ] 错误追踪、结构化日志和告警可定位一次模拟上传失败、权限拒绝和输出失败，且不泄露 PII。
- [ ] 数据库与附件恢复、发布回滚各完成一次演练并留存证据。
- [ ] 邀请名单、席位上限、支持渠道、严重问题停用开关和隐私告知已确定。

## 当前刻意未执行

没有部署到空白托管服务器，因此本清单中依赖真实 hosting、对象存储、备份、调度器、监控或供应商服务的项目必须保持未勾选。生产代码对缺失配置 fail-closed，不应通过伪造环境变量绕过。
