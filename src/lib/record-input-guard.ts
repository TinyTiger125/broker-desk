export const FORBIDDEN_RECORD_INPUT_FIELDS = [
  "createdByUserId",
  "created_by_user_id",
  "currentOwnerUserId",
  "current_owner_user_id",
  "tenantId",
  "tenant_id",
  "actorUserId",
  "actor_user_id",
] as const;

export class ForbiddenRecordInputError extends Error {
  readonly code = "record_forbidden_field" as const;
  readonly fields: string[];

  constructor(fields: string[]) {
    super("record ownership fields are not accepted by ordinary record operations");
    this.name = "ForbiddenRecordInputError";
    this.fields = fields;
  }
}

export function findForbiddenRecordInputFields(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  return FORBIDDEN_RECORD_INPUT_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(input, field),
  );
}

export function assertNoForbiddenRecordInput(input: unknown, options: { allowTenantId?: boolean } = {}): void {
  const allowed = options.allowTenantId ? new Set(["tenantId"]) : new Set<string>();
  const fields = findForbiddenRecordInputFields(input).filter((field) => !allowed.has(field));
  if (fields.length > 0) throw new ForbiddenRecordInputError(fields);
}
