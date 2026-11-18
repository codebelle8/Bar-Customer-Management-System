import type { Metadata } from 'next'
import Link from 'next/link'
import { and, between, eq, ne, sql } from 'drizzle-orm'
import { FileSpreadsheet, Info, Minus, Equal, TableProperties } from 'lucide-react'
import { Legend, SalesTrendChart } from '@/components/charts'
import { Badge, Card, Empty, Td, Th, buttonCls, cx } from '@/components/ui'
import { AdjustmentsForm } from '@/components/sales/AdjustmentsForm'
import { CountChart } from '@/components/sales/CountChart'
import { MonthNav } from '@/components/sales/MonthNav'
import { isYm } from '@/components/sales/constants'
import * as t from '@/db/schema'
import { query, requireOwner } from '@/lib/dal'
import { addMonths, fmtJaMonth, fmtMD, num, pct, yen } from '@/lib/format'
import { DAY_TYPE_STYLE, DAY_TYPES } from '@/lib/pricing'
import { dailyRows, sumRows, summaryOf } from '@/lib/stats'
import { businessToday, loadAdjustments, monthRange } from '../sales/data'

export const metadata: Metadata = { title: 'レポート' }

const TH = 'px-3 py-2.5 text-[12px] font-medium whitespace-nowrap text-sub'

const TABS = [
  { key: 'summary', label: '総括' },
  { key: 'trend', label: '月別推移' },
  { key: 'members', label: '会員別売上' },
  { key: 'types', label: '料金区分別' },
] as const
type Tab = (typeof TABS)[number]['key']

export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  const ctx = await requireOwner()
  const sp = await searchParams
  const tab: Tab = TABS.find((x) => x.key === sp.tab)?.key ?? 'summary'
  const today = await query((tx) => businessToday(tx, ctx.storeId), ctx)
  const cur = today.slice(0, 7)
  const month = isYm(sp.month) && sp.month <= cur ? sp.month : cur
  const href = (k: Tab, m = month) => `/reports?${new URLSearchParams(k === 'summary' ? { month: m } : { tab: k, month: m })}`
  return (
    <div className="animate-fade-in space-y-5">
      <nav className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((x) => (
          <Link key={x.key} href={href(x.key)}
            className={cx('-mb-px border-b-[3px] px-5 py-3 text-[15px] font-medium whitespace-nowrap transition', tab === x.key ? 'border-brand text-brand' : 'border-transparent text-sub hover:text-ink')}>
            {x.label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav month={month} max={cur} path="/reports" extra={tab === 'summary' ? {} : { tab }} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href={`/sales?month=${month}`} className={buttonCls('outline')}><TableProperties className="size-4" />日報を開く</Link>
          <a href={`/api/export/monthly?month=${month}`} className={buttonCls('brand')}><FileSpreadsheet className="size-4" />Excel出力</a>
        </div>
      </div>
      {tab === 'summary' && <SummaryTab month={month} today={today} />}
      {tab === 'trend' && <TrendTab month={month} today={today} hrefFor={(m) => href('summary', m)} />}
      {tab === 'members' && <MembersTab month={month} today={today} />}
      {tab === 'types' && <TypesTab month={month} today={today} />}
    </div>
  )
}

/* ------------------------------ 総括 ------------------------------ */

async function SummaryTab({ month, today }: { month: string; today: string }) {
  const ctx = await requireOwner()
  const { from, to } = monthRange(month, today)
  const data = await query(async (tx) => ({ rows: await dailyRows(tx, ctx.storeId, from, to), adjustments: await loadAdjustments(tx, ctx.storeId, month) }), ctx)
  const sum = summaryOf(data.rows)
  const s = sum.total
  const lines = [
    { label: '昼の部', ...sum.day, expense: null, parttime: null },
    { label: '夜の部', ...sum.night, expense: null, parttime: null },
    { label: '合計', male: s.male, female: s.female, cp: s.cp, cash: s.total, sales: s.total, expense: s.expense, parttime: s.parttime },
  ]
  return (
    <>
      <Card title={<>総括<span className="text-[13px] font-medium text-sub">{fmtJaMonth(month)}（{fmtMD(from)}〜{fmtMD(to)}）</span></>}
        action={month === today.slice(0, 7) ? <Badge tone="amber">集計中（{fmtMD(today)}まで）</Badge> : undefined}>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px] tabular-nums">
            <thead>
              <tr className="border-b border-line bg-[#f8f6fc]">
                <Th className="w-28">区分</Th>
                <Th className="text-right">男人数</Th>
                <Th className="text-right">女人数</Th>
                <Th className="text-right">現金売上<span className="text-up">※</span></Th>
                <Th className="text-right">イベント経費</Th>
                <Th className="text-right">アルバイト</Th>
                <Th className="text-right">総売上</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const total = l.label === '合計'
                return (
                  <tr key={l.label} className={cx('border-b border-line last:border-0', total && 'bg-brand-soft/60 font-bold')}>
                    <Td className={cx('font-bold', total && 'text-brand')}>{l.label}</Td>
                    <Td className="text-right">{num(l.male)}<span className="ml-0.5 text-[11px] text-sub">名</span>{total && <div className="text-[10px] font-medium text-sub">男合計</div>}</Td>
                    <Td className="text-right">{num(l.female)}<span className="ml-0.5 text-[11px] text-sub">名</span>{total && <div className="text-[10px] font-medium text-sub">女合計</div>}</Td>
                    <Td className="text-right">{yen(l.cash)}</Td>
                    <Td className="text-right">{l.expense === null ? <span className="text-mute">—</span> : yen(l.expense)}</Td>
                    <Td className="text-right">{l.parttime === null ? <span className="text-mute">—</span> : yen(l.parttime)}</Td>
                    <Td className={cx('text-right', total ? 'text-[16px] text-brand' : 'font-bold')}>{yen(l.sales)}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-sub">
          <span className="flex items-center gap-1.5 text-up"><Info className="size-3.5" />※昼・夜の現金売上の計算方法は確認中（現在は総売上と同じ金額を表示）</span>
          <span>カップル 昼{sum.day.cp}組・夜{sum.night.cp}組（2名として計人数に含む）</span>
          <span>計人数 <b className="text-ink">{num(s.people)}名</b></span>
          <span>イベント経費＝日報の経費の合計</span>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(300px,1fr)_2fr]">
        <Card title="現金残（▲イベ経費）">
          <div className="grid items-center gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div>
            <p className="text-[34px] leading-tight font-bold tracking-tight text-brand tabular-nums xl:text-right">{yen(sum.cashLeft)}</p>
            <p className="mt-1 text-[12px] text-sub xl:text-right">総売上 − イベント経費 − アルバイト</p>
          </div>
          <dl className="space-y-2 rounded-xl border border-line bg-[#faf8fd] p-4 text-[14px] tabular-nums">
            <div className="flex items-center justify-between"><dt className="text-sub">総売上</dt><dd className="font-bold">{yen(s.total)}</dd></div>
            <div className="flex items-center justify-between"><dt className="flex items-center gap-1 text-sub"><Minus className="size-3.5" />イベント経費</dt><dd className="font-bold">{yen(s.expense)}</dd></div>
            <div className="flex items-center justify-between"><dt className="flex items-center gap-1 text-sub"><Minus className="size-3.5" />アルバイト</dt><dd className="font-bold">{yen(s.parttime)}</dd></div>
            <div className="flex items-center justify-between border-t border-line pt-2"><dt className="flex items-center gap-1 font-bold"><Equal className="size-3.5" />現金残</dt><dd className="font-bold text-brand">{yen(sum.cashLeft)}</dd></div>
          </dl>
          </div>
          {s.tax > 0 && <p className="mt-2 text-[11px] text-sub">税金 {yen(s.tax)} は現金残の計算に含めていません（Excel と同じ）</p>}
        </Card>
        <Card title="調整・差引現金合計">
          <AdjustmentsForm month={month} cashLeft={sum.cashLeft} rows={data.adjustments} />
        </Card>
      </div>
    </>
  )
}

/* ------------------------------ 月別推移 ------------------------------ */

async function TrendTab({ month, today, hrefFor }: { month: string; today: string; hrefFor: (m: string) => string }) {
  const ctx = await requireOwner()
  const start = addMonths(month, -11)
  const { to } = monthRange(month, today)
  const rows = await query((tx) => dailyRows(tx, ctx.storeId, `${start}-01`, to), ctx)
  const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i)).map((m) => {
    const rs = rows.filter((r) => r.date.startsWith(m))
    const s = sumRows(rs)
    const open = rs.filter((r) => r.visits > 0).length
    return { m, s, open, has: open > 0 || s.total > 0 }
  })
  const first = months.findIndex((x) => x.has)
  const shown = first < 0 ? [] : months.slice(first)
  const label = (m: string) => `${m.slice(0, 4)}/${+m.slice(5, 7)}`
  const trend = shown.map((x) => ({ label: label(x.m), day: x.s.salesDay, night: x.s.salesNight, total: x.s.total }))
  return (
    <>
      <Card title="売上の月別推移" action={<Legend />}>
        {shown.length ? <SalesTrendChart data={trend} height={280} barSize={shown.length > 6 ? 26 : 48} /> : <Empty>この期間のデータはありません</Empty>}
        {first > 0 && <p className="mt-2 text-[11px] text-mute">データがある {fmtJaMonth(months[first].m)} 以降を表示しています（表は12か月分）</p>}
      </Card>
      {shown.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="計人数（名）"><CountChart data={shown.map((x) => ({ label: label(x.m), value: x.s.people }))} name="計人数" unit="名" /></Card>
          <Card title="新規獲得（名）"><CountChart data={shown.map((x) => ({ label: label(x.m), value: x.s.newMembers }))} name="新規獲得" unit="名" /></Card>
        </div>
      )}
      <Card title="12か月の集計表" bodyClass="px-2 pt-2 pb-3">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead className="bg-[#f8f6fc]">
              <tr><Th>月</Th><Th className="text-right">営業日数</Th><Th className="text-right">総売上</Th><Th className="text-right">昼売上</Th><Th className="text-right">夜売上</Th><Th className="text-right">経費</Th><Th className="text-right">計人数</Th><Th className="text-right">新規獲得</Th><Th className="text-right">1日平均売上</Th><Th className="text-right">前月比</Th></tr>
            </thead>
            <tbody>
              {[...months].reverse().map((x) => {
                const i = months.indexOf(x)
                const prev = months[i - 1]
                // 集計中の月は前月の同じ日までと比べる（前月同期比）
                const partial = x.m === today.slice(0, 7)
                const prevTotal = !prev ? 0 : partial ? sumRows(rows.filter((r) => r.date.startsWith(prev.m) && r.date.slice(8) <= today.slice(8))).total : prev.s.total
                const d = prev?.has && x.has && prevTotal ? pct(x.s.total, prevTotal) : null
                return (
                  <tr key={x.m} className={cx('border-t border-line', x.m === month && 'bg-brand-soft/50', !x.has && 'text-mute')}>
                    <Td>
                      <Link href={hrefFor(x.m)} className="font-bold hover:text-brand">{fmtJaMonth(x.m)}</Link>
                      {x.m === today.slice(0, 7) && <Badge tone="amber" className="ml-2">集計中</Badge>}
                    </Td>
                    {x.has ? (
                      <>
                        <Td className="text-right">{x.open}日</Td>
                        <Td className="text-right font-bold">{yen(x.s.total)}</Td>
                        <Td className="text-right">{yen(x.s.salesDay)}</Td>
                        <Td className="text-right">{yen(x.s.salesNight)}</Td>
                        <Td className="text-right">{yen(x.s.expense)}</Td>
                        <Td className="text-right">{num(x.s.people)}名</Td>
                        <Td className="text-right">{num(x.s.newMembers)}名</Td>
                        <Td className="text-right">{yen(x.open ? x.s.total / x.open : 0)}</Td>
                        <Td className={cx('text-right', d === null ? 'text-mute' : d >= 0 ? 'text-ok' : 'text-up')}>
                          {d === null ? '—' : `${d >= 0 ? '+' : ''}${d}%`}{partial && d !== null && <span className="ml-1 text-[10px] text-sub">同期比</span>}
                        </Td>
                      </>
                    ) : (
                      <td colSpan={9} className="px-3 py-2.5 text-[12px]">データなし</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="px-3 pt-2 text-[11px] text-mute">集計中の月は本日の営業日までの集計です。前月比は総売上の比較で、集計中の月は前月の同じ日までと比べています（同期比）。</p>
      </Card>
    </>
  )
}

/* ------------------------------ 会員別売上 ------------------------------ */

async function MembersTab({ month, today }: { month: string; today: string }) {
  const ctx = await requireOwner()
  const { from, to } = monthRange(month, today)
  const data = await query(async (tx) => {
    const visits = await tx
      .select({
        memberId: t.visits.memberId,
        partnerId: t.visits.partnerMemberId,
        entry: t.visits.entryTotal,
        // 結合なしの select では列名が修飾されないため、外側の visits.id を明示する
        extra: sql<number>`(select coalesce(sum(vi.amount), 0) from visit_items vi where vi.visit_id = "visits"."id")`.mapWith(Number),
      })
      .from(t.visits)
      .where(and(eq(t.visits.storeId, ctx.storeId), between(t.visits.businessDate, from, to), ne(t.visits.status, 'void')))
    const members = await tx
      .select({ id: t.members.id, no: t.members.memberNo, handle: t.members.handleName, gender: t.members.gender, status: t.members.status })
      .from(t.members)
      .where(eq(t.members.storeId, ctx.storeId))
    return { visits, members }
  }, ctx)

  const info = new Map(data.members.map((m) => [m.id, m]))
  type Agg = { id: string; entry: number; extra: number; visits: number; cp: number; partners: Map<string, number>; asPartner: number; mains: Set<string> }
  const agg = new Map<string, Agg>()
  const get = (id: string) => {
    let a = agg.get(id)
    if (!a) agg.set(id, (a = { id, entry: 0, extra: 0, visits: 0, cp: 0, partners: new Map(), asPartner: 0, mains: new Set() }))
    return a
  }
  for (const v of data.visits) {
    const a = get(v.memberId)
    a.entry += v.entry
    a.extra += v.extra
    a.visits++
    if (v.partnerId) {
      a.cp++
      a.partners.set(v.partnerId, (a.partners.get(v.partnerId) ?? 0) + 1)
      const p = get(v.partnerId)
      p.visits++
      p.asPartner++
      p.mains.add(v.memberId)
    }
  }
  const ranked = [...agg.values()].filter((a) => a.entry + a.extra > 0).sort((a, b) => b.entry + b.extra - (a.entry + a.extra) || b.visits - a.visits).slice(0, 30)
  const total = data.visits.reduce((s, v) => s + v.entry + v.extra, 0)
  const name = (id: string) => info.get(id)?.handle ?? '（不明）'

  return (
    <Card title={<>会員別売上ランキング<span className="text-[13px] font-medium text-sub">{fmtJaMonth(month)}・上位30名</span></>}
      action={<span className="text-[12px] text-sub">月の売上合計 <b className="text-ink tabular-nums">{yen(total)}</b>・来店した会員 {agg.size}名</span>} bodyClass="px-2 pt-2 pb-3">
      {ranked.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead className="bg-[#f8f6fc]">
              <tr><Th className="text-center">順位</Th><Th>会員番号</Th><Th>ハンドルネーム</Th><Th>性別</Th><Th className="text-right">来店回数</Th><Th className="text-right">入場料等</Th><Th className="text-right">ドリンク等</Th><Th className="text-right">合計</Th><Th className="text-right">構成比</Th><Th>カップル来店</Th></tr>
            </thead>
            <tbody>
              {ranked.map((a, i) => {
                const m = info.get(a.id)
                const sum = a.entry + a.extra
                return (
                  <tr key={a.id} className="border-t border-line">
                    <Td className="text-center">
                      <span className={cx('inline-flex size-7 items-center justify-center rounded-full text-[12px] font-bold', i < 3 ? 'btn-brand' : 'bg-[#f0eef4] text-sub')}>{i + 1}</span>
                    </Td>
                    <Td><Link href={`/members/${a.id}`} className="font-medium hover:text-brand">{m?.no}</Link></Td>
                    <Td className="max-w-44 truncate font-medium">{m?.handle}{m?.status === 'banned' && <Badge tone="red" className="ml-1.5">出禁</Badge>}</Td>
                    <Td className={m?.gender === '男性' ? 'text-info' : 'text-[#c8457e]'}>{m?.gender}</Td>
                    <Td className="text-right">{a.visits}回</Td>
                    <Td className="text-right">{yen(a.entry)}</Td>
                    <Td className="text-right">{a.extra ? yen(a.extra) : <span className="text-mute">—</span>}</Td>
                    <Td className="text-right font-bold">{yen(sum)}</Td>
                    <Td className="text-right text-sub">{total ? ((sum / total) * 100).toFixed(1) : '0.0'}%</Td>
                    <Td className="max-w-72 truncate text-[12px] text-sub">
                      {a.cp > 0 && <span>主として{a.cp}回（同伴：{[...a.partners].map(([id, n]) => `${name(id)}${n > 1 ? `×${n}` : ''}`).join('、')}）</span>}
                      {a.asPartner > 0 && <span className="block">同伴者として{a.asPartner}回（{[...a.mains].map(name).join('、')}）</span>}
                      {a.cp === 0 && a.asPartner === 0 && <span className="text-mute">—</span>}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty>この月の来店はありません</Empty>}
      <p className="px-3 pt-3 text-[11px] text-mute">
        合計＝入場時の会計（入場料・割引後＋入会金等）＋ドリンク・延長料金。取消は除きます。カップル来店の金額は主会員に計上し、来店回数は同伴者にも数えます。
      </p>
    </Card>
  )
}

/* ------------------------------ 料金区分別 ------------------------------ */

async function TypesTab({ month, today }: { month: string; today: string }) {
  const ctx = await requireOwner()
  const { from, to } = monthRange(month, today)
  const data = await query(async (tx) => {
    const where = and(eq(t.visits.storeId, ctx.storeId), between(t.visits.businessDate, from, to), ne(t.visits.status, 'void'))
    const groups = await tx
      .select({
        type: t.visits.dayType,
        part: t.visits.dayPart,
        cat: t.visits.category,
        cnt: sql<number>`count(*)`.mapWith(Number),
        fee: sql<number>`coalesce(sum(${t.visits.entranceFee} - ${t.visits.discount}), 0)`.mapWith(Number),
        join: sql<number>`coalesce(sum(${t.visits.joinFee} + ${t.visits.annualFee}), 0)`.mapWith(Number),
        discount: sql<number>`coalesce(sum(${t.visits.discount}), 0)`.mapWith(Number),
      })
      .from(t.visits)
      .where(where)
      .groupBy(t.visits.dayType, t.visits.dayPart, t.visits.category)
    const days = await tx
      .select({ type: t.visits.dayType, n: sql<number>`count(distinct ${t.visits.businessDate})`.mapWith(Number) })
      .from(t.visits)
      .where(where)
      .groupBy(t.visits.dayType)
    const [{ ext }] = await tx
      .select({ ext: sql<number>`coalesce(sum(${t.visitItems.amount}), 0)`.mapWith(Number) })
      .from(t.visitItems)
      .innerJoin(t.visits, eq(t.visits.id, t.visitItems.visitId))
      .where(and(eq(t.visitItems.storeId, ctx.storeId), between(t.visitItems.businessDate, from, to), eq(t.visitItems.kind, 'extension'), ne(t.visits.status, 'void')))
    const rows = await dailyRows(tx, ctx.storeId, from, to)
    return { groups, days, ext, entrance: sumRows(rows).entrance }
  }, ctx)

  const pick = (f: (g: (typeof data.groups)[number]) => boolean): TypeAgg => {
    const gs = data.groups.filter(f)
    const by = Object.fromEntries(CATS.map((c) => {
      const x = gs.filter((g) => g.cat === c)
      return [c, { cnt: x.reduce((a, g) => a + g.cnt, 0), fee: x.reduce((a, g) => a + g.fee, 0) }]
    })) as TypeAgg['by']
    const cnt = gs.reduce((a, g) => a + g.cnt, 0)
    const people = by.男性.cnt + by.女性.cnt + by.カップル.cnt * 2
    const fee = gs.reduce((a, g) => a + g.fee, 0)
    return { by, cnt, people, fee }
  }
  const types = DAY_TYPES.filter((ty) => data.groups.some((g) => g.type === ty))
  const all = pick(() => true)
  const join = data.groups.reduce((a, g) => a + g.join, 0)
  const discount = data.groups.reduce((a, g) => a + g.discount, 0)

  return (
    <Card title={<>料金区分別の内訳<span className="text-[13px] font-medium text-sub">{fmtJaMonth(month)}</span></>} bodyClass="px-2 pt-2 pb-3">
      {types.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead className="bg-[#f8f6fc]">
              <tr>
                <th rowSpan={2} className={cx(TH, 'border-b border-line text-left')}>料金区分</th>
                <th rowSpan={2} className={cx(TH, 'border-b border-line text-left')}>部</th>
                {CATS.map((c) => (
                  <th key={c} colSpan={2} className={cx(TH, 'border-l border-line text-center font-bold', c === '男性' ? 'text-info' : c === '女性' ? 'text-[#c8457e]' : 'text-brand')}>{c}</th>
                ))}
                <th colSpan={4} className={cx(TH, 'border-l border-line text-center font-bold text-ink')}>合計</th>
              </tr>
              <tr>
                {CATS.map((c) => [
                  <th key={`${c}n`} className={cx(TH, 'border-b border-l border-line text-right')}>{c === 'カップル' ? '組数' : '件数'}</th>,
                  <th key={`${c}f`} className={cx(TH, 'border-b border-line text-right')}>金額</th>,
                ])}
                <th className={cx(TH, 'border-b border-l border-line text-right')}>件数</th>
                <th className={cx(TH, 'border-b border-line text-right')}>人数</th>
                <th className={cx(TH, 'border-b border-line text-right')}>金額</th>
                <th className={cx(TH, 'border-b border-line text-right')}>平均単価</th>
              </tr>
            </thead>
            <tbody>
              {types.map((ty) => {
                const st = DAY_TYPE_STYLE[ty]
                const n = data.days.find((d) => d.type === ty)?.n ?? 0
                return [
                  ...(['昼', '夜'] as const).map((part, i) => (
                    <tr key={`${ty}${part}`} className="border-b border-line">
                      {i === 0 && (
                        <td rowSpan={3} className="border-r border-line px-3 py-2.5 align-top whitespace-nowrap">
                          <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold', st.cell)}><span className={cx('size-2 rounded-full', st.dot)} />{ty}</span>
                          <div className="mt-1 text-[11px] text-sub">{n}日</div>
                        </td>
                      )}
                      <Td className="font-medium">{part}の部</Td>
                      <Cells v={pick((g) => g.type === ty && g.part === part)} />
                    </tr>
                  )),
                  <tr key={`${ty}sub`} className="border-b-2 border-line bg-[#faf8fd]">
                    <Td className="font-bold">小計</Td>
                    <Cells v={pick((g) => g.type === ty)} strong />
                  </tr>,
                ]
              })}
              <tr className="bg-brand-soft/70">
                <Td className="font-bold text-brand">総計</Td>
                <Td className="text-[11px] text-sub">{data.days.reduce((a, d) => a + d.n, 0)}日</Td>
                <Cells v={all} strong />
              </tr>
            </tbody>
          </table>
        </div>
      ) : <Empty>この月の来店はありません</Empty>}
      <div className="mx-3 mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-[#faf8fd] px-4 py-3 text-[12px] text-sub tabular-nums">
        <span>入場料（割引後）<b className="text-ink">{yen(all.fee)}</b></span>
        <span>＋ 入会金・年会費 <b className="text-ink">{yen(join)}</b></span>
        <span>＋ 延長料金 <b className="text-ink">{yen(data.ext)}</b></span>
        <span>＝ 日報の入場料 <b className={all.fee + join + data.ext === data.entrance ? 'text-ok' : 'text-up'}>{yen(data.entrance)}</b></span>
        <span className="ml-auto">リピーター割引 −{yen(discount)}</span>
      </div>
      <p className="px-3 pt-2 text-[11px] text-mute">金額は入場料（割引後）。入会金・年会費・延長料金・ドリンクは含みません。件数はカップルを1組＝1件、人数は2名として数えます。取消は除きます。</p>
    </Card>
  )
}

const CATS = ['男性', '女性', 'カップル'] as const
interface TypeAgg {
  by: Record<(typeof CATS)[number], { cnt: number; fee: number }>
  cnt: number
  people: number
  fee: number
}

function Cells({ v, strong }: { v: TypeAgg; strong?: boolean }) {
  return (
    <>
      {CATS.map((c) => (
        <FragmentCells key={c} cnt={v.by[c].cnt} fee={v.by[c].fee} unit={c === 'カップル' ? '組' : '件'} strong={strong} />
      ))}
      <Td className={cx('border-l border-line text-right', strong && 'font-bold')}>{num(v.cnt)}件</Td>
      <Td className={cx('text-right', strong && 'font-bold')}>{num(v.people)}名</Td>
      <Td className="text-right font-bold">{yen(v.fee)}</Td>
      <Td className="text-right text-sub">{v.cnt ? yen(v.fee / v.cnt) : '—'}</Td>
    </>
  )
}

function FragmentCells({ cnt, fee, unit, strong }: { cnt: number; fee: number; unit: string; strong?: boolean }) {
  return (
    <>
      <Td className={cx('border-l border-line text-right', strong && 'font-bold', !cnt && 'text-mute')}>{num(cnt)}{unit}</Td>
      <Td className={cx('text-right', strong && 'font-bold', !fee && 'text-mute')}>{yen(fee)}</Td>
    </>
  )
}

