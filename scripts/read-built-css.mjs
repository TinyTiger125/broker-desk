import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Read the actual CSS emitted by either supported Next.js production bundler. */
export function readBuiltCss(root) {
  const directories = [".next/static/css", ".next/static/chunks"]
    .map((relativePath) => path.join(root, relativePath))
    .filter(existsSync);
  const files = directories.flatMap((directory) => readdirSync(directory)
    .filter((name) => name.endsWith(".css"))
    .map((name) => path.join(directory, name)));
  assert.ok(files.length > 0, "production build must emit CSS assets");
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}
