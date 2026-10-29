'use server';
/**
 * app/login/aktionen.js – Anmelden und Abmelden (Server-Aktionen)
 *
 * Die Prüfung von E-Mail und Passwort übernimmt Supabase. Ein Konto legt
 * der Projektverantwortliche in Supabase unter Authentication → Users an
 * (eine öffentliche Registrierung gibt es bewusst nicht).
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { uebersetzer } from '@/lib/sprache/server';

export async function anmelden(vorherigerZustand, formular) {
  const t = await uebersetzer();
  const email = String(formular.get('email') ?? '').trim();
  const passwort = String(formular.get('passwort') ?? '');

  if (!email || !passwort) {
    return { fehler: t('Bitte E-Mail-Adresse und Passwort eingeben.'), email };
  }

  let error;
  try {
    const supabase = await supabaseServer();
    ({ error } = await supabase.auth.signInWithPassword({ email, password: passwort }));
  } catch (ausnahme) {
    error = ausnahme;
  }

  if (error) {
    // Genaue Ursache nur ins Server-Protokoll (bei Vercel unter "Logs" sichtbar)
    console.error('Anmeldung fehlgeschlagen:', error.code ?? '', error.status ?? '', error.message);

    if (error.code === 'invalid_credentials') {
      // Absichtlich ungenau: verrät nicht, ob es die E-Mail-Adresse gibt
      return { fehler: t('E-Mail-Adresse oder Passwort ist falsch.'), email };
    }
    if (error.code === 'email_not_confirmed') {
      return { fehler: t('Dieses Konto ist noch nicht bestätigt. In Supabase beim Anlegen „Auto Confirm User“ anhaken.'), email };
    }
    // Alles andere ist meist ein Einrichtungsproblem (falsche URL oder falscher Schlüssel)
    return {
      fehler: `${t('Anmeldung zurzeit nicht möglich – die Verbindung zu Supabase ist fehlerhaft eingerichtet (SUPABASE_URL / SUPABASE_ANON_KEY prüfen). Technischer Hinweis:')} `
        + `${error.status ?? ''} ${error.code ?? error.message ?? ''}`.trim(),
      email,
    };
  }

  revalidatePath('/', 'layout');  // Seitenleiste mit Benutzername neu aufbauen
  redirect('/');
}

export async function abmelden() {
  if (process.env.LOGIN_DEAKTIVIERT !== 'true') {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  revalidatePath('/', 'layout');
  redirect('/login');
}
