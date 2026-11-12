/**
 * app/v3/maschinen/page.js – Version 3: Maschinen
 * Die Seite selbst steht in app/_fruehversion/Maschinen.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Maschinen';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Maschinen – Instandhaltung Version 3' } };

export default function MaschinenV3(props) {
  return <Seite version="v3" {...props} />;
}
