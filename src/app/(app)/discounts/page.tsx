import type { Metadata } from 'next'
import Link from 'next/link'
import { and, between, count, eq, gt, inArray, max, ne, sql } from 'drizzle-orm'
import { CalendarCheck, Gift, Lock, Search, Sparkles, TrendingUp } from 'lucide-react'
import { Badge, Card, Empty, Field, Input, Select, Td, Th, buttonCls, cx } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/settings/form'
import { NoteBox, Switch, YenInput } from '@/components/settings/fields'
import * as t from '@/db/schema'
import type { StoreSettings } from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { addMonths, daysInMonth, fmtJaDate, fmtJaMonth, fmtMD, WEEK_JA, weekdayOf, yen } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'
import { visitCounts } from '@/lib/stats'
import { saveDiscountRule } from './actions'

export const metadata: Metadata = { title: '割引・特典' }

const LISTS = ['current', 'next', 'near'] as const
const fmtShort = (d: string) => `${fmtMD(d)}（${WEEK_JA[weekdayOf(d)]}）`
type ListKey = (typeof LISTS)[number]

interface Row {
  id: string
  memberNo: string
  handle: string
  prev: number
  cur: number
  used: number
  usedAmount: number
  last: string | null
}

export default async function DiscountsPage({ searchParams }: PageProps<'/discounts'>) {
  const ctx = await requireCtx()
  const sp = await searchParams
  const list: ListKey = LISTS.includes(sp.list as ListKey) ? (sp.list as ListKey) : 'current'
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 40) : ''

  const data = await query(async (tx) => {
    const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    const today = businessDateOf(new Date(), s)
    const month = today.slice(0, 7)
    const prev = addMonths(month, -1)
    const mFrom = `${month}-01`
    const mTo = `${month}-${daysInMonth(month)}`
    const prevCounts = await visitCounts(tx, ctx.storeId, `${prev}-01`, `${prev}-${daysInMonth(prev)}`)
    const curCounts = await visitCounts(tx, ctx.storeId, mFrom, mTo)
    const members = await tx
      .select({ id: t.members.id, memberNo: t.members.memberNo, handle: t.members.handleName })
      .from(t.members)
      .where(and(eq(t.members.storeId, ctx.storeId), eq(t.members.gender, s.discountGender as '男性' | '女性'), eq(t.members.status, 'active')))
    const min = s.discountMinVisits
    const ids = members.filter((m) => (prevCounts.get(m.id) ?? 0) >= min || (curCounts.get(m.id) ?? 0) >= Math.max(1, min - 2)).map((m) => m.id)

    // 今月の割引利用・最終来店（候補の会員のみ）
    const used = new Map<string, { n: number; amount: number }>()
    const last = new Map<string, string>()
    if (ids.length) {
      const u = await tx
        .select({ m: t.visits.memberId, n: count(), amount: sql<number>`coalesce(sum(${t.visits.discount}), 0)`.mapWith(Number) })
        .from(t.visits)
        .where(and(eq(t.visits.storeId, ctx.storeId), between(t.visits.businessDate, mFrom, mTo), gt(t.visits.discount, 0), ne(t.visits.status, 'void'), inArray(t.visits.memberId, ids)))
        .groupBy(t.visits.memberId)
      for (const r of u) used.set(r.m, { n: r.n, amount: r.amount })
      const base = and(eq(t.visits.storeId, ctx.storeId), ne(t.visits.status, 'void'))
      const a = await tx.select({ m: t.visits.memberId, d: max(t.visits.businessDate) }).from(t.visits).where(and(base, inArray(t.visits.memberId, ids))).groupBy(t.visits.memberId)
      const b = await tx.select({ m: t.visits.partnerMemberId, d: max(t.visits.businessDate) }).from(t.visits).where(and(base, inArray(t.visits.partnerMemberId, ids))).groupBy(t.visits.partnerMemberId)
      for (const r of [...a, ...b]) if (r.m && r.d && (!last.has(r.m) || last.get(r.m)! < r.d)) last.set(r.m, r.d)
    }
    // 今月の割引の合計（店舗全体）
    const [total] = await tx
      .select({ n: count(), amount: sql<number>`coalesce(sum(${t.visits.discount}), 0)`.mapWith(Number) })
      .from(t.visits)
      .where(and(eq(t.visits.storeId, ctx.storeId), between(t.visits.businessDate, mFrom, mTo), gt(t.visits.discount, 0), ne(t.visits.status, 'void')))

    const rows: Row[] = members
      .filter((m) => ids.includes(m.id))
      .map((m) => ({
        id: m.id, memberNo: m.memberNo, handle: m.handle,
        prev: prevCounts.get(m.id) ?? 0, cur: curCounts.get(m.id) ?? 0,
        used: used.get(m.id)?.n ?? 0, usedAmount: used.get(m.id)?.amount ?? 0, last: last.get(m.id) ?? null,
      }))
    const byNo = (a: Row, b: Row) => a.memberNo.localeCompare(b.memberNo, 'ja', { numeric: true })
    return {
      s, today, month, prev, total,
      current: rows.filter((r) => r.prev >= min).sort((a, b) => b.prev - a.prev || byNo(a, b)),
      next: rows.filter((r) => r.cur >= min).sort((a, b) => b.cur - a.cur || byNo(a, b)),
      near: rows.filter((r) => r.cur >= 1 && r.cur < min && r.cur >= min - 2).sort((a, b) => b.cur - a.cur || byNo(a, b)),
    }
  }, ctx)

  const { s } = data
  const min = s.discountMinVisits
  const mPrev = +data.prev.slice(5, 7)
  const mCur = +data.month.slice(5, 7)
  const mNext = +addMonths(data.month, 1).slice(5, 7)
  const tabs: { key: ListKey; label: string; desc: string; n: number; icon: typeof Gift }[] = [
    { key: 'current', label: `${mCur}月の割引対象`, desc: `${mPrev}月に${min}回以上来店`, n: data.current.length, icon: Gift },
    { key: 'next', label: `${mNext}月の割引対象（予定）`, desc: `${mCur}月に${min}回以上来店`, n: data.next.length, icon: CalendarCheck },
    { key: 'near', label: 'あと少し', desc: `${mCur}月 あと1〜2回で対象`, n: data.near.length, icon: TrendingUp },
  ]
  const rows = data[list].filter((r) => !q || r.memberNo.toLowerCase().includes(q.toLowerCase()) || r.handle.toLowerCase().includes(q.toLowerCase()))
  const listHref = (k: ListKey) => (k === 'current' ? '/discounts' : `/discounts?list=${k}`)

  return (
    <div key={ctx.storeId} className="animate-fade-in space-y-5">
      <RuleBanner s={s} isOwner={ctx.isOwner} />

      <div className="grid gap-4 sm:grid-cols-3">
        {tabs.map(({ key, label, desc, n, icon: Icon }) => (
          <Link key={key} href={listHref(key)}
            className={cx('card group block px-4 py-4 transition lg:px-5', list === key ? 'border-brand ring-2 ring-brand/25' : 'hover:border-brand-light')}>
            <span className="flex items-center gap-2.5">
              <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg', list === key ? 'btn-brand' : 'bg-brand-soft text-brand')}>
                <Icon className="size-5" />
              </span>
              <span className="text-[14px] leading-snug font-bold [word-break:keep-all]">{label}</span>
            </span>
            <span className="mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
              <span className="min-w-0 grow basis-[8.5rem] text-[12px] leading-snug text-sub">{desc}</span>
              <span className="ml-auto shrink-0 whitespace-nowrap">
                <span className="text-[30px] leading-none font-bold tabular-nums">{n}</span>
                <span className="ml-0.5 text-[13px] font-bold">名</span>
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card
          title={`${tabs.find((x) => x.key === list)!.label}（${s.discountGender}）`}
          action={
            <form className="flex items-center gap-2" action="/discounts">
              {list !== 'current' && <input type="hidden" name="list" value={list} />}
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-mute" />
                <input name="q" defaultValue={q} placeholder="会員番号・ハンドルネーム"
                  className="h-9 w-56 rounded-lg border border-line bg-white pr-3 pl-8 text-[13px] outline-none focus:border-brand" />
              </div>
            </form>
          }
          bodyClass="px-2 pt-3 pb-3"
        >
          <p className="px-3 pb-3 text-[12px] text-sub">
            {list === 'current' && <>{fmtJaMonth(data.prev)}の来店が{min}回以上の会員です。{fmtJaMonth(data.month)}の入場料から{yen(s.discountAmount)}引き（{s.discountScope === 'every' ? '毎回' : '月1回'}）。受付時に自動で割引されます。</>}
            {list === 'next' && <>{fmtJaMonth(data.month)}の来店がすでに{min}回以上の会員です。{mNext}月の来店で割引の対象になります（{fmtJaDate(data.today)}時点）。</>}
            {list === 'near' && <>今月あと1〜2回の来店で翌月の割引対象になる会員です。来店時にお声がけください。</>}
          </p>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-[#f8f6fc]">
                  <tr>
                    <Th>会員番号</Th>
                    <Th>ハンドルネーム</Th>
                    {list === 'current' ? (
                      <><Th className="text-right">{mPrev}月の来店</Th><Th className="text-right">{mCur}月の来店</Th><Th>今月の割引利用</Th></>
                    ) : list === 'next' ? (
                      <><Th className="text-right">{mCur}月の来店</Th><Th className="text-right">{mPrev}月の来店</Th><Th>今月の割引</Th></>
                    ) : (
                      <><Th className="text-right">{mCur}月の来店</Th><Th>対象まで</Th></>
                    )}
                    <Th>最終来店</Th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-line hover:bg-[#fcfbfe]">
                      <Td><Link href={`/members/${r.id}`} className="font-medium hover:text-brand">{r.memberNo}</Link></Td>
                      <Td className="max-w-48 truncate"><Link href={`/members/${r.id}`} className="hover:text-brand">{r.handle}</Link></Td>
                      {list === 'current' && (
                        <>
                          <Td className="text-right"><b className="text-[15px]">{r.prev}</b>回</Td>
                          <Td className="text-right">{r.cur}回</Td>
                          <Td><UsageBadge s={s} used={r.used} amount={r.usedAmount} /></Td>
                        </>
                      )}
                      {list === 'next' && (
                        <>
                          <Td className="text-right"><b className="text-[15px]">{r.cur}</b>回</Td>
                          <Td className="text-right">{r.prev}回</Td>
                          <Td>{r.prev >= min ? <Badge tone="green">今月も対象</Badge> : <span className="text-mute">—</span>}</Td>
                        </>
                      )}
                      {list === 'near' && (
                        <>
                          <Td className="text-right"><b className="text-[15px]">{r.cur}</b>回</Td>
                          <Td><Badge tone={min - r.cur === 1 ? 'pink' : 'amber'}>あと{min - r.cur}回</Badge></Td>
                        </>
                      )}
                      <Td className="text-sub">{r.last === data.today ? <Badge tone="blue">本日</Badge> : r.last ? fmtShort(r.last) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{q ? `「${q}」に一致する会員はいません` : '該当する会員はいません'}</Empty>
          )}
        </Card>

        <div className="space-y-5 xl:sticky xl:top-24">
          <Card title="割引ルール" action={!ctx.isOwner && <Badge tone="gray"><Lock className="mr-1 size-3" />閲覧のみ</Badge>}>
            {ctx.isOwner ? <RuleForm s={s} /> : <RuleView s={s} />}
          </Card>
          <Card title={`${mCur}月の割引実績`}>
            <dl className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-page px-3 py-3">
                <dt className="text-[12px] text-sub">割引した来店</dt>
                <dd className="mt-1 text-[22px] font-bold tabular-nums">{data.total.n}<span className="ml-0.5 text-[13px]">件</span></dd>
              </div>
              <div className="rounded-xl bg-page px-3 py-3">
                <dt className="text-[12px] text-sub">割引額の合計</dt>
                <dd className="mt-1 text-[22px] font-bold tabular-nums">{yen(data.total.amount)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ruleText(s: StoreSettings) {
  return `前月に${s.discountMinVisits}回以上来店した${s.discountGender}会員は、当月の入場料から${yen(s.discountAmount)}割引（${s.discountScope === 'every' ? '当月の来店すべて' : '当月の最初の来店のみ'}）`
}

function RuleBanner({ s, isOwner }: { s: StoreSettings; isOwner: boolean }) {
  return (
    <div className={cx('card flex flex-wrap items-center gap-3 px-5 py-3.5', !s.discountEnabled && 'border-[#f2c2cb] bg-[#fffafb]')}>
      <Sparkles className={cx('size-5 shrink-0', s.discountEnabled ? 'text-brand' : 'text-mute')} />
      <span className="text-[14px] font-bold">リピーター割引</span>
      {s.discountEnabled ? <Badge tone="green">適用中</Badge> : <Badge tone="red">停止中</Badge>}
      <span className={cx('min-w-[min(100%,18rem)] flex-1 text-[13px]', s.discountEnabled ? 'text-ink' : 'text-mute line-through')}>{ruleText(s)}</span>
      {isOwner && <a href="#rule" className={cx(buttonCls('default', 'sm'), 'xl:hidden')}>ルールを変更</a>}
    </div>
  )
}

function UsageBadge({ s, used, amount }: { s: StoreSettings; used: number; amount: number }) {
  if (s.discountScope === 'once') return used ? <Badge tone="gray">利用済み</Badge> : <Badge tone="purple">未利用（次回割引）</Badge>
  return used ? <span><b>{used}</b>回<span className="ml-1 text-[11px] text-sub">（{yen(amount)}）</span></span> : <span className="text-mute">未利用</span>
}

function RuleView({ s }: { s: StoreSettings }) {
  const items: [string, string][] = [
    ['状態', s.discountEnabled ? '適用中' : '停止中'],
    ['規定回数', `前月${s.discountMinVisits}回以上`],
    ['割引額', `${yen(s.discountAmount)}（入場料から）`],
    ['対象', `${s.discountGender}会員（カップルは対象外）`],
    ['適用', s.discountScope === 'every' ? '毎回（当月の来店すべて）' : '月1回（当月の最初の来店）'],
  ]
  return (
    <div>
      <dl className="divide-y divide-line text-[13px]">
        {items.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-2.5"><dt className="text-sub">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] text-mute">ルールの変更はオーナーのみ行えます。</p>
    </div>
  )
}

function RuleForm({ s }: { s: StoreSettings }) {
  return (
    <ActionForm action={saveDiscountRule} className="space-y-4" id="rule">
      <Switch name="discountEnabled" defaultChecked={s.discountEnabled} label="リピーター割引を適用する" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="規定回数（前月）" required>
          <div className="relative">
            <Input type="number" name="discountMinVisits" defaultValue={s.discountMinVisits} min={1} max={31} required className="pr-10 text-right tabular-nums" />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-mute">回</span>
          </div>
        </Field>
        <Field label="割引額" required><YenInput name="discountAmount" defaultValue={s.discountAmount} required /></Field>
      </div>
      <Field label="対象性別">
        <Select name="discountGender" defaultValue={s.discountGender}>
          <option value="男性">男性</option>
          <option value="女性">女性</option>
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-[12px] font-medium text-sub">適用範囲</legend>
        <div className="grid grid-cols-2 gap-2">
          {([['every', '毎回', '当月の来店すべて'], ['once', '月1回', '当月の最初の来店のみ']] as const).map(([v, label, sub]) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" name="discountScope" value={v} defaultChecked={s.discountScope === v} className="peer sr-only" />
              <span className="block rounded-lg border border-line px-3 py-2.5 transition peer-checked:border-brand peer-checked:bg-brand-soft peer-focus-visible:ring-2 peer-focus-visible:ring-brand/30">
                <span className="block text-[14px] font-bold">{label}</span>
                <span className="block text-[11px] text-sub">{sub}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <NoteBox tone="info" className="text-[12px]">カップルでの来店は割引の対象外です。来店回数にはカップルでの来店も含みます。</NoteBox>
      <SubmitButton className="w-full">ルールを保存</SubmitButton>
    </ActionForm>
  )
}
