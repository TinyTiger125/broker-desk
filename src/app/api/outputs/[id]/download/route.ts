import { NextResponse } from "next/server";
import { getDefaultUser, getGeneratedOutputById, getQuotationById } from "@/lib/data";
import { getOutputDocLabel, isOutputDocType } from "@/lib/output-doc";
import type { Locale } from "@/lib/locale";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeLocale(value: string | null): Locale {
  if (value === "zh" || value === "ko" || value === "ja") return value;
  return "ja";
}

export async function GET(request: Request, context: RouteContext) {
  const user = await getDefaultUser();
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const output = await getGeneratedOutputById({ userId: user.id, id });
  if (!output) {
    return NextResponse.json({ error: "output_not_found" }, { status: 404 });
  }

  const quote = await getQuotationById(output.quoteId);
  const locale = normalizeLocale(new URL(request.url).searchParams.get("locale"));
  const outputType = isOutputDocType(output.outputType) ? output.outputType : "proposal";
  const title = output.title || getOutputDocLabel(locale, outputType);
  const generatedAt = output.generatedAt.toISOString();
  const content = [
    `# ${title}`,
    "",
    `Output ID: ${output.id}`,
    `Document Number: ${output.documentNumber || "-"}`,
    `Actor ID: ${output.actorId || "-"}`,
    `Quote ID: ${output.quoteId}`,
    `Source Quote ID: ${output.sourceQuoteId || output.quoteId}`,
    `Format: ${output.outputFormat.toUpperCase()}`,
    `Language: ${output.language.toUpperCase()}`,
    `Template Version ID: ${output.templateVersionId ?? "-"}`,
    `Generated At: ${generatedAt}`,
    "",
    `Client: ${quote?.client?.name ?? "-"}`,
    `Property: ${quote?.property?.name ?? "-"}`,
    `Listing Price: ${quote?.listingPrice ?? 0}`,
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
