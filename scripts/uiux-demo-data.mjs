import process from "node:process";
import { createHash } from "node:crypto";
import pg from "pg";

const MARKER = "UIUX-DEMO-20260828";
const REQUIRED_ACK = `${MARKER}:NONPROD`;
const REMOTE_WORKSPACE_NAME = "TASK-039 Duplicate Guard Probe 1787271641750";
const REMOTE_TARGET_FINGERPRINT = "aaf14cc84744d48e626ff90cea8e67be03707f73a55b6368e545a0b094ab545a";
const mode = process.argv[2];
const workspaceArg = process.argv.find((value) => value.startsWith("--workspace="));
const workspaceName = workspaceArg?.slice("--workspace=".length).trim();

function buildPoolConfig(connectionString) {
  const target = new URL(connectionString);
  if (!new Set(["postgres:", "postgresql:"]).has(target.protocol)) {
    throw new Error("unsupported database protocol");
  }
  const allowedOptions = new Set(["sslmode", "channel_binding"]);
  const seenOptions = new Set();
  for (const rawKey of target.searchParams.keys()) {
    const key = rawKey.toLowerCase();
    if (!allowedOptions.has(key) || seenOptions.has(key)) {
      throw new Error("unsupported or repeated database connection option");
    }
    seenOptions.add(key);
  }
  const sslmode = target.searchParams.get("sslmode");
  if (sslmode && !new Set(["require", "verify-full"]).has(sslmode)) {
    throw new Error("unsupported database ssl mode");
  }
  const channelBinding = target.searchParams.get("channel_binding");
  if (channelBinding && !new Set(["disable", "prefer"]).has(channelBinding)) {
    throw new Error("unsupported database channel binding mode");
  }
  const port = target.port ? Number(target.port) : 5432;
  const database = decodeURIComponent(target.pathname.slice(1));
  if (!target.hostname || !target.username || !database || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("incomplete database connection target");
  }
  return {
    protocol: target.protocol,
    host: target.hostname,
    port,
    database,
    user: decodeURIComponent(target.username),
    password: decodeURIComponent(target.password),
    ssl: sslmode ? { rejectUnauthorized: true } : undefined,
    enableChannelBinding: channelBinding === "prefer" ? true : channelBinding === "disable" ? false : undefined,
  };
}

function enforceFixedStagingPoolConfig(poolConfig) {
  return { ...poolConfig, ssl: { rejectUnauthorized: true } };
}

function targetFingerprint(config) {
  return createHash("sha256")
    .update(`${config.protocol}\n${config.host}\n${config.database}\n${config.port}`)
    .digest("hex");
}

async function main() {
if (!new Set(["seed", "status", "cleanup"]).has(mode) || !workspaceName) {
  throw new Error(`usage: node scripts/uiux-demo-data.mjs <seed|status|cleanup> --workspace="<exact non-production workspace name>"`);
}
if (process.env.BROKER_DESK_UIUX_DEMO_ACK !== REQUIRED_ACK) {
  throw new Error(`set BROKER_DESK_UIUX_DEMO_ACK=${REQUIRED_ACK} to confirm the fixed non-production dataset`);
}
if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  throw new Error("UI/UX demo data is forbidden in Production");
}
if (workspaceName !== REMOTE_WORKSPACE_NAME) {
  throw new Error(`UI/UX demo data is locked to workspace ${JSON.stringify(REMOTE_WORKSPACE_NAME)}`);
}
const connectionString = process.env.DATABASE_ADMIN_URL?.trim();
if (!connectionString) throw new Error("DATABASE_ADMIN_URL is required; runtime DATABASE_URL is intentionally not accepted");
const validatedConfig = buildPoolConfig(connectionString);
const { protocol: databaseProtocol, ...poolConfig } = validatedConfig;
const localBridge = new Set(["127.0.0.1", "localhost"]).has(poolConfig.host)
  && poolConfig.database === "broker_desk_task039";
const remoteFingerprint = targetFingerprint({ protocol: databaseProtocol, ...poolConfig });
const fixedStagingTarget = remoteFingerprint === REMOTE_TARGET_FINGERPRINT
  && process.env.BROKER_DESK_DEPLOYMENT_ENV === "staging";
const effectivePoolConfig = fixedStagingTarget ? enforceFixedStagingPoolConfig(poolConfig) : poolConfig;
const fixedStagingPreview = fixedStagingTarget
  && effectivePoolConfig.ssl?.rejectUnauthorized === true;
if (!localBridge && !fixedStagingPreview) {
  throw new Error("UI/UX demo data is locked to the local QA bridge or the fixed Staging Preview database fingerprint");
}

const { Pool } = pg;
const pool = new Pool({ ...effectivePoolConfig, max: 1, connectionTimeoutMillis: 10_000 });

function tenantToken(tenantId) {
  return createHash("sha256").update(`broker-desk-uiux-demo:${tenantId}`).digest("hex").slice(0, 16);
}

function clientId(token, index) {
  return `client_uiux_demo_20260828_${token}_${String(index).padStart(2, "0")}`;
}

function propertyId(token, index) {
  return `prop_uiux_demo_20260828_${token}_${String(index).padStart(2, "0")}`;
}

function caseId(token, index) {
  return `case_uiux_demo_20260828_${token}_${String(index).padStart(2, "0")}`;
}

function assertOwnedMarkerWrite(result, entity, id) {
  if (result.rowCount !== 1) {
    throw new Error(`${entity} ${id} conflicts with a record outside the target tenant/marker boundary`);
  }
}

async function resolveTarget(client) {
  const tenants = await client.query("SELECT id, name FROM tenants WHERE name = $1", [workspaceName]);
  if (tenants.rowCount !== 1) throw new Error(`expected exactly one workspace named ${JSON.stringify(workspaceName)}`);
  const tenantId = tenants.rows[0].id;
  const owners = await client.query(
    `SELECT membership.user_id
       FROM tenant_memberships membership
      WHERE membership.tenant_id = $1
        AND membership.status = 'active'
      ORDER BY CASE WHEN membership.role = 'owner' THEN 0 ELSE 1 END, membership.created_at ASC
      LIMIT 1`,
    [tenantId],
  );
  if (owners.rowCount !== 1) throw new Error("target workspace has no active member to own QA records");
  return { tenantId, ownerUserId: owners.rows[0].user_id };
}

async function readStatus(client, tenantId) {
  const [clients, properties, cases] = await Promise.all([
    client.query(
      "SELECT lifecycle_status, count(*)::int AS count FROM clients WHERE tenant_id = $1 AND notes LIKE $2 GROUP BY lifecycle_status",
      [tenantId, `${MARKER}%`],
    ),
    client.query(
      "SELECT lifecycle_status, count(*)::int AS count FROM properties WHERE tenant_id = $1 AND notes LIKE $2 GROUP BY lifecycle_status",
      [tenantId, `${MARKER}%`],
    ),
    client.query(
      "SELECT lifecycle_status, count(*)::int AS count FROM brokerage_cases WHERE tenant_id = $1 AND case_title LIKE $2 GROUP BY lifecycle_status",
      [tenantId, `${MARKER}%`],
    ),
  ]);
  const summarize = (rows) => Object.fromEntries(rows.map((row) => [row.lifecycle_status, row.count]));
  return { marker: MARKER, workspace: workspaceName, parties: summarize(clients.rows), properties: summarize(properties.rows), cases: summarize(cases.rows) };
}

async function readProtectedSnapshot(client, tenantId) {
  const [memberships, templateInstalls, generatedOutputs] = await Promise.all([
    client.query("SELECT count(*)::int AS count FROM tenant_memberships WHERE tenant_id = $1", [tenantId]),
    client.query("SELECT count(*)::int AS count FROM tenant_guarantee_template_installs WHERE tenant_id = $1", [tenantId]),
    client.query("SELECT count(*)::int AS count FROM generated_outputs WHERE tenant_id = $1", [tenantId]),
  ]);
  return {
    memberships: memberships.rows[0].count,
    templateInstalls: templateInstalls.rows[0].count,
    generatedOutputs: generatedOutputs.rows[0].count,
  };
}

function assertProtectedSnapshotUnchanged(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("seed attempted to change protected membership, template, or output-history counts");
  }
}

async function seed(client, tenantId, ownerUserId) {
  const now = Date.now();
  const token = tenantToken(tenantId);
  for (let index = 1; index <= 15; index += 1) {
    const archived = index > 13;
    const lastContactedAt = new Date(now - index * 86_400_000);
    const result = await client.query(
      `INSERT INTO clients (
        id, tenant_id, name, phone, email, budget_type, purpose, loan_pre_approval_status,
        stage, temperature, brokerage_contract_type, aml_check_status, last_contacted_at, notes,
        owner_user_id, created_by_user_id, current_owner_user_id, visibility_scope,
        owner_resolution_status, lifecycle_status, archived_at, archived_by_id
      ) VALUES ($1,$2,$3,$4,$5,'total_price','self_use','not_applied',$6,$7,'none','not_required',$8,$9,$10,$10,$10,'private','resolved',$11,$12,$13)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email,
        last_contacted_at = EXCLUDED.last_contacted_at, notes = EXCLUDED.notes,
        lifecycle_status = EXCLUDED.lifecycle_status, archived_at = EXCLUDED.archived_at,
        archived_by_id = EXCLUDED.archived_by_id, updated_at = NOW()
      WHERE clients.tenant_id = EXCLUDED.tenant_id
        AND clients.notes LIKE $14
      RETURNING id`,
      [
        clientId(token, index), tenantId, `${MARKER} 人物 ${String(index).padStart(2, "0")} 長い同一接頭辞テスト`,
        `090-8000-${String(index).padStart(4, "0")}`, `${MARKER.toLowerCase()}-${index}@example.invalid`,
        index % 3 === 0 ? "contacted" : "lead", index % 2 === 0 ? "medium" : "low",
        lastContactedAt, `${MARKER} party ${index}`, ownerUserId,
        archived ? "archived" : "active", archived ? new Date(now - index * 3_600_000) : null,
        archived ? ownerUserId : null, `${MARKER}%`,
      ],
    );
    assertOwnedMarkerWrite(result, "party", clientId(token, index));
  }

  for (let index = 1; index <= 15; index += 1) {
    const archived = index > 13;
    const result = await client.query(
      `INSERT INTO properties (
        id, tenant_id, name, area, address, listing_price, size_sqm, management_fee,
        repair_fee, notes, created_by_user_id, current_owner_user_id, visibility_scope,
        owner_resolution_status, lifecycle_status, archived_at, archived_by_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,'private','resolved',$12,$13,$14)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, area = EXCLUDED.area, address = EXCLUDED.address,
        listing_price = EXCLUDED.listing_price, notes = EXCLUDED.notes,
        lifecycle_status = EXCLUDED.lifecycle_status, archived_at = EXCLUDED.archived_at,
        archived_by_id = EXCLUDED.archived_by_id
      WHERE properties.tenant_id = EXCLUDED.tenant_id
        AND properties.notes LIKE $15
      RETURNING id`,
      [
        propertyId(token, index), tenantId, `${MARKER} 物件 ${String(index).padStart(2, "0")} 長い同一接頭辞テスト`,
        "福岡市", `福岡市テスト区 ${index}-1-${index}`, 80_000 + index * 2_500, 30 + index,
        3_000 + index * 100, 1_000 + index * 50, `${MARKER} property ${index}`, ownerUserId,
        archived ? "archived" : "active", archived ? new Date(now - index * 3_600_000) : null,
        archived ? ownerUserId : null, `${MARKER}%`,
      ],
    );
    assertOwnedMarkerWrite(result, "property", propertyId(token, index));
  }

  const caseInputs = [
    { index: 1, lifecycle: "active", party: 1, property: 1, roles: ["主要申请人"] },
    { index: 2, lifecycle: "active", party: 2, property: 2, roles: ["主要申请人", "承租人"] },
    { index: 3, lifecycle: "archived", party: 14, property: 14, roles: ["主要申请人"] },
  ];
  for (const input of caseInputs) {
    const confirmedData = {
      __caseAssociationVersion: 1,
      __associatedParties: [{ partyId: clientId(token, input.party), roles: input.roles }],
      __primaryPartyId: clientId(token, input.party),
      __primaryPropertyId: propertyId(token, input.property),
      "applicant.name": `${MARKER} 人物 ${String(input.party).padStart(2, "0")} 長い同一接頭辞テスト`,
      "property.name": `${MARKER} 物件 ${String(input.property).padStart(2, "0")} 長い同一接頭辞テスト`,
    };
    const archived = input.lifecycle === "archived";
    const result = await client.query(
      `INSERT INTO brokerage_cases (
        id, tenant_id, user_id, case_type, case_title, primary_property_id, status,
        confirmed_data_json, source_import_job_ids, created_by_user_id,
        current_owner_user_id, visibility_scope, owner_resolution_status,
        lifecycle_status, archived_at, archived_by_id
      ) VALUES ($1,$2,$3,'unit_sale',$4,$5,'draft',$6::jsonb,ARRAY[]::text[],$3,$3,'private','resolved',$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        case_title = EXCLUDED.case_title, primary_property_id = EXCLUDED.primary_property_id,
        confirmed_data_json = EXCLUDED.confirmed_data_json, lifecycle_status = EXCLUDED.lifecycle_status,
        archived_at = EXCLUDED.archived_at, archived_by_id = EXCLUDED.archived_by_id,
        updated_at = NOW()
      WHERE brokerage_cases.tenant_id = EXCLUDED.tenant_id
        AND brokerage_cases.case_title LIKE $10
      RETURNING id`,
      [caseId(token, input.index), tenantId, ownerUserId, `${MARKER} 案件 ${String(input.index).padStart(2, "0")}`,
        propertyId(token, input.property), JSON.stringify(confirmedData), input.lifecycle,
        archived ? new Date(now - input.index * 3_600_000) : null, archived ? ownerUserId : null, `${MARKER}%`],
    );
    assertOwnedMarkerWrite(result, "case", caseId(token, input.index));
  }
}

async function cleanup(client, tenantId) {
  await client.query("DELETE FROM brokerage_cases WHERE tenant_id = $1 AND id LIKE 'case_uiux_demo_20260828_%' AND case_title LIKE $2", [tenantId, `${MARKER}%`]);
  await client.query("DELETE FROM clients WHERE tenant_id = $1 AND id LIKE 'client_uiux_demo_20260828_%' AND notes LIKE $2", [tenantId, `${MARKER}%`]);
  await client.query("DELETE FROM properties WHERE tenant_id = $1 AND id LIKE 'prop_uiux_demo_20260828_%' AND notes LIKE $2", [tenantId, `${MARKER}%`]);
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const { tenantId, ownerUserId } = await resolveTarget(client);
  const protectedBefore = await readProtectedSnapshot(client, tenantId);
  const markerBefore = await readStatus(client, tenantId);
  if (mode === "seed") await seed(client, tenantId, ownerUserId);
  if (mode === "cleanup") await cleanup(client, tenantId);
  const protectedAfter = await readProtectedSnapshot(client, tenantId);
  assertProtectedSnapshotUnchanged(protectedBefore, protectedAfter);
  const markerAfter = await readStatus(client, tenantId);
  await client.query(mode === "status" ? "ROLLBACK" : "COMMIT");
  process.stdout.write(`${JSON.stringify({ ok: true, mode, protected: protectedAfter, before: markerBefore, after: markerAfter })}\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
}

function reportSafeFailure() {
  process.stderr.write("UIUX_DEMO_DATA_FAILED\n");
  process.exitCode = 1;
}

await main().catch(reportSafeFailure);
