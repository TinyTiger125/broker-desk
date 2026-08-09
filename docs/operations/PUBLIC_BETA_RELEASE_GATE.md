# 封闭公测发布门禁

本清单用于托管环境上线前的最终判定。当前本地开发可以完成代码和迁移验证，但不得以本机通过替代以下外部运行证据。

## 必须通过

- [ ] 在已配置的开发环境运行 `npm run verify:public-beta` 并保存通过输出。这是代码、迁移与已连接开发数据库的统一门禁，不替代以下托管环境验证。
- [ ] 干净克隆执行 install、migration、lint、build 与静态门禁均通过。
- [ ] `npm audit --omit=dev` 无未处理 Critical/High，或每项例外已有风险接受人、到期日和隔离说明。
- [ ] migration role、runtime role、webhook admin role 已分离；runtime role 不是 owner、superuser 或 BYPASSRLS。
- [ ] RLS 负向测试使用真实 runtime role，通过跨租户页面、API、附件、后台 job 的拒绝验证。
- [ ] Clerk production instance、数据库、附件存储和读取服务均与开发环境隔离。
- [ ] 远程读取服务符合 `REMOTE_DOCUMENT_READER_CONTRACT.md`，其域名已加入 allowlist。
- [ ] import worker 已由托管调度器启动，幂等、失败、超时、重试和并发领取演练通过。
- [ ] 私有附件、导出文件和模板版本均有访问控制与留存审计。
- [ ] 错误追踪、结构化日志和告警可定位一次模拟上传失败、权限拒绝和输出失败，且不泄露 PII。
- [ ] 数据库与附件恢复、发布回滚各完成一次演练并留存证据。
- [ ] 邀请名单、席位上限、支持渠道、严重问题停用开关和隐私告知已确定。

## 当前刻意未执行

没有部署到空白托管服务器，因此本清单中依赖真实 hosting、对象存储、备份、调度器、监控或供应商服务的项目必须保持未勾选。生产代码对缺失配置 fail-closed，不应通过伪造环境变量绕过。
