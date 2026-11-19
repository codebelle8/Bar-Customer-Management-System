import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { and, asc, between, eq } from 'drizzle-orm'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { Badge, Card, Empty, buttonCls, cx } from '@/components/ui'
import { Tabs } from '@/components/settings/fields'
import { MonthNav } from '@/components/sales/MonthNav'
import { isYm, isYmd } from '@/components/sales/constants'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { sortStaff } from '@/lib/attendance'
import { CASH_ITEMS, CASH_SECTIONS } from '@/lib/cash'
import { WEEK_JA, addDays, daysInMonth, fmtJaDate, fmtJaMonth, fmtMD, fmtTime, weekdayOf } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'
import { AddNoteForm, CheckRow, DeleteNoteButton, type StaffOption } from './CashForms'

export const metadata: Metadata = { title: 'レジ金' }

const TABS = [
  { key: 'day', label: '日別の確認' },
  { key: 'month', label: '月の一覧' },
] as const

export default async function CashPage({ searchParams }: PageProps<'/cash'>) {
  const ctx = await requireCtx()
  const sp = await searchParams
  const tab = sp.tab === 'month' ? 'month' : 'day'
  const today = await query(async (tx) => {
    const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    return businessDateOf(new Date(), s)
  }, ctx)
  return (
    <div key={ctx.storeId} className="animate-fade-in space-y-5">
      <Tabs items={TABS} current={tab} hrefFor={(k) => (k === 'day' ? '/cash' : '/cash?tab=month')} />
      {tab === 'day' ? (
        <DayTab today={today} date={isYmd(sp.d) && sp.d <= today ? sp.d : today} />
      ) : (
        <MonthTab today={today} month={isYm(sp.month) && sp.month <= today.slice(0, 7) ? sp.month : today.slice(0, 7)} />
      )}
    </div>
  )
}

/* ------------------------------ 日別の確認 ------------------------------ */

async function DayTab({ today, date }: { today: string; date: string }) {
  const ctx = await requireCtx()
  const data = await query(async (tx) => ({
    staff: await tx.select().from(t.staffMembers).where(eq(t.staffMembers.storeId, ctx.storeId)),
    checks: await tx.select().from(t.cashChecks).where(and(eq(t.cashChecks.storeId, ctx.storeId), eq(t.cashChecks.businessDate, date))),
    notes: await tx.select().from(t.cashNotes).where(and(eq(t.cashNotes.storeId, ctx.storeId), eq(t.cashNotes.businessDate, date))).orderBy(asc(t.cashNotes.createdAt)),
  }), ctx)
  const names = new Map(data.staff.map((m) => [m.id, m.name]))
  const options: StaffOption[] = sortStaff(data.staff.filter((m) => m.active)).map((m) => ({ id: m.id, name: m.name, kind: m.kind }))
  // 当日はスタッフも記録・取消できる。過去の日はオーナー（店舗オーナー）のみ
  const canEdit = date === today || ctx.isOwner
  const doneCount = CASH_ITEMS.filter((i) => data.checks.some((c) => c.item === i.key)).length

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/cash?d=${addDays(date, -1)}`} className={buttonCls('default')}><ChevronLeft className="size-4" />前日</Link>
        <span className="min-w-[200px] text-center text-[17px] font-bold">{fmtJaDate(date)}</span>
        {date < today ? (
          <Link href={`/cash?d=${addDays(date, 1)}`} className={buttonCls('default')}>翌日<ChevronRight className="size-4" /></Link>
        ) : (
          <span className={buttonCls('default')} aria-disabled="true" style={{ opacity: 0.4 }}>翌日<ChevronRight className="size-4" /></span>
        )}
        <Form action="/cash" className="ml-1 flex items-center gap-2">
          <input type="date" name="d" defaultValue={date} max={today} aria-label="日付を指定"
            className="h-10 rounded-lg border border-line bg-white px-2 text-[13px] tabular-nums outline-none focus:border-brand" />
          <button className={buttonCls('soft')}>表示</button>
        </Form>
        {date !== today && <Link href="/cash" className="text-[13px] font-medium text-brand hover:underline">本日へ</Link>}
        <Badge tone={doneCount === CASH_ITEMS.length ? 'green' : 'amber'} className="ml-auto">確認済み {doneCount} / {CASH_ITEMS.length}</Badge>
      </div>

      {!options.length && (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 text-[13px] text-sub">
          <Info className="size-4 text-brand" />確認した人を選ぶには、勤怠の「対象者」にスタッフを登録してください。
          {ctx.isOwner && <Link href="/attendance?tab=members" className="font-bold text-brand hover:underline">対象者を登録する</Link>}
        </p>
      )}
      {!canEdit && <p className="rounded-lg bg-page px-4 py-2.5 text-[12px] text-sub">過去の日の記録はオーナーのみ変更できます（閲覧のみ）。</p>}

      <div className="grid items-start gap-5 xl:grid-cols-3">
        {CASH_SECTIONS.map((sec) => (
          <Card key={sec.key} title={sec.label} bodyClass="space-y-2.5 px-5 pb-5">
            {sec.items.map((i) => {
              const c = data.checks.find((x) => x.item === i.key)
              return (
                <CheckRow key={i.key} date={date} item={i.key} label={i.label} staff={options} canEdit={canEdit}
                  checked={c ? { id: c.id, name: names.get(c.staffMemberId) ?? '（不明）', time: fmtTime(c.checkedAt) } : null} />
              )
            })}
          </Card>
        ))}
      </div>

      <Card title="引継ぎメモ" bodyClass="px-5 pb-5">
        {data.notes.length ? (
          <ul className="mb-4 divide-y divide-line rounded-xl border border-line" data-testid="cash-notes">
            {data.notes.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span className="w-12 shrink-0 text-[12px] text-sub tabular-nums">{fmtTime(n.createdAt)}</span>
                <span className="min-w-0 flex-1 text-[14px] break-words whitespace-pre-wrap">{n.body}</span>
                {n.staffMemberId && <span className="shrink-0 text-[12px] font-medium text-sub">{names.get(n.staffMemberId)}</span>}
                {canEdit && <DeleteNoteButton id={n.id} />}
              </li>
            ))}
          </ul>
        ) : <p className="mb-4 text-[13px] text-mute">この日のメモはありません</p>}
        {canEdit && <div className="max-w-2xl"><AddNoteForm date={date} staff={options} /></div>}
      </Card>
    </>
  )
}

/* ------------------------------ 月の一覧（シートと同じ確認項目） ------------------------------ */

async function MonthTab({ today, month }: { today: string; month: string }) {
  const ctx = await requireCtx()
  const last = month === today.slice(0, 7) ? today : `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  const data = await query(async (tx) => ({
    staff: await tx.select().from(t.staffMembers).where(eq(t.staffMembers.storeId, ctx.storeId)),
    checks: await tx.select().from(t.cashChecks).where(and(eq(t.cashChecks.storeId, ctx.storeId), between(t.cashChecks.businessDate, `${month}-01`, last))),
    notes: await tx.select({ d: t.cashNotes.businessDate }).from(t.cashNotes).where(and(eq(t.cashNotes.storeId, ctx.storeId), between(t.cashNotes.businessDate, `${month}-01`, last))),
  }), ctx)
  const names = new Map(data.staff.map((m) => [m.id, m.name]))
  const dates: string[] = []
  for (let d = `${month}-01`; d <= last; d = addDays(d, 1)) dates.push(d)
  const cell = new Map(data.checks.map((c) => [`${c.businessDate}|${c.item}`, names.get(c.staffMemberId) ?? '？']))
  const missing = dates.filter((d) => d < today).reduce((a, d) => a + CASH_ITEMS.filter((i) => !cell.has(`${d}|${i.key}`)).length, 0)
  const TH = 'px-2 py-2 text-[11px] font-medium whitespace-nowrap text-sub'

  return (
    <>
      <MonthNav month={month} max={today.slice(0, 7)} path="/cash" extra={{ tab: 'month' }} />
      <Card title={<>レジ金の確認<span className="text-[13px] font-medium text-sub">{fmtJaMonth(month)}</span></>}
        action={<span className="text-[12px] text-sub">前日までの未確認 <b className={missing ? 'text-up' : 'text-ok'}>{missing}件</b></span>} bodyClass="px-2 pt-2 pb-3">
        {dates.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12px]" data-testid="cash-month">
              <thead className="bg-[#f8f6fc]">
                <tr>
                  <th rowSpan={2} className={cx(TH, 'border-b border-line text-left')}>日付</th>
                  {CASH_SECTIONS.map((s) => <th key={s.key} colSpan={s.items.length} className={cx(TH, 'border-l border-line text-center font-bold text-ink')}>{s.label}</th>)}
                  <th rowSpan={2} className={cx(TH, 'border-b border-l border-line text-center')}>メモ</th>
                </tr>
                <tr>
                  {CASH_SECTIONS.map((s) => s.items.map((i, k) => <th key={i.key} className={cx(TH, 'border-b border-line text-center', k === 0 && 'border-l')}>{i.label}</th>))}
                </tr>
              </thead>
              <tbody>
                {[...dates].reverse().map((d) => {
                  const w = weekdayOf(d)
                  const memo = data.notes.filter((n) => n.d === d).length
                  return (
                    <tr key={d} className="border-b border-line">
                      <td className="px-2 py-2 whitespace-nowrap">
                        <Link href={`/cash?d=${d}`} className={cx('font-bold hover:text-brand', w === 0 && 'text-up', w === 6 && 'text-info')}>{fmtMD(d)}（{WEEK_JA[w]}）</Link>
                      </td>
                      {CASH_SECTIONS.map((s) => s.items.map((i, k) => {
                        const v = cell.get(`${d}|${i.key}`)
                        return (
                          <td key={i.key} className={cx('px-2 py-2 text-center whitespace-nowrap', k === 0 && 'border-l border-line', !v && d < today && 'bg-[#fff4f6] text-up')}>
                            {v ?? (d < today ? '未' : <span className="text-mute">—</span>)}
                          </td>
                        )
                      }))}
                      <td className="border-l border-line px-2 py-2 text-center">{memo ? `${memo}件` : <span className="text-mute">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>この月の記録はありません</Empty>}
        <p className="px-3 pt-2 text-[11px] text-mute">店舗の「レジ金引継ぎシート」と同じ確認項目です。各欄は確認した人の名前です。日付を押すと、その日の確認画面を開きます。</p>
      </Card>
    </>
  )
}
