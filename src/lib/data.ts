import * as memory from "@/lib/data.memory";
import * as postgres from "@/lib/data.postgres";
import { getActorIdFromCookie } from "@/lib/actor";
import {
  isDemoAuthEnabled,
  isTrustedHeaderAuthEnabled,
  readTrustedHeaderAuthIdentity,
} from "@/lib/auth-mode";
import { headers } from "next/headers";

const usePostgres =
  process.env.DATA_DRIVER?.toLowerCase() === "postgres" &&
  Boolean(process.env.DATABASE_URL);

const repo: typeof memory = usePostgres
  ? (postgres as unknown as typeof memory)
  : memory;

export { isDemoAuthEnabled };

export async function getDefaultUser(preferredUserId?: string) {
  if (isTrustedHeaderAuthEnabled()) {
    const identity = readTrustedHeaderAuthIdentity(await headers());
    if (!identity.ok) return null;
    return repo.getUserByExternalAuthSubject(identity.identity.subject);
  }

  const actorId = isDemoAuthEnabled() ? preferredUserId ?? (await getActorIdFromCookie()) : undefined;
  if (!actorId && !isDemoAuthEnabled()) return null;
  return repo.getDefaultUser(actorId);
}
export const listUsers: typeof memory.listUsers = (...args) =>
  repo.listUsers(...args);
export const getUserById: typeof memory.getUserById = (...args) =>
  repo.getUserById(...args);
export const getUserByExternalAuthSubject: typeof memory.getUserByExternalAuthSubject = (...args) =>
  repo.getUserByExternalAuthSubject(...args);
export const getTenantById: typeof memory.getTenantById = (...args) =>
  repo.getTenantById(...args);
export const listTenantMemberships: typeof memory.listTenantMemberships = (...args) =>
  repo.listTenantMemberships(...args);
export const getTenantMembership: typeof memory.getTenantMembership = (...args) =>
  repo.getTenantMembership(...args);
export const listTenantsForUser: typeof memory.listTenantsForUser = (...args) =>
  repo.listTenantsForUser(...args);
export const listTenantMembers: typeof memory.listTenantMembers = (...args) =>
  repo.listTenantMembers(...args);
export const inviteTenantMember: typeof memory.inviteTenantMember = (...args) =>
  repo.inviteTenantMember(...args);
export const updateTenantMemberRole: typeof memory.updateTenantMemberRole = (...args) =>
  repo.updateTenantMemberRole(...args);
export const updateTenantMemberStatus: typeof memory.updateTenantMemberStatus = (...args) =>
  repo.updateTenantMemberStatus(...args);
export const getOutputTemplateSettings: typeof memory.getOutputTemplateSettings = (...args) =>
  repo.getOutputTemplateSettings(...args);
export const updateOutputTemplateSettings: typeof memory.updateOutputTemplateSettings = (...args) =>
  repo.updateOutputTemplateSettings(...args);
export const listOutputTemplateVersions: typeof memory.listOutputTemplateVersions = (...args) =>
  repo.listOutputTemplateVersions(...args);
export const createOutputTemplateVersion: typeof memory.createOutputTemplateVersion = (...args) =>
  repo.createOutputTemplateVersion(...args);
export const applyOutputTemplateVersion: typeof memory.applyOutputTemplateVersion = (...args) =>
  repo.applyOutputTemplateVersion(...args);
export const getOutputTemplateVersionById: typeof memory.getOutputTemplateVersionById = (...args) =>
  repo.getOutputTemplateVersionById(...args);
export const getDashboardData: typeof memory.getDashboardData = (...args) =>
  repo.getDashboardData(...args);
export const listClients: typeof memory.listClients = (...args) =>
  repo.listClients(...args);
export const getClientById: typeof memory.getClientById = (...args) =>
  repo.getClientById(...args);
export const getClientDetail: typeof memory.getClientDetail = (...args) =>
  repo.getClientDetail(...args);
export const getBoardData: typeof memory.getBoardData = (...args) =>
  repo.getBoardData(...args);
export const listQuoteFormData: typeof memory.listQuoteFormData = (...args) =>
  repo.listQuoteFormData(...args);
export const addProperty: typeof memory.addProperty = (...args) =>
  repo.addProperty(...args);
export const listQuotations: typeof memory.listQuotations = (...args) =>
  repo.listQuotations(...args);
export const getQuotationById: typeof memory.getQuotationById = (...args) =>
  repo.getQuotationById(...args);
export const addClient: typeof memory.addClient = (...args) => repo.addClient(...args);
export const updateClient: typeof memory.updateClient = (...args) =>
  repo.updateClient(...args);
export const appendFollowUp: typeof memory.appendFollowUp = (...args) =>
  repo.appendFollowUp(...args);
export const addAuditLog: typeof memory.addAuditLog = (...args) =>
  repo.addAuditLog(...args);
export const listAuditLogs: typeof memory.listAuditLogs = (...args) =>
  repo.listAuditLogs(...args);
export const createComplianceTaskFromAlert: typeof memory.createComplianceTaskFromAlert = (...args) =>
  repo.createComplianceTaskFromAlert(...args);
export const addTask: typeof memory.addTask = (...args) =>
  repo.addTask(...args);
export const resolveComplianceAlert: typeof memory.resolveComplianceAlert = (...args) =>
  repo.resolveComplianceAlert(...args);
export const updateTaskStatus: typeof memory.updateTaskStatus = (...args) =>
  repo.updateTaskStatus(...args);
export const rescheduleTask: typeof memory.rescheduleTask = (...args) =>
  repo.rescheduleTask(...args);
export const setClientStage: typeof memory.setClientStage = (...args) =>
  repo.setClientStage(...args);
export const setClientStageWithLog: typeof memory.setClientStageWithLog = (...args) =>
  repo.setClientStageWithLog(...args);
export const addQuotation: typeof memory.addQuotation = (...args) =>
  repo.addQuotation(...args);
export const duplicateQuotation: typeof memory.duplicateQuotation = (...args) =>
  repo.duplicateQuotation(...args);
export const updateQuotationStatus: typeof memory.updateQuotationStatus = (...args) =>
  repo.updateQuotationStatus(...args);
export const listImportJobs: typeof memory.listImportJobs = (...args) =>
  repo.listImportJobs(...args);
export const addImportJob: typeof memory.addImportJob = (...args) =>
  repo.addImportJob(...args);
export const updateImportJobMapping: typeof memory.updateImportJobMapping = (...args) =>
  repo.updateImportJobMapping(...args);
export const listBrokerageCases: typeof memory.listBrokerageCases = (...args) =>
  repo.listBrokerageCases(...args);
export const getBrokerageCaseById: typeof memory.getBrokerageCaseById = (...args) =>
  repo.getBrokerageCaseById(...args);
export const getBrokerageCaseByImportJobId: typeof memory.getBrokerageCaseByImportJobId = (...args) =>
  repo.getBrokerageCaseByImportJobId(...args);
export const updateBrokerageCaseConfirmedData: typeof memory.updateBrokerageCaseConfirmedData = (...args) =>
  repo.updateBrokerageCaseConfirmedData(...args);
export const saveBrokerageCaseExtractionReview: typeof memory.saveBrokerageCaseExtractionReview = (...args) =>
  repo.saveBrokerageCaseExtractionReview(...args);
export const mergeBrokerageCaseExtractionReview: typeof memory.mergeBrokerageCaseExtractionReview = (...args) =>
  repo.mergeBrokerageCaseExtractionReview(...args);
export const rollbackBrokerageCaseMerge: typeof memory.rollbackBrokerageCaseMerge = (...args) =>
  repo.rollbackBrokerageCaseMerge(...args);
export const listExtractionReviewItems: typeof memory.listExtractionReviewItems = (...args) =>
  repo.listExtractionReviewItems(...args);
export const addCorrectionEvents: typeof memory.addCorrectionEvents = (...args) =>
  repo.addCorrectionEvents(...args);
export const listCorrectionEvents: typeof memory.listCorrectionEvents = (...args) =>
  repo.listCorrectionEvents(...args);
export const addAiExperienceDrafts: typeof memory.addAiExperienceDrafts = (...args) =>
  repo.addAiExperienceDrafts(...args);
export const listAiExperienceDrafts: typeof memory.listAiExperienceDrafts = (...args) =>
  repo.listAiExperienceDrafts(...args);
export const updateAiExperienceDraftStatus: typeof memory.updateAiExperienceDraftStatus = (...args) =>
  repo.updateAiExperienceDraftStatus(...args);
export const getGuaranteeApplicationDraft: typeof memory.getGuaranteeApplicationDraft = (...args) =>
  repo.getGuaranteeApplicationDraft(...args);
export const saveGuaranteeApplicationDraft: typeof memory.saveGuaranteeApplicationDraft = (...args) =>
  repo.saveGuaranteeApplicationDraft(...args);
export const listAttachments: typeof memory.listAttachments = (...args) =>
  repo.listAttachments(...args);
export const addAttachment: typeof memory.addAttachment = (...args) =>
  repo.addAttachment(...args);
export const listGeneratedOutputs: typeof memory.listGeneratedOutputs = (...args) =>
  repo.listGeneratedOutputs(...args);
export const getGeneratedOutputById: typeof memory.getGeneratedOutputById = (...args) =>
  repo.getGeneratedOutputById(...args);
export const addGeneratedOutput: typeof memory.addGeneratedOutput = (...args) =>
  repo.addGeneratedOutput(...args);

export const activeDataDriver = usePostgres ? "postgres" : "memory";
export const resetBusinessDataForQa =
  activeDataDriver === "memory" ? memory.resetBusinessDataForQa : undefined;
export type DataDriver = typeof activeDataDriver;

export async function healthCheckDataDriver() {
  if (usePostgres) {
    await postgres.healthCheckPostgres();
    return {
      ok: true,
      driver: "postgres" as const,
    };
  }

  return memory.healthCheckDataDriver();
}

export type {
  Client,
  ClientListFilter,
  ClientListSort,
  DashboardQuoteItem,
  FollowUp,
  AuditLog,
  AuditLogFilter,
  Attachment,
  AttachmentTargetType,
  GeneratedOutput,
  Tenant,
  TenantMembership,
  TenantMemberListItem,
  TenantMembershipStatus,
  TenantStatus,
  Property,
  Quotation,
  ImportJob,
  ImportJobStatus,
  ImportSourceType,
  ImportTargetEntity,
  BrokerageCase,
  BrokerageCaseStatus,
  BrokerageCaseType,
  AiExperienceDraft,
  AiExperienceDraftStatus,
  CorrectionEvent,
  CorrectionEventChangeType,
  CorrectionEventScopeCandidate,
  CorrectionEventTrigger,
  ExtractionReviewItem,
  ExtractionReviewStatus,
  GuaranteeApplicationDraft,
  GuaranteeApplicationDraftStatus,
  OutputTemplateVersion,
  Task,
  User,
  OutputTemplateSettingsInput,
} from "@/lib/data.memory";
export type { OutputTemplateSettings } from "@/lib/output-doc";
