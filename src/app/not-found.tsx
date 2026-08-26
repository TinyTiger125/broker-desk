import Link from "next/link";
import { SystemStatePanel } from "@/components/system-state-panel";
import { getLocale } from "@/lib/locale";
import { getSystemStateCopy } from "@/lib/system-state-copy";

export default async function NotFound() {
  const locale = await getLocale();
  const text = getSystemStateCopy(locale);

  return (
    <SystemStatePanel
      locale={locale}
      tone="empty"
      title={text.notFoundTitle}
      description={text.notFoundDescription}
      actions={<Link href="/" className="inline-flex min-h-11 items-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{text.back}</Link>}
    />
  );
}
