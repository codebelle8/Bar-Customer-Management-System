import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Lock } from 'lucide-react'
import { buttonCls, cx, inputCls } from '@/components/ui'
import { gateEnabled, safeNext } from '@/lib/gate'

export const metadata: Metadata = { title: 'アクセス制限' }

// 確認用の公開環境で、ログイン画面より前に表示するパスワード入力
export default async function GatePage({ searchParams }: PageProps<'/gate'>) {
  const sp = await searchParams
  const next = safeNext(typeof sp.next === 'string' ? sp.next : '')
  if (!gateEnabled()) redirect(next)
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-5">
      <div className="card w-full max-w-[380px] p-8">
        <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Lock className="size-5" />
        </span>
        <h1 className="mt-4 text-[20px] font-bold">閲覧用パスワード</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-sub">この確認用サイトは関係者のみ閲覧できます。お知らせしたパスワードを入力してください。</p>
        <form method="post" action="/api/gate" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <input name="password" type="password" required autoFocus autoComplete="current-password" aria-label="閲覧用パスワード" className={cx(inputCls, 'h-12')} />
          {sp.error && <p role="alert" className="rounded-lg bg-[#fde7eb] px-3 py-2 text-[13px] text-up">パスワードが正しくありません</p>}
          <button className={cx(buttonCls('brand', 'lg'), 'w-full')}>次へ</button>
        </form>
      </div>
    </main>
  )
}
