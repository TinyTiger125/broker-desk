const baseUrl = process.env.BROKER_DESK_APP_URL?.trim().replace(/\/$/, "");
const token = process.env.BROKER_DESK_IMPORT_WORKER_TOKEN?.trim();

if (!baseUrl || !token) {
  throw new Error("BROKER_DESK_APP_URL and BROKER_DESK_IMPORT_WORKER_TOKEN are required.");
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 90_000);
try {
  const response = await fetch(`${baseUrl}/api/internal/import-jobs/drain`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ limit: 3 }),
    signal: controller.signal,
  });
  const payload = await response.json().catch(() => ({}));
  console.info(JSON.stringify({ ok: response.ok, status: response.status, claimed: payload.claimed ?? 0, completed: payload.completed ?? 0, failed: payload.failed ?? 0 }));
  if (!response.ok) process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
