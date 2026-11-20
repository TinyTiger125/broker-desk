import { NextResponse } from "next/server";
import {
  getJapanesePostalCodeIndexStatus,
  lookupJapanesePostalCode,
  normalizeJapanesePostalCode,
} from "@/lib/japan-postal-code";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const postalCode = normalizeJapanesePostalCode(url.searchParams.get("postalCode") ?? "");
  if (postalCode.length !== 7) {
    return NextResponse.json(
      { ok: false, error: "invalid_postal_code", postalCode },
      { status: 400 },
    );
  }

  const indexStatus = getJapanesePostalCodeIndexStatus();
  if (indexStatus.status !== "ready") {
    return NextResponse.json(
      {
        ok: false,
        error: "postal_code_index_unavailable",
        postalCode,
        source: indexStatus.source,
        generatedAt: indexStatus.generatedAt,
      },
      { status: 503 },
    );
  }

  const lookup = lookupJapanesePostalCode(postalCode);
  if (!lookup) {
    return NextResponse.json(
      { ok: false, error: "postal_code_not_found", postalCode },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    postalCode: lookup.postalCode,
    prefecture: lookup.prefecture,
    municipality: lookup.municipality,
    townArea: lookup.townArea,
    addressPrefix: lookup.addressPrefix,
    candidateCount: lookup.candidates.length,
    source: lookup.source,
  });
}
