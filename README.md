# Broker Desk

面向日本不动产经纪业务的资料管理、确认与文书输出工作台。

## 项目目标
核心链路：

`录入资料 -> 提取与人工确认 -> 案件资料整理 -> 选择模板 -> 预览与输出 -> 审计留痕`

当前代码具备封闭公测所需的认证、租户、模板、资料确认与异步导入骨架；它尚未部署到托管服务器。真实客户资料只应在满足 [公测门禁](docs/operations/PUBLIC_BETA_RELEASE_GATE.md) 的托管环境中处理。

## 已实现页面
- `/` Dashboard（今日待跟进、最近报价、风险提醒）
- `/import-center` Excel 物件导入、字段映射、导入结果与下一步引导
- `/properties` 结构化物件数据台账
- `/parties` 相关主体台账
- `/output-center` PDF 输出中心（模板选择、输出前检查、预览、生成、历史）
- `/settings/output-templates` 出力模板调整中心（全模板标题/公司信息/注意文/显示开关）
- `/clients` 客户列表（搜索、阶段/用途/热度筛选、排序、快速操作）
- `/clients/new` 新建客户（30 秒建档）
- `/clients/[id]` 客户详情（左主内容 + 右摘要侧栏）
- `/clients/[id]/edit` 编辑客户
- `/quotes` 报价列表
- `/quotes/new` 报价生成器（左输入右实时结果）
- `/quotes/[id]` 报价详情（状态、版本复制、摘要复制、打印入口）
- `/quotes/[id]/print` 打印页
- `/board` 跟进看板（Kanban 拖拽改阶段，自动写入阶段变更跟进记录）

## 已实现产品钩子
- 报价页自动生成客户可读摘要（简洁版/正式版）并支持一键复制
- 报价页异常提示（首付偏低、月支出偏高、关键费用缺失等）
- Dashboard 自动优先级跟进列表（Today List）
- Dashboard 法定対応アラート（媒介契約期限、35条/37条、個人情報同意、AML）
- 客户详情页聊天式跟进输入 + 阶段建议一键推进
- 报价详情页对比模式（同客户方案并排）
- 报价预览页升级（可打印/可分享的专业版布局）
- 新建客户页模板预填（居住用/投資用/法定対応開始）
- ヒアリングメモ自動抽出（ルールベース）とAPI化（`POST /api/clients/intake/parse`）

## 标准产出物（日本市场版）
在 `提案详情页` 已提供标准输出入口，支持 4 类模板：
- `購入提案書`：`/quotes/[id]/print?type=proposal`
- `費用見積明細書`：`/quotes/[id]/print?type=estimate_sheet`
- `資金計画書（ローン試算）`：`/quotes/[id]/print?type=funding_plan`
- `試算前提条件説明書`：`/quotes/[id]/print?type=assumption_memo`

可通过浏览器直接 `印刷 / PDF保存`。
模板可在 `帳票テンプレート` 页面统一调整，并支持一键恢复日本标准模板。

## 数据、文件与读取边界

- 本地演示可使用内存数据或开发数据库，但不得写入真实证件、合同或客户资料。
- 受控公测和生产运行必须使用 PostgreSQL，并通过 Clerk 身份和 tenant membership 建立租户范围。
- 现阶段可用 `ATTACHMENT_STORAGE_MODE=postgres_private` 作为封闭公测的私有附件实现。`object_private` 是后续可替换的对象存储适配位，当前不会假装支持。
- 身份证件、Excel/PDF 的长耗时读取不会在页面请求中执行；资料先进入 `import_jobs`，由受鉴权的后台 worker 处理。详见 [异步导入运行手册](docs/operations/IMPORT_WORKER_RUNBOOK.md)。

## 文档入口
- `docs/PROJECT_MEMORY.md`（固定项目记忆入口：当前定位、进度、风险、下一步）
- `docs/README.md`（文档地图：当前文档、工程文档、运营文档、归档规则）
- `docs/product/`（当前产品方向、输入/工作台/输出/AI/多租户权限模型）
- `docs/engineering/`（Postgres、运行稳定性、schema）
- `docs/operations/`（PM 控制、合规、日语术语）
- `docs/archive/`（历史交接、早期 MVP、Stitch 设计过程、旧输出审计）

## 本地运行
```bash
npm install
npm run dev
```

## 登录配置
业务页面默认不再以演示身份直接开放。复制 `env.example` 为 `.env.local`，填入 Clerk 密钥后重启服务：
```bash
BROKER_DESK_AUTH_MODE=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
# Optional but recommended for lower request latency. This is the public
# signing key used to verify Clerk session tokens without a network round trip.
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```
未配置 Clerk 时，所有业务路由会停在 `/sign-in`，不会绕过账号验证。仅本地 QA 可显式设置 `BROKER_DESK_AUTH_MODE=demo`；不得用于共享链接或公开测试。

## 产出物公司信息配置（推荐）
可在 `.env` 配置文书抬头信息：
```bash
OUTPUT_COMPANY_NAME=株式会社XXXX不動産
OUTPUT_DEPARTMENT=売買仲介部
OUTPUT_REPRESENTATIVE=山田 太郎
OUTPUT_LICENSE=宅地建物取引業免許番号 東京都知事(1)第XXXXX号
OUTPUT_ADDRESS=東京都...
OUTPUT_PHONE=03-....
OUTPUT_EMAIL=...
```

## 构建验证
```bash
npm run lint
npm run build
npm run test:public-beta-gate
npm run test:production-security
```

## 术语与回归检查（推荐）
```bash
# 日文术语规范检查（防止混入禁用词）
npm run test:ja-terms

# 启动服务后执行 API/UI 回归检查
BASE_URL=http://127.0.0.1:3000 npm run test:regression
```

## 多语言（中 / 日 / 韩）
- 已支持 `ja` / `zh` / `ko` 三语切换（通过顶部导航语言选择器）
- 语言会通过 Cookie 持久化（`brokerdesk_locale`）
- 也可通过 API 主动切换：
```bash
curl -X POST http://127.0.0.1:3000/api/locale \
  -H "content-type: application/json" \
  -d '{"locale":"zh"}'
```

## CI 自动化
- 已接入 GitHub Actions：`.github/workflows/ci.yml`
- 在 `push` / `pull_request` 时自动执行：
  1. `npm run test:ja-terms`
  2. `npm run lint`
  3. `npm run build`
  4. 启动本地服务并执行 `npm run test:regression`

## 数据健康检查
启动后可访问：
- `/api/health/data`

返回仅包含可用性信息，不泄露数据库驱动、主机、迁移状态或内部错误。
