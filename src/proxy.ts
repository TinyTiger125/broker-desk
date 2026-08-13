import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkAuthConfigured, isClerkAuthEnabled, isDemoAuthEnabled, isProductionRuntime } from "@/lib/auth-mode";
import { assertProductionAuthReady, assertProductionRateLimitReady } from "@/lib/production-readiness";
import { checkRequestRateLimit } from "@/lib/request-rate-limit";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health/data(.*)",
  "/api/locale(.*)",
  "/api/webhooks/clerk(.*)",
  "/api/internal/import-jobs/drain(.*)",
]);

const isClerkWebhookRoute = createRouteMatcher(["/api/webhooks/clerk(.*)"]);
const isQaRoute = createRouteMatcher(["/api/qa(.*)"]);
const isImportWorkerRoute = createRouteMatcher(["/api/internal/import-jobs/drain(.*)"]);
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

  return req.headers.get("origin") === req.nextUrl.origin;
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
