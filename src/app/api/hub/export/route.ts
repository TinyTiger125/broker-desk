import { NextRequest, NextResponse } from "next/server";
import { getDefaultUser, listAuditLogs } from "@/lib/data";
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

function parseDateFilter(raw: string | null, endOfDay = false): Date | undefined {
  if (!raw) return undefined;
  const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
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
    const outputTemplateFilter = request.nextUrl.searchParams.get("templateVersion");
    const items = (await listHubGeneratedOutputs(locale)).filter((item) =>
      (outputTypeFilter ? item.outputType === outputTypeFilter : true) &&
      (outputLangFilter ? item.language === outputLangFilter : true) &&
      (outputFormatFilter ? item.outputFormat === outputFormatFilter : true) &&
      (outputTemplateFilter
        ? outputTemplateFilter === "unbound"
          ? !item.templateVersionId
          : item.templateVersionId === outputTemplateFilter
        : true)
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
        document_number: item.documentNumber,
        source_quote_id: item.sourceQuoteId,
        actor_id: item.actorId,
        template_version_id: item.templateVersionId ?? "",
        template_version_label: item.templateVersionLabel ?? "",
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

  if (scope === "outputs_hitrate") {
    const outputTypeFilter = request.nextUrl.searchParams.get("type");
    const outputLangFilter = request.nextUrl.searchParams.get("lang");
    const outputFormatFilter = request.nextUrl.searchParams.get("format");
    const outputTemplateFilter = request.nextUrl.searchParams.get("templateVersion");
    const items = (await listHubGeneratedOutputs(locale)).filter((item) =>
      (outputTypeFilter ? item.outputType === outputTypeFilter : true) &&
      (outputLangFilter ? item.language === outputLangFilter : true) &&
      (outputFormatFilter ? item.outputFormat === outputFormatFilter : true) &&
      (outputTemplateFilter
        ? outputTemplateFilter === "unbound"
          ? !item.templateVersionId
          : item.templateVersionId === outputTemplateFilter
        : true)
    );
    const boundCount = items.filter((item) => Boolean(item.templateVersionId)).length;
    const unboundCount = Math.max(0, items.length - boundCount);
    const hitRate = items.length > 0 ? Math.round((boundCount / items.length) * 100) : 0;
    const versionStats = items
      .filter((item) => Boolean(item.templateVersionId))
      .reduce<Map<string, { id: string; label: string; count: number }>>((acc, item) => {
        const key = item.templateVersionId as string;
        const current = acc.get(key) ?? {
          id: key,
          label: item.templateVersionLabel ?? key,
          count: 0,
        };
        current.count += 1;
        acc.set(key, current);
        return acc;
      }, new Map());
    const topVersions = [...versionStats.values()].sort((a, b) => b.count - a.count);
    const csvRows: Array<Record<string, string | number>> = [
      {
        row_type: "summary",
        total_outputs: items.length,
        bound_outputs: boundCount,
        unbound_outputs: unboundCount,
        template_hit_rate_percent: hitRate,
        output_type_filter: outputTypeFilter ?? "all",
        language_filter: outputLangFilter ?? "all",
        format_filter: outputFormatFilter ?? "all",
        template_filter: outputTemplateFilter ?? "all",
      },
      ...topVersions.map((version, index) => ({
        row_type: "template_version",
        rank: index + 1,
        template_version_id: version.id,
        template_version_label: version.label,
        hit_count: version.count,
        hit_share_percent: items.length > 0 ? Math.round((version.count / items.length) * 100) : 0,
      })),
    ];
    const csv = toCsv(csvRows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="outputs-hitrate-${stamp}.csv"`,
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

  if (scope === "audit_logs") {
    const presetRaw = request.nextUrl.searchParams.get("preset");
    const preset = presetRaw === "last_7_days" || presetRaw === "key_writes" ? presetRaw : "all";
    const actor = request.nextUrl.searchParams.get("actor");
    const action = request.nextUrl.searchParams.get("action");
    const target = request.nextUrl.searchParams.get("target");
    const query = request.nextUrl.searchParams.get("q");
    const fromInput = parseDateFilter(request.nextUrl.searchParams.get("from"));
    const toInput = parseDateFilter(request.nextUrl.searchParams.get("to"), true);
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 6);
    defaultFrom.setHours(0, 0, 0, 0);
    const defaultTo = new Date(now);
    defaultTo.setHours(23, 59, 59, 999);
    const from = preset === "last_7_days" ? fromInput ?? defaultFrom : fromInput;
    const to = preset === "last_7_days" ? toInput ?? defaultTo : toInput;
    const auditTargetTypes = [
      "client",
      "task",
      "quote",
      "compliance",
      "output",
      "import_job",
      "property",
      "party",
      "contract",
      "service_request",
    ] as const;
    type AuditTargetType = (typeof auditTargetTypes)[number];
    const targetType: AuditTargetType | "all" =
      target && target !== "all" && auditTargetTypes.some((item) => item === target)
        ? (target as AuditTargetType)
        : "all";
    const keyWriteActions = new Set([
      "import_job_created",
      "import_mapping_updated",
      "import_validation_resolved",
      "import_job_retried",
      "attachment_registered",
      "property_created",
      "party_created",
      "service_request_created",
      "contract_batch_status_updated",
      "contract_batch_status_undone",
      "output_generated",
      "output_template_updated",
      "output_template_version_applied",
    ]);

    const user = await getDefaultUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }
    const queriedLogs = await listAuditLogs(user.id, {
      actorId: actor && actor !== "all" ? actor : undefined,
      action: action && action !== "all" ? action : undefined,
      targetType,
      query: query?.trim() ? query : undefined,
      from,
      to,
      limit: 1000,
    });
    const logs = preset === "key_writes" ? queriedLogs.filter((item) => keyWriteActions.has(item.action)) : queriedLogs;
    const csv = toCsv(
      logs.map((item) => ({
        id: item.id,
        created_at: item.createdAt.toISOString(),
        actor_id: item.actorId,
        action: item.action,
        target_type: item.targetType,
        target_id: item.targetId ?? "",
        message: item.message,
        context_json: item.context ? JSON.stringify(item.context) : "",
      }))
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="audit-logs-${stamp}.csv"`,
      },
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "unsupported_scope",
      supported_scopes: ["dashboard", "properties", "parties", "contracts", "service_requests", "outputs", "outputs_hitrate", "import_jobs", "audit_logs"],
    },
    { status: 400 }
  );
}
