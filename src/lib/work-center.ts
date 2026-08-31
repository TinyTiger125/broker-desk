import type {
  WorkCenterClientItem,
  WorkCenterFollowUpItem,
  WorkCenterSnapshot,
  WorkCenterTaskItem,
} from "@/lib/data";

const TOKYO_TIME_ZONE = "Asia/Tokyo";

function tokyoDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}
function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export type WorkCenterDay = {
  key: string;
  date: Date;
  tasks: WorkCenterTaskItem[];
  followUps: WorkCenterFollowUpItem[];
};

export type WorkCenterModel = {
  todayKey: string;
  overdueTasks: WorkCenterTaskItem[];
  todayTasks: WorkCenterTaskItem[];
  upcomingTasks: WorkCenterTaskItem[];
  unscheduledTasks: WorkCenterTaskItem[];
  waitingClients: WorkCenterClientItem[];
  noNextActionClients: WorkCenterClientItem[];
  staleClients: WorkCenterClientItem[];
  communicationSignals: WorkCenterFollowUpItem[];
  days: WorkCenterDay[];
  truncated: boolean;
};

export function buildWorkCenterModel(snapshot: WorkCenterSnapshot, now = new Date()): WorkCenterModel {
  const todayKey = tokyoDateKey(now);
  const endKey = tokyoDateKey(addDays(now, 6));
  const dueKey = (item: WorkCenterTaskItem) => item.task.dueAt ? tokyoDateKey(item.task.dueAt) : undefined;
  const overdueTasks = snapshot.tasks.filter((item) => {
    const key = dueKey(item);
    return Boolean(key && key < todayKey);
  });
  const todayTasks = snapshot.tasks.filter((item) => dueKey(item) === todayKey);
  const upcomingTasks = snapshot.tasks.filter((item) => {
    const key = dueKey(item);
    return Boolean(key && key > todayKey && key <= endKey);
  });
  const unscheduledTasks = snapshot.tasks.filter((item) => !item.task.dueAt);
  const pendingClientIds = new Set(snapshot.tasks.map((item) => item.client.id));
  const waitingClients = snapshot.clients.filter((item) => {
    if (!item.client.nextFollowUpAt) return false;
    return tokyoDateKey(item.client.nextFollowUpAt) <= endKey;
  });
  const noNextActionClients = snapshot.clients.filter((item) => !item.client.nextFollowUpAt && !pendingClientIds.has(item.client.id));
  const staleThreshold = addDays(now, -7).getTime();
  const staleClients = snapshot.clients.filter((item) => !item.client.lastContactedAt || item.client.lastContactedAt.getTime() < staleThreshold);
  const communicationSignals = snapshot.followUps.filter((item) => item.followUp.type === "email").slice(0, 8);
  const days = Array.from({ length: 7 }, (_, index): WorkCenterDay => {
    const date = addDays(now, index);
    const key = tokyoDateKey(date);
    return {
      key,
      date,
      tasks: snapshot.tasks.filter((item) => dueKey(item) === key),
      followUps: snapshot.followUps.filter((item) => item.followUp.nextFollowUpAt && tokyoDateKey(item.followUp.nextFollowUpAt) === key),
    };
  });

  return {
    todayKey,
    overdueTasks,
    todayTasks,
    upcomingTasks,
    unscheduledTasks,
    waitingClients,
    noNextActionClients,
    staleClients,
    communicationSignals,
    days,
    truncated: snapshot.hasMoreTasks || snapshot.hasMoreFollowUps || snapshot.hasMoreClients,
  };
}
