# Broker Desk 版本台账与发布 Manifest

> 唯一的本地版本、发布与部署台账。它记录事实、证据和未知项，不替代
> Git、GitHub、Vercel 或 Supabase 的真实状态；没有证据的字段必须写成
> UNVERIFIED，不得用“看起来像已部署”补齐。
>
> 本台账不创建 Git tag/Release，不改变远端，不改变 package.json 版本号，
> 不授权 Production migration、回退或部署。

## 1. 真源与版本规则

- 仓库真源：/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev
- Git remote：https://github.com/TinyTiger125/broker-desk.git
- 发布规则沿用 RELEASE_V0.2.0_RC1_2026_08_05.md 与
  RELEASE_V0.2.0_RC2_2026_08_09.md：

  | 版本形态 | 语义 | 放行条件 |
  | --- | --- | --- |
  | v0.x.y-rc.n | 仍待验收的候选版本；rc.n 只递增，不复用 | 所有目标部署、迁移 ledger、运行验收和回退条件均绑定同一 SHA 后，仍可标为候选 |
  | v0.x.y | 已接受的封闭公测/测试基线 | 对应候选的产品、运行、数据和回退门禁均有证据；不是仅 CI/build 通过 |
  | v1.0.0 | 首个生产就绪稳定版本 | 另行满足 PUBLIC_BETA_RELEASE_GATE.md 的生产前门 |

- x 表示不兼容的产品/数据合同变更，y 表示向后兼容的产品能力增量，z
  表示向后兼容的修复；预发布只使用 -rc.n，不另造 closed-beta、日期版或
  业务线版号。旧文档中的 v0.3.0-closed-beta 只保留为历史措辞，不作为新真源。
- 中文发布名是给人看的短名；不可替代语义版本号，也不可替代精确 SHA。
- package.json 的 "version": "0.2.0-rc.2" 是现有工程元数据，不是本台账的发布证明；
  本轮不修改它来冒充发行。

## 2. 当前状态总表（截至 2026-10-03）

| 位置/角色 | 版本字段 | 中文名 | 精确 SHA | 状态 | 结论 |
| --- | --- | --- | --- | --- | --- |
| Tokyo 用户 Production 当前部署 | v0.3.0-rc.1（台账候选编号，**不表示已发布/已验收**） | 邀请投递幂等热修复候选 | 701a8bdbdc86073f60cd07cfdfd79da73925295d | DEPLOYED_NOT_ACCEPTED | Tokyo 返回 production_migrations_required；Production 不可用，禁止把它写成已验证版本 |
| Tokyo Production 上一曾正常部署 | 未绑定语义版本（历史部署，不回填版号） | Tokyo 上一已验证基线 | 0f18d6ccc1b4c2fc921ae05f0978de6b7ac0c3b5 | PREVIOUSLY_VERIFIED_NOT_RECHECKED | 部署 dpl_BqYgpSjbArxFDUSxskzngSXpNQBK 曾正常；本轮未重验，不代表当前可用 |
| 本地 selected candidate 应用基线 | v0.3.0-rc.2（台账建议编号，**未部署**） | V1 输入与邀请可靠性候选 | 9bc001b20c397bf054dc5fb23561c41d821d85f5 | LOCAL_NOT_DEPLOYED | 这是业务 candidate 基线，不是本次 docs 治理提交后的当前 HEAD；包含 PR16 之外的 Excel/OCR、PDF、导航/UI 与邀请后续改动 |

> v0.3.0-rc.1 与 v0.3.0-rc.2 是本台账为后续沟通提供的候选编号，不是已创建
> 的 tag、GitHub Release、Vercel Release 或 Production 发布事实。当前仓库仍保留
> package.json 的 0.2.0-rc.2。

## 3. 自动部署目标 Manifest

自动部署面按项目逐一记录。当前已知只有以下两个项目；连接 API 只列出一个项目、
浏览器曾显示三个项目，不能据此推断更多目标。

### 3.1 v0.3.0-rc.1 候选（SHA 701a8bdb...）

| 自动部署目标 | Project ID | Deployment ID | URL/入口 | target | 观察到的状态 | 证据边界 |
| --- | --- | --- | --- | --- | --- | --- |
| broker-desk-tokyo-validation（真正用户站） | prj_W4OClYmrW25iNApoSK2y7djJsZDM | dpl_Rqf6ySXA91JKHpPRHkvgbBj6Z7Rt | project-6q8up.vercel.app | Production | BLOCKED: production_migrations_required | 当前部署事实来自本轮交接背景；未执行修复、迁移或回退 |
| broker-desk-staging | prj_1cQA4Bc1BsVVM0qhzDdsFGzAVd0Q | dpl_FXTu3VGqFDBgpJBGq5ZwjZhNxmg8 | URL 未提供 | Production | READY，但 /health=503；不能视为真正用户站 | Project/Deployment 与状态证据截至 2026-10-02；Production/Shared 变量 UI 为空，未把它写成健康用户站，也未刷新当前状态 |

### 3.2 v0.3.0-rc.2 本地 candidate（SHA 9bc001b...）

- 没有已确认的部署 ID、Production URL 或 Preview URL；状态为 NOT_DEPLOYED。上表 staging 的部署属于 701a8bd 线上候选，不属于这个本地 candidate。
- 如果以后允许部署，必须在发布动作前刷新上表每个自动目标的部署 SHA、状态和
  URL；staging 的 Project/Deployment ID 目前只有 2026-10-02 的证据，不能沿用为
  下一次发布的当前状态，也不能只复核 Tokyo 用户站。
- 本地 candidate 不得通过“当前线上 URL 看起来能打开”获得 DEPLOYED 或
  VERIFIED 状态；每个目标都要有部署 SHA 和独立运行证据。

## 4. 发布 Manifest：v0.3.0-rc.1（候选，未验收）

### 身份与范围

- **发布名**：邀请投递幂等热修复候选
- **状态**：DEPLOYED_NOT_ACCEPTED；不是已发布版本，不是 Production ready。
- **精确发布 SHA**：701a8bdbdc86073f60cd07cfdfd79da73925295d
- **基线 SHA**：0f18d6ccc1b4c2fc921ae05f0978de6b7ac0c3b5
- **变更范围**：GitHub PR #16 合并的 18 files；PR 页面列出邀请投递 claim、状态
  与测试/rollback 相关文件。PR #16 显示 4 checks passed；这只是合并/CI 证据。
- **远端证据**：https://github.com/TinyTiger125/broker-desk/pull/16、
  https://github.com/TinyTiger125/broker-desk/commit/701a8bdbdc86073f60cd07cfdfd79da73925295d

### 数据库迁移集合

- **数据库**：Supabase ilujuwuzaqwcbpnqixen。
- **ledger**：public.broker_desk_schema_migrations。
- **本候选相对基线的迁移 delta**：
  db/migrations/20261002_001_invitation_delivery_claim.sql
- **对应回退文件**：
  db/migrations/rollback/20261002_001_invitation_delivery_claim.sql
- **用途**：增加 tenant_memberships.invitation_delivery_state，并替换邀请
  prepare/finalize 函数；不是发送邮件，也不自动修改 RLS 或调用 Clerk。
- **线上 ledger 事实**：UNVERIFIED。Tokyo 已报 production_migrations_required，
  但缺失集合尚未完整核实；不能只看标准 Supabase migration UI，也不能据此声称
  该 migration 已应用。

### 验证证据

| 证据 | 状态 | 可证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| PR #16 checks | PASS（GitHub 页面） | 合并前声明的 4 个 checks 已通过 | 不证明 Tokyo Production migration、线上用户流程或邮件到达 |
| isolated PostgreSQL migration/reliability checks | PASS（PR 描述/候选本地测试合同） | 迁移与邀请 claim 的受控测试路径存在 | 不证明 Supabase ilujuwuzaqwcbpnqixen ledger 当前状态 |
| Tokyo Production | BLOCKED | 当前部署返回缺迁移阻断 | 不允许执行迁移、APPONLY 回退或发布放行 |
| Production rollback rehearsal | NOT_RUN | 未触碰 Production | 不得写成可回退已验证 |

### 回退与兼容条件

1. 未经用户在动作点明确授权，不执行 Production migration、rollback、重新部署或
   APPONLY 回退；当前用户尚未批准 APPONLY。
2. 新应用代码依赖 invitation_delivery_state 及新函数合同；因此必须先确认目标
   ledger 已连续应用该 migration，才可把 701a8bd 作为可用应用版本。当前条件不满足。
3. 若要回退到 0f18d6c...，必须先停止/切换仍会读写新字段的新应用流量，再在
   已授权的隔离环境核对 sending、unknown、provider_accepted 状态和审计，最后
   才能使用对应 rollback。不能让旧应用与已删除的新列并行运行。
4. rollback 文件恢复旧函数包装并删除新增列；它不是“无条件安全按钮”。执行前必须
   保存 ledger/readback、应用 SHA、目标 deployment、数据库备份/恢复证据与兼容检查。
   本轮未执行回退，未宣称回退已验证。

## 5. 发布 Manifest：v0.3.0-rc.2（本地候选，未部署）

### 身份与 pending 清单

- **发布名**：V1 输入与邀请可靠性候选
- **状态**：LOCAL_NOT_DEPLOYED；仅用于下一次受控发布前的台账占位。
- **精确业务 candidate 基线 SHA**：9bc001b20c397bf054dc5fb23561c41d821d85f5
- **当前治理提交**：bdb57b35891ef8b4692ea64147013668fc1fc25f；它只承载本台账/校验器，不改变业务 candidate SHA。
- **当前 package.json**：0.2.0-rc.2，本轮未修改。
- **相对本地 origin/main=7a283d4 的候选提交**：包含以下可独立拆分的 pending
  范围；这些提交不等于已上线：

  | pending 范围 | 精确提交/范围 | 当前状态 |
  | --- | --- | --- |
  | V1 Excel/身份资料输入与证据措辞 | 8f63f46、8b9727a、16a2dfd、7ee878b | PENDING_RELEASE_AND_RUNTIME_VERIFICATION |
  | PDF 地址适配与合成 fixture | f3f83ea、c6c1cb7、6eda068 | PENDING_RELEASE_AND_RUNTIME_VERIFICATION |
  | 导航/UI 与 candidate 合同/门禁 | 7392c37、367ee66、3979f2a | PENDING_RELEASE_AND_RUNTIME_VERIFICATION |
  | 邀请可靠性后续（含本地 migration/隔离 PostgreSQL harness） | 9421b74、d0c446e、a0f78d1、4bc298f、c77a327、b67d552、3ed1713、9bc001b | PENDING_RELEASE_AND_RUNTIME_VERIFICATION |
  | 生产构建迁移保护 | eadc87d | PENDING_RELEASE_AND_RUNTIME_VERIFICATION |

- 以上是按主题的最小可读索引，不把整个 candidate 宣称为同一个已验收产品；下次
  发布必须按实际变更重新选择范围并生成新的单一 manifest。

### 迁移集合与部署面

- 该 candidate 当前新增的迁移 delta 仍是：
  db/migrations/20261002_001_invitation_delivery_claim.sql，回退文件同上。
- 如果 v0.3.0-rc.1 未经授权且未在目标 ledger 应用，则 v0.3.0-rc.2 仍受同一
  migration 前置条件阻断；如果未来已应用，则必须以目标 ledger readback 的连续
  prefix 证明“无新增 migration”而不是凭文件列表猜测。
- Tokyo 与 staging 仍是预期自动部署目标，但本 candidate 没有部署证据；project/deployment
  ID 需在发布动作后逐项回填，不能复用 701a8bd 的 deployment ID。

### 目前不能关闭的门

- Tokyo production_migrations_required 未修复/未重验。
- Supabase migration ledger 缺失集合未完整核实。
- 当前 candidate 的浏览器、Production、真实用户、回退演练证据未取得。
- 本地 Excel/OCR/PDF/nav/UI 更新尚未与 PR16 线上 18 files 形成新的受控发布边界。

## 6. 每次发布的最小回填字段

新建或更新候选时，只在本台账增加一个 manifest，至少填满以下字段后才能从
LOCAL_NOT_DEPLOYED 进入 DEPLOYED_NOT_ACCEPTED：

1. 语义版本、中文名、状态、精确 40 位 SHA、基线 SHA、变更范围。
2. 每个自动部署目标的 project、target、deployment ID、URL 和实际部署 SHA。
3. 数据库指纹、public.broker_desk_schema_migrations ledger 连续 prefix、完整迁移
   delta、对应 rollback 文件及 readback 证据链接/文件。
4. lint/typecheck/专项测试/build 与真实浏览器/Preview/Production 证据的分层状态；
   PASS 不得代替未执行的层。
5. 前向兼容、回退前置条件、备份/恢复证据和明确的回退 SHA；未执行写成
   NOT_RUN，不写“可回退”。

### 交接规则

- 当前线上、上一曾验证、候选 pending 三者始终分行；不得用“最新 candidate”代替
  Production 状态。
- 长 SHA 只在 manifest 中作为绑定事实出现；日常沟通用“版本号 + 中文名 + 状态”，
  需要执行时再从 manifest 复制完整 SHA。
- 任何未知部署目标、迁移缺口或用户决定都保持 UNVERIFIED/BLOCKED，不靠猜测闭门。
