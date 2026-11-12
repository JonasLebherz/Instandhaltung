/**
 * app/v3/lager/page.js – Version 3: Lager
 * Die Seite selbst steht in app/_fruehversion/Lager.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Lager';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Lager – Instandhaltung Version 3' } };

export default function LagerV3(props) {
  return <Seite version="v3" {...props} />;
}
