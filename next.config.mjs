/**
 * next.config.mjs – Einstellungen für Next.js
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Kein "X-Powered-By: Next.js"-Header nach außen
  poweredByHeader: false,

  // Fotos zu Störmeldungen gehen über Server-Aktionen. Der Browser verkleinert sie vorher
  // (höchstens 1280 px, JPEG); bis zu 3 Fotos passen so sicher unter 5 MB (Vercel erlaubt 4,5 MB
  // je Anfrage – die verkleinerten Fotos bleiben weit darunter).
  experimental: { serverActions: { bodySizeLimit: '5mb' } },

  // Alte Adressen der Störungskarte (vor der Zoom-Karte) leiten auf die neue Karte um.
  // Ein angehängtes ?maschine=12 wird automatisch mitgenommen.
  async redirects() {
    return [
      { source: '/karte/:werk/:halle', destination: '/karte?werk=:werk&halle=:halle', permanent: false },
      { source: '/karte/:werk', destination: '/karte?werk=:werk', permanent: false },
    ];
  },

  // Zusätzliche Sicherheits-Header für alle Seiten
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
