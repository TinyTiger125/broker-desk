import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/server";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

const RESET_PASSWORD_PATH = "/reset-password";
const INVITE_CONFIRMATION_ERROR = "invite_confirmation_failed";
const INTERNAL_ORIGIN = "https://brokerdesk.invalid";
const INVITE_POST_SECURITY_HEADERS = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function safeInviteNext(value: string | null) {
  const candidate = value?.trim() ?? "";
  if (
    !candidate
    || !candidate.startsWith("/")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || /[\r\n]/.test(candidate)
  ) {
    return RESET_PASSWORD_PATH;
  }

  try {
    const decoded = decodeURIComponent(candidate);
    if (
      !decoded.startsWith("/")
      || decoded.startsWith("//")
      || decoded.includes("\\")
      || /[\r\n]/.test(decoded)
    ) {
      return RESET_PASSWORD_PATH;
    }
    const parsed = new URL(candidate, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return RESET_PASSWORD_PATH;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return RESET_PASSWORD_PATH;
  }
}

function failedInvitePost(status: number) {
  return NextResponse.json(
    { ok: false, error: INVITE_CONFIRMATION_ERROR },
    { status, headers: INVITE_POST_SECURITY_HEADERS },
  );
}

function hasExactRequestOrigin(request: Request, requestUrl: URL) {
  return request.headers.get("origin") === requestUrl.origin;
}

function parseInvitePostPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set(["token_hash", "type", "next"]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return null;
  if (
    typeof record.token_hash !== "string"
    || !record.token_hash
    || record.token_hash !== record.token_hash.trim()
    || typeof record.type !== "string"
    || record.type !== "invite"
    || (record.next !== undefined && typeof record.next !== "string")
  ) {
    return null;
  }
  return {
    tokenHash: record.token_hash,
    next: typeof record.next === "string" ? record.next : null,
  };
}

/**
 * Confirm a fragment-delivered invitation. The raw provider secret is accepted
 * only in this same-origin POST body. There is intentionally no GET handler:
 * a token in a query string can enter browser history, referrers, proxy logs,
 * or analytics before application code can remove it.
 */
export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  if (!hasExactRequestOrigin(request, requestUrl)) return failedInvitePost(403);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return failedInvitePost(415);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return failedInvitePost(400);
  }
  const parsed = parseInvitePostPayload(payload);
  if (!parsed) return failedInvitePost(400);

  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders: Record<string, string> = {};
  try {
    const cookieStore = await cookies();
    const { url, key } = getSupabaseConfig();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headers) {
          pendingCookies.splice(0, pendingCookies.length, ...cookiesToSet);
          Object.assign(pendingHeaders, headers);
        },
      },
    });
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: parsed.tokenHash, type: "invite" });
    if (error || !data.session || pendingCookies.length === 0) return failedInvitePost(401);

    const response = NextResponse.json(
      { ok: true, redirectTo: safeInviteNext(parsed.next) },
      { headers: INVITE_POST_SECURITY_HEADERS },
    );
    for (const cookie of pendingCookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
    for (const [name, value] of Object.entries(pendingHeaders)) response.headers.set(name, value);
    for (const [name, value] of Object.entries(INVITE_POST_SECURITY_HEADERS)) response.headers.set(name, value);
    return response;
  } catch {
    return failedInvitePost(401);
  }
}
