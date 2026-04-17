import * as memory from "@/lib/data.memory";
import * as postgres from "@/lib/data.postgres";
import { getActorIdFromCookie } from "@/lib/actor";

const usePostgres =
  process.env.DATA_DRIVER?.toLowerCase() === "postgres" &&
  Boolean(process.env.DATABASE_URL);

const repo: typeof memory = usePostgres
  ? (postgres as unknown as typeof memory)
  : memory;

export async function getDefaultUser(preferredUserId?: string) {
  const actorId = preferredUserId ?? (await getActorIdFromCookie());
  return repo.getDefaultUser(actorId);
}
export const listUsers: typeof memory.listUsers = (...args) =>
  repo.listUsers(...args);
export const getUserById: typeof memory.getUserById = (...args) =>
  repo.getUserById(...args);
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
  Property,
  Quotation,
  ImportJob,
  ImportJobStatus,
  ImportSourceType,
  ImportTargetEntity,
  OutputTemplateVersion,
  Task,
  User,
  OutputTemplateSettingsInput,
} from "@/lib/data.memory";
export type { OutputTemplateSettings } from "@/lib/output-doc";
