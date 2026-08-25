# TASK-041 / 案件资料关联器 V1

## 任务名称

案件资料关联器 V1：案件草稿、人物角色与主要物件关联

- 状态: In Progress

## 背景和用户结果

## 正式产品依据

实现必须遵守：

- `docs/product/TASK-040-case-association-design-2026-08-25/README.md`
- `DESIGN_SPEC.md`
- `FLOW_MAP.md`
- `WIREFRAMES.md`
- `STATE_MATRIX.md`
- `SCREENSHOT_NOTES.md`

新建案件时，用户可以选择已有的人物和主要物件、为同一人物选择多个案件角色，并在案件草稿中调整；点击“创建案件”时案件和全部关联一次性保存。快速创建沿用现有人物/物件创建表单，创建完成后返回当前案件草稿，不因页面跳转丢失草稿。

已有案件详情支持查看和编辑人物角色、解除最后一个角色、设置/更换/解除主要物件。缺少主要申请人或主要物件时，保证公司申请书继续按现有条件阻止生成。

## 本次范围

- V1 不新增数据库表或 migration。案件关联暂存于现有 `brokerage_cases.confirmed_data_json` 的版本化内部载荷中；正式案件创建与载荷写入在现有案件保存事务中完成。
- 关系载荷固定为 `__caseAssociationVersion: 1`、`__associatedParties: [{ partyId, roles }]`、`__primaryPropertyId`。`roles` 只能来自批准的七种角色；同一案件最多一个“主要申请人”。
- 旧案件继续读取 `__primaryPartyId` / `__primaryPropertyId` 兼容值；首次通过 V1 编辑保存时归一化为新载荷。
- 所有候选、创建、编辑和解除操作均由服务端用当前 `RequestContext` 再次校验当前用户的可写能力；页面只隐藏不可用项，不能代替授权。
- 独立创建的人物/物件不绑定案件取消或案件保存失败的回滚删除。
- 用户文案不得暴露内部权限枚举；不扩展案件生命周期、Calendar、提醒、多物件、共同编辑、附件、关系图或 AI。

## 技术设计与实施切片

1. 关系载荷与服务端校验：批准角色、旧数据兼容、一次性案件写入、现有主资料创建的无跳转返回。
2. 新建案件草稿：桌面/窄屏、人物/物件选择、重复状态、快速创建、失败恢复、焦点锁定与焦点恢复。
3. 已有案件详情：角色编辑、最后角色解除确认、主要物件更换/解除及缺失条件提示。
4. 契约检查：产品语言禁用词、角色全集、范围扫描、typecheck、lint、build、专项行为检查。
5. Staging 证据：真实 `/cases/new` 桌面与窄屏截图、键盘焦点、草稿保存失败恢复、权限负向矩阵；证据完成前不得宣称产品验收通过。

## 明确不做什么

- 不部署 Production，不执行 Production migration。
- 不进入案件生命周期、Calendar、提醒、多物件、共同编辑、附件、关系图或 AI。
- 不把公司负责人或表格管理员当作资料权限绕过者。
- 不修改或提交 `scripts/check-task038-fixture-seed.mjs`、`scripts/seed-task038-nonprod.mjs`、`src/app/clients/page 2.tsx`。

## 依赖关系

- 依赖正式产品设计包六份文档已通过产品放行。
- 依赖现有案件、人物、物件可见性解析器和主资料创建表单合同。
- 依赖非生产 Staging 身份、工作区和合成资料；不依赖 Production 数据或 Production migration。

## 验收标准

- 新建案件的草稿选择和快速创建均不产生正式关系；一次提交成功后才写入案件及全部关联。
- 案件取消或案件保存失败不会删除独立创建的人物/物件。
- 新建案件重复候选显示“已在本次草稿”；已有案件详情显示“已关联”。
- UI 不出现内部权限术语；角色只能是七种批准角色。
- 桌面抽屉和窄屏全屏层实现焦点锁定、关闭恢复、键盘操作、错误保留和固定底栏不遮挡。
- Staging 运行证据与代码检查分开记录；实现规划授权不等于 Production 授权。

## 预计涉及的模块

- 新建案件页面、案件详情页面、人物/物件现有创建表单。
- 案件关联载荷、案件保存 Action、案件详情关联保存 Action。
- 本地 memory repository 与 PostgreSQL repository 的案件载荷更新接口。

## 风险和注意事项

- 案件关联载荷复用现有 JSON，必须保持旧 `__primaryPartyId` / `__primaryPropertyId` 读取兼容。
- 服务端必须逐条重查人物和物件的当前可写能力；客户端候选列表不是授权证明。
- 案件保存失败时必须保留当前草稿和独立创建的主资料，不能执行删除补偿。
- 本地构建、Staging Ready 或自动检查通过均不等于产品验收或 Production 授权。

## 验证命令

```text
npm run test:workflow-rules
npm run test:visibility-foundation
npm run test:visibility-foundation-behavior
npm run typecheck
npm run lint
npm run build
node scripts/check-task041-case-association-contract.mjs
```

## 当前状态

已完成非生产有限实现和本地静态检查；真实 `/cases/new` 桌面/窄屏截图、键盘焦点、草稿失败恢复和权限负向矩阵待 Staging 验收。
