/**
 * app/v3/wartung/page.js – Version 3: Wartungsplan
 * Die Seite selbst steht in app/_fruehversion/Wartung.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Wartung';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Wartungsplan – Instandhaltung Version 3' } };

export default function WartungV3(props) {
  return <Seite version="v3" {...props} />;
}
