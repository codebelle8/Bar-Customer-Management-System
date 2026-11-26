import type { Metadata } from 'next'
import Link from 'next/link'
import { and, asc, between, eq, isNull, or } from 'drizzle-orm'
import { FileSpreadsheet, UserCog } from 'lucide-react'
import { Badge, Card, Empty, Td, Th, buttonCls, cx } from '@/components/ui'
import { Tabs } from '@/components/settings/fields'
import { MonthNav } from '@/components/sales/MonthNav'
import { isYm } from '@/components/sales/constants'
import * as t from '@/db/schema'
import { query, requireCtx, requireOwner } from '@/lib/dal'
import { STAFF_KINDS, fmtClock, fmtHm, sortStaff, toHours, toJstLocal, workMinutes } from '@/lib/attendance'
import { WEEK_JA, daysInMonth, fmtJaDate, fmtJaMonth, fmtMD, weekdayOf } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'
import { AddRecordForm, AddStaffMemberForm, LiveClock, PunchBoard, RecordRow, StaffMemberRow, type PunchItem, type RecordRowData } from './AttendanceForms'

export const metadata: Metadata = { title: '勤怠' }

const TABS = [
  { key: 'punch', label: '打刻' },
  { key: 'month', label: '月別集計' },
  { key: 'members', label: '対象者' },
] as const
type Tab = (typeof TABS)[number]['key']

export default async function AttendancePage({ searchParams }: PageProps<'/attendance'>) {
  const ctx = await requireCtx()
  const sp = await searchParams
  // 月別集計・対象者の管理はオーナー（店舗オーナーは所属店舗のみ）。スタッフは打刻のみ
  const tabs = TABS.filter((x) => ctx.isOwner || x.key === 'punch')
  const tab: Tab = tabs.find((x) => x.key === sp.tab)?.key ?? 'punch'
  return (
    <div key={ctx.storeId} className="animate-fade-in space-y-5">
      {tabs.length > 1 && <Tabs items={tabs} current={tab} hrefFor={(k) => (k === 'punch' ? '/attendance' : `/attendance?tab=${k}`)} />}
      {tab === 'punch' && <PunchTab />}
      {tab === 'month' && <MonthTab month={isYm(sp.month) ? sp.month : null} staffId={typeof sp.staff === 'string' ? sp.staff : null} />}
      {tab === 'members' && <MembersTab />}
    </div>
  )
}

const dayLabel = (d: string) => `${fmtMD(d)}（${WEEK_JA[weekdayOf(d)]}）`

/* ------------------------------ 打刻 ------------------------------ */

async function PunchTab() {
  const ctx = await requireCtx()
  const data = await query(async (tx) => {
    const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    const today = businessDateOf(new Date(), s)
    const staff = await tx.select().from(t.staffMembers).where(and(eq(t.staffMembers.storeId, ctx.storeId), eq(t.staffMembers.active, true)))
    // 本日の記録と、退勤していない記録（前日からの出勤中を含む）
    const recs = await tx
      .select()
      .from(t.attendance)
      .where(and(eq(t.attendance.storeId, ctx.storeId), or(eq(t.attendance.businessDate, today), isNull(t.attendance.clockOut))))
      .orderBy(asc(t.attendance.clockIn))
    return { today, staff: sortStaff(staff), recs }
  }, ctx)
  const now = new Date()
  const name = new Map(data.staff.map((m) => [m.id, m]))
  const items: PunchItem[] = data.staff.map((m) => {
    const open = data.recs.find((r) => r.staffMemberId === m.id && !r.clockOut)
    const done = data.recs.filter((r) => r.staffMemberId === m.id && r.clockOut && r.businessDate === data.today)
    const last = done.at(-1)
    const status = open
      ? `勤務中　${fmtClock(open.clockIn, open.businessDate)}〜（${fmtHm(workMinutes(open.clockIn, now) ?? 0)}）`
      : done.length
        ? `退勤済　${done.map((r) => `${fmtClock(r.clockIn, r.businessDate)}〜${fmtClock(r.clockOut, r.businessDate)}`).join('、')}`
        : '未出勤'
    const warn = open && open.businessDate < data.today ? `${fmtMD(open.businessDate)}の退勤が記録されていません` : undefined
    return {
      id: m.id, name: m.name, kind: m.kind, status, warn,
      state: open ? '勤務中' : done.length ? '退勤済' : '未出勤',
      clockIn: open ? fmtClock(open.clockIn, open.businessDate) : last ? fmtClock(last.clockIn, last.businessDate) : '—',
      clockOut: open ? '—' : last ? fmtClock(last.clockOut, last.businessDate) : '—',
    }
  })
  const groups = STAFF_KINDS.map((kind) => {
    const n = items.filter((i) => i.kind === kind).length
    return { kind, note: `${n}名${kind === 'アルバイト' ? '・名前順' : ''}` }
  })
  const todays = data.recs.filter((r) => r.businessDate === data.today && name.has(r.staffMemberId))
  const closedMin = todays.reduce((a, r) => a + (workMinutes(r.clockIn, r.clockOut) ?? 0), 0)

  return (
    <>
      <Card title={<>本日の打刻<span className="text-[13px] font-medium text-sub">{fmtJaDate(data.today)}</span></>}
        action={<span className="flex items-center gap-2 text-[12px] text-sub">現在時刻<LiveClock /></span>}>
        {items.length ? (
          <PunchBoard items={items} groups={groups} />
        ) : (
          <Empty>
            勤怠の対象者が登録されていません。
            {ctx.isOwner && <Link href="/attendance?tab=members" className="ml-1 font-bold text-brand hover:underline">対象者を登録する</Link>}
          </Empty>
        )}
      </Card>

      <Card title="本日の記録" action={<span className="text-[12px] text-sub">退勤済の合計 <b className="text-ink tabular-nums">{fmtHm(closedMin)}</b></span>} bodyClass="px-2 pt-2 pb-3">
        {todays.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" data-testid="today-records">
              <thead className="bg-[#f8f6fc]"><tr><Th>名前</Th><Th>区分</Th><Th>出勤</Th><Th>退勤</Th><Th className="text-right">勤務時間</Th></tr></thead>
              <tbody className="tabular-nums">
                {todays.map((r) => {
                  const m = name.get(r.staffMemberId)!
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <Td className="font-medium">{m.name}</Td>
                      <Td className="text-sub">{m.kind}</Td>
                      <Td>{fmtClock(r.clockIn, r.businessDate)}</Td>
                      <Td>{r.clockOut ? fmtClock(r.clockOut, r.businessDate) : <Badge tone="green">勤務中</Badge>}</Td>
                      <Td className="text-right">{r.clockOut ? fmtHm(workMinutes(r.clockIn, r.clockOut) ?? 0) : <span className="text-sub">{fmtHm(workMinutes(r.clockIn, now) ?? 0)}〜</span>}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>本日の記録はまだありません</Empty>}
        <p className="px-3 pt-2 text-[11px] text-mute">打刻の時刻はサーバーの時計で記録します。打ち忘れ・押し間違いは、オーナーが「月別集計」から修正できます。</p>
      </Card>
    </>
  )
}

/* ------------------------------ 月別集計 ------------------------------ */

async function MonthTab({ month, staffId }: { month: string | null; staffId: string | null }) {
  const ctx = await requireOwner()
  const data = await query(async (tx) => {
    const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    const today = businessDateOf(new Date(), s)
    const cur = today.slice(0, 7)
    const m = month && month <= cur ? month : cur
    const staff = await tx.select().from(t.staffMembers).where(eq(t.staffMembers.storeId, ctx.storeId))
    const recs = await tx
      .select()
      .from(t.attendance)
      .where(and(eq(t.attendance.storeId, ctx.storeId), between(t.attendance.businessDate, `${m}-01`, `${m}-${String(daysInMonth(m)).padStart(2, '0')}`)))
      .orderBy(asc(t.attendance.clockIn))
    return { today, cur, month: m, staff: sortStaff(staff), recs }
  }, ctx)

  const rows = data.staff
    .map((m) => {
      const rs = data.recs.filter((r) => r.staffMemberId === m.id)
      const minutes = rs.reduce((a, r) => a + (workMinutes(r.clockIn, r.clockOut) ?? 0), 0)
      return { m, days: new Set(rs.map((r) => r.businessDate)).size, minutes, open: rs.filter((r) => !r.clockOut).length, count: rs.length }
    })
    .filter((r) => r.m.active || r.count > 0)
  const total = rows.reduce((a, r) => ({ minutes: a.minutes + r.minutes, open: a.open + r.open }), { minutes: 0, open: 0 })
  const selected = data.staff.find((m) => m.id === staffId)
  const href = (id?: string) => `/attendance?${new URLSearchParams({ tab: 'month', month: data.month, ...(id ? { staff: id } : {}) })}`

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav month={data.month} max={data.cur} path="/attendance" extra={{ tab: 'month', ...(selected ? { staff: selected.id } : {}) }} />
        {/* ファイルのダウンロード（Link だと先読みで出力が走るため a 要素を使う） */}
        <a href={`/api/export/attendance?month=${data.month}`} className={cx(buttonCls('brand'), 'ml-auto')} data-testid="attendance-xlsx"><FileSpreadsheet className="size-4" />Excel出力</a>
      </div>

      <Card title={<>勤怠の集計<span className="text-[13px] font-medium text-sub">{fmtJaMonth(data.month)}</span></>}
        action={data.month === data.cur ? <Badge tone="amber">集計中（{fmtMD(data.today)}まで）</Badge> : undefined} bodyClass="px-2 pt-2 pb-3">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] tabular-nums" data-testid="attendance-summary">
              <thead className="bg-[#f8f6fc]">
                <tr><Th>区分</Th><Th>名前</Th><Th className="text-right">出勤日数</Th><Th className="text-right">勤務時間</Th><Th className="text-right">時間（10進）</Th><Th className="text-right">未退勤</Th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.m.id} className={cx('border-t border-line', selected?.id === r.m.id && 'bg-brand-soft/60')}>
                    <Td className="text-sub">{r.m.kind}</Td>
                    <Td>
                      <Link href={href(r.m.id)} className="font-bold hover:text-brand">{r.m.name}</Link>
                      {!r.m.active && <Badge tone="gray" className="ml-1.5">無効</Badge>}
                    </Td>
                    <Td className="text-right">{r.days}日</Td>
                    <Td className="text-right font-bold">{fmtHm(r.minutes)}</Td>
                    <Td className="text-right text-sub">{toHours(r.minutes).toFixed(2)}</Td>
                    <Td className="text-right">{r.open ? <Badge tone="red">{r.open}件</Badge> : <span className="text-mute">—</span>}</Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-brand-soft/50 font-bold">
                  <Td className="text-brand">合計</Td>
                  <Td>{rows.length}名</Td>
                  <Td />
                  <Td className="text-right text-brand">{fmtHm(total.minutes)}</Td>
                  <Td className="text-right">{toHours(total.minutes).toFixed(2)}</Td>
                  <Td className="text-right">{total.open ? `${total.open}件` : '—'}</Td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : <Empty>勤怠の対象者が登録されていません</Empty>}
        <p className="px-3 pt-2 text-[11px] text-mute">
          勤務時間＝退勤−出勤（休憩時間は差し引いていません）。未退勤の記録は勤務時間に含みません。名前を押すと日ごとの記録を表示し、修正・追加できます。
        </p>
      </Card>

      {selected && (
        <Card title={<>{selected.name}<span className="text-[13px] font-medium text-sub">{selected.kind}・{fmtJaMonth(data.month)}の記録</span></>}
          action={<Link href={href()} className="text-[13px] font-medium text-brand hover:underline">閉じる</Link>} bodyClass="px-2 pt-2 pb-3">
          <SelectedRecords recs={data.recs.filter((r) => r.staffMemberId === selected.id)} />
          <div className="mx-3 mt-4 rounded-xl border border-line bg-[#faf8fd] p-4">
            <p className="mb-3 text-[13px] font-bold">記録を追加（打ち忘れなど）</p>
            <AddRecordForm staffMemberId={selected.id} defaultIn={`${data.month === data.cur ? data.today : `${data.month}-01`}T18:00`} />
          </div>
        </Card>
      )}
    </>
  )
}

function SelectedRecords({ recs }: { recs: t.Attendance[] }) {
  if (!recs.length) return <Empty>この月の記録はありません</Empty>
  const rows: RecordRowData[] = recs.map((r) => ({
    id: r.id,
    date: dayLabel(r.businessDate),
    clockIn: fmtClock(r.clockIn, r.businessDate),
    clockOut: fmtClock(r.clockOut, r.businessDate),
    inValue: toJstLocal(r.clockIn),
    outValue: r.clockOut ? toJstLocal(r.clockOut) : '',
    hm: r.clockOut ? fmtHm(workMinutes(r.clockIn, r.clockOut) ?? 0) : '—',
    open: !r.clockOut,
  }))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" data-testid="attendance-records">
        <thead className="bg-[#f8f6fc]"><tr><Th>日付</Th><Th>出勤</Th><Th>退勤</Th><Th className="text-right">勤務時間</Th><Th /></tr></thead>
        <tbody>{rows.map((r) => <RecordRow key={r.id} r={r} />)}</tbody>
      </table>
    </div>
  )
}

/* ------------------------------ 対象者 ------------------------------ */

async function MembersTab() {
  const ctx = await requireOwner()
  const staff = await query((tx) => tx.select().from(t.staffMembers).where(eq(t.staffMembers.storeId, ctx.storeId)), ctx)
  const list = sortStaff(staff).sort((a, b) => Number(b.active) - Number(a.active))
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card title="勤怠の対象者" action={<span className="text-[12px] text-sub">有効 {list.filter((m) => m.active).length}名 / 全{list.length}名</span>} bodyClass="px-2 pt-2 pb-3">
        {list.length ? (
          STAFF_KINDS.map((kind) => {
            const ms = list.filter((m) => m.kind === kind)
            if (!ms.length) return null
            return (
              <div key={kind} className="mb-3 overflow-x-auto">
                <p className="px-3 pt-2 text-[13px] font-bold">{kind}<span className="ml-2 text-[12px] font-medium text-sub">{ms.length}名{kind === 'アルバイト' && '・名前順'}</span></p>
                <table className="w-full text-[13px]"><tbody>{ms.map((m) => <StaffMemberRow key={m.id} m={{ id: m.id, name: m.name, kind: m.kind, active: m.active }} />)}</tbody></table>
              </div>
            )
          })
        ) : <Empty>まだ登録されていません</Empty>}
      </Card>
      <div className="space-y-5">
        <Card title="対象者を追加"><AddStaffMemberForm /></Card>
        <Card title="使い方">
          <ul className="space-y-2 text-[13px] leading-relaxed text-sub">
            <li className="flex gap-2"><UserCog className="mt-0.5 size-4 shrink-0 text-brand" />打刻の画面には「有効」の人だけが表示されます。社員は登録順、アルバイトは名前順に並びます。</li>
            <li className="flex gap-2"><UserCog className="mt-0.5 size-4 shrink-0 text-brand" />退職した人は「有効」を外してください。これまでの記録は残ります。</li>
            <li className="flex gap-2"><UserCog className="mt-0.5 size-4 shrink-0 text-brand" />ログイン用のアカウント（スタッフ管理）とは別に登録します。スタッフのアカウントは共用のまま使えます。</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
