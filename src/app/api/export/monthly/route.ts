// 月次の売上表（Excel）：店舗の「年.月総括」シートと同じ並び＋来店明細
import type { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { and, asc, between, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import * as XLSX from 'xlsx'
import * as t from '@/db/schema'
import { audit, getCurrentUser, query, requireCtx } from '@/lib/dal'
import { fmtJaMonth, jstParts, WEEK_JA, weekdayOf } from '@/lib/format'
import { holidayName } from '@/lib/pricing'
import { dailyRows, summaryOf, type DailyRow } from '@/lib/stats'
import { adjustmentTotals, dotMonth, isYm } from '@/components/sales/constants'
import { businessToday, loadAdjustments, monthRange } from '@/app/(app)/sales/data'

type Cell = string | number | null | { t: 'n'; v: number; z: string }
type Row = Cell[]

const YEN = '#,##0'
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
/** 日付（YYYY-MM-DD）→ Excel のシリアル値 */
const serial = (d: string) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - EXCEL_EPOCH) / 86400000
const numCell = (v: number, z: string) => ({ t: 'n' as const, v, z })
const yenCell = (v: number) => numCell(v, YEN)
const timeCell = (d: Date | null) => (d ? numCell(jstParts(d).minutes / 1440, 'hh:mm') : null)

/** 日別表の列（H 列から）：Excel と同じ順番 */
const DAILY: { label: string; group?: string; key?: keyof DailyRow; yen?: boolean; text?: boolean; wch: number }[] = [
  { label: '日付', wch: 7 },
  { label: '曜日', wch: 5 },
  { label: '午前ドリンク', key: 'drinkDay', yen: true, wch: 11 },
  { label: '午後ドリンク', key: 'drinkNight', yen: true, wch: 11 },
  { label: 'ドリンク合計', key: 'drinkTotal', yen: true, wch: 11 },
  { label: '入場料', key: 'entrance', yen: true, wch: 12 },
  { label: '昼売上', key: 'salesDay', yen: true, wch: 12 },
  { label: '夜売上', key: 'salesNight', yen: true, wch: 12 },
  { label: '総売上', key: 'total', yen: true, wch: 12 },
  { label: '経費', key: 'expense', yen: true, wch: 10 },
  { label: '備考', key: 'memo', text: true, wch: 28 },
  { label: '税金金額', key: 'tax', yen: true, wch: 10 },
  { label: '税金名称', key: 'taxNames', text: true, wch: 14 },
  { label: 'バイト', key: 'parttime', yen: true, wch: 10 },
  { label: '新規獲得', key: 'newMembers', wch: 8 },
  { label: '昼部', group: '男性来店', key: 'maleDay', wch: 6 },
  { label: '夜部', group: '男性来店', key: 'maleNight', wch: 6 },
  { label: '合計', group: '男性来店', key: 'male', wch: 6 },
  { label: '昼部', group: '女性来店', key: 'femaleDay', wch: 6 },
  { label: '夜部', group: '女性来店', key: 'femaleNight', wch: 6 },
  { label: '合計', group: '女性来店', key: 'female', wch: 6 },
  { label: '昼部', group: 'CP来店', key: 'cpDay', wch: 6 },
  { label: '夜部', group: 'CP来店', key: 'cpNight', wch: 6 },
  { label: '合計', group: 'CP来店', key: 'cp', wch: 6 },
  { label: '計人数', key: 'people', wch: 8 },
]
const H = 7 // 日別表の開始列（H）
const HEAD = 2 // 日別表の見出しの開始行（0 始まり＝3 行目）

export async function GET(request: NextRequest) {
  // オーナー・店舗オーナーのみ（未ログインはログイン画面へ、スタッフは 403）。店舗オーナーは所属店舗のみ
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role === 'staff') return new Response('この操作はオーナーのみ利用できます', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const ctx = await requireCtx()
  const param = request.nextUrl.searchParams.get('month')
  if (param !== null && !isYm(param)) return new Response('month は YYYY-MM 形式で指定してください', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

  const fileName = (m: string) => `売上表_${dotMonth(m)}.xlsx`
  const data = await query(async (tx) => {
    const today = await businessToday(tx, ctx.storeId)
    const month = param ?? today.slice(0, 7)
    const { from, to } = monthRange(month, today)
    const rows = month > today.slice(0, 7) ? [] : await dailyRows(tx, ctx.storeId, from, to)
    const adjustments = await loadAdjustments(tx, ctx.storeId, month)
    const partner = alias(t.members, 'partner')
    const visits = await tx
      .select({
        v: t.visits, memberNo: t.members.memberNo, handle: t.members.handleName, partnerNo: partner.memberNo, partnerHandle: partner.handleName,
        extra: sql<number>`(select coalesce(sum(${t.visitItems.amount}), 0) from ${t.visitItems} where ${t.visitItems.visitId} = ${t.visits.id})`.mapWith(Number),
      })
      .from(t.visits)
      .innerJoin(t.members, eq(t.members.id, t.visits.memberId))
      .leftJoin(partner, eq(partner.id, t.visits.partnerMemberId))
      .where(and(eq(t.visits.storeId, ctx.storeId), between(t.visits.businessDate, from, to)))
      .orderBy(asc(t.visits.businessDate), asc(t.visits.checkedInAt))
    await audit(tx, ctx, 'Excel出力', fileName(month))
    return { month, rows, adjustments, visits }
  }, ctx)

  const { month } = data
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, summarySheet(month, ctx.store.name, data.rows, data.adjustments), `${dotMonth(month)}総括`)
  XLSX.utils.book_append_sheet(wb, visitSheet(data.visits), `${dotMonth(month)}来店明細`)
  const body = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer
  const name = fileName(month)
  return new Response(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sales_${dotMonth(month)}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  })
}

/** 総括シート：A〜F 列に総括、H 列から日別表 */
function summarySheet(month: string, storeName: string, rows: DailyRow[], adjustments: { label: string; amount: number }[]) {
  const sum = summaryOf(rows)
  const s = sum.total
  const adj = adjustmentTotals(sum.cashLeft, adjustments)
  const aoa: Row[] = []
  const merges: XLSX.Range[] = []
  const put = (r: number, c: number, v: Cell) => {
    while (aoa.length <= r) aoa.push([])
    aoa[r][c] = v
  }
  const merge = (r1: number, c1: number, r2: number, c2: number) => merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } })

  // ---- 総括（A〜F） ----
  put(0, 0, `${fmtJaMonth(month)} 総括`)
  merge(0, 0, 0, 5)
  put(1, 0, storeName)
  merge(1, 0, 1, 5)
  const blocks: [string, string[], Cell[]][] = [
    ['昼', ['男人数', '女人数', '現金売上', 'イベント経費', 'アルバイト', '総売上'], [sum.day.male, sum.day.female, yenCell(sum.day.cash), null, null, yenCell(sum.day.sales)]],
    ['夜', ['男人数', '女人数', '現金売上', 'イベント経費', 'アルバイト', '総売上'], [sum.night.male, sum.night.female, yenCell(sum.night.cash), null, null, yenCell(sum.night.sales)]],
    ['合計', ['男合計', '女合計', '現金売上', 'イベント経費', 'アルバイト', '総売上'], [s.male, s.female, yenCell(s.total), yenCell(s.expense), yenCell(s.parttime), yenCell(s.total)]],
  ]
  let r = HEAD
  for (const [label, heads, vals] of blocks) {
    put(r, 0, label)
    heads.forEach((h, i) => put(r + 1, i, h))
    vals.forEach((v, i) => put(r + 2, i, v))
    r += 4
  }
  put(r, 0, '現金残(▲イベ経費)')
  merge(r, 0, r, 2)
  put(r, 3, yenCell(sum.cashLeft))
  merge(r, 3, r, 5)
  r += 2
  // 調整のグリッド（1 項目 2 列ずつ・3 項目で折り返し）
  const grid: [string, number][][] = []
  const exp: [string, number][] = [...adj.expenseItems.map((a) => [a.label, a.amount] as [string, number]), ['経費合計', adj.expenseSum]]
  for (let i = 0; i < exp.length; i += 3) grid.push(exp.slice(i, i + 3))
  grid.push([['口座移動', adj.move], ['差引現金残', adj.net], ['差引現金合計', adj.netTotal]])
  for (const line of grid) {
    line.forEach(([label, v], i) => {
      put(r, i * 2, label)
      merge(r, i * 2, r, i * 2 + 1)
      put(r + 1, i * 2, yenCell(v))
      merge(r + 1, i * 2, r + 1, i * 2 + 1)
    })
    r += 2
  }
  r += 1
  put(r, 0, '※差引現金残＝現金残−口座移動、差引現金合計＝差引現金残−経費合計（店舗の総括シートと同じ計算）')
  put(r + 1, 0, '※昼・夜の現金売上の計算方法は確認中（総売上と同じ金額を表示）')

  // ---- 日別表（H 列〜） ----
  put(0, H, `${fmtJaMonth(month)} 日報`)
  DAILY.forEach((c, i) => {
    const col = H + i
    if (c.group) {
      if (DAILY[i - 1]?.group !== c.group) {
        put(HEAD, col, c.group)
        merge(HEAD, col, HEAD, col + 2)
      }
      put(HEAD + 1, col, c.label)
    } else {
      put(HEAD, col, c.label)
      merge(HEAD, col, HEAD + 1, col)
    }
  })
  const value = (row: DailyRow, c: (typeof DAILY)[number]): Cell => {
    if (!c.key) return null
    const v = row[c.key]
    if (c.text) return String(v) || null
    return c.yen ? yenCell(Number(v)) : Number(v)
  }
  rows.forEach((row, k) => {
    const rr = HEAD + 2 + k
    put(rr, H, numCell(serial(row.date), 'm/d'))
    put(rr, H + 1, holidayName(row.date) ? `${WEEK_JA[weekdayOf(row.date)]}祝` : WEEK_JA[weekdayOf(row.date)])
    DAILY.forEach((c, i) => i >= 2 && put(rr, H + i, value(row, c)))
  })
  const tr = HEAD + 2 + rows.length
  put(tr, H, '合計')
  merge(tr, H, tr, H + 1)
  DAILY.forEach((c, i) => i >= 2 && put(tr, H + i, c.text ? null : value(s, c)))

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  ws['!cols'] = [...Array.from({ length: 6 }, () => ({ wch: 13 })), { wch: 2 }, ...DAILY.map((c) => ({ wch: c.wch }))]
  return ws
}

const STATUS: Record<t.Visit['status'], string> = { in: '入店中', out: '精算済', void: '取消' }

/** 来店明細シート：1 来店 1 行 */
function visitSheet(visits: { v: t.Visit; memberNo: string; handle: string; partnerNo: string | null; partnerHandle: string | null; extra: number }[]) {
  const head = ['日付', '入店', '退店', '会員番号', 'ハンドルネーム', '区分', '部', '料金区分', '入場料', '割引', 'うちU30割引', '割引の内容', '入会金', '年会費', '追加', '合計', '状態']
  const body: Row[] = visits.map(({ v, ...m }) => [
    numCell(serial(v.businessDate), 'yyyy/m/d'),
    timeCell(v.checkedInAt),
    timeCell(v.checkedOutAt),
    m.memberNo,
    m.partnerHandle ? `${m.handle} ＋ ${m.partnerHandle}（${m.partnerNo}）` : m.handle,
    v.category,
    v.dayPart,
    v.dayType,
    yenCell(v.entranceFee),
    yenCell(v.discount),
    yenCell(v.u30Discount),
    v.discountReason || null,
    yenCell(v.joinFee),
    yenCell(v.annualFee),
    yenCell(m.extra),
    yenCell(v.entryTotal + m.extra),
    STATUS[v.status],
  ])
  const ws = XLSX.utils.aoa_to_sheet([head, ...body])
  ws['!cols'] = [11, 7, 7, 10, 30, 8, 5, 9, 9, 8, 10, 34, 8, 8, 9, 10, 8].map((wch) => ({ wch }))
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(body.length, 1), c: head.length - 1 } }) }
  return ws
}
