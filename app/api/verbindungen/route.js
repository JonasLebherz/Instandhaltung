/**
 * app/api/verbindungen/route.js – Live-Prüfung aller Verbindungen (für die Seite "Datenbasis")
 *
 * Prüft gleichzeitig:
 *  - Supabase-Datenbank: Abfrage mit Zeitmessung, Region und Verbindungsart (Port)
 *  - Supabase-Login:     Gesundheits-Schnittstelle des Login-Dienstes
 *  - Vercel:             läuft diese App dort? Welcher Stand (Commit) ist veröffentlicht?
 *  - GitHub:             neuester Stand im Repository (nur bei öffentlichem Repository lesbar)
 *  - Claude / Codex:     Anteil der letzten Commits, die von KI-Assistenten stammen
 *  - Power BI:           sind die Views für Power BI vorhanden?
 *
 * Jede Prüfung liefert { status: 'ok' | 'warnung' | 'fehler' | 'unbekannt', … }.
 * Es werden nie Zugangsdaten ausgegeben – nur Regionen, Zeiten und Commit-Infos.
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

  const [datenbank, login, githubStand, powerbi] = await Promise.all([
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

    // 3. GitHub: neuester Commit des Zweigs und die letzten Commits (für Claude/Codex)
    pruefen(async () => {
      if (!repo) return { status: 'unbekannt', grund: 'lokal' };
      const antwort = await github(`/repos/${repo}/commits?sha=${encodeURIComponent(zweig ?? '')}&per_page=30`);
      if (antwort.status === 404) return { status: 'unbekannt', grund: 'privat', repo, zweig };
      if (antwort.status === 403 || antwort.status === 429) return { status: 'unbekannt', grund: 'limit', repo, zweig };
      if (!antwort.ok) return { status: 'fehler', meldung: `HTTP ${antwort.status}`, repo, zweig };
      const commits = (await antwort.json()).map((c) => ({
        sha: c.sha, nachricht: c.commit?.message ?? '', datum: c.commit?.committer?.date ?? null,
      }));
      return { status: 'ok', repo, zweig, commits };
    }),

    // 4. Power BI: Views vorhanden?
    pruefen(async () => {
      const views = await sql`
        SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'v' ORDER BY c.relname`;
      return { status: views.length > 0 ? 'ok' : 'warnung', views: views.map((v) => v.name) };
    }),
  ]);

  // Vercel: Angaben stellt Vercel selbst als Umgebungsvariablen bereit
  const vercel = env.VERCEL
    ? {
      status: 'ok', umgebung: env.VERCEL_ENV ?? null, region: env.VERCEL_REGION ?? null,
      commit: veroeffentlicht, nachricht: (env.VERCEL_GIT_COMMIT_MESSAGE ?? '').split('\n')[0] || null,
      autor: env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN ?? env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? null, repo, zweig,
    }
    : { status: 'warnung', grund: 'lokal' };

  // GitHub → Vercel: Ist der neueste Stand von GitHub schon veröffentlicht?
  let githubErgebnis = { ...githubStand };
  if (githubStand.status === 'ok') {
    const neuester = githubStand.commits[0];
    githubErgebnis = {
      status: !veroeffentlicht || neuester?.sha === veroeffentlicht ? 'ok' : 'warnung',
      repo, zweig, ms: githubStand.ms,
      neuester: neuester ? { sha: neuester.sha, nachricht: neuester.nachricht.split('\n')[0], datum: neuester.datum } : null,
      aktuell: !veroeffentlicht || neuester?.sha === veroeffentlicht,
    };
  } else if (githubStand.grund === 'privat' || githubStand.grund === 'limit') {
    // Privat oder Limit: GitHub ist trotzdem verbunden, wenn Vercel einen Commit kennt
    githubErgebnis = { ...githubStand, status: veroeffentlicht ? 'ok' : 'unbekannt' };
  }

  // Claude & Codex: Wer hat die letzten Commits geschrieben? (Kennung in der Commit-Nachricht)
  const commits = githubStand.commits ?? [];
  const vonClaude = commits.filter((c) => /claude/i.test(c.nachricht));
  const vonCodex = commits.filter((c) => /codex/i.test(c.nachricht));
  const ki = commits.length > 0
    ? {
      status: vonClaude.length + vonCodex.length > 0 ? 'ok' : 'unbekannt',
      anzahl: commits.length, claude: vonClaude.length, codex: vonCodex.length,
      zuletzt: vonClaude[0]?.datum ?? vonCodex[0]?.datum ?? null,
    }
    : {
      status: /claude|codex/i.test(env.VERCEL_GIT_COMMIT_MESSAGE ?? '') ? 'ok' : 'unbekannt',
      grund: repo ? 'nur-vercel' : 'lokal',
      letzterVonKi: /claude|codex/i.test(env.VERCEL_GIT_COMMIT_MESSAGE ?? ''),
    };

  return Response.json({
    zeit: new Date().toISOString(),
    knoten: { ki, github: githubErgebnis, vercel, datenbank, login, powerbi },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
