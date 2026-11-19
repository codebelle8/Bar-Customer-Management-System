// 勤怠の Excel 出力：月別の集計（給与計算の基礎）＋日ごとの明細
import type { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { and, asc, between, eq } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import * as t from '@/db/schema'
import { audit, getCurrentUser, query, requireCtx } from '@/lib/dal'
import { fmtClock, fmtHm, sortStaff, toHours, workMinutes } from '@/lib/attendance'
import { WEEK_JA, daysInMonth, weekdayOf } from '@/lib/format'
import { dotMonth, isYm } from '@/components/sales/constants'
import { businessToday } from '@/app/(app)/sales/data'

const text = (s: string, status = 400) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

export async function GET(request: NextRequest) {
  // オーナー・店舗オーナーのみ（未ログインはログイン画面へ、スタッフは 403）。店舗オーナーは所属店舗のみ
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role === 'staff') return text('この操作はオーナーのみ利用できます', 403)
  const ctx = await requireCtx()
  const param = request.nextUrl.searchParams.get('month')
  if (param !== null && !isYm(param)) return text('month は YYYY-MM 形式で指定してください')

  const fileName = (m: string) => `勤怠_${ctx.store.shortName}_${dotMonth(m)}.xlsx`
  const data = await query(async (tx) => {
    const month = param ?? (await businessToday(tx, ctx.storeId)).slice(0, 7)
    const staff = sortStaff(await tx.select().from(t.staffMembers).where(eq(t.staffMembers.storeId, ctx.storeId)))
    const recs = await tx
      .select()
      .from(t.attendance)
      .where(and(eq(t.attendance.storeId, ctx.storeId), between(t.attendance.businessDate, `${month}-01`, `${month}-${String(daysInMonth(month)).padStart(2, '0')}`)))
      .orderBy(asc(t.attendance.businessDate), asc(t.attendance.clockIn))
    await audit(tx, ctx, 'Excel出力', fileName(month))
    return { month, staff, recs }
  }, ctx)

  const { month, staff, recs } = data
  const byId = new Map(staff.map((m) => [m.id, m]))
  const order = new Map(staff.map((m, i) => [m.id, i]))

  // 集計：社員（登録順）→ アルバイト（名前順）。有効な人と、この月に記録がある人
  const summary = staff
    .map((m) => {
      const rs = recs.filter((r) => r.staffMemberId === m.id)
      const min = rs.reduce((a, r) => a + (workMinutes(r.clockIn, r.clockOut) ?? 0), 0)
      return { m, rs, min, days: new Set(rs.map((r) => r.businessDate)).size, open: rs.filter((r) => !r.clockOut).length }
    })
    .filter((x) => x.m.active || x.rs.length > 0)
  const totalMin = summary.reduce((a, x) => a + x.min, 0)
  const head1 = ['区分', '名前', '出勤日数', '勤務時間（時:分）', '勤務時間（時間）', '未退勤']
  const body1 = summary.map((x) => [x.m.kind, x.m.name, x.days, fmtHm(x.min), toHours(x.min), x.open || ''])
  const ws1 = XLSX.utils.aoa_to_sheet([
    [`${ctx.store.name}　勤怠集計　${dotMonth(month)}`],
    [],
    head1,
    ...body1,
    ['合計', `${summary.length}名`, '', fmtHm(totalMin), toHours(totalMin), summary.reduce((a, x) => a + x.open, 0) || ''],
    [],
    ['※勤務時間＝退勤−出勤（休憩時間は差し引いていません）。未退勤の記録は勤務時間に含みません。'],
  ])
  ws1['!cols'] = [10, 14, 10, 18, 16, 8].map((wch) => ({ wch }))

  // 明細：日付順（同じ日は出勤の早い順）
  const detail = [...recs].sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.clockIn.getTime() - b.clockIn.getTime() || (order.get(a.staffMemberId) ?? 0) - (order.get(b.staffMemberId) ?? 0))
  const head2 = ['日付', '曜日', '区分', '名前', '出勤', '退勤', '勤務時間（時:分）', '勤務時間（時間）']
  const body2 = detail.map((r) => {
    const m = byId.get(r.staffMemberId)
    const min = workMinutes(r.clockIn, r.clockOut)
    return [r.businessDate.replaceAll('-', '/'), WEEK_JA[weekdayOf(r.businessDate)], m?.kind ?? '', m?.name ?? '', fmtClock(r.clockIn, r.businessDate), r.clockOut ? fmtClock(r.clockOut, r.businessDate) : '未退勤', min === null ? '' : fmtHm(min), min === null ? '' : toHours(min)]
  })
  const ws2 = XLSX.utils.aoa_to_sheet([head2, ...body2])
  ws2['!cols'] = [12, 5, 10, 14, 8, 8, 18, 16].map((wch) => ({ wch }))
  ws2['!autofilter'] = { ref: ws2['!ref'] ?? 'A1' }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, '勤怠集計')
  XLSX.utils.book_append_sheet(wb, ws2, '勤怠明細')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer
  return new Response(out, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="attendance_${dotMonth(month)}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName(month))}`,
      'Cache-Control': 'no-store',
    },
  })
}
