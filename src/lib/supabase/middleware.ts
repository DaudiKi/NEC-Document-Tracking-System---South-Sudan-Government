import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const IDLE_MINUTES = 15;
export const IDLE_COOKIE = 'nec_last_active';
const PUBLIC_PREFIXES = ['/login', '/api/cron/', '/api/health', '/brand/', '/_next/', '/favicon'];

/** Refreshes the Supabase session, signs the user out after 15 minutes without a request,
 *  and sends anonymous visitors to the login screen. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (user) {
    const last = Number(request.cookies.get(IDLE_COOKIE)?.value || 0);
    if (last && Date.now() - last > IDLE_MINUTES * 60_000) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '?reason=idle';
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      redirect.cookies.delete(IDLE_COOKIE);
      return redirect;
    }
    response.cookies.set(IDLE_COOKIE, String(Date.now()), { httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
    if (path === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  } else if (!isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}
