/** Keep the current strict TLS behavior explicit across pg major versions. */
export function normalizeDatabaseConnectionString(rawConnectionString: string | undefined): string | undefined {
  if (!rawConnectionString) return rawConnectionString;
  try {
    const url = new URL(rawConnectionString);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return rawConnectionString;
  }
}
