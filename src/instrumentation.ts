export async function register() {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    // Keep the development-only warmup out of browser/edge bundles. The
    // instrumentation hook itself is server-only; this explicit ignored
    // import lets Node resolve the module at runtime without tracing pg into
    // client compilation.
    const { warmPostgresPool } = await import(/* webpackIgnore: true */ "./lib/data.postgres");
    await warmPostgresPool();
  } catch {
    // Database readiness is checked again by the request path; startup should
    // remain available when the local database is temporarily unreachable.
  }
}
