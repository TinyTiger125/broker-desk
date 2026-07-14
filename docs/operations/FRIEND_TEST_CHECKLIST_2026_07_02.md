# Friend Test Checklist 2026-07-02

Purpose: collect real broker workflow feedback for the V1 chain:

```text
建档导入 -> 整理信息 -> 输出文件
```

This checklist is for external friend testing. It should test whether Broker Desk is understandable and useful without product explanation.

## Message To Tester

请按你平时处理一个真实租赁 / 保证公司申请案件的方式测试，不需要按“正确答案”操作。

重点帮我看三件事：

1. 你是否知道从哪里开始。
2. 你是否能把资料整理到一个案件里。
3. 你是否觉得自动生成申请书真的比 Excel / PDF 手填省事。

测试时如果哪里看不懂、找不到、误点、觉得多余，请直接截图或记一句话。比起“功能能不能点”，我更想知道你真实工作时会不会愿意继续用。

## Test Tasks For Friend

### 1. First Impression

- 打开首页后，停留 10 秒。
- 不看说明、不问开发者，判断这个系统主要是做什么的。
- 记录第一眼最想点哪里。
- 记录有没有看起来像内部系统、看不懂、或不该给客户看的文字。

Pass signal:

- Tester can understand this is for managing real-estate documents/cases and producing documents.
- Tester can identify one obvious starting action.

Fail signal:

- Tester thinks it is a dashboard only, CRM only, upload tool only, or PDF tool only.
- Tester cannot decide where to start.

### 2. Create A New Work Object

- 从空白状态开始，尝试创建一个新案件。
- 不上传资料也要试一次：看能不能先建立案件，再慢慢补资料。
- 如果手头只有一个客户资料或一个物件资料，也试试看系统是否允许先建主体或物件。

Pass signal:

- New case / subject / property paths feel natural.
- Tester understands the difference between case, person/company, property, and pending material.

Fail signal:

- Tester feels they must upload Excel/photo before creating anything.
- Tester cannot tell which object should be created.
- Tester creates wrong object because labels are unclear.

### 3. Upload / Import Material

- 上传一份申请资料 Excel。
- 上传一张或多张本人证件 / 图片资料。
- 如果方便，试一次同一批资料属于同一个客户；再思考如果混入不同客户资料时系统是否会让人困惑。

Pass signal:

- Tester understands uploaded material must belong to a case, person/company, property, or pending area.
- The upload flow does not silently mix unrelated people/properties/cases.

Fail signal:

- Tester is not sure资料会被写到哪里。
- Tester feels multiple files can easily混入错误案件。
- Upload failure gives only technical error or blank page.

### 4. Organize Information

- 进入整理信息页面。
- 找到刚才创建或导入的案件。
- 补一个缺失字段，保存。
- 再补一个字段，并确认保存后它是否移动到合理的位置。
- 尝试用左侧分类找到人员、物件、合同条件、本人资料等信息。

Pass signal:

- Missing items stay easy to find.
- Saved/confirmed items stop blocking attention.
- Field cards feel comfortable to edit.
- The page feels like a better structured Excel, not a database table.

Fail signal:

- Tester has to hunt for red labels.
- Saved fields remain mixed with unfinished fields.
- Cards feel cramped or too technical.
- Page looks like it exists only for guarantee application output.

### 5. Output A Guarantee Application

- 从输出文件进入保证公司申请书流程。
- 选择一个案件。
- 选择一个保证公司模板。
- 预览申请书。
- 检查自动填入的位置、字号、内容是否可接受。
- 尝试下载或生成 PDF。

Pass signal:

- Tester understands output must start from a case.
- Missing required items are shown in the output flow.
- Filled PDF feels close enough to real use and saves typing time.

Fail signal:

- Tester does not know which case/template is selected.
- Missing items send tester to confusing locations.
- Generated form is visually unreliable or requires too much manual repair.

### 6. Real Work Judgment

Ask the tester to answer:

1. 如果今天真实做一个保证公司申请，你会不会愿意用这个系统？
2. 哪一步最省时间？
3. 哪一步最烦？
4. 哪个页面最看不懂？
5. 如果只能修 3 个问题，你希望先修什么？
6. 你现在还会继续用 Excel / 手填 PDF 的原因是什么？

## Internal Observation Notes

During testing, record:

- first confusion point
- first successful "aha" moment
- every technical crash or blank page
- every label that sounds like internal product language
- every place where tester asks "what does this mean?"
- every place where tester says "I would rather use Excel"
- whether tester naturally follows `建档导入 -> 整理信息 -> 输出文件`
- whether tester understands object ownership before upload
- whether tester trusts AI/extracted candidates
- whether generated PDFs are good enough to send/print

## Issue Severity

### P0: Blocks Friend Test

- app crash
- white screen
- upload cannot proceed
- save loses data
- output PDF cannot generate
- navigation trap with no recovery

### P1: Blocks Real Broker Adoption

- user cannot identify where to start
- case/person/property/material concepts are unclear
- upload ownership is ambiguous
-整理信息 feels worse than Excel
- output flow cannot be completed without explanation
- broker-facing UI exposes internal schema, keys, mapping, or template-factory language

### P2: Slows Workflow

- too many clicks
- awkward wording
- cramped card layout
- weak sort order
- unnecessary panels
- unclear success state after save

### P3: Polish

- spacing
- color
- small visual inconsistencies
- secondary copy improvements

## Acceptance Target For This Test Round

This test round does not need perfect production quality.

It is acceptable if:

- tester can create or choose a work object
- tester can import or add material
- tester can find and correct missing information
- tester can generate at least one usable guarantee application PDF
- tester can explain in their own words why the system saves time

It is not acceptable if:

- tester needs continuous explanation to move between pages
- tester cannot distinguish case, subject, property, and uploaded material
- output is the only understandable part of the product
-整理信息 feels like an internal database/admin page
- app state disappears or crashes during ordinary operations
