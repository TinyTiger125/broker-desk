export type SupabaseLifecycleRole =
  | "platform_owner"
  | "tenant_owner"
  | "company_form_admin"
  | "ordinary_member";

export type SupabaseLifecycleUserStatus = "active" | "invited" | "disabled";

export type SupabaseLifecycleUser = {
  authUserId: string;
  email: string;
  tenantId?: string;
  role: SupabaseLifecycleRole;
  status: SupabaseLifecycleUserStatus;
  sessionVersion: number;
};

export type SupabaseLifecycleAudit = {
  id: string;
  action: "platform.bootstrap" | "member.invited" | "member.password_reset_requested" | "member.disabled";
  actorAuthUserId: string;
  targetAuthUserId: string;
  tenantId?: string;
  idempotencyKey: string;
};

export type PlatformOwnerBootstrapInput = {
  requestedAuthUserId: string;
  requestedEmail: string;
  fixedTenantId: string;
  fixedMembershipId: string;
  fixedAuditId: string;
  users: readonly SupabaseLifecycleUser[];
  audits: readonly SupabaseLifecycleAudit[];
};

export type PlatformOwnerBootstrapPlan =
  | {
      kind: "create";
      authUserId: string;
      email: string;
      tenantId: string;
      membershipId: string;
      auditId: string;
      idempotencyKey: string;
    }
  | {
      kind: "idempotent";
      authUserId: string;
      tenantId: string;
      membershipId: string;
      auditId: string;
    };

export function planPlatformOwnerBootstrap(input: PlatformOwnerBootstrapInput): PlatformOwnerBootstrapPlan {
  const authUserId = input.requestedAuthUserId.trim();
  const email = input.requestedEmail.trim().toLowerCase();
  const tenantId = input.fixedTenantId.trim();
  const membershipId = input.fixedMembershipId.trim();
  const auditId = input.fixedAuditId.trim();
  if (!authUserId || !email || !email.includes("@") || !tenantId || !membershipId || !auditId) {
    throw new Error("bootstrap requires explicit Supabase user, email and fixed ids");
  }

  const activeOwners = input.users.filter((user) => user.role === "platform_owner" && user.status === "active");
  const target = input.users.find((user) => user.authUserId === authUserId);
  const audit = input.audits.find((item) => item.id === auditId);
  if (activeOwners.length > 1) throw new Error("bootstrap conflict: multiple active platform owners");
  if (activeOwners.length === 1 && activeOwners[0].authUserId !== authUserId) {
    throw new Error("bootstrap conflict: active platform owner already exists");
  }
  if (target && target.email !== email) throw new Error("bootstrap conflict: Supabase email does not match user");
  if (target && (target.role !== "platform_owner" || target.status !== "active")) {
    throw new Error("bootstrap conflict: target user is not an active platform owner");
  }
  if (audit) {
    const exact = audit.action === "platform.bootstrap"
      && audit.actorAuthUserId === authUserId
      && audit.targetAuthUserId === authUserId
      && audit.tenantId === tenantId
      && audit.idempotencyKey === `${tenantId}:${authUserId}`;
    if (!exact) throw new Error("bootstrap conflict: fixed audit id collision");
    return { kind: "idempotent", authUserId, tenantId, membershipId, auditId };
  }
  return {
    kind: "create",
    authUserId,
    email,
    tenantId,
    membershipId,
    auditId,
    idempotencyKey: `${tenantId}:${authUserId}`,
  };
}

export type SupabaseMemberInvitationInput = {
  actor: SupabaseLifecycleUser;
  tenantId: string;
  email: string;
  role: SupabaseLifecycleRole;
};

export function validateMemberInvitation(input: SupabaseMemberInvitationInput): void {
  const tenantId = input.tenantId.trim();
  const email = input.email.trim().toLowerCase();
  if (!tenantId || !email || !email.includes("@")) throw new Error("member invitation requires tenant and email");
  if (input.actor.status !== "active") throw new Error("disabled actor cannot invite members");
  const actorCanInvite = input.actor.role === "platform_owner"
    || (input.actor.role === "tenant_owner" && input.actor.tenantId === tenantId);
  if (!actorCanInvite) throw new Error("member invitation actor is outside the target tenant");
  if (input.role === "platform_owner") throw new Error("member invitation cannot grant platform owner");
}

export type SupabasePasswordResetPlan = {
  kind: "password_reset_requested";
  authUserId: string;
  email: string;
  idempotencyKey: string;
};

export function planPasswordReset(user: SupabaseLifecycleUser, requestedEmail: string): SupabasePasswordResetPlan {
  const email = requestedEmail.trim().toLowerCase();
  if (!email || email !== user.email) throw new Error("password reset email does not match the invited account");
  if (user.status === "disabled") throw new Error("disabled user cannot request password reset");
  return {
    kind: "password_reset_requested",
    authUserId: user.authUserId,
    email,
    idempotencyKey: `password-reset:${user.authUserId}:${email}`,
  };
}

export function canUseSupabaseSession(user: SupabaseLifecycleUser, sessionVersion: number): boolean {
  return user.status === "active" && user.sessionVersion === sessionVersion;
}

export function planDisableUser(input: {
  actor: SupabaseLifecycleUser;
  target: SupabaseLifecycleUser;
}): { kind: "disable"; authUserId: string; revokeExistingSessions: true; idempotencyKey: string } {
  if (input.actor.status !== "active") throw new Error("disabled actor cannot disable users");
  if (input.actor.authUserId === input.target.authUserId) throw new Error("actor cannot disable own account");
  const sameTenant = input.actor.tenantId && input.target.tenantId && input.actor.tenantId === input.target.tenantId;
  if (input.actor.role !== "platform_owner" && !(input.actor.role === "tenant_owner" && sameTenant)) {
    throw new Error("actor cannot disable a user outside the managed tenant");
  }
  return {
    kind: "disable",
    authUserId: input.target.authUserId,
    revokeExistingSessions: true,
    idempotencyKey: `disable:${input.target.authUserId}`,
  };
}
