import { NextResponse } from "next/server";
import { getAttachmentById } from "@/lib/data";
import { isLocalPrivateStoragePath, readLocalPrivateAttachment } from "@/lib/attachment-storage";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^A-Za-z0-9._-]/g, "_") || "attachment";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  let session;
  try {
    session = await requireTenantSession({ permission: "source.download_original" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "attachment_unavailable" }, { status: 503 });
  }

  const { attachmentId } = await context.params;
  const attachment = await getAttachmentById({
    id: attachmentId,
    tenantId: session.tenant.id,
    userId: session.user.id,
  });
  if (!attachment || !isLocalPrivateStoragePath(attachment.storagePath)) {
    return NextResponse.json({ ok: false, error: "attachment_not_found" }, { status: 404 });
  }

  const content = await readLocalPrivateAttachment({
    storagePath: attachment.storagePath!,
    tenantId: session.tenant.id,
  });
  if (!content) {
    return NextResponse.json({ ok: false, error: "attachment_not_found" }, { status: 404 });
  }

  return new NextResponse(content, {
    headers: {
      "content-type": attachment.fileType || "application/octet-stream",
      "content-disposition": contentDisposition(attachment.fileName),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
