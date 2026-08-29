# TASK-044 / 平台管理导航入口

## 任务名称

平台管理导航入口：账户管理与官方模板工厂

- 状态: Done

## 背景和用户结果

持久化 `active platform_owner` 在桌面侧栏与窄屏设置菜单中看到独立“平台管理”分组，可进入“账户管理”与“官方模板工厂”。普通 tenant 用户看不到该分组，直接访问平台路由仍由服务端拒绝。

## 本次范围

- 复用 `AppNav` 现有 request-scoped `getPlatformOwnerSession()`，不增加数据库往返。
- 在桌面侧栏、桌面设置菜单、窄屏设置菜单和窄屏展开设置区显示同一平台管理分组。
- 分组包含 `/platform/accounts` 与 `/platform/templates`，并提供日、中、韩文案、正确路由标题和 active 状态。
- 导航可见性只认数据库持久化的 `active platform_owner` membership。

## 明确不做什么

- 不改侧栏整体设计、模板页面、公司模板、权限模型、数据库、migration 或 Production。
- 不用 Clerk 开启状态、configured allowlist 或客户端布尔值决定平台入口。
- 不改变 `/platform/accounts`、`/platform/templates` 的服务端授权守卫。

## 依赖关系

- 基线：`main` `3e6f07419a58d67cc9a1ce901369edf7d36c24c7`。
- 隔离分支：`task044-platform-navigation`。
- 依赖既有 `getPlatformOwnerSession()`、`requirePlatformOwnerSession()` 与 AppNav 四个现有渲染面。

## 验收标准

- persisted active platform owner 在 1440 桌面与 390 窄屏均看到独立平台分组及两个入口。
- 普通 tenant 身份在桌面与窄屏均不显示平台分组，直接 `/platform/templates` 被服务端拒绝。
- 两路由标题、图标和 active 状态正确；390 无横向溢出。
- 独立只读审查 P0=0、Product P1=0、Engineering P1=0。
- 工程门、fixed Staging exact Preview 与真实身份矩阵通过后，才可正常 PR/CI 合入 `main`；Production 始终禁止。

## 预计涉及的模块

- `src/components/app-nav.tsx`
- `src/components/main-nav-links.tsx`
- `src/components/app-route-title.tsx`
- `scripts/check-platform-subscription-contract.mjs`
- `docs/tasks/TASK-044.md`

## 风险和注意事项

- 导航显示不能成为权限边界；两个平台页面必须继续由服务端 `requirePlatformOwnerSession()` 拒绝未授权访问。
- configured-only 或 Clerk-enabled 身份不得获得日常平台后台入口。
- 静态合同不替代真实 persisted owner 与普通 tenant 的 Staging 身份矩阵。

## 验证命令

```text
npm run test:platform-subscription
npm run test:tenant-session
npm run test:layout-system
npm run test:product-language
npm run build
npm run typecheck
npm run lint
npm run test:workflow-rules
git diff --check
```

## 当前状态

- 功能提交：`1aa616d18d3a06e3fc234b4820ebf0342422b787`；验收记录提交：`722a0a8`。
- 顺序工程门全部通过；lint 为 0 error、2 个既有 warning。
- 独立只读复核：P0=0、Product P1=0、Engineering P1=0；代码级 GO。
- Git-integrated Preview：`dpl_2MnmNMxdxhRybs4tvpM7AbMP7j3Y`，状态 READY；实际提交与 fixed Staging HEAD 一致。
- 真实 persisted platform owner：1440 桌面侧栏与 390 窄屏设置菜单均显示独立平台分组、账户管理与官方模板工厂；两路由标题与 active 状态正确，390 无横向溢出。
- 既有普通合成身份通过 Clerk Development 官方短时会话验证：桌面与 390 均不显示平台分组；直接访问 `/platform/templates` 被服务端拒绝，页面不暴露模板工厂内容。会话未持久保存，未写业务数据。
- PR [#12](https://github.com/TinyTiger125/broker-desk/pull/12) 的首次正式 CI 因本任务卡未使用仓库固定章节格式而失败；本次只机械修正任务卡格式，不改变产品或工程合同。
