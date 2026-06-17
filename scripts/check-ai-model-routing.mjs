import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(tmpdir(), "broker-desk-ai-runtime-"));

try {
  execFileSync(
    path.resolve("node_modules/.bin/tsc"),
    [
      "--target",
      "es2020",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--esModuleInterop",
      "--skipLibCheck",
      "--strict",
      "--outDir",
      tmp,
      "scripts/ai-runtime-routing.test.ts",
      "src/lib/ai/model-routing.ts",
      "src/lib/ai/responses-client.ts",
    ],
    { stdio: "inherit" }
  );
  execFileSync("node", [path.join(tmp, "scripts/ai-runtime-routing.test.js")], { stdio: "inherit" });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
