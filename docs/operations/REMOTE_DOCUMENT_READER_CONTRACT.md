# 远程资料读取服务契约

## 调用约束

Broker Desk 只向已配置且处于 `DOCUMENT_READING_ALLOWED_HOSTS` 的 HTTPS endpoint 请求读取。请求超时为 60 秒，失败时不写入确认字段。

请求使用 Bearer token，并以 JSON 发送：

```json
{
  "document": {
    "filename": "identity-card.jpg",
    "contentBase64": "..."
  }
}
```

The adapter keeps job and tenant identity inside Broker Desk. The remote
reader receives only the source document payload and returns OCR lines; it
does not receive or write Broker Desk job IDs.

## 响应要求

服务必须返回可审计的候选，不得声称候选已经确认。每个候选应至少包含字段键、候选值、来源页或区域、置信度和模型/规则版本。服务端不得将原始证件内容写入日志或错误消息。

建议响应：

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "lines": ["氏名 山田 太郎", "生年月日 1990年1月1日"]
    }
  ]
}
```

Broker Desk derives field candidates from these OCR lines and records the
source page, confidence, and parser version. An empty `pages` array, pages
whose lines are all blank, malformed JSON, non-2xx responses, and timeouts are
failures; they never become successful candidates.

## OpenAI Responses API 适配候选

项目已有 OpenAI Responses API 客户端。`DOCUMENT_READING_PROVIDER=openai_responses`
时，非生产运行可直接把私有 PDF 作为 `input_file`、图片作为 `input_image`
的 Base64 data URL 发送给 `identity_document_extraction_assist` 任务路由，要求
Structured Outputs 返回 `documentType`、分页原文行和带 `pageNumber`、短引文及
`uncertainty` 的候选。候选会映射为 Broker Desk 的 `method=ai` 草稿，`sourceRange`
保留页码、证据引文和不确定性；`clear`/`unclear`/`conflict` 是复核分层，不是模型
自报概率。空值不填充，`not_found` 保持缺失。

当前生产 readiness 仍拒绝该 provider；这是本地/非生产适配与评测路径，不代表已
批准把身份证件发送至 OpenAI。正式开启前必须单独确认数据处理目的、区域与保留、
账户费用、密钥作用域和部署环境；不能仅凭 `OPENAI_API_KEY` 存在就放行生产。

## 安全与数据处理要求

- 服务提供方不得将资料用于训练或二次用途。
- 请求、响应、日志和临时文件必须加密并有明确删除时限。
- 凭证仅存于密钥系统；不得进入浏览器、仓库、错误页面或任务摘要。
- 服务故障、超时或无法解析时返回可归类错误，Broker Desk 将其留在 `failed`，由人工确认或重试决定后续操作。

接入任何付费 OCR/AI 服务前，必须单独确认供应商费用、数据处理条款、数据保留、跨境传输和故障支持范围。
