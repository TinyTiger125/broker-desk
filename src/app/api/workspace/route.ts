import { NextResponse } from "next/server";
import { ACTIVE_TENANT_COOKIE_NAME } from "@/lib/tenant-permissions";
import { requireTenantSession, shouldUseSecureCookie, TenantSessionError } from "@/lib/tenant-session";

type WorkspacePayload = {
  tenantId?: string;
};

export async function POST(request: Request) {
  let payload: WorkspacePayload;
  try {
    payload = (await request.json()) as WorkspacePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const tenantId = String(payload.tenantId ?? "").trim();
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "missing_tenant_id" }, { status: 400 });
  }

  try {
    // Use the same current-identity and current-tenant resolver as protected
    // pages. This prevents a Clerk session from selecting through a divergent
    // default-user membership lookup.
    const session = await requireTenantSession({ requestedTenantId: tenantId });
    const response = NextResponse.json({ ok: true, tenantId: session.tenant.id });
    response.cookies.set(ACTIVE_TENANT_COOKIE_NAME, session.tenant.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
      secure: shouldUseSecureCookie(request),
    });
    return response;
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    throw error;
  }
}
