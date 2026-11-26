import type { Metadata } from 'next'
import Link from 'next/link'
import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Banknote, ChevronRight, CircleDollarSign, Coins, FileText, Gift, GlassWater, Plus, ReceiptText, Search, Settings, Users } from 'lucide-react'
import { SalesTrendChart, Legend } from '@/components/charts'
import { CalendarLegend, PriceCalendar } from '@/components/PriceCalendar'
import { VisitStatusBadge } from '@/components/VisitStatusBadge'
import { Badge, Card, Empty, Kpi, Td, Th, buttonCls, cx } from '@/components/ui'
import * as t from '@/db/schema'
import { autoCheckout } from '@/lib/autoCheckout'
import { loadPricing, query, requireCtx } from '@/lib/dal'
import { addDays, addMonths, fmtJaMonth, fmtMD, fmtTime, monthDates, num, pct, WEEK_JA, weekdayOf, yen } from '@/lib/format'
import { businessDateOf, dayInfo } from '@/lib/pricing'
import { dailyRows, sumRows, visitCounts } from '@/lib/stats'
import { Tabs } from '@/components/settings/fields'

export const metadata: Metadata = { title: 'ダッシュボード' }

const TABS = [
  { key: 'today', label: '本日の状況' },
  { key: 'month', label: '今月の集計' },
  { key: 'visits', label: '来店一覧' },
] as const

const ym = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) ? s : null)
const ymd = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)

export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  const sp = await searchParams
  const ctx = await requireCtx()
  // 月間の集計（売上合計）はオーナーのみ。スタッフは本日の状況と来店一覧
  const tabs = TABS.filter((x) => ctx.isOwner || x.key !== 'month')
  const tab = tabs.some((x) => x.key === sp.tab) ? (sp.tab as (typeof TABS)[number]['key']) : 'today'
  const today = await query(async (tx) => {
    const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    await autoCheckout(tx, ctx.storeId, s)
    return businessDateOf(new Date(), s)
  }, ctx)
  return (
    <div className="animate-fade-in space-y-5">
      {sp.denied && (
        <p className="rounded-lg border border-[#f2c2cb] bg-[#fff4f6] px-4 py-2.5 text-[13px] text-up">この画面はオーナーのみ利用できます。</p>
      )}
      <Tabs items={tabs} current={tab} hrefFor={(k) => (k === 'today' ? '/dashboard' : `/dashboard?tab=${k}`)} />
      {tab === 'today' && <TodayTab today={today} cal={ym(sp.cal) ?? today.slice(0, 7)} />}
      {tab === 'month' && <MonthTab today={today} month={ym(sp.month) ?? today.slice(0, 7)} />}
      {tab === 'visits' && <VisitsTab today={today} date={ymd(sp.date) ?? today} />}
    </div>
  )
}

/* ------------------------------ 本日の状況 ------------------------------ */

async function TodayTab({ today, cal }: { today: string; cal: string }) {
  const ctx = await requireCtx()
  const partner = alias(t.members, 'partner')
  const data = await query(async (tx) => {
    const { settings, overrides } = await loadPricing(tx, ctx.storeId)
    const week = await dailyRows(tx, ctx.storeId, addDays(today, -6), today)
    const monthStart = `${today.slice(0, 7)}-01`
    const month = sumRows(await dailyRows(tx, ctx.storeId, monthStart, today))
    const recent = await tx
      .select({
        id: t.visits.id, status: t.visits.status, isNew: t.visits.isNew, category: t.visits.category,
        checkedInAt: t.visits.checkedInAt, checkedOutAt: t.visits.checkedOutAt, entryTotal: t.visits.entryTotal, extraTotal: t.visits.extraTotal,
        memberId: t.members.id, memberNo: t.members.memberNo, handle: t.members.handleName, gender: t.members.gender, partnerHandle: partner.handleName,
      })
      .from(t.visits)
      .innerJoin(t.members, eq(t.members.id, t.visits.memberId))
      .leftJoin(partner, eq(partner.id, t.visits.partnerMemberId))
      .where(and(eq(t.visits.storeId, ctx.storeId), eq(t.visits.businessDate, today), ne(t.visits.status, 'void')))
      .orderBy(desc(sql`greatest(${t.visits.checkedInAt}, coalesce(${t.visits.checkedOutAt}, ${t.visits.checkedInAt}))`))
      .limit(8)
    // リピーター割引の対象（割引・特典画面と同じ数え方）
    //   今月の割引対象＝前月の来店が規定回数以上、来月の割引対象（予定）＝今月の来店が規定回数以上
    const prevStart = `${addMonths(today.slice(0, 7), -1)}-01`
    const prevCounts = await visitCounts(tx, ctx.storeId, prevStart, addDays(monthStart, -1))
    const counts = await visitCounts(tx, ctx.storeId, monthStart, today)
    const targets = await tx.select({ id: t.members.id }).from(t.members)
      .where(and(eq(t.members.storeId, ctx.storeId), eq(t.members.gender, settings.discountGender as '男性' | '女性'), eq(t.members.status, 'active')))
    const eligibleNow = targets.filter((m) => (prevCounts.get(m.id) ?? 0) >= settings.discountMinVisits).length
    const eligible = targets.filter((m) => (counts.get(m.id) ?? 0) >= settings.discountMinVisits).length
    const days = monthDates(cal).map((d) => dayInfo(d, settings, overrides))
    return { settings, week, month, recent, eligibleNow, eligible, days }
  }, ctx)

  const todayRow = data.week[data.week.length - 1]
  const mCur = +today.slice(5, 7)
  const mPrev = +addMonths(today.slice(0, 7), -1).slice(5, 7)
  const mNext = +addMonths(today.slice(0, 7), 1).slice(5, 7)
  const cash = data.month.total - data.month.expense - data.month.parttime
  const trend = data.week.map((r) => ({ label: `${fmtMD(r.date)}(${WEEK_JA[weekdayOf(r.date)]})`, day: r.salesDay, night: r.salesNight, total: r.total }))

  return (
    <>
      <div className={cx('grid gap-4 sm:grid-cols-2', ctx.isOwner ? 'xl:grid-cols-5' : 'xl:grid-cols-4')}>
        <div className="card px-5 py-4">
          <div className="flex items-center gap-2.5 text-[14px] font-bold whitespace-nowrap"><Users className="size-5 text-brand" />本日の来店数</div>
          <div className="mt-2 flex items-end justify-between gap-3">
          <div className="flex items-end gap-1"><span className="text-[28px] leading-none font-bold">{num(todayRow.people)}</span><span className="pb-0.5 text-[14px] font-bold">名</span></div>
          <dl className="space-y-0.5 text-[12px]">
            <div className="flex justify-between gap-3"><dt className="text-info">男性</dt><dd className="font-bold tabular-nums">{todayRow.male}名</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#c8457e]">女性</dt><dd className="font-bold tabular-nums">{todayRow.female}名</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-brand">カップル</dt><dd className="font-bold tabular-nums">{todayRow.cp}組</dd></div>
          </dl>
          </div>
        </div>
        <Kpi icon={<CircleDollarSign className="size-5" />} label="本日の売上" value={yen(todayRow.total)} sub={`（昼 ${yen(todayRow.salesDay)} / 夜 ${yen(todayRow.salesNight)}）`} />
        <Kpi icon={<GlassWater className="size-5" />} label="ドリンク売上" value={yen(todayRow.drinkTotal)} sub={`入場料 ${yen(todayRow.entrance)}`} />
        <Kpi icon={<FileText className="size-5" />} label="経費" value={yen(todayRow.expense)} sub={todayRow.memo || '本日の経費入力なし'} />
        {ctx.isOwner && <Kpi icon={<Coins className="size-5" />} label="現金残高" value={yen(cash)} sub={`${+today.slice(5, 7)}月の総売上 − 経費 − アルバイト`} />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card title="売上推移（直近7日）" action={<Legend />}>
          <SalesTrendChart data={trend} />
        </Card>
        <Card title="料金カレンダー">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <PriceCalendar month={cal} days={data.days} today={today} compact hrefFor={(m) => `/dashboard?cal=${m}`} />
            </div>
            <div className="flex shrink-0 flex-col justify-between gap-4 sm:w-36">
              <CalendarLegend className="sm:mt-10" />
              {ctx.isOwner && (
                <Link href="/pricing" className={buttonCls('outline')}><Settings className="size-4" />料金設定</Link>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.8fr)]">
        <Card title="本日の来店受付">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/reception/new" className="btn-brand flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-center text-[13px] leading-snug font-bold [word-break:keep-all]">
              <Plus className="size-7 shrink-0" /><span>新規入会・<wbr />来店受付</span>
            </Link>
            <Link href="/reception/checkin" className="btn-brand-soft flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-center text-[13px] leading-snug font-bold [word-break:keep-all]">
              <Search className="size-7 shrink-0" /><span>既存会員の<wbr />来店受付</span>
            </Link>
          </div>
          <h3 className="section-title mt-5 mb-3 text-[15px]">本日の会計</h3>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/reception/checkout" className={buttonCls('outline', 'lg')}><ReceiptText className="size-4" />退店・追加精算</Link>
            <Link href="/reception/order" className={buttonCls('outline', 'lg')}><GlassWater className="size-4" />ドリンク注文</Link>
          </div>
        </Card>

        <Card title="最近の来店履歴" action={<Link href="/dashboard?tab=visits" className="flex items-center text-[13px] font-medium text-brand">すべて見る<ChevronRight className="size-4" /></Link>} bodyClass="px-2 pt-2 pb-3">
          {data.recent.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-[#f8f6fc]"><tr><Th>時間</Th><Th>会員番号</Th><Th>ハンドルネーム</Th><Th>性別</Th><Th>区分</Th><Th className="text-right">会計</Th><Th>ステータス</Th></tr></thead>
                <tbody>
                  {data.recent.map((v) => (
                    <tr key={v.id} className="border-t border-line">
                      <Td className="tabular-nums">{fmtTime(v.status === 'out' ? v.checkedOutAt : v.checkedInAt)}</Td>
                      <Td><Link href={`/members/${v.memberId}`} className="font-medium tabular-nums hover:text-brand">{v.memberNo}</Link>{v.isNew && <Badge tone="purple" className="ml-1.5">新規</Badge>}</Td>
                      <Td className="max-w-40 truncate">{v.handle}{v.partnerHandle && <span className="text-sub"> ＋{v.partnerHandle}</span>}</Td>
                      <Td>{v.category === 'カップル' ? 'カップル' : v.gender}</Td>
                      <Td>{v.status === 'out' ? '退店' : v.isNew ? '入会' : '入店'}</Td>
                      <Td className="text-right font-medium tabular-nums">{yen(v.entryTotal + v.extraTotal)}</Td>
                      <Td>{v.status === 'out' ? <Badge tone="green">精算済</Badge> : <Badge tone="blue">入店中</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>本日の来店はまだありません</Empty>}
        </Card>

        <Card title="リピーター特典">
          <div className="grid grid-cols-2 divide-x divide-line rounded-xl border border-line py-4 text-center" data-testid="repeater-counts">
            <div className="px-2">
              <p className="text-[13px] font-bold">{mCur}月の割引対象</p>
              <p className="mt-1"><span className="text-[28px] font-bold">{data.eligibleNow}</span><span className="ml-1 text-[13px] font-bold">名</span></p>
              <p className="text-[11px] text-sub">{mPrev}月に{data.settings.discountMinVisits}回以上来店</p>
            </div>
            <div className="px-2">
              <p className="text-[13px] font-bold">{mNext}月の割引対象（予定）</p>
              <p className="mt-1"><span className="text-[28px] font-bold">{data.eligible}</span><span className="ml-1 text-[13px] font-bold">名</span></p>
              <p className="text-[11px] text-sub">{mCur}月に{data.settings.discountMinVisits}回以上来店</p>
            </div>
          </div>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-sub"><Gift className="size-4 text-brand" />{data.settings.discountGender}の会員・入場料から{yen(data.settings.discountAmount)}引き</p>
          <Link href="/discounts" className={cx(buttonCls('outline'), 'mt-4 w-full')}>対象者一覧<ChevronRight className="size-4" /></Link>
        </Card>
      </div>
    </>
  )
}

/* ------------------------------ 今月の集計 ------------------------------ */

function Diff({ cur, before }: { cur: number; before: number }) {
  if (!before) return <span className="text-mute">前月データなし</span>
  const d = pct(cur, before)
  return <span className={d >= 0 ? 'text-ok' : 'text-up'}>前月同期比 {d >= 0 ? '+' : ''}{d}%</span>
}

async function MonthTab({ today, month }: { today: string; month: string }) {
  const ctx = await requireCtx()
  const end = month === today.slice(0, 7) ? today : `${month}-${monthDates(month).length}`
  const prev = addMonths(month, -1)
  const data = await query(async (tx) => {
    const rows = await dailyRows(tx, ctx.storeId, `${month}-01`, end)
    // 前月の同じ期間と比較
    const prevEnd = `${prev}-${String(Math.min(+end.slice(8), monthDates(prev).length)).padStart(2, '0')}`
    const prevRows = await dailyRows(tx, ctx.storeId, `${prev}-01`, prevEnd)
    return { rows, sum: sumRows(rows), prevSum: sumRows(prevRows) }
  }, ctx)
  const s = data.sum
  const p = data.prevSum
  const trend = data.rows.map((r) => ({ label: fmtMD(r.date), day: r.salesDay, night: r.salesNight, total: r.total }))
  const open = data.rows.filter((r) => r.visits > 0).length || 1
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/dashboard?tab=month&month=${prev}`} className={buttonCls('default', 'sm')}>‹ 前月</Link>
        <span className="text-[17px] font-bold">{fmtJaMonth(month)}</span>
        {month < today.slice(0, 7) && <Link href={`/dashboard?tab=month&month=${addMonths(month, 1)}`} className={buttonCls('default', 'sm')}>翌月 ›</Link>}
        <span className="text-[12px] text-sub">（{fmtMD(`${month}-01`)}〜{fmtMD(end)}・営業{open}日）</span>
        <Link href={`/sales?month=${month}`} className={cx(buttonCls('outline', 'sm'), 'ml-auto')}>日報を開く</Link>
      </div>
      <div className={cx('grid gap-4 sm:grid-cols-2', ctx.isOwner ? 'xl:grid-cols-5' : 'xl:grid-cols-4')}>
        <Kpi icon={<CircleDollarSign className="size-5" />} label="総売上" value={yen(s.total)} sub={<Diff cur={s.total} before={p.total} />} />
        <Kpi icon={<Banknote className="size-5" />} label="昼売上 / 夜売上"
          value={<span className="block space-y-1 text-[18px] leading-tight"><span className="block"><span className="mr-2 text-[12px] text-sub">昼</span>{yen(s.salesDay)}</span><span className="block"><span className="mr-2 text-[12px] text-sub">夜</span>{yen(s.salesNight)}</span></span>}
          sub={`ドリンク ${yen(s.drinkTotal)}`} />
        <Kpi icon={<Users className="size-5" />} label="計人数" value={num(s.people)} unit="名" sub={<><span className="block">男性{s.male}・女性{s.female}・CP{s.cp}組</span><Diff cur={s.people} before={p.people} /></>} />
        <Kpi icon={<Plus className="size-5" />} label="新規獲得" value={num(s.newMembers)} unit="名" sub={`1日平均 ${yen(Math.round(s.total / open))}`} />
        {ctx.isOwner && <Kpi icon={<Coins className="size-5" />} label="現金残（▲経費）" value={yen(s.total - s.expense - s.parttime)} sub={`経費 ${yen(s.expense)}・アルバイト ${yen(s.parttime)}`} />}
      </div>
      <Card title="日別の売上" action={<Legend />}>
        <SalesTrendChart data={trend} height={300} barSize={16} />
      </Card>
      <Card title="昼の部・夜の部">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line"><Th /><Th className="text-right">男性</Th><Th className="text-right">女性</Th><Th className="text-right">カップル</Th><Th className="text-right">入場料</Th><Th className="text-right">ドリンク</Th><Th className="text-right">売上</Th></tr></thead>
            <tbody className="tabular-nums">
              <tr className="border-b border-line"><Td className="font-medium">昼の部</Td><Td className="text-right">{s.maleDay}</Td><Td className="text-right">{s.femaleDay}</Td><Td className="text-right">{s.cpDay}</Td><Td className="text-right">{yen(s.entranceDay)}</Td><Td className="text-right">{yen(s.drinkDay)}</Td><Td className="text-right font-bold">{yen(s.salesDay)}</Td></tr>
              <tr className="border-b border-line"><Td className="font-medium">夜の部</Td><Td className="text-right">{s.maleNight}</Td><Td className="text-right">{s.femaleNight}</Td><Td className="text-right">{s.cpNight}</Td><Td className="text-right">{yen(s.entranceNight)}</Td><Td className="text-right">{yen(s.drinkNight)}</Td><Td className="text-right font-bold">{yen(s.salesNight)}</Td></tr>
              <tr><Td className="font-bold">合計</Td><Td className="text-right font-bold">{s.male}</Td><Td className="text-right font-bold">{s.female}</Td><Td className="text-right font-bold">{s.cp}</Td><Td className="text-right font-bold">{yen(s.entrance)}</Td><Td className="text-right font-bold">{yen(s.drinkTotal)}</Td><Td className="text-right font-bold">{yen(s.total)}</Td></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/* ------------------------------ 来店一覧 ------------------------------ */

async function VisitsTab({ today, date }: { today: string; date: string }) {
  const ctx = await requireCtx()
  const partner = alias(t.members, 'partner')
  const staff = alias(t.users, 'staff')
  const rows = await query(
    (tx) =>
      tx
        .select({
          v: t.visits,
          memberNo: t.members.memberNo, handle: t.members.handleName, gender: t.members.gender,
          partnerNo: partner.memberNo, partnerHandle: partner.handleName, staffName: staff.name,
          extra: sql<number>`(select coalesce(sum(${t.visitItems.amount}), 0) from ${t.visitItems} where ${t.visitItems.visitId} = ${t.visits.id})`.mapWith(Number),
        })
        .from(t.visits)
        .innerJoin(t.members, eq(t.members.id, t.visits.memberId))
        .leftJoin(partner, eq(partner.id, t.visits.partnerMemberId))
        .leftJoin(staff, eq(staff.id, t.visits.staffId))
        .where(and(eq(t.visits.storeId, ctx.storeId), gte(t.visits.businessDate, date), lte(t.visits.businessDate, date)))
        .orderBy(desc(t.visits.checkedInAt)),
    ctx,
  )
  const live = rows.filter((r) => r.v.status !== 'void')
  const total = live.reduce((a, r) => a + r.v.entryTotal + r.extra, 0)
  return (
    <Card bodyClass="p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <Link href={`/dashboard?tab=visits&date=${addDays(date, -1)}`} className={buttonCls('default', 'sm')}>‹ 前日</Link>
        <form className="flex items-center gap-2">
          <input type="hidden" name="tab" value="visits" />
          <input type="date" name="date" defaultValue={date} max={today} className="h-8 rounded-lg border border-line px-2 text-[13px]" />
          <button className={buttonCls('default', 'sm')}>表示</button>
        </form>
        {date < today && <Link href={`/dashboard?tab=visits&date=${addDays(date, 1)}`} className={buttonCls('default', 'sm')}>翌日 ›</Link>}
        <span className="ml-auto text-[13px] text-sub">{live.length}件・合計 <b className="text-ink">{yen(total)}</b></span>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#f8f6fc]">
              <tr><Th>入店</Th><Th>退店</Th><Th>会員番号</Th><Th>ハンドルネーム</Th><Th>区分</Th><Th>部</Th><Th>料金区分</Th><Th className="text-right">入場料</Th><Th className="text-right">割引</Th><Th className="text-right">入会金等</Th><Th className="text-right">追加</Th><Th className="text-right">合計</Th><Th>状態</Th><Th>受付</Th></tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map(({ v, ...r }) => (
                <tr key={v.id} className={cx('border-t border-line', v.status === 'void' && 'text-mute line-through')}>
                  <Td>{fmtTime(v.checkedInAt)}</Td>
                  <Td>{fmtTime(v.checkedOutAt)}</Td>
                  <Td><Link href={`/members/${v.memberId}`} className="font-medium hover:text-brand">{r.memberNo}</Link>{v.isNew && <Badge tone="purple" className="ml-1.5">新規</Badge>}</Td>
                  <Td className="max-w-48 truncate">{r.handle}{r.partnerHandle && <span className="text-sub"> ＋{r.partnerHandle}（{r.partnerNo}）</span>}</Td>
                  <Td>{v.category}</Td>
                  <Td>{v.dayPart}</Td>
                  <Td>{v.dayType}</Td>
                  <Td className="text-right">{yen(v.entranceFee)}</Td>
                  <Td className="text-right">{v.discount ? <span className="text-up">−{yen(v.discount)}</span> : '—'}</Td>
                  <Td className="text-right">{v.joinFee + v.annualFee ? yen(v.joinFee + v.annualFee) : '—'}</Td>
                  <Td className="text-right">{r.extra ? yen(r.extra) : '—'}</Td>
                  <Td className="text-right font-bold">{yen(v.entryTotal + r.extra)}</Td>
                  <Td><VisitStatusBadge status={v.status} auto={v.autoCheckout} /></Td>
                  <Td className="text-sub">{r.staffName ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>この日の来店記録はありません</Empty>}
    </Card>
  )
}
