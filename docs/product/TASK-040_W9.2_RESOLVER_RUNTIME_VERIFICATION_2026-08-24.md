# TASK-040 W9.2 Resolver Runtime Verification

结论：`Runtime Verified / isolated non-production`（仅统一 resolver 基础，不代表 W9.2 页面验收完成）。

## 环境

- Neon 项目：`broker-desk-staging-nonprod` (`restless-sun-37465131`)
- 临时分支：`w92-resolver-provenance-20260824` (`br-dry-salad-az88clup`)
- 数据库：`neondb`
- 运行角色：`brokerdesk_runtime`
- 分支为可销毁非生产分支，验证完成后销毁；未连接 Production。
- migration ledger 已包含 `20260824_001`、`002`、`003`，对应摘要见机器可读探针文件。
- 认证证据通过受控的 Clerk subject shim 进入真实 session lookup，再由数据库绑定 subject→local user→membership；这不是浏览器 Clerk A/B 端到端证据，后者留在后续 Staging 黑盒。

## 运行结果

受限运行角色下，案件、人物、物件分别得到非零 owner 正向结果：三者均为 `owner_write`，可读且可写。将同一经营主体的人员字段改为 `company_read` 后，另一 active 成员得到 `company_read`、可读但不可写；写入被拒绝并恢复为 private。

private 的三类对象对同公司其他成员均返回 `not_accessible` 且不返回记录。pending 对 owner 也返回 `not_accessible`。伪造 tenant、缺失记录、JSON 序列化后的未受信上下文同样返回 `not_accessible`。对已构造但不受信的 suspended/removed 变形输入，`RequestContext` 在 provenance 边界拒绝；这不是完整已注册 suspended/removed session 的独立运行探针，后者留在后续 Staging 黑盒证据中。

## 数据保护

验证只加入可识别的合成探针行；既有行未修改。运行结束将 person 范围恢复为 private。前后计数差异仅对应合成 person/property/case/pending property，未触碰共享 Staging 或 Production。

完整脱敏结果、案例编号与摘要哈希保存在 [机器可读探针](./TASK-040_W9.2_RESOLVER_RUNTIME_PROBES_2026-08-24.json)。`summarySha256` 的复算定义固定为：删除顶层 `summarySha256` 后，对剩余 JSON 对象按文件当前键序执行 `JSON.stringify(document)`，再计算 UTF-8 SHA-256；算法写在探针的 `summaryHashAlgorithm` 字段中。

## 限制

本轮不接入页面、列表、详情、搜索、导出、关系图、附件或 PDF；真实 Clerk 浏览器端到端搜索验收留在后续 W9.2 Staging 黑盒。统一 resolver 通过独立审查和受限非生产运行验证后，才可逐类接入页面。
