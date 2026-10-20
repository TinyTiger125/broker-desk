/** Shared by server pages and browser draft storage; no client-only imports. */
export function buildEntryDraftKey(input: { tenantId: string; userId: string; objectType: "client" | "property"; objectId: string }) {
  return `broker-desk:entry-draft:${encodeURIComponent(input.tenantId)}:${encodeURIComponent(input.userId)}:${input.objectType}:${encodeURIComponent(input.objectId)}`;
}
