/**
 * app/v2/page.js – Version 2: Übersicht
 * Die Seite selbst steht in app/_fruehversion/Uebersicht.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Uebersicht';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Übersicht – Instandhaltung Version 2' } };

export default function UebersichtV2(props) {
  return <Seite version="v2" {...props} />;
}
