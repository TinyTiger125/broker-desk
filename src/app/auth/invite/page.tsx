import type { Metadata } from "next";
import { SupabaseInviteFragmentConfirm } from "@/components/supabase-invite-fragment-confirm";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Confirm invitation | Broker Desk",
  robots: { index: false, follow: false },
};

export default async function SupabaseInvitePage() {
  const locale = await getLocale();
  return <SupabaseInviteFragmentConfirm locale={locale} />;
}
