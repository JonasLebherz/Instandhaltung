/**
 * app/v3/datenbasis/page.js – Version 3: Datenbasis
 * Die Seite selbst steht in app/_fruehversion/Datenbasis.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Datenbasis';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Datenbasis – Instandhaltung Version 3' } };

export default function DatenbasisV3(props) {
  return <Seite version="v3" {...props} />;
}
