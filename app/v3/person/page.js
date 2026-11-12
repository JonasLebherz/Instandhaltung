/**
 * app/v3/person/page.js – Version 3: Person wählen
 * Die Seite selbst steht in app/_fruehversion/Person.js (gemeinsam für Version 2 und 3).
 */
import Seite from '@/app/_fruehversion/Person';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Person wählen – Instandhaltung Version 3' } };

export default function PersonV3(props) {
  return <Seite version="v3" {...props} />;
}
