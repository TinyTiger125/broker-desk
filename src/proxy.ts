import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkAuthConfigured, isClerkAuthEnabled, isDemoAuthEnabled, isProductionRuntime, isSupabaseAuthConfigured, isSupabaseAuthEnabled, isTrustedHeaderAuthEnabled } from "@/lib/auth-mode";
import { assertProductionAuthReady, assertProductionRateLimitReady } from "@/lib/production-readiness";
import { checkRequestRateLimit } from "@/lib/request-rate-limit";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/forgot-password(.*)",
  "/auth/callback(.*)",
  "/auth/confirm(.*)",
  "/auth/invite",
  "/api/health/data(.*)",
  "/api/locale(.*)",
  "/api/webhooks/clerk(.*)",
  "/api/internal/import-jobs/drain(.*)",
]);

const isClerkWebhookRoute = createRouteMatcher(["/api/webhooks/clerk(.*)"]);
const isQaRoute = createRouteMatcher(["/api/qa(.*)"]);
const isImportWorkerRoute = createRouteMatcher(["/api/internal/import-jobs/drain(.*)"]);
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOCAL_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const clerkProxy = clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  },
  {
    // Use Clerk's public signing key when configured so valid session tokens
    // can be verified locally instead of requiring a network round trip.
    jwtKey: process.env.CLERK_JWT_KEY?.trim() || undefined,
  },
);

function hasSameOriginWriteRequest(req: Parameters<typeof clerkProxy>[0]) {
  if (!UNSAFE_METHODS.has(req.method) || !req.nextUrl.pathname.startsWith("/api/")) return true;

  // Clerk webhooks authenticate with Svix, and QA routes require their own
  // development-only gate. Browser initiated writes must be same-origin.
  if (isClerkWebhookRoute(req) || isQaRoute(req) || isImportWorkerRoute(req)) return true;

  const requestOrigin = req.headers.get("origin");
  if (requestOrigin === req.nextUrl.origin) return true;

  // The local runtime binds IPv4 loopback, while browsers may preserve the
  // `localhost` URL used to open the app (or vice versa). Treat those names
  // as one origin only for the explicitly local demo runtime, with the same
  // HTTP scheme and port. Production and hosted auth keep strict equality.
  if (process.env.BROKER_DESK_LOCAL_RUNTIME !== "1" || !requestOrigin) return false;
  try {
    const supplied = new URL(requestOrigin);
    const expected = new URL(req.nextUrl.origin);
    return supplied.protocol === "http:"
      && expected.protocol === "http:"
      && supplied.port === expected.port
      && LOCAL_LOOPBACK_HOSTS.has(supplied.hostname)
      && LOCAL_LOOPBACK_HOSTS.has(expected.hostname);
  } catch {
    return false;
  }
}

export default function proxy(req: Parameters<typeof clerkProxy>[0], event: Parameters<typeof clerkProxy>[1]) {
  if (isProductionRuntime()) {
    try {
      assertProductionAuthReady();
      assertProductionRateLimitReady();
    } catch {
      return new NextResponse("Service unavailable", { status: 503 });
    }
  }
  const rateLimit = checkRequestRateLimit(req);
  if (!rateLimit.allowed) {
    const headers = new Headers({ "Retry-After": String(rateLimit.retryAfterSeconds) });
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers });
    }
    return new NextResponse("Too many requests. Please try again shortly.", { status: 429, headers });
  }
  if (!hasSameOriginWriteRequest(req)) {
    return NextResponse.json({ ok: false, error: "invalid_request_origin" }, { status: 403 });
  }
  if (!isClerkAuthEnabled()) {
    if (isSupabaseAuthEnabled()) {
      if (!isSupabaseAuthConfigured()) return new NextResponse("Supabase Auth is not configured.", { status: 503 });
      return updateSupabaseSession(req, { requireAuth: !isPublicRoute(req) });
    }
    // Trusted-header identities are a non-production harness boundary. The
    // route handlers still verify the signed shared secret and resolve the
    // subject through the normal tenant/session and PostgreSQL RLS paths.
    if (isTrustedHeaderAuthEnabled()) return NextResponse.next();
    if (isDemoAuthEnabled()) return NextResponse.next();
    if (isPublicRoute(req)) return NextResponse.next();
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
    }
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("reason", "login_required");
    return NextResponse.redirect(signInUrl);
  }
  if (!isClerkAuthConfigured()) {
    return new NextResponse("Clerk auth is not configured.", { status: 503 });
  }
  return clerkProxy(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
