# Postgres / Supabase Setup

## 1) Configure env
Edit `.env`:

```bash
DATA_DRIVER=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:6543/postgres?sslmode=require
```

If `DATA_DRIVER` is not `postgres` or `DATABASE_URL` is empty, app will use in-memory mode.

## 2) Start app
```bash
npm install
npm run dev
```

## 3) Verify data driver health
Open:
- `http://localhost:3000/api/health/data`

Expected:
- memory mode: `{"ok":true,"driver":"memory","checkedAt":"..."}`
- postgres mode: `{"ok":true,"driver":"postgres","checkedAt":"..."}`

If connection fails, API returns `500` with error message.

## 4) First-run behavior
The app will auto-create required tables on first data access.
A default demo user is auto-created if `users` is empty.
The output template settings table (`output_template_settings`) is also auto-created and seeded.

## 5) Optional manual schema init
You can also run SQL manually in Supabase SQL Editor using:
- `docs/postgres_schema.sql`

## 6) Current note
This is phase-2 persistence integration with same function signatures as memory repository.
Existing pages/actions do not need to change when switching driver.

## 7) Regression check (recommended)
After local server starts, run:

```bash
BASE_URL=http://127.0.0.1:3000 npm run test:regression
```

This verifies:
- data-driver health endpoint
- intake parse API
- dashboard critical modules
- output templates rendering
- board stage update API (forward + rollback)
