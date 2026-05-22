import { NextResponse } from "next/server";

export const QA_API_TOKEN_HEADER = "x-broker-desk-qa-token";

export function isQaApiRequestAllowed(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;

  const expectedToken = process.env.BROKER_DESK_QA_TOKEN?.trim();
  if (!expectedToken) return false;

  return request.headers.get(QA_API_TOKEN_HEADER)?.trim() === expectedToken;
}

export function rejectQaApiRequest() {
  return NextResponse.json({ ok: false, error: "qa_api_disabled" }, { status: 404 });
}
