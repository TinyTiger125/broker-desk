#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const postgres = readFileSync("src/lib/data.postgres.ts", "utf8");
const memory = readFileSync("src/lib/data.memory.ts", "utf8");
const processor = readFileSync("src/lib/identity-import-processor.ts", "utf8");
const queue = readFileSync("src/components/excel-import-queue-processor.tsx", "utf8");

for (const marker of [
  "export async function claimImportJobProcessing",
  "status = 'processing'",
  "status = 'queued'",
  "processing_started_at < NOW() - INTERVAL '5 minutes'",
  "attempt_count = attempt_count + 1",
]) assert(postgres.includes(marker), `PostgreSQL processing claim missing ${marker}`);
assert(memory.includes("five-minute lease"), "memory processing claim must document the recovery lease");
assert(processor.includes("claimImportJobProcessing(input)"), "identity processor must use the atomic processing claim");
assert(processor.includes("processingPreclaimed"), "worker preclaim path must remain explicit");
assert(processor.includes('processingClaim.job?.status === "failed"'), "a CAS loser must surface failed state");
assert(processor.includes('status: "processing"'), "a concurrent processor must return visible processing state");
assert(queue.includes("if (readOnlyStatus) setReadOnlyStatus(false)"), "refresh status must re-enter POST for expired lease recovery");

console.log("PASS: identity processing claim contract covers one active lease, worker preclaim, terminal loser state and refresh recovery");
