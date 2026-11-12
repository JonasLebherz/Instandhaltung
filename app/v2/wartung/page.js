/**
 * app/v2/wartung/page.js – Version 2: Wartungsplan
 * Die Seite selbst steht in app/_fruehversion/Wartung.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Wartung';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Wartungsplan – Instandhaltung Version 2' } };

export default function WartungV2(props) {
  return <Seite version="v2" {...props} />;
}
