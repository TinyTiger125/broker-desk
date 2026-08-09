import { randomUUID } from "node:crypto";

type OperationalEvent = {
  event: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  jobId?: string;
  outcome?: "accepted" | "deduplicated" | "failed" | "ready";
  detail?: Record<string, string | number | boolean | undefined>;
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;

export function getRequestId(request: Request) {
  const incoming = request.headers.get("x-request-id")?.trim();
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

export function logOperationalEvent(event: OperationalEvent) {
  // Keep operational logs linkable without storing file names, extracted values or document contents.
  console.info(
    JSON.stringify({
      type: "broker_desk_operational_event",
      occurredAt: new Date().toISOString(),
      ...event,
    }),
  );
}
