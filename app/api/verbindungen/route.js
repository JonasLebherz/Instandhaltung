/**
 * app/api/verbindungen/route.js – Live-Prüfung aller Verbindungen (für die Seite "Datenbasis")
 *
 * Prüft gleichzeitig:
 *  - Supabase-Datenbank: Abfrage mit Zeitmessung, Region und Verbindungsart (Port)
 *  - Supabase-Login:     Gesundheits-Schnittstelle des Login-Dienstes
 *  - Vercel:             läuft diese App dort? In welcher Region?
 *  - GitHub:             ist der Code dort und wird er über Vercel veröffentlicht?
 *
 * Jede Prüfung liefert { status: 'ok' | 'warnung' | 'fehler' | 'unbekannt', … }.
 * Es werden nie Zugangsdaten ausgegeben – nur Regionen und Zeiten.
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer, loginAktiv } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Führt eine Prüfung aus, misst die Zeit und fängt Fehler ab */
async function pruefen(aufgabe) {
  const start = Date.now();
  try {
    return { ...(await aufgabe()), ms: Date.now() - start };
  } catch (fehler) {
    return { status: 'fehler', meldung: fehler.message?.slice(0, 160) ?? String(fehler), ms: Date.now() - start };
  }
}

/** Region und Art der Datenbankverbindung aus DATABASE_URL – ohne Benutzer und Passwort */
function datenbankAdresse() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    const region = url.hostname.match(/aws-\d+-([a-z]+-[a-z]+-\d+)/)?.[1] ?? null;
    const lokal = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
    const art = lokal ? 'lokal' : url.port === '6543' ? 'transaction' : url.port === '5432' ? 'session' : 'unbekannt';
    return { region, art, port: url.port };
  } catch {
    return { region: null, art: 'unbekannt', port: null };
  }
}

/** GitHub-Abfrage mit kurzer Wartezeit; Antworten werden 5 Minuten zwischengespeichert (Limit der API) */
async function github(pfad) {
  const antwort = await fetch(`https://api.github.com${pfad}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'instandhaltung-datenbasis' },
    signal: AbortSignal.timeout(3500),
    next: { revalidate: 300 },
  });
  return antwort;
}

export async function GET() {
  if (!(await aktuellerBenutzer())) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });

  const env = process.env;
  const repo = env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` : null;
  const zweig = env.VERCEL_GIT_COMMIT_REF ?? null;
  const veroeffentlicht = env.VERCEL_GIT_COMMIT_SHA ?? null;

  const [datenbank, login, githubStand] = await Promise.all([
    // 1. Datenbank
    pruefen(async () => {
      const [z] = await sql`SELECT current_setting('server_version') AS version, pg_database_size(current_database())::bigint AS groesse`;
      const adresse = datenbankAdresse();
      return {
        status: adresse.art === 'session' ? 'warnung' : 'ok',
        version: z.version, groesse: Number(z.groesse), ...adresse,
      };
    }),

    // 2. Login (Supabase Auth)
    pruefen(async () => {
      if (!loginAktiv()) return { status: 'warnung', grund: 'deaktiviert' };
      const antwort = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: env.SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(3500), cache: 'no-store',
      });
      if (!antwort.ok) return { status: 'fehler', meldung: `HTTP ${antwort.status}` };
      const daten = await antwort.json();
      return { status: 'ok', version: daten.version ?? null };
    }),

    // 3. GitHub: neuester Stand des Zweigs (nur bei öffentlichem Repository lesbar)
    pruefen(async () => {
      if (!repo) return { status: 'unbekannt', grund: 'lokal' };
      const antwort = await github(`/repos/${repo}/commits?sha=${encodeURIComponent(zweig ?? '')}&per_page=1`);
      if (antwort.status === 404) return { status: 'unbekannt', grund: 'privat' };
      if (antwort.status === 403 || antwort.status === 429) return { status: 'unbekannt', grund: 'limit' };
      if (!antwort.ok) return { status: 'fehler', meldung: `HTTP ${antwort.status}` };
      const [neuester] = await antwort.json();
      return { status: !veroeffentlicht || neuester?.sha === veroeffentlicht ? 'ok' : 'warnung' };
    }),
  ]);

  // Vercel: Angaben stellt Vercel selbst als Umgebungsvariablen bereit
  const vercel = env.VERCEL ? { status: 'ok', region: env.VERCEL_REGION ?? null } : { status: 'warnung', grund: 'lokal' };

  // Privat oder Abfragegrenze: GitHub ist trotzdem verbunden, wenn Vercel einen veröffentlichten Stand kennt
  const githubErgebnis = githubStand.grund === 'privat' || githubStand.grund === 'limit'
    ? { ...githubStand, status: veroeffentlicht ? 'ok' : 'unbekannt' } : githubStand;

  return Response.json({
    zeit: new Date().toISOString(),
    knoten: { github: githubErgebnis, vercel, datenbank, login },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
