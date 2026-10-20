import {
  getAttachmentByIdForTenant,
  getObjectImportFeatureReadiness,
  linkAttachmentToObject,
  listAttachmentLinks,
  listObjectImportTargets,
  listAttachments,
  type Attachment,
  type AttachmentLink,
  type ObjectAttachmentCategory,
  type ObjectAttachmentTargetType,
} from "@/lib/data";

export const OBJECT_ATTACHMENT_CATEGORIES = [
  "identity", "address", "income_employment", "property_registry", "floor_plan",
  "photo", "contract", "application", "correspondence", "output", "other",
] as const satisfies readonly ObjectAttachmentCategory[];

export type ObjectAttachmentItem = { attachment: Attachment; link: AttachmentLink };

export function isObjectAttachmentTargetType(value: string): value is ObjectAttachmentTargetType {
  return value === "case" || value === "party" || value === "property";
}

export function isObjectAttachmentCategory(value: string): value is ObjectAttachmentCategory {
  return OBJECT_ATTACHMENT_CATEGORIES.includes(value as ObjectAttachmentCategory);
}

export function inferObjectAttachmentCategory(input: { fileName?: string; documentType?: string }): ObjectAttachmentCategory {
  const value = `${input.documentType ?? ""} ${input.fileName ?? ""}`.toLowerCase();
  if (/identity|residence|在留|免許|passport|旅券|身分/.test(value)) return "identity";
  if (/住所|住民票|address/.test(value)) return "address";
  if (/income|salary|employment|収入|所得|給与|雇用|在職/.test(value)) return "income_employment";
  if (/登記|registry|謄本/.test(value)) return "property_registry";
  if (/間取|floor.?plan|図面/.test(value)) return "floor_plan";
  if (/\.jpe?g$|\.png$|\.heic$|写真|photo/.test(value)) return "photo";
  if (/contract|契約/.test(value)) return "contract";
  if (/application|申込|申請/.test(value)) return "application";
  if (/output|出力/.test(value)) return "output";
  return "other";
}

export async function linkImportJobAttachmentsToObject(input: {
  tenantId: string;
  userId: string;
  importJobId: string;
  targetType: ObjectAttachmentTargetType;
  targetId: string;
  documentType?: string;
}): Promise<AttachmentLink[]> {
  const attachments = await listAttachments({
    tenantId: input.tenantId,
    userId: input.userId,
    targetType: "import_job",
    targetId: input.importJobId,
    limit: 100,
  });
  return Promise.all(attachments.map((attachment) => linkAttachmentToObject({
    tenantId: input.tenantId,
    attachmentId: attachment.id,
    targetType: input.targetType,
    targetId: input.targetId,
    category: inferObjectAttachmentCategory({ fileName: attachment.fileName, documentType: input.documentType }),
    sourceImportJobId: input.importJobId,
    createdByUserId: input.userId,
  })));
}

export async function listLinkedObjectAttachments(input: {
  tenantId: string;
  targetType: ObjectAttachmentTargetType;
  targetId: string;
}): Promise<ObjectAttachmentItem[]> {
  const links = await listAttachmentLinks({
    tenantId: input.tenantId,
    targetType: input.targetType,
    targetId: input.targetId,
    limit: 100,
  });
  const attachments = await Promise.all(links.map((link) =>
    getAttachmentByIdForTenant({ tenantId: input.tenantId, id: link.attachmentId }),
  ));
  return links.flatMap((link, index) => attachments[index] ? [{ link, attachment: attachments[index]! }] : []);
}

/**
 * Read the durable source files for object-import targets without mutating
 * attachment_links. This keeps legacy imports visible in the archive even if
 * their review was completed before source linking was added.
 */
export async function listObjectArchiveAttachments(input: {
  tenantId: string;
  userId: string;
  targetType: "party" | "property";
  targetId: string;
}): Promise<ObjectAttachmentItem[]> {
  const [linkedItems, readiness] = await Promise.all([
    listLinkedObjectAttachments(input),
    getObjectImportFeatureReadiness(),
  ]);
  if (!readiness.ready) return linkedItems;
  const targets = (await listObjectImportTargets({
    tenantId: input.tenantId,
    userId: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
  })).filter((target) =>
    !target.caseId && target.targetType === input.targetType && target.targetId === input.targetId,
  );
  const linkedAttachmentIds = new Set(linkedItems.map((item) => item.attachment.id));
  const sourceGroups = await Promise.all(targets.map(async (target) => ({
    target,
    attachments: await listAttachments({
      tenantId: input.tenantId,
      userId: input.userId,
      targetType: "import_job",
      targetId: target.importJobId,
      limit: 100,
    }),
  })));
  const derivedItems: ObjectAttachmentItem[] = [];
  const seenSourceAttachmentIds = new Set<string>();
  for (const { target, attachments } of sourceGroups) {
    for (const attachment of attachments) {
      if (linkedAttachmentIds.has(attachment.id) || seenSourceAttachmentIds.has(attachment.id)) continue;
      seenSourceAttachmentIds.add(attachment.id);
      derivedItems.push({
        attachment,
        link: {
          id: `import-source:${target.id}:${attachment.id}`,
          tenantId: input.tenantId,
          attachmentId: attachment.id,
          targetType: input.targetType,
          targetId: input.targetId,
          category: inferObjectAttachmentCategory({ fileName: attachment.fileName, documentType: target.documentType }),
          sourceImportJobId: target.importJobId,
          createdByUserId: target.userId,
          createdAt: target.createdAt,
        },
      });
    }
  }
  return [...linkedItems, ...derivedItems].sort((left, right) => right.attachment.uploadedAt.getTime() - left.attachment.uploadedAt.getTime());
}
