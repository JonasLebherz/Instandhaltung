/**
 * app/login/page.js – Anmeldeseite
 */
import LoginFormular from './LoginFormular';

export const metadata = { title: 'Anmelden' };

export default function LoginSeite() {
  return (
    <div className="login-seite">
      <div className="karte login-karte">
        <div className="text-center mb-4">
          <div className="marke-symbol" aria-hidden="true"><i className="bi bi-wrench-adjustable" /></div>
          <h1 className="h3 fw-bold mb-1">Instandhaltung</h1>
          <p className="text-leise mb-0">Bitte mit deinem Team-Konto anmelden.</p>
        </div>
        <LoginFormular />
      </div>
    </div>
  );
}
