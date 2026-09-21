import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { validateSupabaseClaims } from "@/lib/supabase/identity";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error("supabase_auth_not_configured");
  return { url, key };
}

export function copySupabaseResponseState(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(header);
    if (value) target.headers.set(header, value);
  }
  return target;
}

export async function updateSupabaseSession(request: NextRequest, options: { requireAuth: boolean }) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const hasValidClaims = Boolean(
    !error &&
      claims &&
      projectUrl &&
      validateSupabaseClaims(claims, projectUrl),
  );
  if (options.requireAuth && !hasValidClaims) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return copySupabaseResponseState(response, NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 }));
    }
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("reason", "login_required");
    return copySupabaseResponseState(response, NextResponse.redirect(signInUrl));
  }
  return response;
}
