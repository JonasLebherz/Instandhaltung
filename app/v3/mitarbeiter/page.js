/**
 * app/v3/mitarbeiter/page.js – Version 3: Mitarbeiter
 * Die Seite selbst steht in app/_fruehversion/Mitarbeiter.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Mitarbeiter';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Mitarbeiter – Instandhaltung Version 3' } };

export default function MitarbeiterV3(props) {
  return <Seite version="v3" {...props} />;
}
