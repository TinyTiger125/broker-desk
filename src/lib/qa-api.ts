import { NextResponse } from "next/server";

export const QA_API_TOKEN_HEADER = "x-broker-desk-qa-token";

function hasValidQaToken(request: Request) {
  const expectedToken = process.env.BROKER_DESK_QA_TOKEN?.trim();
  if (!expectedToken) return false;

  return request.headers.get(QA_API_TOKEN_HEADER)?.trim() === expectedToken;
}

function isLoopbackHost(host: string | null) {
  if (!host) return false;

  const normalized = host.trim().toLowerCase();
  if (normalized === "localhost" || normalized.startsWith("localhost:")) return true;
  if (normalized === "127.0.0.1" || normalized.startsWith("127.0.0.1:")) return true;
  if (normalized === "[::1]" || normalized.startsWith("[::1]:")) return true;
  if (normalized === "::1") return true;

  return false;
}

export function isQaApiRequestAllowed(request: Request) {
  if (process.env.NODE_ENV === "production") return false;
  if (hasValidQaToken(request)) return true;

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost && !isLoopbackHost(forwardedHost)) {
    return false;
  }

  return isLoopbackHost(request.headers.get("host"));
}

export function rejectQaApiRequest() {
  return NextResponse.json({ ok: false, error: "qa_api_disabled" }, { status: 404 });
}
