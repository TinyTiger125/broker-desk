# TASK-005: 分离官方模板 draft 与 publish

- 状态: Proposed
- 优先级: P0
- 负责人: 设计者、实现者、独立审查者
- 依赖关系: TASK-004

## 任务名称

实现官方模板独立草稿、质量检查、显式发布和不可变版本链。

## 背景和用户结果

管理员保存草稿不会改变 active release；只有明确发布且验证通过后租户才可看到新版本。

## 本次范围

- draft 持久化状态。
- draft 保存与 publish 的独立动作和权限。
- 版本、资产指纹、布局快照和审计记录。
- 发布失败和重复发布的可恢复状态。

## 明确不做什么

- 不允许普通租户编辑官方模板。
- 不实施模板交易、自动升级或批量迁移。
- 不顺手修复 PDF 视觉坐标。

## 依赖关系

TASK-004。

## 验收标准

1. 保存 draft 不改变 active release。
2. publish 是独立、明确、受平台权限保护的动作。
3. publish 创建不可变版本并更新 active pointer。
4. 失败不会产生半发布版本。
5. 租户安装副本和历史输出继续指向原始快照。

## 预计涉及的模块

迁移、数据层、模板运行时、Server Action、官方模板编辑页和发布检查脚本。

## 风险和注意事项

这是不可逆数据模型决策，必须先完成迁移和回滚设计。

## 验证命令

npm run typecheck
npm run lint
npm run test:guarantee-template-publication
npm run test:guarantee-template-publication-state
npm run test:guarantee-template-reproducibility
还必须完成数据库迁移、重复发布、失败恢复和历史输出验证。

## 当前状态

Proposed。
