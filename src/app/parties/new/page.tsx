import { redirect } from "next/navigation";
import { normalizeImportCenterObjectReturnTo } from "@/lib/import-center-return";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

function normalizePartyReturnTo(value: string | undefined, from?: string): string {
  if (from === "entry") return "/import-center";
  return normalizeImportCenterObjectReturnTo(value, "person", true) ?? "/organize-center?type=party";
}

export default async function NewPartyPage({ searchParams }: { searchParams?: Promise<{ from?: string; returnTo?: string }> }) {
  await requireTenantSession({ permission: "record.update" });
  const params = (await searchParams) ?? {};
  const returnTo = normalizePartyReturnTo(params.returnTo, params.from);
  redirect(`/clients/new?returnTo=${encodeURIComponent(returnTo)}`);
}
