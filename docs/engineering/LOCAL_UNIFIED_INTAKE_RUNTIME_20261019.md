# Unified intake local runtime (2026-10-19)

This checkout has a repeatable local runtime for the property-document and customer-identity intake flow. It uses a dedicated PostgreSQL cluster and database under the repository's ignored `.broker-desk/local-intake/` directory. The data directory and database survive application restarts and are independent of `/tmp`.

Start the database and browser server with one command from the checkout root:

```bash
npm run local:intake:app
```

The command selects the Homebrew PostgreSQL 17 binary when available, then PostgreSQL 16, initializes the cluster once, starts it on `127.0.0.1:55460` with normal fsync durability, creates `broker_desk_local_intake`, applies the immutable migration ledger, and inserts only missing synthetic local workspace rows (`tenant_cherry`, `user_demo`, one property, one customer and one case). The browser server is started directly with Next webpack on `127.0.0.1:3004`; it does not use the repository's Turbopack development shortcut. Rerunning it is safe: applied migrations are checked by checksum and existing seed rows, including ownership and status edits, are preserved by stable IDs. The launcher refuses an occupied app port before database or credential mutation and verifies that an already-running PostgreSQL port belongs to this data directory with `fsync=on`.

The migration/bootstrap connection uses the local database owner only. The browser server receives a generated `brokerdesk_runtime` login with `NOSUPERUSER` and `NOBYPASSRLS`; lifecycle worker credentials use the separate `brokerdesk_admin` role. The generated URLs are kept in the mode-600 ignored file `.broker-desk/local-intake/runtime.env` and in the child process environment; they are never printed. The normal demo login route (`/api/actor`) establishes the browser cookie and binds the local `demo:<actorId>` subject inside the PostgreSQL request transaction; no injected request headers or proxy are required.

On every bootstrap, public business tables are first assigned to the migration connection's role (`postgres` in the documented local command), then the runtime and lifecycle grants are re-applied. Neither application role owns business tables. This ordering preserves the existing preimport lifecycle trigger owners and prevents a restart from turning an application role into a table owner or silently losing the trigger's lifecycle grants.

The browser's automatic processing request is protected by a database compare-and-set claim. A concurrent refresh receives the existing processing state and does not call the reader again. A processing lease is recoverable only when it is missing or at least five minutes old; object targets still stop at two attempts, and human-confirmed fields remain protected during retry.

The durable paths are:

- PostgreSQL data: `.broker-desk/local-intake/postgres/`
- PostgreSQL log: `.broker-desk/local-intake/postgres.log`
- Browser server log: `.broker-desk/local-intake/app.log` (mode 600)
- Database: `broker_desk_local_intake` on `127.0.0.1:55460`
- Private attachment storage: the existing PostgreSQL private adapter selected by `ATTACHMENT_STORAGE_MODE=postgres_private`
- Local role environment (mode 600, ignored): `.broker-desk/local-intake/runtime.env`

Stop the local database when the acceptance run is complete:

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_ctl \
  -D .broker-desk/local-intake/postgres \
  -m fast stop
```

If only PostgreSQL 16 is installed, use its matching `pg_ctl` path. Starting the runtime again after this stop reuses the same database and migration ledger. Do not delete the data directory when testing restart persistence.

The document-reading API key is not stored in this checkout or emitted by the runtime script. When `npm run local:intake:app` starts the browser server, it reads only `OPENAI_API_KEY` from the explicitly authorized sibling `broker-desk-web-dev/.env.local` and passes that one value to the child process. The rest of that file is never loaded or copied, and the key is never printed.

This is a local synthetic-data runtime. It is not a deployment procedure and does not change a hosted database.
