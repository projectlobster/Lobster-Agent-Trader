import { NextResponse, type NextRequest } from "next/server";
import { accessPassword, isAuthorized, isCrossSite } from "@/lib/access-guard";

/**
 * Single-user guard for a self-hosted install. Unset means "no auth", which is
 * the right default while the server is bound to loopback. Once
 * LIGHTER_TRADER_PASSWORD is set, every page and API call needs it — otherwise
 * /api/close-all is one curl away from flattening a live book.
 *
 * This is a speed bump against a neighbour on the network, not a defence
 * against someone who is actually targeting the host: basic auth travels in
 * cleartext over plain HTTP. Put a TLS-terminating reverse proxy in front
 * before exposing this beyond localhost.
 *
 * The decisions themselves live in @/lib/access-guard so they can be tested
 * without booting a server.
 */

const REALM = "Lobster Agent Trader";

export function proxy(request: NextRequest) {
  // Origin is checked whether or not a password is set: it costs nothing, and
  // it closes the cross-site hole that basic auth would otherwise leave open.
  // A browser attaches cached basic credentials to any request it considers
  // same-origin, so without this a malicious page could drive the console
  // through the user's own login. Non-browser clients (curl, the engine CLI)
  // send no Origin and are unaffected.
  if (
    isCrossSite({
      method: request.method,
      header: (name) => request.headers.get(name),
      urlOrigin: request.nextUrl.origin,
    })
  ) {
    return NextResponse.json({ error: "cross_origin_request_blocked" }, { status: 403 });
  }

  const password = accessPassword();
  if (!password) return NextResponse.next();

  if (isAuthorized(request.headers.get("authorization"), password)) {
    return NextResponse.next();
  }

  if (isApi(request.nextUrl.pathname)) {
    // Keep the JSON envelope the console's fetch helpers already know how to
    // read, so a failed call surfaces as a message instead of a parse error.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "www-authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

function isApi(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export const config = {
  // Skip static assets so the guard never slows down a stylesheet or a font.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)"],
};
