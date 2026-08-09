export async function register() {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { warmPostgresPool } = await import("./lib/data.postgres");
    await warmPostgresPool();
  } catch {
    // Database readiness is checked again by the request path; startup should
    // remain available when the local database is temporarily unreachable.
  }
}
