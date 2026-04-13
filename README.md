# Broker Desk (MVP)

房产经纪报价 + 客户跟进工作台。

## 项目目标
用一个轻量 Web 工作台替代 `Excel + 聊天记录 + 手工计算`，聚焦三件事：
- 客户管理
- 报价生成
- 跟进推进

## 已实现页面
- `/` Dashboard（今日待跟进、最近报价、风险提醒）
- `/clients` 客户列表（搜索、阶段/用途/热度筛选、排序、快速操作）
- `/clients/new` 新建客户（30 秒建档）
- `/clients/[id]` 客户详情（左主内容 + 右摘要侧栏）
- `/clients/[id]/edit` 编辑客户
- `/quotes` 报价列表
- `/quotes/new` 报价生成器（左输入右实时结果）
- `/quotes/[id]` 报价详情（状态、版本复制、摘要复制、打印入口）
- `/quotes/[id]/print` 打印页
- `/board` 跟进看板（Kanban 拖拽改阶段，自动写入阶段变更跟进记录）
- `/settings/output-templates` 出力模板调整中心（全模板标题/公司信息/注意文/显示开关）

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

## 当前数据层说明
当前版本为 **双驱动数据仓库**（`src/lib/data.ts`）：
- `memory`：无需数据库初始化，启动即用（重启后运行时新增数据会重置）
- `postgres`：可接 Supabase/PostgreSQL，持久化保存数据

可通过 `.env` 切换：
```bash
DATA_DRIVER=memory
# or
DATA_DRIVER=postgres
DATABASE_URL=postgresql://...
```

## 附件存储策略（可扩展）
当前附件上传已抽象为存储适配层（`src/lib/attachment-storage.ts`）：
- `ATTACHMENT_STORAGE_MODE=local_public`：默认，本地保存到 `public/uploads/YYYY/MM/...`
- `ATTACHMENT_STORAGE_MODE=external_reference`：不接收直接上传，改为登记外部存储 URL（为后续 S3/Supabase 对接预留）

说明：
- 取込センター的“添付登録”已支持两种方式：直接上传 or 外部保存先 URL。
- 附件历史中会自动提供可访问链接（`/` 或 `http(s)`）。

## 交接文档
- `docs/IMPLEMENTATION_HANDOFF.md`（信息架构、跳转、组件清单、可直接贴 Cursor 的 Prompt）
- `docs/POSTGRES_SETUP.md`（Postgres/Supabase 切换指南）
- `docs/postgres_schema.sql`（可手动执行的初始化 SQL）
- `docs/JP_COMPLIANCE_CHECKLIST.md`（日本市场权威映射清单与字段落地说明）
- `docs/OUTPUT_PACKAGE_STANDARD_JP.md`（产出物标准设计）
- `docs/OUTPUT_AUDIT_JP_2026-03-27.md`（产出物专业度审计）

## 本地运行
```bash
npm install
npm run dev
```

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

## 数据驱动健康检查
启动后可访问：
- `/api/health/data`

返回示例：
- `{"ok":true,"driver":"memory"}`
- `{"ok":true,"driver":"postgres"}`
