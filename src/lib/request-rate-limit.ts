export type RequestRateLimitBucket = "authentication" | "mutation" | "download";

type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RequestRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  bucket?: RequestRateLimitBucket;
};

const RATE_LIMIT_POLICIES: Record<RequestRateLimitBucket, RateLimitPolicy> = {
  authentication: { limit: 30, windowMs: 60_000 },
  mutation: { limit: 120, windowMs: 60_000 },
  download: { limit: 240, windowMs: 60_000 },
};

function getClientAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedAddress = forwardedFor?.split(",")[0]?.trim();
  return forwardedAddress || request.headers.get("x-real-ip") || "unknown";
}

export function classifyRequestRateLimit(request: Request): RequestRateLimitBucket | undefined {
  const pathname = new URL(request.url).pathname;

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return "authentication";
  }
  if (pathname.startsWith("/api/attachments/") || pathname.includes("/download")) {
    return "download";
  }
  if (request.method !== "GET" && request.method !== "HEAD" && pathname.startsWith("/api/")) {
    return "mutation";
  }

  return undefined;
}

export function createRequestRateLimiter() {
  const entries = new Map<string, RateLimitEntry>();

  return (request: Request, now = Date.now()): RequestRateLimitResult => {
    const bucket = classifyRequestRateLimit(request);
    if (!bucket) return { allowed: true, retryAfterSeconds: 0 };

    const policy = RATE_LIMIT_POLICIES[bucket];
    const key = `${bucket}:${getClientAddress(request)}`;
    const existing = entries.get(key);
    const entry = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : existing;

    entry.count += 1;
    entries.set(key, entry);

    // Avoid unbounded local state for public routes. This is a fallback guard;
    // production additionally requires a durable edge rate-limit policy.
    if (entries.size > 10_000) {
      for (const [staleKey, staleEntry] of entries) {
        if (staleEntry.resetAt <= now) entries.delete(staleKey);
      }
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      allowed: entry.count <= policy.limit,
      retryAfterSeconds,
      bucket,
    };
  };
}

export const checkRequestRateLimit = createRequestRateLimiter();
