/**
 * app/v3/karte/page.js – Version 3: Störungskarte
 * Die Seite selbst steht in app/_fruehversion/Karte.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Karte';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Störungskarte – Instandhaltung Version 3' } };

export default function KarteV3(props) {
  return <Seite version="v3" {...props} />;
}
