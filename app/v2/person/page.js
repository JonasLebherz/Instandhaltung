/**
 * app/v2/person/page.js – Version 2: Person wählen
 * Die Seite selbst steht in app/_fruehversion/Person.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Person';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Person wählen – Instandhaltung Version 2' } };

export default function PersonV2(props) {
  return <Seite version="v2" {...props} />;
}
