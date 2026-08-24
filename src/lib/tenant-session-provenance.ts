const trustedTenantSessions = new WeakSet<object>();

export function registerTenantSessionProvenance(session: object): void {
  trustedTenantSessions.add(session);
}

export function hasTenantSessionProvenance(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && trustedTenantSessions.has(value));
}
