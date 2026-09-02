#!/usr/bin/env node

import { createHash } from "node:crypto";
import { Pool } from "pg";

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));

function option(name, envName) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) return args[index + 1];
  return envName ? process.env[envName] : undefined;
}

function fail(message) {
  console.error(`Staging acceptance seed refused: ${message}`);
  process.exitCode = 1;
}

const mode = flags.has("--reset") ? "reset" : "seed";
const dryRun = flags.has("--dry-run");
const environment = option("--environment", "BROKER_DESK_STAGING_SEED_ENV");
const tenantId = option("--tenant-id", "BROKER_DESK_STAGING_SEED_TENANT_ID");
const actorUserId = option("--actor-user-id", "BROKER_DESK_STAGING_SEED_ACTOR_USER_ID");
const marker = option("--marker", "BROKER_DESK_STAGING_SEED_MARKER");
const databaseName = option("--database-name", "BROKER_DESK_STAGING_SEED_DATABASE_NAME");
const templateId = option("--template-id", "BROKER_DESK_STAGING_SEED_TEMPLATE_ID");
const databaseUrl = process.env.BROKER_DESK_STAGING_SEED_DATABASE_URL;

if (environment !== "staging") {
  fail("--environment must be staging; production, preview, and unknown environments are rejected for database writes");
} else if (!tenantId || !actorUserId || !marker || !databaseName) {
  fail("tenant, actor, marker, and database name are required");
} else if (!/^TASK-047-ACCEPTANCE-[A-Z0-9-]{1,64}$/i.test(marker)) {
  fail("marker must match TASK-047-ACCEPTANCE-<short synthetic marker>");
} else if (!flags.has("--confirm-nonprod")) {
  fail("writes require --confirm-nonprod after the non-production target has been checked");
} else if (mode === "reset" && !flags.has("--confirm-reset")) {
  fail("reset requires --confirm-reset");
} else if (!dryRun && !databaseUrl) {
  fail("writes require BROKER_DESK_STAGING_SEED_DATABASE_URL; no implicit database URL is accepted");
}

if (process.exitCode) process.exit(process.exitCode);

const digest = createHash("sha256").update(`${tenantId}:${marker}`).digest("hex").slice(0, 12);
const prefix = `task047_acceptance_${digest}`;
const id = (kind) => `${prefix}_${kind}`;
const date = {
  overdue: "2026-08-31T09:00:00.000Z",
  today: "2026-09-02T09:00:00.000Z",
  future: "2026-09-05T09:00:00.000Z",
  followUp: "2026-09-04T09:00:00.000Z",
};

const fixture = {
  clients: [
    {
      id: id("client_complete"),
      name: `${marker} 完整案例客户`,
      phone: "09000000001",
      purpose: "purchase",
      stage: "negotiating",
      temperature: "hot",
      preferredArea: "東京都千代田区",
      notes: `${marker} / complete scenario`,
    },
    {
      id: id("client_progress"),
      name: `${marker} 進行中案例客户`,
      phone: "09000000002",
      purpose: "purchase",
      stage: "contacted",
      temperature: "warm",
      preferredArea: "東京都江東区",
      notes: `${marker} / in-progress scenario`,
    },
    {
      id: id("client_incomplete"),
      name: `${marker} 资料不完整客户`,
      phone: "09000000003",
      purpose: "purchase",
      stage: "lead",
      temperature: "cold",
      preferredArea: "",
      notes: `${marker} / incomplete scenario / missing required information`,
    },
  ],
  properties: [
    { id: id("property_complete"), name: `${marker} 完整案例物件`, area: "千代田区", address: "東京都千代田区合成町1-1", listingPrice: 88000000, notes: `${marker} / complete scenario` },
    { id: id("property_progress"), name: `${marker} 進行中案例物件`, area: "江東区", address: "東京都江東区合成町2-2", listingPrice: 62000000, notes: `${marker} / in-progress scenario` },
    { id: id("property_incomplete"), name: `${marker} 资料不完整物件`, area: "", address: "", listingPrice: 45000000, notes: `${marker} / incomplete scenario` },
  ],
  cases: [
    { id: id("case_complete"), title: `${marker} 完整案例`, clientId: id("client_complete"), propertyId: id("property_complete"), sourceJobs: [], status: "reviewed", missing: [] },
    { id: id("case_progress"), title: `${marker} 進行中案例`, clientId: id("client_progress"), propertyId: id("property_progress"), sourceJobs: [], status: "reviewed", missing: ["follow_up_material"] },
    { id: id("case_incomplete"), title: `${marker} 资料不完整案例`, clientId: id("client_incomplete"), propertyId: id("property_incomplete"), sourceJobs: [id("import_incomplete")], status: "draft", missing: ["applicant.name", "property.address"] },
  ],
};

const plan = {
  mode,
  environment,
  dryRun,
  marker,
  tenantId,
  actor: actorUserId,
  databaseName,
  templateIncluded: Boolean(templateId),
  writes: ["clients", "properties", "brokerage_cases", "tasks", "follow_ups", "import_jobs", "attachments", "private_attachment_blobs", "attachment_links"],
  writesUsers: false,
  writesTenants: false,
  writesMemberships: false,
  writesCreationRequests: false,
  sendsEmail: false,
  scenarios: fixture.cases.map((item) => item.title),
};

if (dryRun) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: `brokerdesk-staging-seed-${digest}` });
const client = await pool.connect();

async function one(sql, values = []) {
  return client.query(sql, values);
}

async function assertTarget() {
  const markerResult = await one(`
    SELECT current_database() AS database_name,
           current_setting('app.broker_desk_nonprod_marker', true) AS nonprod_marker,
           current_setting('app.broker_desk_deployment_env', true) AS deployment_env
  `);
  const target = markerResult.rows[0];
  if (target.database_name !== databaseName) throw new Error("connected database does not match the explicitly supplied target name");
  if (target.nonprod_marker !== "broker-desk-staging-nonprod") throw new Error("database lacks the broker-desk-staging-nonprod safety marker");
  if (target.deployment_env !== "staging") throw new Error("database is not marked as staging");

  const tenantResult = await one(
    `SELECT id, name, status FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId],
  );
  const tenant = tenantResult.rows[0];
  if (!tenant || tenant.name !== "INTERNAL ALPHA / TEST" || tenant.status !== "active") {
    throw new Error("target tenant must be the active INTERNAL ALPHA / TEST synthetic tenant");
  }

  const actorResult = await one(
    `SELECT u.id
       FROM users u
      WHERE u.id = $1
        AND EXISTS (
          SELECT 1 FROM tenant_memberships m
           WHERE m.user_id = u.id
             AND m.role = 'platform_owner'
             AND m.status = 'active'
        )
      LIMIT 1`,
    [actorUserId],
  );
  if (!actorResult.rowCount) throw new Error("seed actor must be an existing active platform owner; the tool never creates or changes identities");

  const requiredTables = ["clients", "properties", "brokerage_cases", "tasks", "follow_ups", "import_jobs", "attachments", "private_attachment_blobs"];
  const schemaResult = await one(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const found = new Set(schemaResult.rows.map((row) => row.table_name));
  if (requiredTables.some((table) => !found.has(table))) throw new Error("required business schema is incomplete; no fixture writes were attempted");
}

async function assertNoUnmarkedRows() {
  const checks = [
    ["clients", "notes"],
    ["properties", "notes"],
    ["tasks", "title"],
    ["follow_ups", "content"],
    ["import_jobs", "notes"],
    ["attachments", "file_name"],
  ];
  for (const [table, column] of checks) {
    const result = await one(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE tenant_id = $1 AND COALESCE(${column}, '') NOT LIKE $2`,
      [tenantId, `${marker}%`],
    );
    if (Number(result.rows[0].count) > 0) throw new Error(`target tenant contains unmarked ${table} rows; seed stopped before writes`);
  }
  const caseResult = await one(
    `SELECT COUNT(*)::int AS count
       FROM brokerage_cases
      WHERE tenant_id = $1
        AND COALESCE(confirmed_data_json->>'fixtureMarker', '') <> $2`,
    [tenantId, marker],
  );
  if (Number(caseResult.rows[0].count) > 0) throw new Error("target tenant contains unmarked brokerage case rows; seed stopped before writes");
}

async function seedRows() {
  const clientRows = fixture.clients;
  for (const item of clientRows) {
    await one(
      `INSERT INTO clients (
        id, tenant_id, name, phone, preferred_area, purpose, stage, temperature, notes,
        owner_user_id, created_by_user_id, current_owner_user_id, visibility_scope, owner_resolution_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10,'company_read','resolved')
       ON CONFLICT (id) DO NOTHING`,
      [item.id, tenantId, item.name, item.phone, item.preferredArea, item.purpose, item.stage, item.temperature, item.notes, actorUserId],
    );
  }

  for (const item of fixture.properties) {
    await one(
      `INSERT INTO properties (
        id, tenant_id, name, area, address, listing_price, notes,
        created_by_user_id, current_owner_user_id, visibility_scope, owner_resolution_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,'company_read','resolved')
       ON CONFLICT (id) DO NOTHING`,
      [item.id, tenantId, item.name, item.area, item.address, item.listingPrice, item.notes, actorUserId],
    );
  }

  await one(
    `INSERT INTO import_jobs (
      id, tenant_id, user_id, source_type, title, target_entity, status, notes,
      mapping_json, validation_message, idempotency_key
    ) VALUES ($1,$2,$3,'pdf',$4,'properties','failed',$5,'{}'::jsonb,'住所と申込者情報が不足しています',$6)
     ON CONFLICT (id) DO NOTHING`,
    [id("import_incomplete"), tenantId, actorUserId, `${marker} 资料读取待恢复`, `${marker} / recoverable incomplete import`, `${prefix}_import`],
  );

  for (const item of fixture.cases) {
    await one(
      `INSERT INTO brokerage_cases (
        id, tenant_id, user_id, case_type, case_title, primary_property_id, status,
        confirmed_data_json, source_import_job_ids, created_by_user_id,
        current_owner_user_id, visibility_scope, owner_resolution_status
      ) VALUES ($1,$2,$3,'unit_sale',$4,$5,$6,$7::jsonb,$8,$3,$3,'company_read','resolved')
       ON CONFLICT (id) DO NOTHING`,
      [
        item.id,
        tenantId,
        actorUserId,
        item.title,
        item.propertyId,
        item.status,
        JSON.stringify({ fixtureMarker: marker, scenario: item.id, missing: item.missing }),
        item.sourceJobs,
      ],
    );
  }

  const tasks = [
    [id("task_today"), id("client_complete"), `${marker} 今日确认任务`, date.today],
    [id("task_future"), id("client_progress"), `${marker} 七日内跟进任务`, date.future],
  ];
  for (const [taskId, clientId, title, dueAt] of tasks) {
    await one(
      `INSERT INTO tasks (id, tenant_id, client_id, title, due_at, status, created_by_id)
       VALUES ($1,$2,$3,$4,$5,'pending',$6)
       ON CONFLICT (id) DO NOTHING`,
      [taskId, tenantId, clientId, title, dueAt, actorUserId],
    );
  }

  const followUps = [
    [id("follow_waiting"), id("client_progress"), "note", `${marker} 等待客户补充资料`, `${marker} 等待跟进`, date.followUp],
    [id("follow_email"), id("client_complete"), "email", `${marker} 电子邮件跟进信号（不外发）`, `${marker} 仅作测试信号`, date.followUp],
  ];
  for (const [followId, clientId, type, content, nextAction, nextAt] of followUps) {
    await one(
      `INSERT INTO follow_ups (id, tenant_id, client_id, type, content, next_action, next_follow_up_at, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [followId, tenantId, clientId, type, content, nextAction, nextAt, actorUserId],
    );
  }

  const attachmentId = id("attachment_complete");
  const content = Buffer.from(`${marker} synthetic attachment; no real customer data.`, "utf8");
  await one(
    `INSERT INTO attachments (id, tenant_id, user_id, target_type, target_id, file_name, file_type, file_size_bytes, storage_path)
     VALUES ($1,$2,$3,'case',$4,$5,'text/plain',$6,$7)
     ON CONFLICT (id) DO NOTHING`,
    [attachmentId, tenantId, actorUserId, id("case_complete"), `${marker}-case-note.txt`, content.length, `postgres-private://${tenantId}/${attachmentId}`],
  );
  await one(
    `INSERT INTO private_attachment_blobs (attachment_id, tenant_id, content, sha256)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (attachment_id) DO NOTHING`,
    [attachmentId, tenantId, content, createHash("sha256").update(content).digest("hex")],
  );

  const links = await one(
    `SELECT to_regclass('public.attachment_links') AS attachment_links`,
  );
  if (links.rows[0].attachment_links) {
    await one(
      `INSERT INTO attachment_links (id, tenant_id, attachment_id, target_type, target_id, category, created_by_user_id)
       VALUES ($1,$2,$3,'case',$4,'application',$5)
       ON CONFLICT (tenant_id, attachment_id, target_type, target_id) DO NOTHING`,
      [id("attachment_link"), tenantId, attachmentId, id("case_complete"), actorUserId],
    );
  }

  if (templateId) {
    const install = await one(
      `SELECT 1 FROM tenant_guarantee_template_installs
        WHERE tenant_id = $1 AND template_id = $2 AND status = 'active' LIMIT 1`,
      [tenantId, templateId],
    );
    if (!install.rowCount) throw new Error("requested output template is not already installed for the target tenant");
    await one(
      `INSERT INTO guarantee_application_drafts (
        id, tenant_id, user_id, case_id, template_id, company_code, status,
        field_values_json, field_statuses_json
      ) VALUES ($1,$2,$3,$4,$5,'friends_guarantee','draft',$6::jsonb,$7::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [id("guarantee_draft"), tenantId, actorUserId, id("case_complete"), templateId, JSON.stringify({ fixtureMarker: marker, "applicant.name": `${marker} 完整案例客户` }), JSON.stringify({ fixtureMarker: "confirmed" })],
    );
  }
}

async function resetRows() {
  const caseIds = fixture.cases.map((item) => item.id);
  const clientIds = fixture.clients.map((item) => item.id);
  const propertyIds = fixture.properties.map((item) => item.id);
  await one(`DELETE FROM guarantee_application_drafts WHERE tenant_id = $1 AND case_id = ANY($2::text[])`, [tenantId, caseIds]);
  await one(`DELETE FROM attachment_links WHERE tenant_id = $1 AND attachment_id IN (SELECT id FROM attachments WHERE tenant_id = $1 AND file_name LIKE $2)`, [tenantId, `${marker}%`]);
  await one(`DELETE FROM private_attachment_blobs WHERE tenant_id = $1 AND attachment_id IN (SELECT id FROM attachments WHERE tenant_id = $1 AND file_name LIKE $2)`, [tenantId, `${marker}%`]);
  await one(`DELETE FROM attachments WHERE tenant_id = $1 AND file_name LIKE $2`, [tenantId, `${marker}%`]);
  await one(`DELETE FROM follow_ups WHERE tenant_id = $1 AND content LIKE $2`, [tenantId, `${marker}%`]);
  await one(`DELETE FROM tasks WHERE tenant_id = $1 AND title LIKE $2`, [tenantId, `${marker}%`]);
  await one(`DELETE FROM brokerage_cases WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, caseIds]);
  await one(`DELETE FROM import_jobs WHERE tenant_id = $1 AND notes LIKE $2`, [tenantId, `${marker}%`]);
  await one(`DELETE FROM clients WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, clientIds]);
  await one(`DELETE FROM properties WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, propertyIds]);
}

try {
  await assertTarget();
  if (mode === "seed") {
    await assertNoUnmarkedRows();
  }
  await one("BEGIN");
  if (mode === "reset") await resetRows();
  else await seedRows();
  await one("COMMIT");
  console.log(JSON.stringify({ ...plan, status: mode === "reset" ? "reset" : "seeded", counts: { scenarios: 3, clients: 3, properties: 3, cases: 3, tasks: 2, followUps: 2, attachments: 1, outputDrafts: templateId ? 1 : 0 } }, null, 2));
} catch (error) {
  try { await one("ROLLBACK"); } catch {}
  console.error(`Staging acceptance seed stopped: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
