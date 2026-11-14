import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { activeDataDriver, addPrivateAttachment, createObjectImportTarget, getClientById, getDefaultUser, listObjectImportTargets, upsertObjectImportCandidate } from "@/lib/data";
import { buildObjectVersionFingerprint } from "@/lib/object-import-contract";
import { DEFAULT_TENANT_ID } from "@/lib/tenant-constants";
import { isQaApiRequestAllowed, rejectQaApiRequest } from "@/lib/qa-api";

export const dynamic = "force-dynamic";

/**
 * Loopback-only UI harness. It seeds review rows directly in the memory store
 * so browser QA can exercise confirm/save/reopen without an identity file or a
 * model call. This route is unreachable in production through qa-api guards.
 */
async function seed(request: Request) {
  if (!isQaApiRequestAllowed(request)) return rejectQaApiRequest();
  if (activeDataDriver !== "memory") return NextResponse.json({ ok: false, error: "qa_client_candidate_requires_memory_driver" }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { clientId?: unknown };
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) return NextResponse.json({ ok: false, error: "client_id_required" }, { status: 400 });

  const user = await getDefaultUser("user_demo");
  const client = await getClientById(clientId, DEFAULT_TENANT_ID);
  if (!user || !client) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const targetId = `qa_client_candidate_${clientId}`;
  const importJobId = `${targetId}_job`;
  const sourceContent = Buffer.from("Broker Desk local UI candidate fixture; no identity document and no model invocation.\n", "utf8");
  const sourceFileHash = createHash("sha256").update(sourceContent).digest("hex");
  const attachment = await addPrivateAttachment({
    tenantId: DEFAULT_TENANT_ID,
    userId: user.id,
    targetType: "import_job",
    targetId: importJobId,
    fileName: "ui-only-client-candidate-fixture.txt",
    fileType: "text/plain",
    content: sourceContent,
    dedupeKey: targetId,
  });
  const targetVersion = buildObjectVersionFingerprint(client as unknown as Record<string, unknown>);
  const existing = (await listObjectImportTargets({ tenantId: DEFAULT_TENANT_ID, userId: user.id, targetType: "party", targetId: clientId })).find((item) => item.id === targetId);
  if (!existing) {
    await createObjectImportTarget({
      id: targetId,
      tenantId: DEFAULT_TENANT_ID,
      userId: user.id,
      importJobId,
      targetType: "party",
      targetId: clientId,
      targetVersion,
      sourceAttachmentId: attachment.id,
      status: "needs_review",
      idempotencyKey: targetId,
      attemptCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const provenance = {
    sourceAttachmentId: attachment.id,
    sourceFileHash,
    pageNumber: 1,
    sourceText: "UI-only synthetic candidate; not extracted from an identity document.",
    method: "local-ui-fixture",
    uncertainty: "ambiguous",
    alternatives: [{ value: "別候補（未選択）", pageNumber: 1, sourceText: "UI-only conflict alternative" }],
  };
  await upsertObjectImportCandidate({ id: `${targetId}_name`, tenantId: DEFAULT_TENANT_ID, targetId, fieldKey: "name", candidateValue: "UI確認候補 山田", confidence: 0.4, provenance, finalValue: "UI確認候補 山田", finalSource: "model_draft", status: "conflict" });
  await upsertObjectImportCandidate({ id: `${targetId}_phone`, tenantId: DEFAULT_TENANT_ID, targetId, fieldKey: "phone", candidateValue: "090-1234-5678", confidence: 0.4, provenance, finalValue: "090-1234-5678", finalSource: "model_draft", status: "conflict" });

  return NextResponse.json({ ok: true, clientId, targetId, sourceAttachmentId: attachment.id, targetVersion, fixture: "ui-behavior-only" });
}

export async function POST(request: Request) {
  return seed(request);
}
