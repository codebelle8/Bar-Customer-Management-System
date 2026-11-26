import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, CircleDollarSign, Coins, FileSpreadsheet, GlassWater, Info, LineChart, ReceiptText, Users } from 'lucide-react'
import { Card, Kpi, buttonCls, cx } from '@/components/ui'
import { DailyTable } from '@/components/sales/DailyTable'
import { DaySummary, DayTypeBadge, ExpensePanel } from '@/components/sales/DayDetail'
import { Drawer } from '@/components/sales/Drawer'
import { MonthNav } from '@/components/sales/MonthNav'
import { isYm, isYmd } from '@/components/sales/constants'
import { query, requireCtx } from '@/lib/dal'
import { fmtJaDate, fmtJaMonth, fmtMD, num, WEEK_JA, weekdayOf, yen } from '@/lib/format'
import { dailyRows, sumRows } from '@/lib/stats'
import { businessToday, loadDay, monthRange, staffDates } from './data'

export const metadata: Metadata = { title: '売上管理' }

type SP = Record<string, string | string[] | undefined>

export default async function SalesPage({ searchParams }: PageProps<'/sales'>) {
  const sp = await searchParams
  const ctx = await requireCtx()
  return <div className="animate-fade-in space-y-5">{ctx.isOwner ? <OwnerView sp={sp} /> : <StaffView sp={sp} />}</div>
}

/* ------------------------------ オーナー：月の日報 ------------------------------ */

async function OwnerView({ sp }: { sp: SP }) {
  const ctx = await requireCtx()
  const today = await query((tx) => businessToday(tx, ctx.storeId), ctx)
  const cur = today.slice(0, 7)
  const date = isYmd(sp.date) && sp.date <= today ? sp.date : null
  const month = isYm(sp.month) && sp.month <= cur ? sp.month : (date?.slice(0, 7) ?? cur)
  const { from, to } = monthRange(month, today)
  const data = await query(async (tx) => {
    const rows = await dailyRows(tx, ctx.storeId, from, to)
    const day = date ? await loadDay(tx, ctx.storeId, date) : null
    return { rows, day }
  }, ctx)
  const s = sumRows(data.rows)
  const cash = s.total - s.expense - s.parttime
  const base = `/sales?month=${month}`
  const open = data.rows.filter((r) => r.visits > 0).length

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav month={month} max={cur} path="/sales" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href={`/reports?month=${month}`} className={buttonCls('outline')}><LineChart className="size-4" />総括・レポート</Link>
          <a href={`/api/export/monthly?month=${month}`} className={buttonCls('brand')}><FileSpreadsheet className="size-4" />Excel出力</a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={<CircleDollarSign className="size-5" />} label="総売上" value={yen(s.total)} sub={`昼 ${yen(s.salesDay)} / 夜 ${yen(s.salesNight)}`} />
        <Kpi icon={<GlassWater className="size-5" />} label="入場料 / ドリンク" value={<span className="text-[22px]">{yen(s.entrance)}</span>} sub={`ドリンク ${yen(s.drinkTotal)}（午前 ${num(s.drinkDay)}・午後 ${num(s.drinkNight)}）`} />
        <Kpi icon={<Users className="size-5" />} label="計人数" value={num(s.people)} unit="名" sub={`男性 ${s.male}・女性 ${s.female}・CP ${s.cp}組・新規 ${s.newMembers}名`} />
        <Kpi icon={<ReceiptText className="size-5" />} label="経費" value={yen(s.expense)} sub={`税金 ${yen(s.tax)}・アルバイト ${yen(s.parttime)}`} />
        <Kpi icon={<Coins className="size-5" />} label="現金残（▲イベ経費）" value={yen(cash)} sub="総売上 − 経費 − アルバイト" />
      </div>

      <Card bodyClass="p-0"
        title={<>日報（{fmtJaMonth(month)}）<span className="text-[12px] font-normal text-sub">{fmtMD(from)}〜{fmtMD(to)}・営業{open}日</span></>}
        action={<span className="hidden items-center gap-1.5 text-[12px] text-sub md:flex"><Info className="size-3.5" />日付を押すと、その日の内訳と経費入力を開きます</span>}>
        <div className="mt-3 border-t border-line">
          <DailyTable rows={data.rows} total={s} selected={date} hrefFor={(d) => `${base}&date=${d}`} />
        </div>
      </Card>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-sub">
        <span>午前ドリンク＝昼の部、午後ドリンク＝夜の部のドリンク</span>
        <span>入場料＝入場料（割引後）＋入会金等＋延長料金</span>
        <span>計人数＝男性＋女性＋カップル×2</span>
        <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-[#e6f0ff]" />土曜</span>
        <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-[#fde7eb]" />日曜・祝日</span>
      </p>

      {data.day && (
        <Drawer closeHref={base} title={fmtJaDate(data.day.date)} sub={<DayTypeBadge info={data.day.info} />}>
          <DaySummary data={data.day} />
          <ExpensePanel data={data.day} canDelete={() => true} showNames />
        </Drawer>
      )}
    </>
  )
}

/* ------------------------------ スタッフ：本日と前営業日 ------------------------------ */

async function StaffView({ sp }: { sp: SP }) {
  const ctx = await requireCtx()
  const today = await query((tx) => businessToday(tx, ctx.storeId), ctx)
  const dates = staffDates(today)
  const date = typeof sp.date === 'string' && dates.includes(sp.date) ? sp.date : today
  const day = await query((tx) => loadDay(tx, ctx.storeId, date), ctx)
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid w-full grid-cols-2 gap-2 rounded-xl border border-line bg-white p-1.5 sm:w-auto" role="tablist">
          {dates.map((d, i) => (
            <Link key={d} href={i === 0 ? '/sales' : `/sales?date=${d}`} role="tab" aria-selected={d === date}
              className={cx('flex min-w-0 flex-col items-center rounded-lg px-2 py-2 transition sm:min-w-[170px] sm:px-4', d === date ? 'btn-brand' : 'text-sub hover:bg-page')}>
              <span className="text-[12px] font-medium opacity-90">{i === 0 ? '本日（営業日）' : '前営業日'}</span>
              <span className="text-[16px] font-bold tabular-nums">{fmtMD(d)}（{WEEK_JA[weekdayOf(d)]}）</span>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5 text-brand" />
          <span className="text-[16px] font-bold">{fmtJaDate(date)}</span>
          <DayTypeBadge info={day.info} />
        </div>
      </div>
      <p className="flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-[12px] text-sub">
        <Info className="size-4 shrink-0 text-brand" />
        スタッフは本日と前営業日の内容のみ確認・入力できます。削除できるのは自分が入力した項目だけです。月の集計はオーナーが確認します。
      </p>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-5"><DaySummary data={day} /></div>
        <ExpensePanel data={day} canDelete={(e) => e.staffId === ctx.user.id} showNames={false} />
      </div>
    </>
  )
}
