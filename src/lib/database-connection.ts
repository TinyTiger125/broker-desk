export type DatabasePoolConnectionConfig = {
  connectionString: string;
  ssl?: {
    rejectUnauthorized: true;
    ca?: string;
    servername?: string;
  };
};

function isTokyoTlsProfile() {
  return process.env.BROKER_DESK_RUNTIME_TLS_PROFILE?.trim().toLowerCase() === "tokyo";
}

/** Per warm instance and per pool, not a deployment-wide connection limit. */
export function getDatabasePoolMax(defaultMax: number): number {
  return isTokyoTlsProfile() && process.env.VERCEL_ENV === "preview" ? 1 : defaultMax;
}

function getRuntimeCaCertificate() {
  const ca = process.env.DATABASE_RUNTIME_CA_CERT?.trim();
  if (isTokyoTlsProfile() && !ca) throw new Error("database_runtime_ca_required");
  if (ca && !ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error("database_runtime_ca_invalid");
  return ca || undefined;
}

/**
 * Build one explicit TLS configuration for both application pools.
 * SSL parameters are removed from the URL before pg receives it, so pg's URL
 * parser cannot override the explicit verify-full-equivalent settings below.
 */
export function buildDatabasePoolConnectionConfig(rawConnectionString: string | undefined): DatabasePoolConnectionConfig {
  const tokyoProfile = isTokyoTlsProfile();
  if (!rawConnectionString?.trim()) {
    if (tokyoProfile) throw new Error("database_connection_required");
    return { connectionString: "" };
  }
  let url: URL;
  try {
    url = new URL(rawConnectionString);
  } catch {
    if (tokyoProfile) throw new Error("database_connection_invalid");
    return { connectionString: rawConnectionString };
  }

  if (tokyoProfile && url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("database_protocol_invalid");
  }
  if (tokyoProfile && !url.hostname) throw new Error("database_host_required");

  const sslMode = url.searchParams.get("sslmode")?.trim().toLowerCase();
  const isSupabaseHost = url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.com");
  const shouldUseTls = tokyoProfile || isSupabaseHost || Boolean(sslMode);
  if (!shouldUseTls) return { connectionString: rawConnectionString };
  if (sslMode && sslMode !== "verify-full") {
    if (tokyoProfile) throw new Error("database_tls_verify_full_required");
    url.searchParams.set("sslmode", "verify-full");
  }

  const ca = getRuntimeCaCertificate();
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    url.searchParams.delete(parameter);
  }
  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
      servername: url.hostname,
    },
  };
}

/** Keep legacy URL normalization available to non-pool callers. */
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
