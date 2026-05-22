import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sampleDir = join(root, "tmp/qa_stress_samples");
const manifest = JSON.parse(readFileSync(join(sampleDir, "manifest.json"), "utf8"));
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3002";

async function upload(path) {
  const bytes = readFileSync(path);
  const form = new FormData();
  form.append(
    "excelFile",
    new File([bytes], basename(path), {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
  const response = await fetch(`${baseUrl}/api/input-files/upload`, {
    method: "POST",
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    ok: response.ok,
    ...body,
  };
}

const resetResponse = await fetch(`${baseUrl}/api/qa/reset-business-data`, { method: "POST" });
const resetBody = await resetResponse.json().catch(() => ({}));

const results = [];
for (const sample of manifest) {
  const important = await upload(sample.importantPath);
  const contract = await upload(sample.contractPath);
  results.push({
    id: sample.id,
    variant: sample.variant,
    importantPath: sample.importantPath,
    contractPath: sample.contractPath,
    expected: {
      importantRecognized: !sample.breakFingerprint,
      contractRecognized: !sample.breakFingerprint,
      shouldMerge: sample.variant === "merge_candidate" || sample.variant === "duplicate_upload",
      shouldNotMerge: sample.variant === "should_not_merge",
    },
    important,
    contract,
  });
}

const summary = {
  baseUrl,
  reset: { status: resetResponse.status, ok: resetResponse.ok, body: resetBody },
  groups: manifest.length,
  files: manifest.length * 2,
  recognizedFiles: results.flatMap((item) => [item.important, item.contract]).filter((item) => item.extractionStatus === "recognized").length,
  unknownFiles: results.flatMap((item) => [item.important, item.contract]).filter((item) => item.extractionStatus !== "recognized").length,
  failedRequests: results.flatMap((item) => [item.important, item.contract]).filter((item) => !item.ok).length,
  byVariant: Object.fromEntries(
    [...new Set(results.map((item) => item.variant))].map((variant) => {
      const subset = results.filter((item) => item.variant === variant);
      const files = subset.flatMap((item) => [item.important, item.contract]);
      return [
        variant,
        {
          groups: subset.length,
          files: files.length,
          recognized: files.filter((item) => item.extractionStatus === "recognized").length,
          unknown: files.filter((item) => item.extractionStatus !== "recognized").length,
          failedRequests: files.filter((item) => !item.ok).length,
        },
      ];
    })
  ),
};

const outputPath = join(sampleDir, "upload-smoke-results.json");
writeFileSync(outputPath, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify({ outputPath, summary }, null, 2));
