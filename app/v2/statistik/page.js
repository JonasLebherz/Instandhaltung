/**
 * app/v2/statistik/page.js – Version 2: Statistik
 * Die Seite selbst steht in app/_fruehversion/Statistik.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Statistik';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Statistik – Instandhaltung Version 2' } };

export default function StatistikV2(props) {
  return <Seite version="v2" {...props} />;
}
