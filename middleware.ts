import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─── Simple in-memory rate limiter ───────────────────────────────────────────
// Works per-worker-instance. For multi-region Vercel, replace with Upstash Redis.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 200;          // requests per window per IP
const API_RATE_LIMIT_MAX = 60;       // tighter limit for API routes

type RateEntry = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateEntry>();

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count += 1;
  return entry.count <= max;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS);

function buildCsp(supabaseHost: string): string {
  return [
    "default-src 'self'",
    // 'unsafe-inline' is required for Next.js App Router (inline hydration scripts).
    // 'strict-dynamic' cannot be used because Next.js emits static <script src> chunk
    // tags that don't carry nonces and aren't dynamically created by a trusted script.
    "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://api.giphy.com https://us.i.posthog.com https://us-assets.i.posthog.com`,
    `frame-src 'self' https://${supabaseHost} https://*.supabase.co https://*.supabase.in https://docs.google.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default async function middleware(request: NextRequest) {
  const ip = getClientIp(request);
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  // Rate limiting
  const allowed = checkRateLimit(
    `${ip}:${isApiRoute ? "api" : "page"}`,
    isApiRoute ? API_RATE_LIMIT_MAX : RATE_LIMIT_MAX
  );

  if (!allowed) {
    return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
    : "*.supabase.co";
  const csp = buildCsp(supabaseHost);

  const requestHeaders = new Headers(request.headers);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/");

  const isPublicRoute =
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/txt");

  if (!user && !isAuthRoute && !isPublicRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ── Force password change ────────────────────────────────────────────────
  // app_metadata is set by the PATCH /api/users/[id] route when a manager
  // enables "must_change_password". Block all dashboard navigation until done.
  if (user?.app_metadata?.must_change_password) {
    // Allow auth routes and API calls (password update needs to reach the API)
    if (!isAuthRoute && !isApiRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  // ── Force sign-out: detected via app_metadata flag set by
  //    /api/users/[id]/signout. We kick off the admin revoke + flag-clear in
  //    the background so the redirect returns immediately — blocking here is
  //    what historically pushed middleware past Vercel's invocation timeout.
  if (user?.app_metadata?.force_logout_at) {
    const userId = user.id;
    const userMeta = user.app_metadata;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const adminClient = createAdminClient();
        if (session?.access_token) {
          await adminClient.auth.admin.signOut(session.access_token, "global");
        }
        await adminClient.auth.admin.updateUserById(userId, {
          app_metadata: { ...userMeta, force_logout_at: null },
        });
      } catch (err) {
        console.error("[middleware] force sign-out background error:", err);
      }
    })();

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Don't redirect away from login if they still need to change their password —
  // doing so would create a /login ↔ / redirect loop.
  if (user && isAuthRoute && !user.app_metadata?.must_change_password) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  supabaseResponse.headers.set("Content-Security-Policy", csp);

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
