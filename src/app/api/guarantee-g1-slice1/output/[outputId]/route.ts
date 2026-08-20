import { NextResponse } from "next/server";
import { getBrokerageCaseById, getGuaranteeOutputByCase, readPrivateAttachmentContentForTenant } from "@/lib/data";
import { requireTenantSession, TenantSessionError } from "@/lib/tenant-session";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ outputId: string }> }) {
  try {
    const session = await requireTenantSession({ permission: "output.download_final" });
    const { outputId } = await params;
    const url = new URL(request.url); const caseId = String(url.searchParams.get("caseId") ?? "");
    if (!caseId) return NextResponse.json({ error: "case_required" }, { status: 400 });
    const brokerageCase = await getBrokerageCaseById({ userId: session.user.id, tenantId: session.tenant.id, caseId });
    if (!brokerageCase) return NextResponse.json({ error: "case_not_found" }, { status: 404 });
    const output = await getGuaranteeOutputByCase({ tenantId: session.tenant.id, caseId, id: outputId });
    if (!output?.fileAttachmentId || output.fileStatus !== "ready") return NextResponse.json({ error: "output_file_unavailable" }, { status: 404 });
    const content = await readPrivateAttachmentContentForTenant({ tenantId: session.tenant.id, id: output.fileAttachmentId });
    if (!content) return NextResponse.json({ error: "output_file_unavailable" }, { status: 404 });
    return new NextResponse(new Uint8Array(content), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${output.documentNumber}.pdf"`, "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof TenantSessionError) return NextResponse.json({ error: error.code }, { status: error.status });
    return NextResponse.json({ error: "output_file_access_failed" }, { status: 403 });
  }
}
