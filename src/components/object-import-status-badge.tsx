import type { ObjectImportStatus } from "@/lib/object-import-repository";
export function ObjectImportStatusBadge({ status }: { status: ObjectImportStatus }) { return <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold">{status}</span>; }
