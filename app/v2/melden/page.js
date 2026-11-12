/**
 * app/v2/melden/page.js – Version 2: Störung melden
 * Die Seite selbst steht in app/_fruehversion/Melden.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Melden';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Störung melden – Instandhaltung Version 2' } };

export default function MeldenV2(props) {
  return <Seite version="v2" {...props} />;
}
