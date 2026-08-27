import {
  listAttachments,
  listBrokerageCasesForContext,
  listGeneratedOutputsForTenant,
  getClientDetail,
  getDefaultUser,
  listImportJobs,
  listClients,
  listClientsForContext,
  listPropertiesForContext,
  listOutputTemplateVersions,
  listQuoteFormData,
  listQuotations,
  type AttachmentTargetType,
  type Client,
  type GeneratedOutput,
  type Task,
} from "@/lib/data";
import { cache } from "react";
import type { Locale } from "@/lib/locale";
import type { LifecycleFilter } from "@/lib/record-lifecycle";
import { getOutputDocLabel, type OutputDocType } from "@/lib/output-doc";
import type { RequestContext } from "@/lib/visibility-resolver";
import {
  extractPartyProfileFromNotes,
  getPartyProfileRoleLabel,
} from "@/lib/party-profile";
import {
  localizeDemoClient,
  localizeDemoImportJob,
  localizeDemoProperty,
  localizeDemoQuotation,
  localizeDemoText,
} from "@/lib/demo-localization";

export type HubQueryContext = {
  userId?: string;
  tenantId?: string;
  lifecycleStatus?: LifecycleFilter;
  requestContext?: RequestContext;
  canUpdateRecords?: boolean;
  canArchiveRecords?: boolean;
};

export type HubOverview = {
  propertyCount: number;
  partyCount: number;
  contractCount: number;
  serviceRequestCount: number;
  pendingServiceRequestCount: number;
  generatedOutputCount: number;
};

export type HubPropertyItem = {
  id: string;
  name: string;
  area: string;
  listingPrice: number;
  managementFee: number;
  repairFee: number;
  /** Raw nullable fee values for List Report rendering; legacy consumers use numeric fields above. */
  managementFeeValue: number | null;
  repairFeeValue: number | null;
  attachmentCount: number;
  status: "active" | "archived";
  canWrite: boolean;
  canArchive: boolean;
  readOnly: boolean;
  readOnlyReason?: "company_read" | "owner_read_only";
};

export type HubPartyItem = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  partyType: "individual" | "corporate";
  /**
   * Explicit party-profile metadata, kept separate from the legacy
   * compatibility values consumed by other hub surfaces.
   */
  explicitPartyType?: "individual" | "corporate";
  roles: string[];
  explicitRoles: string[];
  partyTypeSource: "explicit" | "compatibility";
  rolesSource: "explicit" | "compatibility";
  relatedPropertyHint?: string;
  contractCount: number;
  status: "active" | "archived";
  canWrite: boolean;
  canArchive: boolean;
  readOnly: boolean;
  readOnlyReason?: "company_read" | "owner_read_only";
};

export type HubContractItem = {
  id: string;
  clientId: string;
  contractType: "sell" | "rent" | "pm" | "agent";
  contractNumber: string;
  contractValue: number;
  relatedProperty?: string;
  relatedParty?: string;
  signedAt?: Date;
  effectiveUntil?: Date;
  status: "draft" | "active" | "closed";
};

export type HubServiceRequestItem = {
  id: string;
  clientId?: string;
  title: string;
  relatedProperty?: string;
  relatedParty?: string;
  status: "open" | "done" | "canceled";
  occurredAt?: Date;
  completedAt?: Date;
  cost?: number;
};

export type HubImportJobItem = {
  id: string;
  sourceType: "excel" | "pdf" | "scan" | "manual";
  title: string;
  targetEntity: "properties" | "parties" | "contracts" | "service_requests";
  status: "queued" | "processing" | "mapped" | "completed" | "failed";
  notes?: string;
  mappingJson?: Record<string, string>;
  validationMessage?: string;
  createdAt: Date;
};

export type HubGeneratedOutputItem = {
  id: string;
  actorId: string;
  outputType: GeneratedOutput["outputType"];
  outputFormat: "pdf" | "docx";
  language: Locale;
  title: string;
  documentNumber: string;
  propertyId?: string;
  partyId?: string;
  relatedProperty?: string;
  relatedParty?: string;
  relatedContractHint: string;
  sourceQuoteId?: string;
  generatedAt: Date;
  templateVersionId?: string;
  templateVersionLabel?: string;
};

function getGeneratedOutputTypeLabel(locale: Locale, outputType: GeneratedOutput["outputType"]) {
  if (outputType === "guarantee_application") {
    return tr(locale, { ja: "保証会社申込書", zh: "保证公司申请书", ko: "보증회사 신청서" });
  }
  return getOutputDocLabel(locale, outputType as OutputDocType);
}

export type HubAttachmentItem = {
  id: string;
  fileName: string;
  fileType?: string;
  fileSizeBytes?: number;
  storagePath?: string;
  targetType: AttachmentTargetType;
  targetId: string;
  targetLabel: string;
  uploadedAt: Date;
};

export type HubSearchEntity = "case" | "property" | "party";

export type HubSearchItem = {
  id: string;
  entity: HubSearchEntity;
  title: string;
  subtitle?: string;
  href: string;
};

function tr(locale: Locale, message: { ja: string; zh: string; ko: string }): string {
  if (locale === "zh") return message.zh;
  if (locale === "ko") return message.ko;
  return message.ja;
}

function mapPartyType(client: Client): "individual" | "corporate" {
  const profile = extractPartyProfileFromNotes(client.notes);
  if (profile.type) return profile.type;
  const name = client.name.trim();
  if (name.includes("株式会社") || name.includes("有限会社") || name.endsWith("法人")) {
    return "corporate";
  }
  return "individual";
}

function buildRoleTags(client: Client, locale: Locale): string[] {
  const profile = extractPartyProfileFromNotes(client.notes);
  if (profile.role) {
    return [getPartyProfileRoleLabel(profile.role, locale)];
  }
  const roles: string[] = [];
  roles.push(
    client.purpose === "self_use"
      ? tr(locale, { ja: "居住用検討者", zh: "自住意向", ko: "실거주 검토" })
      : tr(locale, { ja: "投資検討者", zh: "投资意向", ko: "투자 검토" })
  );
  if (client.stage === "quoted" || client.stage === "viewing" || client.stage === "negotiating") {
    roles.push(tr(locale, { ja: "買主候補", zh: "买方候选", ko: "매수 후보" }));
  }
  if (client.stage === "won") {
    roles.push(tr(locale, { ja: "成約済み", zh: "已成交", ko: "계약 완료" }));
  }
  return roles;
}

function mapServiceRequestStatus(taskStatus: Task["status"]): HubServiceRequestItem["status"] {
  if (taskStatus === "done") return "done";
  if (taskStatus === "canceled") return "canceled";
  return "open";
}

function mapContractStatus(stage: string): HubContractItem["status"] {
  if (stage === "won") return "closed";
  if (stage === "quoted" || stage === "viewing" || stage === "negotiating") return "active";
  return "draft";
}

async function resolveHubContext(
  context: HubQueryContext = {},
): Promise<{ userId: string; tenantId?: string; lifecycleStatus?: LifecycleFilter } | null> {
  if (context.userId) {
    return { userId: context.userId, tenantId: context.tenantId, lifecycleStatus: context.lifecycleStatus };
  }
  const user = await getDefaultUser();
  return user ? { userId: user.id, tenantId: context.tenantId, lifecycleStatus: context.lifecycleStatus } : null;
}

export async function getHubOverview(context: HubQueryContext = {}): Promise<HubOverview> {
  const properties = await listHubProperties("ja", context);
  const parties = await listHubParties("ja", context);
  const contracts = await listHubContracts("ja", context);
  const serviceRequests = await listHubServiceRequests(context);
  const outputs = await listHubGeneratedOutputs("ja", context);

  return {
    propertyCount: properties.length,
    partyCount: parties.length,
    contractCount: contracts.length,
    serviceRequestCount: serviceRequests.length,
    pendingServiceRequestCount: serviceRequests.filter((item) => item.status === "open").length,
    generatedOutputCount: outputs.length,
  };
}

export async function listHubProperties(locale: Locale = "ja", context: HubQueryContext = {}): Promise<HubPropertyItem[]> {
  if (context.requestContext) {
    const visible = await listPropertiesForContext({
      context: context.requestContext,
      lifecycleStatus: context.lifecycleStatus,
    });
    return visible.map(({ property: rawProperty, resolution }) => {
      const property = localizeDemoProperty(locale, rawProperty);
      const propertyArea = typeof property.area === "string" && property.area.trim() ? property.area : "";
      const canWrite = resolution.canWrite && context.canUpdateRecords !== false;
      return {
        id: property.id,
        name: property.name,
        area: propertyArea,
        listingPrice: property.listingPrice,
        managementFee: property.managementFee ?? 0,
        repairFee: property.repairFee ?? 0,
        managementFeeValue: property.managementFee ?? null,
        repairFeeValue: property.repairFee ?? null,
        attachmentCount: 0,
        status: property.lifecycleStatus ?? "active",
        canWrite,
        canArchive: canWrite && context.canArchiveRecords === true,
        readOnly: !canWrite,
        readOnlyReason: resolution.outcome === "company_read" ? "company_read" : "owner_read_only",
      };
    });
  }
  const resolved = await resolveHubContext(context);
  const attachmentsPromise = resolved
    ? listAttachments({ userId: resolved.userId, tenantId: resolved.tenantId, targetType: "property", limit: 500 })
    : Promise.resolve([]);
  const [{ properties }, attachments] = await Promise.all([
    listQuoteFormData(resolved?.tenantId, resolved?.lifecycleStatus),
    attachmentsPromise,
  ]);
  const attachmentCountMap = attachments.reduce((map, item) => {
    map.set(item.targetId, (map.get(item.targetId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  return properties.map((rawProperty) => {
    const property = localizeDemoProperty(locale, rawProperty);
    const propertyArea = typeof property.area === "string" && property.area.trim() ? property.area : "";
    return {
      id: property.id,
      name: property.name,
      area: propertyArea,
      listingPrice: property.listingPrice,
      managementFee: property.managementFee ?? 0,
      repairFee: property.repairFee ?? 0,
      managementFeeValue: property.managementFee ?? null,
      repairFeeValue: property.repairFee ?? null,
      attachmentCount: attachmentCountMap.get(property.id) ?? 0,
      status: property.lifecycleStatus ?? "active",
      canWrite: true,
      canArchive: true,
      readOnly: false,
    };
  });
}

const resolveHubParties = cache(async (
  locale: Locale,
  userId: string,
  tenantId?: string,
  lifecycleStatus?: LifecycleFilter,
): Promise<HubPartyItem[]> => {
  const [clients, quotes] = await Promise.all([
    listClients(userId, { sort: "recent_contact", tenantId, lifecycleStatus }),
    listQuotations(undefined, tenantId),
  ]);
  const countMap = new Map<string, number>();
  quotes.forEach((quote) => {
    countMap.set(quote.clientId, (countMap.get(quote.clientId) ?? 0) + 1);
  });

  return clients.map((rawClient) => {
    const client = localizeDemoClient(locale, rawClient);
    const profile = extractPartyProfileFromNotes(client.notes);
    return {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      partyType: mapPartyType(client),
      explicitPartyType: profile.type,
      roles: buildRoleTags(client, locale),
      explicitRoles: profile.role ? [getPartyProfileRoleLabel(profile.role, locale)] : [],
      partyTypeSource: profile.type ? "explicit" : "compatibility",
      rolesSource: profile.role ? "explicit" : "compatibility",
      relatedPropertyHint: client.preferredArea,
      contractCount: countMap.get(client.id) ?? 0,
      status: client.lifecycleStatus ?? "active",
      canWrite: true,
      canArchive: true,
      readOnly: false,
    };
  });
});

function mapVisibleHubParty(
  locale: Locale,
  rawClient: Client,
  canWrite: boolean,
  canArchive: boolean,
  readOnlyReason: HubPartyItem["readOnlyReason"],
  contractCount: number,
): HubPartyItem {
  const client = localizeDemoClient(locale, rawClient);
  const profile = extractPartyProfileFromNotes(client.notes);
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
    partyType: mapPartyType(client),
    explicitPartyType: profile.type,
    roles: buildRoleTags(client, locale),
    explicitRoles: profile.role ? [getPartyProfileRoleLabel(profile.role, locale)] : [],
    partyTypeSource: profile.type ? "explicit" : "compatibility",
    rolesSource: profile.role ? "explicit" : "compatibility",
    relatedPropertyHint: client.preferredArea,
    contractCount,
    status: client.lifecycleStatus ?? "active",
    canWrite,
    canArchive,
    readOnly: !canWrite,
    readOnlyReason,
  };
}

export async function listHubParties(locale: Locale = "ja", context: HubQueryContext = {}): Promise<HubPartyItem[]> {
  if (context.requestContext) {
    const visible = await listClientsForContext({
      context: context.requestContext,
      filter: { sort: "recent_contact", lifecycleStatus: context.lifecycleStatus },
    });
    return visible.map((item) => {
      const canWrite = item.resolution.canWrite && context.canUpdateRecords !== false;
      const canArchive = canWrite && context.canArchiveRecords === true;
      const readOnlyReason = canWrite
        ? undefined
        : item.resolution.outcome === "company_read"
          ? "company_read"
          : "owner_read_only";
      return mapVisibleHubParty(locale, item.client, canWrite, canArchive, readOnlyReason, item._count.quotations);
    });
  }
  const resolved = await resolveHubContext(context);
  if (!resolved) return [];
  return resolveHubParties(locale, resolved.userId, resolved.tenantId, resolved.lifecycleStatus);
}

export async function listHubContracts(locale: Locale = "ja", context: HubQueryContext = {}): Promise<HubContractItem[]> {
  const quotes = (await listQuotations(undefined, context.tenantId)).map((item) => localizeDemoQuotation(locale, item));
  const contractPrefix = tr(locale, {
    ja: "売買",
    zh: "买卖",
    ko: "매매",
  });
  return quotes.map((quote) => ({
    id: quote.id,
    clientId: quote.clientId,
    contractType: "sell",
    contractNumber: `${contractPrefix}-${quote.id.toUpperCase()}`,
    contractValue: quote.listingPrice,
    relatedProperty: quote.property?.name,
    relatedParty: quote.client?.name,
    signedAt: quote.createdAt,
    effectiveUntil: undefined,
    status: mapContractStatus(quote.client?.stage ?? ""),
  }));
}

export async function listHubServiceRequests(context: HubQueryContext = {}): Promise<HubServiceRequestItem[]> {
  const resolved = await resolveHubContext(context);
  if (!resolved) return [];
  const clients = await listClients(resolved.userId, { sort: "follow_up", tenantId: resolved.tenantId });
  const details = await Promise.all(clients.map((client) => getClientDetail(client.id, resolved.tenantId)));
  const items: HubServiceRequestItem[] = [];

  details.forEach((detail) => {
    if (!detail) return;
    detail.tasks.forEach((task) => {
      items.push({
        id: task.id,
        clientId: detail.id,
        title: task.title,
        relatedProperty: detail.preferredArea,
        relatedParty: detail.name,
        status: mapServiceRequestStatus(task.status),
        occurredAt: task.createdAt,
        completedAt: task.status === "done" ? new Date() : undefined,
        cost: undefined,
      });
    });
  });

  return items.sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0));
}

export async function listHubImportJobs(context: HubQueryContext = {}, locale: Locale = "ja"): Promise<HubImportJobItem[]> {
  const resolved = await resolveHubContext(context);
  if (!resolved) return [];
  return (await listImportJobs(resolved.userId, 100, resolved.tenantId)).map((item) => localizeDemoImportJob(locale, item));
}

export async function listHubGeneratedOutputs(
  locale: Locale = "ja",
  context: HubQueryContext = {},
): Promise<HubGeneratedOutputItem[]> {
  if (!context.requestContext) return [];
  {
    const [visibleCases, rawGeneratedOutputs, templateVersions] = await Promise.all([
      listBrokerageCasesForContext({ context: context.requestContext, limit: 500 }),
      listGeneratedOutputsForTenant({ tenantId: context.requestContext.tenantId, limit: 200 }),
      listOutputTemplateVersions(context.requestContext.userId, 50, context.requestContext.tenantId),
    ]);
    const visibleCaseResolution = new Map(visibleCases.flatMap((entry) => entry.brokerageCase ? [[entry.brokerageCase.id, entry.resolution] as const] : []));
    const visibleCaseIds = new Set(visibleCaseResolution.keys());
    const versionLabelMap = new Map(templateVersions.map((v) => [v.id, v.versionLabel]));
    return rawGeneratedOutputs
      .filter((item) => Boolean(item.caseId && visibleCaseIds.has(item.caseId)))
      .filter((item) => item.fileStatus !== "unavailable")
      .filter((item) => !["property_overview", "proposal", "estimate_sheet", "funding_plan", "assumption_memo"].includes(item.outputType))
      .map((item) => {
        const snapshot = item.inputDataSnapshot;
        const snapshotValue = (...paths: string[]) => {
          for (const path of paths) {
            let value: unknown = snapshot;
            for (const part of path.split(".")) value = value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
            if (value !== undefined && value !== null && value !== "") return String(value);
          }
          return undefined;
        };
        const ownerWrite = item.caseId ? visibleCaseResolution.get(item.caseId)?.canWrite === true : false;
        const relatedProperty = ownerWrite ? snapshotValue("quote.property.name", "property.name") : undefined;
        const relatedParty = ownerWrite ? snapshotValue("quote.client.name", "client.name", "applicant.name") : undefined;
        const title = ownerWrite
          ? localizeDemoText(locale, item.title) || `${getGeneratedOutputTypeLabel(locale, item.outputType)} - ${relatedParty ?? relatedProperty ?? "N/A"}`
          : getGeneratedOutputTypeLabel(locale, item.outputType);
        return {
          id: item.id,
          actorId: item.actorId,
          outputType: item.outputType,
          outputFormat: item.outputFormat,
          language: item.language,
          title,
          documentNumber: item.documentNumber,
          propertyId: ownerWrite ? item.propertyId : undefined,
          partyId: ownerWrite ? item.partyId : undefined,
          relatedProperty,
          relatedParty,
          relatedContractHint: ownerWrite && item.sourceQuoteId ? `${tr(locale, { ja: "売買", zh: "买卖", ko: "매매" })}-${item.sourceQuoteId.toUpperCase()}` : "-",
          sourceQuoteId: ownerWrite ? item.sourceQuoteId : undefined,
          generatedAt: item.generatedAt,
          templateVersionId: item.templateVersionId,
          templateVersionLabel: item.templateVersionId ? versionLabelMap.get(item.templateVersionId) : undefined,
        };
      })
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
      .slice(0, 30);
  }
  return [];
}

function getAttachmentTargetLabel(locale: Locale): Record<AttachmentTargetType, string> {
  return {
    property: tr(locale, { ja: "物件", zh: "物件", ko: "매물" }),
    party: tr(locale, { ja: "関係者", zh: "主体", ko: "관계자" }),
    contract: tr(locale, { ja: "契約", zh: "合同", ko: "계약" }),
    service_request: tr(locale, { ja: "対応履歴", zh: "跟进记录", ko: "후속 기록" }),
    import_job: tr(locale, { ja: "読取資料", zh: "读取资料", ko: "읽은 자료" }),
    quote: tr(locale, { ja: "提案", zh: "提案", ko: "제안" }),
    guarantee_blank_form: tr(locale, { ja: "保証会社の空白書式", zh: "保证公司空白表格", ko: "보증회사 빈 양식" }),
    guarantee_generated_output: tr(locale, { ja: "保証会社申込書", zh: "保证公司申请书", ko: "보증회사 신청서" }),
  };
}

export async function listHubAttachments(
  locale: Locale = "ja",
  limit = 30,
  context: HubQueryContext = {},
): Promise<HubAttachmentItem[]> {
  const resolved = await resolveHubContext(context);
  if (!resolved) return [];
  const list = await listAttachments({ userId: resolved.userId, tenantId: resolved.tenantId, limit });
  const attachmentTargetLabel = getAttachmentTargetLabel(locale);
  return list.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    fileType: item.fileType,
    fileSizeBytes: item.fileSizeBytes,
    storagePath: item.storagePath,
    targetType: item.targetType,
    targetId: item.targetId,
    targetLabel: attachmentTargetLabel[item.targetType],
    uploadedAt: item.uploadedAt,
  }));
}

export async function listHubOutputsByTemplateVersion(
  versionId: string,
  locale: Locale = "ja",
  context: HubQueryContext = {},
): Promise<HubGeneratedOutputItem[]> {
  const all = await listHubGeneratedOutputs(locale, context);
  return all.filter((o) => o.templateVersionId === versionId);
}

export async function searchHubItems(
  locale: Locale = "ja",
  query = "",
  limitPerEntity = 5,
  context: HubQueryContext = {},
): Promise<HubSearchItem[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  if (!context.requestContext) return [];

  const [cases, properties, parties] = await Promise.all([
    listBrokerageCasesForContext({ context: context.requestContext, lifecycleStatus: context.lifecycleStatus ?? "active" }),
    listHubProperties(locale, context),
    listHubParties(locale, context),
  ]);

  const includes = (...values: Array<string | undefined>) =>
    values.some((value) => value?.toLowerCase().includes(normalized));

  const caseItems = cases
    .flatMap((item) => {
      if (!item.brokerageCase) return [];
      const title = item.resolution.outcome === "company_read"
        ? tr(locale, { ja: "案件", zh: "案件", ko: "안건" })
        : item.brokerageCase.caseTitle;
      const searchableValues = item.resolution.outcome === "company_read"
        ? [title, item.brokerageCase.id]
        : [title, item.brokerageCase.id];
      return includes(...searchableValues)
        ? [{
            id: item.brokerageCase.id,
            entity: "case" as const,
            title,
            subtitle: item.brokerageCase.status,
            href: `/cases/${encodeURIComponent(item.brokerageCase.id)}`,
          }]
        : [];
    })
    .slice(0, limitPerEntity)
    .map<HubSearchItem>((item) => item);

  const propertyItems = properties
    .filter((item) => includes(item.name, item.area))
    .slice(0, limitPerEntity)
    .map<HubSearchItem>((item) => ({
      id: item.id,
      entity: "property",
      title: item.name,
      subtitle: item.area,
      href: `/properties?focus=${item.id}`,
    }));

  const partyItems = parties
    .filter((item) => includes(item.name, item.phone, item.email, item.relatedPropertyHint))
    .slice(0, limitPerEntity)
    .map<HubSearchItem>((item) => ({
      id: item.id,
      entity: "party",
      title: item.name,
      subtitle: item.phone,
      href: `/parties?focus=${item.id}`,
    }));

  return [...caseItems, ...propertyItems, ...partyItems];
}
