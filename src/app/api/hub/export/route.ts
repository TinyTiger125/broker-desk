import { NextRequest, NextResponse } from "next/server";
import { listAuditLogs, listBrokerageCasesForContext } from "@/lib/data";
import { listHubParties, listHubProperties } from "@/lib/hub";
import type { Locale } from "@/lib/locale";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";

function toCsv(rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number | null | undefined) => {
    const rawText = value == null ? "" : String(value);
    const text = /^[=+\-@]/.test(rawText.trimStart()) ? `'${rawText}` : rawText;
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
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
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope") ?? "properties";
  const supportedScopes = ["cases", "properties", "parties", "audit_logs"] as const;

  let session;
  try {
    session = await requireTenantSession({ permission: scope === "audit_logs" ? "audit.view" : "record.read" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "hub_export_unavailable" }, { status: 500 });
  }
  if (!supportedScopes.includes(scope as (typeof supportedScopes)[number])) {
    return NextResponse.json(
      { ok: false, error: "unsupported_scope", supported_scopes: supportedScopes },
      { status: 400 },
    );
  }

  const context = createRequestContext(session);
  const locale = normalizeLocale(request.nextUrl.searchParams.get("locale"));
  const ids = request.nextUrl.searchParams.getAll("ids").flatMap((value) =>
    value.split(",").map((item) => item.trim()).filter(Boolean),
  );
  const idSet = ids.length > 0 ? new Set(ids) : null;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

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
    const auditTargetTypes = ["client", "task", "quote", "compliance", "output", "import_job", "property", "party", "contract", "service_request"] as const;
    type AuditTargetType = (typeof auditTargetTypes)[number];
    const targetType: AuditTargetType | "all" = target && target !== "all" && auditTargetTypes.some((item) => item === target)
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
    const queriedLogs = await listAuditLogs(session.user.id, {
      tenantId: session.tenant.id,
      actorId: actor && actor !== "all" ? actor : undefined,
      action: action && action !== "all" ? action : undefined,
      targetType,
      query: query?.trim() ? query : undefined,
      from,
      to,
      limit: 1000,
    });
    const logs = preset === "key_writes" ? queriedLogs.filter((item) => keyWriteActions.has(item.action)) : queriedLogs;
    return csvResponse(
      toCsv(logs.map((item) => ({
        id: item.id,
        created_at: item.createdAt.toISOString(),
        actor_id: item.actorId,
        action: item.action,
        target_type: item.targetType,
        target_id: item.targetId ?? "",
        message: item.message,
        context_json: item.context ? JSON.stringify(item.context) : "",
      }))),
      `audit-logs-${stamp}.csv`,
    );
  }

  if (scope === "cases") {
    const items = (await listBrokerageCasesForContext({ context, lifecycleStatus: "all" }))
      .filter((item) => item.brokerageCase && item.resolution.canWrite)
      .map((item) => item.brokerageCase!)
      .filter((item) => (idSet ? idSet.has(item.id) : true));
    return csvResponse(
      toCsv(items.map((item) => ({
        id: item.id,
        case_title: item.caseTitle,
        status: item.status,
        lifecycle_status: item.lifecycleStatus ?? "active",
        primary_property_id: item.primaryPropertyId ?? "",
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString(),
      }))),
      `cases-${stamp}.csv`,
    );
  }

  if (scope === "properties") {
    const items = (await listHubProperties(locale, { requestContext: context, lifecycleStatus: "all" }))
      .filter((item) => item.canWrite)
      .filter((item) => (idSet ? idSet.has(item.id) : true));
    return csvResponse(
      toCsv(items.map((item) => ({
        id: item.id,
        name: item.name,
        area: item.area,
        listing_price: item.listingPrice,
        management_fee: item.managementFee,
        repair_fee: item.repairFee,
        status: item.status,
      }))),
      `properties-${stamp}.csv`,
    );
  }

  const items = (await listHubParties(locale, { requestContext: context, lifecycleStatus: "all" }))
    .filter((item) => item.canWrite)
    .filter((item) => (idSet ? idSet.has(item.id) : true));
  return csvResponse(
    toCsv(items.map((item) => ({
      id: item.id,
      name: item.name,
      phone: item.phone,
      email: item.email ?? "",
      party_type: item.partyType,
      roles: item.roles.join(" / "),
      status: item.status,
    }))),
    `parties-${stamp}.csv`,
  );
}
