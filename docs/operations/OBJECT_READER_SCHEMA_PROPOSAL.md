# 物件资料读取 schema 与最小 adapter（H028）

本文件记录 H028 的本地最小实现边界。它与 `openai-identity-reader` 分离，只返回人工可复核候选，不写案件或物件主数据。真实资料、Preview、Production、迁移和远端配置均不在本阶段。

## 建议 wire contract

物件读取应使用独立任务和独立字段白名单，不把 `property.*` 候选塞入身份读取器：

```json
{
  "documentType": "property_lease_document",
  "pages": [{"pageNumber": 1, "lines": ["..."]}],
  "candidates": [{
    "fieldKey": "property.address",
    "value": "福岡県福岡市中央区1-2-3",
    "pageNumber": 1,
    "sourceText": "所在地 福岡県福岡市中央区1-2-3",
    "uncertainty": "clear",
    "subjectKey": "property_1",
    "subjectLabel": "物件"
  }]
}
```

实现从现有 canonical catalog 取最小集合，并明确分离物件本体和案件租约条件：

- `property.name`
- `property.postalCode`
- `property.address`
- `property.roomNumber`
- `property.usage`
- `lease.contractType`, `lease.contractStartDate`, `lease.contractEndDate`, `lease.moveInDate`
- `lease.rent`, `lease.commonFee`, `lease.parkingFee`, `lease.waterTownFee`, `lease.otherMonthlyFee`, `lease.monthlyRentTotal`
- `lease.deposit`, `lease.keyMoney`, `lease.insuranceFee`, `lease.keyExchangeFee`, `lease.cancellationDeduction`, `lease.initialCostTotal`, `lease.paymentMethod`, `lease.rentPaymentDay`

`property.furigana`、`property.rent`、`property.fees` 等不存在于本 adapter 的字段白名单中；租金、押金、礼金等只能落在 `lease.*` 候选，不能被当作物件共用事实。

所有候选都必须有页码、短原文证据、`uncertainty` 和稳定 `subjectKey`。同一资料包出现多个物件组时，若无法唯一确定主要物件，整组候选保持待复核，不按 `fieldKey` 直接合并。

## 原五项需求的缺口

| 需求 | 身份读取器现状 | 物件读取器现状 |
| --- | --- | --- |
| 字段准确性 | 已有合成文本、PDF/PNG 小样本 | adapter/parser 已有 contract；尚无新 API 样本 |
| 漏提 | `not_found` 可保留空证据 | `not_found` 保留空值，不能生成建议 |
| 无依据补全 | `sourceText` 与 uncertainty parser 已约束 | visible candidate 必须有 sourceText；无证据即拒绝 |
| 对象归属 | H027 加入稳定 person group，歧义时阻断 | 单一 `property` subject group 才映射；多物件/无物件整组阻断 |
| 模糊提醒 | `unclear/conflict` 进入人工复核 | 映射只返回候选，不覆盖已有人工值 |

## 交付门槛

1. H028 已补充物件专用 strict schema、parser、`property.*`/`lease.*` 白名单、对象归属选择器和只读映射。
2. 准备清晰、表格、多个物件、缺失/冲突的合成 PDF/PNG，并独立渲染检查。
3. 证明 `queued → processing → mapped/failed`、候选来源和人工确认保存刷新；模型调用成功不等于案件物件已写入。
4. 对象归属、页面保存刷新和权限验证仍未完成；当前不接入身份 adapter、不触碰真实案件、不部署 Preview/Production。
