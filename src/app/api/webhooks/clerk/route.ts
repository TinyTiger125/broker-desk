import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import {
  suspendExternalAuthUser,
  syncExternalAuthUser,
} from "@/lib/data.admin.postgres";

export const dynamic = "force-dynamic";

type ClerkUserWebhookData = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{
    id?: string | null;
    email_address?: string | null;
  }>;
};

function extractEmail(data: ClerkUserWebhookData): string | undefined {
  const primary = data.email_addresses?.find((item) => item.id === data.primary_email_address_id);
  return (primary?.email_address ?? data.email_addresses?.[0]?.email_address)?.trim().toLowerCase() || undefined;
}

function extractName(data: ClerkUserWebhookData): string | undefined {
  return [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || data.username?.trim() || undefined;
}

export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "clerk_webhook_verification_failed", message: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const data = event.data as ClerkUserWebhookData;
    const subject = data.id?.trim();
    if (!subject) {
      return NextResponse.json({ ok: false, error: "clerk_user_id_missing" }, { status: 400 });
    }
    const user = await syncExternalAuthUser({
      subject,
      email: extractEmail(data),
      name: extractName(data),
    });
    return NextResponse.json({
      ok: true,
      eventType: event.type,
      userId: user.userId,
    });
  }

  if (event.type === "user.deleted") {
    const data = event.data as ClerkUserWebhookData;
    const subject = data.id?.trim();
    if (!subject) {
      return NextResponse.json({ ok: false, error: "clerk_user_id_missing" }, { status: 400 });
    }
    const result = await suspendExternalAuthUser(subject);
    return NextResponse.json({
      ok: true,
      eventType: event.type,
      ...result,
    });
  }

  return NextResponse.json({ ok: true, eventType: event.type, ignored: true });
}
