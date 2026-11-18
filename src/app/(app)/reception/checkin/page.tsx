import type { Metadata } from 'next'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { ArrowLeft, CircleCheckBig, GlassWater, House, Search, UserPlus, UserSearch } from 'lucide-react'
import { Card, buttonCls, cx } from '@/components/ui'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { fmtJaDate, fmtTime } from '@/lib/format'
import { DAY_TYPE_STYLE } from '@/lib/pricing'
import { DiscountRows, MoneyRow, Notice } from '../_components/bits'
import { MemberCardView } from '../_components/MemberCardView'
import {
  discountByCategory, discountCounts, isUuid, loadToday, memberCardById, memberCards, normalizeQuery, PART_LABEL, searchMembers, u30ByCategory,
} from '../_lib/server'
import { CheckinPanel } from './CheckinPanel'

export const metadata: Metadata = { title: '既存会員の来店受付' }

export default async function CheckinPage({ searchParams }: PageProps<'/reception/checkin'>) {
  const sp = await searchParams
  const ctx = await requireCtx()
  if (typeof sp.done === 'string') return <Done id={sp.done} paid={typeof sp.paid === 'string' ? +sp.paid : null} />
  const q = typeof sp.q === 'string' ? normalizeQuery(sp.q) : ''
  const mId = typeof sp.m === 'string' ? sp.m : ''

  const data = await query(async (tx) => {
    const today = await loadToday(tx, ctx.storeId)
    const results = q ? await memberCards(tx, ctx.storeId, today.businessDate, today.settings, await searchMembers(tx, ctx.storeId, q)) : []
    const selected = mId ? await memberCardById(tx, ctx.storeId, today.businessDate, today.settings, mId) : results.length === 1 ? results[0] : null
    const counts = selected && !selected.block ? await discountCounts(tx, ctx.storeId, selected.id, today.businessDate) : null
    return { today, results, selected, counts }
  }, ctx)
  const { today, results, selected, counts } = data
  const s = today.settings
  const backHref = q ? `/reception/checkin?q=${encodeURIComponent(q)}` : '/reception/checkin'

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-5">
      <Card bodyClass="p-4 sm:p-5">
        <form className="flex gap-2" action="/reception/checkin">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-mute" />
            <input
              name="q" defaultValue={q} autoFocus={!selected} autoComplete="off" enterKeyHint="search" aria-label="会員検索"
              placeholder="会員番号（例 10234）・ハンドルネーム"
              className="h-16 w-full rounded-xl border border-line bg-white pr-4 pl-13 text-[20px] font-bold outline-none placeholder:font-normal placeholder:text-mute focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <button className={cx(buttonCls('brand', 'lg'), 'h-16 px-7 text-[17px]')}><Search className="size-5" />検索</button>
        </form>
        <p className="mt-2 text-[12px] text-sub">番号は接頭辞なしの一部でも検索できます（10234 → {ctx.store.memberPrefix}10234）。番号と名前を空白で区切って同時に指定することもできます。</p>
      </Card>

      {selected ? (
        <>
          {(q && results.length > 1) || mId ? (
            <Link href={backHref} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-brand"><ArrowLeft className="size-4" />検索結果に戻る</Link>
          ) : null}
          <MemberCardView m={selected} selected={!selected.block} />
          {selected.block ? (
            <div className="flex gap-3">
              <Link href="/reception/checkin" className={cx(buttonCls('default', 'lg'), 'h-14')}>別の会員を検索</Link>
              <Link href="/reception" className={cx(buttonCls('ghost', 'lg'), 'h-14')}>受付トップへ</Link>
            </div>
          ) : (
            <CheckinPanel
              key={selected.id}
              member={selected}
              today={{
                businessDate: today.businessDate, part: today.part, dayType: today.day.type, dayLabel: today.day.label, prices: today.prices,
                partLabel: PART_LABEL[today.part], dayTypeLabel: today.day.label || DAY_TYPE_STYLE[today.day.type].label,
              }}
              discount={discountByCategory(today, selected.gender, counts!)}
              u30={u30ByCategory(today, selected.gender, selected.age)}
              u30Rule={{ enabled: s.u30Enabled, maxAge: s.u30MaxAge, amount: s.u30Amount, gender: s.u30Gender, combine: s.u30Combine }}
              counts={counts!}
              rule={{ enabled: s.discountEnabled, minVisits: s.discountMinVisits, amount: s.discountAmount, gender: s.discountGender, scope: s.discountScope }}
              joinFee={s.joinFee}
              annual={{ enabled: s.annualFeeEnabled, fee: s.annualFee }}
              isOwner={ctx.isOwner}
            />
          )}
        </>
      ) : q ? (
        results.length ? (
          <div>
            <p className="mb-3 text-[14px] text-sub">「<b className="text-ink">{q}</b>」の検索結果：{results.length}件{results.length >= 30 && '（上位30件）'}</p>
            <div className="grid gap-3 xl:grid-cols-2">
              {results.map((m) => (
                <MemberCardView
                  key={m.id} m={m}
                  action={!m.block && (
                    <Link href={`/reception/checkin?q=${encodeURIComponent(q)}&m=${m.id}`} className={cx(buttonCls('brand', 'lg'), 'h-14 w-full text-[16px]')}>
                      この会員で受付する
                    </Link>
                  )}
                />
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <div className="py-6 text-center">
              <UserSearch className="mx-auto size-12 text-brand-light" />
              <p className="mt-3 text-[18px] font-bold">「{q}」に該当する会員が見つかりません</p>
              <p className="mt-1 text-[13px] text-sub">番号・名前の表記を確認してください。紙の会員証をお持ちの既存会員は、会員として登録してから受付します。</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link href={`/members/new?no=${encodeURIComponent(q)}`} className={cx(buttonCls('brand', 'lg'), 'h-14')}><UserPlus className="size-5" />既存会員（紙の会員証）を登録</Link>
                <Link href="/reception/new" className={cx(buttonCls('outline', 'lg'), 'h-14')}>新規入会の受付へ</Link>
              </div>
            </div>
          </Card>
        )
      ) : (
        <p className="py-6 text-center text-[14px] text-mute">会員番号またはハンドルネームを入力して Enter で検索します</p>
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
        return row ?? null
      }, ctx)
    : null
  if (!r) return <Notice tone="error">受付内容が見つかりません。<Link href="/reception" className="ml-2 font-bold underline">受付トップへ</Link></Notice>
  const v = r.v
  const change = paid != null && Number.isFinite(paid) ? paid - v.entryTotal : null
  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-5">
      <section className="card overflow-hidden">
        <div className="flex items-center gap-4 bg-gradient-to-br from-[#7b3fe0] to-[#5f2bb8] px-6 py-6 text-white">
          <CircleCheckBig className="size-12 shrink-0" />
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-white/85">入店受付が完了しました</p>
            <p className="truncate text-[28px] font-bold" data-testid="done-member"><span className="tabular-nums">{r.no}</span>　{r.handle}</p>
            {r.pNo && <p className="truncate text-[15px] text-white/85">＋ {r.pNo} {r.pHandle}</p>}
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="mb-1 text-[12px] text-sub">{fmtJaDate(v.businessDate)}・{v.dayType}・{PART_LABEL[v.dayPart]}・{fmtTime(v.checkedInAt)} 入店・{v.category}</p>
          <div className="divide-y divide-line">
            <MoneyRow label={`入場料（${v.category}）`} amount={v.entranceFee} note={v.note || undefined} />
            <DiscountRows discount={v.discount} u30Discount={v.u30Discount} reason={v.discountReason} />
            {v.joinFee > 0 && <MoneyRow label="入会金" amount={v.joinFee} />}
            {v.annualFee > 0 && <MoneyRow label="年会費" amount={v.annualFee} />}
            <div className="flex items-end justify-between py-3">
              <span className="text-[16px] font-bold">合計</span>
              <span className="text-[36px] leading-none font-bold tabular-nums" data-testid="done-total">¥{v.entryTotal.toLocaleString('ja-JP')}</span>
            </div>
            {change != null && (
              <div className="flex items-end justify-between py-3 text-[15px]">
                <span>預かり金 <b className="tabular-nums">¥{paid!.toLocaleString('ja-JP')}</b></span>
                <span className="font-bold text-ok">おつり <span className="text-[28px] tabular-nums">¥{change.toLocaleString('ja-JP')}</span></span>
              </div>
            )}
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/reception/checkin" className={cx(buttonCls('brand', 'lg'), 'h-16 text-[16px]')}><Search className="size-5" />次の受付</Link>
        <Link href={`/reception/order?visit=${v.id}`} className={cx(buttonCls('outline', 'lg'), 'h-16 text-[16px]')}><GlassWater className="size-5" />ドリンク注文</Link>
        <Link href="/reception" className={cx(buttonCls('default', 'lg'), 'h-16 text-[16px]')}><House className="size-5" />受付トップへ</Link>
      </div>
    </div>
  )
}
