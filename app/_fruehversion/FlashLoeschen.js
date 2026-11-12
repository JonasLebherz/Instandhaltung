'use client';
/**
 * app/_fruehversion/FlashLoeschen.js – löscht das Cookie „flash“, nachdem der Rahmen die Hinweise angezeigt hat
 * (sonst erschienen sie später noch einmal in der aktuellen App).
 */
import { useEffect } from 'react';

export default function FlashLoeschen() {
  useEffect(() => { document.cookie = 'flash=; Max-Age=0; path=/'; }, []);
  return null;
}
