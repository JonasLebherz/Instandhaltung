/**
 * app/v2/lager/page.js – Version 2: Lager
 * Die Seite selbst steht in app/_fruehversion/Lager.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Lager';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Lager – Instandhaltung Version 2' } };

export default function LagerV2(props) {
  return <Seite version="v2" {...props} />;
}
