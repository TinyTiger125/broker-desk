import { NextRequest, NextResponse } from "next/server";
import {
  getHubOverview,
  listHubContracts,
  listHubGeneratedOutputs,
  listHubImportJobs,
  listHubParties,
  listHubProperties,
  listHubServiceRequests,
} from "@/lib/hub";
import type { Locale } from "@/lib/locale";

function toCsv(rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value);
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, "\"\"")}"`;
  };
  const body = rows.map((row) => headers.map((header) => escapeCell(row[header])).join(","));
  return [headers.join(","), ...body].join("\n");
}

function normalizeLocale(value: string | null): Locale {
  if (value === "zh" || value === "ko") return value;
  return "ja";
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope") ?? "properties";
  const locale = normalizeLocale(request.nextUrl.searchParams.get("locale"));
  const ids = request.nextUrl.searchParams.getAll("ids").flatMap((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const idSet = ids.length > 0 ? new Set(ids) : null;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  if (scope === "dashboard") {
    const overview = await getHubOverview();
    const csv = toCsv([
      {
        property_count: overview.propertyCount,
        party_count: overview.partyCount,
        contract_count: overview.contractCount,
        service_request_count: overview.serviceRequestCount,
        pending_service_request_count: overview.pendingServiceRequestCount,
        generated_output_count: overview.generatedOutputCount,
      },
    ]);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="dashboard-${stamp}.csv"`,
      },
    });
  }

  if (scope === "properties") {
    const items = (await listHubProperties(locale)).filter((item) => (idSet ? idSet.has(item.id) : true));
    const csv = toCsv(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        area: item.area,
        listing_price: item.listingPrice,
        management_fee: item.managementFee,
        repair_fee: item.repairFee,
        attachment_count: item.attachmentCount,
        status: item.status,
      }))
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="properties-${stamp}.csv"`,
      },
    });
  }

  if (scope === "parties") {
    const items = (await listHubParties(locale)).filter((item) => (idSet ? idSet.has(item.id) : true));
    const csv = toCsv(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        email: item.email ?? "",
        party_type: item.partyType,
        roles: item.roles.join(" / "),
        related_property_hint: item.relatedPropertyHint ?? "",
        contract_count: item.contractCount,
      }))
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="parties-${stamp}.csv"`,
      },
    });
  }

  if (scope === "contracts") {
    const items = (await listHubContracts(locale)).filter((item) => (idSet ? idSet.has(item.id) : true));
    const csv = toCsv(
      items.map((item) => ({
        id: item.id,
        contract_type: item.contractType,
        contract_number: item.contractNumber,
        related_property: item.relatedProperty ?? "",
        related_party: item.relatedParty ?? "",
        signed_at: item.signedAt?.toISOString() ?? "",
        effective_until: item.effectiveUntil?.toISOString() ?? "",
        status: item.status,
      }))
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="contracts-${stamp}.csv"`,
      },
    });
  }

  if (scope === "service_requests") {
    const items = (await listHubServiceRequests()).filter((item) => (idSet ? idSet.has(item.id) : true));
    const csv = toCsv(
      items.map((item) => ({
        id: item.id,
        title: item.title,
        related_property: item.relatedProperty ?? "",
        related_party: item.relatedParty ?? "",
        status: item.status,
        occurred_at: item.occurredAt?.toISOString() ?? "",
        completed_at: item.completedAt?.toISOString() ?? "",
        cost: item.cost ?? "",
      }))
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="service-requests-${stamp}.csv"`,
      },
    });
  }

  if (scope === "outputs") {
    const outputTypeFilter = request.nextUrl.searchParams.get("type");
    const outputLangFilter = request.nextUrl.searchParams.get("lang");
    const outputFormatFilter = request.nextUrl.searchParams.get("format");
    const items = (await listHubGeneratedOutputs(locale)).filter((item) =>
      (outputTypeFilter ? item.outputType === outputTypeFilter : true) &&
      (outputLangFilter ? item.language === outputLangFilter : true) &&
      (outputFormatFilter ? item.outputFormat === outputFormatFilter : true)
    );
    const csv = toCsv(
      items.map((item) => ({
        id: item.id,
        output_type: item.outputType,
        output_format: item.outputFormat,
        language: item.language,
        title: item.title,
        related_property: item.relatedProperty ?? "",
        related_party: item.relatedParty ?? "",
        related_contract_hint: item.relatedContractHint,
        source_quote_id: item.sourceQuoteId,
        generated_at: item.generatedAt.toISOString(),
      }))
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="outputs-${stamp}.csv"`,
      },
    });
  }

  if (scope === "import_jobs") {
    const items = await listHubImportJobs();
    const csv = toCsv(
      items.map((item) => ({
        id: item.id,
        source_type: item.sourceType,
        title: item.title,
        target_entity: item.targetEntity,
        status: item.status,
        notes: item.notes ?? "",
        validation_message: item.validationMessage ?? "",
        created_at: item.createdAt.toISOString(),
      }))
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="import-jobs-${stamp}.csv"`,
      },
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "unsupported_scope",
      supported_scopes: ["dashboard", "properties", "parties", "contracts", "service_requests", "outputs", "import_jobs"],
    },
    { status: 400 }
  );
}
