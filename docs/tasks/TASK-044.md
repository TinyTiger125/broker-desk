# TASK-044 / 平台管理导航入口

## 状态与基线

- 状态：In Review / Code GO / Staging Pending
- 基线：`main` `3e6f07419a58d67cc9a1ce901369edf7d36c24c7`
- 隔离分支：`task044-platform-navigation`

## 用户结果

持久化 `active platform_owner` 在桌面侧栏与窄屏设置菜单中看到独立“平台管理”分组，可进入“账户管理”与“官方模板工厂”。普通 tenant 用户看不到该分组，直接访问平台路由仍由服务端拒绝。

## 必须保持

- 导航可见性与 `requirePlatformOwnerSession` 同源，只认数据库持久化的 `active platform_owner` membership。
- 复用 `AppNav` 现有 request-scoped `getPlatformOwnerSession()`，不得增加数据库往返。
- 日/中/韩文案完整；`/platform/accounts` 与 `/platform/templates` 的路由标题和 active 状态正确。
- `/platform/accounts`、`/platform/templates` 原有服务端授权守卫保持不变。

## 明确不做

- 不改侧栏整体设计、模板页面、公司模板、权限模型、数据库、migration 或 Production。
- 不用 Clerk 开启状态、configured allowlist 或客户端布尔值决定平台入口。

## 唯一授权写集

- `docs/tasks/TASK-044.md`
- `src/components/app-nav.tsx`
- `src/components/main-nav-links.tsx`
- `src/components/app-route-title.tsx`
- `scripts/check-platform-subscription-contract.mjs`

## 验收证据

1. `npm run test:platform-subscription`
2. `npm run test:tenant-session`
3. `npm run test:layout-system`
4. `npm run test:product-language`
5. `npm run build`
6. `npm run typecheck`
7. `npm run lint`
8. `git diff --check`
9. 独立只读审查 P0/P1=0。
10. fixed Staging exact Preview：真实 platform owner 在桌面与 390 看到两入口；普通 tenant 身份不显示，直接 `/platform/templates` 服务端拒绝。

## 停止条件

以上核心路径通过、无已知 P0/P1、写集与回滚提交清晰后，正常 PR/CI 非强制合入 `main` 并停止；Production 始终禁止。

## 代码证据

- 顺序工程门全部通过；lint 为 0 error、2 个既有 warning。
- 独立只读复核：P0=0、Product P1=0、Engineering P1=0；代码级 GO。
- 真实 Staging 身份与 390/桌面导航矩阵仍待 exact Preview，未在代码级证据中冒充通过。
