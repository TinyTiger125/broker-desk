import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const errors = [];
const allowedStatuses = new Set([
  "Proposed",
  "Ready",
  "In Progress",
  "In Review",
  "Blocked",
  "Done",
]);
const taskIdPattern = /TASK-\d{3}[A-Z]?/g;
const cursorEntryPath = ".cursor/rules/00-governance-entry.mdc";
const cursorLegacyRulePaths = [
  ".cursor/rules/00-product-positioning.mdc",
  ".cursor/rules/01-scope-boundaries.mdc",
  ".cursor/rules/02-domain-model.mdc",
  ".cursor/rules/03-import-center.mdc",
  ".cursor/rules/04-output-center.mdc",
  ".cursor/rules/07-coding-workflow.mdc",
  ".cursor/rules/08-ui-ux-constraints.mdc",
];
const cursorSkillRoutes = new Map([
  [".cursor/skills/feature-planner/SKILL.md", "docs/agents/TECHNICAL_PM.md"],
  [".cursor/skills/import-mapper/SKILL.md", "docs/agents/IMPLEMENTATION_AGENT.md"],
  [".cursor/skills/domain-model-guardian/SKILL.md", "docs/agents/TECHNICAL_PM.md"],
  [".cursor/skills/output-template-builder/SKILL.md", "docs/agents/IMPLEMENTATION_AGENT.md"],
  [".cursor/skills/migration-safe-refactor/SKILL.md", "docs/agents/IMPLEMENTATION_AGENT.md"],
  [".cursor/skills/service-request-traceability/SKILL.md", "docs/agents/IMPLEMENTATION_AGENT.md"],
]);
const cursorEntryRoutes = [
  "AGENTS.md",
  "docs/operations/CURRENT_WORKING_CONTEXT.md",
  "docs/tasks/TASK-017.md",
  "docs/agents/TECHNICAL_PM.md",
  "docs/agents/IMPLEMENTATION_AGENT.md",
  "docs/agents/INDEPENDENT_REVIEW_AGENT.md",
];

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function exists(relativePath) {
  try {
    await read(relativePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name.startsWith(".next")
    ) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
    } else {
      files.push(absolutePath);
    }
  }

  return files;
}

function requireText(relativePath, contents, text) {
  if (!contents.includes(text)) {
    errors.push(relativePath + ': missing "' + text + '"');
  }
}

function relative(absolutePath) {
  return path.relative(root, absolutePath);
}

async function main() {
  const requiredPaths = [
    "AGENTS.md",
    "PRODUCT.md",
    "ARCHITECTURE.md",
    "BACKLOG.md",
    "DESIGN.md",
    "docs/README.md",
    "docs/operations/CURRENT_WORKING_CONTEXT.md",
  ];
  const contents = new Map();

  for (const relativePath of requiredPaths) {
    if (!(await exists(relativePath))) {
      errors.push("missing required governance file: " + relativePath);
      continue;
    }
    contents.set(relativePath, await read(relativePath));
  }

  const requiredText = {
    "AGENTS.md": [
      "BACKLOG.md` and the assigned task card define the current task scope,",
      "docs/operations/CURRENT_WORKING_CONTEXT.md` is the only active handoff and",
      "A governance-only task may change governance documents and the direct",
      "Do not mark a task `Done` or `Ready` while required evidence is missing.",
    ],
    "PRODUCT.md": [
      "## Product",
      "## Target user",
      "## Core user result",
      "## Product boundaries",
    ],
    "ARCHITECTURE.md": [
      "## Runtime",
      "## Data and persistence",
      "## Verification entry points",
      "WIP snapshot",
    ],
    "BACKLOG.md": [
      "BACKLOG.md and the linked local task cards are authoritative",
      "TASK-002",
      "TASK-006A",
      "TASK-002 remains In Review",
      "TASK-006A is the only narrowed candidate business trial",
    ],
    "docs/README.md": [
      "本文件只说明文档类别和读取路径，不复制其他文档正文。",
      "operations/CURRENT_WORKING_CONTEXT.md`：唯一活动交接和进度入口。",
      "tasks/`：任务卡；只读取当前任务卡，不默认读取全部任务卡。",
    ],
    "docs/operations/CURRENT_WORKING_CONTEXT.md": [
      "## 当前任务",
      "正式仓库：",
      "Branch:",
    ],
  };

  for (const [relativePath, needles] of Object.entries(requiredText)) {
    const fileContents = contents.get(relativePath);
    if (!fileContents) continue;
    for (const needle of needles) {
      requireText(relativePath, fileContents, needle);
    }
  }

  const packageJson = JSON.parse(await read("package.json"));
  if (packageJson.scripts?.["test:workflow-rules"] !== "node scripts/check-workflow-rules.mjs") {
    errors.push("package.json: test:workflow-rules script is missing or incorrect");
  }

  const allFiles = await walk(root);
  const uniqueAuthorityNames = [
    ["AGENTS.md", "AGENTS.md"],
    ["PRODUCT.md", "PRODUCT.md"],
    ["ARCHITECTURE.md", "ARCHITECTURE.md"],
    ["BACKLOG.md", "BACKLOG.md"],
    ["DESIGN.md", "DESIGN.md"],
    ["CURRENT_WORKING_CONTEXT.md", "docs/operations/CURRENT_WORKING_CONTEXT.md"],
  ];
  for (const [fileName, expectedPath] of uniqueAuthorityNames) {
    const matches = allFiles.filter((file) => path.basename(file) === fileName);
    const expectedAbsolute = path.join(root, expectedPath);
    if (matches.length !== 1 || matches[0] !== expectedAbsolute) {
      errors.push(
        fileName + ": required authority file must have exactly one active path; found " +
          matches.map(relative).join(", "),
      );
    }
  }

  const taskDirectory = path.join(root, "docs", "tasks");
  const taskEntries = await readdir(taskDirectory, { withFileTypes: true });
  const taskFiles = taskEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const taskFilePattern = /^TASK-\d{3}[A-Z]?\.md$/;
  const requiredTaskHeadings = [
    "## 任务名称",
    "## 背景和用户结果",
    "## 本次范围",
    "## 明确不做什么",
    "## 依赖关系",
    "## 验收标准",
    "## 预计涉及的模块",
    "## 风险和注意事项",
    "## 验证命令",
    "## 当前状态",
  ];
  const cardStatuses = new Map();

  if (taskFiles.length === 0) {
    errors.push("docs/tasks: at least one task card is required");
  }

  for (const taskFile of taskFiles) {
    if (!taskFilePattern.test(taskFile)) {
      errors.push("docs/tasks/" + taskFile + ": filename must match TASK-### or TASK-###A.md");
      continue;
    }

    const taskId = taskFile.slice(0, -3);
    const taskContents = await read("docs/tasks/" + taskFile);
    for (const heading of requiredTaskHeadings) {
      if (!taskContents.includes(heading)) {
        errors.push("docs/tasks/" + taskFile + ': missing "' + heading + '"');
      }
    }

    const statusMatches = [...taskContents.matchAll(/^- 状态: (.+)$/gm)];
    if (statusMatches.length !== 1) {
      errors.push("docs/tasks/" + taskFile + ": must contain exactly one status line");
      continue;
    }

    const status = statusMatches[0][1].trim();
    if (!allowedStatuses.has(status)) {
      errors.push(
        "docs/tasks/" + taskFile + ": status must be one of " +
          [...allowedStatuses].join(", "),
      );
    }
    cardStatuses.set(taskId, status);
  }

  const backlog = await read("BACKLOG.md");
  const backlogStatuses = new Map();
  for (const line of backlog.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*(TASK-\d{3}[A-Z]?)\s*\|[^|]*\|[^|]*\|\s*(Proposed|Ready|In Progress|In Review|Blocked|Done)\s*\|/,
    );
    if (match) backlogStatuses.set(match[1], match[2]);
  }

  for (const [taskId, status] of cardStatuses) {
    if (!backlogStatuses.has(taskId)) {
      errors.push("BACKLOG.md: missing status row for " + taskId);
    } else if (backlogStatuses.get(taskId) !== status) {
      errors.push(
        taskId + ": BACKLOG status " + backlogStatuses.get(taskId) +
          " does not match card status " + status,
      );
    }
  }
  for (const taskId of backlogStatuses.keys()) {
    if (!cardStatuses.has(taskId)) {
      errors.push("BACKLOG.md: status row has no task card for " + taskId);
    }
  }

  const contextPath = "docs/operations/CURRENT_WORKING_CONTEXT.md";
  const context = contents.get(contextPath) ?? "";
  const contextTaskIds = [...new Set(context.match(taskIdPattern) ?? [])];
  for (const taskId of contextTaskIds) {
    if (!cardStatuses.has(taskId)) {
      errors.push(contextPath + ": references missing task card " + taskId);
    }
  }

  for (const line of context.split(/\r?\n/)) {
    const ids = line.match(taskIdPattern) ?? [];
    if (
      ids.some((taskId) => cardStatuses.get(taskId) === "Proposed") &&
      /(正在实施|实施中|implementing|in progress)/i.test(line)
    ) {
      errors.push(contextPath + ": describes a Proposed task as being implemented: " + line);
    }
  }

  if (cardStatuses.get("TASK-002") !== "In Review") {
    errors.push("TASK-002 must remain In Review");
  }
  for (const taskId of ["TASK-003", "TASK-006A"]) {
    if (cardStatuses.get(taskId) === "Ready") {
      errors.push(taskId + " must not be Ready in this baseline");
    }
  }

  const legacyFiles = [
    "docs/agents/issue-tracker.md",
    "CLAUDE.md",
    "CLAUDE 3.md",
    "docs/operations/PM_CONTROL.md",
    "docs/operations/DEVELOPMENT_HANDOFF_2026_06_27.md",
    "docs/operations/DEVELOPMENT_HANDOFF_2026_07_01.md",
    "docs/operations/DEVELOPMENT_HANDOFF_2026_07_12.md",
    "docs/operations/DEVELOPMENT_HANDOFF_2026_08_01_CONVERSATION_COMPACT.md",
  ];
  for (const relativePath of legacyFiles) {
    if (!(await exists(relativePath))) {
      errors.push("missing retained legacy file: " + relativePath);
      continue;
    }
    const legacyContents = await read(relativePath);
    if (!/(Historical|historical|历史)/.test(legacyContents)) {
      errors.push(relativePath + ": missing historical downgrade declaration");
    }
  }

  const projectMemoryPath = "docs/PROJECT_MEMORY.md";
  const projectMemory = await read(projectMemoryPath);
  for (const needle of [
    "Historical compatibility pointer",
    "non-authoritative",
    "docs/archive/legacy-project-memory/PROJECT_MEMORY_2026_08_06.md",
  ]) {
    requireText(projectMemoryPath, projectMemory, needle);
  }
  for (const phrase of ["current source of truth", "fixed project-memory entrypoint"]) {
    if (projectMemory.includes(phrase)) {
      errors.push(projectMemoryPath + ": stale authority claim remains: " + phrase);
    }
  }

  const archivedProjectMemoryPath =
    "docs/archive/legacy-project-memory/PROJECT_MEMORY_2026_08_06.md";
  if (!(await exists(archivedProjectMemoryPath))) {
    errors.push("missing retained legacy file: " + archivedProjectMemoryPath);
  } else {
    const archivedProjectMemory = await read(archivedProjectMemoryPath);
    if (!/(Historical|historical|历史)/.test(archivedProjectMemory)) {
      errors.push(archivedProjectMemoryPath + ": missing historical downgrade declaration");
    }
    if (
      !archivedProjectMemory.includes(
        "仅历史证据，不是当前任务、产品、架构或执行授权。",
      )
    ) {
      errors.push(archivedProjectMemoryPath + ": missing explicit non-authority declaration");
    }
  }

  const bannedLegacyClaims = [
    ["docs/agents/issue-tracker.md", "live in GitHub Issues"],
    ["docs/operations/PM_CONTROL.md", "This document is the operating source of truth"],
    ["docs/operations/DEVELOPMENT_HANDOFF_2026_08_01_CONVERSATION_COMPACT.md", "请先阅读本文件，并把它作为当前上下文"],
  ];
  for (const [relativePath, phrase] of bannedLegacyClaims) {
    const legacyContents = await read(relativePath);
    if (legacyContents.includes(phrase)) {
      errors.push(relativePath + ": stale authority claim remains: " + phrase);
    }
  }

  const design = contents.get("DESIGN.md") ?? "";
  if (!design.includes("not the product, architecture, task, or progress authority")) {
    errors.push("DESIGN.md: missing non-authority declaration");
  }

  const cursorDirectory = path.join(root, ".cursor");
  let cursorDirectoryExists = true;
  try {
    await readdir(cursorDirectory);
  } catch {
    cursorDirectoryExists = false;
  }
  if (!cursorDirectoryExists) {
    errors.push(".cursor: directory is missing");
  } else {
    const cursorRelativeFiles = allFiles
      .map(relative)
      .filter((file) => file.startsWith(".cursor/"));
    const cursorContents = new Map();
    for (const relativePath of cursorRelativeFiles) {
      cursorContents.set(relativePath, await read(relativePath));
    }

    if (!(await exists(cursorEntryPath))) {
      errors.push(".cursor: missing unique governance entry " + cursorEntryPath);
    } else {
      const entry = cursorContents.get(cursorEntryPath) ?? (await read(cursorEntryPath));
      if (!/^---\s*\n[\s\S]*^description:\s*.+$/m.test(entry)) {
        errors.push(cursorEntryPath + ': missing Cursor "description" frontmatter');
      }
      if (!/^---\s*\n[\s\S]*^alwaysApply:\s*true\s*$/m.test(entry)) {
        errors.push(cursorEntryPath + ': missing Cursor "alwaysApply: true" frontmatter');
      }
      for (const route of cursorEntryRoutes) {
        requireText(cursorEntryPath, entry, route);
      }
    }

    const ruleDirectory = path.join(cursorDirectory, "rules");
    const ruleEntries = await readdir(ruleDirectory, { withFileTypes: true });
    const activeRuleFiles = ruleEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".mdc"))
      .map((entry) => ".cursor/rules/" + entry.name)
      .sort();
    if (activeRuleFiles.length !== 1 || activeRuleFiles[0] !== cursorEntryPath) {
      errors.push(
        ".cursor/rules: expected only " + cursorEntryPath + "; found " + activeRuleFiles.join(", "),
      );
    }

    for (const legacyPath of cursorLegacyRulePaths) {
      if (await exists(legacyPath)) {
        errors.push(".cursor: legacy rule still exists " + legacyPath);
      }
    }

    const forbiddenCursorClaims = [
      [/CLAUDE(?:\.md)?/i, "CLAUDE authority declaration"],
      [/\bwins\b/i, "wins declaration"],
      [/active[\s_-]*sprint/i, "active-sprint guidance"],
    ];
    for (const [relativePath, fileContents] of cursorContents) {
      for (const [pattern, label] of forbiddenCursorClaims) {
        if (pattern.test(fileContents)) {
          errors.push(relativePath + ": stale " + label + " remains");
        }
      }
      for (const legacyPath of cursorLegacyRulePaths) {
        if (fileContents.includes(legacyPath)) {
          errors.push(relativePath + ": stale rule reference remains: " + legacyPath);
        }
      }
    }

    for (const [skillPath, playbookPath] of cursorSkillRoutes) {
      const skillContents = cursorContents.get(skillPath);
      if (!skillContents) {
        errors.push(".cursor: missing high-risk skill " + skillPath);
        continue;
      }
      for (const route of [cursorEntryPath, "docs/operations/CURRENT_WORKING_CONTEXT.md", "docs/tasks/TASK-017.md", playbookPath]) {
        requireText(skillPath, skillContents, route);
      }
    }
  }

  if (errors.length > 0) {
    console.error("workflow rules check: FAIL");
    for (const error of errors) console.error("- " + error);
    process.exitCode = 1;
    return;
  }

  console.log("workflow rules check: PASS");
  console.log("Checked governance authority paths, task/card status parity, context references, legacy downgrade declarations, and Cursor routing boundaries");
}

main().catch((error) => {
  console.error("workflow rules check: ERROR");
  console.error(error);
  process.exitCode = 1;
});
