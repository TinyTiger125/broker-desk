# TASK-050 / 2026-11-20 report1119 输入与客户资料候选实施

## 任务名称

Broker Desk `report1119.pdf` 15 页反馈的本地候选实现（客户资料、通用联系人/地址输入与录入阅读入口）。

- 状态: 本地候选完成；root 本地复核及 Neo 试看通过，已获 GitHub 推送授权；正式站发布待 FAX 数据库迁移
- 当前工作单：`BD-1119-IMPLEMENT-20261120`
- 基线：`8a0ea7f91e0279ff2404ad6de8405c6babdd9483`
- 实施分支：`codex/report1119-client-input-20261120`
- 实施工作树：`/private/tmp/broker-desk-bd-20261117-184`
- 工作树边界：该目录是 canonical repository 的 Git linked worktree；`git rev-parse --git-common-dir` 指向 canonical `.git`。不触碰脏的 `broker-desk-web-dev` 工作树。

## 用户结果与范围

实现已确认的 report1119 结果：

- 文件选择后不自动启动识别；只有点击“读取”才启动，并保留读取中状态；换错文件不产生识别调用或费用。
- 客户编辑与相关录入页的返回动作只保留正确的直接上级语义。
- 可折叠表单分组标题显示“已填/总数”，只计算非空值，`?` 帮助提示仍可用，填充和清空后计数即时更新。
- 客户字段文案修订：`主体種別`→`種別`、`氏名（ラテン文字）`→`氏名（ABC）`；客户编辑 UI 移除 `契約・法定情報`、`年収基準日`、`年収情報の出典`、重复 `意向エリア`、`ローン事前審査`，但不删除或覆盖既有存储字段。
- 所有可编辑产品邮编/地址对使用官方 Japan Post 数据完成行政地址前缀；支持 7 位邮编、半角/全角输入、明确未找到提示，并保留人工填写的详细地址，不覆盖冲突详情。
- 所有可编辑产品电话输入接受空值、有效日本手机或有效日本座机；统一全角/分隔符归一化并按实际区号分组（至少覆盖东京 `2-4-4`、福冈 `3-3-4`）；不把格式检查表述为号码已接通。
- 年收入、预算上下限均以整数 `万円` 展示和输入，拒绝小数；既有客户存储值的单位语义保持为现有数据库/内存使用的日元，表单边界显式换算为 `万円`，不对同一边界重复乘除 10,000。
- 旧客户金额没有单位 provenance：旧日元值按精确 `value / 10000` 展示并标记保持中（例如 85,000 円显示 8.5 万円），未改动时原值原样保存；金额若被改动，只接受新的十进制整数 `万円`。禁止按数量级猜测旧值单位。
- 预算类型只保留三项：`【売買】購入総額`、`【売買】月額ローン返済`、`【賃貸】月額家賃`；用途只保留六项：`未定`、`【売買】居住用`、`【売買】投資用`、`【賃貸】住居`、`【賃貸】テナント`、`【賃貸】マンスリー`；旧值继续可读，新值可保存/重开。
- 既有客户的旧用途 `self_use` / `investment` 在编辑选择框中以“旧值・买卖/租赁未分类”上下文保留可见；未触碰用途或提交遗漏时，编辑动作按租户权限读取的 authoritative purpose 原样保存。只有明确选择当前六项之一才替换旧值；浏览器伪造 legacy 或显式空值不得写入新记录或改写 authoritative purpose。
- 客户“本人资料”在勤務先電話附近新增 `勤務先FAX`，保存/重开且不破坏旧记录；兼容内存与 PostgreSQL 读写代码，但本轮不执行数据库迁移。

## 产品表面覆盖

- 主客户新建/编辑：`client-form.tsx`、`actions.ts`、客户页返回链接。
- 客户列表快速注册：`src/app/clients/page.tsx` 的可提交电话与预算上限输入，沿用同一服务端规范化/整数万円边界。
- 关系者/主体编辑：`party-profile-form.tsx` 与 `actions.ts`。
- 案件工作台字段编辑与案件概览通用字段：`case-workbench-field-form.tsx`、`case-overview.tsx`、`case-contact-validation.ts`。
- 案件详情路由：`src/app/cases/[id]/page.tsx` 的联系人校验失败提示与共享日本电话规则保持一致。
- 物件编辑：`property-responsive-form.tsx` 及其地址校验/保存路径。
- 案件工作台中的关系者编辑抽屉：`case-association-manager.tsx` 仅用于把客户表单成功回写到本地抽屉状态，沿用同一日元/万円兼容规则；不新增独立字段或保存路径。
- 发行方输出设置：`src/app/settings/output-templates/page.tsx` 及其保存动作，电话字段使用同一日本手机/座机校验与归一化；它不是客户资料或真实联系人记录。
- 全局上级导航：`src/components/back-to-parent.tsx` 在客户编辑路由上复用同一已校验的 `returnTo`，使全局“上の階層へ戻る”和页面“戻る”保持同一直接父菜单。
- 客户资料入口重定向：`src/app/entry-actions.ts` 在新建客户成功后的同记录编辑重定向中保留已校验的 `returnTo`，避免 `flash=client_created` 丢失父菜单上下文。
- 若 `flash=client_created`/`entry_reused` 且没有可用 `returnTo`，两处返回都收敛到 `/clients`；普通已有客户编辑仍回到该客户详情，不依赖浏览器历史。
- 资料读取入口：`entry-file-picker.tsx`、`entry-preview.tsx` 及客户/物件调用方。仅改变用户主动读取时机和紧凑布局，不改文件校验、上传、OCR、候选确认、审计和原件归档语义。
- 不修改 PDF 模板校准、演示 fixture、只读展示或生产数据。

## 严格写集

实施角色只能修改以下文件：

- `docs/tasks/TASK-050.md`
- `src/components/client-form.tsx`
- `src/components/entry-preview.tsx`
- `src/components/entry-file-picker.tsx`
- `src/components/back-to-parent.tsx`
- `src/app/entry-actions.ts`
- `src/components/party-profile-form.tsx`
- `src/components/property-responsive-form.tsx`
- `src/components/case-association-manager.tsx`
- `src/app/settings/output-templates/page.tsx`
- `src/components/case-workbench-field-form.tsx`
- `src/components/case-overview.tsx`
- `src/app/clients/[id]/edit/page.tsx`
- `src/app/clients/[id]/page.tsx`
- `src/app/clients/page.tsx`
- `src/app/cases/[id]/page.tsx`
- `src/app/actions.ts`
- `src/lib/client-form-state.ts`
- `src/lib/client-money.ts`
- `src/lib/domain.ts`
- `src/lib/options.ts`
- `src/lib/japanese-mobile-phone.ts`
- `src/lib/case-contact-validation.ts`
- `src/lib/japan-postal-code.ts`
- `src/lib/japanese-postal-code-validation.ts`
- `src/data/japan-postal-code-index.ts`
- `src/app/api/postal-codes/lookup/route.ts`
- `src/lib/data.memory.ts`
- `src/lib/data.postgres.ts`
- `docs/engineering/postgres_schema.sql`
- `db/migrations/20261120_001_client_employer_fax.sql`
- `scripts/check-client-form-contract.mjs`
- `scripts/check-client-phone-contract.mjs`
- `scripts/check-case-contact-validation-contract.mjs`
- `scripts/check-japan-postal-code-lookup.mjs`
- `scripts/check-import-center-object-actions.mjs`（entry `finishEntry` 合同需显式注入本卡新增的 `normalizeEntryReturnTo`，验证真实 returnTo 重定向行为）
- `scripts/check-report1119-contract.mjs`
- `scripts/sync-japan-postal-codes.mjs`

`db/migrations/20261120_001_client_employer_fax.sql` 仅作为可审阅、未执行的生产迁移候选纳入本卡；实施角色不得运行它或任何其他 migration。若需修改列表外文件、修改认证/权限/租户边界、改变 OCR/识别计费或写入真实数据，必须停止并取得新卡；本卡不授权 push、deploy、migration 执行或生产操作。

## 数据与兼容边界

- 仅移除客户表单 UI 控件，不从 `clients` 记录、PostgreSQL 列或内存对象删除 legacy 字段；更新动作必须保持未提交字段的既有值。
- 旧金额的保留判定必须使用编辑动作按租户权限读取的现有客户记录；浏览器不能提交一个旧值基线来取得保留资格。新建动作和伪造客户端值不得触发旧值保留分支。
- employer FAX 使用独立字段；PostgreSQL 代码和 `db/migrations/20261120_001_client_employer_fax.sql` 只提供可审阅的 schema/read/write 兼容，不运行迁移，不读取或写入真实客户资料。
- 电话只做日本格式校验和展示归一化，不验证号码是否存在、归属或可接通。已存储的有效日本手机/座机在客户、关系者、案件字段和发行方电话输入重开时按实际区号格式化；旧的非日本 legacy 值保持原文，直到用户实际编辑该字段。
- 邮编来源必须标明 Japan Post 官方全国数据；若本地索引未生成，必须给出可理解的未找到/索引不可用提示，不得把东京种子数据冒充全国覆盖。
- 全国索引必须是部署可带上的、由 Japan Post 官方下载源生成的受版本记录的构建产物；不能依赖被 `.gitignore` 忽略的工作树文件。同步脚本保留来源 URL、抓取时间、条目数和 `gzip+base64` 编码标记，生成压缩后的 `src/data/japan-postal-code-index.ts`；运行时只在服务端解压，若产物缺失、解压失败或内容损坏，必须明确返回索引不可用，不得静默降级为东京种子并宣称全国覆盖。

## 验收标准

- 定向合同能证明：读取按钮是唯一识别触发；电话手机/座机格式化与无效阻断；邮编行政地址补全、手填详情保留和未找到提示；六用途/三预算类型；整数 `万円`；客户隐藏字段 legacy 值不会被清空；勤務先FAX 读写字段存在。
- `npm run typecheck`、`npm run lint`、相关定向合同、`git diff --check` 通过。
- 浏览器验收由 root 独立执行，覆盖客户/主体/物件/案件字段、常规与窄桌面宽度、创建与编辑重开；静态合同不替代浏览器证据。
- 只在实现差异收敛、验证结果可复核且工作树仅含本卡写集后，才由项目经理裁决下一状态。

## 明确不做什么

- 不执行 migration，不推送 GitHub，不部署，不改生产数据，不接触真实客户资料；迁移文件只能作为未执行候选留在本地分支供审阅。
- 不把格式校验误称为号码活性校验，不覆盖用户已输入的地址详情，不删除 legacy 字段值。
- 不修改 PDF 生成/模板校准、OCR 提示词、识别计费、权限、租户隔离或认证流程。

## 2026-11-20 本地验收记录

- root 在本地演示数据服务 `http://localhost:3185` 独立检查客户新建/编辑、物件邮编带址、读取入口、返回层级、分组计数、窄桌面宽度，以及电话、FAX、金额、用途的保存重开路径。
- 旧客户 `client_park_jisoo` 的 `self_use` 用途在仅修改备注并保存、刷新后仍显示为旧值；明确改选 `【賃貸】住居` 后，保存和刷新均保留新值。旧预算 85,000 円显示为 8.5 万円，未改该字段保存后仍保留精确旧金额。
- 客户及物件邮编 `8130017` 带出 `福岡県福岡市東区香椎照葉`，物件已有详细地址未被覆盖；有效东京/福冈座机按实际区号分段，错误号码阻断保存，FAX 保存重开后仍格式化显示。
- `node scripts/check-client-form-contract.mjs`、`node scripts/check-report1119-contract.mjs`、`node scripts/check-japan-postal-code-lookup.mjs`、`node scripts/check-client-phone-contract.mjs`、`node scripts/check-case-contact-validation-contract.mjs`、`npm run prebuild`、`npm run typecheck`、`npm run lint`、`npx next build --webpack`、`git diff --check` 均通过；lint 有两条既有 warning，无 error。
- 未在本地调用真实模型或使用真实证件；未执行生产 FAX 迁移，未验证生产数据库读写；未推送或部署。此轮用户验收入口保持为本地演示服务。

## 2026-11-20 GitHub 推送授权与发布边界

- Neo 试看本地版本后明确同意推送 GitHub。本次仅推送实施分支，不执行正式库迁移，也不更新 `main` 或正式站。
- 推送前只读核对 Tokyo 正式库：`clients.employer_fax` 列尚不存在。正式运行的 `ensureSchema()` 只检查迁移，不自动新增列；直接发布这版会使客户新增或编辑失败。
- 后续正式站发布须先按独立授权执行 `20261120_001_client_employer_fax.sql` 并核对列存在，再将同一已验收提交快进更新 `main`，随后复核正式站。
