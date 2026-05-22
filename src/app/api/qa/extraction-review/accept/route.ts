import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  activeDataDriver,
  addAuditLog,
  getBrokerageCaseById,
  getBrokerageCaseByImportJobId,
  getDefaultUser,
  listBrokerageCases,
  listImportJobs,
  mergeBrokerageCaseExtractionReview,
  saveBrokerageCaseExtractionReview,
  type ExtractionReviewItem,
} from "@/lib/data";
import {
  CASE_MERGE_MIN_CONFIDENCE,
  createCaseMergeHistoryItem,
  evaluateCaseMergeCandidates,
  getCaseMergeHistory,
  mergeConfirmedCaseData,
  setCaseMergeHistory,
} from "@/lib/case-merge";
import { canonicalizeCaseFieldKey } from "@/lib/case-field-normalization";
import { materializeExtractionReviewValue } from "@/lib/extraction-review-materialization";
import { isQaApiRequestAllowed, rejectQaApiRequest } from "@/lib/qa-api";
import type { InputFileExtractionResult } from "@/lib/input-file-extractor";

export const dynamic = "force-dynamic";

type ExcelImportPayload = {
  kind?: "property_row_import" | "input_file_extraction";
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
  inputExtraction?: InputFileExtractionResult;
};

function getExtractionFieldId(field: InputFileExtractionResult["fields"][number]) {
  return `${field.fieldKey}:${field.sourceCell ?? field.sourceRange ?? field.sourceSheet}`;
}

function buildCaseTitle(extraction: InputFileExtractionResult, fallbackTitle: string) {
  const propertyName = extraction.fields.find((field) => field.fieldKey === "property_name" || field.fieldKey === "property.name")?.normalizedValue;
  const applicantName = extraction.fields.find((field) => field.fieldKey === "applicant.name")?.normalizedValue;
  return [propertyName || applicantName, extraction.documentTypeLabel, extraction.sourceFilename || fallbackTitle]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ");
}

function materializeAcceptedExtraction(input: {
  extraction: InputFileExtractionResult;
  jobId: string;
  reviewedById: string;
}) {
  const confirmedDataJson: Record<string, unknown> = {};
  const reviewedAt = new Date();

  const reviewItems = input.extraction.fields.map((field) => {
    const baseValue = field.normalizedValue || field.value;
    const materialized = materializeExtractionReviewValue({
      reviewStatus: "accepted",
      baseValue,
    });
    if (materialized.shouldConfirm && materialized.finalValue) {
      confirmedDataJson[field.fieldKey] = materialized.finalValue;
      const canonicalFieldKey = canonicalizeCaseFieldKey(field.fieldKey);
      if (canonicalFieldKey !== field.fieldKey && !confirmedDataJson[canonicalFieldKey]) {
        confirmedDataJson[canonicalFieldKey] = materialized.finalValue;
      }
    }

    return {
      importJobId: input.jobId,
      fieldKey: field.fieldKey,
      label: field.label,
      extractedValue: field.value,
      normalizedValue: field.normalizedValue,
      finalValue: materialized.finalValue,
      sourceSheet: field.sourceSheet,
      sourceCell: field.sourceCell,
      sourceRange: field.sourceRange,
      method: field.method,
      confidence: field.confidence,
      reviewStatus: "accepted",
      sourceFileHash: field.sourceFileHash,
      templateVersion: field.templateVersion,
      reviewedById: input.reviewedById,
      reviewedAt,
    } satisfies Omit<ExtractionReviewItem, "id" | "userId" | "caseId" | "createdAt">;
  });

  return {
    confirmedDataJson,
    reviewItems,
    acceptedFieldIds: input.extraction.fields.map(getExtractionFieldId),
  };
}

export async function POST(request: Request) {
  if (!isQaApiRequestAllowed(request)) return rejectQaApiRequest();

  if (activeDataDriver !== "memory") {
    return NextResponse.json(
      { ok: false, error: "qa_accept_only_supports_memory_driver" },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    jobId?: string;
    mergeTargetCaseId?: string;
    mergeConfirm?: boolean;
  };
  const user = await getDefaultUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 401 });
  }

  const jobId = String(body.jobId ?? "").trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "job_id_required" }, { status: 400 });
  }

  const jobs = await listImportJobs(user.id, 500);
  const job = jobs.find((item) => item.id === jobId);
  if (!job?.notes) {
    return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  }

  let payload: ExcelImportPayload;
  try {
    payload = JSON.parse(job.notes) as ExcelImportPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_job_payload" }, { status: 422 });
  }

  if (payload.kind !== "input_file_extraction" || !payload.inputExtraction) {
    return NextResponse.json({ ok: false, error: "not_input_file_extraction" }, { status: 422 });
  }
  if (payload.inputExtraction.extractionStatus !== "recognized") {
    return NextResponse.json(
      {
        ok: false,
        error: "extraction_not_recognized",
        extractionStatus: payload.inputExtraction.extractionStatus,
        documentType: payload.inputExtraction.documentType,
      },
      { status: 422 },
    );
  }

  const { confirmedDataJson, reviewItems, acceptedFieldIds } = materializeAcceptedExtraction({
    extraction: payload.inputExtraction,
    jobId: job.id,
    reviewedById: user.id,
  });
  const preSaveCandidates = evaluateCaseMergeCandidates({
    incomingData: confirmedDataJson,
    cases: await listBrokerageCases(user.id, 500),
    currentImportJobId: job.id,
  });
  const mergeTargetCaseId = String(body.mergeTargetCaseId ?? "").trim();
  const existingCase = await getBrokerageCaseByImportJobId({
    userId: user.id,
    importJobId: job.id,
  });

  if (mergeTargetCaseId) {
    if (!body.mergeConfirm) {
      return NextResponse.json({ ok: false, error: "merge_confirm_required" }, { status: 400 });
    }

    const targetCase = await getBrokerageCaseById({ userId: user.id, caseId: mergeTargetCaseId });
    if (!targetCase) {
      return NextResponse.json({ ok: false, error: "merge_target_not_found" }, { status: 404 });
    }
    if (targetCase.sourceImportJobIds.includes(job.id)) {
      return NextResponse.json({ ok: false, error: "source_already_in_case" }, { status: 409 });
    }

    const [candidate] = evaluateCaseMergeCandidates({
      incomingData: confirmedDataJson,
      cases: [targetCase],
      currentImportJobId: job.id,
    });
    if (!candidate || candidate.confidenceScore < CASE_MERGE_MIN_CONFIDENCE) {
      return NextResponse.json(
        {
          ok: false,
          error: "merge_confidence_too_low",
          minConfidence: CASE_MERGE_MIN_CONFIDENCE,
          candidate: candidate ?? null,
          confirmedFieldCount: Object.keys(confirmedDataJson).length,
        },
        { status: 422 },
      );
    }

    const mergedData = mergeConfirmedCaseData({
      existingData: targetCase.confirmedDataJson,
      incomingData: confirmedDataJson,
    });
    const historyItem = createCaseMergeHistoryItem({
      sourceImportJobId: job.id,
      sourceImportJobTitle: job.title,
      mergedById: user.id,
      confidenceScore: candidate.confidenceScore,
      matchReasons: candidate.matchReasons,
      conflictFields: mergedData.conflictFields,
      conflictDetails: mergedData.conflictDetails,
      addedFields: mergedData.addedFields,
      preservedFields: mergedData.preservedFields,
      beforeConfirmedDataJson: targetCase.confirmedDataJson,
      beforeSourceImportJobIds: targetCase.sourceImportJobIds,
      incomingConfirmedDataJson: confirmedDataJson,
    });
    const brokerageCase = await mergeBrokerageCaseExtractionReview({
      userId: user.id,
      caseId: targetCase.id,
      confirmedDataJson: setCaseMergeHistory(mergedData.nextData, [
        ...getCaseMergeHistory(targetCase.confirmedDataJson),
        historyItem,
      ]),
      sourceImportJobIds: [...targetCase.sourceImportJobIds, job.id],
      replaceImportJobIds: [job.id],
      reviewItems,
    });
    if (!brokerageCase) {
      return NextResponse.json({ ok: false, error: "merge_save_failed" }, { status: 500 });
    }

    await addAuditLog({
      userId: user.id,
      action: "qa_case_source_merged",
      targetType: "import_job",
      targetId: job.id,
      message: `QA 抽出レビューを既存案件へ追加しました: ${brokerageCase.caseTitle}`,
      context: {
        caseId: brokerageCase.id,
        mergeId: historyItem.id,
        confidenceScore: candidate.confidenceScore,
      },
    });

    revalidatePath("/import-center");
    revalidatePath("/cases");
    revalidatePath(`/cases/${brokerageCase.id}`);
    return NextResponse.json({
      ok: true,
      mode: "merged",
      caseId: brokerageCase.id,
      caseTitle: brokerageCase.caseTitle,
      confirmedFieldCount: Object.keys(confirmedDataJson).length,
      preSaveCandidates,
      acceptedFieldIds,
      sourceImportJobIds: brokerageCase.sourceImportJobIds,
      mergeHistory: getCaseMergeHistory(brokerageCase.confirmedDataJson),
    });
  }

  let brokerageCase;
  if (existingCase && existingCase.sourceImportJobIds.length > 1) {
    const mergedData = mergeConfirmedCaseData({
      existingData: existingCase.confirmedDataJson,
      incomingData: confirmedDataJson,
    });
    brokerageCase = await mergeBrokerageCaseExtractionReview({
      userId: user.id,
      caseId: existingCase.id,
      confirmedDataJson: setCaseMergeHistory(
        mergedData.nextData,
        getCaseMergeHistory(existingCase.confirmedDataJson),
      ),
      sourceImportJobIds: existingCase.sourceImportJobIds,
      replaceImportJobIds: [job.id],
      reviewItems,
    });
    if (!brokerageCase) {
      return NextResponse.json({ ok: false, error: "case_update_failed" }, { status: 500 });
    }
  } else {
    brokerageCase = await saveBrokerageCaseExtractionReview({
      userId: user.id,
      caseId: existingCase?.id,
      caseType: "unit_sale",
      caseTitle: buildCaseTitle(payload.inputExtraction, job.title),
      status: "reviewed",
      confirmedDataJson,
      sourceImportJobIds: [job.id],
      reviewItems,
    });
  }

  await addAuditLog({
    userId: user.id,
    action: "qa_extraction_review_saved",
    targetType: "import_job",
    targetId: job.id,
    message: `QA 抽出レビューを案件へ保存しました: ${brokerageCase.caseTitle}`,
    context: {
      caseId: brokerageCase.id,
      confirmedFieldCount: Object.keys(confirmedDataJson).length,
      reviewItemCount: reviewItems.length,
    },
  });

  revalidatePath("/import-center");
  revalidatePath("/cases");
  revalidatePath(`/cases/${brokerageCase.id}`);
  return NextResponse.json({
    ok: true,
    mode: existingCase ? "updated" : "created",
    caseId: brokerageCase.id,
    caseTitle: brokerageCase.caseTitle,
    confirmedFieldCount: Object.keys(confirmedDataJson).length,
    preSaveCandidates,
    acceptedFieldIds,
    sourceImportJobIds: brokerageCase.sourceImportJobIds,
    mergeHistory: getCaseMergeHistory(brokerageCase.confirmedDataJson),
  });
}
