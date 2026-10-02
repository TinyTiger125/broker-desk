import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Module from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { join } from "node:path";
import pg from "pg";
import ts from "typescript";
import vm from "node:vm";
import { runPostgresMigrations } from "./run-postgres-migrations.mjs";

const { Client } = pg;
const nodeRequire = Module.createRequire(import.meta.url);
const { ClerkAPIResponseError } = nodeRequire("@clerk/backend/errors");
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
      ($1, 'QA PG User', 'qa-fixture-8@example.test', 'fixture-password-hash', 'pg-claim-actor-subject'),
      ($2, 'PG claim invited', 'qa-fixture-5@example.test', 'synthetic', NULL),
      ($3, 'PG claim second invited', 'qa-fixture-6@example.test', 'synthetic', NULL)`,
    [fixtureIds.actor, fixtureIds.invited, fixtureIds.secondInvited],
  );
  await verify.query(
    `INSERT INTO tenants (id, name, slug, account_type, status, purchased_seat_count)
     VALUES ($1, 'PG claim fixture', 'pg-claim-fixture', 'company', 'active', 10)`,
    [fixtureIds.tenant],
  );
  await verify.query(
    `INSERT INTO tenant_memberships
      (id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status,
       invitation_delivery_state, invited_email, invited_by_user_id)
     VALUES
      ($1, $2, $3, 'tenant_owner', 'company_owner', 'active', 'manual', 'accepted', 'ready', NULL, $3),
      ($4, $2, $5, 'broker', 'ordinary_member', 'invited', 'none', 'pending', 'ready', 'qa-fixture-5@example.test', $3),
      ($6, $2, $7, 'broker', 'ordinary_member', 'invited', 'none', 'pending', 'ready', 'qa-fixture-6@example.test', $3)`,
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
    assert.equal(firstPrepared.member_record.delivery_blocked, null, "the first prepare must mark that its sending claim was acquired by this caller");
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
    assert.equal(secondPrepared.member_record.delivery_blocked, "sending", "a blocked concurrent prepare must identify the existing sending claim");
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
    assert.equal(blockedUnknown.member_record.delivery_blocked, "unknown", "an unknown recovery block must be distinguished from a newly acquired claim");
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

  let postgresAdapterActionComposition;
  const adapterEnvKeys = [
    "NODE_ENV",
    "BROKER_DESK_DEPLOYMENT_ENV",
    "DATA_DRIVER",
    "DATABASE_URL",
    "DATABASE_DEVELOPMENT_URL",
    "BROKER_DESK_AUTH_MODE",
    "BROKER_DESK_AUTH_PROVIDER",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ];
  const adapterEnvSnapshot = new Map(adapterEnvKeys.map((key) => [key, process.env[key]]));
  let postgresAdapter;
  try {
    // Run the real PostgreSQL adapter in the same ephemeral database. The
    // temporary runtime role is made LOGIN-only for this process and restored
    // before the cluster is removed; no shared credentials or database are used.
    await verify.query("ALTER ROLE brokerdesk_runtime LOGIN");
    process.env.NODE_ENV = "production";
    process.env.BROKER_DESK_DEPLOYMENT_ENV = "staging";
    process.env.DATA_DRIVER = "postgres";
    process.env.DATABASE_URL = `postgresql://brokerdesk_runtime@127.0.0.1:${port}/broker_desk_runner_test`;
    delete process.env.DATABASE_DEVELOPMENT_URL;
    process.env.BROKER_DESK_AUTH_MODE = "clerk";
    process.env.BROKER_DESK_AUTH_PROVIDER = "clerk";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "fixture-clerk-publishable-key";
    process.env.CLERK_SECRET_KEY = "fixture-clerk-secret-key";

    const moduleCache = new Map();
    const resolveAlias = (request) => {
      const relative = request.slice(2);
      const candidates = [".ts", ".tsx", ".mjs", ".js", ".cjs"].map((extension) => path.resolve("src", `${relative}${extension}`));
      return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
    };
    const loadTs = (sourcePath) => {
      const absolutePath = path.resolve(sourcePath);
      if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
      const compiled = ts.transpileModule(readFileSync(absolutePath, "utf8"), {
        fileName: absolutePath,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText;
      const module = new Module(absolutePath);
      module.filename = absolutePath;
      module.paths = Module._nodeModulePaths(process.cwd());
      moduleCache.set(absolutePath, module);
      const originalRequire = module.require.bind(module);
      module.require = (request) => request.startsWith("@/") ? loadTs(resolveAlias(request)) : originalRequire(request);
      module._compile(compiled, absolutePath);
      return module.exports;
    };

    postgresAdapter = loadTs("src/lib/data.postgres.ts");
    const { classifyClerkInvitationError } = loadTs("src/lib/clerk-invitations.ts");
    const { makeInvitationDeliveryUnknownError } = loadTs("src/lib/invitation-delivery-state.ts");
    const actionSource = readFileSync(path.resolve("src/app/actions.ts"), "utf8");
    const actionAst = ts.createSourceFile("actions.ts", actionSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const actionSenderNode = actionAst.statements.find(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "sendTenantMemberInvitation",
    );
    assert(actionSenderNode, "the PostgreSQL composition harness must find the Action sender");
    const actionSenderOutput = ts.transpileModule(
      `module.exports = ${actionSource.slice(actionSenderNode.getStart(actionAst), actionSenderNode.end)};`,
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const pgSubject = "pg-claim-actor-subject";
    const refreshWithPostgresAdapter = (input) => postgresAdapter.withPostgresAuthContext(
      pgSubject,
      () => postgresAdapter.refreshTenantMemberInvitation(input),
    );
    const updateWithPostgresAdapter = (input) => postgresAdapter.withPostgresAuthContext(
      pgSubject,
      () => postgresAdapter.updateTenantMemberInvitation(input),
    );
    const loadActionSender = (providerBehavior) => {
      let providerCalls = 0;
      const senderModule = { exports: {} };
      vm.runInNewContext(actionSenderOutput, {
        module: senderModule,
        exports: senderModule.exports,
        refreshTenantMemberInvitation: refreshWithPostgresAdapter,
        updateTenantMemberInvitation: updateWithPostgresAdapter,
        isSupabaseAuthEnabled: () => false,
        inviteSupabaseUserByEmail: async () => { throw new Error("isolated PostgreSQL Clerk harness must not call Supabase"); },
        createClerkInvitationForTenantMember: async (prepared) => {
          providerCalls += 1;
          return providerBehavior({ prepared, providerCalls });
        },
        classifyClerkInvitationError,
        makeInvitationDeliveryUnknownError,
        console,
        process,
        setTimeout,
        clearTimeout,
      }, { filename: "src/app/actions.ts" });
      assert.equal(typeof senderModule.exports, "function", "the extracted Action sender must be callable against the PostgreSQL adapter");
      return { sender: senderModule.exports, getProviderCalls: () => providerCalls };
    };
    const actionInput = (membershipId) => ({
      tenantId: fixtureIds.tenant,
      membershipId,
      actorId: fixtureIds.actor,
      recordSkippedAsFailure: true,
    });
    const readState = async (membershipId) => (await verify.query(
      `SELECT invitation_delivery_state, invitation_status, provider_invitation_id, invitation_error
       FROM tenant_memberships WHERE id = $1`,
      [membershipId],
    )).rows[0];
    const addCompositionMember = async (label) => {
      const userId = `pg_composition_user_${label}`;
      const membershipId = `pg_composition_membership_${label}`;
      await verify.query(
        `INSERT INTO users (id, name, email, password_hash, external_auth_subject)
         VALUES ($1, $2, $3, 'synthetic', NULL)`,
        [userId, `PG composition ${label}`, `pg-composition-${label}@example.invalid`],
      );
      await verify.query(
        `INSERT INTO tenant_memberships
          (id, tenant_id, user_id, role, capability, status, invitation_provider, invitation_status,
           invitation_delivery_state, invited_email, invited_by_user_id)
         VALUES ($1, $2, $3, 'broker', 'ordinary_member', 'invited', 'none', 'pending', 'ready', 'qa-fixture-7@example.test', $4)`,
        [membershipId, fixtureIds.tenant, userId, fixtureIds.actor],
      );
      return membershipId;
    };
    const invoke = (sender, membershipId) => sender(actionInput(membershipId));

    const timeoutMembershipId = await addCompositionMember("timeout");
    const timeoutSender = loadActionSender(async () => {
      throw new Error("synthetic provider timeout after side effect");
    });
    const timeoutResult = await invoke(timeoutSender.sender, timeoutMembershipId);
    assert(timeoutResult.uncertain && timeoutResult.deliveryBlocked === "unknown", "PostgreSQL adapter timeout must persist and expose unknown");
    assert.equal(timeoutSender.getProviderCalls(), 1, "PostgreSQL adapter timeout must call the provider once");
    const timeoutRetry = await invoke(timeoutSender.sender, timeoutMembershipId);
    assert.equal(timeoutRetry.deliveryBlocked, "unknown", "PostgreSQL adapter unknown state must block retry");
    assert.equal(timeoutSender.getProviderCalls(), 1, "PostgreSQL adapter timeout retry must not call the provider again");
    assert.equal((await readState(timeoutMembershipId)).invitation_delivery_state, "unknown");

    const concurrentMembershipId = await addCompositionMember("concurrent");
    let releaseConcurrentProvider;
    const concurrentProviderRelease = new Promise((resolve) => { releaseConcurrentProvider = resolve; });
    const concurrentSender = loadActionSender(async () => {
      await concurrentProviderRelease;
      throw new Error("synthetic concurrent provider timeout after side effect");
    });
    const firstConcurrentAction = invoke(concurrentSender.sender, concurrentMembershipId);
    for (let attempt = 0; attempt < 250 && concurrentSender.getProviderCalls() === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(concurrentSender.getProviderCalls(), 1, "PostgreSQL adapter first concurrent Action must reach provider once after claim");
    const secondConcurrentResult = await invoke(concurrentSender.sender, concurrentMembershipId);
    assert.equal(secondConcurrentResult.deliveryBlocked, "sending", "PostgreSQL adapter concurrent Action must see persisted sending claim");
    assert.equal(concurrentSender.getProviderCalls(), 1, "PostgreSQL adapter concurrent Action must not call provider twice");
    releaseConcurrentProvider?.();
    const firstConcurrentResult = await firstConcurrentAction;
    assert(firstConcurrentResult.uncertain && firstConcurrentResult.deliveryBlocked === "unknown", "PostgreSQL adapter concurrent provider failure must finalize unknown");
    assert.equal((await readState(concurrentMembershipId)).invitation_delivery_state, "unknown");

    const validationMembershipId = await addCompositionMember("validation");
    const validationSender = loadActionSender(async ({ providerCalls }) => {
      if (providerCalls === 1) {
        throw new ClerkAPIResponseError("invalid invitation", {
          data: [{ code: "email_address_invalid", message: "invalid" }],
          status: 422,
        });
      }
      return { ok: true, providerInvitationId: "pg-composition-validation", invitationUrl: "https://example.invalid/validation", sentAt: new Date() };
    });
    const validationFailure = await invoke(validationSender.sender, validationMembershipId);
    assert(!validationFailure.uncertain && validationFailure.sent === false, "PostgreSQL adapter known validation failure must be confirmed");
    assert.equal((await readState(validationMembershipId)).invitation_delivery_state, "ready");
    const validationSuccess = await invoke(validationSender.sender, validationMembershipId);
    assert(validationSuccess.sent && !validationSuccess.uncertain, "PostgreSQL adapter corrected validation retry must succeed");
    assert.equal(validationSender.getProviderCalls(), 2, "PostgreSQL adapter validation retry must call provider twice total");
    assert.equal((await readState(validationMembershipId)).invitation_delivery_state, "provider_accepted");

    const acceptedMembershipId = await addCompositionMember("accepted");
    const acceptedSender = loadActionSender(async ({ providerCalls }) => ({
      ok: true,
      providerInvitationId: `pg-composition-accepted-${providerCalls}`,
      invitationUrl: `https://example.invalid/accepted-${providerCalls}`,
      sentAt: new Date(),
    }));
    const acceptedFirst = await invoke(acceptedSender.sender, acceptedMembershipId);
    assert(acceptedFirst.sent && !acceptedFirst.uncertain, "PostgreSQL adapter normal provider acceptance must succeed");
    assert.equal(acceptedSender.getProviderCalls(), 1);
    assert.equal((await readState(acceptedMembershipId)).invitation_delivery_state, "provider_accepted");
    const acceptedRepeat = await invoke(acceptedSender.sender, acceptedMembershipId);
    assert(acceptedRepeat.sent && !acceptedRepeat.uncertain, "provider_accepted must permit an explicit resend request");
    assert.equal(acceptedSender.getProviderCalls(), 2, "explicit resend after provider acceptance must make exactly one additional provider call");
    const acceptedRepeatState = await readState(acceptedMembershipId);
    assert.equal(acceptedRepeatState.invitation_delivery_state, "provider_accepted");
    assert.equal(acceptedRepeatState.provider_invitation_id, "pg-composition-accepted-2");

    const compositionAuditCounts = (await verify.query(
      `SELECT target_id, COUNT(*)::INTEGER AS count
       FROM audit_logs
       WHERE target_id IN ($1, $2, $3) AND action IN ('member_invitation_sent', 'member_invitation_failed')
       GROUP BY target_id ORDER BY target_id`,
      [validationMembershipId, acceptedMembershipId, concurrentMembershipId],
    )).rows;
    assert.deepEqual(compositionAuditCounts, [
      { target_id: acceptedMembershipId, count: 2 },
      { target_id: validationMembershipId, count: 2 },
    ], "PostgreSQL adapter finalization must persist one audit per known provider outcome and none for unknown");
    postgresAdapterActionComposition = {
      timeout: { providerCalls: timeoutSender.getProviderCalls(), state: "unknown", retryBlocked: true },
      concurrent: { providerCalls: concurrentSender.getProviderCalls(), finalState: "unknown", secondActionBlocked: "sending" },
      knownValidationFailure: { providerCalls: validationSender.getProviderCalls(), finalState: "provider_accepted", retryAllowed: true },
      providerAcceptedRepeat: { providerCalls: acceptedSender.getProviderCalls(), finalState: acceptedRepeatState.invitation_delivery_state, explicitResendCalls: 2 },
      auditCounts: compositionAuditCounts,
    };
    console.log(JSON.stringify({ postgresAdapterActionComposition }));
  } finally {
    await globalThis.__brokerDeskPostgresPool?.end().catch(() => undefined);
    await verify.query("ALTER ROLE brokerdesk_runtime NOLOGIN").catch(() => undefined);
    for (const [key, value] of adapterEnvSnapshot) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  await verify.end();
  const evidence = {
    postgres: "16",
    appliedCount: result.appliedCount,
    ledgerCount,
    owners,
    postgresAdapterActionComposition,
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
