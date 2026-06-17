import { NextResponse } from "next/server";
import { requireTenantSession, TenantSessionError } from "@/lib/tenant-session";

export async function GET() {
  try {
    const session = await requireTenantSession({ permission: "tenant.read" });
    return NextResponse.json({
      ok: true,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      tenant: {
        id: session.tenant.id,
        name: session.tenant.name,
        slug: session.tenant.slug,
      },
      membership: {
        id: session.membership.id,
        role: session.membership.role,
        status: session.membership.status,
      },
    });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    throw error;
  }
}
