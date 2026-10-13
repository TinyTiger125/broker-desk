export type ImportCenterRecentCategory = "case" | "person" | "property" | "unknown";

export type ImportCenterRecentEntry = {
  id: string;
  title: string;
  type: string;
  href: string;
  updatedAt: Date;
  category: ImportCenterRecentCategory;
};

export type ImportCenterRecentCaseCandidate = ImportCenterRecentEntry & {
  sourceImportJobIds: readonly string[];
};

export type ImportCenterRecentJobCandidate = Omit<ImportCenterRecentEntry, "category"> & {
  targetEntity?: string;
  linkedCaseId?: string;
};

export type ImportCenterRecentInputs = {
  cases?: readonly ImportCenterRecentCaseCandidate[];
  clients?: readonly ImportCenterRecentEntry[];
  properties?: readonly ImportCenterRecentEntry[];
  fileJobs?: readonly ImportCenterRecentJobCandidate[];
  since?: Date;
  limit?: number;
};

function getFileJobCategory(entry: ImportCenterRecentJobCandidate): ImportCenterRecentCategory {
  if (entry.targetEntity === "properties") return "property";
  if (entry.targetEntity === "parties") return "person";
  if (entry.linkedCaseId) return "case";
  return "unknown";
}

function isWithinRecentWindow(entry: ImportCenterRecentEntry, since?: Date): boolean {
  if (!since) return true;
  const timestamp = entry.updatedAt.getTime();
  return Number.isFinite(timestamp) && timestamp >= since.getTime();
}

function canonicalEntryKey(entry: ImportCenterRecentEntry): string {
  return entry.id;
}

/**
 * Build the recent activity list shown on the import-center landing page.
 *
 * All candidates are already tenant-scoped by their readers. An imported case
 * and its source job represent one object, so a linked job is keyed to the
 * case and the newest valid timestamp wins. This lets a later case edit
 * replace the older source-job activity instead of leaving a duplicate row.
 * Property rows expose only createdAt. The page augments those candidates
 * with tenant-scoped audit activity timestamps before calling this helper;
 * the newest valid timestamp wins without inventing an update time.
 */
export function buildImportCenterRecentInputs(input: ImportCenterRecentInputs): ImportCenterRecentEntry[] {
  const limit = input.limit === undefined ? undefined : Math.max(0, Math.trunc(input.limit));
  const caseCandidates = (input.cases ?? []).map((entry) => ({ ...entry, category: "case" as const }));
  const fileJobs = (input.fileJobs ?? []).map((entry) => ({ ...entry, category: getFileJobCategory(entry) }));
  const candidates = [...caseCandidates, ...(input.clients ?? []), ...(input.properties ?? []), ...fileJobs]
    .filter((entry) => isWithinRecentWindow(entry, input.since));
  const newestByObject = new Map<string, ImportCenterRecentEntry>();
  for (const entry of candidates) {
    const key = "linkedCaseId" in entry && entry.linkedCaseId
      ? `case:${entry.linkedCaseId}`
      : canonicalEntryKey(entry);
    const previous = newestByObject.get(key);
    if (!previous) {
      newestByObject.set(key, entry);
      continue;
    }
    const timestamp = entry.updatedAt.getTime();
    const previousTimestamp = previous.updatedAt.getTime();
    if (timestamp > previousTimestamp || (timestamp === previousTimestamp && entry.id.localeCompare(previous.id) < 0)) {
      newestByObject.set(key, entry);
    }
  }
  const sorted = [...newestByObject.values()]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, limit);
  return sorted.map(({ id, title, type, href, updatedAt, category }) => ({ id, title, type, href, updatedAt, category }));
}
