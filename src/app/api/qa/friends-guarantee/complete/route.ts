import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  activeDataDriver,
  addAuditLog,
  getBrokerageCaseById,
  getDefaultUser,
  saveGuaranteeApplicationDraft,
  updateBrokerageCaseConfirmedData,
} from "@/lib/data";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import {
  buildGuaranteeDraftReadiness,
  getGuaranteeDraftFieldDefinitions,
  guaranteeCompanyTemplates,
} from "@/lib/guarantee-application";
import {
  GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY,
  getFriendsGuaranteeEffectiveOverlayFields,
  getFriendsOverlayFieldPrintMode,
  setGuaranteeConfirmedOverlayFieldKeys,
} from "@/lib/friends-guarantee-pdf";
import { COMPLETE_CASE_FIELD_DEFAULTS, COMPLETE_DRAFT_DEFAULTS } from "@/lib/guarantee-application-fixtures";
import { isQaApiRequestAllowed, rejectQaApiRequest } from "@/lib/qa-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isQaApiRequestAllowed(request)) return rejectQaApiRequest();

  if (activeDataDriver !== "memory") {
    return NextResponse.json(
      { ok: false, error: "qa_complete_only_supports_memory_driver" },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    caseId?: string;
    caseFields?: Record<string, string>;
    draftFields?: Record<string, string>;
    overwrite?: boolean;
  };
  const user = await getDefaultUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 401 });
  }

  const caseId = String(body.caseId ?? "").trim();
  if (!caseId) {
    return NextResponse.json({ ok: false, error: "case_id_required" }, { status: 400 });
  }

  const brokerageCase = await getBrokerageCaseById({ userId: user.id, caseId });
  if (!brokerageCase) {
    return NextResponse.json({ ok: false, error: "case_not_found" }, { status: 404 });
  }

  const draftValues = { ...COMPLETE_DRAFT_DEFAULTS, ...(body.draftFields ?? {}) };
  const activeGuaranteeTemplates = guaranteeCompanyTemplates.filter((item) => item.outputStatus === "active");
  const nextConfirmedData: Record<string, unknown> = { ...brokerageCase.confirmedDataJson };
  Object.entries({ ...COMPLETE_CASE_FIELD_DEFAULTS, ...(body.caseFields ?? {}) }).forEach(([fieldKey, value]) => {
    const nextValue = String(value ?? "").trim();
    if (!nextValue) return;
    if (body.overwrite || !getCaseFieldValue(nextConfirmedData, fieldKey)) {
      nextConfirmedData[fieldKey] = nextValue;
    }
  });
  activeGuaranteeTemplates.forEach((template) => {
    const confirmedFieldKeys = getFriendsGuaranteeEffectiveOverlayFields({
      templateId: template.id,
      confirmedDataJson: nextConfirmedData,
    })
      .filter((field) => getFriendsOverlayFieldPrintMode(field) === "candidate")
      .flatMap((field) => {
        const sourceFieldKey = field.sourceFieldKey ?? field.fieldKey;
        const value = sourceFieldKey.startsWith("company_option.")
          ? String(draftValues[sourceFieldKey] ?? "").trim()
          : getCaseFieldValue(nextConfirmedData, sourceFieldKey);
        return value ? [field.fieldKey, sourceFieldKey] : [];
      });
    if (confirmedFieldKeys.length === 0) return;
    nextConfirmedData[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY] = setGuaranteeConfirmedOverlayFieldKeys({
      currentValue: nextConfirmedData[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY],
      templateId: template.id,
      fieldKeys: confirmedFieldKeys,
    });
  });

  const updatedCase = await updateBrokerageCaseConfirmedData({
    userId: user.id,
    caseId,
    confirmedDataJson: nextConfirmedData,
  });
  if (!updatedCase) {
    return NextResponse.json({ ok: false, error: "case_update_failed" }, { status: 500 });
  }

  const drafts = [];
  for (const template of activeGuaranteeTemplates) {
    const fieldValuesJson: Record<string, unknown> = {};
    const fieldStatusesJson: Record<string, string> = {};
    getGuaranteeDraftFieldDefinitions(template.id).forEach((definition) => {
      const value = String(draftValues[definition.fieldKey] ?? "").trim();
      if (!value || value === "未確認" || value === "未定") return;
      fieldValuesJson[definition.fieldKey] = value;
      fieldStatusesJson[definition.fieldKey] = "confirmed";
    });

    const readiness = buildGuaranteeDraftReadiness({
      id: "qa_complete",
      userId: user.id,
      caseId,
      templateId: template.id,
      companyCode: template.companyCode,
      status: "draft",
      fieldValuesJson,
      fieldStatusesJson,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, template.id);
    const draft = await saveGuaranteeApplicationDraft({
      userId: user.id,
      caseId,
      templateId: template.id,
      companyCode: template.companyCode,
      status: readiness.status,
      fieldValuesJson,
      fieldStatusesJson,
      lastReviewedAt: new Date(),
    });
    drafts.push({ draft, readiness });
  }
  const primaryDraft = drafts[0];
  const primaryTemplate =
    activeGuaranteeTemplates.find((template) => template.id === "friends_guarantee_individual_v1") ??
    activeGuaranteeTemplates[0];
  const primaryDraftResult =
    drafts.find((result) => result.draft.templateId === primaryTemplate?.id) ?? primaryDraft;

  await addAuditLog({
    userId: user.id,
    action: "qa_guarantee_applications_completed",
    targetType: "import_job",
    targetId: caseId,
    message: `QA 保証会社申込書の必須項目を補完しました: ${updatedCase.caseTitle}`,
    context: {
      caseId,
      draftId: primaryDraftResult?.draft.id,
      templateId: primaryDraftResult?.draft.templateId,
      draftStatus: primaryDraftResult?.draft.status,
      savedDraftCount: drafts.length,
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/output-center");
  activeGuaranteeTemplates.forEach((template) => {
    revalidatePath(`/guarantee-applications/${template.id}/preview`);
  });
  return NextResponse.json({
    ok: true,
    caseId,
    templateId: primaryTemplate?.id,
    draftStatus: primaryDraftResult?.draft.status,
    draftReadyCount: primaryDraftResult?.readiness.readyCount ?? 0,
    draftMissingCount: primaryDraftResult?.readiness.missingCount ?? 0,
    savedDraftCount: drafts.length,
    previewUrl: `/guarantee-applications/${primaryTemplate?.id ?? "friends_guarantee_individual_v1"}/preview?caseId=${encodeURIComponent(caseId)}`,
    downloadUrl: `/api/guarantee-applications/${primaryTemplate?.id ?? "friends_guarantee_individual_v1"}/download?caseId=${encodeURIComponent(caseId)}`,
  });
}
