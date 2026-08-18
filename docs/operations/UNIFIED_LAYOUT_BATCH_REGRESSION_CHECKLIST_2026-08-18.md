# 全产品 Layout System 统一批次回归清单

日期：2026-08-18
范围：TASK-024–TASK-036 已完成页面结构迁移后的统一运行回归。
说明：本清单只登记证据缺口；TASK-036 已执行一次有限环境链，身份与请求租户不匹配后保持 `Blocked`，不继续认证、租户或服务排查。

## 运行环境与身份

- [ ] 本地 Broker Desk 服务可正常监听并访问代表性路由；此前多次 `listen EPERM`，本轮未重启服务。
- [x] TASK-036 环境链：正常启动 `listen EPERM` 后同一命令一次提升成功；服务监听过 `localhost:3000`，运行结束后停止。
- [ ] TASK-036 合法 Development 身份与请求租户匹配；当前 `TenantSessionError`，业务页面结构和闭环保持 `UNVERIFIED`。
- [ ] 合法登录会话、真实权限拒绝、Clerk 邀请和成员状态闭环。
- [ ] 第二租户、跨租户隔离和平台 Owner/普通成员边界。
- [ ] PostgreSQL 真实读写与 memory 契约一致性。

## 页面结构与交互抽样

- [ ] 代表性 List Report、Responsive Form、Object Page、Worklist、Wizard、Relationship Explorer、Workspace Selector 在 1440/768/390 下无横向溢出。
- [ ] Tab、Enter、IME 组合输入、错误摘要焦点、字段焦点和浏览器返回焦点。
- [ ] 空态、加载态、错误态、分页、筛选、返回上下文和触发链接焦点。
- [ ] 成员停用/恢复的显式确认行为；当前页面保留既有 Action，但未取得运行证据。

## 业务闭环

- [ ] TASK-025–030 的真实筛选、分页、归档/恢复、区域/生命周期和 CSV 边界。
- [ ] TASK-028 导入上传、OCR、对象级确认、422/503/权限/记录不存在恢复和完成状态。
- [ ] TASK-031–033 创建/编辑真实保存、错误恢复、`returnTo`、共享字段和 PostgreSQL 读写。
- [ ] TASK-034 `/cases/new` 保存恢复、`/board` 阶段拖拽、`/relationship-tree` 显式关系数据完整性。
- [ ] TASK-035 成员邀请/角色/停用、平台账户生命周期/席位/邀请、AI 候选审核和首页待处理入口。
- [ ] TASK-036 22 路由真实业务结构、筛选/保存、错误焦点、IME 和危险操作；证据报告为 [`TASK-036_LAYOUT_REGRESSION_2026-08-18.md`](TASK-036_LAYOUT_REGRESSION_2026-08-18.md)，截图哈希索引为 [`evidence/TASK-036/2026-08-18/README.md`](evidence/TASK-036/2026-08-18/README.md)。

## 独立输出专题（不属于 Layout System 收口）

- [ ] `/output-center`、正式申请书预览、下载/打印、`/quotes*`、模板版权/授权/售卖和版本策略。
- [ ] `/settings/output-templates`、`/platform/templates*`、TASK-020 输出门禁。

## 独立审计参考

- 页面级结构结论见矩阵 V2 最终状态对账。
- 各任务的未验证项保留在 `TASK-027`–`TASK-036` 任务卡和对应治理文档中。
