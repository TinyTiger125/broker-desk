import {
  listAttachments,
  listGeneratedOutputs,
  getClientDetail,
  getDefaultUser,
  listImportJobs,
  listClients,
  listOutputTemplateVersions,
  listQuoteFormData,
  listQuotations,
  type AttachmentTargetType,
  type Client,
  type GeneratedOutput,
  type Task,
} from "@/lib/data";
import type { Locale } from "@/lib/locale";
import { getOutputDocLabel, type OutputDocType } from "@/lib/output-doc";
import {
  extractPartyProfileFromNotes,
  getPartyProfileRoleLabel,
} from "@/lib/party-profile";
import {
  localizeDemoClient,
  localizeDemoGeneratedOutput,
  localizeDemoImportJob,
  localizeDemoProperty,
  localizeDemoQuotation,
  localizeDemoText,
} from "@/lib/demo-localization";

export type HubQueryContext = {
  userId?: string;
  tenantId?: string;
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
  attachmentCount: number;
  status: "active" | "archived";
};

export type HubPartyItem = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  partyType: "individual" | "corporate";
  roles: string[];
  relatedPropertyHint?: string;
  contractCount: number;
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
  status: "queued" | "mapped" | "completed";
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

export type HubSearchEntity = "property" | "party" | "contract" | "service_request" | "output";

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

async function resolveHubContext(context: HubQueryContext = {}): Promise<{ userId: string; tenantId?: string } | null> {
  if (context.userId) {
    return { userId: context.userId, tenantId: context.tenantId };
  }
  const user = await getDefaultUser();
  return user ? { userId: user.id, tenantId: context.tenantId } : null;
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
  const resolved = await resolveHubContext(context);
  const attachments = resolved
    ? await listAttachments({ userId: resolved.userId, tenantId: resolved.tenantId, targetType: "property", limit: 500 })
    : [];
  const attachmentCountMap = attachments.reduce((map, item) => {
    map.set(item.targetId, (map.get(item.targetId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const { properties } = await listQuoteFormData(resolved?.tenantId);
  return properties.map((rawProperty) => {
    const property = localizeDemoProperty(locale, rawProperty);
    const propertyArea = "area" in property && typeof property.area === "string" ? property.area : undefined;
    return {
    id: property.id,
    name: property.name,
    area: propertyArea
      ? propertyArea
      : property.name.includes("区")
        ? property.name
        : tr(locale, { ja: "未設定", zh: "未设置", ko: "미설정" }),
    listingPrice: property.listingPrice,
    managementFee: property.managementFee ?? 0,
    repairFee: property.repairFee ?? 0,
    attachmentCount: attachmentCountMap.get(property.id) ?? 0,
    status: "active",
  };
  });
}

export async function listHubParties(locale: Locale = "ja", context: HubQueryContext = {}): Promise<HubPartyItem[]> {
  const resolved = await resolveHubContext(context);
  if (!resolved) return [];
  const clients = await listClients(resolved.userId, { sort: "recent_contact", tenantId: resolved.tenantId });
  const quotes = await listQuotations(undefined, resolved.tenantId);
  const countMap = new Map<string, number>();
  quotes.forEach((quote) => {
    countMap.set(quote.clientId, (countMap.get(quote.clientId) ?? 0) + 1);
  });

  return clients.map((rawClient) => {
    const client = localizeDemoClient(locale, rawClient);
    return {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      partyType: mapPartyType(client),
      roles: buildRoleTags(client, locale),
      relatedPropertyHint: client.preferredArea,
      contractCount: countMap.get(client.id) ?? 0,
    };
  });
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
    relatedParty: quote.client.name,
    signedAt: quote.createdAt,
    effectiveUntil: undefined,
    status: mapContractStatus(quote.client.stage),
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
  const resolved = await resolveHubContext(context);
  if (!resolved) return [];
  const [rawQuotes, rawProperties, parties, templateVersions] = await Promise.all([
    listQuotations(100, resolved.tenantId),
    listQuoteFormData(resolved.tenantId),
    listHubParties(locale, resolved),
    listOutputTemplateVersions(resolved.userId, 50, resolved.tenantId),
  ]);
  const quotes = rawQuotes.map((item) => localizeDemoQuotation(locale, item));
  const quoteMap = new Map(quotes.map((quote) => [quote.id, quote]));
  const propertyMap = new Map(
    rawProperties.properties.map((property) => {
      const localized = localizeDemoProperty(locale, property);
      return [localized.id, localized.name];
    }),
  );
  const partyMap = new Map(parties.map((party) => [party.id, party.name]));
  const versionLabelMap = new Map(templateVersions.map((v) => [v.id, v.versionLabel]));
  const generated = (await listGeneratedOutputs({ userId: resolved.userId, tenantId: resolved.tenantId, limit: 200 }))
    .map((item) => localizeDemoGeneratedOutput(locale, item));

  const contractPrefix = tr(locale, { ja: "売買", zh: "买卖", ko: "매매" });

  if (generated.length > 0) {
    return generated
      .map((item) => {
        const quote = item.quoteId ? quoteMap.get(item.quoteId) : undefined;
        const isPropertyOverview = item.outputType === "property_overview";
        const relatedProperty = item.propertyId ? propertyMap.get(item.propertyId) : quote?.property?.name;
        const relatedParty = item.partyId ? partyMap.get(item.partyId) : isPropertyOverview ? undefined : quote?.client?.name;
        const title =
          localizeDemoText(locale, item.title) ||
          (isPropertyOverview
            ? `${getGeneratedOutputTypeLabel(locale, item.outputType)} - ${relatedProperty ?? "N/A"}`
            : `${getGeneratedOutputTypeLabel(locale, item.outputType)} - ${quote?.client.name ?? "N/A"}`);
        return {
          id: item.id,
          actorId: item.actorId,
          outputType: item.outputType,
          outputFormat: item.outputFormat,
          language: item.language,
          title,
          documentNumber: item.documentNumber,
          propertyId: item.propertyId,
          partyId: item.partyId,
          relatedProperty,
          relatedParty,
          relatedContractHint: item.sourceQuoteId ? `${contractPrefix}-${item.sourceQuoteId.toUpperCase()}` : "-",
          sourceQuoteId: item.sourceQuoteId,
          generatedAt: item.generatedAt,
          templateVersionId: item.templateVersionId,
          templateVersionLabel: item.templateVersionId ? versionLabelMap.get(item.templateVersionId) : undefined,
        };
      })
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
      .slice(0, 30);
  }

  const fallback: HubGeneratedOutputItem[] = [];
  const types: OutputDocType[] = ["proposal", "estimate_sheet", "funding_plan", "assumption_memo"];
  quotes.slice(0, 12).forEach((quote) => {
    types.forEach((type) => {
      fallback.push({
        id: `output_${type}_${quote.id}`,
        actorId: "user_demo",
        outputType: type,
        outputFormat: "pdf",
        language: locale,
        title: `${getOutputDocLabel(locale, type)} - ${quote.client.name}`,
        documentNumber: `DRAFT-${quote.id}-${type}`,
        relatedProperty: quote.property?.name,
        relatedParty: quote.client.name,
        relatedContractHint: `${contractPrefix}-${quote.id.toUpperCase()}`,
        sourceQuoteId: quote.id,
        generatedAt: quote.updatedAt ?? quote.createdAt,
      });
    });
  });
  return fallback.slice(0, 30);
}

function getAttachmentTargetLabel(locale: Locale): Record<AttachmentTargetType, string> {
  return {
    property: tr(locale, { ja: "物件", zh: "物件", ko: "매물" }),
    party: tr(locale, { ja: "関係者", zh: "主体", ko: "관계자" }),
    contract: tr(locale, { ja: "契約", zh: "合同", ko: "계약" }),
    service_request: tr(locale, { ja: "対応履歴", zh: "跟进记录", ko: "후속 기록" }),
    import_job: tr(locale, { ja: "読取資料", zh: "读取资料", ko: "읽은 자료" }),
    quote: tr(locale, { ja: "提案", zh: "提案", ko: "제안" }),
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

  const [properties, parties, contracts, requests, outputs] = await Promise.all([
    listHubProperties(locale, context),
    listHubParties(locale, context),
    listHubContracts(locale, context),
    listHubServiceRequests(context),
    listHubGeneratedOutputs(locale, context),
  ]);

  const includes = (...values: Array<string | undefined>) =>
    values.some((value) => value?.toLowerCase().includes(normalized));

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

  const contractItems = contracts
    .filter((item) => includes(item.contractNumber, item.relatedProperty, item.relatedParty))
    .slice(0, limitPerEntity)
    .map<HubSearchItem>((item) => ({
      id: item.id,
      entity: "contract",
      title: item.contractNumber,
      subtitle: [item.relatedProperty, item.relatedParty].filter(Boolean).join(" / "),
      href: `/contracts?focus=${item.id}`,
    }));

  const requestItems = requests
    .filter((item) => includes(item.title, item.relatedProperty, item.relatedParty))
    .slice(0, limitPerEntity)
    .map<HubSearchItem>((item) => ({
      id: item.id,
      entity: "service_request",
      title: item.title,
      subtitle: [item.relatedProperty, item.relatedParty].filter(Boolean).join(" / "),
      href: `/service-requests?focus=${item.id}`,
    }));

  const outputItems = outputs
    .filter((item) => includes(item.title, item.relatedProperty, item.relatedParty))
    .slice(0, limitPerEntity)
    .map<HubSearchItem>((item) => ({
      id: item.id,
      entity: "output",
      title: item.title,
      subtitle: [item.relatedProperty, item.relatedParty].filter(Boolean).join(" / "),
      href: item.sourceQuoteId
        ? `/output-center?quoteId=${item.sourceQuoteId}&type=${item.outputType}`
        : `/output-center?type=${item.outputType}&targetProperty=${item.propertyId ?? ""}`,
    }));

  return [...propertyItems, ...partyItems, ...contractItems, ...requestItems, ...outputItems];
}
