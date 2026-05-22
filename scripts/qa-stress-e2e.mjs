import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sampleDir = join(root, "tmp/qa_stress_samples");
const artifactDir = join(root, "tmp/qa_stress_artifacts");
mkdirSync(artifactDir, { recursive: true });

const manifest = JSON.parse(readFileSync(join(sampleDir, "manifest.json"), "utf8"));
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3002";

async function readJson(response) {
  const body = await response.text();
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return { rawBody: body };
  }
}

async function upload(path) {
  const bytes = readFileSync(path);
  const form = new FormData();
  form.append(
    "excelFile",
    new File([bytes], basename(path), {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const response = await fetch(`${baseUrl}/api/input-files/upload`, {
    method: "POST",
    body: form,
  });
  const body = await readJson(response);
  return {
    status: response.status,
    ok: response.ok,
    ...body,
  };
}

async function accept(jobId, options = {}) {
  const response = await fetch(`${baseUrl}/api/qa/extraction-review/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId, ...options }),
  });
  const body = await readJson(response);
  return {
    status: response.status,
    ok: response.ok,
    ...body,
  };
}

async function completeFriendsGuarantee(caseId) {
  const response = await fetch(`${baseUrl}/api/qa/friends-guarantee/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ caseId }),
  });
  const body = await readJson(response);
  return {
    status: response.status,
    ok: response.ok,
    ...body,
  };
}

async function downloadPdf(caseId, outputPath) {
  const response = await fetch(
    `${baseUrl}/api/guarantee-applications/friends-guarantee/download?caseId=${encodeURIComponent(caseId)}`,
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.ok) writeFileSync(outputPath, bytes);
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    contentDisposition: response.headers.get("content-disposition"),
    byteLength: bytes.byteLength,
    outputPath: response.ok ? outputPath : undefined,
  };
}

const resetResponse = await fetch(`${baseUrl}/api/qa/reset-business-data`, { method: "POST" });
const resetBody = await readJson(resetResponse);
const mergeExpectedVariants = new Set(["merge_candidate", "duplicate_upload", "long_text", "short_text"]);
const rejectMergeExpectedVariants = new Set(["should_not_merge", "low_quality"]);

const results = [];
for (const sample of manifest) {
  const important = await upload(sample.importantPath);
  const contract = await upload(sample.contractPath);
  const importantAccept =
    important.extractionStatus === "recognized" && important.jobId ? await accept(important.jobId) : null;

  const shouldAttemptMerge = Boolean(
    importantAccept?.ok && contract.extractionStatus === "recognized" && contract.jobId,
  );
  const contractMergeAttempt = shouldAttemptMerge
    ? await accept(contract.jobId, {
        mergeTargetCaseId: importantAccept.caseId,
        mergeConfirm: true,
      })
    : null;
  const contractAcceptAsNew =
    contractMergeAttempt?.error === "merge_confidence_too_low" && contract.jobId ? await accept(contract.jobId) : null;

  const expected = {
    recognized: sample.variant !== "fingerprint_changed",
    shouldMergeWithinPair: mergeExpectedVariants.has(sample.variant),
    shouldRejectMergeWithinPair: rejectMergeExpectedVariants.has(sample.variant),
    shouldExposeDuplicateCandidate: sample.variant === "duplicate_upload",
  };
  const actual = {
    bothRecognized: important.extractionStatus === "recognized" && contract.extractionStatus === "recognized",
    pairMerged: contractMergeAttempt?.ok && contractMergeAttempt.mode === "merged",
    pairMergeRejected: contractMergeAttempt?.error === "merge_confidence_too_low",
    duplicateCandidateCount: importantAccept?.preSaveCandidates?.length ?? 0,
  };
  const pass =
    (expected.recognized ? actual.bothRecognized : !actual.bothRecognized) &&
    (expected.shouldMergeWithinPair ? actual.pairMerged : true) &&
    (expected.shouldRejectMergeWithinPair ? actual.pairMergeRejected : true) &&
    (expected.shouldExposeDuplicateCandidate ? actual.duplicateCandidateCount > 0 : true);

  results.push({
    id: sample.id,
    variant: sample.variant,
    expected,
    actual,
    pass,
    important,
    contract,
    importantAccept,
    contractMergeAttempt,
    contractAcceptAsNew,
  });
}

const firstMerged = results.find((item) => item.actual.pairMerged);
const completion = firstMerged?.importantAccept?.caseId
  ? await completeFriendsGuarantee(firstMerged.importantAccept.caseId)
  : null;
const download = completion?.ok
  ? await downloadPdf(
      completion.caseId,
      join(artifactDir, `friends-guarantee-${completion.caseId}.pdf`),
    )
  : null;

const variants = [...new Set(results.map((item) => item.variant))];
const summary = {
  baseUrl,
  reset: { status: resetResponse.status, ok: resetResponse.ok, body: resetBody },
  groups: results.length,
  files: results.length * 2,
  passedGroups: results.filter((item) => item.pass).length,
  failedGroups: results.filter((item) => !item.pass).length,
  recognizedFiles: results.flatMap((item) => [item.important, item.contract]).filter((item) => item.extractionStatus === "recognized").length,
  unknownFiles: results.flatMap((item) => [item.important, item.contract]).filter((item) => item.extractionStatus !== "recognized").length,
  pairMergedGroups: results.filter((item) => item.actual.pairMerged).length,
  pairMergeRejectedGroups: results.filter((item) => item.actual.pairMergeRejected).length,
  duplicateCandidateGroups: results.filter((item) => item.actual.duplicateCandidateCount > 0).length,
  completion,
  download,
  byVariant: Object.fromEntries(
    variants.map((variant) => {
      const subset = results.filter((item) => item.variant === variant);
      return [
        variant,
        {
          groups: subset.length,
          passed: subset.filter((item) => item.pass).length,
          failed: subset.filter((item) => !item.pass).length,
          recognizedFiles: subset
            .flatMap((item) => [item.important, item.contract])
            .filter((item) => item.extractionStatus === "recognized").length,
          pairMerged: subset.filter((item) => item.actual.pairMerged).length,
          pairMergeRejected: subset.filter((item) => item.actual.pairMergeRejected).length,
          duplicateCandidateDetected: subset.filter((item) => item.actual.duplicateCandidateCount > 0).length,
        },
      ];
    }),
  ),
};

const outputPath = join(sampleDir, "e2e-results.json");
writeFileSync(outputPath, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify({ outputPath, summary }, null, 2));
