export type LifecycleStatus = "active" | "archived";
export type LifecycleFilter = LifecycleStatus | "all";

export function isLifecycleStatus(value: unknown): value is LifecycleStatus {
  return value === "active" || value === "archived";
}

export function normalizeLifecycleFilter(value: unknown): LifecycleFilter {
  return value === "archived" || value === "all" ? value : "active";
}
