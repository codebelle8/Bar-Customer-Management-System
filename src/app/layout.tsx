import type { Metadata, Viewport } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import { cookies } from 'next/headers'
import { THEME_COOKIE, THEME_INIT_SCRIPT, parseThemePref } from '@/lib/theme'
import './globals.css'

const noto = Noto_Sans_JP({ variable: '--font-noto', subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'HARNES TOKYO 管理システム', template: '%s | HARNES TOKYO' },
  description: '会員・来店受付・売上管理',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#170d26' }

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const pref = parseThemePref((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html lang="ja" className={`${noto.variable} h-full`} data-theme-pref={pref} data-theme={pref === 'dark' ? 'dark' : 'light'} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
