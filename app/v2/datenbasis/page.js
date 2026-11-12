/**
 * app/v2/datenbasis/page.js – Version 2: Datenbasis
 * Die Seite selbst steht in app/_fruehversion/Datenbasis.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Datenbasis';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Datenbasis – Instandhaltung Version 2' } };

export default function DatenbasisV2(props) {
  return <Seite version="v2" {...props} />;
}
