import { NextResponse } from "next/server";
import { addAuditLog, addGeneratedOutput, getBrokerageCaseById, getGuaranteeApplicationDraft } from "@/lib/data";
import {
  getFriendsGuaranteeTemplateLayoutSnapshot,
  getGuaranteePdfTemplateConfig,
  renderFriendsGuaranteePdf,
} from "@/lib/friends-guarantee-pdf";
import { findGuaranteeCompanyTemplate } from "@/lib/guarantee-application";
import { evaluateGuaranteeDownloadGate } from "@/lib/guarantee-download-gate";
import { requireTenantSession, TenantSessionError } from "@/lib/tenant-session";

type GuaranteeTemplateDownloadRouteProps = {
  params: Promise<{
    templateId: string;
  }>;
};

function safePdfFileName(value: string): string {
  return (value.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 80) || "guarantee_application") + ".pdf";
}

function compactDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function createGuaranteeDocumentNumber(input: { templateId: string; caseId: string; generatedAt: Date }) {
  const templateToken = input.templateId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10) || "GUARANTEE";
  const caseToken = input.caseId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-8) || "CASE";
  return `BD-GA-${compactDate(input.generatedAt)}-${templateToken}-${caseToken}`;
}

export async function GET(request: Request, { params }: GuaranteeTemplateDownloadRouteProps) {
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
    if (mode !== "preview") {
      const generatedAt = new Date();
      const layoutSnapshot = getFriendsGuaranteeTemplateLayoutSnapshot(template.id);
      const pdfTemplateConfig = getGuaranteePdfTemplateConfig(template.id);
      const documentNumber = createGuaranteeDocumentNumber({
        templateId: template.id,
        caseId: brokerageCase.id,
        generatedAt,
      });
      const generated = await addGeneratedOutput({
        tenantId: session.tenant.id,
        userId: session.user.id,
        actorId: session.user.id,
        outputType: "guarantee_application",
        outputFormat: "pdf",
        language: "ja",
        title: `${template.companyDisplayName}申込書 - ${brokerageCase.caseTitle}`,
        documentNumber,
        templateVersionId: `official:${template.id}:${layoutSnapshot.baselineVersion}`,
        caseId: brokerageCase.id,
        templateId: template.id,
        inputDataSnapshot: brokerageCase.confirmedDataJson,
        draftValueSnapshot: draft?.fieldValuesJson ?? {},
        fieldMappingSnapshot: {
          templateId: template.id,
          overlayFieldKeys: pdfTemplateConfig.overlayFields.map((field) => field.fieldKey),
        },
        layoutSnapshot,
      });
      await addAuditLog({
        tenantId: session.tenant.id,
        userId: session.user.id,
        action: "guarantee_application_downloaded",
        targetType: "output",
        targetId: generated.id,
        message: `${template.companyDisplayName}申込書PDFを生成・ダウンロードしました: ${brokerageCase.caseTitle}`,
        context: {
          caseId: brokerageCase.id,
          templateId: template.id,
          outputId: generated.id,
          documentNumber,
          templateVersionId: generated.templateVersionId,
        },
      });
    }
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
