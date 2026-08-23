# TASK-039 / W8 Checkpoint A：切片 0 事实报告

日期：2026-08-19  
状态：只读事实核对完成；TASK-039 继续 `In Progress / Checkpoint A`。
范围：Clerk 身份、本地用户、经营主体、成员关系、工作区、权限、案件/人物/物件读取、附件/输出读取、公司表格与蒙板基础、TASK-038 接入边界。

本报告不授权实现，不修改 `src/`、数据库、migration、认证配置、权限模型或生产行为。

## 一、结论先行

当前系统已经具备若干可保留的底座：Clerk subject 可以绑定本地 `User`，数据表和适配器普遍带有 `tenantId`，租户会话会优先选择当前身份的 active membership，成员邀请发送、角色调整、暂停/恢复和审计 Action 已存在，公司表格/蒙板对象也已经按经营主体保存。

但这些底座尚不能被描述为“经营主体、成员权限与内部可见性已经成立”。当前最重要的事实是：

1. 正式用户没有“创建经营主体并同时成为首位 active owner”的入口。现有创建 Action 只允许平台所有者调用，并把首位成员写成 `invited`。
2. Clerk 邀请发送存在，明确的接受入口和接受身份校验不存在。外部身份绑定时，适配层会把该本地用户名下所有 `invited` membership 一并激活，不能证明接受了指定经营主体的指定邀请。
3. `/workspace` 没有 membership 时只给“返回登录”，会在登录页与工作区之间形成无解循环；非生产平台所有者还存在可伪造 active membership 的 break-glass fallback。
4. 用户端仍直接暴露八个底层职务角色和席位语义，没有“公司负责人 / 可管理公司表单配置 / 普通成员”三类易懂能力预设。
5. 案件和客户列表主要按个人 `userId/ownerUserId` 过滤；物件和部分详情读取只按租户；附件和一般生成输出又按上传/生成用户过滤。没有统一的“仅自己可见 / 公司成员可见”对象授权合同。
6. PostgreSQL RLS 当前主要证明“同一 active tenant 成员可访问该租户行”，不是两档对象可见性。若应用查询被放宽，RLS 不会自动替代对象级可见性判断。
7. 公司表格库和蒙板编辑入口已经存在于 TASK-038 工作区差异中，且对象查询按租户隔离；但权限仍依赖旧角色，正式案件入口和双身份运行证据仍未验证，不能把当前 harness 当作真实产品闭环。

因此，TASK-039 下一阶段首先应修复身份—membership—workspace 的真实链路，再确定能力预设和对象可见性门禁；TASK-038 的两身份受控验证仍被 active membership 和正式入口运行证据阻断。

## 二、已验证事实

### 1. Clerk 用户、本地用户、经营主体和成员关系

- Clerk subject 通过 `users.external_auth_subject` 与本地 `User` 关联。`src/lib/data.ts` 在 Clerk 模式先按 subject 查租户会话；找不到会话时可查已有本地用户，非生产环境才会调用 `ensureUserForExternalAuth` 建立本地用户（`src/lib/data.ts:78-119`）。
- memory 与 PostgreSQL 两条适配器都实现了“按 subject 复用已有用户、按邮箱补绑定或创建新本地用户”的逻辑（`src/lib/data.memory.ts:1918-1967`；`src/lib/data.postgres.ts:1778-1844`）。这证明了身份绑定，不证明 membership 已建立。
- `ensureUserForExternalAuth` 在找不到 membership 时仍会返回新本地用户；代码注释也明确允许“用户先存在、之后再分配首个工作区 membership”（`src/lib/data.ts:107-119`）。
- 经营主体创建底层会创建 tenant、按邮箱找到或创建 owner 用户，再创建 `tenant_owner` membership；但该 membership 当前状态是 `invited`，不是 `active`（`src/lib/data.memory.ts:2026-2085`；`src/lib/data.postgres.ts:1990-2077`）。
- 页面 Action `createTenantAccountAction` 需要 `requirePlatformOwnerSession()`，使用平台管理参数创建经营主体并发送 owner 邀请，随后返回 `/platform/accounts`；它不是登录用户的“创建公司并进入工作区”入口（`src/app/actions.ts:2740-2790`）。
- 当前 membership 状态类型只有 `active | invited | suspended`；邀请状态虽另有 `pending/accepted/revoked/expired/failed`，但不是一条完整的产品接受状态机（`src/lib/data.memory.ts:57-89`）。

### 2. 工作区入口与无关系循环

- `/workspace` 只列出当前本地用户的 active membership，且 tenant 状态必须是 `trial/active`；没有可用项时显示“尚未开通工作区”并只提供 `/sign-in` 返回链接（`src/app/workspace/page.tsx:55-73,84-96`）。当前没有创建经营主体、查看邀请或接受邀请入口。
- 生产会话在没有明确 tenant cookie 且 active membership 不是恰好一个时拒绝；非生产环境还可以对 allowlist 中的平台所有者生成一个临时 `platform_owner` membership，指向默认 tenant。这是受控恢复/引导的 break-glass 机制，不是真实成员关系（`src/lib/tenant-session.ts:57-92,104-137`；`src/lib/platform-owner.ts:4-33`）。
- `/sign-in` 当前文案仍把产品描述为邀请制并使用“席位”语言；这与“经营主体订阅、不按席位售卖”的目标语义不一致（`src/app/sign-in/[[...sign-in]]/page.tsx:5-15,29-35`）。

### 3. 邀请、接受、暂停、移除

- 邀请 Action 会在当前租户权限允许时创建/更新 `invited` membership，并调用 Clerk invitation API（`src/app/actions.ts:2843-2892`；`src/lib/clerk-invitations.ts:18-45`）。邀请 metadata 会带 tenant、membership 和 role，记录中也保存 provider invitation ID、URL、发送时间和失败原因。
- 当前没有独立的“接受邀请”Action、回调或页面。`ensureUserForExternalAuth` 在按 subject 或邮箱绑定本地用户后，会激活该用户名下所有 `invited` memberships，并写入 `accepted`（`src/lib/data.memory.ts:1918-1967`；PostgreSQL 对应实现同样存在）。这不能验证接受者点击的是哪个 tenant 的哪一条邀请，也不能验证接受身份与邀请 token 一致。
- 成员状态 Action 当前只接受 `active` 或 `suspended`，并把 invited→active 同时当作 accepted；没有 `removed` 状态或移除入口（`src/app/actions.ts:2922-2950`；`src/lib/data.postgres.ts:2382-2425`）。
- 最后一名 active owner 的降级或停用在 Action 层有保护，但适配器本身的 role/status 更新函数没有同等保护；保护不在所有调用路径上统一（`src/app/actions.ts:2655-2670,2895-2934`；`src/lib/data.postgres.ts:2352-2425`）。
- 当前成员页仍允许选择除 `platform_owner` 外的全部八角色，邀请、角色和席位文案直接暴露给用户；accepted 显示为“已登录”，不是“已接受并使用中”，没有移除按钮（`src/app/settings/members/page.tsx:20-75,93-104,131-145,197-220`）。

### 4. 权限是否依赖职务名称或个人身份

- 服务端权限判断以 `TenantMembership.role` 及 `roleHasTenantPermission` 为主；八角色映射到几十个动作（`src/lib/tenant-session.ts:150-179`；`src/lib/tenant-permissions.ts:1-228`）。
- 当前没有独立的“可管理公司表单配置” capability/预设。模板编辑、发布、回退等权限由旧角色动作决定；职务名称没有独立业务契约，但角色本身承担了过多产品含义。
- 对象读写仍大量接受调用者 `userId`，并按该 ID 过滤。这是个人所有/个人可见的旧实现，不是公司成员关系授权。
- `actorId`、`userId` 在审计和输出记录中可以记录操作者，但现有查询仍把它们当作可见性过滤条件，不能据此宣称对象归个人或归公司已经分离。

### 5. 案件、人物、物件的拥有与读取

**案件**

- memory 与 PostgreSQL 的案件列表、详情和确认数据更新都要求 `case.userId === callerUserId` 且 tenant 相同；当前是“本人案件”规则（`src/lib/data.memory.ts:2769-2825`；`src/lib/data.postgres.ts:3088-3155`）。
- 因此 TASK-038 可以在本人有权访问的案件上做最小验证，但当前不能证明同公司另一成员能读取共享案件。

**人物/客户**

- `listClients` 只返回 `ownerUserId === callerUserId` 且 tenant 相同的记录（`src/lib/data.memory.ts:3914-3960`；`src/lib/data.postgres.ts:4288-4355`）。
- `getClientById` 和 `getClientDetail` 却只按 `clientId + tenantId` 查找，不再检查 owner；这形成“列表个人过滤、详情租户级读取”的不一致，是否能到达取决于上层路由和当前 session，不能作为安全可见性契约（`src/lib/data.memory.ts:3963-4005`；`src/lib/data.postgres.ts:4358-4424`）。

**物件**

- `listQuoteFormData` 的 properties 查询只按 tenant 和 lifecycle，不按 user；`listHubProperties` 直接使用该 tenant 级数据，因此物件列表基础适配更接近公司共享，而不是“仅自己可见”（`src/lib/data.memory.ts:4028-4047`；`src/lib/data.postgres.ts:4453-4483`；`src/lib/hub.ts:242-269`）。
- 物件详情与归档动作也按 tenant/property ID 为主，没有统一 owner/visibility 语义（`src/lib/data.memory.ts:4088-4100,4132-4164`）。

**附件与生成文件**

- 一般附件的 list/get/read 仍要求 `userId + tenantId`；服务端专用的 `readPrivateAttachmentContentForTenant` 只要求 tenant + attachment ID（`src/lib/data.memory.ts:3197-3285`）。如果上层先完成案件权限检查，后者可作为公司工具读取；如果上层漏检，它不是对象级可见性保护。
- 一般 generated outputs 的 list/get 仍按 `userId + tenantId`；TASK-038 的保证输出另有按 `tenantId + caseId` 的读取函数，说明案件级归属方向已出现，但通用历史文件读取尚未统一（`src/lib/data.memory.ts:3296-3322,3560-3565`）。

### 6. 是否能安全增加“仅自己 / 公司成员可见”

结论：不能只在一个表上增加字段后宣称安全完成，必须同时改造三类对象的读取/更新门禁以及附件、输出和关联对象的访问链。

代码事实支持这一判断：

- 当前案件和客户的个人过滤是查询层硬编码，不是可见范围字段；物件查询又是 tenant 级；附件/输出存在不同的个人过滤；PostgreSQL RLS 的 tenant policy 只检查 active tenant membership（`db/migrations/20260727_001_tenant_rls.sql:38-75,95-133`）。
- `can_access_user` 允许同一租户 active/invited 成员读取用户行，但没有判断业务对象的 visibility；RLS 不能替代“对象 owner 或 company-visible”的服务端判定。
- 旧记录没有可见范围字段，默认 private 还是迁移为 company-visible 必须明确产品/迁移规则；不能根据当前列表是否可见推断安全默认。

### 7. 公司表格和蒙板是否有经营主体共享基础

- TASK-038 的新对象（逻辑表格、表格版本、公司蒙板、蒙板版本、匹配、preview confirmation、generated output）均带 tenant 关系；公司表格/蒙板读取与创建函数在 memory/PostgreSQL 适配层按 tenant 过滤，操作者 ID 作为创建/测试/发布 provenance。
- `src/app/guarantee-forms/page.tsx` 已把表格库分为“公司内部”和“平台所有”，管理员才显示编辑入口，普通成员只看已发布版本；编辑页要求模板编辑权限。这是可复用基础，不等于已经过合法双身份运行验证。
- 当前模板权限仍通过旧 role action（例如 `template.edit_draft`），没有产品批准的“可管理公司表单配置”预设；TASK-039 必须在不删除八角色的前提下补上可理解的能力层。
- `/cases/[id]/guarantee-application` 和 `/api/guarantee-g1-slice1` 已存在案件生成/预览骨架，但正式入口与两个合法身份的真实浏览器闭环尚未验证；平台蒙板目录仍按产品裁决保持暂未开放。

### 8. 哪些旧约束会阻碍 TASK-038 的真实管理员/普通成员验证

1. 没有一个可用的真实 non-prod active membership 身份组合；当前 demo `user_demo/user_ops` 不能替代两个 Clerk 身份。
2. 管理权限由旧八角色动作表达，无法直接证明“公司表格管理员”预设已授予/撤销。
3. `case.user_id` 只支持本人案件；这足以做最小闭环，但不能验证跨成员案件协作。
4. 普通成员对案件输出的页面路由存在，但能否从正式案件详情进入并完成案件级历史回读仍是运行未验证项。
5. 共享公司表格与案件私有资料的服务端门禁还没有统一的对象授权函数；尤其是 tenant-only private attachment read 必须由调用方先完成案件/输出权限判断。
6. 旧席位容量检查和成员页的席位文案仍存在，可能阻碍“按经营主体、不按席位收费”的产品行为；本轮不直接删除，需在技术切片中兼容迁移。

## 三、项目经理/Agent 推论（不是现成代码事实）

以下是基于上述事实的建议，不应写成已实现：

- 切片 1 应先建立真实的“当前 Clerk subject → 本地用户 → 经营主体 membership → active workspace”服务端链，并将首位 owner 创建放在一个可回滚的原子操作内；非生产开关只能限制测试，不得制造 membership。
- 邀请接受应以 Clerk invitation/provider 记录或等价一次性 token 为入口，明确校验受邀邮箱、目标 tenant、membership 和接受身份；不能继续用“登录即激活该用户全部 invited memberships”。
- 三类能力应以一个面向用户的 capability preset 表达，再由兼容层映射旧八角色；职务名称只作为展示资料，不作为权限来源。
- 案件、人物、物件应分别增加可见范围契约，读取与更新都通过统一的服务端 authorization resolver；附件和 generated output 必须继承其所属对象/案件权限，而非简单继承上传者。
- 旧数据迁移默认应是安全收窄而非扩大：在产品负责人确认前，不把现有 tenant-wide properties 或 tenant-only detail 读取直接解释为 company-visible。
- TASK-038 的第一条可接受运行门是同一非生产 tenant 的两个真实身份：管理员可上传/编辑/测试/发布，普通成员只能选择已发布蒙板并在本人有权限案件生成；跨成员案件共享继续保持依赖状态。

## 四、非权威表达或算法

- 成员页当前的“席位占用/购买席位”不是目标产品的商业事实，只是旧租户字段和兼容 UI。
- `role` 直接映射几十个权限动作，是实现现状，不等于产品已批准的三类用户能力模型。
- `case.user_id`、`ownerUserId` 是现有个人过滤，不等于长期对象所有权模型。
- tenant-only 的详情、物件和附件服务读取不能单独当作“公司成员可见”；必须有对象级权限合同。
- non-prod platform-owner fallback 产生的临时 membership 不是合法公司成员关系，不得作为 TASK-038 双身份验收证据。

## 五、必须保留的能力

- Clerk subject 与本地用户的稳定唯一绑定。
- 一个用户加入多个经营主体时的 active workspace 选择和租户隔离。
- 租户 `trial/active` 可访问状态与生产商业资格门禁的分离。
- 邀请发送、provider invitation ID/URL、发送失败和审计记录。
- 最后一名公司负责人的保护；成员暂停后立即失去会话访问。
- 既有八角色的兼容读取，直到 capability preset 完成迁移。
- 公司表格/蒙板的 tenant 归属、版本、发布、回退和操作者审计字段。
- TASK-038 本人案件的最小生成路径，以及关闭新流程后旧五套平台蒙板和旧入口不受影响。

## 六、跨经营主体与公司内部泄露风险

### 已从代码层看到的边界

- 大多数新对象和租户表有 `tenantId`，session 和 RLS 也有 active membership/tenant 状态门；这为跨租户隔离提供了基础。
- 业务查询普遍携带 tenant 条件；没有证据表明当前静态代码主动把一个 tenant 的对象 ID 查询到另一个 tenant。

### 仍需作为高风险验证或修正的点

- RLS 的 tenant policy 是租户级，不是对象级；任何未来放宽查询的页面都可能把同租户私有资料一起带出，必须先加 visibility resolver。
- `getClientById/getClientDetail` 的 tenant-only 查询与 `listClients` 的 owner-only 查询不一致，深链接或页面组合可能绕过列表过滤。
- `listQuoteFormData/listHubProperties` 以 tenant 读取物件；当前没有“仅自己/公司成员可见”字段。
- `readPrivateAttachmentContentForTenant` 只校验 tenant；它本身不判断案件访问权。TASK-038 入口必须在调用前完成案件和输出权限检查。
- `ensureUserForExternalAuth` 会激活用户全部 invited memberships；如果同一邮箱/本地用户存在多个租户邀请，可能出现未经明确接受的多租户激活。
- non-prod platform-owner fallback 可把 allowlist 用户映射到默认 tenant 的临时 membership；若误留在受测环境，运行证据会掩盖真实 membership 缺失。

## 七、尚未验证的运行行为

以下均未由本次只读代码核对证明：

- 当前 Clerk Development 身份是否存在 active membership；负责人创建、邀请邮件、接受、暂停、移除和重新登录的真实浏览器行为。
- 一个 Clerk 用户加入多个经营主体时的工作区切换、请求 tenant cookie 和权限拒绝行为。
- Preview/Staging 的订阅/试用/平台批准门禁是否真实阻断正式业务。
- PostgreSQL 实际迁移状态、RLS 运行效果、跨租户负向读取、同租户双身份读取和真实事务行为。
- 同一经营主体两个合法身份下，公司表格库上传/重开/发布、普通成员无编辑入口、案件预览/生成/历史下载和 v1/v2 不变。
- 真实案件详情是否已经把 TASK-038 正式入口接到案件长期资料和案件级保证申请记录。
- 真实附件/输出存储的权限链、停用成员即时失权、对象接管和审计回放。
- 手机/键盘/IME/错误焦点等 UI 行为；本报告没有进行浏览器运行。

## 八、进入下一阶段前需要关闭的问题

产品边界本身本轮没有新增待决；以下是进入可执行切片前必须形成的技术合同，其中涉及产品语义的项目需要产品负责人确认其采用方式：

1. **商业资格来源**：生产中“有效订阅 / 有效试用 / 平台批准状态”的权威字段、默认拒绝状态和非生产 override 边界。
2. **邀请接受来源**：Clerk invitation token/webhook 还是 Broker Desk 一次性接受记录；必须明确如何绑定受邀邮箱、目标 tenant 和接受 subject。
3. **旧对象可见性默认**：已有案件、人物、物件在新增 visibility 字段后的安全默认，是全部 private、按现有 owner 保持 private，还是有证据的 tenant-visible 子集。
4. **移除状态合同**：`suspended` 与 `removed` 是否是两个可查询状态，或 removed 作为成员关系终止事件加历史记录；当前适配器没有 removed。
5. **公司表格管理员授权落点**：capability preset 存在 membership、独立授权表还是兼容字段；必须保证撤销即时生效且至少一名 owner 能接管。
6. **关联读取规则**：案件可见时关联人物、物件、附件和输出是否都维持各自范围；当前产品方向是“不递归公开”，下一切片需把它固化为服务端门禁。
7. **旧席位/订阅迁移**：保留旧 `purchasedSeatCount` 和计费字段的双读、显示隐藏、回滚和正式解除限制的门。

这些不是本报告授权的实现决定；在产品确认后才可写入切片 1/2/3 的批准写集。

## 九、报告边界与停止条件

- 本报告只使用仓库静态代码、migration、现有治理文档和当前工作区差异；没有启动服务、登录、创建数据、发送邀请、应用 migration 或修改业务代码。
- `src/app/clients/page 2.tsx` 未读取、未修改、未提交。
- TASK-039 保持 `In Progress / Checkpoint A`；TASK-038 保持 `In Progress / Limited Implementation`，没有因为本报告而恢复真实产品闭环。
- 产品负责人应先审阅本报告的事实与风险，再决定是否授权切片 1 的写集。未授权前不启动实现 Agent。

## 十、重复流程包装检查

本轮发现的重复工作是“身份—membership—tenant—对象权限静态核对”，但它仍依赖每个切片的具体数据契约和运行证据，当前没有足够稳定的独立输入/输出边界来创建新的 skill、Agent 或 automation。暂不包装，避免与现有任务治理和独立审查流程重复。
