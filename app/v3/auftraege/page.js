/**
 * app/v3/auftraege/page.js – Version 3: Aufträge
 * Die Seite selbst steht in app/_fruehversion/Auftraege.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Auftraege';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Aufträge – Instandhaltung Version 3' } };

export default function AuftraegeV3(props) {
  return <Seite version="v3" {...props} />;
}
