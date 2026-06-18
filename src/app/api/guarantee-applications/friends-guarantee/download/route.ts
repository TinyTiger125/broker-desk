import { NextResponse } from "next/server";
import { getBrokerageCaseById, getGuaranteeApplicationDraft } from "@/lib/data";
import { renderFriendsGuaranteePdf } from "@/lib/friends-guarantee-pdf";
import { getGuaranteeCompanyTemplate } from "@/lib/guarantee-application";
import { evaluateGuaranteeDownloadGate } from "@/lib/guarantee-download-gate";
import { requireTenantSession, TenantSessionError } from "@/lib/tenant-session";

function safePdfFileName(value: string): string {
  return (value.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 80) || "friends_guarantee_application") + ".pdf";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const caseId = String(url.searchParams.get("caseId") ?? "").trim();
  const mode = String(url.searchParams.get("mode") ?? "").trim();
  if (!caseId) {
    return NextResponse.json({ error: "case_required" }, { status: 400 });
  }

  let session;
  try {
    session = await requireTenantSession({ permission: mode === "preview" ? "output.preview" : "output.download_final" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }

  const brokerageCase = await getBrokerageCaseById({ userId: session.user.id, tenantId: session.tenant.id, caseId });
  if (!brokerageCase) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }
  const draft = await getGuaranteeApplicationDraft({
    userId: session.user.id,
    tenantId: session.tenant.id,
    caseId,
    templateId: "friends_guarantee_individual_v1",
  });
  const template = getGuaranteeCompanyTemplate("friends_guarantee_individual_v1");
  const downloadGate = evaluateGuaranteeDownloadGate({
    brokerageCase,
    template,
    draft,
  });
  if (mode !== "preview" && !downloadGate.canDownload) {
    return NextResponse.json(
      {
        error: "friends_guarantee_required_fields_missing",
        missingCount: downloadGate.missingFields.length,
        missingFields: downloadGate.missingFields.map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          status: field.status,
          actionUrl: field.actionUrl,
          destination: field.destination,
        })),
        blockedReasons: downloadGate.blockedReasons,
        previewUrl: "/guarantee-applications/friends-guarantee/preview?caseId=" + encodeURIComponent(caseId),
        workbenchUrl: downloadGate.workbenchUrl,
        draftUrl: downloadGate.draftUrl,
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
