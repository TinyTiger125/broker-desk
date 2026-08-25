import {
  getAttachmentByIdForTenant,
  getBrokerageCaseByIdForContext,
  getGeneratedOutputByIdForTenant,
  listBrokerageCasesForContext,
  listGeneratedOutputsForTenant,
  resolveClientVisibilityForContext,
  resolvePropertyVisibilityForContext,
  type Attachment,
  type BrokerageCase,
  type GeneratedOutput,
  listQuotationsForContext,
} from "@/lib/data";
import type { RequestContext, VisibilityResolution } from "@/lib/visibility-resolver";

export type W93ParentType = "case" | "party" | "property";

export type W93SourceProvenance = {
  partyIds: string[];
  propertyIds: string[];
  quoteIds: string[];
};

export async function resolveW93Parent(
  context: RequestContext,
  parentType: W93ParentType,
  parentId: string,
): Promise<VisibilityResolution> {
  if (!parentId.trim()) return { outcome: "not_accessible", canRead: false, canWrite: false };
  if (parentType === "case") return (await getBrokerageCaseByIdForContext({ context, caseId: parentId })).resolution;
  if (parentType === "party") return (await resolveClientVisibilityForContext({ context, clientId: parentId })).resolution;
  return (await resolvePropertyVisibilityForContext({ context, propertyId: parentId })).resolution;
}

function attachmentParentType(targetType: string): W93ParentType | null {
  if (targetType === "case" || targetType === "brokerage_case") return "case";
  if (targetType === "party") return "party";
  if (targetType === "property") return "property";
  return null;
}

/** Resolves the unique parent before exposing any attachment metadata or bytes. */
export async function getW93AttachmentForContext(context: RequestContext, attachmentId: string): Promise<Attachment | null> {
  const attachment = await getAttachmentByIdForTenant({ tenantId: context.tenantId, id: attachmentId });
  if (!attachment) return null;
  const parentType = attachmentParentType(attachment.targetType);
  if (!parentType) return null;
  const parentResolution = await resolveW93Parent(context, parentType, attachment.targetId);
  return parentResolution.canRead ? attachment : null;
}

/** History is indexed by case; current case visibility is checked before metadata is returned. */
export async function getW93GeneratedOutputForContext(context: RequestContext, outputId: string): Promise<GeneratedOutput | null> {
  const output = await getGeneratedOutputByIdForTenant({ tenantId: context.tenantId, id: outputId });
  if (!output?.caseId) return null;
  const parent = await getBrokerageCaseByIdForContext({ context, caseId: output.caseId });
  return parent.resolution.canRead && await areGeneratedOutputSourcesReadable(context, output) ? output : null;
}

export async function listW93GeneratedOutputsForContext(context: RequestContext): Promise<GeneratedOutput[]> {
  const [visibleCases, outputs] = await Promise.all([
    listBrokerageCasesForContext({ context, limit: 500 }),
    listGeneratedOutputsForTenant({ tenantId: context.tenantId, limit: 200 }),
  ]);
  const visibleCaseIds = new Set(visibleCases.map((entry) => entry.brokerageCase?.id).filter(Boolean));
  const candidates = outputs.filter((output) => output.caseId && visibleCaseIds.has(output.caseId));
  const readable = await Promise.all(candidates.map(async (output) => (await areGeneratedOutputSourcesReadable(context, output)) ? output : null));
  return readable.flatMap((output) => output ? [output] : []);
}

export async function areGeneratedOutputSourcesReadable(context: RequestContext, output: GeneratedOutput): Promise<boolean> {
  if (!output.caseId) return false;
  const resolvedCase = await getBrokerageCaseByIdForContext({ context, caseId: output.caseId });
  const brokerageCase = resolvedCase.brokerageCase;
  if (!brokerageCase || !resolvedCase.resolution.canRead) return false;

  const snapshotSources = parseSnapshotSourceProvenance(output.inputDataSnapshot);
  if (!snapshotSources) return false;
  if (!snapshotSources.hasExplicitProvenance) {
    return output.sourceProvenanceVersion === "legacy-v1"
      && resolvedCase.resolution.canWrite
      && isTrustedLegacyGuaranteeOutput(output);
  }
  if (output.sourceProvenanceVersion && output.sourceProvenanceVersion !== "w93-v1") return false;

  for (const sourceId of [output.partyId, output.propertyId, output.sourceQuoteId, output.quoteId]) {
    if (sourceId !== undefined && !explicitId(sourceId)) return false;
  }

  const partyIds = new Set([...snapshotSources.provenance.partyIds, explicitId(output.partyId)].filter((value): value is string => Boolean(value)));
  const propertyIds = new Set([...snapshotSources.provenance.propertyIds, explicitId(output.propertyId)].filter((value): value is string => Boolean(value)));
  const quoteIds = new Set([...snapshotSources.provenance.quoteIds, explicitId(output.sourceQuoteId), explicitId(output.quoteId)].filter((value): value is string => Boolean(value)));
  const [partyChecks, propertyChecks, visibleQuotes] = await Promise.all([
    Promise.all([...partyIds].map((partyId) => resolveClientVisibilityForContext({ context, clientId: partyId })),),
    Promise.all([...propertyIds].map((propertyId) => resolvePropertyVisibilityForContext({ context, propertyId })),),
    quoteIds.size > 0 ? listQuotationsForContext({ context, limit: 500 }) : Promise.resolve([]),
  ]);
  if (!partyChecks.every((result) => result.resolution.canRead)) return false;
  if (!propertyChecks.every((result) => result.resolution.canRead)) return false;
  const visibleQuoteIds = new Set(visibleQuotes.map((quote) => quote.id));
  return [...quoteIds].every((quoteId) => visibleQuoteIds.has(quoteId));
}

function isTrustedLegacyGuaranteeOutput(output: GeneratedOutput): boolean {
  return output.outputType === "guarantee_application"
    && output.outputFormat === "pdf"
    && output.fileStatus === "ready"
    && Boolean(output.fileAttachmentId)
    && Boolean(output.fileSha256)
    && Number.isInteger(output.fileSizeBytes)
    && Number(output.fileSizeBytes) > 0
    && output.fileMimeType === "application/pdf"
    && Boolean(output.blankFormVersionId)
    && Boolean(output.companyMaskVersionId)
    && Boolean(output.fieldCatalogVersion)
    && Boolean(output.previewConfirmationId)
    && Boolean(output.caseInputSnapshotHash)
    && Boolean(output.templateId)
    && Boolean(output.documentNumber)
    && Boolean(output.inputDataSnapshot);
}

export async function assertGeneratedOutputSourcesReadable(context: RequestContext, output: GeneratedOutput): Promise<void> {
  if (!(await areGeneratedOutputSourcesReadable(context, output))) throw new Error("output_sources_not_readable");
}

function explicitId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const EXPLICIT_SOURCE_KEYS = ["__primaryPartyId", "__primaryPropertyId", "__primaryQuoteId", "__quoteId"] as const;

function hasInvalidExplicitSource(snapshot: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(snapshot, key) && !explicitId(snapshot[key]);
}

function hasInvalidExplicitSources(snapshot: Record<string, unknown>): boolean {
  return EXPLICIT_SOURCE_KEYS.some((key) => hasInvalidExplicitSource(snapshot, key));
}

function parseIdArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map(explicitId);
  return ids.every(Boolean) ? [...new Set(ids as string[])] : null;
}

function parseSnapshotSourceProvenance(snapshot: Record<string, unknown> | undefined): { provenance: W93SourceProvenance; hasExplicitProvenance: boolean } | null {
  if (!snapshot) return { provenance: { partyIds: [], propertyIds: [], quoteIds: [] }, hasExplicitProvenance: false };
  if (hasInvalidExplicitSources(snapshot)) return null;
  const raw = snapshot.__w93SourceIds;
  if (raw !== undefined) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const source = raw as Record<string, unknown>;
    const partyIds = parseIdArray(source.partyIds);
    const propertyIds = parseIdArray(source.propertyIds);
    const quoteIds = parseIdArray(source.quoteIds);
    if (!partyIds || !propertyIds || !quoteIds) return null;
    return { provenance: { partyIds, propertyIds, quoteIds }, hasExplicitProvenance: true };
  }
  const partyIds = explicitId(snapshot.__primaryPartyId) ? [explicitId(snapshot.__primaryPartyId)!] : [];
  const propertyIds = explicitId(snapshot.__primaryPropertyId) ? [explicitId(snapshot.__primaryPropertyId)!] : [];
  const quoteId = explicitId(snapshot.__primaryQuoteId) ?? explicitId(snapshot.__quoteId);
  return { provenance: { partyIds, propertyIds, quoteIds: quoteId ? [quoteId] : [] }, hasExplicitProvenance: false };
}

export function getW93SourceProvenance(brokerageCase: BrokerageCase): W93SourceProvenance {
  const confirmed = brokerageCase.confirmedDataJson ?? {};
  if (hasInvalidExplicitSources(confirmed) || (brokerageCase.primaryPropertyId !== undefined && !explicitId(brokerageCase.primaryPropertyId))) {
    throw new Error("case_source_provenance_invalid");
  }
  const partyIds = explicitId(confirmed.__primaryPartyId) ? [explicitId(confirmed.__primaryPartyId)!] : [];
  const propertyIds = [explicitId(brokerageCase.primaryPropertyId), explicitId(confirmed.__primaryPropertyId)].filter((value): value is string => Boolean(value));
  const quoteIds = [explicitId(confirmed.__primaryQuoteId), explicitId(confirmed.__quoteId)].filter((value): value is string => Boolean(value));
  return {
    partyIds: [...new Set(partyIds)],
    propertyIds: [...new Set(propertyIds)],
    quoteIds: [...new Set(quoteIds)],
  };
}

export function withW93SourceProvenance(brokerageCase: BrokerageCase): Record<string, unknown> {
  return {
    ...(brokerageCase.confirmedDataJson ?? {}),
    __w93SourceIds: getW93SourceProvenance(brokerageCase),
  };
}

/** Generation must re-check every explicit source recorded on the case. */
export async function areCaseSourcesReadable(context: RequestContext, brokerageCase: BrokerageCase): Promise<boolean> {
  const confirmed = brokerageCase.confirmedDataJson ?? {};
  if (hasInvalidExplicitSources(confirmed)) return false;
  if (brokerageCase.primaryPropertyId !== undefined && !explicitId(brokerageCase.primaryPropertyId)) return false;
  const partyIds = new Set<string>();
  const propertyIds = new Set<string>();
  const quoteIds = new Set<string>();
  const partyId = explicitId(confirmed.__primaryPartyId);
  const confirmedPropertyId = explicitId(confirmed.__primaryPropertyId);
  const casePropertyId = explicitId(brokerageCase.primaryPropertyId);
  const primaryQuoteId = explicitId(confirmed.__primaryQuoteId);
  const quoteId = explicitId(confirmed.__quoteId);
  if (partyId) partyIds.add(partyId);
  if (confirmedPropertyId) propertyIds.add(confirmedPropertyId);
  if (casePropertyId) propertyIds.add(casePropertyId);
  if (primaryQuoteId) quoteIds.add(primaryQuoteId);
  if (quoteId) quoteIds.add(quoteId);
  const checks = await Promise.all([
    ...[...partyIds].map((clientId) => resolveClientVisibilityForContext({ context, clientId })),
    ...[...propertyIds].map((propertyId) => resolvePropertyVisibilityForContext({ context, propertyId })),
  ]);
  if (!checks.every((result) => !result || result.resolution.canRead)) return false;
  if (quoteIds.size === 0) return true;
  const visibleQuotes = await listQuotationsForContext({ context, limit: 500 });
  const visibleQuoteIds = new Set(visibleQuotes.map((quote) => quote.id));
  return [...quoteIds].every((quoteId) => visibleQuoteIds.has(quoteId));
}

export async function assertCaseSourcesReadable(context: RequestContext, brokerageCase: BrokerageCase): Promise<void> {
  if (!(await areCaseSourcesReadable(context, brokerageCase))) throw new Error("case_sources_not_readable");
}

export function snapshotValue(snapshot: Record<string, unknown> | undefined, ...paths: string[]): unknown {
  if (!snapshot) return undefined;
  for (const path of paths) {
    const parts = path.split(".");
    let value: unknown = snapshot;
    for (const part of parts) {
      if (!value || typeof value !== "object") {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[part];
    }
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}
