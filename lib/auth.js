/**
 * lib/auth.js – Wer ist angemeldet?
 *
 * Jede Seite und jede Aktion, die Daten liest oder ändert, ruft
 * benutzerPflicht() auf. Ist niemand angemeldet, geht es zur Login-Seite.
 * (Die Middleware prüft das zusätzlich schon vorher – doppelt hält besser.)
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase/server';

/** Ist das Login aktiv? Nur für lokale Tests darf es abgeschaltet werden. */
export function loginAktiv() {
  return process.env.LOGIN_DEAKTIVIERT !== 'true';
}

/** Liefert den angemeldeten Benutzer oder null */
// cache(): Layout und Seite fragen beide nach dem Benutzer. Innerhalb einer
// Anfrage wird Supabase dadurch nur einmal gefragt statt mehrmals.
export const aktuellerBenutzer = cache(async () => {
  if (!loginAktiv()) {
    return { email: 'test@lokal', anzeigename: 'Lokaler Test' };
  }
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return null;

  const user = data.user;
  // Anzeigename: aus den Benutzerdaten in Supabase oder aus der E-Mail-Adresse
  const anzeigename = user.user_metadata?.name
    || user.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\p{L}/gu, (b) => b.toUpperCase());
  return { email: user.email, anzeigename };
});

/** Wie aktuellerBenutzer(), leitet aber zur Login-Seite weiter, wenn niemand angemeldet ist */
export async function benutzerPflicht() {
  const benutzer = await aktuellerBenutzer();
  if (!benutzer) redirect('/login');
  return benutzer;
}
