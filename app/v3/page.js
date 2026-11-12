/**
 * app/v3/page.js – Version 3: Übersicht
 * Die Seite selbst steht in app/_fruehversion/Uebersicht.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Uebersicht';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Übersicht – Instandhaltung Version 3' } };

export default function UebersichtV3(props) {
  return <Seite version="v3" {...props} />;
}
