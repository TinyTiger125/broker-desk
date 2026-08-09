# 远程资料读取服务契约

## 调用约束

Broker Desk 只向已配置且处于 `DOCUMENT_READING_ALLOWED_HOSTS` 的 HTTPS endpoint 请求读取。请求超时为 60 秒，失败时不写入确认字段。

请求使用 Bearer token，并以 JSON 发送：

```json
{
  "document": {
    "name": "identity-card.jpg",
    "mimeType": "image/jpeg",
    "base64": "..."
  },
  "jobId": "import_job_..."
}
```

## 响应要求

服务必须返回可审计的候选，不得声称候选已经确认。每个候选应至少包含字段键、候选值、来源页或区域、置信度和模型/规则版本。服务端不得将原始证件内容写入日志或错误消息。

建议响应：

```json
{
  "candidates": [
    {
      "fieldKey": "applicant.name",
      "value": "山田 太郎",
      "confidence": 0.94,
      "source": { "page": 1, "region": "name" },
      "extractorVersion": "reader-2026-08-01"
    }
  ]
}
```

## 安全与数据处理要求

- 服务提供方不得将资料用于训练或二次用途。
- 请求、响应、日志和临时文件必须加密并有明确删除时限。
- 凭证仅存于密钥系统；不得进入浏览器、仓库、错误页面或任务摘要。
- 服务故障、超时或无法解析时返回可归类错误，Broker Desk 将其留在 `failed`，由人工确认或重试决定后续操作。

接入任何付费 OCR/AI 服务前，必须单独确认供应商费用、数据处理条款、数据保留、跨境传输和故障支持范围。
