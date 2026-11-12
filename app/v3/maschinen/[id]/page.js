/**
 * app/v3/maschinen/[id]/page.js – Version 3: Maschine
 * Die Seite selbst steht in app/_fruehversion/Maschine.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Maschine';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Maschine – Instandhaltung Version 3' } };

export default function MaschineV3(props) {
  return <Seite version="v3" {...props} />;
}
