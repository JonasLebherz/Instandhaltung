/**
 * app/v2/maschinen/page.js – Version 2: Maschinen
 * Die Seite selbst steht in app/_fruehversion/Maschinen.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Maschinen';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Maschinen – Instandhaltung Version 2' } };

export default function MaschinenV2(props) {
  return <Seite version="v2" {...props} />;
}
