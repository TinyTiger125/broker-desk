#!/usr/bin/env node
import fs from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertWorkspaceServiceStatusCaller(source) {
  assert(source.includes("unavailableItems.map(({ tenant, serviceState })"), "workspace unavailable cards must preserve their derived service state");
  assert(source.includes("getTenantServiceStatusLabel(serviceState.status, locale)"), "workspace unavailable cards must render the shared label for their real derived status");
  assert(!source.includes("{text.statusPendingActivation}</span>"), "workspace unavailable cards must not render a fixed pending label");
}

function assertMembersServiceStatusCaller(source) {
  assert(source.includes("getTenantServiceStatusLabel(session.serviceState.status, locale)"), "member subscription summary must render the shared localized service-status label");
  assert(!source.includes("{session.serviceState.status}</p>"), "member subscription summary must not expose a raw service-status enum");
}

function assertTenantCreateActionAtomicity(source) {
  assert(source.includes("actorUserId: session.user.id"), "platform create Action must pass its verified actor into the atomic adapter");
  assert(!source.includes("await addAuditLog("), "platform create Action must not split tenant creation from its audit writer");
}

function assertPlatformNavigation({ navSource, mainNavSource, routeTitleSource, accountsPageSource, templatesPageSource }) {
  assert(navSource.split("getPlatformOwnerSession()").length === 2, "AppNav must reuse exactly one platform-session resolution");
  assert(navSource.includes("const hasPlatformAccess = Boolean(platformSession)"), "platform navigation visibility must derive only from the shared platform session");
  assert(!navSource.includes("clerkEnabled || hasPlatformAccess") && !navSource.includes("isConfiguredPlatformOwnerUser"), "platform navigation must not use Clerk/configured-only authority");
  assert(navSource.includes('href: "/platform/accounts"') && navSource.includes('href: "/platform/templates"'), "platform navigation must expose accounts and official template factory links");
  for (const text of ["プラットフォーム管理", "平台管理", "플랫폼 관리", "アカウント管理", "账户管理", "계정 관리", "公式テンプレート工場", "官方模板工厂", "공식 템플릿 공장"]) {
    assert(navSource.includes(text), `platform navigation locale copy must include ${text}`);
  }
  assert(navSource.includes("const platformLinks = hasPlatformAccess ? getPlatformLinks(locale) : []"), "platform links must be absent without persisted platform access");
  assert(navSource.split('data-platform-admin-group').length === 5, "platform group must render once in each desktop/mobile sidebar and settings surface");
  assert(navSource.includes("platformLinks.length > 0 ?"), "all platform navigation groups must remain guarded by the shared access result");

  assert(mainNavSource.includes('"/platform/accounts": "admin_panel_settings"') && mainNavSource.includes('"/platform/templates": "dashboard_customize"'), "platform navigation links must have stable icons and active-link callers");
  assert(routeTitleSource.includes('pathname.startsWith("/platform/accounts")') && routeTitleSource.includes('pathname.startsWith("/platform/templates")'), "platform routes must have explicit route-title branches");
  for (const text of ["プラットフォーム管理", "平台管理", "플랫폼 관리", "アカウント管理", "账户管理", "계정 관리", "公式テンプレート工場", "官方模板工厂", "공식 템플릿 공장"]) {
    assert(routeTitleSource.includes(text), `platform route-title locale copy must include ${text}`);
  }
  assert(accountsPageSource.includes("requirePlatformOwnerSession()") && templatesPageSource.includes("requirePlatformOwnerSession()"), "both platform destinations must retain server-side platform-owner authorization");
}

function assertPlatformCommercialAuthority({ sessionSource, memorySource, memoryFullSource, postgresSource, actionSource, pageSource }) {
  assert(sessionSource.includes("hasActivePlatformOwnerMembership(memberships)") && !sessionSource.includes("isConfiguredPlatformOwnerUser"), "platform session and navigation authority must require persisted active platform_owner membership, never configured-only allowlist identity");

  const memoryPlatformGuardStart = memoryFullSource.indexOf("function assertActivePlatformOwnerActor(database: DB, actorUserId: string)");
  const memoryPlatformGuardEnd = memoryFullSource.indexOf("function isCanonicalTenantMemberCapability", memoryPlatformGuardStart);
  const memoryPlatformGuard = memoryPlatformGuardStart >= 0 && memoryPlatformGuardEnd > memoryPlatformGuardStart ? memoryFullSource.slice(memoryPlatformGuardStart, memoryPlatformGuardEnd) : "";
  assert(memoryPlatformGuard.includes('membership.userId === actorUserId') && memoryPlatformGuard.includes('membership.status === "active"') && memoryPlatformGuard.includes('membership.role === "platform_owner"'), "memory platform create authority must derive from a persisted active platform_owner membership");
  const memoryClone = memorySource.indexOf("const nextDb = cloneDb(db)");
  const memoryAuthority = memorySource.indexOf("assertActivePlatformOwnerActor(nextDb, actorUserId)");
  assert(memoryClone >= 0 && memoryAuthority > memoryClone && memoryAuthority < memorySource.indexOf("const baseSlug") && memoryAuthority < memorySource.indexOf('makeId("tenant")'), "memory platform authority must be checked inside the clone before ids or account state are constructed");
  assert(!memorySource.includes("isConfiguredPlatformOwnerUser") && !memorySource.includes("platformOwner: boolean"), "memory platform create must not trust configured allowlists or client booleans");

  assert(postgresSource.includes("brokerdesk_private.create_platform_tenant_account("), "PostgreSQL platform create must use the atomic database authority boundary");
  assert(!postgresSource.includes("platformOwner: boolean") && !postgresSource.includes("p_is_platform_owner"), "PostgreSQL platform create must not trust a client-provided authority boolean");
  assert(!postgresSource.includes("INSERT INTO tenants") && !postgresSource.includes("INSERT INTO users") && !postgresSource.includes("INSERT INTO tenant_memberships") && !postgresSource.includes("INSERT INTO audit_logs"), "PostgreSQL platform create facade must not split the definer transaction into direct writers");

  assert(actionSource.split("await createTenantAccount({").length === 2, "platform create Action must invoke the atomic create primitive exactly once");
  assert(actionSource.indexOf("await createTenantAccount({") < actionSource.indexOf("sendTenantMemberInvitation({"), "external invitation delivery must happen only after atomic account creation");
  assert(actionSource.includes("let invitationFailed = false") && actionSource.includes("!delivery.sent && !delivery.skipped") && actionSource.includes("tenant_created_invitation_failed"), "platform create Action must preserve the created account and return an explicit invitation-failed outcome");
  assert(actionSource.includes("try {") && actionSource.includes("catch {\n      invitationFailed = true;\n    }") && actionSource.indexOf("catch {") > actionSource.indexOf("sendTenantMemberInvitation({"), "post-commit invitation exceptions must not turn account creation into a retryable create failure");
  assert(pageSource.includes("tenant_created_invitation_failed: {") && pageSource.includes("sendPlatformTenantMemberInvitationAction"), "platform page must map the post-create invitation failure and expose retry on the existing owner membership");
}

function assertPlatformCreatedOwnerCapability({ memorySource, postgresSource }) {
  assert(memorySource.includes('role: "tenant_owner"') && memorySource.includes('capability: "company_owner"'), "memory platform creation must persist an explicit company_owner owner membership");
  assert(memorySource.includes("invitedEmail: ownerEmail"), "memory platform creation must persist the normalized invited owner email");
  assert(memorySource.includes("ownerMembers: [{\n      ...ownerMembership,"), "memory platform creation summary must return the persisted owner membership capability");
  assert(postgresSource.includes("brokerdesk_private.create_platform_tenant_account("), "PostgreSQL platform creation must delegate owner persistence and summary to the database primitive");
  assert(!memorySource.includes("tenantRoleForCapabilityPreset") && !postgresSource.includes("tenantRoleForCapabilityPreset"), "platform-created owner capability must not depend on runtime role inference");
}

const PLATFORM_FLASH_EXPECTATIONS = {
  tenant_created: {
    tone: "success",
    ja: "アカウントを作成しました。",
    zh: "账户已创建。",
    ko: "계정이 생성되었습니다.",
  },
  tenant_updated: {
    tone: "success",
    ja: "アカウントの契約情報を更新しました。",
    zh: "账户订阅信息已更新。",
    ko: "계정 구독 정보가 업데이트되었습니다.",
  },
  invitation_sent: {
    tone: "success",
    ja: "招待を送信しました。",
    zh: "邀请已发送。",
    ko: "초대를 전송했습니다.",
  },
  invitation_failed: {
    tone: "error",
    ja: "招待を送信できませんでした。既存のアカウントから再試行してください。",
    zh: "邀请发送失败。请从现有账户重试。",
    ko: "초대를 전송하지 못했습니다. 기존 계정에서 다시 시도해 주세요.",
  },
  invitation_delivery_uncertain: {
    tone: "warning",
    ja: "アカウントは作成済みです。招待は送信された可能性がありますが、記録を確定できませんでした。むやみに再送せず、Clerk と既存アカウントの招待状態を先に確認してください。",
    zh: "账户已存在；邀请可能已发送，但记录未能确认。请勿盲目重发，请先核对 Clerk 与现有账户的邀请状态。",
    ko: "계정은 이미 존재합니다. 초대가 전송되었을 수 있지만 기록을 확정하지 못했습니다. 무작정 다시 보내지 말고 Clerk와 기존 계정의 초대 상태를 먼저 확인해 주세요.",
  },
  tenant_created_invitation_failed: {
    tone: "warning",
    ja: "アカウントは作成済みですが、初期オーナーへの招待送信に失敗しました。アカウントを重複作成せず、既存のアカウントから招待を再送してください。",
    zh: "账户已创建，但初始负责人邀请发送失败。请勿重复创建账户，请从现有账户重试邀请。",
    ko: "계정은 생성되었지만 초기 책임자 초대 전송에 실패했습니다. 계정을 중복 생성하지 말고 기존 계정에서 초대를 다시 시도해 주세요.",
  },
};

const INVITATION_ACTION_MESSAGE_EXPECTATIONS = {
  email_verification_required: {
    ja: "現在のログインメールアドレスを確認してから、会社への招待を承諾してください。",
    zh: "请先验证当前登录邮箱，再接受公司邀请。",
    ko: "현재 로그인 이메일을 인증한 후 회사 초대를 수락해 주세요.",
  },
  invitation_identity_not_bound: {
    ja: "現在のログイン情報は招待にまだ紐づいていません。招待されたメールアドレスでログインしているか確認してください。",
    zh: "当前登录身份尚未完成邀请绑定，请确认使用受邀邮箱登录。",
    ko: "현재 로그인 정보가 초대에 아직 연결되지 않았습니다. 초대받은 이메일로 로그인했는지 확인해 주세요.",
  },
  invitation_email_mismatch: {
    ja: "現在のログインメールアドレスは招待先と一致しません。",
    zh: "当前登录邮箱与受邀邮箱不一致。",
    ko: "현재 로그인 이메일이 초대받은 이메일과 일치하지 않습니다.",
  },
  invitation_payload_invalid: {
    ja: "招待情報が不足しています。ページを再読み込みして、もう一度お試しください。",
    zh: "邀请信息不完整，请刷新后重试。",
    ko: "초대 정보가 완전하지 않습니다. 페이지를 새로고침한 후 다시 시도해 주세요.",
  },
  invitation_unavailable: {
    ja: "この招待は取り消されたか期限切れです。または、ログイン中のメールアドレスが招待先と一致していません。",
    zh: "邀请已撤销、已过期，或当前登录邮箱与受邀邮箱不一致。",
    ko: "이 초대는 취소되었거나 만료되었으며, 로그인 이메일이 초대받은 이메일과 일치하지 않을 수도 있습니다.",
  },
  accepted_workspace_switch_failed: {
    ja: "招待は承諾されましたが、ワークスペースの切り替えを完了できませんでした。ページを再読み込みして続けてください。",
    zh: "邀请已接受，但工作区切换尚未完成。请刷新页面后继续。",
    ko: "초대는 수락되었지만 워크스페이스 전환을 완료하지 못했습니다. 페이지를 새로고침한 후 계속해 주세요.",
  },
  invitation_accept_failed: {
    ja: "招待を一時的に承諾できません。ログイン情報を確認して、もう一度お試しください。",
    zh: "邀请暂时无法接受，请检查登录身份后重试。",
    ko: "현재 초대를 수락할 수 없습니다. 로그인 정보를 확인한 후 다시 시도해 주세요.",
  },
};

function assertInvitationActionLocaleContract({ actionSource, formSource, pageSource }) {
  const tokens = Object.keys(INVITATION_ACTION_MESSAGE_EXPECTATIONS);
  assert(actionSource.includes("export type TenantInvitationActionMessageToken =") && actionSource.includes("message?: TenantInvitationActionMessageToken"), "invitation Action state must expose a closed message-token union");
  assert((actionSource.match(/message: \"/g) ?? []).length === tokens.length, "invitation acceptance Action must return exactly seven stable message tokens");
  assert(!/[\u3400-\u9fff]/u.test(actionSource), "invitation acceptance Action must not return localized Chinese copy");
  for (const token of tokens) {
    assert(actionSource.includes(`message: "${token}"`), `invitation Action must produce ${token}`);
    assert(formSource.includes(`${token}: {`), `invitation form must map ${token}`);
    for (const locale of ["ja", "zh", "ko"]) {
      assert(formSource.includes(`${locale}: "${INVITATION_ACTION_MESSAGE_EXPECTATIONS[token][locale]}"`), `invitation form must own independent ${locale} copy for ${token}`);
    }
  }
  assert(formSource.includes("locale: Locale") && pageSource.includes("locale={locale}"), "invitation page must pass its server-resolved locale to the client form");
  assert(formSource.includes("Object.prototype.hasOwnProperty.call(INVITATION_MESSAGE_COPY, token)") && formSource.includes(": INVITATION_MESSAGE_COPY.invitation_accept_failed;"), "unknown invitation tokens must use a safe localized fallback");
  assert(!formSource.includes("{state.message}"), "invitation form must never render a raw Action token");
}

function assertPlatformFlashContract({ actionSource, pageSource }) {
  const tokens = Object.keys(PLATFORM_FLASH_EXPECTATIONS);
  for (const token of tokens) {
    assert(actionSource.includes(token), `platform Actions must produce the ${token} token`);
  }
  assert(actionSource.includes('deliveryUncertain ? "invitation_delivery_uncertain" : invitationFailed ? "tenant_created_invitation_failed" : "tenant_created"'), "platform create Action must distinguish success, post-create delivery failure, and irreversible uncertain delivery");
  assert(actionSource.includes('redirect("/platform/accounts?flash=tenant_updated")'), "platform update Action must produce exactly tenant_updated");
  assert(actionSource.includes('invitation.uncertain ? "invitation_delivery_uncertain" : invitation.sent ? "invitation_sent" : "invitation_failed"'), "platform invitation Action must distinguish sent, failed, and irreversible uncertain delivery");
  const mapStart = pageSource.indexOf("const PLATFORM_ACCOUNT_FLASH_COPY");
  const mapEnd = pageSource.indexOf("const PLATFORM_ACCOUNT_FLASH_TONE_CLASSES", mapStart);
  const map = mapStart >= 0 && mapEnd > mapStart ? pageSource.slice(mapStart, mapEnd) : "";
  assert(map, "platform page must own a bounded fixed flash-copy map");
  tokens.forEach((token, index) => {
    const start = map.indexOf(`${token}: {`);
    const nextToken = tokens[index + 1];
    const end = nextToken ? map.indexOf(`${nextToken}: {`, start) : map.length;
    const entry = start >= 0 && end > start ? map.slice(start, end) : "";
    const expected = PLATFORM_FLASH_EXPECTATIONS[token];
    assert(entry.includes(`tone: "${expected.tone}"`), `${token} must use its independent semantic tone`);
    for (const locale of ["ja", "zh", "ko"]) {
      assert(entry.includes(`${locale}: "${expected[locale]}"`), `${token} must have fixed independent ${locale} copy`);
    }
  });
  assert(pageSource.includes("Object.prototype.hasOwnProperty.call(PLATFORM_ACCOUNT_FLASH_COPY, token)") && pageSource.includes("if (!token") && pageSource.includes("return null"), "unknown or missing flash tokens must resolve to no rendered message");
  assert(pageSource.includes("{flashMessage.message}") && !pageSource.includes("{params?.flash}") && !pageSource.includes(": params?.flash"), "platform flash UI must never render raw tokens");
  assert(pageSource.includes('success: "border-emerald-200 bg-emerald-50 text-emerald-800"') && pageSource.includes('warning: "border-amber-200 bg-amber-50 text-amber-900"') && pageSource.includes('error: "border-rose-200 bg-rose-50 text-rose-900"'), "platform flash tones must distinguish success, warning, and error semantics");
}

function assertPlatformAccountDatabaseBoundary({ migrationSource, postgresSource, runtimeRoleSource }) {
  const functionNames = ["list_platform_tenant_accounts", "create_platform_tenant_account", "update_platform_tenant_account"];
  const functions = Object.fromEntries(functionNames.map((functionName, index) => {
    const start = migrationSource.indexOf(`CREATE OR REPLACE FUNCTION brokerdesk_private.${functionName}`);
    const nextName = functionNames[index + 1];
    const end = nextName ? migrationSource.indexOf(`CREATE OR REPLACE FUNCTION brokerdesk_private.${nextName}`, start) : migrationSource.indexOf("REVOKE ALL ON FUNCTION brokerdesk_private.list_platform_tenant_accounts", start);
    assert(start >= 0 && end > start, `${functionName} must exist as a bounded function in the TASK-043 migration`);
    return [functionName, migrationSource.slice(start, end)];
  }));
  assert(runtimeRoleSource.includes("brokerdesk_runtime NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"), "the platform facade must run through the documented NOBYPASSRLS runtime role");
  for (const [functionName, source] of Object.entries(functions)) {
    assert(source.includes("SECURITY DEFINER") && source.includes("SET search_path = public, pg_temp"), `${functionName} must use a fixed SECURITY DEFINER boundary`);
    assert(source.includes("brokerdesk_private.current_user_id()") && source.includes("INNER JOIN public.users AS platform_owner_users") && source.includes("platform_owner_memberships.status = 'active'") && source.includes("platform_owner_memberships.role = 'platform_owner'"), `${functionName} must prove current identity through a persisted active platform_owner membership`);
  }
  assert(functions.list_platform_tenant_accounts.includes("FROM public.tenants AS tenant_account") && !functions.list_platform_tenant_accounts.includes("tenant_account.id = p_"), "platform list must return the complete cross-tenant ledger after authority proof");
  assert(functions.list_platform_tenant_accounts.includes("seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()") && functions.list_platform_tenant_accounts.includes("owner_memberships.role = 'tenant_owner'"), "platform list must return natural-expiry seat counts and owner summaries");
  const createAuthority = functions.create_platform_tenant_account.indexOf("platform_owner_memberships.role = 'platform_owner'");
  for (const token of ["INSERT INTO public.tenants", "INSERT INTO public.users", "INSERT INTO public.tenant_memberships", "INSERT INTO public.audit_logs"]) {
    assert(functions.create_platform_tenant_account.indexOf(token) > createAuthority, `platform create authority must precede ${token}`);
  }
  assert(functions.create_platform_tenant_account.includes("LOCK TABLE public.tenants IN SHARE ROW EXCLUSIVE MODE") && functions.create_platform_tenant_account.includes("'tenant_owner', 'company_owner', 'invited'") && functions.create_platform_tenant_account.includes("'tenant_account_created'") && functions.create_platform_tenant_account.includes("RETURN QUERY"), "platform create must atomically allocate slug, tenant, canonical owner, audit, and summary");
  const updateLock = functions.update_platform_tenant_account.indexOf("FOR UPDATE;");
  assert(updateLock > functions.update_platform_tenant_account.indexOf("FROM public.tenants AS tenant_account") && functions.update_platform_tenant_account.indexOf("UPDATE public.tenants AS tenant_account") > updateLock, "platform update must lock the tenant before mutation");
  assert(functions.update_platform_tenant_account.includes("p_status NOT IN") && functions.update_platform_tenant_account.includes("p_service_start_at > p_service_end_at") && functions.update_platform_tenant_account.includes("active_count + invited_count + suspended_count") && functions.update_platform_tenant_account.includes("seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()"), "platform update must validate status, dates, and natural-expiry seat capacity under the tenant lock");
  assert(functions.update_platform_tenant_account.includes("'tenant_subscription_updated'") && functions.update_platform_tenant_account.includes("RETURN QUERY"), "platform update must write its audit and return the updated summary in one function call");
  for (const [name, signature] of [
    ["list_platform_tenant_accounts", ""],
    ["create_platform_tenant_account", "TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT"],
    ["update_platform_tenant_account", "TEXT, TEXT, TEXT, INTEGER, DATE, DATE"],
  ]) {
    assert(migrationSource.includes(`REVOKE ALL ON FUNCTION brokerdesk_private.${name}(${signature}) FROM PUBLIC`), `${name} must be revoked from PUBLIC`);
    assert(migrationSource.includes(`GRANT EXECUTE ON FUNCTION brokerdesk_private.${name}(${signature}) TO brokerdesk_runtime`), `${name} must grant execution only to the runtime role while retaining owner ACL`);
  }

  const listFacade = postgresSource.slice(postgresSource.indexOf("export async function listPlatformTenantAccounts"), postgresSource.indexOf("function slugifyTenantName"));
  const createFacade = postgresSource.slice(postgresSource.indexOf("export async function createTenantAccount("), postgresSource.indexOf("export async function updateTenantAccountLifecycle("));
  const updateFacade = postgresSource.slice(postgresSource.indexOf("export async function updateTenantAccountLifecycle("), postgresSource.indexOf("/** Creates a company for the already-authenticated local user. */"));
  assert(listFacade.includes("brokerdesk_private.list_platform_tenant_accounts()") && !listFacade.includes("FROM tenants") && !listFacade.includes("FROM tenant_memberships"), "platform list facade must use only the definer list primitive");
  assert(createFacade.includes("brokerdesk_private.create_platform_tenant_account(") && !createFacade.includes("INSERT INTO") && !createFacade.includes("SELECT * FROM tenants"), "platform create facade must use only the atomic definer create primitive");
  assert(updateFacade.includes("brokerdesk_private.update_platform_tenant_account(") && !updateFacade.includes("UPDATE tenants") && !updateFacade.includes("SELECT id FROM tenants"), "platform update facade must use only the locking definer update primitive");
  assert(!postgresSource.includes("p_is_platform_owner") && !postgresSource.includes("platformOwner: boolean"), "platform facade must never send a client authority boolean");
}

function assertPlatformAuditInsertPolicy({ migrationSource, forceRlsSource }) {
  assert(forceRlsSource.includes("'audit_logs'") && forceRlsSource.includes("ALTER TABLE public.%I FORCE ROW LEVEL SECURITY"), "platform audit policy must be reviewed against the existing FORCE RLS audit_logs boundary");
  const policyStart = migrationSource.indexOf("CREATE POLICY brokerdesk_platform_account_audit_insert");
  const policyEnd = migrationSource.indexOf("DROP POLICY IF EXISTS brokerdesk_tenant_invitation_acceptance_audit_insert", policyStart);
  assert(policyStart >= 0 && policyEnd > policyStart, "TASK-043 must add a bounded dedicated platform account audit INSERT policy");
  const policy = migrationSource.slice(policyStart, policyEnd);
  assert(policy.includes("ON public.audit_logs") && policy.includes("FOR INSERT") && policy.includes("WITH CHECK (") && !policy.includes("FOR ALL") && !policy.includes("USING ("), "platform audit policy must authorize INSERT only through WITH CHECK");
  assert(policy.includes("brokerdesk_private.current_user_id() IS NOT NULL"), "platform audit policy must reject missing request identity");
  assert(policy.includes("audit_logs.user_id = brokerdesk_private.current_user_id()") && policy.includes("audit_logs.actor_id = brokerdesk_private.current_user_id()"), "platform audit policy must bind both actor and user to the current request identity");
  assert(policy.includes("platform_owner_users.id = brokerdesk_private.current_user_id()") && policy.includes("platform_owner_users.external_auth_subject = brokerdesk_private.current_external_auth_subject()") && policy.includes("platform_owner_memberships.user_id = platform_owner_users.id") && policy.includes("platform_owner_memberships.status = 'active'") && policy.includes("platform_owner_memberships.role = 'platform_owner'"), "platform audit policy must map the external request identity to a persisted active platform_owner membership");
  assert(policy.includes("audit_logs.action IN ('tenant_account_created', 'tenant_subscription_updated')"), "platform audit policy must whitelist only create and subscription-update actions");
  assert(policy.includes("audit_logs.target_type = 'tenant'") && policy.includes("audit_logs.target_id = audit_logs.tenant_id"), "platform audit policy must bind target type and id to the tenant ledger row");
  assert(policy.includes("FROM public.tenants AS platform_audit_tenant") && policy.includes("platform_audit_tenant.id = audit_logs.tenant_id") && policy.includes("platform_audit_tenant.id = audit_logs.target_id"), "platform audit policy must require the exact target tenant to exist");

  for (const [functionName, action] of [
    ["create_platform_tenant_account", "tenant_account_created"],
    ["update_platform_tenant_account", "tenant_subscription_updated"],
  ]) {
    const start = migrationSource.indexOf(`CREATE OR REPLACE FUNCTION brokerdesk_private.${functionName}`);
    const end = migrationSource.indexOf("CREATE OR REPLACE FUNCTION", start + 1) > 0
      ? migrationSource.indexOf("CREATE OR REPLACE FUNCTION", start + 1)
      : migrationSource.indexOf("REVOKE ALL ON FUNCTION brokerdesk_private.list_platform_tenant_accounts", start);
    const source = migrationSource.slice(start, end);
    const tenantRecord = functionName === "create_platform_tenant_account" ? "created_tenant.id" : "updated_tenant.id";
    assert(source.includes("id, tenant_id, user_id, actor_id, action, target_type, target_id") && source.includes("current_actor_id, current_actor_id") && source.includes(`'${action}', 'tenant'`) && source.includes(tenantRecord), `${functionName} audit INSERT must match the platform policy field contract`);
  }
}

function assertImportWorkerClaimScope(source) {
  assert(source.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.claim_next_import_jobs(p_limit integer DEFAULT 3)"), "TASK-043 migration must replace the import worker claim function with its original signature");
  assert(source.includes("SECURITY DEFINER") && source.includes("SET search_path = public, pg_temp"), "import claim replacement must preserve its security boundary and search path");
  const candidateEnd = source.indexOf("), claimed AS (");
  assert(candidateEnd > 0, "import claim replacement must preserve the candidates-to-claimed CTE boundary");
  const candidates = source.slice(0, candidateEnd);
  const tenantJoin = "INNER JOIN public.tenants AS tenants ON tenants.id = jobs.tenant_id";
  const override = "tenants.status NOT IN ('suspended', 'cancelled')";
  const undatedPending = "tenants.service_start_at IS NULL\n        AND tenants.service_end_at IS NULL\n        AND tenants.status = 'pending_activation'";
  const startDate = "tenants.service_start_at IS NULL OR tenants.service_start_at <= tokyo_today";
  const endDate = "tenants.service_end_at IS NULL OR tenants.service_end_at >= tokyo_today";
  for (const [token, message] of [
    [tenantJoin, "join queued jobs to their tenant"],
    [override, "exclude suspended and cancelled overrides"],
    [undatedPending, "exclude undated pending_activation tenants"],
    [startDate, "exclude future service periods"],
    [endDate, "exclude expired service periods"],
  ]) {
    assert(candidates.includes(token), `import claim candidates must ${message}`);
  }
  const firstLock = candidates.indexOf("FOR UPDATE OF jobs SKIP LOCKED");
  const limit = candidates.indexOf("LIMIT normalized_limit");
  assert(firstLock > 0 && limit > 0, "import claim replacement must preserve bounded SKIP LOCKED claiming");
  for (const token of [tenantJoin, override, undatedPending, startDate, endDate]) {
    assert(candidates.indexOf(token) < firstLock && candidates.indexOf(token) < limit, "tenant service eligibility must bind candidates before lock and limit");
  }
  assert(source.indexOf("UPDATE public.import_jobs AS jobs") > candidateEnd, "only service-eligible candidates may reach the claim update");
  assert(source.includes("REVOKE ALL ON FUNCTION brokerdesk_private.claim_next_import_jobs(integer) FROM PUBLIC"), "import claim replacement must remain revoked from PUBLIC");
  assert(source.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.claim_next_import_jobs(integer) TO brokerdesk_admin"), "import claim replacement must restore only the worker grant");
}

function assertInvitationCapacityFunction(source, functionName) {
  assert(source.includes(`CREATE OR REPLACE FUNCTION brokerdesk_private.${functionName}`), `${functionName} must be replaced in TASK-043 migration`);
  assert(source.includes("SECURITY DEFINER") && source.includes("SET search_path = public, pg_temp"), `${functionName} must preserve its SECURITY DEFINER boundary`);
  const tenantLockSource = "FROM public.tenants AS tenant_account";
  const membershipLockSource = "FROM public.tenant_memberships AS target_membership";
  const tenantLock = source.indexOf("FOR UPDATE;", source.indexOf(tenantLockSource));
  const membershipSource = source.indexOf(membershipLockSource);
  const membershipLock = source.indexOf("FOR UPDATE;", membershipSource);
  assert(source.includes(tenantLockSource) && membershipSource > 0, `${functionName} must lock tenant and target membership rows`);
  assert(tenantLock > 0 && tenantLock < membershipSource && membershipLock > membershipSource, `${functionName} must lock the tenant row before the membership row`);
  assert(source.includes("current_occupies_seat") && source.includes("next_occupies_seat"), `${functionName} must compare current and next seat occupancy`);
  assert(source.includes("IF NOT current_occupies_seat AND next_occupies_seat"), `${functionName} must guard only non-seat to seat transitions`);
  assert(source.includes("seats.status IN ('active', 'suspended')") && source.includes("seats.invitation_status NOT IN ('revoked', 'expired')"), `${functionName} capacity count must match the shared seat rule`);
  assert(source.includes("target_invitation_expires_at") && source.includes("target_invitation_expires_at > NOW()"), `${functionName} current invitation occupancy must release at natural expiry`);
  assert(source.includes("seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()"), `${functionName} capacity count must exclude naturally expired invitations`);
  if (functionName === "record_tenant_invitation_delivery") {
    assert(source.includes("next_invitation_expires_at := COALESCE(p_expires_at, target_invitation_expires_at)") && source.includes("next_invitation_expires_at > NOW()"), "delivery recording must derive next occupancy from the persisted or replacement expiry");
  }
  assert(source.includes("purchased seat count exceeded"), `${functionName} must reject a full tenant before update`);
  assert(source.indexOf("purchased seat count exceeded") < source.indexOf("UPDATE public.tenant_memberships"), `${functionName} capacity rejection must precede membership mutation`);
}

function assertInvitationAuthorizationFunction(source, functionName) {
  assert(source.includes("tenant_status IN ('suspended', 'cancelled')"), `${functionName} must reject suspended and cancelled tenant service`);
  assert(source.includes("tenant_service_start_at > tokyo_today") && source.includes("tenant_service_end_at < tokyo_today"), `${functionName} must enforce Tokyo service dates`);
  assert(source.includes("tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation'"), `${functionName} must reject undated pending_activation service`);
  assert(source.includes("authorized_actor_memberships.tenant_id = p_tenant_id") && source.includes("authorized_actor_memberships.status = 'active'") && source.includes("authorized_actor_memberships.capability = 'company_owner'"), `${functionName} must authorize only an active company owner in the target tenant`);
  assert(source.includes("INNER JOIN public.users AS authorized_actor_users") && source.includes("authorized_actor_users.id = authorized_actor_memberships.user_id"), `${functionName} must derive platform ownership from a persisted membership/user join`);
  assert(source.includes("authorized_actor_users.id = current_actor_id") && source.includes("authorized_actor_memberships.role = 'platform_owner'"), `${functionName} must require the authenticated actor's active platform_owner membership`);
  assert(!source.includes("tenants.status IN ('trial', 'active')"), `${functionName} must not use the persisted legacy tenant-status authorization gate`);
  assert(source.indexOf("tenant service is unavailable for invitations") < source.indexOf("FROM public.tenant_memberships AS target_membership"), `${functionName} must reject non-operational service before target mutation`);
  assert(source.indexOf("member invite permission required") < source.indexOf("FROM public.tenant_memberships AS target_membership"), `${functionName} must authorize before target mutation`);
}

function assertInvitationTenantLockAuthorityOrder(source, functionName, allowPlatformOwner) {
  const tenantSource = source.indexOf("FROM public.tenants AS tenant_account");
  const tenantLock = source.indexOf("FOR UPDATE;", tenantSource);
  const serviceFailure = source.indexOf("tenant service is unavailable for invitations", tenantLock);
  const actorSource = source.indexOf("FROM public.tenant_memberships AS authorized_actor_memberships");
  const actorLock = source.indexOf("FOR UPDATE OF authorized_actor_memberships;", actorSource);
  const actorFailure = source.indexOf("member invite permission required", actorLock);
  const identityOrTargetSource = functionName === "create_tenant_invitation"
    ? source.indexOf("FROM public.users AS users", actorFailure)
    : source.indexOf("FROM public.tenant_memberships AS target_membership", actorFailure);
  assert(tenantSource >= 0 && tenantLock > tenantSource, `${functionName} must acquire the tenant row lock`);
  const tenantLockRead = source.slice(0, tenantLock);
  const postLockSnapshot = source.slice(tenantLock, serviceFailure);
  const capturesScalarSnapshot = tenantLockRead.includes("tenant_account.purchased_seat_count") && tenantLockRead.includes("tenant_account.status") && tenantLockRead.includes("tenant_account.service_start_at") && tenantLockRead.includes("tenant_account.service_end_at");
  const capturesTypedRowSnapshot = tenantLockRead.includes("SELECT tenant_account.*") && postLockSnapshot.includes("purchased_seat_count := tenant_row.purchased_seat_count;") && postLockSnapshot.includes("tenant_status := tenant_row.status;") && postLockSnapshot.includes("tenant_service_start_at := tenant_row.service_start_at;") && postLockSnapshot.includes("tenant_service_end_at := tenant_row.service_end_at;");
  assert(capturesScalarSnapshot || capturesTypedRowSnapshot, `${functionName} tenant lock read must capture seats and the complete service snapshot`);
  assert(serviceFailure > tenantLock && actorSource > serviceFailure && actorLock > actorSource && actorFailure > actorLock && identityOrTargetSource > actorFailure, `${functionName} must lock tenant, reject service, lock/recheck actor authority, then lock identity or target membership`);
  assert(source.indexOf("FROM public.tenant_memberships AS authorized_actor_memberships") === actorSource, `${functionName} must not read actor authority before the tenant service lock boundary`);
  const actorBoundary = source.slice(actorSource, actorLock);
  const actorIdentityBound = actorBoundary.includes("authorized_actor_memberships.user_id = current_actor_id")
    || (actorBoundary.includes("authorized_actor_users.id = authorized_actor_memberships.user_id") && actorBoundary.includes("authorized_actor_users.id = current_actor_id"));
  assert(actorIdentityBound && actorBoundary.includes("authorized_actor_memberships.status = 'active'"), `${functionName} locked actor authority must bind the current active persisted membership`);
  assert(!source.includes("brokerdesk_private.can_access_tenant"), `${functionName} must not depend on a pre-lock RLS/service snapshot`);
  const companyOwnerCapabilityChecks = actorBoundary.match(/authorized_actor_memberships\.capability = 'company_owner'/g) ?? [];
  assert(actorBoundary.includes("authorized_actor_memberships.tenant_id =") && companyOwnerCapabilityChecks.length === (allowPlatformOwner ? 2 : 1), `${functionName} actor recheck must preserve target-tenant company_owner authority and deterministic preference`);
  if (allowPlatformOwner) {
    assert(actorBoundary.includes("INNER JOIN public.users AS authorized_actor_users") && actorBoundary.includes("authorized_actor_memberships.role = 'platform_owner'"), `${functionName} actor recheck must preserve persisted active platform_owner authority`);
  } else {
    assert(!actorBoundary.includes("authorized_actor_memberships.role = 'platform_owner'"), `${functionName} must not expand company invitation creation to platform proxy invites`);
  }
}

function assertInvitationConcurrencyProbe(taskSource) {
  for (const token of [
    "TASK043_INVITATION_TENANT_SUSPEND_SESSION_A",
    "TASK043_INVITATION_TENANT_SUSPEND_SESSION_B",
    "TASK043_INVITATION_ACTOR_DOWNGRADE_SESSION_A",
    "TASK043_INVITATION_ACTOR_DOWNGRADE_SESSION_B",
    "SAVEPOINT invitation_probe_call",
    "ROLLBACK TO SAVEPOINT invitation_probe_call",
    "invitation_probe_before",
    "zero_write",
    "ROLLBACK;",
  ]) {
    assert(taskSource.includes(token), `TASK-043 must retain executable two-session invitation probe token ${token}`);
  }
  const concurrencyProbeEnd = taskSource.indexOf("TASK043_PLATFORM_INVITATION_CONTEXT_RUNTIME_PROBE");
  const concurrencyProbeSource = concurrencyProbeEnd > 0 ? taskSource.slice(0, concurrencyProbeEnd) : taskSource;
  assert((concurrencyProbeSource.match(/ AS zero_write/g) ?? []).length === 2, "TASK-043 invitation probes must independently assert zero writes for tenant suspension and actor downgrade");
}

function assertPlatformInvitationDeliveryBoundary({ actionSource, postgresPrepareSource, postgresRecordSource, sqlSource }) {
  assert(!actionSource.includes("getTenantById") && !actionSource.includes("getTenantMemberById"), "platform/customer invitation sender must not use ordinary tenant RLS pre/post reads");
  const prepareCall = actionSource.indexOf("await refreshTenantMemberInvitation(");
  const externalDelivery = actionSource.indexOf("await createClerkInvitationForTenantMember(member)", prepareCall);
  const recordDelivery = actionSource.indexOf("await updateTenantMemberInvitation({", externalDelivery);
  assert(prepareCall >= 0 && externalDelivery > prepareCall && recordDelivery > externalDelivery, "invitation sender must prepare guarded context before Clerk and record delivery afterward");
  assert(actionSource.includes("const member = prepared.member") && actionSource.split("memberContext: member").length === 4, "all delivery outcomes must reuse the guarded prepared member context without an ordinary reread");

  assert(postgresPrepareSource.includes("brokerdesk_private.prepare_tenant_invitation_delivery($1, $2, $3, $4)") && postgresPrepareSource.includes("mapTenantInvitationDeliveryContext(result.rows[0])"), "PostgreSQL prepare facade must directly map the definer context row");
  assert(!postgresPrepareSource.includes("getTenantById") && !postgresPrepareSource.includes("getTenantMemberById") && postgresPrepareSource.split("getPool().query").length === 2, "PostgreSQL prepare facade must issue one definer query and no ordinary RLS reads");
  assert(!postgresRecordSource.includes("getTenantMemberById") && postgresRecordSource.split("getPool().query").length === 2, "PostgreSQL delivery recorder must issue one definer query and no ordinary RLS pre/post reads");
  assert(postgresRecordSource.includes("mapTenantMembership(result.rows[0])") && postgresRecordSource.includes("input.memberContext") && postgresRecordSource.includes("user: input.memberContext.user"), "delivery recorder must map its function RETURN with the already-authorized prepared user context");

  assert(sqlSource.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(") && sqlSource.includes("RETURNS TABLE (tenant_record JSONB, member_record JSONB)"), "TASK-043 must add the fixed prepare delivery context function");
  assert(sqlSource.includes("SECURITY DEFINER") && sqlSource.includes("SET search_path = public, pg_temp"), "prepare delivery context must preserve a fixed SECURITY DEFINER boundary");
  assertInvitationTenantLockAuthorityOrder(sqlSource, "prepare_tenant_invitation_delivery", true);
  const actorLock = sqlSource.indexOf("FOR UPDATE OF authorized_actor_memberships;");
  const targetSource = sqlSource.indexOf("FROM public.tenant_memberships AS target_membership", actorLock);
  const targetLock = sqlSource.indexOf("FOR UPDATE OF target_membership;", targetSource);
  const userSource = sqlSource.indexOf("FROM public.users AS invited_user", targetLock);
  const userLock = sqlSource.indexOf("FOR UPDATE OF invited_user;", userSource);
  const capacity = sqlSource.indexOf("purchased seat count exceeded", userLock);
  const update = sqlSource.indexOf("UPDATE public.tenant_memberships", capacity);
  const fullReturn = sqlSource.indexOf("jsonb_build_object('membership', to_jsonb(updated_membership), 'user', to_jsonb(invited_user_row))", update);
  assert(targetSource > actorLock && targetLock > targetSource && userSource > targetLock && userLock > userSource && capacity > userLock && update > capacity && fullReturn > update, "prepare delivery must lock target membership and user, check capacity, update refresh state, then return full context");
  assert(sqlSource.includes("to_jsonb(tenant_row)") && sqlSource.includes("tenant_record") && sqlSource.includes("member_record"), "prepare delivery must return complete tenant, membership, and user delivery context");
  assert(sqlSource.includes("REVOKE ALL ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC") && sqlSource.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime"), "prepare delivery context must retain runtime-only execution ACL");
}

function assertPlpgsqlCompositeIntoShape(migrationSource) {
  const rowVariables = [...migrationSource.matchAll(/\b([a-z_][a-z0-9_]*)\s+public\.[a-z_][a-z0-9_]*%ROWTYPE;/gi)].map((match) => match[1]);
  assert(rowVariables.includes("tenant_row"), "prepare invitation must retain its typed tenant row variable");
  for (const rowVariable of rowVariables) {
    const illegalCompositeMultiInto = new RegExp(`SELECT\\b(?:(?!;)[\\s\\S])*?\\bINTO\\s+${rowVariable}\\s*,(?:(?!;)[\\s\\S])*?;`, "i");
    assert(!illegalCompositeMultiInto.test(migrationSource), `PL/pgSQL composite ${rowVariable} must not be the first target of a multi-item INTO list`);
  }
  const prepareStart = migrationSource.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery");
  const prepareEnd = migrationSource.indexOf("REVOKE ALL ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery", prepareStart);
  const prepare = prepareStart >= 0 && prepareEnd > prepareStart ? migrationSource.slice(prepareStart, prepareEnd) : "";
  assert(prepare.includes("SELECT tenant_account.*\n  INTO tenant_row") && prepare.includes("purchased_seat_count := tenant_row.purchased_seat_count;") && prepare.includes("tenant_status := tenant_row.status;") && prepare.includes("tenant_service_start_at := tenant_row.service_start_at;") && prepare.includes("tenant_service_end_at := tenant_row.service_end_at;"), "prepare invitation must select one complete tenant row and derive scalar service fields afterward");
  const tenantLock = prepare.indexOf("FOR UPDATE;");
  const notFound = prepare.indexOf("IF NOT FOUND THEN", tenantLock);
  const scalarAssignments = prepare.indexOf("purchased_seat_count := tenant_row.purchased_seat_count;", notFound);
  const serviceGuard = prepare.indexOf("IF tenant_status IN ('suspended', 'cancelled')", scalarAssignments);
  assert(tenantLock >= 0 && notFound > tenantLock && scalarAssignments > notFound && serviceGuard > scalarAssignments, "prepare invitation must preserve tenant lock, existence check, scalar derivation, then Tokyo service guard order");
}

function assertPlatformInvitationRuntimeProbe(taskSource) {
  for (const token of [
    "TASK043_PLATFORM_INVITATION_CONTEXT_RUNTIME_PROBE",
    "TASK043_RESTRICTED_INVITATION_CONTEXT_RUNTIME_PROBE",
    "SET LOCAL ROLE brokerdesk_runtime",
    "SET LOCAL app.external_auth_subject = :'platform_subject'",
    "SET LOCAL app.external_auth_subject = :'ordinary_subject'",
    "SET LOCAL app.external_auth_subject = :'form_admin_subject'",
    "brokerdesk_private.prepare_tenant_invitation_delivery(",
    "SELECT tenant_record, member_record",
    "AS zero_write",
    "ROLLBACK;",
  ]) {
    assert(taskSource.includes(token), `TASK-043 must retain restricted runtime invitation context probe token ${token}`);
  }
  assert((taskSource.match(/SET LOCAL ROLE brokerdesk_runtime/g) ?? []).length === 2, "both platform-success and restricted-rejection probes must run as the runtime role");
}

const MEMBER_INVITATION_UNCERTAIN_COPY = {
  ja: "招待は送信された可能性がありますが、記録を確定できませんでした。むやみに再送せず、Clerk と現在の招待状態を先に確認してください。",
  zh: "邀请可能已发送，但记录未能确认。请勿盲目重发，请先核对 Clerk 与当前邀请状态。",
  ko: "초대가 전송되었을 수 있지만 기록을 확정하지 못했습니다. 무작정 다시 보내지 말고 Clerk와 현재 초대 상태를 먼저 확인해 주세요.",
};

function assertInvitationDeliveryAuditAtomicity({ senderSource, actionSource, memorySource, sqlSource, migrationSource, memberCopySource, membersPageSource }) {
  assert(!senderSource.includes("addAuditLog") && !senderSource.includes('action: "member_invitation_sent"') && !senderSource.includes('action: "member_invitation_failed"'), "invitation sender must not split sent/failed audit persistence from delivery finalization");
  assert(actionSource.includes("let deliveryUncertain = false") && actionSource.includes("deliveryUncertain = delivery.uncertain") && senderSource.includes("uncertain: true") && senderSource.indexOf("uncertain: true") > senderSource.indexOf("invitationStatus: \"pending\""), "sender must distinguish irreversible Clerk success with failed database finalization");
  assert((actionSource.match(/invitation\.uncertain \? "invitation_delivery_uncertain"/g) ?? []).length === 2 && actionSource.includes('if (invitation.uncertain) redirect("/settings/members?flash=invitation_delivery_uncertain")') && actionSource.includes('deliveryUncertain ? "invitation_delivery_uncertain"'), "platform resend, company resend, invite creation, and newly created account must expose the stable uncertain token");
  assert(!senderSource.includes("updated ?? member"), "delivery finalization must never report sent or confirmed failure when the database returns null");
  assert((senderSource.match(/if \(!updated\) return \{ member, sent: false, skipped: false, uncertain: true \};/g) ?? []).length === 2, "both Clerk success and Clerk failure must map null finalization to uncertain");
  const successNullGuard = senderSource.indexOf("if (!updated) return { member, sent: false, skipped: false, uncertain: true };");
  const sentTrue = senderSource.indexOf("sent: true", successNullGuard);
  assert(successNullGuard >= 0 && sentTrue > successNullGuard, "Clerk success may be reported sent only after a non-null finalization result");
  const customerInviteAction = actionSource.slice(actionSource.indexOf("export async function inviteTenantMemberAction"), actionSource.indexOf("export async function updateTenantMemberRoleAction"));
  const uncertainRedirect = customerInviteAction.indexOf('if (invitation.uncertain) redirect("/settings/members?flash=invitation_delivery_uncertain")');
  const splitMemberAudit = customerInviteAction.indexOf("await addAuditLog");
  assert(uncertainRedirect >= 0 && splitMemberAudit > uncertainRedirect, "customer new invitation must immediately redirect on uncertain before any split member_invited audit");

  const memoryUpdate = memorySource.indexOf("membership.invitationProvider = input.invitationProvider");
  const memoryAudit = memorySource.indexOf('action: auditAction');
  const memoryAuditInsert = memorySource.indexOf("nextDb.auditLogs.unshift(audit)", memoryAudit);
  const memoryResult = memorySource.indexOf("const result: TenantMemberListItem", memoryAuditInsert);
  const memoryPublish = memorySource.indexOf("_g.__brokerDb = nextDb", memoryResult);
  assert(memorySource.includes("const nextDb = cloneDb(db)") && memoryUpdate > 0 && memoryAudit > memoryUpdate && memoryAuditInsert > memoryAudit && memoryResult > memoryAuditInsert && memoryPublish > memoryResult, "memory delivery must construct membership, exact audit, and result in one clone before publishing");
  assert(memorySource.split("_g.__brokerDb = nextDb").length === 2, "memory delivery and audit must publish exactly once");
  assert(memorySource.includes('auditAction = input.invitationProvider === "clerk" && input.invitationStatus === "pending"') && memorySource.includes('"member_invitation_sent"') && memorySource.includes('input.invitationProvider === "clerk" && input.invitationStatus === "failed"') && memorySource.includes('? "member_invitation_failed"'), "memory delivery must audit only exact Clerk sent and failed outcomes");
  assert(memorySource.includes("if (isDuplicateDeliveryFinalization)") && memorySource.indexOf("if (isDuplicateDeliveryFinalization)") < memoryUpdate, "memory delivery must return repeated finalization without another update or audit");
  assert(memorySource.includes('input.invitationProvider === "clerk" && (membership.invitationStatus === "revoked" || membership.invitationStatus === "expired")') && memorySource.indexOf('membership.invitationStatus === "revoked"') < memoryUpdate, "memory Clerk delivery must return null after a concurrent invitation release without disabling explicit manual restoration capacity guards");

  const sqlUpdate = sqlSource.indexOf("UPDATE public.tenant_memberships");
  const sqlUpdateRowCount = sqlSource.indexOf("GET DIAGNOSTICS delivery_update_row_count = ROW_COUNT", sqlUpdate);
  const sqlAuditAction = sqlSource.indexOf("delivery_audit_action :=", sqlUpdateRowCount);
  const sqlAuditInsert = sqlSource.indexOf("INSERT INTO public.audit_logs", sqlAuditAction);
  const sqlRowCount = sqlSource.indexOf("GET DIAGNOSTICS delivery_audit_row_count = ROW_COUNT", sqlAuditInsert);
  const sqlReturn = sqlSource.indexOf("RETURN QUERY", sqlRowCount);
  assert(sqlUpdate >= 0 && sqlUpdateRowCount > sqlUpdate && sqlAuditAction > sqlUpdateRowCount && sqlAuditInsert > sqlAuditAction && sqlRowCount > sqlAuditInsert && sqlReturn > sqlRowCount, "SQL delivery must verify its update, insert and verify its audit, then return in the same transaction");
  assert(sqlSource.includes("delivery_audit_action IN ('member_invitation_sent', 'member_invitation_failed')") && sqlSource.includes("p_tenant_id, current_actor_id, current_actor_id") && sqlSource.includes("'member', p_membership_id"), "SQL delivery audit must bind exact action, tenant, current actor/user, and membership target");
  assert(sqlSource.includes("duplicate_delivery_finalization") && sqlSource.indexOf("IF duplicate_delivery_finalization THEN") < sqlUpdate, "SQL delivery must suppress duplicate finalization audit before update");
  assert(sqlSource.includes("p_provider = 'clerk' AND target_invitation_status IN ('revoked', 'expired')") && sqlSource.indexOf("target_invitation_status IN ('revoked', 'expired')") < sqlUpdate, "SQL Clerk delivery must return null after a concurrent invitation release");

  const policyStart = migrationSource.indexOf("CREATE POLICY brokerdesk_tenant_invitation_delivery_audit_insert");
  const policyEnd = migrationSource.indexOf("-- Platform account administration", policyStart);
  const policy = policyStart >= 0 && policyEnd > policyStart ? migrationSource.slice(policyStart, policyEnd) : "";
  assert(policy.includes("FOR INSERT") && policy.includes("WITH CHECK") && !policy.includes("FOR ALL") && !policy.includes("USING ("), "delivery audit FORCE-RLS policy must authorize only INSERT");
  assert(policy.includes("audit_logs.action IN ('member_invitation_sent', 'member_invitation_failed')") && policy.includes("audit_logs.user_id = brokerdesk_private.current_user_id()") && policy.includes("audit_logs.actor_id = brokerdesk_private.current_user_id()") && policy.includes("audit_logs.target_type = 'member'"), "delivery audit policy must bind exact action, current actor/user and member target");
  assert(policy.includes("delivery_target.id = audit_logs.target_id") && policy.includes("delivery_target.tenant_id = audit_logs.tenant_id"), "delivery audit policy must bind target membership to the same tenant");
  assert(policy.includes("delivery_actor_memberships.status = 'active'") && policy.includes("delivery_actor_memberships.capability = 'company_owner'") && policy.includes("delivery_actor_memberships.role = 'platform_owner'"), "delivery audit policy must require target company_owner or persisted active platform_owner authority");

  for (const locale of ["ja", "zh", "ko"]) {
    assert(memberCopySource.includes(`${locale}: "${MEMBER_INVITATION_UNCERTAIN_COPY[locale]}"`), `member invitation uncertain copy must independently cover ${locale}`);
  }
  assert(memberCopySource.includes("invitation_delivery_uncertain:") && membersPageSource.includes('"invitation_delivery_uncertain"'), "member page must render uncertain delivery as a warning token");
}

function assertInvitationAcceptanceBoundary({ sqlSource, postgresSource }) {
  assert(sqlSource.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.accept_tenant_invitation("), "TASK-043 migration must replace the original four-TEXT invitation acceptance function");
  assert(sqlSource.includes("p_tenant_id TEXT") && sqlSource.includes("p_membership_id TEXT") && sqlSource.includes("p_target_user_id TEXT") && sqlSource.includes("p_invitation_token TEXT") && sqlSource.includes("RETURNS SETOF public.tenant_memberships"), "invitation acceptance must retain its four-TEXT signature and complete membership return type");
  assert(sqlSource.includes("SECURITY DEFINER") && sqlSource.includes("SET search_path = public, pg_temp"), "invitation acceptance must retain its fixed SECURITY DEFINER boundary");
  const tenantSource = sqlSource.indexOf("FROM public.tenants AS tenant_account");
  const tenantLock = sqlSource.indexOf("FOR UPDATE;", tenantSource);
  const serviceRejection = sqlSource.indexOf("tenant service is unavailable for invitation acceptance");
  const membershipSource = sqlSource.indexOf("FROM public.tenant_memberships AS memberships", tenantLock);
  const membershipLock = sqlSource.indexOf("FOR UPDATE OF memberships;", membershipSource);
  assert(tenantSource >= 0 && tenantLock > tenantSource && serviceRejection > tenantLock && membershipSource > serviceRejection && membershipLock > membershipSource, "invitation acceptance must lock tenant, reject unavailable service, then lock the target membership");
  assert(sqlSource.includes("tenant_status IN ('suspended', 'cancelled')") && sqlSource.includes("tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation'") && sqlSource.includes("tenant_service_start_at > tokyo_today") && sqlSource.includes("tenant_service_end_at < tokyo_today") && sqlSource.includes("AT TIME ZONE 'Asia/Tokyo'"), "invitation acceptance must use the shared Tokyo operational service rule");
  for (const token of ["invited_email_value", "actual_email_value", "invitation_token_value", "expires_at_value"]) {
    assert(sqlSource.indexOf(token, membershipSource) > serviceRejection, `invitation acceptance must not inspect ${token} before service rejection`);
  }
  assert(sqlSource.includes("current_user_id <> NULLIF(trim(COALESCE(p_target_user_id, '')), '')") && sqlSource.includes("memberships.user_id = current_user_id") && sqlSource.includes("memberships.status = 'invited'") && sqlSource.includes("memberships.invitation_status = 'pending'"), "invitation acceptance must preserve authenticated target and pending invitation identity rules");
  assert(sqlSource.includes("lower(trim(invited_email_value)) <> lower(trim(actual_email_value))") && sqlSource.includes("invitation_token_value <> trim(p_invitation_token)"), "invitation acceptance must preserve email and token matching");
  assert(sqlSource.includes("expires_at_value <= NOW()") && sqlSource.includes("SET invitation_status = 'expired'") && sqlSource.includes("invitation_expires_at > NOW()"), "invitation acceptance must preserve token expiry handling");
  const acceptanceUpdate = sqlSource.indexOf("SET status = 'active'");
  const returnQuery = sqlSource.indexOf("RETURN QUERY", acceptanceUpdate);
  const returnSource = sqlSource.slice(returnQuery);
  assert(acceptanceUpdate > membershipLock && returnQuery > acceptanceUpdate && returnSource.includes("SELECT memberships.*") && returnSource.includes("memberships.status = 'active'") && returnSource.includes("memberships.invitation_status = 'accepted'"), "invitation acceptance must return the complete successfully accepted membership row");
  assert(sqlSource.includes("REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC") && sqlSource.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime"), "invitation acceptance must preserve runtime-only execution ACL");

  const facadeStart = postgresSource.indexOf("export async function acceptTenantInvitation(");
  const facadeEnd = postgresSource.indexOf("export const listTenantSessionLookupsByExternalAuthSubject", facadeStart);
  const facade = facadeStart >= 0 && facadeEnd > facadeStart ? postgresSource.slice(facadeStart, facadeEnd) : "";
  assert(facade.includes("brokerdesk_private.accept_tenant_invitation($1, $2, $3, $4)") && facade.includes("INNER JOIN public.users AS invited_user") && facade.includes("mapTenantMemberJoinedRow(result.rows[0])"), "PostgreSQL acceptance facade must directly map the guarded function return row and its current-user join");
  assert(!facade.includes("getTenantMemberById") && facade.split("getPool().query").length === 2, "PostgreSQL acceptance success must not depend on a post-commit ordinary-RLS read");
}

function assertInvitationAcceptanceAtomicity({ memorySource, sqlSource, migrationSource, actionSource, forceRlsSource }) {
  const memoryClone = memorySource.indexOf("const nextDb = cloneDb(db)");
  const memoryMemberUpdate = memorySource.indexOf('membership.status = "active"');
  const memoryAuditId = memorySource.indexOf('id: makeId("audit")');
  const memoryAuditInsert = memorySource.indexOf("nextDb.auditLogs.unshift(audit)");
  const memoryResult = memorySource.indexOf("result = {");
  const memoryPublish = memorySource.indexOf("_g.__brokerDb = nextDb");
  assert(memoryClone >= 0 && memoryMemberUpdate > memoryClone && memoryAuditId > memoryMemberUpdate && memoryAuditInsert > memoryAuditId && memoryResult > memoryAuditInsert && memoryPublish > memoryResult, "memory invitation acceptance must finish membership, audit, and return construction in a clone before publishing");
  assert(memorySource.split("_g.__brokerDb = nextDb").length === 2, "memory invitation acceptance must publish exactly one database reference");
  assert(memorySource.slice(memoryPublish).trim() === "_g.__brokerDb = nextDb;\n  return result;\n}", "memory invitation acceptance must only return its preconstructed result after publishing");
  assert(memorySource.includes('action: "tenant_invitation_accepted"') && memorySource.includes('targetType: "member"') && memorySource.includes("targetId: membership.id") && memorySource.includes("tenantId: tenant.id") && memorySource.includes("userId: user.id") && memorySource.includes("actorId: user.id"), "memory acceptance audit must bind the current invitee, tenant, and membership target");
  assert(memorySource.includes(": !user.externalAuthSubject") && memorySource.includes("membership.invitedEmail ??= user.email.trim().toLowerCase()"), "memory legacy NULL repair must require an already-bound target user and backfill its normalized email only in the acceptance clone");
  assert(!memorySource.includes("db.auditLogs") && !memorySource.includes("toTenantMemberListItem"), "memory invitation acceptance must not write or reread published state during the atomic primitive");

  const acceptanceUpdate = sqlSource.indexOf("UPDATE public.tenant_memberships AS memberships\n  SET status = 'active'");
  const auditInsert = sqlSource.indexOf("INSERT INTO public.audit_logs", acceptanceUpdate);
  const auditDiagnostic = sqlSource.indexOf("GET DIAGNOSTICS acceptance_audit_row_count = ROW_COUNT", auditInsert);
  const auditFailure = sqlSource.indexOf("invitation acceptance audit was not persisted", auditDiagnostic);
  const returnQuery = sqlSource.indexOf("RETURN QUERY", auditFailure);
  assert(acceptanceUpdate >= 0 && auditInsert > acceptanceUpdate && auditDiagnostic > auditInsert && auditFailure > auditDiagnostic && returnQuery > auditFailure, "PostgreSQL acceptance must update membership, insert and verify its audit, then return within one function transaction");
  assert(sqlSource.includes("p_tenant_id, current_user_id, current_user_id") && sqlSource.includes("'tenant_invitation_accepted', 'member', p_membership_id") && sqlSource.includes("jsonb_build_object('membershipId', p_membership_id, 'role', accepted_membership_role)"), "PostgreSQL acceptance audit must bind current actor/user and exact tenant membership target");

  assert(forceRlsSource.includes("'audit_logs'") && forceRlsSource.includes("ALTER TABLE public.%I FORCE ROW LEVEL SECURITY"), "acceptance audit policy must be reviewed against FORCE RLS");
  const policyStart = migrationSource.indexOf("CREATE POLICY brokerdesk_tenant_invitation_acceptance_audit_insert");
  const policyEnd = migrationSource.indexOf("DROP POLICY IF EXISTS brokerdesk_tenant_invitation_delivery_audit_insert", policyStart);
  assert(policyStart >= 0 && policyEnd > policyStart, "TASK-043 must provide a bounded acceptance audit policy");
  const policy = migrationSource.slice(policyStart, policyEnd);
  assert(policy.includes("ON public.audit_logs") && policy.includes("FOR INSERT") && policy.includes("WITH CHECK (") && !policy.includes("FOR ALL") && !policy.includes("USING ("), "acceptance audit policy must authorize only INSERT through WITH CHECK");
  assert(policy.includes("brokerdesk_private.current_user_id() IS NOT NULL") && policy.includes("audit_logs.user_id = brokerdesk_private.current_user_id()") && policy.includes("audit_logs.actor_id = brokerdesk_private.current_user_id()"), "acceptance audit policy must bind actor and user to the current request identity");
  assert(policy.includes("audit_logs.action = 'tenant_invitation_accepted'") && policy.includes("audit_logs.target_type = 'member'"), "acceptance audit policy must whitelist only the acceptance member shape");
  assert(policy.includes("accepted_membership.id = audit_logs.target_id") && policy.includes("accepted_membership.tenant_id = audit_logs.tenant_id") && policy.includes("accepted_membership.user_id = brokerdesk_private.current_user_id()") && policy.includes("accepted_membership.status = 'active'") && policy.includes("accepted_membership.invitation_status = 'accepted'") && policy.includes("accepted_user.external_auth_subject = brokerdesk_private.current_external_auth_subject()"), "acceptance audit policy must prove the exact accepted membership and external identity");

  const primitiveCall = actionSource.indexOf("await acceptTenantInvitation(");
  const acceptedMarker = actionSource.indexOf("invitationAccepted = true", primitiveCall);
  const cookieWrite = actionSource.indexOf("const store = await cookies()", acceptedMarker);
  assert(primitiveCall >= 0 && acceptedMarker > primitiveCall && cookieWrite > acceptedMarker, "acceptance Action must mark commit success before postcommit workspace UX");
  assert(!actionSource.includes("addAuditLog") && !actionSource.includes("tenant_invitation_accepted"), "acceptance Action must not split audit persistence from the atomic primitive");
  assert(actionSource.includes("if (invitationAccepted)") && actionSource.includes('message: "accepted_workspace_switch_failed"'), "acceptance Action must report postcommit cookie/revalidation failure truthfully");
}

function assertExternalAuthSuspensionPredicate(source) {
  assert(source.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.suspend_external_auth_user(p_subject TEXT)"), "TASK-043 migration must replace suspend_external_auth_user with its original signature");
  assert(source.includes("SECURITY DEFINER") && source.includes("SET search_path = public, pg_temp"), "external-auth suspension replacement must preserve its security boundary");
  assert(source.includes("status = 'active'"), "external-auth deletion must suspend active memberships");
  assert(source.includes("status = 'invited' AND invitation_status NOT IN ('revoked', 'expired')"), "external-auth deletion must suspend only unreleased invitations");
  assert(source.includes("invitation_expires_at IS NULL OR invitation_expires_at > NOW()"), "external-auth deletion must preserve naturally expired invitations as released");
  assert(!source.includes("status <> 'suspended'"), "external-auth deletion must not reacquire released memberships");
  assert(source.includes("REVOKE ALL ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) FROM PUBLIC"), "external-auth suspension replacement must remain revoked from PUBLIC");
  assert(source.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.suspend_external_auth_user(TEXT) TO brokerdesk_admin"), "external-auth suspension replacement must restore only the admin execution grant");
}

function assertExternalAuthProfileSyncBoundary(source) {
  assert(source.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.sync_external_auth_user("), "TASK-043 migration must replace sync_external_auth_user with its original signature");
  assert(source.includes("RETURNS TEXT") && source.includes("SECURITY DEFINER") && source.includes("SET search_path = public, pg_temp"), "external-auth profile sync must preserve its fixed SECURITY DEFINER boundary");
  assert(source.includes("WHERE external_auth_subject = normalized_subject") && source.includes("WHERE lower(email) = normalized_email"), "external-auth profile sync must preserve subject and email identity matching");
  assert(source.includes("email is already linked to another external identity") && source.includes("external_auth_subject <> normalized_subject"), "external-auth profile sync must preserve conflicting identity rejection");
  assert(source.includes("UPDATE public.users") && source.includes("INSERT INTO public.users"), "external-auth profile sync must remain limited to user identity/profile persistence");
  assert(!source.includes("UPDATE public.tenant_memberships"), "external-auth profile sync must never activate or accept a membership");
  assert(source.includes("REVOKE ALL ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) FROM PUBLIC"), "external-auth profile sync must remain revoked from PUBLIC");
  assert(source.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.sync_external_auth_user(TEXT, TEXT, TEXT) TO brokerdesk_admin"), "external-auth profile sync must restore only the admin execution grant");
}

function assertMemberMutationServiceBoundary(source, functionName, signature) {
  assert(source.includes(`CREATE OR REPLACE FUNCTION brokerdesk_private.${functionName}`), `${functionName} must be replaced in TASK-043 with its original signature`);
  assert(source.includes("SECURITY DEFINER") && source.includes("SET search_path = public, pg_temp"), `${functionName} must preserve its fixed SECURITY DEFINER boundary`);
  const tenantSource = source.indexOf("FROM public.tenants AS tenant_account");
  const tenantLock = source.indexOf("FOR UPDATE;", tenantSource);
  const targetSelect = source.indexOf("SELECT memberships.role", tenantLock);
  const membershipSource = source.indexOf("FROM public.tenant_memberships AS memberships", targetSelect);
  const membershipLock = source.indexOf("FOR UPDATE;", membershipSource);
  assert(tenantSource >= 0 && tenantLock > tenantSource && targetSelect > tenantLock && membershipSource > targetSelect && membershipLock > membershipSource, `${functionName} must lock the tenant before the target membership`);
  assert(source.includes("tenant_status IN ('suspended', 'cancelled')"), `${functionName} must reject suspended and cancelled tenant overrides`);
  assert(source.includes("tenant_service_start_at IS NULL AND tenant_service_end_at IS NULL AND tenant_status = 'pending_activation'"), `${functionName} must reject undated pending_activation tenants`);
  assert(source.includes("tenant_service_start_at > tokyo_today") && source.includes("tenant_service_end_at < tokyo_today"), `${functionName} must enforce Tokyo service dates while allowing active and expiring periods`);
  assert(source.includes("actor_membership.status = 'active'") && source.includes("actor_membership.capability = 'company_owner'"), `${functionName} must retain active company_owner authorization`);
  assert(source.indexOf("tenant service is unavailable for member management") < targetSelect, `${functionName} must reject non-operational service before target membership locking and mutation`);
  assert(source.includes(`REVOKE ALL ON FUNCTION brokerdesk_private.${functionName}(${signature}) FROM PUBLIC`), `${functionName} must remain revoked from PUBLIC`);
  assert(source.includes(`GRANT EXECUTE ON FUNCTION brokerdesk_private.${functionName}(${signature}) TO brokerdesk_runtime`), `${functionName} must restore only runtime execution`);
}

function assertMemoryLifecycleAtomicity(source) {
  const sourceFile = ts.createSourceFile("data.memory.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let lifecycleFunction;
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "updateTenantAccountLifecycle") lifecycleFunction = node;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert(lifecycleFunction?.body, "memory updateTenantAccountLifecycle function must exist");
  const statements = [...lifecycleFunction.body.statements];
  const statementText = statements.map((statement) => statement.getText(sourceFile));
  const normalizedActorIndex = statementText.findIndex((text) => text.includes("const normalizedActorUserId = input.actorUserId.trim()"));
  const emptyActorIndex = statementText.findIndex((text) => text.includes("if (!normalizedActorUserId)") && text.includes("active platform owner membership required"));
  const cloneIndex = statementText.findIndex((text) => text.includes("const nextDb = cloneDb(db)"));
  const guardIndex = statementText.findIndex((text) => text.includes("assertActivePlatformOwnerActor(nextDb, normalizedActorUserId)"));
  const tenantLookupIndex = statementText.findIndex((text) => text.includes("nextDb.tenants.find"));
  const dateValidationIndex = statementText.findIndex((text) => text.includes("validateTenantServicePeriod(input)"));
  const auditIndex = statementText.findIndex((text) => text.includes("const audit: AuditLog"));
  assert(normalizedActorIndex === 0 && emptyActorIndex === 1 && cloneIndex === 2 && guardIndex === 3, "memory lifecycle update must normalize/reject its actor, clone, then authorize through the shared guard");
  assert(tenantLookupIndex > guardIndex && dateValidationIndex > guardIndex && auditIndex > guardIndex, "memory lifecycle platform authority must precede tenant lookup, commercial construction, and audit construction");
  const platformGuardStart = source.indexOf("function assertActivePlatformOwnerActor(database: DB, actorUserId: string)");
  const platformGuardEnd = source.indexOf("function isCanonicalTenantMemberCapability", platformGuardStart);
  const platformGuard = source.slice(platformGuardStart, platformGuardEnd);
  assert(platformGuard.includes("membership.userId === actorUserId") && platformGuard.includes('membership.status === "active"') && platformGuard.includes('membership.role === "platform_owner"'), "shared memory lifecycle authority must require the exact actor's active persisted platform_owner membership");
  const commitIndexes = statements.flatMap((statement, index) => statement.getText(sourceFile).includes("_g.__brokerDb = nextDb") ? [index] : []);
  assert(commitIndexes.length === 1, "memory lifecycle update must publish with exactly one database reference switch");
  const commitIndex = commitIndexes[0];
  const beforeCommit = statements.slice(0, commitIndex).map((statement) => statement.getText(sourceFile)).join("\n");
  assert(beforeCommit.includes('const audit: AuditLog') && beforeCommit.includes("nextDb.auditLogs.unshift(audit)"), "memory lifecycle audit construction and insertion must finish in nextDb before commit");
  const auditSource = statementText[auditIndex] ?? "";
  assert(auditSource.includes("userId: normalizedActorUserId") && auditSource.includes("actorId: normalizedActorUserId") && !auditSource.includes("userId: input.actorUserId") && !auditSource.includes("actorId: input.actorUserId"), "memory lifecycle audit must persist only the normalized authorized actor");
  assert(beforeCommit.includes("const result: TenantAccountSummary"), "memory lifecycle summary must be fully constructed before commit");
  assert(!beforeCommit.includes("db.tenants.find") && !beforeCommit.includes("db.auditLogs"), "memory lifecycle update must not mutate or read a published collection after cloning");
  const afterCommit = statements.slice(commitIndex + 1);
  assert(afterCommit.length === 1 && ts.isReturnStatement(afterCommit[0]) && afterCommit[0].expression?.getText(sourceFile) === "result", "memory lifecycle commit must be followed only by returning the preconstructed summary");
  let forbiddenAfterCommit = false;
  const inspectAfterCommit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isThrowStatement(node) || ts.isAwaitExpression(node)) forbiddenAfterCommit = true;
    ts.forEachChild(node, inspectAfterCommit);
  };
  afterCommit.forEach(inspectAfterCommit);
  assert(!forbiddenAfterCommit, "memory lifecycle update must not call, construct, throw, or await after commit");
}

function assertMemoryMemberMutationBoundary({ roleSource, statusSource, fullSource }) {
  assert(fullSource.includes("function assertActiveCompanyOwnerActor(database: DB, tenantId: string, actorUserId?: string)"), "memory member mutations must share one actor guard");
  const actorGuardStart = fullSource.indexOf("function assertActiveCompanyOwnerActor");
  const actorGuardEnd = fullSource.indexOf("function countActiveCompanyOwners", actorGuardStart);
  const actorGuard = fullSource.slice(actorGuardStart, actorGuardEnd);
  assert(actorGuard.includes("membership.tenantId === tenantId") && actorGuard.includes("membership.userId === normalizedActorUserId") && actorGuard.includes('membership.status === "active"') && actorGuard.includes('membership.capability === "company_owner"'), "shared memory actor guard must require the target tenant's active company_owner membership");
  for (const [label, source, mutationToken] of [
    ["role", roleSource, "membership.role = input.role"],
    ["status", statusSource, "membership.status = input.status"],
  ]) {
    assert(source.includes("const nextDb = cloneDb(db)"), `memory member ${label} mutation must clone before all validation`);
    assert(source.includes("assertActiveCompanyOwnerActor(nextDb, scopeTenantId, input.actorUserId)"), `memory member ${label} mutation must use the shared actor guard`);
    assert(source.includes("const activeCompanyOwnerCount = countActiveCompanyOwners(nextDb, scopeTenantId)"), `memory member ${label} mutation must recompute active company owners inside its clone`);
    assert(source.indexOf("const activeCompanyOwnerCount") < source.indexOf(mutationToken), `memory member ${label} last-owner check must immediately precede final mutation`);
    assert(source.includes("activeCompanyOwnerCount <= 1") && source.includes("last active company owner"), `memory member ${label} mutation must reject removing the final owner`);
    assert(!source.includes("db.tenantMemberships"), `memory member ${label} mutation must not write or inspect the published membership collection after cloning`);
    assert(source.split("_g.__brokerDb = nextDb").length === 2, `memory member ${label} mutation must publish exactly once`);
    assert(source.includes("_g.__brokerDb = nextDb;\n  return result;"), `memory member ${label} commit must be followed only by returning its preconstructed result`);
  }
  assert(roleSource.includes("isCanonicalTenantMemberCapability(input.role, capability)"), "memory role mutation must use the shared canonical role/capability mapping");
  for (const pair of [
    'role === "tenant_owner" && capability === "company_owner"',
    'role === "manager" && capability === "company_form_admin"',
    'role === "broker" && capability === "ordinary_member"',
  ]) {
    assert(fullSource.includes(pair), `memory role mutation must allow only ${pair}`);
  }
  assert(roleSource.includes("if (!capability || !isCanonicalTenantMemberCapability"), "memory role mutation must reject every unsupported role/capability pair");
  assert(statusSource.includes("countTenantSeatUsage(nextDb.tenantMemberships") && statusSource.includes("tenant.purchasedSeatCount"), "memory status mutation must retain capacity validation inside the same clone");
}

function assertInvitationCreationBoundary({ memorySource, memoryFullSource, postgresSource, sqlSource }) {
  assert(memorySource.includes("const nextDb = cloneDb(db)"), "memory invitation must clone the published database before validation and writes");
  const memoryInvitedOnly = 'if ((input.status ?? "invited") !== "invited")';
  const memoryInvitedOnlyIndex = memorySource.indexOf(memoryInvitedOnly);
  assert(memoryInvitedOnlyIndex >= 0, "memory invitation must reject every non-invited requested membership status");
  const actorGuard = "assertActiveCompanyOwnerActor(nextDb, scopeTenantId, input.invitedByUserId)";
  assert(memorySource.includes(actorGuard), "memory invitation must require its target tenant active company_owner actor");
  assert(memoryFullSource.includes("function isCanonicalTenantMemberCapability") && memorySource.includes("isCanonicalTenantMemberCapability(input.role, capability)"), "memory invitation must enforce the shared canonical role/capability mapping");
  const actorGuardIndex = memorySource.indexOf(actorGuard);
  assert(memoryInvitedOnlyIndex < memorySource.indexOf("nextDb.tenants.find") && memoryInvitedOnlyIndex < actorGuardIndex && memoryInvitedOnlyIndex < memorySource.indexOf("countTenantSeatUsage("), "memory invited-only validation must precede tenant lookup, actor authorization, and capacity work");
  const beforeActorGuard = memorySource.slice(0, actorGuardIndex);
  assert(!beforeActorGuard.includes("nextDb.users.push(") && !beforeActorGuard.includes("nextDb.tenantMemberships.push(") && !beforeActorGuard.includes("existing.role =") && !beforeActorGuard.includes("existing.status ="), "memory invitation must authorize its actor before every user or membership write");
  for (const token of ["countTenantSeatUsage(", "nextDb.users.push(user)", "existing.role = input.role", "nextDb.tenantMemberships.push(membership)"]) {
    assert(memorySource.indexOf(token) > actorGuardIndex, `memory invitation actor authorization must precede ${token}`);
  }
  assert(!memorySource.includes("db.users.find") && !memorySource.includes("db.users.push") && !memorySource.includes("db.tenantMemberships"), "memory invitation must not inspect or mutate published collections after cloning");
  assert(memorySource.split("_g.__brokerDb = nextDb").length === 2, "memory invitation must publish with exactly one database reference switch");
  assert(memorySource.includes("const result: TenantMemberListItem") && memorySource.includes("_g.__brokerDb = nextDb;\n  return result;"), "memory invitation must fully construct its result before commit and only return afterward");
  assert(!memorySource.includes("nextStatus") && !memorySource.includes('invitationStatus = "accepted"') && !memorySource.includes('invitationProvider: "manual"'), "memory invitation must not retain an unreachable active/accepted bootstrap path");
  assert(memorySource.includes('status: "invited"') && memorySource.includes('invitationStatus: "pending"') && memorySource.includes("invitationToken: randomUUID()") && memorySource.includes("invitationAcceptedAt: undefined"), "memory invitation creation must persist only a pending token invitation");

  const postgresInvitedOnly = 'if ((input.status ?? "invited") !== "invited")';
  const postgresInvitedOnlyIndex = postgresSource.indexOf(postgresInvitedOnly);
  assert(postgresInvitedOnlyIndex >= 0, "PostgreSQL invitation facade must reject every non-invited requested membership status");
  for (const pair of [
    'input.role === "tenant_owner" && capability === "company_owner"',
    'input.role === "manager" && capability === "company_form_admin"',
    'input.role === "broker" && capability === "ordinary_member"',
  ]) {
    assert(postgresSource.includes(pair), `PostgreSQL invitation facade must enforce ${pair}`);
  }
  assert(postgresSource.indexOf("if (!canonicalPair)") < postgresSource.indexOf("getAuthenticatedInvitationActorId") && postgresSource.indexOf("if (!canonicalPair)") < postgresSource.indexOf("withTransaction"), "PostgreSQL invitation facade must reject noncanonical input before authentication and transactional writes");
  assert(postgresInvitedOnlyIndex < postgresSource.indexOf("const capability") && postgresInvitedOnlyIndex < postgresSource.indexOf("getAuthenticatedInvitationActorId") && postgresInvitedOnlyIndex < postgresSource.indexOf("withTransaction"), "PostgreSQL invited-only validation must precede capability, actor, and transaction work");
  assert(postgresSource.includes("return withTransaction(async (client) =>"), "PostgreSQL invitation facade must retain the request-scoped transaction boundary");
  assert(postgresSource.split("client.query(").length === 2, "PostgreSQL invitation facade must issue exactly one database call inside its request-scoped transaction");
  assert(postgresSource.includes("SELECT * FROM brokerdesk_private.create_tenant_invitation($1, $2, $3, $4, $5, $6)"), "PostgreSQL invitation facade must delegate its only capacity and write boundary to create_tenant_invitation");
  for (const forbidden of ["FROM users", "JOIN tenant_memberships", "FROM tenants", "assertTenantHasSeatCapacity", "existingOccupiesSeat", "purchased_seat_count"]) {
    assert(!postgresSource.includes(forbidden), `PostgreSQL invitation facade must not raw-preflight ${forbidden} outside its SECURITY DEFINER RPC`);
  }
  assert(postgresSource.includes("[scopeTenantId, actorUserId, email, name, input.role, capability]"), "PostgreSQL invitation facade must pass its validated canonical capability to SQL");

  for (const pair of [
    "p_role = 'tenant_owner' AND p_capability = 'company_owner'",
    "p_role = 'manager' AND p_capability = 'company_form_admin'",
    "p_role = 'broker' AND p_capability = 'ordinary_member'",
  ]) {
    assert(sqlSource.includes(pair), `SQL invitation boundary must enforce ${pair}`);
  }
  assert(sqlSource.includes("actor_memberships.tenant_id = normalized_tenant_id") && sqlSource.includes("actor_memberships.user_id = current_actor_id") && sqlSource.includes("actor_memberships.status = 'active'") && sqlSource.includes("actor_memberships.capability = 'company_owner'"), "SQL invitation boundary must prove an active company_owner actor in the target tenant");
  assert(!sqlSource.includes("platform_owner_memberships") && !sqlSource.includes("role = 'platform_owner'"), "SQL invitation creation must not widen target-tenant invitation authority to platform owners");
}

function assertMemberStatusAcceptanceBoundary({ actionSource, memorySource, postgresSource, sqlSource }) {
  assert(actionSource.includes('if (target?.status === "invited")') && actionSource.includes('if (status === "active" || status === "suspended")'), "member status Action must reject invited-to-active and invited-to-suspended transitions");
  assert(actionSource.includes('target.invitationStatus !== "accepted"') && actionSource.includes('target?.status === "active" && status === "suspended"') && actionSource.includes('target?.status === "suspended" && status === "active"'), "member status Action must allow suspend/reactivate only for an accepted membership");
  assert(actionSource.indexOf('target?.status === "invited"') < actionSource.indexOf("updateTenantMemberStatus({"), "member status Action transition guards must precede its adapter write");

  assert(memorySource.includes('membership.status === "invited" && (input.status === "active" || input.status === "suspended")'), "memory member status must reject both invited activation and suspension");
  assert(memorySource.includes('membership.invitationStatus !== "accepted"') && memorySource.includes('membership.status === "active" && input.status === "suspended"') && memorySource.includes('membership.status === "suspended" && input.status === "active"'), "memory member status must allow suspend/reactivate only for an accepted membership");
  assert(memorySource.indexOf('membership.status === "invited"') < memorySource.indexOf("countTenantSeatUsage(") && memorySource.indexOf('membership.invitationStatus !== "accepted"') < memorySource.indexOf("countTenantSeatUsage("), "memory acceptance guards must precede capacity and final membership mutation work");
  assert(!memorySource.includes('membership.invitationStatus = "accepted"') && !memorySource.includes("membership.invitationAcceptedAt = nowDate"), "memory status mutation must not accept invitations as a side effect");

  assert(postgresSource.includes('existingMember.status === "invited" && (input.status === "active" || input.status === "suspended")'), "PostgreSQL member status facade must reject both invited activation and suspension");
  assert(postgresSource.includes('existingMember.invitationStatus !== "accepted"') && postgresSource.includes('existingMember.status === "active" && input.status === "suspended"') && postgresSource.includes('existingMember.status === "suspended" && input.status === "active"'), "PostgreSQL member status facade must allow suspend/reactivate only for an accepted membership");
  assert(postgresSource.indexOf('existingMember.status === "invited"') < postgresSource.indexOf("withTransaction") && postgresSource.indexOf('existingMember.invitationStatus !== "accepted"') < postgresSource.indexOf("withTransaction"), "PostgreSQL transition guards must precede its transaction writer");

  assert(sqlSource.includes("target_status = 'invited' AND p_status IN ('active', 'suspended')"), "SQL direct boundary must reject invited-to-active and invited-to-suspended transitions");
  assert(sqlSource.includes("target_invitation_status IS DISTINCT FROM 'accepted'") && sqlSource.includes("target_status = 'active' AND p_status = 'suspended'") && sqlSource.includes("target_status = 'suspended' AND p_status = 'active'"), "SQL direct boundary must allow suspend/reactivate only for an accepted membership");
  assert(sqlSource.indexOf("target_status = 'invited'") < sqlSource.indexOf("current_occupies_seat :=") && sqlSource.indexOf("target_invitation_status IS DISTINCT FROM 'accepted'") < sqlSource.indexOf("current_occupies_seat :=") && sqlSource.indexOf("target_invitation_status IS DISTINCT FROM 'accepted'") < sqlSource.indexOf("UPDATE public.tenant_memberships"), "SQL acceptance guards must precede capacity calculation and mutation");
}

function assertInvitationDeliveryBoundary({ memorySource, postgresSource, sqlSource }) {
  const providerWhitelist = '["none", "manual", "clerk"]';
  const statusWhitelist = '["pending", "failed", "not_sent", "revoked", "expired"]';
  assert(memorySource.includes("const nextDb = cloneDb(db)") && memorySource.indexOf("const nextDb = cloneDb(db)") < memorySource.indexOf("resolveTenantId"), "memory delivery recording must clone before all validation and work");
  assert(memorySource.includes(providerWhitelist) && memorySource.includes(statusWhitelist), "memory delivery recording must enforce the exact runtime provider and non-accepted status whitelists");
  const memoryValidation = memorySource.indexOf("if (!allowedProviders.includes(input.invitationProvider) || !allowedStatuses.includes(input.invitationStatus))");
  const memoryTarget = memorySource.indexOf('if (!membership || membership.status !== "invited") return null;');
  assert(memoryValidation >= 0 && memoryValidation < memorySource.indexOf("nextDb.tenantMemberships.find") && memoryTarget > memoryValidation, "memory delivery runtime validation and invited-target check must precede target work");
  assert(memoryTarget < memorySource.indexOf("assertTenantInvitationActorAuthorized") && memoryTarget < memorySource.indexOf("countTenantSeatUsage(") && memoryTarget < memorySource.indexOf("membership.invitationProvider ="), "memory delivery must reject non-invited targets before actor, capacity, or writes");
  assert(!memorySource.includes("db.tenantMemberships") && !memorySource.includes("assertTenantHasSeatCapacity"), "memory delivery must not read or mutate published membership/capacity state after cloning");
  assert(memorySource.split("_g.__brokerDb = nextDb").length === 2 && memorySource.includes("const result: TenantMemberListItem") && memorySource.includes("_g.__brokerDb = nextDb;\n  return result;"), "memory delivery must publish exactly once after constructing its result");

  assert(postgresSource.includes(providerWhitelist) && postgresSource.includes(statusWhitelist), "PostgreSQL delivery facade must enforce the exact runtime provider and non-accepted status whitelists");
  const postgresValidation = postgresSource.indexOf("if (!allowedProviders.includes(input.invitationProvider) || !allowedStatuses.includes(input.invitationStatus))");
  assert(postgresValidation >= 0 && postgresValidation < postgresSource.indexOf("await ensureSchema()"), "PostgreSQL delivery whitelist must precede schema or database work");
  assert(!postgresSource.includes("getTenantMemberById") && postgresSource.includes("mapTenantMembership(result.rows[0])") && postgresSource.includes("input.memberContext"), "PostgreSQL delivery facade must rely on the locked SQL target guard and directly map its RETURN with prepared context");

  assert(sqlSource.includes("p_provider NOT IN ('none', 'manual', 'clerk')") && sqlSource.includes("p_invitation_status NOT IN ('pending', 'failed', 'not_sent', 'revoked', 'expired')"), "SQL delivery final boundary must enforce exact provider and non-accepted status whitelists");
  assert(sqlSource.indexOf("p_provider NOT IN") < sqlSource.indexOf("FROM public.tenants AS tenant_account"), "SQL delivery whitelist must precede tenant locks and capacity work");
  assert(sqlSource.includes("IF NOT FOUND OR target_status <> 'invited'") && sqlSource.indexOf("target_status <> 'invited'") < sqlSource.indexOf("current_occupies_seat :=") && sqlSource.indexOf("target_status <> 'invited'") < sqlSource.indexOf("UPDATE public.tenant_memberships"), "SQL delivery final boundary must reject non-invited targets before capacity and update");
}

function assertTenantRlsServiceScope(source) {
  assert(source.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.can_access_tenant(target_tenant_id TEXT)"), "TASK-043 migration must replace can_access_tenant with its original signature");
  assert(source.includes("LANGUAGE SQL") && source.includes("STABLE") && source.includes("SECURITY DEFINER") && source.includes("SET search_path = public, pg_temp"), "can_access_tenant must preserve its fixed SECURITY DEFINER boundary");
  const existsStart = source.indexOf("SELECT EXISTS (");
  const existsEnd = source.indexOf(");", existsStart);
  assert(existsStart >= 0 && existsEnd > existsStart, "can_access_tenant must retain one membership and tenant EXISTS boundary");
  const existsScope = source.slice(existsStart, existsEnd);
  assert(existsScope.includes("FROM public.tenant_memberships AS memberships") && existsScope.includes("JOIN public.tenants AS tenants ON tenants.id = memberships.tenant_id"), "can_access_tenant service predicate must remain inside its membership and tenant join");
  assert(existsScope.includes("memberships.user_id = brokerdesk_private.current_user_id()") && existsScope.includes("memberships.tenant_id = target_tenant_id") && existsScope.includes("memberships.status = 'active'"), "can_access_tenant must bind current-user active membership to the target tenant");
  assert(existsScope.includes("tenants.status NOT IN ('suspended', 'cancelled')"), "can_access_tenant must reject suspended and cancelled tenant overrides");
  assert(existsScope.includes("tenants.service_start_at IS NULL") && existsScope.includes("tenants.service_end_at IS NULL") && existsScope.includes("tenants.status = 'pending_activation'"), "can_access_tenant must reject undated pending_activation while preserving legacy undated service");
  assert(existsScope.includes("tenants.service_start_at <= tokyo_today") && existsScope.includes("tenants.service_end_at >= tokyo_today"), "can_access_tenant must enforce inclusive Tokyo service dates");
  assert(!existsScope.includes("tenants.status IN ('trial', 'active')"), "can_access_tenant must not use the legacy persisted service-status gate");
  assert(source.includes("REVOKE ALL ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) FROM PUBLIC"), "can_access_tenant must remain revoked from PUBLIC");
  assert(source.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.can_access_tenant(TEXT) TO authenticated"), "can_access_tenant must restore authenticated execution");
}

function assertRelatedTenantServiceFunctions(source) {
  for (const functionName of [
    "can_access_user",
    "list_tenant_members_for_current_tenant",
    "list_pending_tenant_invitations_for_current_user",
    "bind_current_clerk_identity_to_pending_invitation",
    "create_tenant_invitation",
  ]) {
    assert(source.includes(`CREATE OR REPLACE FUNCTION brokerdesk_private.${functionName}`), `${functionName} must be replaced with the TASK-043 service contract`);
  }
  assert(!source.includes("tenants.status IN ('trial', 'active')"), "TASK-043 replacements must remove every reviewed persisted-status service gate");
  assert(source.includes("brokerdesk_private.can_access_tenant(own_membership.tenant_id)"), "can_access_user must reuse core tenant service access");
  assert(source.includes("tenant service is unavailable for invitations"), "company invitation creation must enforce the locked Tokyo service boundary directly");
  for (const token of [
    "tenants.status NOT IN ('suspended', 'cancelled')",
    "tenants.service_start_at <= tokyo_today",
    "tenants.service_end_at >= tokyo_today",
  ]) {
    assert(source.split(token).length >= 4, `pending invitation read and identity bind must both enforce ${token}`);
  }
}

function assertRestrictedMemberRosterRead(source) {
  assert(source.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.list_tenant_members_for_current_tenant"), "TASK-043 migration must replace the member roster read function");
  assert(source.includes("RETURNS TABLE (member_record JSONB)") && source.includes("SECURITY DEFINER") && source.includes("SET search_path = public, pg_temp"), "member roster read must preserve its original signature and fixed security boundary");
  assert(!source.includes("brokerdesk_private.can_access_tenant"), "restricted member roster read must remain available when tenant service is non-operational");
  assert(!source.includes("service_start_at") && !source.includes("service_end_at") && !source.includes("tenants.status"), "restricted member roster read must not apply an operational service predicate");
  assert(source.includes("actor_membership.tenant_id = NULLIF(trim(COALESCE(p_tenant_id, '')), '')"), "member roster authorization must bind the actor membership to the requested tenant");
  assert(source.includes("actor_membership.user_id = brokerdesk_private.current_user_id()"), "member roster authorization must bind the current request identity");
  assert(source.includes("actor_membership.status = 'active'") && source.includes("actor_membership.capability = 'company_owner'"), "member roster authorization must require active company_owner capability");
  assert(source.includes("REVOKE ALL ON FUNCTION brokerdesk_private.list_tenant_members_for_current_tenant(TEXT) FROM PUBLIC") && source.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.list_tenant_members_for_current_tenant(TEXT) TO brokerdesk_runtime"), "member roster read must preserve its runtime ACL");
}

function assertCreateInvitationCapacityBoundary(source) {
  assert(source.includes("CREATE OR REPLACE FUNCTION brokerdesk_private.create_tenant_invitation"), "TASK-043 migration must replace create_tenant_invitation");
  assert(source.includes("SECURITY DEFINER") && source.includes("SET search_path = public, pg_temp"), "create_tenant_invitation must preserve its fixed security boundary");
  const tenantSource = source.indexOf("FROM public.tenants AS tenant_account");
  const tenantLock = source.indexOf("FOR UPDATE;", tenantSource);
  const identitySource = source.indexOf("FROM public.users", tenantLock);
  const membershipSource = source.indexOf("FROM public.tenant_memberships memberships", identitySource);
  const membershipLock = source.indexOf("FOR UPDATE;", membershipSource);
  assert(tenantSource >= 0 && tenantLock > tenantSource && identitySource > tenantLock && membershipSource > identitySource && membershipLock > membershipSource, "create invitation must lock tenant before selecting and locking identity membership state");
  assert(source.includes("existing_membership_id") && source.includes("ORDER BY CASE WHEN memberships.status = 'removed' THEN 1 ELSE 0 END ASC"), "create invitation must prefer the unique nonremoved current membership and use latest removed only as fallback");
  assert(source.includes("memberships.updated_at DESC") && source.includes("memberships.created_at DESC"), "removed fallback selection must be deterministic and newest-first");
  assert(source.includes("current_occupies_seat") && source.includes("next_occupies_seat") && source.includes("IF NOT current_occupies_seat AND next_occupies_seat"), "create invitation must guard only non-seat to seat transitions");
  assert(source.includes("seats.status IN ('active', 'suspended')") && source.includes("seats.invitation_status NOT IN ('revoked', 'expired')"), "create invitation direct-call capacity count must match the shared seat predicate");
  assert(source.includes("existing_invitation_expires_at") && source.includes("existing_invitation_expires_at > NOW()"), "create invitation current occupancy must release at natural expiry");
  assert(source.includes("seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()"), "create invitation capacity count must exclude naturally expired invitations");
  assert(source.indexOf("purchased seat count exceeded") < source.indexOf("INSERT INTO public.users") && source.indexOf("purchased seat count exceeded") < source.indexOf("UPDATE public.tenant_memberships"), "create invitation must reject capacity before writing user or membership state");
  assert(source.includes("tenant_memberships.id = existing_membership_id"), "create invitation must update only the selected current membership");
  assert(source.includes("REVOKE ALL ON FUNCTION brokerdesk_private.create_tenant_invitation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC") && source.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.create_tenant_invitation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime"), "create invitation must preserve its runtime ACL");
}

function assertMemberStatusSeatExpiry(source) {
  assert(source.includes("target_status IN ('active', 'suspended')"), "member status transition must keep suspended membership unconditionally seat-occupying");
  assert(source.includes("target_invitation_expires_at IS NULL OR target_invitation_expires_at > NOW()"), "member status transition must release current invitation at natural expiry");
  assert(source.includes("seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()"), "member status capacity count must exclude naturally expired invitations");
}

function assertPostgresSeatExpiryFacade(source, platformMigrationSource) {
  assert(platformMigrationSource.split("seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()").length >= 3, "PostgreSQL platform list and lifecycle database boundaries must share natural expiry SQL");
  assert(!source.includes("async function assertTenantHasSeatCapacity"), "PostgreSQL invitation facade must not retain a raw RLS capacity helper outside its SECURITY DEFINER RPC");
}

function replaceRequired(source, from, to, label) {
  assert(source.includes(from), `${label} mutation target must exist`);
  return source.replace(from, to);
}

function replaceInMemoryLifecycle(source, from, to, label) {
  const start = source.indexOf("export async function updateTenantAccountLifecycle");
  const end = source.indexOf("export async function listTenantMemberships", start);
  assert(start >= 0 && end > start, "memory lifecycle mutation boundary must exist");
  const lifecycle = replaceRequired(source.slice(start, end), from, to, label);
  return source.slice(0, start) + lifecycle + source.slice(end);
}

function assertNegativeSynthetic(check, source, message) {
  let rejected = false;
  try {
    check(source);
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

function assertPlatformOwnerInvitedEmailFollowup(source) {
  const signatures = new Map([
    ["create_platform_tenant_account", { ddl: "TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, DATE, DATE, TEXT, TEXT", registry: "text,text,text,text,text,integer,date,date,text,text" }],
    ["prepare_tenant_invitation_delivery", { ddl: "TEXT, TEXT, TEXT, TEXT", registry: "text,text,text,text" }],
    ["refresh_tenant_invitation", { ddl: "TEXT, TEXT, TEXT, TEXT", registry: "text,text,text,text" }],
    ["accept_tenant_invitation", { ddl: "TEXT, TEXT, TEXT, TEXT", registry: "text,text,text,text" }],
  ]);
  for (const [functionName, signature] of signatures) {
    const guardSource = `IF pg_catalog.to_regprocedure('brokerdesk_private.${functionName}_task043_legacy(${signature.registry})') IS NULL THEN`;
    const guard = source.indexOf(guardSource);
    const rename = source.indexOf(`RENAME TO ${functionName}_task043_legacy;`, guard);
    const guardEnd = source.indexOf("END IF;", rename);
    assert(guard >= 0 && rename > guard && guardEnd > rename, `${functionName} legacy rename must be enclosed by its exact idempotence guard`);
    assert(source.split(`RENAME TO ${functionName}_task043_legacy;`).length === 2, `${functionName} legacy rename must occur only once`);
    assert(source.includes(`CREATE OR REPLACE FUNCTION brokerdesk_private.${functionName}(`), `${functionName} original runtime signature must be restored by the follow-up`);
    assert(source.includes(`REVOKE ALL ON FUNCTION brokerdesk_private.${functionName}_task043_legacy`), `${functionName} legacy primitive must remain unavailable to runtime callers`);
    assert(source.includes(`REVOKE ALL ON FUNCTION brokerdesk_private.${functionName}_task043_legacy(${signature.ddl}) FROM brokerdesk_runtime`), `${functionName} legacy primitive must revoke the runtime role explicitly`);
    assert(source.includes(`REVOKE ALL ON FUNCTION brokerdesk_private.${functionName}(${signature.ddl}) FROM PUBLIC`), `${functionName} wrapper must remain unavailable to PUBLIC`);
    assert(source.includes(`GRANT EXECUTE ON FUNCTION brokerdesk_private.${functionName}(${signature.ddl}) TO brokerdesk_runtime`), `${functionName} wrapper must restore only the runtime execution grant`);
  }
  assert(source.split("SECURITY DEFINER").length === 5 && source.split("SET search_path = public, pg_temp").length === 5, "all four follow-up wrappers must preserve fixed SECURITY DEFINER boundaries");
  assert(source.includes("create_platform_tenant_account_task043_legacy") && source.includes("SET invited_email = lower(trim(users.email))"), "platform creation wrapper must persist the normalized owner invited email in the same transaction");
  assert(source.includes("prepare_tenant_invitation_delivery_task043_legacy") && source.includes("jsonb_build_object('membership', to_jsonb(memberships), 'user', to_jsonb(users))"), "prepare wrapper must return the repaired locked member context");
  assert(source.includes("refresh_tenant_invitation_task043_legacy") && source.includes("FOR UPDATE OF users"), "refresh wrapper must lock the target user before repair");
  const acceptStart = source.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.accept_tenant_invitation(");
  const acceptSource = source.slice(acceptStart);
  const firstLegacyCall = acceptSource.indexOf("accept_tenant_invitation_task043_legacy(");
  const boundLookup = acceptSource.indexOf("users.external_auth_subject IS NOT NULL", firstLegacyCall);
  const tokenGuard = acceptSource.indexOf("memberships.invitation_token = trim", firstLegacyCall);
  const expiryGuard = acceptSource.indexOf("memberships.invitation_expires_at > NOW()", firstLegacyCall);
  const repair = acceptSource.indexOf("SET invited_email = bound_user_email", firstLegacyCall);
  const secondLegacyCall = acceptSource.indexOf("accept_tenant_invitation_task043_legacy(", firstLegacyCall + 1);
  assert(firstLegacyCall >= 0 && boundLookup > firstLegacyCall && tokenGuard > firstLegacyCall && expiryGuard > firstLegacyCall && repair > boundLookup && repair > tokenGuard && repair > expiryGuard && secondLegacyCall > repair, "legacy NULL acceptance must run the original guards, verify bound user/token/expiry, repair, then re-enter atomic acceptance");
}

const read = (path) => fs.readFileSync(path, "utf8");
const service = read("src/lib/tenant-service.ts");
const memory = read("src/lib/data.memory.ts");
const postgres = read("src/lib/data.postgres.ts");
const migration = read("db/migrations/20260828_001_tenant_service_period.sql");
const invitedEmailFollowupMigration = read("db/migrations/20260829_001_platform_owner_invited_email.sql");
const clerkAuth = read("src/lib/clerk-auth.ts");
assert(createHash("sha256").update(migration).digest("hex") === "bfc0815e633f58f5596bfcce62d754161d7291231c620dd8fe1fde77559348d3", "already-applied 20260828 migration checksum must remain exact");
assertPlatformOwnerInvitedEmailFollowup(invitedEmailFollowupMigration);
for (const [needle, replacement, label] of [
  ["IF pg_catalog.to_regprocedure('brokerdesk_private.accept_tenant_invitation_task043_legacy(text,text,text,text)') IS NULL THEN", "IF TRUE THEN", "idempotent legacy rename"],
  ["users.external_auth_subject IS NOT NULL", "TRUE", "bound target identity"],
  ["memberships.invitation_token = trim", "memberships.invitation_token <> trim", "legacy token guard"],
  ["memberships.invitation_expires_at > NOW()", "memberships.invitation_expires_at < NOW()", "legacy expiry guard"],
  ["SET invited_email = bound_user_email", "SET invited_email = NULL", "legacy invited email repair"],
  ["REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation_task043_legacy(TEXT, TEXT, TEXT, TEXT) FROM brokerdesk_runtime", "GRANT EXECUTE ON FUNCTION brokerdesk_private.accept_tenant_invitation_task043_legacy(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime", "legacy runtime ACL"],
  ["REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC", "GRANT EXECUTE ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO PUBLIC", "wrapper public ACL"],
]) {
  assertNegativeSynthetic(assertPlatformOwnerInvitedEmailFollowup, replaceRequired(invitedEmailFollowupMigration, needle, replacement, label), `${label} mutation must fail`);
}
const runtimeRoles = read("docs/engineering/postgres_runtime_roles.sql");
const forceRlsMigration = read("db/migrations/20260729_002_force_tenant_rls.sql");
const session = read("src/lib/tenant-session.ts");
const platformSession = read("src/lib/platform-session.ts");
const nav = read("src/components/app-nav.tsx");
const mainNav = read("src/components/main-nav-links.tsx");
const routeTitle = read("src/components/app-route-title.tsx");
const actions = read("src/app/actions.ts");
assert(!actions.includes("[TASK043_ACCEPT_DIAG]") && !clerkAuth.includes("[TASK043_ACCEPT_DIAG]"), "temporary acceptance diagnostics must not remain in the final tree");
const platformPage = read("src/app/platform/accounts/page.tsx");
const platformTemplatesPage = read("src/app/platform/templates/page.tsx");
const membersPage = read("src/app/settings/members/page.tsx");
const memberManagementCopy = read("src/lib/member-management-copy.ts");
const servicePage = read("src/app/service-status/page.tsx");
const workspacePage = read("src/app/workspace/page.tsx");
const invitationPage = read("src/app/workspace/invitations/page.tsx");
const invitationForm = read("src/app/workspace/invitations/accept-invitation-form.tsx");
const task043 = read("docs/tasks/TASK-043.md");
const createAction = actions.slice(
  actions.indexOf("export async function createTenantAccountAction"),
  actions.indexOf("export async function updateTenantAccountLifecycleAction"),
);
const memoryCreate = memory.slice(
  memory.indexOf("export async function createTenantAccount("),
  memory.indexOf("/** Creates a company for the already-authenticated local user. */"),
);
const postgresCreate = postgres.slice(
  postgres.indexOf("export async function createTenantAccount("),
  postgres.indexOf("export async function updateTenantAccountLifecycle("),
);
const importClaimStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.claim_next_import_jobs");
const importClaimFunction = importClaimStart >= 0 ? migration.slice(importClaimStart) : "";
const externalAuthSuspendStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.suspend_external_auth_user");
const externalAuthSyncStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.sync_external_auth_user");
const refreshInvitationStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.refresh_tenant_invitation");
const prepareInvitationStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery");
const recordInvitationStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.record_tenant_invitation_delivery");
const memberCapabilityStartForInvitation = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.update_tenant_member_capability", recordInvitationStart);
const memberStatusStartForInvitation = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.update_tenant_member_status");
const recordInvitationEnd = memberCapabilityStartForInvitation > recordInvitationStart
  ? memberCapabilityStartForInvitation
  : memberStatusStartForInvitation;
const refreshInvitationFunction = refreshInvitationStart >= 0 && recordInvitationStart > refreshInvitationStart
  ? migration.slice(refreshInvitationStart, recordInvitationStart)
  : "";
const prepareInvitationFunction = prepareInvitationStart >= 0 && refreshInvitationStart > prepareInvitationStart
  ? migration.slice(prepareInvitationStart, refreshInvitationStart)
  : "";
const recordInvitationFunction = recordInvitationStart >= 0 && recordInvitationEnd > recordInvitationStart
  ? migration.slice(recordInvitationStart, recordInvitationEnd)
  : "";
const externalAuthSuspendEnd = prepareInvitationStart > externalAuthSuspendStart ? prepareInvitationStart : refreshInvitationStart;
const externalAuthSuspendFunction = externalAuthSuspendStart >= 0 && externalAuthSuspendEnd > externalAuthSuspendStart
  ? migration.slice(externalAuthSuspendStart, externalAuthSuspendEnd)
  : "";
const externalAuthSyncFunction = externalAuthSyncStart >= 0 && externalAuthSuspendStart > externalAuthSyncStart
  ? migration.slice(externalAuthSyncStart, externalAuthSuspendStart)
  : "";
const tenantRlsStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.can_access_tenant");
const tenantRlsCoreEnd = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.can_access_user");
const tenantRlsEnd = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.enforce_tenant_service_for_invitation");
const tenantRlsFunction = tenantRlsStart >= 0 && tenantRlsCoreEnd > tenantRlsStart ? migration.slice(tenantRlsStart, tenantRlsCoreEnd) : "";
const createInvitationStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.create_tenant_invitation");
const createInvitationFunction = createInvitationStart >= 0 && tenantRlsEnd > createInvitationStart ? migration.slice(createInvitationStart, tenantRlsEnd) : "";
const rosterReadStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.list_tenant_members_for_current_tenant");
const rosterReadEnd = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.list_pending_tenant_invitations_for_current_user");
const rosterReadFunction = rosterReadStart >= 0 && rosterReadEnd > rosterReadStart ? migration.slice(rosterReadStart, rosterReadEnd) : "";
const acceptInvitationStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.accept_tenant_invitation");
const acceptInvitationEnd = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.bind_current_clerk_identity_to_pending_invitation", acceptInvitationStart);
const acceptInvitationFunction = acceptInvitationStart >= 0 && acceptInvitationEnd > acceptInvitationStart ? migration.slice(acceptInvitationStart, acceptInvitationEnd) : "";
const memoryAcceptInvitation = memory.slice(
  memory.indexOf("export async function acceptTenantInvitation("),
  memory.indexOf("export async function getTenantMembership(", memory.indexOf("export async function acceptTenantInvitation(")),
);
const acceptInvitationAction = actions.slice(
  actions.indexOf("export async function acceptTenantInvitationAction"),
  actions.indexOf("export async function createTenantAccountAction", actions.indexOf("export async function acceptTenantInvitationAction")),
);
const acceptInvitationActionLocaleSource = actions.slice(
  actions.indexOf("export type TenantInvitationActionMessageToken"),
  actions.indexOf("export async function createTenantAccountAction", actions.indexOf("export type TenantInvitationActionMessageToken")),
);
const memoryExternalAuthSuspend = memory.slice(
  memory.indexOf("export async function suspendUserForExternalAuthSubject"),
  memory.indexOf("export async function getDefaultUser"),
);
const postgresExternalAuthSuspend = postgres.slice(
  postgres.indexOf("export async function suspendUserForExternalAuthSubject"),
  postgres.indexOf("export async function getDefaultUser"),
);
const memberCapabilityStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.update_tenant_member_capability");
const memberMutationStatusStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.update_tenant_member_status", memberCapabilityStart);
const memberMutationStatusEnd = migration.indexOf("-- The adapter records tenant_subscription_updated", memberMutationStatusStart);
const memberCapabilityFunction = memberCapabilityStart >= 0 && memberMutationStatusStart > memberCapabilityStart
  ? migration.slice(memberCapabilityStart, memberMutationStatusStart)
  : "";
const memberMutationStatusFunction = memberMutationStatusStart >= 0 && memberMutationStatusEnd > memberMutationStatusStart
  ? migration.slice(memberMutationStatusStart, memberMutationStatusEnd)
  : "";
const memoryMemberRole = memory.slice(memory.indexOf("export async function updateTenantMemberRole"), memory.indexOf("export async function updateTenantMemberStatus"));
const memoryMemberStatus = memory.slice(memory.indexOf("export async function updateTenantMemberStatus"), memory.indexOf("export async function listCaseWorkbenchFieldRules"));
const memoryInvite = memory.slice(memory.indexOf("export async function inviteTenantMember"), memory.indexOf("export async function updateTenantMemberRole"));
const postgresInvite = postgres.slice(postgres.indexOf("export async function inviteTenantMember"), postgres.indexOf("export async function updateTenantMemberRole"));
const postgresMemberStatus = postgres.slice(postgres.indexOf("export async function updateTenantMemberStatus"), postgres.indexOf("export async function listCaseWorkbenchFieldRules"));
const memberStatusAction = actions.slice(actions.indexOf("export async function updateTenantMemberStatusAction"), actions.indexOf("export async function revokeTenantMemberInvitationAction"));
const memoryInvitationDelivery = memory.slice(memory.indexOf("export async function updateTenantMemberInvitation"), memory.indexOf("export async function refreshTenantMemberInvitation"));
const postgresInvitationDelivery = postgres.slice(postgres.indexOf("export async function updateTenantMemberInvitation"), postgres.indexOf("export async function refreshTenantMemberInvitation"));
const postgresInvitationPrepare = postgres.slice(postgres.indexOf("export async function refreshTenantMemberInvitation"), postgres.indexOf("export async function inviteTenantMember"));
const invitationSender = actions.slice(actions.indexOf("async function sendTenantMemberInvitation"), actions.indexOf("export type CreateTenantActionState"));

for (const token of ["Asia/Tokyo", "pending", "active", "expiring", "expired", "suspended", "cancelled"]) {
  assert(service.includes(token), `tenant-service must own ${token} semantics`);
}
assert(service.includes("TENANT_SERVICE_STATUS_LABELS") && service.includes("getTenantServiceStatusLabel"), "tenant-service must own the shared ja/zh/ko service-status labels");
assert(memory.includes("serviceStartAt") && memory.includes("serviceEndAt"), "memory tenant model must include service dates");
assert(postgres.includes("service_start_at") && postgres.includes("service_end_at"), "PostgreSQL adapter must map service dates");
assert(migration.includes("service_start_at DATE") && migration.includes("service_end_at DATE"), "migration must add DATE columns");
assert(migration.includes("tenant_subscription_updated"), "migration must audit commercial updates");
assertImportWorkerClaimScope(importClaimFunction);
assertTenantRlsServiceScope(tenantRlsFunction);
assertRelatedTenantServiceFunctions(migration.slice(tenantRlsStart, tenantRlsEnd));
assertCreateInvitationCapacityBoundary(createInvitationFunction);
assertInvitationTenantLockAuthorityOrder(createInvitationFunction, "create_tenant_invitation", false);
assertPostgresSeatExpiryFacade(postgres, migration);
assertRestrictedMemberRosterRead(rosterReadFunction);
assertMemoryLifecycleAtomicity(memory);
assertMemoryMemberMutationBoundary({ roleSource: memoryMemberRole, statusSource: memoryMemberStatus, fullSource: memory });
assertInvitationCreationBoundary({ memorySource: memoryInvite, memoryFullSource: memory, postgresSource: postgresInvite, sqlSource: createInvitationFunction });
for (const [label, mutatedPostgresInvite] of [
  [
    "raw tenant capacity preflight",
    postgresInvite.replace(
      "  return withTransaction(async (client) => {",
      '  return withTransaction(async (client) => {\n    await client.query("SELECT id FROM tenants WHERE id = $1 FOR UPDATE", [scopeTenantId]);',
    ),
  ],
  [
    "raw membership preflight",
    postgresInvite.replace(
      "  return withTransaction(async (client) => {",
      '  return withTransaction(async (client) => {\n    await client.query("SELECT status FROM tenant_memberships WHERE tenant_id = $1", [scopeTenantId]);',
    ),
  ],
]) {
  assertNegativeSynthetic(
    (candidate) => assertInvitationCreationBoundary({ memorySource: memoryInvite, memoryFullSource: memory, postgresSource: candidate, sqlSource: createInvitationFunction }),
    mutatedPostgresInvite,
    `PostgreSQL ${label} mutation must be rejected`,
  );
}
assertMemberStatusAcceptanceBoundary({ actionSource: memberStatusAction, memorySource: memoryMemberStatus, postgresSource: postgresMemberStatus, sqlSource: memberMutationStatusFunction });
assertInvitationDeliveryBoundary({ memorySource: memoryInvitationDelivery, postgresSource: postgresInvitationDelivery, sqlSource: recordInvitationFunction });
assertPlpgsqlCompositeIntoShape(migration);
assertNegativeSynthetic(
  assertPlpgsqlCompositeIntoShape,
  replaceRequired(
    migration,
    "  SELECT tenant_account.*\n  INTO tenant_row\n  FROM public.tenants AS tenant_account",
    "  SELECT tenant_account, tenant_account.purchased_seat_count, tenant_account.status,\n         tenant_account.service_start_at, tenant_account.service_end_at\n  INTO tenant_row, purchased_seat_count, tenant_status,\n       tenant_service_start_at, tenant_service_end_at\n  FROM public.tenants AS tenant_account",
    "illegal composite multi-item INTO",
  ),
  "restoring a composite record plus scalar multi-item INTO must be rejected",
);
assertPlatformInvitationDeliveryBoundary({ actionSource: invitationSender, postgresPrepareSource: postgresInvitationPrepare, postgresRecordSource: postgresInvitationDelivery, sqlSource: prepareInvitationFunction });
assert(invitedEmailFollowupMigration.includes("prepare_tenant_invitation_delivery_task043_legacy") && invitedEmailFollowupMigration.includes("memberships.invited_email IS NULL"), "platform invitation prepare follow-up must backfill a legacy NULL invited email from the locked target user");
assert(invitedEmailFollowupMigration.includes("refresh_tenant_invitation_task043_legacy") && invitedEmailFollowupMigration.includes("FOR UPDATE OF users"), "invitation refresh follow-up must lock the target user before legacy NULL email repair");
assertPlatformInvitationRuntimeProbe(task043);
assertInvitationDeliveryAuditAtomicity({ senderSource: invitationSender, actionSource: actions, memorySource: memoryInvitationDelivery, sqlSource: recordInvitationFunction, migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage });
for (const [label, candidate] of [
  ["delivery split writer", {
    senderSource: replaceRequired(invitationSender, "  const prepared =", "  await addAuditLog({});\n  const prepared =", "delivery split writer"),
    actionSource: actions, memorySource: memoryInvitationDelivery, sqlSource: recordInvitationFunction, migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["delivery uncertain outcome", {
    senderSource: replaceRequired(invitationSender, "uncertain: true", "uncertain: false", "delivery uncertain outcome"),
    actionSource: actions, memorySource: memoryInvitationDelivery, sqlSource: recordInvitationFunction, migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["delivery null success fallback", {
    senderSource: replaceRequired(invitationSender, "if (!updated) return { member, sent: false, skipped: false, uncertain: true };\n      return { member: updated, sent: true", "return { member: updated ?? member, sent: true", "delivery null success fallback"),
    actionSource: actions, memorySource: memoryInvitationDelivery, sqlSource: recordInvitationFunction, migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["customer uncertain split audit", {
    senderSource: invitationSender,
    actionSource: replaceRequired(actions, '  if (invitation.uncertain) redirect("/settings/members?flash=invitation_delivery_uncertain");\n', "", "customer uncertain split audit"),
    memorySource: memoryInvitationDelivery, sqlSource: recordInvitationFunction, migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["memory delivery audit insertion", {
    senderSource: invitationSender, actionSource: actions,
    memorySource: replaceRequired(memoryInvitationDelivery, "    nextDb.auditLogs.unshift(audit);", "", "memory delivery audit insertion"),
    sqlSource: recordInvitationFunction, migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["memory delivery duplicate protection", {
    senderSource: invitationSender, actionSource: actions,
    memorySource: replaceRequired(memoryInvitationDelivery, "if (isDuplicateDeliveryFinalization)", "if (false)", "memory delivery duplicate protection"),
    sqlSource: recordInvitationFunction, migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["memory concurrent release guard", {
    senderSource: invitationSender, actionSource: actions,
    memorySource: replaceRequired(memoryInvitationDelivery, '  if (input.invitationProvider === "clerk" && (membership.invitationStatus === "revoked" || membership.invitationStatus === "expired")) return null;\n', "", "memory concurrent release guard"),
    sqlSource: recordInvitationFunction, migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["SQL delivery update rowcount", {
    senderSource: invitationSender, actionSource: actions, memorySource: memoryInvitationDelivery,
    sqlSource: replaceRequired(recordInvitationFunction, "GET DIAGNOSTICS delivery_update_row_count = ROW_COUNT", "delivery_update_row_count := 1", "SQL delivery update rowcount"),
    migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["SQL delivery audit insertion", {
    senderSource: invitationSender, actionSource: actions, memorySource: memoryInvitationDelivery,
    sqlSource: replaceRequired(recordInvitationFunction, "INSERT INTO public.audit_logs", "INSERT INTO public.audit_log_mutation", "SQL delivery audit insertion"),
    migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["SQL concurrent release guard", {
    senderSource: invitationSender, actionSource: actions, memorySource: memoryInvitationDelivery,
    sqlSource: replaceRequired(recordInvitationFunction, " OR (p_provider = 'clerk' AND target_invitation_status IN ('revoked', 'expired'))", "", "SQL concurrent release guard"),
    migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["SQL delivery audit rowcount", {
    senderSource: invitationSender, actionSource: actions, memorySource: memoryInvitationDelivery,
    sqlSource: replaceRequired(recordInvitationFunction, "GET DIAGNOSTICS delivery_audit_row_count = ROW_COUNT", "delivery_audit_row_count := 1", "SQL delivery audit rowcount"),
    migrationSource: migration, memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["delivery audit policy command", {
    senderSource: invitationSender, actionSource: actions, memorySource: memoryInvitationDelivery, sqlSource: recordInvitationFunction,
    migrationSource: replaceRequired(migration, "CREATE POLICY brokerdesk_tenant_invitation_delivery_audit_insert\nON public.audit_logs\nFOR INSERT", "CREATE POLICY brokerdesk_tenant_invitation_delivery_audit_insert\nON public.audit_logs\nFOR ALL", "delivery audit policy command"),
    memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["delivery audit policy target", {
    senderSource: invitationSender, actionSource: actions, memorySource: memoryInvitationDelivery, sqlSource: recordInvitationFunction,
    migrationSource: replaceRequired(migration, "      AND delivery_target.tenant_id = audit_logs.tenant_id", "", "delivery audit policy target"),
    memberCopySource: memberManagementCopy, membersPageSource: membersPage,
  }],
  ["member uncertain warning tone", {
    senderSource: invitationSender, actionSource: actions, memorySource: memoryInvitationDelivery, sqlSource: recordInvitationFunction, migrationSource: migration, memberCopySource: memberManagementCopy,
    membersPageSource: replaceRequired(membersPage, ', "invitation_delivery_uncertain"', "", "member uncertain warning tone"),
  }],
]) {
  assertNegativeSynthetic(assertInvitationDeliveryAuditAtomicity, candidate, `${label} mutation must be rejected`);
}
for (const locale of ["ja", "zh", "ko"]) {
  assertNegativeSynthetic(
    assertInvitationDeliveryAuditAtomicity,
    {
      senderSource: invitationSender, actionSource: actions, memorySource: memoryInvitationDelivery, sqlSource: recordInvitationFunction, migrationSource: migration,
      memberCopySource: replaceRequired(memberManagementCopy, `${locale}: "${MEMBER_INVITATION_UNCERTAIN_COPY[locale]}"`, `${locale}: "copy mutation"`, `member uncertain ${locale} copy`),
      membersPageSource: membersPage,
    },
    `member uncertain ${locale} copy mutation must be rejected`,
  );
}
for (const [label, candidate] of [
  ["sender ordinary tenant pre-read", {
    actionSource: replaceRequired(invitationSender, "}) {\n  const prepared", "}) {\n  await getTenantById(input.tenantId);\n  const prepared", "sender ordinary tenant pre-read"),
    postgresPrepareSource: postgresInvitationPrepare,
    postgresRecordSource: postgresInvitationDelivery,
    sqlSource: prepareInvitationFunction,
  }],
  ["sender ordinary member post-read", {
    actionSource: replaceRequired(invitationSender, "  const member = prepared.member;", "  const member = (await getTenantMemberById({ tenantId: input.tenantId, membershipId: input.membershipId })) ?? prepared.member;", "sender ordinary member post-read"),
    postgresPrepareSource: postgresInvitationPrepare,
    postgresRecordSource: postgresInvitationDelivery,
    sqlSource: prepareInvitationFunction,
  }],
  ["prepare facade ordinary RLS read", {
    actionSource: invitationSender,
    postgresPrepareSource: replaceRequired(postgresInvitationPrepare, "  const actorUserId = await getAuthenticatedInvitationActorId(input.invitedByUserId);", "  await getTenantMemberById({ tenantId: scopeTenantId, membershipId: input.membershipId });\n  const actorUserId = await getAuthenticatedInvitationActorId(input.invitedByUserId);", "prepare facade ordinary RLS read"),
    postgresRecordSource: postgresInvitationDelivery,
    sqlSource: prepareInvitationFunction,
  }],
  ["delivery facade post-read", {
    actionSource: invitationSender,
    postgresPrepareSource: postgresInvitationPrepare,
    postgresRecordSource: replaceRequired(postgresInvitationDelivery, "  const membership = mapTenantMembership(result.rows[0]);", "  await getTenantMemberById({ tenantId: scopeTenantId, membershipId: input.membershipId });\n  const membership = mapTenantMembership(result.rows[0]);", "delivery facade post-read"),
    sqlSource: prepareInvitationFunction,
  }],
  ["prepare actor lock", {
    actionSource: invitationSender,
    postgresPrepareSource: postgresInvitationPrepare,
    postgresRecordSource: postgresInvitationDelivery,
    sqlSource: replaceRequired(prepareInvitationFunction, "FOR UPDATE OF authorized_actor_memberships;", ";", "prepare actor lock"),
  }],
  ["prepare target lock", {
    actionSource: invitationSender,
    postgresPrepareSource: postgresInvitationPrepare,
    postgresRecordSource: postgresInvitationDelivery,
    sqlSource: replaceRequired(prepareInvitationFunction, "FOR UPDATE OF target_membership;", ";", "prepare target lock"),
  }],
  ["prepare full context return", {
    actionSource: invitationSender,
    postgresPrepareSource: postgresInvitationPrepare,
    postgresRecordSource: postgresInvitationDelivery,
    sqlSource: replaceRequired(prepareInvitationFunction, "jsonb_build_object('membership', to_jsonb(updated_membership), 'user', to_jsonb(invited_user_row))", "to_jsonb(updated_membership)", "prepare full context return"),
  }],
  ["prepare runtime ACL", {
    actionSource: invitationSender,
    postgresPrepareSource: postgresInvitationPrepare,
    postgresRecordSource: postgresInvitationDelivery,
    sqlSource: replaceRequired(prepareInvitationFunction, "REVOKE ALL ON FUNCTION brokerdesk_private.prepare_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;", "", "prepare runtime ACL"),
  }],
]) {
  assertNegativeSynthetic(assertPlatformInvitationDeliveryBoundary, candidate, `${label} mutation must be rejected`);
}
assertNegativeSynthetic(
  assertPlatformInvitationRuntimeProbe,
  replaceRequired(task043, "SET LOCAL ROLE brokerdesk_runtime", "SET LOCAL ROLE brokerdesk_admin", "platform invitation restricted runtime probe"),
  "platform invitation restricted runtime probe mutation must be rejected",
);
assertInvitationAcceptanceBoundary({ sqlSource: acceptInvitationFunction, postgresSource: postgres });
assertInvitationAcceptanceAtomicity({ memorySource: memoryAcceptInvitation, sqlSource: acceptInvitationFunction, migrationSource: migration, actionSource: acceptInvitationAction, forceRlsSource: forceRlsMigration });
assertInvitationActionLocaleContract({ actionSource: acceptInvitationActionLocaleSource, formSource: invitationForm, pageSource: invitationPage });
for (const [label, candidate] of [
  ["acceptance service guard", {
    sqlSource: replaceRequired(acceptInvitationFunction, "tenant_status IN ('suspended', 'cancelled')", "FALSE", "acceptance service guard"),
    postgresSource: postgres,
  }],
  ["acceptance Tokyo end boundary", {
    sqlSource: replaceRequired(acceptInvitationFunction, "     OR tenant_service_end_at < tokyo_today THEN", "     OR FALSE THEN", "acceptance Tokyo end boundary"),
    postgresSource: postgres,
  }],
  ["acceptance tenant lock", {
    sqlSource: replaceRequired(acceptInvitationFunction, "  FOR UPDATE;\n  IF NOT FOUND THEN", "  ;\n  IF NOT FOUND THEN", "acceptance tenant lock"),
    postgresSource: postgres,
  }],
  ["acceptance runtime ACL", {
    sqlSource: replaceRequired(acceptInvitationFunction, "REVOKE ALL ON FUNCTION brokerdesk_private.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;", "", "acceptance runtime ACL"),
    postgresSource: postgres,
  }],
  ["acceptance complete return", {
    sqlSource: replaceRequired(acceptInvitationFunction, "    AND memberships.status = 'active'\n    AND memberships.invitation_status = 'accepted';", "    AND memberships.status = 'invited';", "acceptance complete return"),
    postgresSource: postgres,
  }],
  ["acceptance post-commit RLS read", {
    sqlSource: acceptInvitationFunction,
    postgresSource: replaceRequired(postgres, "  return result.rows[0] ? mapTenantMemberJoinedRow(result.rows[0]) : null;", "  if (!result.rows[0]) return null;\n  return getTenantMemberById({ tenantId: input.tenantId, membershipId: input.membershipId });", "acceptance direct return mapping"),
  }],
  ["acceptance partial-success update", {
    sqlSource: replaceRequired(acceptInvitationFunction, "  SET status = 'active',", "  SET status = 'invited',", "acceptance active update"),
    postgresSource: postgres,
  }],
]) {
  assertNegativeSynthetic(assertInvitationAcceptanceBoundary, candidate, `${label} mutation must be rejected`);
}
for (const [label, candidate] of [
  ["memory acceptance audit insertion", {
    memorySource: replaceRequired(memoryAcceptInvitation, "    nextDb.auditLogs.unshift(audit);\n", "", "memory acceptance audit insertion"),
    sqlSource: acceptInvitationFunction,
    migrationSource: migration,
    actionSource: acceptInvitationAction,
    forceRlsSource: forceRlsMigration,
  }],
  ["memory acceptance single publish", {
    memorySource: replaceRequired(memoryAcceptInvitation, "    nextDb.auditLogs.unshift(audit);", "    _g.__brokerDb = nextDb;\n    nextDb.auditLogs.unshift(audit);", "memory acceptance single publish"),
    sqlSource: acceptInvitationFunction,
    migrationSource: migration,
    actionSource: acceptInvitationAction,
    forceRlsSource: forceRlsMigration,
  }],
  ["SQL acceptance audit insertion", {
    memorySource: memoryAcceptInvitation,
    sqlSource: replaceRequired(acceptInvitationFunction, "  INSERT INTO public.audit_logs (", "  INSERT INTO public.users (", "SQL acceptance audit insertion"),
    migrationSource: migration,
    actionSource: acceptInvitationAction,
    forceRlsSource: forceRlsMigration,
  }],
  ["SQL acceptance audit actor", {
    memorySource: memoryAcceptInvitation,
    sqlSource: replaceRequired(acceptInvitationFunction, "p_tenant_id, current_user_id, current_user_id", "p_tenant_id, p_target_user_id, p_target_user_id", "SQL acceptance audit actor"),
    migrationSource: migration,
    actionSource: acceptInvitationAction,
    forceRlsSource: forceRlsMigration,
  }],
  ["acceptance policy current actor", {
    memorySource: memoryAcceptInvitation,
    sqlSource: acceptInvitationFunction,
    migrationSource: replaceRequired(migration, "  AND audit_logs.actor_id = brokerdesk_private.current_user_id()\n  AND audit_logs.action = 'tenant_invitation_accepted'", "  AND audit_logs.action = 'tenant_invitation_accepted'", "acceptance policy current actor"),
    actionSource: acceptInvitationAction,
    forceRlsSource: forceRlsMigration,
  }],
  ["acceptance policy accepted target", {
    memorySource: memoryAcceptInvitation,
    sqlSource: acceptInvitationFunction,
    migrationSource: replaceRequired(migration, "      AND accepted_membership.invitation_status = 'accepted'", "      AND accepted_membership.invitation_status = 'pending'", "acceptance policy accepted target"),
    actionSource: acceptInvitationAction,
    forceRlsSource: forceRlsMigration,
  }],
  ["acceptance policy command scope", {
    memorySource: memoryAcceptInvitation,
    sqlSource: acceptInvitationFunction,
    migrationSource: replaceRequired(migration, "CREATE POLICY brokerdesk_tenant_invitation_acceptance_audit_insert\nON public.audit_logs\nFOR INSERT", "CREATE POLICY brokerdesk_tenant_invitation_acceptance_audit_insert\nON public.audit_logs\nFOR ALL", "acceptance policy command scope"),
    actionSource: acceptInvitationAction,
    forceRlsSource: forceRlsMigration,
  }],
  ["Action split acceptance audit", {
    memorySource: memoryAcceptInvitation,
    sqlSource: acceptInvitationFunction,
    migrationSource: migration,
    actionSource: replaceRequired(acceptInvitationAction, "    invitationAccepted = true;", "    await addAuditLog({ action: 'tenant_invitation_accepted' });\n    invitationAccepted = true;", "Action split acceptance audit"),
    forceRlsSource: forceRlsMigration,
  }],
  ["Action postcommit truth", {
    memorySource: memoryAcceptInvitation,
    sqlSource: acceptInvitationFunction,
    migrationSource: migration,
    actionSource: replaceRequired(acceptInvitationAction, "    if (invitationAccepted) {\n      return { status: \"error\", message: \"accepted_workspace_switch_failed\" };\n    }", "", "Action postcommit truth"),
    forceRlsSource: forceRlsMigration,
  }],
]) {
  assertNegativeSynthetic(assertInvitationAcceptanceAtomicity, candidate, `${label} mutation must be rejected`);
}
for (const [token, expected] of Object.entries(INVITATION_ACTION_MESSAGE_EXPECTATIONS)) {
  assertNegativeSynthetic(
    assertInvitationActionLocaleContract,
    {
      actionSource: replaceRequired(acceptInvitationActionLocaleSource, `message: "${token}"`, 'message: "unknown_invitation_token"', `${token} Action token`),
      formSource: invitationForm,
      pageSource: invitationPage,
    },
    `${token} Action token mutation must be rejected`,
  );
  for (const locale of ["ja", "zh", "ko"]) {
    assertNegativeSynthetic(
      assertInvitationActionLocaleContract,
      {
        actionSource: acceptInvitationActionLocaleSource,
        formSource: replaceRequired(invitationForm, `${locale}: "${expected[locale]}"`, `${locale}: "copy mutation"`, `${token} ${locale} invitation copy`),
        pageSource: invitationPage,
      },
      `${token} ${locale} invitation copy mutation must be rejected`,
    );
  }
}
for (const [label, candidate] of [
  ["invitation unknown-token guard", {
    actionSource: acceptInvitationActionLocaleSource,
    formSource: replaceRequired(invitationForm, "Object.prototype.hasOwnProperty.call(INVITATION_MESSAGE_COPY, token)", "true", "invitation unknown-token guard"),
    pageSource: invitationPage,
  }],
  ["invitation unknown-token fallback", {
    actionSource: acceptInvitationActionLocaleSource,
    formSource: replaceRequired(invitationForm, ": INVITATION_MESSAGE_COPY.invitation_accept_failed;", ": token;", "invitation unknown-token fallback"),
    pageSource: invitationPage,
  }],
  ["invitation raw-token rendering", {
    actionSource: acceptInvitationActionLocaleSource,
    formSource: replaceRequired(invitationForm, "{state.message ? getInvitationMessage(state.message, locale) : INVITATION_MESSAGE_COPY.invitation_accept_failed[locale]}", "{state.message}", "invitation raw-token rendering"),
    pageSource: invitationPage,
  }],
  ["invitation page locale wiring", {
    actionSource: acceptInvitationActionLocaleSource,
    formSource: invitationForm,
    pageSource: replaceRequired(invitationPage, "                locale={locale}\n", "", "invitation page locale wiring"),
  }],
]) {
  assertNegativeSynthetic(assertInvitationActionLocaleContract, candidate, `${label} mutation must be rejected`);
}
assertPlatformFlashContract({ actionSource: actions, pageSource: platformPage });
for (const [token, expected] of Object.entries(PLATFORM_FLASH_EXPECTATIONS)) {
  for (const locale of ["ja", "zh", "ko"]) {
    assertNegativeSynthetic(
      assertPlatformFlashContract,
      { actionSource: actions, pageSource: replaceRequired(platformPage, `${locale}: "${expected[locale]}"`, `${locale}: "copy mutation"`, `${token} ${locale} flash copy`) },
      `${token} ${locale} copy mutation must be rejected`,
    );
  }
  const mutatedTone = expected.tone === "success" ? "error" : "success";
  assertNegativeSynthetic(
    assertPlatformFlashContract,
    { actionSource: actions, pageSource: replaceRequired(platformPage, `${token}: {\n    tone: "${expected.tone}"`, `${token}: {\n    tone: "${mutatedTone}"`, `${token} flash tone`) },
    `${token} tone mutation must be rejected`,
  );
}
for (const [label, candidate] of [
  ["Action token", { actionSource: replaceRequired(actions, 'redirect("/platform/accounts?flash=tenant_updated")', 'redirect("/platform/accounts?flash=unknown")', "platform Action token"), pageSource: platformPage }],
  ["unknown-token guard", { actionSource: actions, pageSource: replaceRequired(platformPage, "Object.prototype.hasOwnProperty.call(PLATFORM_ACCOUNT_FLASH_COPY, token)", "true", "platform flash unknown-token guard") }],
  ["raw-token rendering", { actionSource: actions, pageSource: replaceRequired(platformPage, "{flashMessage.message}", "{params?.flash}", "platform raw flash rendering") }],
]) {
  assertNegativeSynthetic(assertPlatformFlashContract, candidate, `${label} mutation must be rejected`);
}
assertPlatformAccountDatabaseBoundary({ migrationSource: migration, postgresSource: postgres, runtimeRoleSource: runtimeRoles });
assertPlatformAuditInsertPolicy({ migrationSource: migration, forceRlsSource: forceRlsMigration });
for (const [label, mutatedMigration] of [
  ["platform audit actor binding", replaceRequired(migration, "  AND audit_logs.actor_id = brokerdesk_private.current_user_id()\n", "", "platform audit actor binding")],
  ["platform audit user binding", replaceRequired(migration, "  AND audit_logs.user_id = brokerdesk_private.current_user_id()\n", "", "platform audit user binding")],
  ["platform audit external identity mapping", replaceRequired(migration, "      AND platform_owner_users.external_auth_subject = brokerdesk_private.current_external_auth_subject()\n", "", "platform audit external identity mapping")],
  ["platform audit action whitelist", replaceRequired(migration, "audit_logs.action IN ('tenant_account_created', 'tenant_subscription_updated')", "audit_logs.action IS NOT NULL", "platform audit action whitelist")],
  ["platform audit tenant target", replaceRequired(migration, "  AND audit_logs.target_id = audit_logs.tenant_id\n", "", "platform audit tenant target")],
  ["platform audit command scope", replaceRequired(migration, "ON public.audit_logs\nFOR INSERT\nWITH CHECK", "ON public.audit_logs\nFOR ALL\nWITH CHECK", "platform audit command scope")],
]) {
  assertNegativeSynthetic(
    assertPlatformAuditInsertPolicy,
    { migrationSource: mutatedMigration, forceRlsSource: forceRlsMigration },
    `${label} mutation must be rejected`,
  );
}
for (const [label, candidate] of [
  ["runtime BYPASSRLS", {
    migrationSource: migration,
    postgresSource: postgres,
    runtimeRoleSource: replaceRequired(runtimeRoles, "NOBYPASSRLS", "BYPASSRLS", "runtime NOBYPASSRLS"),
  }],
  ["platform list SECURITY DEFINER", {
    migrationSource: replaceRequired(migration, "STABLE\nSECURITY DEFINER", "STABLE\nSECURITY INVOKER", "platform list SECURITY DEFINER"),
    postgresSource: postgres,
    runtimeRoleSource: runtimeRoles,
  }],
  ["platform persisted authority", {
    migrationSource: replaceRequired(migration, "platform_owner_memberships.role = 'platform_owner'\n  ) THEN", "platform_owner_memberships.role = 'manager'\n  ) THEN", "platform persisted authority"),
    postgresSource: postgres,
    runtimeRoleSource: runtimeRoles,
  }],
  ["platform current identity", {
    migrationSource: replaceRequired(migration, "current_actor_id TEXT := brokerdesk_private.current_user_id()", "current_actor_id TEXT := p_actor_user_id", "platform current identity"),
    postgresSource: postgres,
    runtimeRoleSource: runtimeRoles,
  }],
  ["platform create audit", {
    migrationSource: replaceRequired(migration, "INSERT INTO public.audit_logs (", "PERFORM 1; -- platform audit removed\n  -- (", "platform create audit"),
    postgresSource: postgres,
    runtimeRoleSource: runtimeRoles,
  }],
  ["platform update tenant lock", {
    migrationSource: replaceRequired(migration, "  FOR UPDATE;\n  IF NOT FOUND THEN\n    RETURN;", "  ;\n  IF NOT FOUND THEN\n    RETURN;", "platform update tenant lock"),
    postgresSource: postgres,
    runtimeRoleSource: runtimeRoles,
  }],
  ["platform facade direct list SQL", {
    migrationSource: migration,
    postgresSource: replaceRequired(postgres, '"SELECT * FROM brokerdesk_private.list_platform_tenant_accounts()"', '"SELECT * FROM tenants"', "platform direct list SQL"),
    runtimeRoleSource: runtimeRoles,
  }],
]) {
  assertNegativeSynthetic(assertPlatformAccountDatabaseBoundary, candidate, `${label} mutation must be rejected`);
}
assertExternalAuthProfileSyncBoundary(externalAuthSyncFunction);
assertExternalAuthSuspensionPredicate(externalAuthSuspendFunction);
assertMemberMutationServiceBoundary(memberCapabilityFunction, "update_tenant_member_capability", "TEXT, TEXT, TEXT, TEXT, TEXT");
assertMemberMutationServiceBoundary(memberMutationStatusFunction, "update_tenant_member_status", "TEXT, TEXT, TEXT, TEXT");
assertInvitationCapacityFunction(refreshInvitationFunction, "refresh_tenant_invitation");
assertInvitationCapacityFunction(recordInvitationFunction, "record_tenant_invitation_delivery");
assertInvitationAuthorizationFunction(refreshInvitationFunction, "refresh_tenant_invitation");
assertInvitationAuthorizationFunction(recordInvitationFunction, "record_tenant_invitation_delivery");
assertInvitationTenantLockAuthorityOrder(refreshInvitationFunction, "refresh_tenant_invitation", true);
assertInvitationTenantLockAuthorityOrder(recordInvitationFunction, "record_tenant_invitation_delivery", true);
assertInvitationConcurrencyProbe(task043);
assert(recordInvitationFunction.includes("'pending', 'failed', 'not_sent', 'revoked', 'expired'"), "delivery recording must apply the seat rule to pending, failed, and not_sent states");
assert(migration.includes("REVOKE ALL ON FUNCTION brokerdesk_private.refresh_tenant_invitation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC"), "refresh invitation replacement must remain revoked from PUBLIC");
assert(migration.includes("REVOKE ALL ON FUNCTION brokerdesk_private.record_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC"), "delivery replacement must remain revoked from PUBLIC");
assert(migration.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.refresh_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO brokerdesk_runtime") && migration.includes("GRANT EXECUTE ON FUNCTION brokerdesk_private.record_tenant_invitation_delivery(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO brokerdesk_runtime"), "invitation replacements must restore only runtime execution grants");
assert(migration.includes("tenant_membership_service_invitation_guard") && migration.includes("AT TIME ZONE 'Asia/Tokyo'"), "PostgreSQL invitations must fail closed at the database boundary using Tokyo dates");
const invitationGuardStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.enforce_tenant_service_for_invitation");
const invitationGuardEnd = migration.indexOf("DROP TRIGGER IF EXISTS tenant_membership_service_invitation_guard");
const invitationGuard = migration.slice(invitationGuardStart, invitationGuardEnd);
assert(invitationGuard.includes("tenant_row.status IN ('suspended', 'cancelled')"), "SQL invitation guard must preserve suspended and cancelled overrides");
assert(!invitationGuard.includes("'pending_activation', 'suspended'"), "configured pending_activation must not be rejected solely by persisted status");
assert(invitationGuard.includes("tenant_row.service_start_at IS NULL") && invitationGuard.includes("tenant_row.service_end_at IS NULL") && invitationGuard.includes("tenant_row.status = 'pending_activation'"), "undated pending_activation must remain compatibility-pending");
assert(invitationGuard.includes("tenant_row.service_start_at > tokyo_today") && invitationGuard.includes("tenant_row.service_end_at < tokyo_today"), "SQL invitation guard must enforce Tokyo start and inclusive end dates");
assert(memory.includes("membership.status === \"suspended\""), "memory seat count must include suspended memberships");
assert(migration.includes("seats.status = 'suspended'") && migration.includes("seats.status IN ('active', 'suspended')"), "PostgreSQL platform summary and invitation RPC seat counts must include suspended memberships");
assert(service.includes("invitationExpiresAt?: Date") && service.includes("membership.invitationExpiresAt.getTime() > now.getTime()"), "shared seat predicate must release invitations at the deterministic expiry boundary");
assert(service.includes("countTenantSeatUsage") && service.includes("membershipOccupiesSeat(membership, now)"), "shared seat count must evaluate every membership against one deterministic now");
assert(memory.includes("deriveMembershipInvitationStatus") && memory.includes('invitationStatus: deriveMembershipInvitationStatus(membership, now)'), "memory member lists must present naturally expired invitations as derived expired without persistence");
const memoryPendingInvitationRead = memory.slice(memory.indexOf("export async function listPendingTenantInvitations"), memory.indexOf("export async function acceptTenantInvitation"));
assert(!memoryPendingInvitationRead.includes('item.invitationStatus = "expired"'), "memory seat release must not depend on pending-invitation list side effects");
assert(postgres.includes("invitationExpiresAt.getTime() <= Date.now()") && postgres.includes('? "expired"'), "PostgreSQL membership mapping must present naturally expired invitations honestly");
assert(migration.includes("seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()"), "PostgreSQL platform database summary and capacity counts must exclude naturally expired invitations");
assert(!memory.includes('if (nextStatus === "suspended") return;') && !postgres.includes('if (nextStatus === "suspended") return;'), "capacity adapters must not exempt a transition into suspended status");
assert(memory.includes('invitationStatus !== "revoked"') && memory.includes('invitationStatus !== "expired"'), "revoked and expired invitations must release seats");
assert(memory.includes("assertTenantInvitationActorAuthorized") && memory.includes('membership.role === "platform_owner"') && memory.includes('membership.capability === "company_owner"'), "memory invitation delivery must require a persisted active platform owner or target company owner");
assert(memory.includes("Boolean(tenant && isTenantServiceOperational(deriveTenantServiceState(tenant)))"), "memory pending invitation bind/read paths must derive the same tenant service state");
assert(memoryExternalAuthSuspend.includes('membership.status === "active"') && memoryExternalAuthSuspend.includes('membership.status === "invited"') && memoryExternalAuthSuspend.includes("membershipOccupiesSeat(membership, nowDate)"), "memory external-auth deletion must preserve removed, explicit released, and naturally expired invitations");
assert(!memoryExternalAuthSuspend.includes('membership.status !== "suspended"'), "memory external-auth deletion must not broadly suspend released memberships");
assert(postgresExternalAuthSuspend.includes("status = 'active'") && postgresExternalAuthSuspend.includes("status = 'invited' AND invitation_status NOT IN ('revoked', 'expired')"), "direct PostgreSQL external-auth deletion must match the seat-occupancy predicate");
assert(!postgresExternalAuthSuspend.includes("status <> 'suspended'"), "direct PostgreSQL external-auth deletion must preserve released memberships");
for (const [label, source] of [["role", memoryMemberRole], ["status", memoryMemberStatus]]) {
  assert(source.includes("isTenantServiceOperational(deriveTenantServiceState(tenant))") && source.includes("tenant service is unavailable for member management"), `memory member ${label} facade must fail closed on derived tenant service before mutation`);
  assert(source.indexOf("tenant service is unavailable for member management") < source.indexOf("membership."), `memory member ${label} facade must check service before published membership mutation`);
}
assert(memory.includes("selectTenantIdentityMembership") && memory.includes('left.status === "removed" ? 1 : 0') && memory.includes("right.updatedAt.getTime() - left.updatedAt.getTime()"), "memory invitation facade must prefer current membership over removed history deterministically");
assert(createInvitationFunction.includes("ORDER BY CASE WHEN memberships.status = 'removed' THEN 1 ELSE 0 END ASC") && createInvitationFunction.includes("memberships.updated_at DESC") && createInvitationFunction.includes("memberships.created_at DESC"), "PostgreSQL invitation RPC must prefer current membership over removed history deterministically");
const memberStatusFunctionStart = migration.indexOf("CREATE OR REPLACE FUNCTION brokerdesk_private.update_tenant_member_status");
assert(memberStatusFunctionStart >= 0, "TASK-043 migration must replace the member-status SECURITY DEFINER function without editing history");
const memberStatusFunction = migration.slice(memberStatusFunctionStart);
assert(memberStatusFunction.includes("FROM public.tenants AS tenant_account") && memberStatusFunction.includes("FOR UPDATE"), "member-status conversion must hold the tenant lock in its transaction");
assert(memberStatusFunction.indexOf("FROM public.tenants AS tenant_account") < memberStatusFunction.indexOf("FROM public.tenant_memberships AS memberships"), "tenant capacity lock must precede the target membership lock");
assert(memberStatusFunction.includes("target_invitation_status") && memberStatusFunction.includes("current_occupies_seat") && memberStatusFunction.includes("next_occupies_seat"), "member-status conversion must distinguish released from seat-occupying states");
assert(memberStatusFunction.includes("invitation_status NOT IN ('revoked', 'expired')"), "PostgreSQL conversion capacity must treat revoked and expired invitations as released");
assert(memberStatusFunction.includes("target_invitation_expires_at > NOW()") && memberStatusFunction.includes("seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()"), "PostgreSQL conversion capacity must treat naturally expired invitations as released");
assert(memberStatusFunction.includes("IF NOT current_occupies_seat AND next_occupies_seat") && memberStatusFunction.includes("purchased seat count exceeded"), "non-seat to seat conversion must fail closed at capacity");
assertMemberStatusSeatExpiry(memberStatusFunction);
assert(postgres.includes("return withTransaction(async (client)") && postgres.includes("brokerdesk_private.update_tenant_member_status"), "PostgreSQL status update must invoke the capacity-guarded function in one transaction");
assert(session.includes('"service_unavailable"') && session.includes("requireTenantReadOnlySession"), "tenant session must separate business and restricted read-only access");
assert(platformSession.includes("getPlatformOwnerSession"), "platform authorization must expose one shared resolver");
assert(nav.includes("getPlatformOwnerSession") && !nav.includes("clerkEnabled || hasPlatformAccess"), "platform navigation must use the real shared authorization result");
assertPlatformNavigation({ navSource: nav, mainNavSource: mainNav, routeTitleSource: routeTitle, accountsPageSource: platformPage, templatesPageSource: platformTemplatesPage });
for (const [label, sources] of [
  ["configured-only platform navigation", { navSource: replaceRequired(nav, "const hasPlatformAccess = Boolean(platformSession)", "const hasPlatformAccess = clerkEnabled || Boolean(platformSession)", "configured-only platform navigation") }],
  ["missing official template link", { navSource: replaceRequired(nav, 'href: "/platform/templates"', 'href: "/templates"', "missing official template link") }],
  ["missing platform group", { navSource: replaceRequired(nav, "data-platform-admin-group", "data-workspace-admin-group", "missing platform group") }],
  ["wrong template route title", { routeTitleSource: replaceRequired(routeTitle, 'pathname.startsWith("/platform/templates")', 'pathname.startsWith("/templates")', "wrong template route title") }],
  ["missing template icon", { mainNavSource: replaceRequired(mainNav, '"/platform/templates": "dashboard_customize"', '"/templates": "dashboard_customize"', "missing template icon") }],
]) {
  let failed = false;
  try {
    assertPlatformNavigation({
      navSource: sources.navSource ?? nav,
      mainNavSource: sources.mainNavSource ?? mainNav,
      routeTitleSource: sources.routeTitleSource ?? routeTitle,
      accountsPageSource: platformPage,
      templatesPageSource: platformTemplatesPage,
    });
  } catch {
    failed = true;
  }
  assert(failed, `${label} mutation must fail`);
}
assert(actions.includes("serviceStartAt") && actions.includes("serviceEndAt"), "platform action must accept service dates");
assertTenantCreateActionAtomicity(createAction);
assertPlatformCommercialAuthority({ sessionSource: platformSession, memorySource: memoryCreate, memoryFullSource: memory, postgresSource: postgresCreate, actionSource: createAction, pageSource: platformPage });
assertPlatformCreatedOwnerCapability({ memorySource: memoryCreate, postgresSource: postgresCreate });
assert(memoryCreate.includes("actorUserId: string") && memoryCreate.includes('action: "tenant_account_created"'), "memory tenant creation must bind the verified actor to its audit");
assert(memoryCreate.includes("const nextDb = cloneDb(db)") && memoryCreate.includes("_g.__brokerDb = nextDb"), "memory tenant creation must publish its complete next state with one reference switch");
assert(!memoryCreate.includes("db.tenants.push") && !memoryCreate.includes("db.users.push") && !memoryCreate.includes("db.tenantMemberships.push") && !memoryCreate.includes("db.auditLogs"), "memory tenant creation must not mutate any published collection before commit");
assert(memoryCreate.indexOf('action: "tenant_account_created"') < memoryCreate.indexOf("_g.__brokerDb = nextDb"), "memory tenant audit construction must finish before atomic publication");
assert(postgresCreate.includes("brokerdesk_private.create_platform_tenant_account(") && !postgresCreate.includes("INSERT INTO audit_logs"), "PostgreSQL tenant, owner membership, and creation audit must share the atomic definer function transaction");
assert(postgresCreate.includes("actorUserId: string") && migration.includes("'tenant_account_created'") && migration.includes("current_actor_id, current_actor_id"), "PostgreSQL tenant creation audit must bind the database-verified actor");
for (const token of ["status", "purchasedSeatCount", "serviceStartAt", "serviceEndAt"]) {
  assert(memoryCreate.includes(token) && migration.includes(`'${token}'`), `tenant creation audit context must include ${token}`);
}
assert(actions.includes('target?.status === "removed" && status === "suspended"'), "member Action must require a new invitation instead of converting removed to suspended");
assert(memory.includes('membership.status === "removed" && (input.status === "active" || input.status === "suspended")'), "memory adapter must reject removed-to-seat status conversion");
assert(postgres.includes('existingMember.status === "removed" && (input.status === "active" || input.status === "suspended")'), "PostgreSQL adapter must reject removed-to-seat status conversion before its database boundary");
assert(platformPage.includes('type="date"') && platformPage.includes("remainingDays"), "platform page must edit dates and show remaining days");
assert(membersPage.includes("subscriptionSummary"), "company owner page must show a read-only subscription summary");
assert(servicePage.includes("requireTenantReadOnlySession"), "service status page must remain reachable through restricted read-only resolution");
assert(!workspacePage.includes("isTenantAccessibleStatus"), "workspace grouping must not discard an operational derived state because of persisted tenant status");
assert(workspacePage.includes("serviceState: deriveTenantServiceState") && workspacePage.includes("isTenantServiceOperational(item.serviceState)"), "workspace available and unavailable groups must share one derived service state");
assertWorkspaceServiceStatusCaller(workspacePage);
assertMembersServiceStatusCaller(membersPage);
assert(!platformPage.includes("const serviceStatusLabels") && platformPage.includes("getTenantServiceStatusLabel"), "platform account status must reuse the shared service-status label source");
assert(!servicePage.includes("const statusLabels") && servicePage.includes("getTenantServiceStatusLabel"), "service explanation page must reuse the shared service-status label source");

assertNegativeSynthetic(
  assertWorkspaceServiceStatusCaller,
  workspacePage.replace("{getTenantServiceStatusLabel(serviceState.status, locale)}", "{text.statusPendingActivation}"),
  "fixed-pending workspace mutation must be rejected",
);
for (const [label, from, to] of [
  ["configured-current allow", "tenants.status NOT IN ('suspended', 'cancelled')", "tenants.status IN ('trial', 'active')"],
  ["expired active rejection", "tenants.service_end_at >= tokyo_today", "TRUE"],
  ["active membership", "FROM public.tenant_memberships AS memberships", "FROM public.users AS memberships"],
  ["security boundary", "SECURITY DEFINER", "SECURITY INVOKER"],
]) {
  const mutated = replaceRequired(tenantRlsFunction, from, to, `tenant RLS ${label}`);
  assertNegativeSynthetic(assertTenantRlsServiceScope, mutated, `tenant RLS ${label} mutation must be rejected`);
}
for (const [label, from, to] of [
  ["tenant lock", "FOR UPDATE;", ""],
  ["current membership preference", "ORDER BY CASE WHEN memberships.status = 'removed' THEN 1 ELSE 0 END ASC", "ORDER BY memberships.updated_at DESC"],
  ["capacity transition", "IF NOT current_occupies_seat AND next_occupies_seat", "IF FALSE"],
  ["released seat predicate", "seats.invitation_status NOT IN ('revoked', 'expired')", "seats.invitation_status IS NOT NULL"],
  ["natural expiry predicate", "existing_invitation_expires_at IS NULL OR existing_invitation_expires_at > NOW()", "TRUE"],
]) {
  const mutated = replaceRequired(createInvitationFunction, from, to, `create invitation ${label}`);
  assertNegativeSynthetic(assertCreateInvitationCapacityBoundary, mutated, `create invitation ${label} mutation must be rejected`);
}
for (const [functionName, source, allowPlatformOwner] of [
  ["create_tenant_invitation", createInvitationFunction, false],
  ["refresh_tenant_invitation", refreshInvitationFunction, true],
  ["record_tenant_invitation_delivery", recordInvitationFunction, true],
]) {
  for (const [label, mutated] of [
    ["authority before tenant lock", replaceRequired(source, "BEGIN\n", "BEGIN\n  PERFORM 1 FROM public.tenant_memberships AS authorized_actor_memberships;\n", `${functionName} early authority`)],
    ["actor lock removal", replaceRequired(source, "FOR UPDATE OF authorized_actor_memberships;", ";", `${functionName} actor lock removal`)],
    ["service recheck removal", replaceRequired(source, "tenant service is unavailable for invitations", "service snapshot accepted without recheck", `${functionName} service recheck removal`)],
  ]) {
    assertNegativeSynthetic(
      (candidate) => assertInvitationTenantLockAuthorityOrder(candidate, functionName, allowPlatformOwner),
      mutated,
      `${functionName} ${label} mutation must be rejected`,
    );
  }
}
assertNegativeSynthetic(
  assertInvitationConcurrencyProbe,
  replaceRequired(task043, " AS zero_write", " AS write_may_exist", "invitation concurrency zero-write probe"),
  "invitation concurrency zero-write probe mutation must be rejected",
);
for (const [label, candidate] of [
  ["memory invite invited-only guard", {
    memorySource: replaceRequired(memoryInvite, 'if ((input.status ?? "invited") !== "invited")', 'if ((input.status ?? "invited") === "active")', "memory invitation invited-only guard"),
    memoryFullSource: memory,
    postgresSource: postgresInvite,
    sqlSource: createInvitationFunction,
  }],
  ["PostgreSQL invite invited-only guard", {
    memorySource: memoryInvite,
    memoryFullSource: memory,
    postgresSource: replaceRequired(postgresInvite, 'if ((input.status ?? "invited") !== "invited")', 'if ((input.status ?? "invited") === "active")', "PostgreSQL invitation invited-only guard"),
    sqlSource: createInvitationFunction,
  }],
  ["memory invite actor guard", {
    memorySource: replaceRequired(memoryInvite, "  const actorUserId = assertActiveCompanyOwnerActor(nextDb, scopeTenantId, input.invitedByUserId);\n", "", "memory invitation actor guard"),
    memoryFullSource: memory,
    postgresSource: postgresInvite,
    sqlSource: createInvitationFunction,
  }],
  ["memory invite write before authorization", {
    memorySource: replaceRequired(memoryInvite, "  const actorUserId = assertActiveCompanyOwnerActor(nextDb, scopeTenantId, input.invitedByUserId);", "  nextDb.users.push({} as User);\n  const actorUserId = assertActiveCompanyOwnerActor(nextDb, scopeTenantId, input.invitedByUserId);", "memory invitation write order"),
    memoryFullSource: memory,
    postgresSource: postgresInvite,
    sqlSource: createInvitationFunction,
  }],
  ["memory invite canonical mapping", {
    memorySource: replaceRequired(memoryInvite, "isCanonicalTenantMemberCapability(input.role, capability)", "capability.length > 0", "memory invitation canonical mapping"),
    memoryFullSource: memory,
    postgresSource: postgresInvite,
    sqlSource: createInvitationFunction,
  }],
  ["PostgreSQL invite canonical mapping", {
    memorySource: memoryInvite,
    memoryFullSource: memory,
    postgresSource: replaceRequired(postgresInvite, 'input.role === "broker" && capability === "ordinary_member"', 'input.role === "broker"', "PostgreSQL invitation canonical mapping"),
    sqlSource: createInvitationFunction,
  }],
  ["SQL invite canonical mapping", {
    memorySource: memoryInvite,
    memoryFullSource: memory,
    postgresSource: postgresInvite,
    sqlSource: replaceRequired(createInvitationFunction, "p_role = 'broker' AND p_capability = 'ordinary_member'", "p_role = 'broker'", "SQL invitation canonical mapping"),
  }],
  ["SQL invite target company owner", {
    memorySource: memoryInvite,
    memoryFullSource: memory,
    postgresSource: postgresInvite,
    sqlSource: replaceRequired(createInvitationFunction, "actor_memberships.capability = 'company_owner'", "actor_memberships.capability = 'ordinary_member'", "SQL invitation actor capability"),
  }],
]) {
  assertNegativeSynthetic(assertInvitationCreationBoundary, candidate, `${label} mutation must be rejected`);
}
for (const [label, candidate] of [
  ["memory delivery accepted state", {
    memorySource: replaceRequired(memoryInvitationDelivery, '["pending", "failed", "not_sent", "revoked", "expired"]', '["pending", "failed", "not_sent", "revoked", "expired", "accepted"]', "memory delivery accepted state"),
    postgresSource: postgresInvitationDelivery,
    sqlSource: recordInvitationFunction,
  }],
  ["memory delivery arbitrary provider", {
    memorySource: replaceRequired(memoryInvitationDelivery, '["none", "manual", "clerk"]', '["none", "manual", "clerk", "smtp"]', "memory delivery provider"),
    postgresSource: postgresInvitationDelivery,
    sqlSource: recordInvitationFunction,
  }],
  ["memory delivery published target", {
    memorySource: replaceRequired(memoryInvitationDelivery, "nextDb.tenantMemberships.find", "db.tenantMemberships.find", "memory delivery published target"),
    postgresSource: postgresInvitationDelivery,
    sqlSource: recordInvitationFunction,
  }],
  ["memory delivery target status", {
    memorySource: replaceRequired(memoryInvitationDelivery, 'if (!membership || membership.status !== "invited") return null;', "if (!membership) return null;", "memory delivery target status"),
    postgresSource: postgresInvitationDelivery,
    sqlSource: recordInvitationFunction,
  }],
  ["PostgreSQL delivery accepted state", {
    memorySource: memoryInvitationDelivery,
    postgresSource: replaceRequired(postgresInvitationDelivery, '["pending", "failed", "not_sent", "revoked", "expired"]', '["pending", "failed", "not_sent", "revoked", "expired", "accepted"]', "PostgreSQL delivery accepted state"),
    sqlSource: recordInvitationFunction,
  }],
  ["PostgreSQL delivery ordinary RLS pre-read", {
    memorySource: memoryInvitationDelivery,
    postgresSource: replaceRequired(postgresInvitationDelivery, "  const actorUserId = await getAuthenticatedInvitationActorId(input.actorUserId);", "  const target = await getTenantMemberById({ tenantId: scopeTenantId, membershipId: input.membershipId });\n  if (!target) return null;\n  const actorUserId = await getAuthenticatedInvitationActorId(input.actorUserId);", "PostgreSQL delivery ordinary RLS pre-read"),
    sqlSource: recordInvitationFunction,
  }],
  ["SQL delivery accepted state", {
    memorySource: memoryInvitationDelivery,
    postgresSource: postgresInvitationDelivery,
    sqlSource: replaceRequired(recordInvitationFunction, "p_invitation_status NOT IN ('pending', 'failed', 'not_sent', 'revoked', 'expired')", "p_invitation_status NOT IN ('pending', 'failed', 'not_sent', 'revoked', 'expired', 'accepted')", "SQL delivery accepted state"),
  }],
  ["SQL delivery arbitrary provider", {
    memorySource: memoryInvitationDelivery,
    postgresSource: postgresInvitationDelivery,
    sqlSource: replaceRequired(recordInvitationFunction, "p_provider NOT IN ('none', 'manual', 'clerk')", "p_provider NOT IN ('none', 'manual', 'clerk', 'smtp')", "SQL delivery provider"),
  }],
  ["SQL delivery target status", {
    memorySource: memoryInvitationDelivery,
    postgresSource: postgresInvitationDelivery,
    sqlSource: replaceRequired(recordInvitationFunction, "IF NOT FOUND OR target_status <> 'invited' OR (p_provider = 'clerk' AND target_invitation_status IN ('revoked', 'expired')) THEN", "IF NOT FOUND THEN", "SQL delivery target status"),
  }],
]) {
  assertNegativeSynthetic(assertInvitationDeliveryBoundary, candidate, `${label} mutation must be rejected`);
}
for (const [label, from, to] of [
  ["operational coupling", "AND EXISTS (", "AND brokerdesk_private.can_access_tenant(memberships.tenant_id)\n    AND EXISTS ("],
  ["current identity", "actor_membership.user_id = brokerdesk_private.current_user_id()", "actor_membership.user_id IS NOT NULL"],
  ["company owner capability", "actor_membership.capability = 'company_owner'", "actor_membership.capability = 'ordinary_member'"],
]) {
  const mutated = replaceRequired(rosterReadFunction, from, to, `member roster ${label}`);
  assertNegativeSynthetic(assertRestrictedMemberRosterRead, mutated, `member roster ${label} mutation must be rejected`);
}
assertNegativeSynthetic(
  assertMembersServiceStatusCaller,
  membersPage.replace("{getTenantServiceStatusLabel(session.serviceState.status, locale)}", "{session.serviceState.status}"),
  "raw-enum member-summary mutation must be rejected",
);
assertNegativeSynthetic(
  assertTenantCreateActionAtomicity,
  createAction.replace(
    "  const ownerMembership = account.ownerMembers[0];",
    "  await addAuditLog({ action: \"tenant_account_created\" });\n  const ownerMembership = account.ownerMembers[0];",
  ),
  "split Action audit writer mutation must be rejected",
);
for (const [label, candidate] of [
  ["configured-only session authority", {
    sessionSource: replaceRequired(platformSession, "if (!hasActivePlatformOwnerMembership(memberships))", "if (!isConfiguredPlatformOwnerUser(user) && !hasActivePlatformOwnerMembership(memberships))", "configured-only platform session"),
    memorySource: memoryCreate,
    memoryFullSource: memory,
    postgresSource: postgresCreate,
    actionSource: createAction,
    pageSource: platformPage,
  }],
  ["memory platform authority guard", {
    sessionSource: platformSession,
    memorySource: replaceRequired(memoryCreate, "  assertActivePlatformOwnerActor(nextDb, actorUserId);\n", "", "memory platform authority guard"),
    memoryFullSource: memory,
    postgresSource: postgresCreate,
    actionSource: createAction,
    pageSource: platformPage,
  }],
  ["memory persisted platform role", {
    sessionSource: platformSession,
    memorySource: memoryCreate,
    memoryFullSource: replaceRequired(memory, 'membership.role === "platform_owner"\n  );\n  if (!authorized) throw new Error("active platform owner membership required")', 'membership.role === "manager"\n  );\n  if (!authorized) throw new Error("active platform owner membership required")', "memory platform role"),
    postgresSource: postgresCreate,
    actionSource: createAction,
    pageSource: platformPage,
  }],
  ["post-commit invitation exception", {
    sessionSource: platformSession,
    memorySource: memoryCreate,
    memoryFullSource: memory,
    postgresSource: postgresCreate,
    actionSource: replaceRequired(createAction, "catch {\n      invitationFailed = true;\n    }", "catch {\n      throw new Error(\"invitation failed\");\n    }", "post-commit invitation exception"),
    pageSource: platformPage,
  }],
]) {
  assertNegativeSynthetic(assertPlatformCommercialAuthority, candidate, `${label} mutation must be rejected`);
}
for (const [label, candidate] of [
  ["missing memory capability", { memorySource: replaceRequired(memoryCreate, '    capability: "company_owner",\n', "", "memory owner capability"), postgresSource: postgresCreate }],
]) {
  assertNegativeSynthetic(assertPlatformCreatedOwnerCapability, candidate, `${label} mutation must be rejected`);
}
assertNegativeSynthetic(
  assertMemoryLifecycleAtomicity,
  replaceInMemoryLifecycle(memory, "  _g.__brokerDb = nextDb;\n  return result;", "  _g.__brokerDb = nextDb;\n  return toTenantAccountSummary(result);", "post-commit lifecycle call"),
  "post-commit lifecycle call mutation must be rejected",
);
assertNegativeSynthetic(
  assertMemoryLifecycleAtomicity,
  replaceInMemoryLifecycle(memory, "  nextDb.auditLogs.unshift(audit);", "  db.auditLogs.unshift(audit);", "published lifecycle audit mutation"),
  "published lifecycle audit mutation must be rejected",
);
for (const [label, candidate] of [
  ["missing lifecycle platform guard", replaceInMemoryLifecycle(memory, "  assertActivePlatformOwnerActor(nextDb, normalizedActorUserId);\n", "", "lifecycle platform guard")],
  ["late lifecycle platform guard", replaceInMemoryLifecycle(
    memory,
    "  assertActivePlatformOwnerActor(nextDb, normalizedActorUserId);\n  const nowDate = new Date();\n  const tenant = nextDb.tenants.find((item) => item.id === input.tenantId);",
    "  const nowDate = new Date();\n  const tenant = nextDb.tenants.find((item) => item.id === input.tenantId);\n  assertActivePlatformOwnerActor(nextDb, normalizedActorUserId);",
    "lifecycle platform guard order",
  )],
  ["lifecycle raw audit actor", replaceInMemoryLifecycle(memory, "    userId: normalizedActorUserId,\n    actorId: normalizedActorUserId,", "    userId: input.actorUserId,\n    actorId: input.actorUserId,", "lifecycle normalized audit actor")],
  ["lifecycle platform role", replaceRequired(
    memory,
    'membership.userId === actorUserId\n    && membership.status === "active"\n    && membership.role === "platform_owner"',
    'membership.userId === actorUserId\n    && membership.status === "active"\n    && membership.role === "manager"',
    "lifecycle platform role",
  )],
  ["lifecycle platform status", replaceRequired(
    memory,
    'membership.userId === actorUserId\n    && membership.status === "active"\n    && membership.role === "platform_owner"',
    'membership.userId === actorUserId\n    && membership.status === "suspended"\n    && membership.role === "platform_owner"',
    "lifecycle platform status",
  )],
]) {
  assertNegativeSynthetic(assertMemoryLifecycleAtomicity, candidate, `${label} mutation must be rejected`);
}
for (const [label, candidate] of [
  ["shared actor capability", {
    roleSource: memoryMemberRole,
    statusSource: memoryMemberStatus,
    fullSource: replaceRequired(
      memory,
      'membership.userId === normalizedActorUserId\n    && membership.status === "active"\n    && membership.capability === "company_owner"',
      'membership.userId === normalizedActorUserId\n    && membership.status === "active"\n    && membership.capability === "ordinary_member"',
      "memory shared actor capability",
    ),
  }],
  ["role actor guard", {
    roleSource: replaceRequired(memoryMemberRole, "  assertActiveCompanyOwnerActor(nextDb, scopeTenantId, input.actorUserId);\n", "", "memory role actor guard"),
    statusSource: memoryMemberStatus,
    fullSource: memory,
  }],
  ["status actor guard", {
    roleSource: memoryMemberRole,
    statusSource: replaceRequired(memoryMemberStatus, "  assertActiveCompanyOwnerActor(nextDb, scopeTenantId, input.actorUserId);\n", "", "memory status actor guard"),
    fullSource: memory,
  }],
  ["role capability mapping", {
    roleSource: memoryMemberRole,
    statusSource: memoryMemberStatus,
    fullSource: replaceRequired(memory, 'role === "broker" && capability === "ordinary_member"', 'role === "broker"', "memory role mapping"),
  }],
  ["role last owner", {
    roleSource: replaceRequired(memoryMemberRole, "activeCompanyOwnerCount <= 1", "false", "memory role last owner"),
    statusSource: memoryMemberStatus,
    fullSource: memory,
  }],
  ["status last owner", {
    roleSource: memoryMemberRole,
    statusSource: replaceRequired(memoryMemberStatus, "activeCompanyOwnerCount <= 1", "false", "memory status last owner"),
    fullSource: memory,
  }],
]) {
  assertNegativeSynthetic(assertMemoryMemberMutationBoundary, candidate, `${label} mutation must be rejected`);
}
for (const [label, candidate] of [
  ["Action invited suspension", {
    actionSource: replaceRequired(memberStatusAction, 'if (target?.status === "invited")', 'if (target?.status === "invited" && status === "active")', "Action invited suspension guard"),
    memorySource: memoryMemberStatus,
    postgresSource: postgresMemberStatus,
    sqlSource: memberMutationStatusFunction,
  }],
  ["memory invited suspension", {
    actionSource: memberStatusAction,
    memorySource: replaceRequired(memoryMemberStatus, 'membership.status === "invited" && (input.status === "active" || input.status === "suspended")', 'membership.status === "invited" && input.status === "active"', "memory invited suspension guard"),
    postgresSource: postgresMemberStatus,
    sqlSource: memberMutationStatusFunction,
  }],
  ["PostgreSQL invited suspension", {
    actionSource: memberStatusAction,
    memorySource: memoryMemberStatus,
    postgresSource: replaceRequired(postgresMemberStatus, 'existingMember.status === "invited" && (input.status === "active" || input.status === "suspended")', 'existingMember.status === "invited" && input.status === "active"', "PostgreSQL invited suspension guard"),
    sqlSource: memberMutationStatusFunction,
  }],
  ["SQL invited suspension", {
    actionSource: memberStatusAction,
    memorySource: memoryMemberStatus,
    postgresSource: postgresMemberStatus,
    sqlSource: replaceRequired(memberMutationStatusFunction, "target_status = 'invited' AND p_status IN ('active', 'suspended')", "target_status = 'invited' AND p_status = 'active'", "SQL invited suspension guard"),
  }],
  ["memory accepted reactivation", {
    actionSource: memberStatusAction,
    memorySource: replaceRequired(memoryMemberStatus, 'membership.invitationStatus !== "accepted"', 'membership.invitationStatus === "accepted"', "memory accepted transition guard"),
    postgresSource: postgresMemberStatus,
    sqlSource: memberMutationStatusFunction,
  }],
  ["SQL accepted reactivation", {
    actionSource: memberStatusAction,
    memorySource: memoryMemberStatus,
    postgresSource: postgresMemberStatus,
    sqlSource: replaceRequired(memberMutationStatusFunction, "target_invitation_status IS DISTINCT FROM 'accepted'", "target_invitation_status = 'accepted'", "SQL accepted transition guard"),
  }],
]) {
  assertNegativeSynthetic(assertMemberStatusAcceptanceBoundary, candidate, `${label} mutation must be rejected`);
}
for (const [label, mutated] of [
  ["dropped tenant join", replaceRequired(importClaimFunction, "INNER JOIN public.tenants AS tenants ON tenants.id = jobs.tenant_id", "", "dropped tenant join")],
  ["weakened tenant join", replaceRequired(importClaimFunction, "INNER JOIN public.tenants AS tenants ON tenants.id = jobs.tenant_id", "LEFT JOIN public.tenants AS tenants ON tenants.id = jobs.tenant_id", "weakened tenant join")],
  ["dropped start-date gate", replaceRequired(importClaimFunction, "tenants.service_start_at IS NULL OR tenants.service_start_at <= tokyo_today", "TRUE", "dropped start-date gate")],
  ["dropped end-date gate", replaceRequired(importClaimFunction, "tenants.service_end_at IS NULL OR tenants.service_end_at >= tokyo_today", "TRUE", "dropped end-date gate")],
  ["dropped override gate", replaceRequired(importClaimFunction, "tenants.status NOT IN ('suspended', 'cancelled')", "TRUE", "dropped override gate")],
]) {
  assertNegativeSynthetic(assertImportWorkerClaimScope, mutated, `${label} mutation must be rejected`);
}
for (const [functionName, source] of [
  ["refresh_tenant_invitation", refreshInvitationFunction],
  ["record_tenant_invitation_delivery", recordInvitationFunction],
]) {
  const withoutTenantLock = replaceRequired(source, "FOR UPDATE;", "", `${functionName} tenant lock removal`);
  assertNegativeSynthetic(
    (mutated) => assertInvitationCapacityFunction(mutated, functionName),
    withoutTenantLock,
    `${functionName} tenant lock removal mutation must be rejected`,
  );
  for (const [label, from] of [
    ["current natural expiry", "target_invitation_expires_at IS NULL OR target_invitation_expires_at > NOW()"],
    ["capacity natural expiry", "seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()"],
  ]) {
    const mutated = replaceRequired(source, from, "TRUE", `${functionName} ${label}`);
    assertNegativeSynthetic(
      (candidate) => assertInvitationCapacityFunction(candidate, functionName),
      mutated,
      `${functionName} ${label} mutation must be rejected`,
    );
  }
  for (const [label, from, to] of [
    ["platform role", "authorized_actor_memberships.role = 'platform_owner'", "authorized_actor_memberships.role = 'reviewer'"],
    ["platform active status", "authorized_actor_memberships.status = 'active'", "authorized_actor_memberships.status = 'suspended'"],
    ["company owner capability", "authorized_actor_memberships.capability = 'company_owner'", "authorized_actor_memberships.capability = 'ordinary_member'"],
    ["Tokyo end-date gate", "tenant_service_end_at < tokyo_today", "FALSE"],
  ]) {
    const mutated = replaceRequired(source, from, to, `${functionName} ${label}`);
    assertNegativeSynthetic(
      (candidate) => {
        assertInvitationAuthorizationFunction(candidate, functionName);
        assertInvitationTenantLockAuthorityOrder(candidate, functionName, true);
      },
      mutated,
      `${functionName} ${label} mutation must be rejected`,
    );
  }
}
for (const [label, from, to] of [
  ["active branch", "status = 'active'", "status = 'removed'"],
  ["released invitation exclusion", "invitation_status NOT IN ('revoked', 'expired')", "invitation_status IS NOT NULL"],
  ["natural invitation expiry", "invitation_expires_at IS NULL OR invitation_expires_at > NOW()", "TRUE"],
]) {
  const mutated = replaceRequired(externalAuthSuspendFunction, from, to, `external-auth ${label}`);
  assertNegativeSynthetic(assertExternalAuthSuspensionPredicate, mutated, `external-auth ${label} mutation must be rejected`);
}
assertNegativeSynthetic(
  assertMemberStatusSeatExpiry,
  replaceRequired(memberStatusFunction, "target_invitation_expires_at IS NULL OR target_invitation_expires_at > NOW()", "TRUE", "member status current natural expiry"),
  "member status current natural expiry mutation must be rejected",
);
assertNegativeSynthetic(
  assertMemberStatusSeatExpiry,
  replaceRequired(memberStatusFunction, "seats.invitation_expires_at IS NULL OR seats.invitation_expires_at > NOW()", "TRUE", "member status capacity natural expiry"),
  "member status capacity natural expiry mutation must be rejected",
);
assertNegativeSynthetic(
  assertExternalAuthProfileSyncBoundary,
  replaceRequired(
    externalAuthSyncFunction,
    "  RETURN local_user_id;",
    "  UPDATE public.tenant_memberships SET status = 'active', invitation_status = 'accepted' WHERE user_id = local_user_id;\n  RETURN local_user_id;",
    "external-auth profile membership activation",
  ),
  "external-auth profile sync membership activation mutation must be rejected",
);
for (const [functionName, signature, source] of [
  ["update_tenant_member_capability", "TEXT, TEXT, TEXT, TEXT, TEXT", memberCapabilityFunction],
  ["update_tenant_member_status", "TEXT, TEXT, TEXT, TEXT", memberMutationStatusFunction],
]) {
  for (const [label, from, to] of [
    ["tenant lock", "FOR UPDATE;", ""],
    ["Tokyo date gate", "tenant_service_end_at < tokyo_today", "FALSE"],
    ["tenant override", "tenant_status IN ('suspended', 'cancelled')", "FALSE"],
    ["company owner capability guard", "actor_membership.capability = 'company_owner'", "actor_membership.capability = 'ordinary_member'"],
  ]) {
    const mutated = replaceRequired(source, from, to, `${functionName} ${label}`);
    assertNegativeSynthetic(
      (candidate) => assertMemberMutationServiceBoundary(candidate, functionName, signature),
      mutated,
      `${functionName} ${label} mutation must be rejected`,
    );
  }
}

console.log("[PASS] platform subscription source contract");
