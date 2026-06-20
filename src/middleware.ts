import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/register', '/unauthorized', '/field', '/api/field'];
const ADMIN_ROUTES = ['/admin'];
const TENANT_ROUTES = ['/tenant'];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Allow public routes without auth
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    // Redirect logged-in users away from auth pages
    if (user && (pathname === '/login' || pathname === '/register')) {
      const role = await getUserRole(supabase, user.id);
      return NextResponse.redirect(new URL(getRoleHome(role), request.url));
    }
    return supabaseResponse;
  }

  // Root redirect
  if (pathname === '/') {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    const role = await getUserRole(supabase, user.id);
    return NextResponse.redirect(new URL(getRoleHome(role), request.url));
  }

  // Require authentication for all other routes
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = await getUserRole(supabase, user.id);

  // Guard admin routes
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r)) && role !== 'admin') {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  // Guard tenant routes
  if (TENANT_ROUTES.some((r) => pathname.startsWith(r)) && role !== 'tenant') {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  return supabaseResponse;
}

async function getUserRole(
  supabase: ReturnType<typeof createServerClient>,
  authId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', authId)
    .single();
  return data?.role ?? null;
}

function getRoleHome(role: string | null): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'tenant') return '/tenant/dashboard';
  return '/login';
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
