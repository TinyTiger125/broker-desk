import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const errors = [];

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function requireText(relativePath, contents, text) {
  if (!contents.includes(text)) {
    errors.push(`${relativePath}: missing "${text}"`);
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if ([".git", ".next", "node_modules"].includes(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
    } else {
      files.push(absolutePath);
    }
  }

  return files;
}

async function main() {
  const paths = [
    "AGENTS.md",
    "CLAUDE.md",
    "docs/README.md",
    "docs/PROJECT_MEMORY.md",
    "docs/operations/CURRENT_WORKING_CONTEXT.md",
    "package.json",
  ];
  const contents = new Map();

  for (const relativePath of paths) {
    contents.set(relativePath, await read(relativePath));
  }

  const requiredText = {
    "AGENTS.md": [
      "One task changes exactly one defect or one page.",
      "When verification passes, immediately commit only the current task's scoped diff.",
      "Start the next item as a new task after committing the current task.",
      "Only authoritative active-progress file:",
      "Never put attempts, failures, transient debugging output, or per-task progress",
      "two consecutive turns contain only analysis/read output and no diff or test output",
    ],
    "CLAUDE.md": [
      "Current active-work entrypoint: `docs/operations/CURRENT_WORKING_CONTEXT.md`.",
      "Repository execution rules: `AGENTS.md`.",
      "一条任务只解决一个缺陷或一个页面",
      "验证通过后立即提交当前任务的 Git diff",
      "下一项工作必须开新任务",
      "当前进度唯一权威文件是 `docs/operations/CURRENT_WORKING_CONTEXT.md`",
      "连续两轮只有分析/读取、没有 diff 或测试输出时，立即终止当前任务并重开任务",
    ],
    "docs/README.md": [
      "`docs/operations/CURRENT_WORKING_CONTEXT.md` is the only authoritative active-progress file.",
      "never create a second active-progress file.",
    ],
    "docs/PROJECT_MEMORY.md": [
      "This file contains stable project facts",
      "It is not the active task log.",
      "Do not record secrets, API keys, private customer identifiers, one-off terminal noise, attempt logs, failure histories, transient debugging output, or per-task progress.",
      "task-by-task progress or next-step queues",
    ],
    "docs/operations/CURRENT_WORKING_CONTEXT.md": [
      "## Mandatory Task Protocol",
      "One task changes exactly one defect or one page.",
      "commit the scoped diff immediately",
      "This file is the only authoritative active-progress file.",
      "If two consecutive turns contain only analysis/read output and no diff or test output",
    ],
  };

  for (const [relativePath, needles] of Object.entries(requiredText)) {
    const fileContents = contents.get(relativePath);
    for (const needle of needles) {
      requireText(relativePath, fileContents, needle);
    }
  }

  const packageJson = JSON.parse(contents.get("package.json"));
  if (packageJson.scripts?.["test:workflow-rules"] !== "node scripts/check-workflow-rules.mjs") {
    errors.push("package.json: test:workflow-rules script is missing or incorrect");
  }

  const docsRoot = path.join(root, "docs");
  const progressFiles = (await walk(docsRoot)).filter(
    (absolutePath) => path.basename(absolutePath) === "CURRENT_WORKING_CONTEXT.md",
  );
  const expectedProgressFile = path.join(docsRoot, "operations", "CURRENT_WORKING_CONTEXT.md");
  if (progressFiles.length !== 1 || progressFiles[0] !== expectedProgressFile) {
    errors.push("docs: CURRENT_WORKING_CONTEXT.md must exist only at docs/operations/CURRENT_WORKING_CONTEXT.md");
  }

  if (errors.length > 0) {
    console.error("workflow rules check: FAIL");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("workflow rules check: PASS");
  console.log(`Checked: ${paths.join(", ")}`);
}

main().catch((error) => {
  console.error("workflow rules check: ERROR");
  console.error(error);
  process.exitCode = 1;
});
