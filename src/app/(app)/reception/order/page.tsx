import type { Metadata } from 'next'
import Link from 'next/link'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { ArrowLeft, ReceiptText } from 'lucide-react'
import { Card, buttonCls, cx } from '@/components/ui'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { jstParts } from '@/lib/format'
import { InStorePicker } from '../_components/InStorePicker'
import { Notice } from '../_components/bits'
import { VisitHeader } from '../_components/VisitHeader'
import { inStoreRows, loadToday, loadVisit } from '../_lib/server'
import { OrderPanel } from './OrderPanel'

export const metadata: Metadata = { title: 'ドリンク注文' }

export default async function OrderPage({ searchParams }: PageProps<'/reception/order'>) {
  const sp = await searchParams
  const ctx = await requireCtx()
  const visitId = typeof sp.visit === 'string' ? sp.visit : ''

  if (!visitId) {
    const rows = await query(async (tx) => {
      const today = await loadToday(tx, ctx.storeId)
      return inStoreRows(tx, ctx.storeId, today.businessDate, today.now)
    }, ctx)
    return (
      <div className="animate-fade-in mx-auto max-w-4xl space-y-4">
        <Card title="注文するお客様を選択" action={<Link href="/reception" className="text-[13px] font-medium text-brand">受付トップへ</Link>}>
          <InStorePicker rows={rows} hrefBase="/reception/order" actionLabel="注文" />
        </Card>
      </div>
    )
  }

  const data = await query(async (tx) => {
    const today = await loadToday(tx, ctx.storeId)
    const visit = await loadVisit(tx, ctx.storeId, visitId)
    const menu = await tx
      .select({ id: t.menuItems.id, kind: t.menuItems.kind, name: t.menuItems.name, price: t.menuItems.price })
      .from(t.menuItems)
      .where(and(eq(t.menuItems.storeId, ctx.storeId), eq(t.menuItems.active, true), inArray(t.menuItems.kind, ['drink', 'other'])))
      .orderBy(asc(t.menuItems.sort), asc(t.menuItems.name))
    return { today, visit, menu }
  }, ctx)
  const { today, visit, menu } = data
  if (!visit)
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Notice tone="error">来店記録が見つかりません。</Notice>
        <Link href="/reception/order" className={buttonCls('default', 'lg')}>お客様を選び直す</Link>
      </div>
    )
  const v = visit.v
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/reception/order" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-brand"><ArrowLeft className="size-4" />お客様を選び直す</Link>
      </div>
      <VisitHeader
        memberNo={visit.memberNo} handle={visit.handle} partnerNo={visit.partnerNo} partnerHandle={visit.partnerHandle} category={v.category}
        time={jstParts(v.checkedInAt).time} minutes={Math.round((today.now.getTime() - v.checkedInAt.getTime()) / 60000)}
        businessDate={v.businessDate} today={today.businessDate} status={v.status} auto={v.autoCheckout} isNew={v.isNew}
        action={v.status === 'in' && (
          <Link href={`/reception/checkout?visit=${v.id}`} className={cx(buttonCls('outline', 'lg'), 'h-14')}><ReceiptText className="size-5" />退店・精算へ</Link>
        )}
      />
      <OrderPanel
        visitId={v.id}
        menu={menu}
        canEdit={v.status === 'in'}
        items={visit.items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, unitPrice: i.unitPrice, amount: i.amount, time: jstParts(i.createdAt).time, kind: i.kind }))}
      />
    </div>
  )
}
