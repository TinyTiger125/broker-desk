import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getBrokerageCaseByIdForContext, getGuaranteeOutputByCase, markGeneratedOutputFileUnavailable, readPrivateAttachmentContentForTenant } from "@/lib/data";
import { requireTenantSession, TenantSessionError } from "@/lib/tenant-session";
import { getRequestId } from "@/lib/operational-logging";
import { createRequestContext } from "@/lib/visibility-resolver";
import { assertCaseSourcesReadable, assertGeneratedOutputSourcesReadable } from "@/lib/w93-access";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ outputId: string }> }) {
  const requestId = getRequestId(request);
  const jsonError = (error: string, status: number) => NextResponse.json({ error, requestId }, { status, headers: { "x-request-id": requestId } });
  try {
    const session = await requireTenantSession({ permission: "output.download_final" });
    const { outputId } = await params;
    const url = new URL(request.url); const caseId = String(url.searchParams.get("caseId") ?? "");
    if (!caseId) return jsonError("case_required", 400);
    const requestContext = createRequestContext(session);
    const resolvedCase = await getBrokerageCaseByIdForContext({ context: requestContext, caseId });
    if (!resolvedCase.brokerageCase || !resolvedCase.resolution.canRead) return jsonError("case_not_found", 404);
    try {
      await assertCaseSourcesReadable(requestContext, resolvedCase.brokerageCase);
    } catch {
      return jsonError("case_not_found", 404);
    }
    const output = await getGuaranteeOutputByCase({ tenantId: session.tenant.id, caseId, id: outputId });
    if (!output?.fileAttachmentId) return jsonError("output_file_unavailable", 404);
    try {
      await assertGeneratedOutputSourcesReadable(requestContext, output);
    } catch {
      return jsonError("output_file_unavailable", 404);
    }
    if (output.fileStatus !== "ready") {
      await markGeneratedOutputFileUnavailable({ tenantId: session.tenant.id, caseId, id: outputId });
      return jsonError("output_file_unavailable", 404);
    }
    const content = await readPrivateAttachmentContentForTenant({ tenantId: session.tenant.id, id: output.fileAttachmentId });
    if (!content) {
      await markGeneratedOutputFileUnavailable({ tenantId: session.tenant.id, caseId, id: outputId });
      return jsonError("output_file_unavailable", 404);
    }
    const actualSha256 = createHash("sha256").update(content).digest("hex");
    if (!output.fileSha256 || actualSha256 !== output.fileSha256 || output.fileSizeBytes !== content.length || (output.fileMimeType && output.fileMimeType !== "application/pdf")) {
      await markGeneratedOutputFileUnavailable({ tenantId: session.tenant.id, caseId, id: outputId });
      return jsonError("output_file_unavailable", 404);
    }
    return new NextResponse(new Uint8Array(content), { headers: { "content-type": "application/pdf", "content-length": String(content.length), "content-disposition": `inline; filename="${output.documentNumber}.pdf"`, "cache-control": "private, no-store", etag: `"${actualSha256}"`, "x-file-sha256": actualSha256 } });
  } catch (error) {
    if (error instanceof TenantSessionError) return jsonError(error.code, error.status);
    return jsonError("output_file_access_failed", 403);
  }
}
