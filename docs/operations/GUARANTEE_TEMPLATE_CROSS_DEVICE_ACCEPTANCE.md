# 保证公司模板跨设备验收

## 目的

官方模板必须以同一发布版本、同一输入数据在不同设备上得到相同的版式。自动门禁防止代码、图片和布局快照漂移；本清单保留最终的人工视觉验证。

## 自动门禁

在两台设备各执行：

```bash
npm run test:guarantee-template-reproducibility -- --manifest
```

验收条件：两端 `manifestDigest` 完全相同，且均列出以下五张模板：

- `zenhoren_individual_v1`
- `nihon_safety_individual_v1`
- `j_lease_individual_v1`
- `insure_individual_v1`
- `friends_guarantee_individual_v1`

该检查验证图片指纹、页面尺寸、字段布局快照、发布种子和输出审计快照契约。它不声称替代 PDF 的人工视觉比较。

## 人工视觉验收

1. 两台设备登录同一个测试工作区，确认安装的是同一模板版本。
2. 使用同一固定案件与固定草稿数据，对五张模板各生成一次 PDF。
3. 每台设备分别运行对应模板的视觉冒烟检查：

```bash
TEMPLATE_ID=<template-id> CASE_ID=<fixed-case-id> npm run smoke:guarantee-visual
```

4. 对照两台设备的生成结果，检查姓名、日期、地址、邮编分段、金额和最小字号字段的位置，没有错位、截断、重叠或缺字。
5. 将两端的 `manifestDigest`、模板版本、案件 ID、执行时间与视觉检查输出写入发布记录。

## 失败处理

- 指纹或 `manifestDigest` 不同：停止发布。不得通过重新手动挪框来掩盖问题。
- 视觉结果不同：保留两端 PDF 和截图，检查模板图片哈希、已安装版本、浏览器缩放、字体及渲染环境。
- 官方模板升级：新版本必须重新完成本清单；已有工作区安装副本不得被静默覆盖。
