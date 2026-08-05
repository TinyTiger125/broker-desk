import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkAuthConfigured, isClerkAuthEnabled, isProductionRuntime } from "@/lib/auth-mode";
import { assertProductionAuthReady } from "@/lib/production-readiness";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health/data(.*)",
  "/api/locale(.*)",
  "/api/webhooks/clerk(.*)",
]);

const clerkProxy = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export default function proxy(req: Parameters<typeof clerkProxy>[0], event: Parameters<typeof clerkProxy>[1]) {
  if (isProductionRuntime()) {
    try {
      assertProductionAuthReady();
    } catch {
      return new NextResponse("Service unavailable", { status: 503 });
    }
  }
  if (!isClerkAuthEnabled()) return NextResponse.next();
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
