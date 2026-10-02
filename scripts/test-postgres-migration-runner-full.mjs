import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { runPostgresMigrations } from "./run-postgres-migrations.mjs";

const { Client } = pg;
const postgresBin = "/opt/homebrew/opt/postgresql@16/bin";
const root = mkdtempSync(join(tmpdir(), "brokerdesk-full-runner-"));
const data = join(root, "data");
const port = 55447;
const run = (name, args) => execFileSync(join(postgresBin, name), args, {
  encoding: "utf8",
  env: { PATH: `${postgresBin}:/usr/bin:/bin`, LANG: "C", HOME: process.env.HOME },
});
let running = false;
try {
  run("initdb", ["-D", data, "-U", "qa_initializer", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=trust"]);
  run("pg_ctl", ["-D", data, "-o", `-F -p ${port} -h 127.0.0.1`, "-l", join(root, "postgres.log"), "-w", "start"]);
  running = true;
  const admin = new Client({ connectionString: `postgresql://qa_initializer@127.0.0.1:${port}/postgres` });
  await admin.connect();
  // Supabase-hosted migrations can transfer selected function ownership to the
  // conventional postgres role. The isolated initdb uses qa_initializer as its
  // bootstrap login, so provide that role only inside this temporary cluster.
  await admin.query("CREATE ROLE postgres NOLOGIN SUPERUSER CREATEDB CREATEROLE BYPASSRLS");
  await admin.query("CREATE DATABASE broker_desk_runner_test OWNER qa_initializer");
  await admin.end();
  const databaseUrl = `postgresql://qa_initializer@127.0.0.1:${port}/broker_desk_runner_test`;
  const result = await runPostgresMigrations({ databaseUrl, prepareEmptyDatabase: true, log: () => {} });
  const migrationNames = readdirSync("db/migrations")
    .filter((name) => /^\d{8}_\d{3}_.+\.sql$/u.test(name))
    .sort();
  assert.ok(migrationNames.length > 0, "current migration directory must not be empty");
  assert.deepEqual(result, { appliedCount: migrationNames.length, skippedCount: 0, stoppedAfter: null });
  const verify = new Client({ connectionString: databaseUrl });
  await verify.connect();
  const ledgerRows = (await verify.query("SELECT name, checksum FROM broker_desk_schema_migrations ORDER BY name")).rows;
  const expectedLedgerRows = migrationNames.map((name) => ({
    name,
    checksum: createHash("sha256").update(readFileSync(`db/migrations/${name}`)).digest("hex"),
  }));
  assert.deepEqual(ledgerRows, expectedLedgerRows, "every current migration must be applied once with its current checksum");
  const ledgerCount = ledgerRows.length;
  const owners = (await verify.query("SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) ORDER BY c.relname", [["import_jobs", "attachments", "private_attachment_blobs", "attachment_links", "audit_logs"]])).rows;
  assert.equal(ledgerCount, migrationNames.length);
  assert.equal(owners.length, 5);
  assert.ok(owners.every((row) => row.owner === "brokerdesk_admin" && row.force_rls === true));

  const fixtureIds = {
    tenant: "pg_claim_fixture_tenant",
    actor: "pg_claim_fixture_actor",
    invited: "pg_claim_fixture_invited",
    secondInvited: "pg_claim_fixture_second_invited",
    actorMembership: "pg_claim_fixture_actor_membership",
    membership: "pg_claim_fixture_membership",
    secondMembership: "pg_claim_fixture_second_membership",
  };
  await verify.query(
    `INSERT INTO users (id, name, email, password_hash, external_auth_subject) VALUES
      ($1, 'PG claim actor', 'pg-claim-actor@example.invalid', 'synthetic', 'pg-claim-actor-subject'),
      ($2, 'PG claim invited', 'pg-claim-invited@example.invalid', 'synthetic', NULL),
      ($3, 'PG claim second invited', 'pg-claim-second@example.invalid', 'synthetic', NULL)`,
    [fixtureIds.actor, fixtureIds.invited, fixtureIds.secondInvited],
  );
  await verify.query(
    `INSERT INTO tenants (id, name, slug, account_type, status, purchased_seat_count)
     VALUES ($1, 'PG claim fixture', 'pg-claim-fixture', 'company', 'active', 4)`,
    [fixtureIds.tenant],
  );
  await verify.query(
    `INSERT INTO tenant_memberships
      (id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status,
       invitation_delivery_state, invited_email, invited_by_user_id)
     VALUES
      ($1, $2, $3, 'tenant_owner', 'company_owner', 'active', 'manual', 'accepted', 'ready', NULL, $3),
      ($4, $2, $5, 'broker', 'ordinary_member', 'invited', 'none', 'pending', 'ready', 'pg-claim-invited@example.invalid', $3),
      ($6, $2, $7, 'broker', 'ordinary_member', 'invited', 'none', 'pending', 'ready', 'pg-claim-second@example.invalid', $3)`,
    [fixtureIds.actorMembership, fixtureIds.tenant, fixtureIds.actor, fixtureIds.membership, fixtureIds.invited, fixtureIds.secondMembership, fixtureIds.secondInvited],
  );

  const connectFixtureClient = async () => {
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    await client.connect();
    await client.query("SET ROLE brokerdesk_runtime");
    await client.query("SELECT set_config('app.external_auth_subject', $1, false)", ["pg-claim-actor-subject"]);
    return client;
  };
  const prepare = (client, membershipId) => client.query(
    `SELECT * FROM brokerdesk_private.prepare_tenant_invitation_delivery($1, $2, $3, $4)`,
    [fixtureIds.tenant, membershipId, fixtureIds.actor, fixtureIds.actor],
  );
  const clientA = await connectFixtureClient();
  const clientB = await connectFixtureClient();
  let firstPrepared;
  let secondPrepared;
  try {
    await clientA.query("BEGIN");
    firstPrepared = (await prepare(clientA, fixtureIds.membership)).rows[0];
    assert.equal(firstPrepared.member_record.membership.invitation_delivery_state, "sending");
    const firstToken = firstPrepared.member_record.membership.invitation_token;
    let secondSettled = false;
    const secondPromise = prepare(clientB, fixtureIds.membership).then((result) => {
      secondSettled = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(secondSettled, false, "a concurrent prepare must wait on the first transaction's tenant lock");
    await clientA.query("COMMIT");
    secondPrepared = (await secondPromise).rows[0];
    assert.equal(secondPrepared.member_record.membership.invitation_delivery_state, "sending");
    assert.equal(secondPrepared.member_record.membership.invitation_token, firstToken, "the blocked prepare must not rotate the invitation token");

    await clientB.query(
      `SELECT * FROM brokerdesk_private.record_tenant_invitation_delivery(
        $1, $2, $3, 'clerk', 'pending', NULL, NULL,
        'invitation_delivery_outcome_unknown:synthetic pg timeout', NULL, NULL, NULL
      )`,
      [fixtureIds.tenant, fixtureIds.membership, fixtureIds.actor],
    );
    const unknownState = (await clientB.query(
      "SELECT invitation_delivery_state, invitation_token FROM tenant_memberships WHERE id = $1",
      [fixtureIds.membership],
    )).rows[0];
    assert.deepEqual(unknownState, { invitation_delivery_state: "unknown", invitation_token: firstToken });

    const blockedUnknown = (await prepare(clientB, fixtureIds.membership)).rows[0];
    assert.equal(blockedUnknown.member_record.membership.invitation_delivery_state, "unknown");
    assert.equal(blockedUnknown.member_record.membership.invitation_token, firstToken, "unknown recovery must remain persistently blocked without rotating the token");
  } finally {
    await clientA.query("ROLLBACK").catch(() => undefined);
    await clientA.end();
    await clientB.end();
  }

  const acceptedClient = await connectFixtureClient();
  try {
    const acceptedPrepared = (await prepare(acceptedClient, fixtureIds.secondMembership)).rows[0];
    assert.equal(acceptedPrepared.member_record.membership.invitation_delivery_state, "sending");
    await acceptedClient.query(
      `SELECT * FROM brokerdesk_private.record_tenant_invitation_delivery(
        $1, $2, $3, 'clerk', 'pending', 'pg-provider-invitation', NULL, NULL, NOW(), NULL, NULL
      )`,
      [fixtureIds.tenant, fixtureIds.secondMembership, fixtureIds.actor],
    );
  } finally {
    await acceptedClient.end();
  }
  const providerAccepted = (await verify.query(
    "SELECT invitation_delivery_state, provider_invitation_id FROM tenant_memberships WHERE id = $1",
    [fixtureIds.secondMembership],
  )).rows[0];
  assert.deepEqual(providerAccepted, { invitation_delivery_state: "provider_accepted", provider_invitation_id: "pg-provider-invitation" });

  await verify.end();
  const evidence = {
    postgres: "16",
    appliedCount: result.appliedCount,
    ledgerCount,
    owners,
    invitationClaim: {
      lockWait: "second prepare remained pending until first transaction committed",
      tokenStableAcrossConcurrentPrepare: true,
      unknownStateBlocksRetry: true,
      providerAcceptedState: "provider_accepted",
    },
  };
  mkdirSync("/private/tmp/broker-desk-evidence", { recursive: true, mode: 0o700 });
  writeFileSync("/private/tmp/broker-desk-evidence/current-migration-runner-full-prereq.log", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} finally {
  if (running) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
