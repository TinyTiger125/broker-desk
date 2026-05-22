import { NextResponse } from "next/server";
import { getBrokerageCaseById, getDefaultUser, getGuaranteeApplicationDraft } from "@/lib/data";
import { renderFriendsGuaranteePdf } from "@/lib/friends-guarantee-pdf";
import {
  buildGuaranteeApplicationReadiness,
  getGuaranteeCompanyTemplate,
} from "@/lib/guarantee-application";

function safePdfFileName(value: string): string {
  return (value.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 80) || "friends_guarantee_application") + ".pdf";
}

export async function GET(request: Request) {
  const user = await getDefaultUser();
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 401 });
  }

  const url = new URL(request.url);
  const caseId = String(url.searchParams.get("caseId") ?? "").trim();
  const mode = String(url.searchParams.get("mode") ?? "").trim();
  if (!caseId) {
    return NextResponse.json({ error: "case_required" }, { status: 400 });
  }

  const brokerageCase = await getBrokerageCaseById({ userId: user.id, caseId });
  if (!brokerageCase) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }
  const draft = await getGuaranteeApplicationDraft({
    userId: user.id,
    caseId,
    templateId: "friends_guarantee_individual_v1",
  });
  const readinessGroups = buildGuaranteeApplicationReadiness({
    brokerageCase,
    template: getGuaranteeCompanyTemplate("friends_guarantee_individual_v1"),
    draft,
  });
  const unresolvedGroup = readinessGroups.find((group) => group.id === "unresolved");
  const blockingMissingFields = unresolvedGroup?.fields.filter((field) => field.required) ?? [];
  if (mode !== "preview" && blockingMissingFields.length > 0) {
    return NextResponse.json(
      {
        error: "friends_guarantee_required_fields_missing",
        missingCount: blockingMissingFields.length,
        missingFields: blockingMissingFields.map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          status: field.status,
        })),
        previewUrl: `/guarantee-applications/friends-guarantee/preview?caseId=${encodeURIComponent(caseId)}`,
      },
      { status: 422 },
    );
  }

  try {
    const bytes = await renderFriendsGuaranteePdf({
      confirmedDataJson: brokerageCase?.confirmedDataJson,
      draftFieldValuesJson: draft?.fieldValuesJson,
      caseTitle: brokerageCase?.caseTitle,
    });
    const fileName = safePdfFileName(`ふれんず保証申込書_${brokerageCase?.caseTitle ?? "未選択案件"}`);
    const disposition = mode === "preview" ? "inline" : "attachment";
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "friends_guarantee_pdf_export_failed",
        message: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
