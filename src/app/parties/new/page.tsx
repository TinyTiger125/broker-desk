import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewPartyPage({ searchParams }: { searchParams?: Promise<{ from?: string; returnTo?: string }> }) {
  const params = (await searchParams) ?? {};
  const returnTo = params.from === "entry" || params.returnTo?.startsWith("/import-center") ? "/import-center" : "/organize-center?type=party";
  redirect(`/clients/new?returnTo=${encodeURIComponent(returnTo)}`);
}
