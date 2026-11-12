/**
 * app/v2/auftraege/[id]/page.js – Version 2: Auftrag
 * Die Seite selbst steht in app/_fruehversion/Auftrag.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Auftrag';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Auftrag – Instandhaltung Version 2' } };

export default function AuftragV2(props) {
  return <Seite version="v2" {...props} />;
}
