import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, connect as tlsConnect } from "node:tls";
import { Client } from "pg";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/database-connection.ts", import.meta.url), "utf8");
const runtimePoolSource = await readFile(new URL("../src/lib/data.postgres.ts", import.meta.url), "utf8");
const adminPoolSource = await readFile(new URL("../src/lib/data.admin.postgres.ts", import.meta.url), "utf8");
for (const [label, poolSource] of [["runtime", runtimePoolSource], ["admin", adminPoolSource]]) {
  if (/rejectUnauthorized\s*:\s*false/.test(poolSource)) throw new Error(`${label} pool still disables certificate verification`);
}
const modulePath = join(dirname(fileURLToPath(import.meta.url)), ".database-connection-tls-transpiled.mjs");
await writeFile(modulePath, ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);
const { buildDatabasePoolConnectionConfig } = await import(`file://${modulePath}`);

const assertThrows = (fn, expectedCode, label) => {
  try {
    fn();
    throw new Error(`${label} was accepted`);
  } catch (error) {
    if (error?.message !== expectedCode) throw error;
  }
};

process.env.BROKER_DESK_RUNTIME_TLS_PROFILE = "tokyo";
delete process.env.DATABASE_RUNTIME_CA_CERT;
assertThrows(() => buildDatabasePoolConnectionConfig(undefined), "database_connection_required", "Tokyo empty connection string");
assertThrows(() => buildDatabasePoolConnectionConfig("not-a-connection"), "database_connection_invalid", "Tokyo invalid connection string");
assertThrows(() => buildDatabasePoolConnectionConfig("https://db.tokyo.test/db"), "database_protocol_invalid", "Tokyo non-PostgreSQL protocol");

const fixtureDir = await mkdtemp(join(tmpdir(), "broker-desk-tls-"));
const runOpenSsl = (args) => execFileSync("openssl", args, { cwd: fixtureDir, stdio: "ignore" });
const path = (name) => join(fixtureDir, name);

runOpenSsl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.crt", "-subj", "/CN=Broker Desk Fixture CA", "-days", "1"]);
runOpenSsl(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=db.tokyo.test"]);
await writeFile(path("server.ext"), "subjectAltName=DNS:db.tokyo.test\n");
runOpenSsl(["x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.crt", "-days", "1", "-sha256", "-extfile", "server.ext"]);
runOpenSsl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "other-ca.key", "-out", "other-ca.crt", "-subj", "/CN=Other Fixture CA", "-days", "1"]);
runOpenSsl(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "wrong-server.key", "-out", "wrong-server.csr", "-subj", "/CN=wrong.tokyo.test"]);
await writeFile(path("wrong-server.ext"), "subjectAltName=DNS:wrong.tokyo.test\n");
runOpenSsl(["x509", "-req", "-in", "wrong-server.csr", "-CA", "other-ca.crt", "-CAkey", "other-ca.key", "-CAcreateserial", "-out", "wrong-server.crt", "-days", "1", "-sha256", "-extfile", "wrong-server.ext"]);

process.env.BROKER_DESK_RUNTIME_TLS_PROFILE = "tokyo";
process.env.DATABASE_RUNTIME_CA_CERT = await readFile(path("ca.crt"), "utf8");
const runtimeConfig = buildDatabasePoolConnectionConfig("postgresql://brokerdesk_runtime@db.tokyo.test:5432/broker_desk?sslmode=verify-full&application_name=runtime");
const adminConfig = buildDatabasePoolConnectionConfig("postgresql://brokerdesk_admin@db.tokyo.test:5432/broker_desk?sslmode=verify-full&application_name=admin");
if (!runtimeConfig.ssl || !adminConfig.ssl) throw new Error("Tokyo runtime/admin TLS config was not created");
if (runtimeConfig.ssl.rejectUnauthorized !== true || adminConfig.ssl.rejectUnauthorized !== true) throw new Error("TLS certificate verification is not mandatory");
if (runtimeConfig.ssl.servername !== "db.tokyo.test" || adminConfig.ssl.servername !== "db.tokyo.test") throw new Error("TLS hostname is not pinned to the database host");
if (runtimeConfig.connectionString.includes("sslmode") || adminConfig.connectionString.includes("sslmode")) throw new Error("URL sslmode was left to override explicit TLS config");
if (runtimeConfig.ssl.ca !== adminConfig.ssl.ca) throw new Error("runtime and admin pools do not share the fixed CA source");

for (const legacyMode of ["prefer", "require", "verify-ca"]) {
  process.env.BROKER_DESK_RUNTIME_TLS_PROFILE = "";
  delete process.env.DATABASE_RUNTIME_CA_CERT;
  const legacyConfig = buildDatabasePoolConnectionConfig(`postgresql://legacy@db.staging.test:5432/broker_desk?sslmode=${legacyMode}`);
  if (!legacyConfig.ssl || legacyConfig.ssl.rejectUnauthorized !== true || legacyConfig.connectionString.includes("sslmode")) {
    throw new Error(`non-Tokyo ${legacyMode} compatibility did not produce strict explicit TLS`);
  }
}
process.env.BROKER_DESK_RUNTIME_TLS_PROFILE = "tokyo";
process.env.DATABASE_RUNTIME_CA_CERT = await readFile(path("ca.crt"), "utf8");

for (const [label, config] of [["runtime", runtimeConfig], ["admin", adminConfig]]) {
  const pgClient = new Client(config);
  const actualSsl = pgClient.connectionParameters.ssl;
  if (!actualSsl || actualSsl.rejectUnauthorized !== true || actualSsl.ca !== config.ssl.ca || actualSsl.servername !== config.ssl.servername) {
    throw new Error(`pg parsed ${label} connection without the explicit CA/verification/hostname settings`);
  }
  if (pgClient.connectionParameters.connectionString?.includes("sslmode")) throw new Error(`pg retained a URL sslmode override for ${label}`);
}

const noCa = () => {
  const original = process.env.DATABASE_RUNTIME_CA_CERT;
  delete process.env.DATABASE_RUNTIME_CA_CERT;
  try {
    buildDatabasePoolConnectionConfig("postgresql://brokerdesk_runtime@db.tokyo.test:5432/broker_desk?sslmode=verify-full");
    throw new Error("missing Tokyo CA was accepted");
  } catch (error) {
    if (error?.message !== "database_runtime_ca_required") throw error;
  } finally {
    process.env.DATABASE_RUNTIME_CA_CERT = original;
  }
};
noCa();

process.env.BROKER_DESK_RUNTIME_TLS_PROFILE = "";
const localConfig = buildDatabasePoolConnectionConfig("postgresql://localhost:5432/broker_desk");
if (localConfig.ssl) throw new Error("local development unexpectedly inherited Tokyo TLS settings");
process.env.BROKER_DESK_RUNTIME_TLS_PROFILE = "tokyo";

const startServer = (keyFile, certFile) => new Promise((resolve) => {
  const server = createServer({ key: readFileSync(path(keyFile)), cert: readFileSync(path(certFile)) }, (socket) => socket.end());
  server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
});
const connectWith = (config, port) => new Promise((resolve, reject) => {
  const socket = tlsConnect({ host: "127.0.0.1", port, servername: config.ssl.servername, ca: config.ssl.ca, rejectUnauthorized: config.ssl.rejectUnauthorized }, () => {
    socket.end();
    resolve();
  });
  socket.once("error", reject);
});
const assertRejected = async (config, port, label) => {
  try {
    await connectWith(config, port);
    throw new Error(`${label} certificate was accepted`);
  } catch (error) {
    if (error?.message === `${label} certificate was accepted`) throw error;
  }
};

for (const [label, config] of [["runtime", runtimeConfig], ["admin", adminConfig]]) {
  const trusted = await startServer("server.key", "server.crt");
  await connectWith(config, trusted.port);
  trusted.server.close();

  const untrusted = await startServer("wrong-server.key", "wrong-server.crt");
  await assertRejected(config, untrusted.port, `${label} untrusted`);
  untrusted.server.close();

  const hostnameMismatch = await startServer("server.key", "server.crt");
  const mismatchConfig = { ...config, ssl: { ...config.ssl, servername: "wrong.tokyo.test" } };
  await assertRejected(mismatchConfig, hostnameMismatch.port, `${label} hostname-mismatch`);
  hostnameMismatch.server.close();
}

await rm(fixtureDir, { recursive: true, force: true });
await rm(modulePath, { force: true });
console.log("database TLS contract passed (runtime/admin trusted success, untrusted CA rejection, hostname mismatch rejection, Tokyo CA gate, local boundary)");
