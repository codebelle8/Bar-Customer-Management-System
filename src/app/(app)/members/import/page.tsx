import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import { ImportClient } from '@/components/members/ImportClient'
import { buttonCls } from '@/components/ui'
import { eq } from 'drizzle-orm'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { jstParts } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'

export const metadata: Metadata = { title: '会員のExcel取込' }

// 取込はスタッフ・オーナーとも可（紙の会員カードの移行は店頭で行うため）。
// 追加のみで既存の会員は上書きしない・全行をサーバーで再チェック・操作ログに記録。
// 書き出し（個人情報の一括持ち出し）はオーナーのみ。
export default async function MemberImportPage() {
  const ctx = await requireCtx()
  const [settings] = await query((tx) => tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId)), ctx)
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/members" className={buttonCls('ghost', 'sm')}><ChevronLeft className="size-4" />会員一覧</Link>
        <span className="text-[18px] font-bold">Excel・CSVから会員を取り込む</span>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-sub">
          <ShieldCheck className="size-4 text-ok" />取込先：<b className="text-ink">{ctx.store.name}</b>（会員番号の接頭辞「{ctx.store.memberPrefix}」）
        </span>
      </div>
      <ImportClient prefix={ctx.store.memberPrefix} todayJst={jstParts(new Date()).date} joinDefault={businessDateOf(new Date(), settings)} isOwner={ctx.isOwner} storeName={ctx.store.name} />
    </div>
  )
}
