import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 管理画面はすべてログイン後のリクエスト単位で描画するため、Cache Components は使わない（従来モデル）
  poweredByHeader: false,
  // 開発用の組み込み PostgreSQL（PGlite）は WASM を含むためバンドル対象から外す
  serverExternalPackages: ['@electric-sql/pglite'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig
