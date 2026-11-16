import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { ThemeToggle } from '@/components/theme'
import { THEME_COOKIE, parseThemePref } from '@/lib/theme'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'ログイン' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams
  const themePref = parseThemePref((await cookies()).get(THEME_COOKIE)?.value)
  const next = typeof sp.next === 'string' ? sp.next : ''
  // 確認用アカウントの案内は手元の開発環境（組み込み DB）のときだけ表示。公開環境ではアカウントを個別にお知らせする
  const demo = !process.env.DATABASE_URL && (process.env.SEED_MODE ?? 'demo') === 'demo'
  return (
    <main className="flex min-h-screen">
      <section className="relative hidden flex-1 overflow-hidden bg-side lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/interior.jpg" alt="" className="absolute inset-0 size-full object-cover object-[70%_50%] opacity-75" />
        <div className="absolute inset-0 bg-gradient-to-br from-side/90 via-side-2/45 to-side/70" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-white.png" alt="HARNES TOKYO" className="w-[260px]" />
          <div>
            <p className="text-[28px] leading-snug font-bold">会員・来店受付・売上管理</p>
            <p className="mt-3 text-[14px] text-[#d9cff0]">店舗スタッフ・オーナー専用の管理画面です。</p>
          </div>
        </div>
      </section>
      <section className="relative flex flex-1 items-center justify-center bg-page px-5 py-10">
        <ThemeToggle initial={themePref} className="absolute top-4 right-4" />
        <div className="w-full max-w-[400px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-dark.png" alt="HARNES TOKYO" className="theme-light-only mx-auto mb-8 w-[200px] lg:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-white.png" alt="HARNES TOKYO" className="theme-dark-only mx-auto mb-8 w-[200px] lg:hidden" />
          <div className="card p-8">
            <h1 className="text-[22px] font-bold">ログイン</h1>
            <p className="mt-1 text-[13px] text-sub">発行されたIDとパスワードを入力してください。</p>
            <LoginForm next={next} />
          </div>
          {demo && (
            <div className="mt-5 rounded-xl border border-dashed border-brand-light bg-white/70 p-4 text-[12px] leading-relaxed text-sub">
              <p className="mb-1 font-bold text-brand">確認用アカウント（デモデータ）</p>
              <p>オーナー：owner / owner1234</p>
              <p>上野店スタッフ：ueno01 / staff1234</p>
              <p>新店スタッフ：new01 / staff1234</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
