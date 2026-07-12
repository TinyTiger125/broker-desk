import { NextResponse } from "next/server";
import { getGeneratedOutputById, getQuotationById, listQuoteFormData } from "@/lib/data";
import { getOutputDocLabel, isOutputDocType } from "@/lib/output-doc";
import type { Locale } from "@/lib/locale";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeLocale(value: string | null): Locale {
  if (value === "zh" || value === "ko" || value === "ja") return value;
  return "ja";
}

export async function GET(request: Request, context: RouteContext) {
  let session;
  try {
    session = await requireTenantSession({ permission: "output.download_final" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
  const user = session.user;
  const tenantId = session.tenant.id;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const output = await getGeneratedOutputById({ userId: user.id, tenantId, id });
  if (!output) {
    return NextResponse.json({ error: "output_not_found" }, { status: 404 });
  }

  const quote = output.quoteId ? await getQuotationById(output.quoteId, tenantId) : undefined;
  const { properties } = await listQuoteFormData(tenantId);
  const property = output.propertyId ? properties.find((item) => item.id === output.propertyId) : quote?.property;
  const locale = normalizeLocale(new URL(request.url).searchParams.get("locale"));
  const outputType = isOutputDocType(output.outputType) ? output.outputType : "proposal";
  const title = output.title || getOutputDocLabel(locale, outputType);
  const generatedAt = output.generatedAt.toISOString();
  const content = [
    `# ${title}`,
    "",
    `Document: ${output.documentNumber || "-"}`,
    `Format: ${output.outputFormat.toUpperCase()}`,
    `Language: ${output.language.toUpperCase()}`,
    `Created: ${generatedAt}`,
    "",
    `Client: ${quote?.client?.name ?? "-"}`,
    `Property: ${property?.name ?? "-"}`,
    `Listing Price: ${quote?.listingPrice ?? property?.listingPrice ?? 0}`,
    `Down Payment: ${quote?.downPayment ?? 0}`,
    `Monthly Payment: ${quote?.monthlyPaymentEstimate ?? 0}`,
    "",
    quote?.summaryText ?? "",
  ].join("\n");

  const fileExt = output.outputFormat === "docx" ? "docx.txt" : "pdf.txt";
  const safeName = title.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 64) || "output";

  return new NextResponse(content, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${safeName}.${fileExt}"`,
    },
  });
}
