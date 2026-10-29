/**
 * next.config.mjs – Einstellungen für Next.js
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Kein "X-Powered-By: Next.js"-Header nach außen
  poweredByHeader: false,

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
