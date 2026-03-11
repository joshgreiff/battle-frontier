import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/group")) {
    return NextResponse.next();
  }

  const token = await getToken({ req });
  if (!token) {
    const loginUrl = new URL("/", req.url);
    loginUrl.searchParams.set("error", "Please sign in");
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/group/:path*"]
};
