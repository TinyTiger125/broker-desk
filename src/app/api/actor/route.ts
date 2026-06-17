import { NextResponse } from "next/server";
import { ACTOR_COOKIE_NAME, isActorSwitchingEnabled } from "@/lib/actor";
import { getUserById, listTenantMemberships } from "@/lib/data";
import { ACTIVE_TENANT_COOKIE_NAME } from "@/lib/tenant-permissions";

type ActorPayload = {
  actorId?: string;
};

export async function POST(request: Request) {
  if (!isActorSwitchingEnabled()) {
    return NextResponse.json({ ok: false, error: "actor_switching_disabled" }, { status: 403 });
  }

  let payload: ActorPayload = {};
  try {
    payload = (await request.json()) as ActorPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const actorId = String(payload.actorId ?? "").trim();
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "missing_actor_id" }, { status: 400 });
  }

  const user = await getUserById(actorId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "invalid_actor_id" }, { status: 404 });
  }

  const memberships = await listTenantMemberships(user.id);
  const activeMembership = memberships.find((membership) => membership.status === "active");

  const response = NextResponse.json({
    ok: true,
    actorId: user.id,
    tenantId: activeMembership?.tenantId,
    role: activeMembership?.role,
  });
  response.cookies.set(ACTOR_COOKIE_NAME, user.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  if (activeMembership) {
    response.cookies.set(ACTIVE_TENANT_COOKIE_NAME, activeMembership.tenantId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  } else {
    response.cookies.set(ACTIVE_TENANT_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
  }
  return response;
}
