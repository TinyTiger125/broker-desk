import { NextResponse } from "next/server";
import { createRequestContext } from "@/lib/visibility-resolver";
import { filterExactClientNameMatches } from "@/lib/client-name-search";
import { listClientsForContext } from "@/lib/data";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

const MAX_RESULTS = 8;

function json(body: Record<string, unknown>, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  let session;
  try {
    session = await requireTenantSession({ permission: "record.read" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return json({ ok: false, error: error.code }, error.status);
    }
    return json({ ok: false, error: "client_name_lookup_unavailable" }, 500);
  }

  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if (!query.trim()) return json({ ok: true, matches: [] });
    const clients = await listClientsForContext({
      context: createRequestContext(session),
      filter: { lifecycleStatus: "all", sort: "recent_contact" },
    });
    const matches = filterExactClientNameMatches(clients.map((item) => item.client), query).slice(0, MAX_RESULTS);
    return json({
      ok: true,
      matches: matches.map((client) => ({
        id: client.id,
        name: client.name,
        nameLatin: client.nameLatin,
        nameKanji: client.nameKanji,
        nameKatakana: client.nameKatakana,
      })),
    });
  } catch {
    return json({ ok: false, error: "client_name_lookup_unavailable" }, 500);
  }
}
