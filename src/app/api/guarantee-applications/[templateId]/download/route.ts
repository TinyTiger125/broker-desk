import { NextResponse } from "next/server";
import { getBrokerageCaseById, getDefaultUser, getGuaranteeApplicationDraft } from "@/lib/data";
import { renderFriendsGuaranteePdf } from "@/lib/friends-guarantee-pdf";
import { findGuaranteeCompanyTemplate } from "@/lib/guarantee-application";
import { evaluateGuaranteeDownloadGate } from "@/lib/guarantee-download-gate";

type GuaranteeTemplateDownloadRouteProps = {
  params: Promise<{
    templateId: string;
  }>;
};

function safePdfFileName(value: string): string {
  return (value.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 80) || "guarantee_application") + ".pdf";
}

export async function GET(request: Request, { params }: GuaranteeTemplateDownloadRouteProps) {
  const user = await getDefaultUser();
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 401 });
  }

  const routeParams = await params;
  const template = findGuaranteeCompanyTemplate(routeParams.templateId);
  if (!template) {
    return NextResponse.json({ error: "template_not_found" }, { status: 404 });
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
    templateId: template.id,
  });
  const downloadGate = evaluateGuaranteeDownloadGate({
    brokerageCase,
    template,
    draft,
  });
  if (mode !== "preview" && !downloadGate.canDownload) {
    return NextResponse.json(
      {
        error: "guarantee_required_fields_missing",
        missingCount: downloadGate.missingFields.length,
        missingFields: downloadGate.missingFields.map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          status: field.status,
          actionUrl: field.actionUrl,
          destination: field.destination,
        })),
        blockedReasons: downloadGate.blockedReasons,
        previewUrl: downloadGate.previewUrl,
        workbenchUrl: downloadGate.workbenchUrl,
        draftUrl: downloadGate.draftUrl,
      },
      { status: 422 },
    );
  }

  try {
    const bytes = await renderFriendsGuaranteePdf({
      confirmedDataJson: brokerageCase.confirmedDataJson,
      draftFieldValuesJson: draft?.fieldValuesJson,
      caseTitle: brokerageCase.caseTitle,
      templateId: template.id,
    });
    const fileName = safePdfFileName(`${template.companyDisplayName}申込書_${brokerageCase.caseTitle}`);
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
        error: "guarantee_pdf_export_failed",
        message: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
