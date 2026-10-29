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

export async function anmelden(vorherigerZustand, formular) {
  const email = String(formular.get('email') ?? '').trim();
  const passwort = String(formular.get('passwort') ?? '');

  if (!email || !passwort) {
    return { fehler: 'Bitte E-Mail-Adresse und Passwort eingeben.', email };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: passwort });
  if (error) {
    // Absichtlich ungenau: verrät nicht, ob es die E-Mail-Adresse gibt
    return { fehler: 'E-Mail-Adresse oder Passwort ist falsch.', email };
  }

  revalidatePath('/', 'layout');  // Navigation mit Benutzername neu aufbauen
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
