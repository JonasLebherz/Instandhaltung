'use client';
/**
 * app/login/LoginFormular.js – Formular mit E-Mail und Passwort
 */
import { useActionState } from 'react';
import { anmelden } from './aktionen';
import SpeichernKnopf from '@/components/SpeichernKnopf';

export default function LoginFormular() {
  const [zustand, aktion] = useActionState(anmelden, { fehler: null, email: '' });

  return (
    <form action={aktion} noValidate>
      {zustand.fehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <i className="bi bi-x-circle-fill" aria-hidden="true" />
          <span className="hinweis-text">{zustand.fehler}</span>
        </div>
      )}
      <div className="mb-3">
        <label htmlFor="email" className="form-label">E-Mail-Adresse</label>
        <input id="email" name="email" type="email" className="form-control" autoComplete="username"
               defaultValue={zustand.email} required autoFocus />
      </div>
      <div className="mb-4">
        <label htmlFor="passwort" className="form-label">Passwort</label>
        <input id="passwort" name="passwort" type="password" className="form-control"
               autoComplete="current-password" required />
      </div>
      <SpeichernKnopf className="btn btn-primary w-100 btn-gross" ladeText="Anmelden …">Anmelden</SpeichernKnopf>
    </form>
  );
}
