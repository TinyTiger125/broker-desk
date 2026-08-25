import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getBrokerageCaseByIdForContext, markGeneratedOutputFileUnavailable, readPrivateAttachmentContentForTenant } from "@/lib/data";
import { getOutputDocLabel, isOutputDocType } from "@/lib/output-doc";
import type { Locale } from "@/lib/locale";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { getW93GeneratedOutputForContext } from "@/lib/w93-access";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeLocale(value: string | null): Locale {
  if (value === "zh" || value === "ko" || value === "ja") return value;
  return "ja";
}

export async function GET(request: Request, context: RouteContext) {
  let session;
  try {
    session = await requireTenantSession({ permission: "output.download_final" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
  const requestContext = createRequestContext(session);

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const output = await getW93GeneratedOutputForContext(requestContext, id);
  if (!output) {
    return NextResponse.json({ error: "output_not_found" }, { status: 404 });
  }
  if (!isOutputDocType(output.outputType)) {
    return NextResponse.json({ error: "output_file_unavailable" }, { status: 404 });
  }
  const expectedMime = output.outputFormat === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : output.outputFormat === "pdf"
      ? "application/pdf"
      : null;
  if (!expectedMime || output.fileStatus !== "ready" || !output.fileAttachmentId || !output.fileSha256 || output.fileSizeBytes === undefined || output.fileMimeType !== expectedMime) {
    if (output.caseId) await markGeneratedOutputFileUnavailable({ tenantId: requestContext.tenantId, caseId: output.caseId, id: output.id });
    return NextResponse.json({ error: "output_file_unavailable" }, { status: 404 });
  }

  const content = await readPrivateAttachmentContentForTenant({
    tenantId: requestContext.tenantId,
    id: output.fileAttachmentId,
  });
  if (!content) {
    if (output.caseId) await markGeneratedOutputFileUnavailable({ tenantId: requestContext.tenantId, caseId: output.caseId, id: output.id });
    return NextResponse.json({ error: "output_file_unavailable" }, { status: 404 });
  }
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (actualSha256 !== output.fileSha256 || content.length !== output.fileSizeBytes) {
    if (output.caseId) await markGeneratedOutputFileUnavailable({ tenantId: requestContext.tenantId, caseId: output.caseId, id: output.id });
    return NextResponse.json({ error: "output_file_unavailable" }, { status: 404 });
  }

  const locale = normalizeLocale(new URL(request.url).searchParams.get("locale"));
  const outputType = output.outputType;
  const caseAccess = output.caseId ? await getBrokerageCaseByIdForContext({ context: requestContext, caseId: output.caseId }) : null;
  const ownerWrite = caseAccess?.resolution.canWrite === true;
  const title = ownerWrite ? (output.title || getOutputDocLabel(locale, outputType)) : getOutputDocLabel(locale, outputType);
  const fileExt = output.outputFormat === "docx" ? "docx" : "pdf";
  const safeName = title.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 64) || "output";

  return new NextResponse(new Uint8Array(content), {
    status: 200,
    headers: {
      "content-type": expectedMime,
      "content-length": String(content.length),
      "content-disposition": `attachment; filename="${safeName}.${fileExt}"`,
      "cache-control": "private, no-store",
      etag: `"${actualSha256}"`,
      "x-file-sha256": actualSha256,
    },
  });
}
