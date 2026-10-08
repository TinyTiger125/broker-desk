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

function failedInviteConfirmation(request: Request) {
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("error", INVITE_CONFIRMATION_ERROR);
  return NextResponse.redirect(signIn);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHashes = requestUrl.searchParams.getAll("token_hash");
  const types = requestUrl.searchParams.getAll("type");
  const tokenHash = tokenHashes[0] ?? "";
  if (tokenHashes.length !== 1 || !tokenHash || tokenHash !== tokenHash.trim() || types.length !== 1 || types[0] !== "invite") {
    return failedInviteConfirmation(request);
  }

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
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
    if (error || !data.session || pendingCookies.length === 0) {
      return failedInviteConfirmation(request);
    }

    const response = NextResponse.redirect(new URL(safeInviteNext(requestUrl.searchParams.get("next")), request.url));
    for (const cookie of pendingCookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
    for (const [name, value] of Object.entries(pendingHeaders)) response.headers.set(name, value);
    return response;
  } catch {
    // Do not sign out or clear an existing browser session when this invite
    // token cannot be verified. The failure response never carries pending
    // auth mutations collected from a failed verification attempt.
    return failedInviteConfirmation(request);
  }
}
