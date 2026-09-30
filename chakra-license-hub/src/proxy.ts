// Runs before every page and API request (Next.js 16 "proxy", formerly middleware).
//
// Optimistic check only — is there a validly signed, unexpired session cookie?
// Every API route checks again (auth.currentAdmin) before touching data, so this
// is a filter, not the lock.
import { NextResponse, type NextRequest } from "next/server";

import { readSession, SESSION_COOKIE } from "@/lib/session";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // CSRF: a state-changing API call must come from this site. (The session
  // cookie is also SameSite=Strict; this covers browsers that ignore it.)
  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      let sameSite = false;
      try {
        sameSite = new URL(origin).host === request.headers.get("host");
      } catch {}
      if (!sameSite) return NextResponse.json({ error: "cross-site request refused" }, { status: 403 });
    }
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's static assets and public images.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
