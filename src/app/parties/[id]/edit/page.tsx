import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Compatibility link: the customer editor owns the form, review and archive. */
export default async function EditPartyPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string; returnTo?: string; entryApplied?: string }>;
}) {
  const { id } = await params;
  const query = new URLSearchParams();
  const values = (await searchParams) ?? {};
  for (const key of ["flash", "returnTo", "entryApplied"] as const) {
    if (values[key]) query.set(key, values[key]);
  }
  redirect(`/clients/${encodeURIComponent(id)}/edit${query.size ? `?${query}` : ""}`);
}
