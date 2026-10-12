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
  fileJobs?: readonly ImportCenterRecentJobCandidate[];
  limit?: number;
};

function getFileJobCategory(entry: ImportCenterRecentJobCandidate): ImportCenterRecentCategory {
  if (entry.targetEntity === "properties") return "property";
  if (entry.targetEntity === "parties") return "person";
  if (entry.linkedCaseId) return "case";
  return "unknown";
}

/**
 * Build the recovery list shown on the import-center landing page.
 *
 * Cases with a source import job are already represented by that file job, so
 * only cases with no source job are manual saves. The inputs come from the
 * tenant-scoped data readers; this helper only combines persisted records and
 * never manufactures an entry for an unsuccessful save.
 */
export function buildImportCenterRecentInputs(input: ImportCenterRecentInputs): ImportCenterRecentEntry[] {
  const limit = Math.max(0, Math.trunc(input.limit ?? 3));
  const manualCases = (input.cases ?? []).filter((entry) => entry.sourceImportJobIds.length === 0);
  const fileJobs = (input.fileJobs ?? []).map((entry) => ({ ...entry, category: getFileJobCategory(entry) }));
  return [...manualCases, ...(input.clients ?? []), ...fileJobs]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ id, title, type, href, updatedAt, category }) => ({ id, title, type, href, updatedAt, category }));
}
