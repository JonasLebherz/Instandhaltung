/**
 * middleware.js – Türsteher vor jeder Seite
 *
 * Läuft bei jedem Seitenaufruf, bevor die Seite erzeugt wird:
 *  1. frischt die Anmeldung auf (Supabase-Cookie verlängern)
 *  2. schickt nicht angemeldete Besucher zur Login-Seite
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request) {
  // Lokaler Testbetrieb ohne Supabase (siehe .env.example)
  if (process.env.LOGIN_DEAKTIVIERT === 'true') {
    return NextResponse.next();
  }

  // Fehlen die Supabase-Zugangsdaten, lieber gar nichts anzeigen als ohne Schutz
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return new NextResponse(
      'Login nicht eingerichtet: SUPABASE_URL und SUPABASE_ANON_KEY fehlen (siehe README).',
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  let antwort = NextResponse.next({ request });

  const supabase = createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(liste) {
        liste.forEach(({ name, value }) => request.cookies.set(name, value));
        antwort = NextResponse.next({ request });
        liste.forEach(({ name, value, options }) => antwort.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const istLoginSeite = request.nextUrl.pathname.startsWith('/login');

  if (!data?.user && !istLoginSeite) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = '/login';
    ziel.search = '';
    return NextResponse.redirect(ziel);
  }
  if (data?.user && istLoginSeite) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = '/';
    ziel.search = '';
    return NextResponse.redirect(ziel);
  }
  return antwort;
}

// Für Bilder, Schriften und interne Next.js-Dateien ist keine Prüfung nötig
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
