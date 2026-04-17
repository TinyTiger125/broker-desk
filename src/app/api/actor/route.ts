import { NextResponse } from "next/server";
import { ACTOR_COOKIE_NAME } from "@/lib/actor";
import { getUserById } from "@/lib/data";

type ActorPayload = {
  actorId?: string;
};

export async function POST(request: Request) {
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

  const response = NextResponse.json({ ok: true, actorId: user.id });
  response.cookies.set(ACTOR_COOKIE_NAME, user.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
