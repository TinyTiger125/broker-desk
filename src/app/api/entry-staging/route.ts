import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  cleanupEntryUploadStagingForUser,
  completeEntryUploadStaging,
  createEntryUploadStaging,
  discardEntryUploadStaging,
  putEntryUploadStagingChunk,
} from "@/lib/data";
import { ENTRY_UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/entry-upload-staging-contract";
import { getIdentityDocumentUploadLimitBytes } from "@/lib/identity-import-queue";
import { requireTenantSession, TenantSessionError } from "@/lib/tenant-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "entry_upload_staging_unavailable";
  const status = code === "entry_upload_staging_missing_chunk" ? 409
    : code === "entry_upload_staging_not_found" ? 404
      : code === "entry_upload_staging_expired" ? 410
        : code.startsWith("entry_upload_staging_") ? 400 : 503;
  const safe = code.startsWith("entry_upload_staging_") ? code : "entry_upload_staging_unavailable";
  return NextResponse.json({ ok: false, error: safe }, { status });
}

async function session() {
  return requireTenantSession({ permission: "source.upload" });
}

export async function POST(request: Request) {
  try {
    const current = await session();
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "init") {
      const fileSizeBytes = Number(body.fileSizeBytes);
      // Keep the staging ceiling equal to the active durable source limit.
      // Otherwise a 10–25 MiB file could appear to stage successfully and
      // only fail later when the formal attachment backend rejects it.
      if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes > getIdentityDocumentUploadLimitBytes()) {
        throw new Error("entry_upload_staging_file_too_large");
      }
      await cleanupEntryUploadStagingForUser({ tenantId: current.tenant.id, userId: current.user.id });
      const record = await createEntryUploadStaging({
        tenantId: current.tenant.id,
        userId: current.user.id,
        fileName: String(body.fileName ?? ""),
        fileType: typeof body.fileType === "string" ? body.fileType : undefined,
        fileSizeBytes,
        sha256: String(body.sha256 ?? ""),
        chunkCount: Number(body.chunkCount),
      });
      return NextResponse.json({ ok: true, staging: { id: record.id, fileName: record.fileName, fileType: record.fileType, fileSizeBytes: record.fileSizeBytes, sha256: record.sha256, chunkCount: record.chunkCount, chunkSizeBytes: record.chunkSizeBytes, expiresAt: record.expiresAt.toISOString() } });
    }
    if (action === "complete") {
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (!id) return NextResponse.json({ ok: false, error: "entry_upload_staging_invalid_reference" }, { status: 400 });
      const record = await completeEntryUploadStaging({ tenantId: current.tenant.id, userId: current.user.id, id });
      return NextResponse.json({ ok: true, staging: { id: record.id, fileName: record.fileName, fileType: record.fileType, fileSizeBytes: record.fileSizeBytes, sha256: record.sha256, status: record.status, expiresAt: record.expiresAt.toISOString() } });
    }
    return NextResponse.json({ ok: false, error: "entry_upload_staging_action_invalid" }, { status: 400 });
  } catch (error) {
    if (error instanceof TenantSessionError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const current = await session();
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() ?? "";
    const chunkIndex = Number(url.searchParams.get("index") ?? "-1");
    const digest = request.headers.get("x-entry-staging-sha256")?.trim().toLowerCase() ?? "";
    const declaredSize = Number(request.headers.get("content-length") ?? "0");
    if (!id || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || !/^[a-f0-9]{64}$/.test(digest)
      || (declaredSize > 0 && declaredSize > ENTRY_UPLOAD_CHUNK_SIZE_BYTES)) return NextResponse.json({ ok: false, error: "entry_upload_staging_chunk_invalid" }, { status: 400 });
    const content = Buffer.from(await request.arrayBuffer());
    if (content.length > ENTRY_UPLOAD_CHUNK_SIZE_BYTES || createHash("sha256").update(content).digest("hex") !== digest) return NextResponse.json({ ok: false, error: "entry_upload_staging_chunk_invalid" }, { status: 400 });
    await putEntryUploadStagingChunk({ tenantId: current.tenant.id, userId: current.user.id, id, chunkIndex, content, sha256: digest });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TenantSessionError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const current = await session();
    const url = new URL(request.url);
    let id = url.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      id = typeof body.id === "string" ? body.id.trim() : "";
    }
    if (!id) return NextResponse.json({ ok: false, error: "entry_upload_staging_invalid_reference" }, { status: 400 });
    await discardEntryUploadStaging({ tenantId: current.tenant.id, userId: current.user.id, id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TenantSessionError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    return errorResponse(error);
  }
}
