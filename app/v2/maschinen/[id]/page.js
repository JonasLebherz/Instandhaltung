/**
 * app/v2/maschinen/[id]/page.js – Version 2: Maschine
 * Die Seite selbst steht in app/_fruehversion/Maschine.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Maschine';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Maschine – Instandhaltung Version 2' } };

export default function MaschineV2(props) {
  return <Seite version="v2" {...props} />;
}
