import { NextResponse } from "next/server";
import { ACTIVE_TENANT_COOKIE_NAME } from "@/lib/tenant-permissions";

export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/workspace", request.url));
  response.cookies.set(ACTIVE_TENANT_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
