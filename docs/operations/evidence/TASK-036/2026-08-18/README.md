# TASK-036 运行证据索引

- 原始截图目录：`/private/tmp/task036-layout-evidence-20260818`
- 归档范围：57 个脱敏截图；文件名后缀为 `.png`，实际内容为 JPEG，这是采集工具的输出事实，不影响视口记录。
- 原始文件不进入仓库；本索引只保留可复核的聚合哈希和脱敏路径。
- 复核命令：`find /private/tmp/task036-layout-evidence-20260818 -maxdepth 1 -type f -print0 | xargs -0 shasum -a 256 | LC_ALL=C sort | shasum -a 256`
- 当前聚合 SHA-256：`a46731f984b49a855a8c42740032fb427478972d97fc005695bad6ac94b9664c`
- 证据身份：既有 Clerk Development 会话；未记录个人敏感信息。
