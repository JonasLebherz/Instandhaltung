/**
 * lib/supabase/server.js – Supabase-Zugang für das Login (nur auf dem Server)
 *
 * Supabase übernimmt die Benutzerverwaltung: Passwörter werden dort sicher
 * gespeichert, die Anmeldung wird über ein Cookie im Browser gemerkt.
 * Die Daten der Anwendung (Maschinen, Meldungen …) laufen NICHT über diesen
 * Zugang, sondern direkt über lib/db.js.
 */
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supabaseServer() {
  const cookieSpeicher = await cookies();

  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieSpeicher.getAll();
      },
      setAll(liste) {
        // In reinen Anzeige-Seiten dürfen keine Cookies gesetzt werden.
        // Das ist unkritisch: Die Middleware frischt die Anmeldung ohnehin auf.
        try {
          liste.forEach(({ name, value, options }) => cookieSpeicher.set(name, value, options));
        } catch {
          /* ignorieren */
        }
      },
    },
  });
}
