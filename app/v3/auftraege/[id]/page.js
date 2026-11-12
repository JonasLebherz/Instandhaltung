/**
 * app/v3/auftraege/[id]/page.js – Version 3: Auftrag
 * Die Seite selbst steht in app/_fruehversion/Auftrag.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Auftrag';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Auftrag – Instandhaltung Version 3' } };

export default function AuftragV3(props) {
  return <Seite version="v3" {...props} />;
}
