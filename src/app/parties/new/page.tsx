import { notFound } from "next/navigation";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

export default async function NewPartyPage() {
  await requireTenantSession({ permission: "record.update" });
  notFound();
}
