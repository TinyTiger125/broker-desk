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
  type Task,
} from "@/lib/data";
import type { Locale } from "@/lib/locale";
import { getOutputDocLabel, type OutputDocType } from "@/lib/output-doc";

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
  outputType: OutputDocType;
  outputFormat: "pdf" | "docx";
  language: Locale;
  title: string;
  documentNumber: string;
  relatedProperty?: string;
  relatedParty?: string;
  relatedContractHint: string;
  sourceQuoteId: string;
  generatedAt: Date;
  templateVersionId?: string;
  templateVersionLabel?: string;
};

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
  const name = client.name.trim();
  if (name.includes("株式会社") || name.includes("有限会社") || name.endsWith("法人")) {
    return "corporate";
  }
  return "individual";
}

function buildRoleTags(client: Client, locale: Locale): string[] {
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

export async function getHubOverview(): Promise<HubOverview> {
  const properties = await listHubProperties();
  const parties = await listHubParties();
  const contracts = await listHubContracts();
  const serviceRequests = await listHubServiceRequests();
  const outputs = await listHubGeneratedOutputs();

  return {
    propertyCount: properties.length,
    partyCount: parties.length,
    contractCount: contracts.length,
    serviceRequestCount: serviceRequests.length,
    pendingServiceRequestCount: serviceRequests.filter((item) => item.status === "open").length,
    generatedOutputCount: outputs.length,
  };
}

export async function listHubProperties(locale: Locale = "ja"): Promise<HubPropertyItem[]> {
  const user = await getDefaultUser();
  const attachments = user ? await listAttachments({ userId: user.id, targetType: "property", limit: 500 }) : [];
  const attachmentCountMap = attachments.reduce((map, item) => {
    map.set(item.targetId, (map.get(item.targetId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const { properties } = await listQuoteFormData();
  return properties.map((property) => ({
    id: property.id,
    name: property.name,
    area: property.name.includes("区")
      ? property.name
      : tr(locale, { ja: "未設定", zh: "未设置", ko: "미설정" }),
    listingPrice: property.listingPrice,
    managementFee: property.managementFee ?? 0,
    repairFee: property.repairFee ?? 0,
    attachmentCount: attachmentCountMap.get(property.id) ?? 0,
    status: "active",
  }));
}

export async function listHubParties(locale: Locale = "ja"): Promise<HubPartyItem[]> {
  const user = await getDefaultUser();
  if (!user) return [];
  const clients = await listClients(user.id, { sort: "recent_contact" });
  const quotes = await listQuotations();
  const countMap = new Map<string, number>();
  quotes.forEach((quote) => {
    countMap.set(quote.clientId, (countMap.get(quote.clientId) ?? 0) + 1);
  });

  return clients.map((client) => ({
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
    partyType: mapPartyType(client),
    roles: buildRoleTags(client, locale),
    relatedPropertyHint: client.preferredArea,
    contractCount: countMap.get(client.id) ?? 0,
  }));
}

export async function listHubContracts(locale: Locale = "ja"): Promise<HubContractItem[]> {
  const quotes = await listQuotations();
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

export async function listHubServiceRequests(): Promise<HubServiceRequestItem[]> {
  const user = await getDefaultUser();
  if (!user) return [];
  const clients = await listClients(user.id, { sort: "follow_up" });
  const details = await Promise.all(clients.map((client) => getClientDetail(client.id)));
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

export async function listHubImportJobs(): Promise<HubImportJobItem[]> {
  const user = await getDefaultUser();
  if (!user) return [];
  return listImportJobs(user.id, 100);
}

export async function listHubGeneratedOutputs(locale: Locale = "ja"): Promise<HubGeneratedOutputItem[]> {
  const user = await getDefaultUser();
  if (!user) return [];
  const [quotes, properties, parties, templateVersions] = await Promise.all([
    listQuotations(100),
    listQuoteFormData(),
    listHubParties(locale),
    listOutputTemplateVersions(user.id, 50),
  ]);
  const quoteMap = new Map(quotes.map((quote) => [quote.id, quote]));
  const propertyMap = new Map(properties.properties.map((property) => [property.id, property.name]));
  const partyMap = new Map(parties.map((party) => [party.id, party.name]));
  const versionLabelMap = new Map(templateVersions.map((v) => [v.id, v.versionLabel]));
  const generated = await listGeneratedOutputs({ userId: user.id, limit: 200 });

  const contractPrefix = tr(locale, { ja: "売買", zh: "买卖", ko: "매매" });

  if (generated.length > 0) {
    return generated
      .map((item) => {
        const quote = quoteMap.get(item.quoteId);
        return {
          id: item.id,
          actorId: item.actorId,
          outputType: item.outputType as OutputDocType,
          outputFormat: item.outputFormat,
          language: item.language,
          title: item.title || `${getOutputDocLabel(locale, item.outputType as OutputDocType)} - ${quote?.client.name ?? "N/A"}`,
          documentNumber: item.documentNumber,
          relatedProperty: item.propertyId ? propertyMap.get(item.propertyId) : quote?.property?.name,
          relatedParty: item.partyId ? partyMap.get(item.partyId) : quote?.client?.name,
          relatedContractHint: `${contractPrefix}-${item.sourceQuoteId.toUpperCase()}`,
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
    service_request: tr(locale, { ja: "対応依頼", zh: "服务请求", ko: "서비스 요청" }),
    import_job: tr(locale, { ja: "取込ジョブ", zh: "导入任务", ko: "가져오기 작업" }),
    quote: tr(locale, { ja: "提案", zh: "提案", ko: "제안" }),
  };
}

export async function listHubAttachments(locale: Locale = "ja", limit = 30): Promise<HubAttachmentItem[]> {
  const user = await getDefaultUser();
  if (!user) return [];
  const list = await listAttachments({ userId: user.id, limit });
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

export async function listHubOutputsByTemplateVersion(versionId: string, locale: Locale = "ja"): Promise<HubGeneratedOutputItem[]> {
  const all = await listHubGeneratedOutputs(locale);
  return all.filter((o) => o.templateVersionId === versionId);
}

export async function searchHubItems(locale: Locale = "ja", query = "", limitPerEntity = 5): Promise<HubSearchItem[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const [properties, parties, contracts, requests, outputs] = await Promise.all([
    listHubProperties(locale),
    listHubParties(locale),
    listHubContracts(locale),
    listHubServiceRequests(),
    listHubGeneratedOutputs(locale),
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
      href: `/output-center?quoteId=${item.sourceQuoteId}&type=${item.outputType}`,
    }));

  return [...propertyItems, ...partyItems, ...contractItems, ...requestItems, ...outputItems];
}
