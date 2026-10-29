/**
 * app/login/page.js – Anmeldeseite
 *
 * Oben rechts in der Karte lässt sich die Sprache wählen (Deutsch/Englisch).
 */
import LoginFormular from './LoginFormular';
import Logo from '@/components/Logo';
import SprachSchalter from '@/components/SprachSchalter';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';

export const generateMetadata = () => seitentitel('Anmelden');

export default async function LoginSeite() {
  const t = await uebersetzer();
  return (
    <div className="login-seite">
      <div className="karte login-karte">
        <div className="login-sprache"><SprachSchalter /></div>
        <div className="text-center mb-4">
          <div className="login-logo"><Logo groesse={56} /></div>
          <h1 className="h3 fw-bold mb-1">{t('Instandhaltung')}</h1>
          <p className="text-leise mb-0">{t('Bitte mit deinem Team-Konto anmelden.')}</p>
        </div>
        <LoginFormular />
      </div>
    </div>
  );
}
