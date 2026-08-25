import { NextResponse } from "next/server";
import { readPrivateAttachmentContentForTenant } from "@/lib/data";
import {
  isLocalPrivateStoragePath,
  isPostgresPrivateStoragePath,
  readLocalPrivateAttachment,
} from "@/lib/attachment-storage";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { getW93AttachmentForContext } from "@/lib/w93-access";

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
  const requestContext = createRequestContext(session);
  const attachment = await getW93AttachmentForContext(requestContext, attachmentId);
  if (!attachment) {
    return NextResponse.json({ ok: false, error: "attachment_not_found" }, { status: 404 });
  }
  if (attachment.targetType === "guarantee_blank_form" || attachment.targetType === "guarantee_generated_output") {
    return NextResponse.json({ ok: false, error: "guarantee_file_requires_specific_access" }, { status: 403 });
  }

  const content = isLocalPrivateStoragePath(attachment.storagePath)
      ? await readLocalPrivateAttachment({
        storagePath: attachment.storagePath!,
        tenantId: session.tenant.id,
      })
      : isPostgresPrivateStoragePath(attachment.storagePath)
      ? await readPrivateAttachmentContentForTenant({
          id: attachment.id,
          tenantId: session.tenant.id,
        })
      : null;
  if (!content) {
    return NextResponse.json({ ok: false, error: "attachment_not_found" }, { status: 404 });
  }

  const responseBody = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;

  return new NextResponse(responseBody, {
    headers: {
      "content-type": attachment.fileType || "application/octet-stream",
      "content-disposition": contentDisposition(attachment.fileName),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
