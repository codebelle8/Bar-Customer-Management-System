import type { Metadata } from 'next'
import Link from 'next/link'
import { and, asc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { ArrowLeft, CircleCheckBig, GlassWater, House, ReceiptText } from 'lucide-react'
import { Card, buttonCls, cx } from '@/components/ui'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { fmtDateTime, fmtJaDate, fmtTime, jstParts } from '@/lib/format'
import { InStorePicker } from '../_components/InStorePicker'
import { MoneyRow, Notice } from '../_components/bits'
import { VisitHeader } from '../_components/VisitHeader'
import { inStoreRows, isUuid, loadToday, loadVisit, PART_LABEL } from '../_lib/server'
import { CheckoutPanel } from './CheckoutPanel'
import { VoidPanel } from './VoidPanel'

export const metadata: Metadata = { title: '退店・追加精算' }

export default async function CheckoutPage({ searchParams }: PageProps<'/reception/checkout'>) {
  const sp = await searchParams
  const ctx = await requireCtx()
  if (typeof sp.done === 'string') return <Done id={sp.done} paid={typeof sp.paid === 'string' ? +sp.paid : null} />
  const visitId = typeof sp.visit === 'string' ? sp.visit : ''

  if (!visitId) {
    const rows = await query(async (tx) => {
      const today = await loadToday(tx, ctx.storeId)
      return inStoreRows(tx, ctx.storeId, today.businessDate, today.now)
    }, ctx)
    return (
      <div className="animate-fade-in mx-auto max-w-4xl space-y-4">
        <Card title="退店するお客様を選択" action={<Link href="/reception" className="text-[13px] font-medium text-brand">受付トップへ</Link>}>
          <InStorePicker rows={rows} hrefBase="/reception/checkout" actionLabel="精算" />
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
      .where(and(eq(t.menuItems.storeId, ctx.storeId), eq(t.menuItems.active, true)))
      .orderBy(asc(t.menuItems.sort), asc(t.menuItems.name))
    const [staff] = visit?.v.staffId ? await tx.select({ name: t.users.name }).from(t.users).where(eq(t.users.id, visit.v.staffId)) : []
    return { today, visit, menu, staffName: staff?.name ?? null }
  }, ctx)
  const { today, visit, menu } = data
  if (!visit)
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Notice tone="error">来店記録が見つかりません。</Notice>
        <Link href="/reception/checkout" className={buttonCls('default', 'lg')}>お客様を選び直す</Link>
      </div>
    )
  const v = visit.v
  const minutes = Math.max(0, Math.round((today.now.getTime() - v.checkedInAt.getTime()) / 60000))
  const items = visit.items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, unitPrice: i.unitPrice, amount: i.amount, time: jstParts(i.createdAt).time, kind: i.kind }))
  const note = v.note.split('\n').filter((l) => !l.startsWith('【取消】')).join('\n')
  const canVoid = v.status !== 'void'&& (ctx.isOwner || v.businessDate === today.businessDate)

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-5">
      <Link href="/reception/checkout" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-brand"><ArrowLeft className="size-4" />お客様を選び直す</Link>
      <VisitHeader
        memberNo={visit.memberNo} handle={visit.handle} partnerNo={visit.partnerNo} partnerHandle={visit.partnerHandle} category={v.category}
        time={jstParts(v.checkedInAt).time} minutes={minutes} businessDate={v.businessDate} today={today.businessDate} status={v.status} isNew={v.isNew}
        action={v.status === 'in' && (
          <Link href={`/reception/order?visit=${v.id}`} className={cx(buttonCls('outline', 'lg'), 'h-14')}><GlassWater className="size-5" />ドリンク注文</Link>
        )}
      />

      <Card title="入店時のお支払い（精算済み）" action={<span className="text-[12px] text-sub">{fmtJaDate(v.businessDate)}・{v.dayType}・{PART_LABEL[v.dayPart]}{data.staffName ? `・受付 ${data.staffName}` : ''}</span>}>
        <div className="divide-y divide-line">
          <MoneyRow label={`入場料（${v.category}）`} amount={v.entranceFee} />
          {v.discount > 0 && <MoneyRow label="リピーター割引" amount={-v.discount} note={v.discountReason} />}
          {v.joinFee > 0 && <MoneyRow label="入会金" amount={v.joinFee} />}
          {v.annualFee > 0 && <MoneyRow label="年会費" amount={v.annualFee} />}
          <MoneyRow label="入店時 お支払い済み" amount={v.entryTotal} strong />
        </div>
        {note && <p className="mt-2 rounded-lg bg-page px-3 py-2 text-[12px] whitespace-pre-wrap text-sub">備考：{note}</p>}
      </Card>

      {v.status === 'in' ? (
        <CheckoutPanel
          visitId={v.id}
          unpaid={items}
          extensions={menu.filter((m) => m.kind === 'extension')}
          drinks={menu.filter((m) => m.kind !== 'extension')}
          isOwner={ctx.isOwner}
          minutes={minutes}
        />
      ) : (
        <Card title={v.status === 'out' ? '退店・精算済み' : '取消済み'}>
          {v.status === 'out' && (
            <div className="divide-y divide-line">
              {items.map((i) => <MoneyRow key={i.id} label={`${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`} amount={i.amount} note={i.time} />)}
              <MoneyRow label={`退店時 精算額（${fmtTime(v.checkedOutAt)} 退店）`} amount={v.extraTotal} strong />
            </div>
          )}
          {v.status === 'void' && <p className="text-[14px] whitespace-pre-wrap text-sub">{v.note}</p>}
        </Card>
      )}

      {v.status !== 'void' && (
        <Card title="来店の取消" className="border-[#f6dbe0]">
          <p className="mb-3 text-[13px] text-sub">間違えて受付した来店を取消します（売上・人数から除外）。{ctx.isOwner ? 'オーナーはすべての来店を取消できます。' : 'スタッフは本日の営業日の来店のみ取消できます。'}</p>
          <VoidPanel visitId={v.id} canVoid={canVoid} deniedReason={`この来店は ${fmtJaDate(v.businessDate)} の営業日のため、スタッフは取消できません。オーナーに依頼してください。`} />
        </Card>
      )}
    </div>
  )
}

async function Done({ id, paid }: { id: string; paid: number | null }) {
  const ctx = await requireCtx()
  const partner = alias(t.members, 'partner')
  const r = isUuid(id)
    ? await query(async (tx) => {
        const [row] = await tx
          .select({ v: t.visits, no: t.members.memberNo, handle: t.members.handleName, pNo: partner.memberNo, pHandle: partner.handleName })
          .from(t.visits)
          .innerJoin(t.members, eq(t.members.id, t.visits.memberId))
          .leftJoin(partner, eq(partner.id, t.visits.partnerMemberId))
          .where(and(eq(t.visits.id, id), eq(t.visits.storeId, ctx.storeId)))
        if (!row) return null
        const items = await tx.select().from(t.visitItems).where(eq(t.visitItems.visitId, id)).orderBy(asc(t.visitItems.createdAt))
        return { ...row, items }
      }, ctx)
    : null
  if (!r) return <Notice tone="error">精算内容が見つかりません。<Link href="/reception" className="ml-2 font-bold underline">受付トップへ</Link></Notice>
  const v = r.v
  const change = paid != null && Number.isFinite(paid) ? paid - v.extraTotal : null
  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-5">
      <section className="card overflow-hidden">
        <div className="flex items-center gap-4 bg-gradient-to-br from-[#1f9d57] to-[#178048] px-6 py-6 text-white">
          <CircleCheckBig className="size-12 shrink-0" />
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-white/85">退店・精算が完了しました</p>
            <p className="truncate text-[28px] font-bold"><span className="tabular-nums">{r.no}</span>　{r.handle}</p>
            {r.pNo && <p className="truncate text-[15px] text-white/85">＋ {r.pNo} {r.pHandle}</p>}
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="mb-1 text-[12px] text-sub">{fmtTime(v.checkedInAt)} 入店 → {v.checkedOutAt ? fmtDateTime(v.checkedOutAt) : '—'} 退店</p>
          <div className="divide-y divide-line">
            {r.items.map((i) => <MoneyRow key={i.id} label={`${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`} amount={i.amount} />)}
            <div className="flex items-end justify-between py-3">
              <span className="text-[16px] font-bold">退店時のお会計</span>
              <span className="text-[36px] leading-none font-bold tabular-nums" data-testid="done-extra">¥{v.extraTotal.toLocaleString('ja-JP')}</span>
            </div>
            {change != null && (
              <div className="flex items-end justify-between py-3 text-[15px]">
                <span>預かり金 <b className="tabular-nums">¥{paid!.toLocaleString('ja-JP')}</b></span>
                <span className="font-bold text-ok">おつり <span className="text-[28px] tabular-nums">¥{change.toLocaleString('ja-JP')}</span></span>
              </div>
            )}
            <div className="flex justify-between py-2 text-[13px] text-sub">
              <span>本日のご利用合計（入店時 ¥{v.entryTotal.toLocaleString('ja-JP')} ＋ 退店時）</span>
              <b className="text-ink tabular-nums">¥{(v.entryTotal + v.extraTotal).toLocaleString('ja-JP')}</b>
            </div>
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/reception/checkout" className={cx(buttonCls('brand', 'lg'), 'h-16 text-[16px]')}><ReceiptText className="size-5" />次の退店・精算</Link>
        <Link href="/reception" className={cx(buttonCls('default', 'lg'), 'h-16 text-[16px]')}><House className="size-5" />受付トップへ</Link>
      </div>
    </div>
  )
}
