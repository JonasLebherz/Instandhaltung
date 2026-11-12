/**
 * app/v2/auftraege/page.js – Version 2: Aufträge
 * Die Seite selbst steht in app/_fruehversion/Auftraege.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Auftraege';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Aufträge – Instandhaltung Version 2' } };

export default function AuftraegeV2(props) {
  return <Seite version="v2" {...props} />;
}
