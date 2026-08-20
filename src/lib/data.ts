import * as memory from "@/lib/data.memory";
import * as postgres from "@/lib/data.postgres";
import {
  assertProductionDataStoreReady,
  isProductionRuntime,
  ProductionReadinessError,
} from "@/lib/production-readiness";
import { getActorIdFromCookie } from "@/lib/actor";
import {
  isClerkAuthEnabled,
  isDemoAuthEnabled,
  isTrustedHeaderAuthEnabled,
  readTrustedHeaderAuthIdentity,
} from "@/lib/auth-mode";
import { getClerkAuthIdentity, getClerkAuthSubject } from "@/lib/clerk-auth";
import { headers } from "next/headers";
import { cache } from "react";
import { AsyncLocalStorage } from "node:async_hooks";

export type TenantSessionLookup = {
  user: memory.User;
  membership: memory.TenantMembership;
  tenant: memory.Tenant;
};

type ClientListFilterInput = NonNullable<Parameters<typeof memory.listClients>[1]>;

const usePostgres =
  process.env.DATA_DRIVER?.toLowerCase() === "postgres" &&
  Boolean(process.env.DATABASE_URL);

type DataRepository = typeof memory;
const workerRepositorySubject = new AsyncLocalStorage<string>();

function getRepository(): DataRepository {
  assertProductionDataStoreReady();
  return (usePostgres ? postgres : memory) as DataRepository;
}

const syncRepositoryMethods = new Set<keyof DataRepository>(["isTenantAccessibleStatus"]);

async function withRepositoryIdentity<T>(operation: () => Promise<T>): Promise<T> {
  if (!usePostgres || !isProductionRuntime()) {
    return operation();
  }

  const subject = workerRepositorySubject.getStore() ?? (await getClerkAuthSubject());
  if (!subject) {
    throw new ProductionReadinessError("production_tenant_scope_required");
  }

  return postgres.withPostgresAuthContext(subject, operation);
}

/** Runs a background job in the same tenant-scoped repository context as its owner. */
export async function withWorkerRepositoryIdentity<T>(externalAuthSubject: string, operation: () => Promise<T>): Promise<T> {
  const subject = externalAuthSubject.trim();
  if (!subject) throw new ProductionReadinessError("production_tenant_scope_required");
  if (!usePostgres || !isProductionRuntime()) return operation();
  return workerRepositorySubject.run(subject, () => postgres.withPostgresAuthContext(subject, operation));
}

const repo = new Proxy({} as DataRepository, {
  get(_target, property) {
    const source = getRepository();
    const value = source[property as keyof DataRepository];
    if (typeof value !== "function") return value;
    if (syncRepositoryMethods.has(property as keyof DataRepository)) return value.bind(source);
    const method = value as (...args: unknown[]) => unknown;

    return (...args: unknown[]) =>
      withRepositoryIdentity(() => Promise.resolve(method(...args)));
  },
}) as DataRepository;

export { isDemoAuthEnabled };

const resolveTenantSessionLookupsByExternalAuthSubject = cache(
  async (subject: string): Promise<TenantSessionLookup[]> => {
    const normalized = subject.trim();
    if (!normalized) return [];

    if (usePostgres) return repo.listTenantSessionLookupsByExternalAuthSubject(normalized);

    const user = await repo.getUserByExternalAuthSubject(normalized);
    if (!user) return [];
    const memberships = await repo.listTenantMemberships(user.id);
    const tenants = await Promise.all(memberships.map((membership) => repo.getTenantById(membership.tenantId)));
    return memberships.flatMap((membership, index) => {
      const tenant = tenants[index];
      return tenant ? [{ user, membership, tenant }] : [];
    });
  },
);

const resolveDefaultUser = cache(async (preferredUserId?: string) => {
  if (isClerkAuthEnabled()) {
    const subject = await getClerkAuthSubject();
    if (!subject) return null;

    // A subject never changes. For a returning user, this avoids a full Clerk
    // profile request, a write transaction, and separate membership lookups
    // on every route navigation.
    const [sessionLookup] = await resolveTenantSessionLookupsByExternalAuthSubject(subject);
    if (sessionLookup) return sessionLookup.user;

    // A user can exist before their first workspace membership is assigned.
    // Keep that state readable so the workspace selector can explain it.
    const existingUser = await repo.getUserByExternalAuthSubject(subject);
    if (existingUser) return existingUser;

    // Production provisioning is webhook-owned and uses a narrowly scoped
    // management connection. A tenant request must never self-provision by
    // falling back to an owner-capable database role.
    if (isProductionRuntime()) return null;

    const identity = await getClerkAuthIdentity();
    if (!identity) return null;
    return repo.ensureUserForExternalAuth(identity);
  }

  if (isTrustedHeaderAuthEnabled()) {
    const identity = readTrustedHeaderAuthIdentity(await headers());
    if (!identity.ok) return null;
    return repo.getUserByExternalAuthSubject(identity.identity.subject);
  }

  const actorId = isDemoAuthEnabled() ? preferredUserId ?? (await getActorIdFromCookie()) : undefined;
  if (!actorId && !isDemoAuthEnabled()) return null;
  return repo.getDefaultUser(actorId);
});

export async function getDefaultUser(preferredUserId?: string) {
  return resolveDefaultUser(preferredUserId);
}

// These values are immutable for the duration of a server render. The app
// shell and the page often need the same membership and tenant at once.
const resolveTenantMemberships = cache(async (userId: string) => repo.listTenantMemberships(userId));
const resolveTenantById = cache(async (tenantId: string) => repo.getTenantById(tenantId));
const resolveClientList = cache(
  async (
    userId: string,
    stage: ClientListFilterInput["stage"],
    purpose: ClientListFilterInput["purpose"],
    temperature: ClientListFilterInput["temperature"],
    query: ClientListFilterInput["query"],
    sort: ClientListFilterInput["sort"],
    tenantId: ClientListFilterInput["tenantId"],
    lifecycleStatus: ClientListFilterInput["lifecycleStatus"],
  ) => repo.listClients(userId, { stage, purpose, temperature, query, sort, tenantId, lifecycleStatus }),
);
const resolveQuoteFormData = cache(async (tenantId?: string, lifecycleStatus?: Parameters<typeof memory.listQuoteFormData>[1]) =>
  repo.listQuoteFormData(tenantId, lifecycleStatus),
);
const resolveQuotations = cache(async (limit?: number, tenantId?: string) => repo.listQuotations(limit, tenantId));
export const listTenantSessionLookupsByExternalAuthSubject = (subject: string) =>
  resolveTenantSessionLookupsByExternalAuthSubject(subject);
export const listUsers: typeof memory.listUsers = (...args) =>
  repo.listUsers(...args);
export const getUserById: typeof memory.getUserById = (...args) =>
  repo.getUserById(...args);
export const getUserByExternalAuthSubject: typeof memory.getUserByExternalAuthSubject = (...args) =>
  repo.getUserByExternalAuthSubject(...args);
export const ensureUserForExternalAuth: typeof memory.ensureUserForExternalAuth = (...args) =>
  repo.ensureUserForExternalAuth(...args);
export const suspendUserForExternalAuthSubject: typeof memory.suspendUserForExternalAuthSubject = (...args) =>
  repo.suspendUserForExternalAuthSubject(...args);
export const getTenantById: typeof memory.getTenantById = (...args) =>
  resolveTenantById(...args);
export const isTenantAccessibleStatus: typeof memory.isTenantAccessibleStatus = (...args) =>
  repo.isTenantAccessibleStatus(...args);
export const listPlatformTenantAccounts: typeof memory.listPlatformTenantAccounts = (...args) =>
  repo.listPlatformTenantAccounts(...args);
export const createTenantAccount: typeof memory.createTenantAccount = (...args) =>
  repo.createTenantAccount(...args);
export const createTenantAccountForUser: typeof memory.createTenantAccountForUser = (...args) =>
  repo.createTenantAccountForUser(...args);
export const tenantRoleForCapabilityPreset = memory.tenantRoleForCapabilityPreset;
export const capabilityHasTenantPermission = memory.capabilityHasTenantPermission;
export const updateTenantAccountLifecycle: typeof memory.updateTenantAccountLifecycle = (...args) =>
  repo.updateTenantAccountLifecycle(...args);
export const listTenantMemberships: typeof memory.listTenantMemberships = (...args) =>
  resolveTenantMemberships(...args);
export const listPendingTenantInvitations: typeof memory.listPendingTenantInvitations = (...args) =>
  repo.listPendingTenantInvitations(...args);
export const acceptTenantInvitation: typeof memory.acceptTenantInvitation = (...args) =>
  repo.acceptTenantInvitation(...args);
export const getTenantMembership: typeof memory.getTenantMembership = (...args) =>
  repo.getTenantMembership(...args);
export const listTenantsForUser: typeof memory.listTenantsForUser = (...args) =>
  repo.listTenantsForUser(...args);
export const listTenantMembers: typeof memory.listTenantMembers = (...args) =>
  repo.listTenantMembers(...args);
export const getTenantMemberById: typeof memory.getTenantMemberById = (...args) =>
  repo.getTenantMemberById(...args);
export const updateTenantMemberInvitation: typeof memory.updateTenantMemberInvitation = (...args) =>
  repo.updateTenantMemberInvitation(...args);
export const refreshTenantMemberInvitation: typeof memory.refreshTenantMemberInvitation = (...args) =>
  repo.refreshTenantMemberInvitation(...args);
export const inviteTenantMember: typeof memory.inviteTenantMember = (...args) =>
  repo.inviteTenantMember(...args);
export const updateTenantMemberRole: typeof memory.updateTenantMemberRole = (...args) =>
  repo.updateTenantMemberRole(...args);
export const updateTenantMemberStatus: typeof memory.updateTenantMemberStatus = (...args) =>
  repo.updateTenantMemberStatus(...args);
export const listCaseWorkbenchFieldRules: typeof memory.listCaseWorkbenchFieldRules = (...args) =>
  repo.listCaseWorkbenchFieldRules(...args);
export const updateCaseWorkbenchFieldRules: typeof memory.updateCaseWorkbenchFieldRules = (...args) =>
  repo.updateCaseWorkbenchFieldRules(...args);
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
export const getActiveGuaranteeTemplateLayoutVersion: typeof memory.getActiveGuaranteeTemplateLayoutVersion = (...args) =>
  repo.getActiveGuaranteeTemplateLayoutVersion(...args);
export const listGuaranteeTemplateLayoutVersions: typeof memory.listGuaranteeTemplateLayoutVersions = (...args) =>
  repo.listGuaranteeTemplateLayoutVersions(...args);
export const publishGuaranteeTemplateLayoutVersion: typeof memory.publishGuaranteeTemplateLayoutVersion = (...args) =>
  repo.publishGuaranteeTemplateLayoutVersion(...args);
export const listTenantGuaranteeTemplateInstalls: typeof memory.listTenantGuaranteeTemplateInstalls = (...args) =>
  repo.listTenantGuaranteeTemplateInstalls(...args);
export const getActiveTenantGuaranteeTemplateInstall: typeof memory.getActiveTenantGuaranteeTemplateInstall = (...args) =>
  repo.getActiveTenantGuaranteeTemplateInstall(...args);
export const installGuaranteeTemplateForTenant: typeof memory.installGuaranteeTemplateForTenant = (...args) =>
  repo.installGuaranteeTemplateForTenant(...args);
export const archiveTenantGuaranteeTemplateInstall: typeof memory.archiveTenantGuaranteeTemplateInstall = (...args) =>
  repo.archiveTenantGuaranteeTemplateInstall(...args);
export const getDashboardData: typeof memory.getDashboardData = (...args) =>
  repo.getDashboardData(...args);
export const listClients: typeof memory.listClients = (userId, filter = {}) =>
  resolveClientList(
    userId,
    filter.stage,
    filter.purpose,
    filter.temperature,
    filter.query,
    filter.sort,
    filter.tenantId,
    filter.lifecycleStatus,
  );
export const getClientById: typeof memory.getClientById = (...args) =>
  repo.getClientById(...args);
export const getClientDetail: typeof memory.getClientDetail = (...args) =>
  repo.getClientDetail(...args);
export const getBoardData: typeof memory.getBoardData = (...args) =>
  repo.getBoardData(...args);
export const listQuoteFormData: typeof memory.listQuoteFormData = (tenantId, lifecycleStatus) =>
  resolveQuoteFormData(tenantId, lifecycleStatus);
export const addProperty: typeof memory.addProperty = (...args) =>
  repo.addProperty(...args);
export const getPropertyById: typeof memory.getPropertyById = (...args) =>
  repo.getPropertyById(...args);
export const updateProperty: typeof memory.updateProperty = (...args) =>
  repo.updateProperty(...args);
export const setBrokerageCaseLifecycleStatus: typeof memory.setBrokerageCaseLifecycleStatus = (...args) =>
  repo.setBrokerageCaseLifecycleStatus(...args);
export const setClientLifecycleStatus: typeof memory.setClientLifecycleStatus = (...args) =>
  repo.setClientLifecycleStatus(...args);
export const setPropertyLifecycleStatus: typeof memory.setPropertyLifecycleStatus = (...args) =>
  repo.setPropertyLifecycleStatus(...args);
export const listQuotations: typeof memory.listQuotations = (limit, tenantId) =>
  resolveQuotations(limit, tenantId);
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
export const getImportJobByIdempotencyKey: typeof memory.getImportJobByIdempotencyKey = (...args) =>
  repo.getImportJobByIdempotencyKey(...args);
export const addImportJob: typeof memory.addImportJob = (...args) =>
  repo.addImportJob(...args);
export const updateImportJobMapping: typeof memory.updateImportJobMapping = (...args) =>
  repo.updateImportJobMapping(...args);
export const updateImportJobExecution: typeof memory.updateImportJobExecution = (...args) =>
  repo.updateImportJobExecution(...args);
export const retryImportJobExecution: typeof memory.retryImportJobExecution = (...args) =>
  repo.retryImportJobExecution(...args);
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
export const listGuaranteeApplicationDrafts: typeof memory.listGuaranteeApplicationDrafts = (...args) =>
  repo.listGuaranteeApplicationDrafts(...args);
export const saveGuaranteeApplicationDraft: typeof memory.saveGuaranteeApplicationDraft = (...args) =>
  repo.saveGuaranteeApplicationDraft(...args);
export const listAttachments: typeof memory.listAttachments = (...args) =>
  repo.listAttachments(...args);
export const getAttachmentById: typeof memory.getAttachmentById = (...args) =>
  repo.getAttachmentById(...args);
export const addAttachment: typeof memory.addAttachment = (...args) =>
  repo.addAttachment(...args);
export const addPrivateAttachment: typeof memory.addPrivateAttachment = (...args) =>
  repo.addPrivateAttachment(...args);
export const readPrivateAttachmentContent: typeof memory.readPrivateAttachmentContent = (...args) =>
  repo.readPrivateAttachmentContent(...args);
export const listGeneratedOutputs: typeof memory.listGeneratedOutputs = (...args) =>
  repo.listGeneratedOutputs(...args);
export const createGuaranteeBlankForm: typeof memory.createGuaranteeBlankForm = (...args) => repo.createGuaranteeBlankForm(...args);
export const addGuaranteeBlankFormVersion: typeof memory.addGuaranteeBlankFormVersion = (...args) => repo.addGuaranteeBlankFormVersion(...args);
export const getGuaranteeBlankForm: typeof memory.getGuaranteeBlankForm = (...args) => repo.getGuaranteeBlankForm(...args);
export const listGuaranteeBlankForms: typeof memory.listGuaranteeBlankForms = (...args) => repo.listGuaranteeBlankForms(...args);
export const deleteGuaranteeBlankFormForTenant: typeof memory.deleteGuaranteeBlankFormForTenant = (...args) => repo.deleteGuaranteeBlankFormForTenant(...args);
export const getGuaranteeBlankFormVersion: typeof memory.getGuaranteeBlankFormVersion = (...args) => repo.getGuaranteeBlankFormVersion(...args);
export const deleteGuaranteeBlankFormVersionForTenant: typeof memory.deleteGuaranteeBlankFormVersionForTenant = (...args) => repo.deleteGuaranteeBlankFormVersionForTenant(...args);
export const getGuaranteeCompanyMaskVersion: typeof memory.getGuaranteeCompanyMaskVersion = (...args) => repo.getGuaranteeCompanyMaskVersion(...args);
export const listPublishedGuaranteeCompanyMaskVersions: typeof memory.listPublishedGuaranteeCompanyMaskVersions = (...args) => repo.listPublishedGuaranteeCompanyMaskVersions(...args);
export const listGuaranteeCompanyMaskVersions: typeof memory.listGuaranteeCompanyMaskVersions = (...args) => repo.listGuaranteeCompanyMaskVersions(...args);
export const getGuaranteeCompanyMask: typeof memory.getGuaranteeCompanyMask = (...args) => repo.getGuaranteeCompanyMask(...args);
export const getGuaranteeOutputByCase: typeof memory.getGuaranteeOutputByCase = (...args) => repo.getGuaranteeOutputByCase(...args);
export const listGuaranteeOutputsByCase: typeof memory.listGuaranteeOutputsByCase = (...args) => repo.listGuaranteeOutputsByCase(...args);
export const deleteGeneratedOutputForTenant: typeof memory.deleteGeneratedOutputForTenant = (...args) => repo.deleteGeneratedOutputForTenant(...args);
export const readPrivateAttachmentContentForTenant: typeof memory.readPrivateAttachmentContentForTenant = (...args) => repo.readPrivateAttachmentContentForTenant(...args);
export const deletePrivateAttachmentForTenant: typeof memory.deletePrivateAttachmentForTenant = (...args) => repo.deletePrivateAttachmentForTenant(...args);
export const createGuaranteeCompanyMask: typeof memory.createGuaranteeCompanyMask = (...args) => repo.createGuaranteeCompanyMask(...args);
export const addGuaranteeCompanyMaskVersion: typeof memory.addGuaranteeCompanyMaskVersion = (...args) => repo.addGuaranteeCompanyMaskVersion(...args);
export const markGuaranteeCompanyMaskVersionTested: typeof memory.markGuaranteeCompanyMaskVersionTested = (...args) => repo.markGuaranteeCompanyMaskVersionTested(...args);
export const confirmGuaranteeCompanyMaskVersionTest: typeof memory.confirmGuaranteeCompanyMaskVersionTest = (...args) => repo.confirmGuaranteeCompanyMaskVersionTest(...args);
export const publishGuaranteeCompanyMaskVersion: typeof memory.publishGuaranteeCompanyMaskVersion = (...args) => repo.publishGuaranteeCompanyMaskVersion(...args);
export const publishGuaranteeCompanyMaskVersionWithExactMatch: typeof memory.publishGuaranteeCompanyMaskVersionWithExactMatch = (...args) => repo.publishGuaranteeCompanyMaskVersionWithExactMatch(...args);
export const rollbackGuaranteeCompanyMaskVersion: typeof memory.rollbackGuaranteeCompanyMaskVersion = (...args) => repo.rollbackGuaranteeCompanyMaskVersion(...args);
export const createGuaranteeMaskMatch: typeof memory.createGuaranteeMaskMatch = (...args) => repo.createGuaranteeMaskMatch(...args);
export const getGuaranteeMaskMatch: typeof memory.getGuaranteeMaskMatch = (...args) => repo.getGuaranteeMaskMatch(...args);
export const createGuaranteePreviewConfirmation: typeof memory.createGuaranteePreviewConfirmation = (...args) => repo.createGuaranteePreviewConfirmation(...args);
export const claimGuaranteePreviewConfirmation: typeof memory.claimGuaranteePreviewConfirmation = (...args) => repo.claimGuaranteePreviewConfirmation(...args);
export const consumeGuaranteePreviewConfirmation: typeof memory.consumeGuaranteePreviewConfirmation = (...args) => repo.consumeGuaranteePreviewConfirmation(...args);
export const releaseGuaranteePreviewConfirmation: typeof memory.releaseGuaranteePreviewConfirmation = (...args) => repo.releaseGuaranteePreviewConfirmation(...args);
export const finalizeGuaranteePreviewOutput: typeof memory.finalizeGuaranteePreviewOutput = (...args) => repo.finalizeGuaranteePreviewOutput(...args);
export const getGeneratedOutputById: typeof memory.getGeneratedOutputById = (...args) =>
  repo.getGeneratedOutputById(...args);
export const addGeneratedOutput: typeof memory.addGeneratedOutput = (...args) =>
  repo.addGeneratedOutput(...args);

export const activeDataDriver = usePostgres ? "postgres" : "memory";
export const resetBusinessDataForQa =
  activeDataDriver === "memory" ? memory.resetBusinessDataForQa : undefined;
export const seedBusinessDataForQa =
  activeDataDriver === "memory" ? memory.seedBusinessDataForQa : undefined;
export type DataDriver = typeof activeDataDriver;

export async function healthCheckDataDriver() {
  assertProductionDataStoreReady();
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
  CaseFieldRequirement,
  CaseWorkbenchFieldRule,
  CaseWorkbenchFieldRuleInput,
  Tenant,
  TenantAccountSummary,
  TenantAccountType,
  TenantAccountMemberSummary,
  TenantInvitationProvider,
  TenantInvitationStatus,
  TenantMembership,
  TenantMemberListItem,
  TenantCapabilityPreset,
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
