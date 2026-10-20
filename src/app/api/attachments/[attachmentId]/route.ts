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

const INLINE_PREVIEW_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function contentDisposition(fileName: string, disposition: "inline" | "attachment") {
  const fallback = fileName.replace(/[^A-Za-z0-9._-]/g, "_") || "attachment";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
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
  const requestedInline = new URL(request.url).searchParams.get("disposition") === "inline";
  const normalizedFileType = (attachment.fileType ?? "").split(";", 1)[0].trim().toLowerCase();
  const inline = requestedInline && INLINE_PREVIEW_TYPES.has(normalizedFileType);

  return new NextResponse(responseBody, {
    headers: {
      "content-type": normalizedFileType || "application/octet-stream",
      "content-disposition": contentDisposition(attachment.fileName, inline ? "inline" : "attachment"),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
