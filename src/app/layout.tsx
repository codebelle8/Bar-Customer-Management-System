import type { Metadata, Viewport } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import './globals.css'

const noto = Noto_Sans_JP({ variable: '--font-noto', subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'HARNES TOKYO 管理システム', template: '%s | HARNES TOKYO' },
  description: '会員・来店受付・売上管理',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#170d26' }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ja" className={`${noto.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
