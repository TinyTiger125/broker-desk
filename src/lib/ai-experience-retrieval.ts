import { listAiExperienceDrafts, type AiExperienceDraft } from "@/lib/data";

export type AiExperienceRetrievalContext = {
  templateId?: string;
  fieldKeys?: string[];
  limit?: number;
};

export type ApprovedAiExperienceContext = {
  drafts: AiExperienceDraft[];
  contextMarkdown: string;
};

function matchesTemplate(draft: AiExperienceDraft, templateId?: string) {
  if (!templateId) return true;
  if (!draft.templateId) return true;
  return draft.templateId === templateId;
}

function matchesField(draft: AiExperienceDraft, fieldKeys?: string[]) {
  if (!fieldKeys || fieldKeys.length === 0) return true;
  if (!draft.fieldKey) return true;
  const draftFieldKey = draft.fieldKey;
  const fields = new Set(fieldKeys);
  if (fields.has(draftFieldKey)) return true;
  return fieldKeys.some((fieldKey) => draftFieldKey === `layout.${fieldKey}` || draftFieldKey.startsWith(`${fieldKey}.`));
}

export function selectRelevantApprovedAiExperienceDrafts(
  drafts: AiExperienceDraft[],
  context: AiExperienceRetrievalContext = {},
): AiExperienceDraft[] {
  const limit = Math.max(1, context.limit ?? 8);
  return drafts
    .filter((draft) => draft.status === "approved")
    .filter((draft) => matchesTemplate(draft, context.templateId))
    .filter((draft) => matchesField(draft, context.fieldKeys))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);
}

export function buildApprovedAiExperienceContextMarkdown(drafts: AiExperienceDraft[]) {
  if (drafts.length === 0) return "";
  return [
    "## Approved Broker Desk Experience",
    "Use these as scoped hints only. They are not confirmed facts for the current case.",
    ...drafts.map((draft, index) =>
      [
        `### ${index + 1}. ${draft.title}`,
        `scope=${draft.scopeCandidate}${draft.templateId ? ` / template=${draft.templateId}` : ""}${draft.fieldKey ? ` / field=${draft.fieldKey}` : ""}`,
        draft.bodyMarkdown,
      ].join("\n"),
    ),
  ].join("\n\n");
}

export async function getApprovedAiExperienceContext(input: {
  userId: string;
  templateId?: string;
  fieldKeys?: string[];
  limit?: number;
}): Promise<ApprovedAiExperienceContext> {
  const drafts = await listAiExperienceDrafts({ userId: input.userId, status: "approved", limit: 200 });
  const selected = selectRelevantApprovedAiExperienceDrafts(drafts, {
    templateId: input.templateId,
    fieldKeys: input.fieldKeys,
    limit: input.limit,
  });
  return {
    drafts: selected,
    contextMarkdown: buildApprovedAiExperienceContextMarkdown(selected),
  };
}
