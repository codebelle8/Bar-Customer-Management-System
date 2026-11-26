import type { Metadata } from 'next'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { FileText, Pencil, Printer } from 'lucide-react'
import { buttonCls } from '@/components/ui'
import { MINCHO, TermsBody } from '@/components/settings/TermsBody'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { TERMS_PLEDGE } from '@/lib/terms'

export const metadata: Metadata = { title: '会員規約' }

export default async function TermsPage() {
  const ctx = await requireCtx()
  const [s] = await query(
    (tx) => tx.select({ version: t.storeSettings.termsVersion, text: t.storeSettings.termsText }).from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId)),
    ctx,
  )
  return (
    <div className="animate-fade-in mx-auto max-w-[920px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-sub">
          {ctx.store.name}・版 <b className="font-mono text-ink">{s.version}</b>
          <span className="ml-2 hidden text-mute sm:inline">新規入会の際に、この規約の内容を確認していただきます。</span>
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {ctx.isOwner && (
            <Link href="/settings?tab=terms" className={buttonCls('default')}><Pencil className="size-4" />規約を編集</Link>
          )}
          <a href="/docs/terms-original.pdf" target="_blank" rel="noopener" className={buttonCls('outline')}><FileText className="size-4" />原本（PDF）</a>
          <Link href="/print/terms" target="_blank" className={buttonCls('brand')}><Printer className="size-4" />印刷用の用紙を開く</Link>
        </div>
      </div>

      {/* 紙の原本に合わせた表示 */}
      <article className="card px-6 py-8 sm:px-12 sm:py-10" style={{ fontFamily: MINCHO, fontFeatureSettings: 'normal' }}>
        <h2 className="mb-5 text-center text-[22px] font-bold tracking-[0.15em] underline decoration-1 underline-offset-[6px]">会員規約</h2>
        {s.text.trim() ? (
          <TermsBody text={s.text} className="text-[14.5px] leading-[2] text-[#222]" />
        ) : (
          <p className="py-10 text-center text-[14px] text-mute">会員規約が設定されていません</p>
        )}
        <p className="mt-8 border-t border-line pt-6 text-[17px] font-bold leading-relaxed">{TERMS_PLEDGE}</p>
      </article>
    </div>
  )
}
