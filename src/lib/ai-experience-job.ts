import {
  addAiExperienceDrafts,
  listAiExperienceDrafts,
  listCorrectionEvents,
  type AiExperienceDraft,
} from "@/lib/data";
import { buildAiExperienceDraftsFromCorrectionEvents } from "@/lib/ai-experience-draft";

export type DraftAiExperiencesResult = {
  createdDrafts: AiExperienceDraft[];
  skippedDuplicateCount: number;
  sourceEventCount: number;
};

function eventSetKey(eventIds: string[]) {
  return eventIds.slice().sort().join("|");
}

export async function draftAiExperiencesFromRecentCorrections(input: {
  userId: string;
  tenantId?: string;
  limit?: number;
  minEventsPerDraft?: number;
}): Promise<DraftAiExperiencesResult> {
  const [events, existingDrafts] = await Promise.all([
    listCorrectionEvents({ userId: input.userId, tenantId: input.tenantId, limit: input.limit ?? 200 }),
    listAiExperienceDrafts({ userId: input.userId, tenantId: input.tenantId, limit: 500 }),
  ]);

  const existingKeys = new Set(existingDrafts.map((draft) => eventSetKey(draft.eventIds)));
  const candidates = buildAiExperienceDraftsFromCorrectionEvents({
    events,
    minEventsPerDraft: input.minEventsPerDraft,
  });
  const newDrafts = candidates.filter((draft) => !existingKeys.has(eventSetKey(draft.eventIds)));

  return {
    createdDrafts: await addAiExperienceDrafts({ userId: input.userId, tenantId: input.tenantId, drafts: newDrafts }),
    skippedDuplicateCount: candidates.length - newDrafts.length,
    sourceEventCount: events.length,
  };
}
