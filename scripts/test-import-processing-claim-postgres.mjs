#!/usr/bin/env node

// Exercises the same restricted role used by the local app against a disposable
// database. This proves the database CAS rather than only checking SQL text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const runtimeEnv = Object.fromEntries(
  readFileSync(".broker-desk/local-intake/runtime.env", "utf8")
    .trim()
    .split(/\n/)
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
const ownerUrl = "postgresql://postgres@127.0.0.1:55460/postgres";
const sourceUrl = new URL(runtimeEnv.DATABASE_URL);
const dbName = `broker_desk_cas_${process.pid}_${Date.now()}`;
const dbUrl = new URL(sourceUrl);
dbUrl.pathname = `/${dbName}`;
const ownerDbUrl = new URL(ownerUrl);
ownerDbUrl.pathname = `/${dbName}`;

const owner = new Client({ connectionString: ownerUrl });
await owner.connect();
try {
  await owner.query(`CREATE DATABASE "${dbName}"`);
} finally {
  await owner.end();
}

const setup = new Client({ connectionString: ownerDbUrl.toString() });
await setup.connect();
await setup.query(`
  CREATE TABLE import_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    processing_started_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0
  );
  GRANT USAGE ON SCHEMA public TO brokerdesk_runtime;
  GRANT SELECT, UPDATE ON import_jobs TO brokerdesk_runtime;
  INSERT INTO import_jobs (id, status) VALUES ('fresh', 'queued'), ('expired', 'processing');
  UPDATE import_jobs SET processing_started_at = NOW() - INTERVAL '6 minutes' WHERE id = 'expired';
`);
await setup.end();

const claim = async (id) => {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    return (await client.query(
      `UPDATE import_jobs
       SET status='processing', processing_started_at=NOW(), attempt_count=attempt_count+1
       WHERE id=$1 AND (status='queued' OR (status='processing' AND processing_started_at < NOW() - INTERVAL '5 minutes'))
       RETURNING id, attempt_count`,
      [id],
    )).rows[0] ?? null;
  } finally {
    await client.end();
  }
};

const freshClaims = await Promise.all([claim("fresh"), claim("fresh")]);
assert.equal(freshClaims.filter(Boolean).length, 1, "fresh queued job must have one CAS winner");
assert.equal((await (async () => { const c = new Client({ connectionString: dbUrl.toString() }); await c.connect(); const r = await c.query("SELECT attempt_count FROM import_jobs WHERE id='fresh'"); await c.end(); return r.rows[0].attempt_count; })()), 1);

const expiredClaims = await Promise.all([claim("expired"), claim("expired")]);
assert.equal(expiredClaims.filter(Boolean).length, 1, "expired processing lease must have one recovery winner");

const cleanup = new Client({ connectionString: ownerUrl });
await cleanup.connect();
try {
  await cleanup.query(`DROP DATABASE "${dbName}"`);
} finally {
  await cleanup.end();
}

console.log("PASS: restricted PostgreSQL CAS has one fresh winner and one expired-lease recovery winner");
