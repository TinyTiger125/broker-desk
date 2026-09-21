import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error("supabase_auth_not_configured");
  return { url, key };
}

function copySupabaseResponseState(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie.name, cookie.value);
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
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  if (options.requireAuth && (error || !data?.claims?.sub)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return copySupabaseResponseState(response, NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 }));
    }
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("reason", "login_required");
    return copySupabaseResponseState(response, NextResponse.redirect(signInUrl));
  }
  return response;
}
