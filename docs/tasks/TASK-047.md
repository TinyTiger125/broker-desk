# TASK-047 / 工作中枢 V1

## 任务名称

今日事项、七日议程、等待跟进与周度检查的最小真实闭环

- 状态: Done
- 基线: `origin/staging/broker-desk-acceptance` `5d7dd85b757d132faae6370430cff1918944bc06`
- 隔离分支: `feature/work-center-v1-20260831`

## 背景和用户结果

登录后的首页不再只是功能入口。用户可以先看到真实的超期、今日、未来七日任务及等待跟进事项，进入对应人物继续处理，并在有写权限时直接完成待办；案件草稿和读取中的资料仍可从同一页面继续。

## 本次范围

- 将现有持久化任务、人物跟进、案件草稿和资料读取记录按当前工作区与可见范围安全聚合。
- 提供三个稳定视图：今日重点、七日议程、周度检查。
- 提供真实深链、明确的数据为空状态和有限量结果提示。
- 对有写权限的待办复用现有完成 Action；只读记录仅允许进入详情。
- 将既有邮件类型跟进显示为通信信号，但不建设邮箱客户端。

## 明确不做什么

- 不新增数据库表、字段或 migration。
- 不建立新的案件任务模型，不改变既有任务、跟进或权限合同。
- 不实现 Gmail/Outlook 接入、收发邮件、AI 写信、外部 Calendar 同步、电话或通知推送。
- 不执行 Production deployment 或 Production migration。

## 唯一授权写集

- `BACKLOG.md`
- `docs/tasks/TASK-047.md`
- `docs/operations/CURRENT_WORKING_CONTEXT.md`
- `package.json`
- `scripts/check-work-center-contract.mjs`
- `scripts/test-work-center-behavior.mjs`
- `src/app/page.tsx`
- `src/components/work-center-task-action.tsx`
- `src/lib/data.memory.ts`
- `src/lib/data.postgres.ts`
- `src/lib/data.ts`
- `src/lib/work-center.ts`

## 验收标准

- 首页使用当前租户、当前身份与现有可见范围读取数据，不泄露其他租户或不可见人物。
- 超期、今日、未来七日、未排期任务的日期归类确定且可测试。
- 任务、跟进、案件草稿和资料记录均链接到现有权威页面，不创建平行编辑器。
- 只有可写记录出现完成按钮，提交中有明确反馈并复用既有审计 Action。
- 大结果集有硬上限和明确的“还有更多”提示，不静默截断。
- ja/zh/ko 文案、窄屏布局、键盘焦点、build、typecheck、lint、产品语言、工作流及本任务合同通过。

## 风险和注意事项

- 如现有任务数据不足以形成真实闭环，保持诚实空状态，不制造模拟完成度。
- 如完成动作需要改变权限、任务 schema 或案件业务合同，立即停止，不在本任务扩展。
- 邮件只作为已有跟进记录的信号；任何外部通信能力必须另行取得真实连接、隐私与发送确认设计。

## 依赖关系

- 以固定 Staging 基线 `5d7dd85b757d132faae6370430cff1918944bc06` 为唯一实现起点；不依赖任何其他本地分支历史。
- 复用现有 `changeTaskStatusAction`、任务/跟进/客户数据访问、租户会话和可见性解析；不新增 Action、数据库模型或 migration。
- 页面级工作中枢不取得产品负责人未批准的邮箱、日历、通知或案件生命周期能力。

## 预计涉及的模块

- 首页路由与现有首页恢复/继续入口。
- `src/lib/data.memory.ts`、`src/lib/data.postgres.ts`、`src/lib/data.ts` 的只读聚合适配。
- 工作中枢日期分组/有限量模型及任务完成按钮。
- 本任务合同与行为检查脚本及 `package.json` 既有门注册。

## 验证命令

- `npm run test:work-center-contract`
- `npm run test:work-center-behavior`
- `npm run test:product-language`
- `npm run test:workflow-rules`
- `npm run typecheck`
- `npm run lint`
- `npm run build`（单独运行，不与 typecheck 并发）
- `git diff --check`

静态命令不能替代 1440/768/390、ja/zh/ko、键盘、权限和真实数据 Staging 验收；候选形成后须通过固定 Staging 与浏览器证据门。

## 当前状态

`Product Accepted / Integrated / Production Not Released`。固定 Preview 已完成真实 Work Center 验收：邮件信号、任务/案件草稿深链、任务完成持久化、空态、搜索、390/768/1440 无横向溢出及行级触控均通过；完成任务状态保持不变，并已通过正常产品路径创建长期回归任务 `TASK-047 ACCEPTANCE Today Task R2`（`SR-N85D`，客户 `client_nuh4dv5j`）。

保留 P2：没有第二个只读测试身份，readOnly 真实运行矩阵未验证；独立审查 Agent 无返回；资料上传记录未因本机浏览器上传权限建立。以上不改写为已验证，不阻断本次 Product Accepted。未执行 Production deployment 或 migration。
