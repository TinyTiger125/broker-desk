import { NextResponse } from "next/server";
import { getDefaultUser, getTenantById, isTenantAccessibleStatus, listTenantMemberships } from "@/lib/data";
import { ACTIVE_TENANT_COOKIE_NAME } from "@/lib/tenant-permissions";
import { shouldUseSecureCookie } from "@/lib/tenant-session";

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

  const user = await getDefaultUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  const memberships = await listTenantMemberships(user.id);
  const membership = memberships.find(
    (item) => item.tenantId === tenantId && item.status === "active",
  );
  if (!membership) {
    return NextResponse.json({ ok: false, error: "workspace_forbidden" }, { status: 403 });
  }

  const tenant = await getTenantById(membership.tenantId);
  if (!tenant || !isTenantAccessibleStatus(tenant.status)) {
    return NextResponse.json({ ok: false, error: "workspace_unavailable" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, tenantId: membership.tenantId });
  response.cookies.set(ACTIVE_TENANT_COOKIE_NAME, membership.tenantId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
  });
  return response;
}
