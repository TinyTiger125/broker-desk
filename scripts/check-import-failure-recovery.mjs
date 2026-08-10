#!/usr/bin/env node
import fs from "node:fs";

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing required file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const identityRoute = read("src/app/api/input-files/identity/route.ts");
const excelRoute = read("src/app/api/input-files/upload/route.ts");
const processRoute = read("src/app/api/input-files/[jobId]/process/route.ts");
const processor = read("src/components/excel-import-queue-processor.tsx");
const notFound = read("src/app/not-found.tsx");

for (const [name, source, unavailableCode] of [
  ["identity route", identityRoute, "identity_import_unavailable"],
  ["excel route", excelRoute, "excel_import_unavailable"],
  ["import status route", processRoute, "import_status_unavailable"],
  ["import process route", processRoute, "import_processing_unavailable"],
]) {
  assert(source.includes(unavailableCode), `${name} must return the product-safe ${unavailableCode} code`);
  assert(source.includes("requestId"), `${name} must return an opaque request id for support`);
}

assert(!identityRoute.includes("throw error"), "identity route must not expose unexpected errors to the Next error page");
assert(!excelRoute.includes("throw error"), "excel route must not expose unexpected errors to the Next error page");
assert(!processRoute.includes("throw error"), "import process route must not expose unexpected errors to the Next error page");
assert(processor.includes("role=\"alert\""), "failed import UI must announce an accessible failure state");
assert(processor.includes("requestId"), "failed import UI must display the opaque request id when available");
assert(processor.includes("setStatus(\"submitting\")"), "failed import UI must provide a retry transition");
assert(notFound.includes("返回工作台"), "missing pages must provide a product recovery route");

console.log("[PASS] import failures stay in product recovery states with retry and request references");
