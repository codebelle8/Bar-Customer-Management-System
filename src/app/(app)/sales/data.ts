// 売上管理・レポート・Excel出力で共通に使うデータ取得（サーバー専用）
import 'server-only'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import * as t from '@/db/schema'
import { loadPricing } from '@/lib/dal'
import { addDays, daysInMonth } from '@/lib/format'
import { businessDateOf, dayInfo } from '@/lib/pricing'
import { dailyRows } from '@/lib/stats'
import { ACCOUNT_MOVE, STD_ADJ, type ExpenseKind } from '@/components/sales/constants'

/** 現在の営業日（区切り時刻より前は前日） */
export async function businessToday(tx: Tx, storeId: string) {
  const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, storeId))
  return businessDateOf(new Date(), s)
}

/** スタッフが入力・閲覧できる日付：本日の営業日と前営業日 */
export const staffDates = (today: string) => [today, addDays(today, -1)]

/** 月の集計範囲：当月は本日の営業日まで、過去の月は月末まで */
export function monthRange(month: string, today: string) {
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  return { from: `${month}-01`, to: month === today.slice(0, 7) ? today : last }
}

export interface Adjustment {
  id: string | null
  label: string
  amount: number
  /** 標準の項目（龍経費・46経費・口座移動）は削除・名称変更できない */
  fixed: boolean
}

/** 月次の調整（龍経費・46経費・口座移動＋任意の項目）。未登録の月は標準の 3 項目を 0 円で返す */
export async function loadAdjustments(tx: Tx, storeId: string, month: string): Promise<Adjustment[]> {
  const rows = await tx
    .select()
    .from(t.monthlyAdjustments)
    .where(and(eq(t.monthlyAdjustments.storeId, storeId), eq(t.monthlyAdjustments.month, month)))
    .orderBy(asc(t.monthlyAdjustments.sort), asc(t.monthlyAdjustments.createdAt))
  const list: Adjustment[] = rows.map((r) => ({ id: r.id, label: r.label, amount: r.amount, fixed: (STD_ADJ as readonly string[]).includes(r.label) }))
  for (const label of STD_ADJ) if (!list.some((a) => a.label === label)) list.push({ id: null, label, amount: 0, fixed: true })
  // 表示順：経費の項目 → 口座移動
  return [...list.filter((a) => a.label !== ACCOUNT_MOVE), ...list.filter((a) => a.label === ACCOUNT_MOVE)]
}

export interface DayEntry {
  id: string
  kind: ExpenseKind
  name: string
  amount: number
  staffId: string | null
  staffName: string | null
  createdAt: Date
}

/** 1日分の詳細：日報の行・部×区分の来店内訳・ドリンク等の品目・経費の入力一覧 */
export async function loadDay(tx: Tx, storeId: string, date: string) {
  const [row] = await dailyRows(tx, storeId, date, date)
  const { settings, overrides } = await loadPricing(tx, storeId)
  const info = dayInfo(date, settings, overrides)

  const breakdown = await tx
    .select({
      part: t.visits.dayPart,
      cat: t.visits.category,
      cnt: sql<number>`count(*)`.mapWith(Number),
      fresh: sql<number>`count(*) filter (where ${t.visits.isNew})`.mapWith(Number),
      fee: sql<number>`coalesce(sum(${t.visits.entryTotal}), 0)`.mapWith(Number),
      discount: sql<number>`coalesce(sum(${t.visits.discount}), 0)`.mapWith(Number),
    })
    .from(t.visits)
    .where(and(eq(t.visits.storeId, storeId), eq(t.visits.businessDate, date), ne(t.visits.status, 'void')))
    .groupBy(t.visits.dayPart, t.visits.category)

  const items = await tx
    .select({
      kind: t.visitItems.kind,
      name: t.visitItems.name,
      part: t.visitItems.dayPart,
      qty: sql<number>`coalesce(sum(${t.visitItems.qty}), 0)`.mapWith(Number),
      amount: sql<number>`coalesce(sum(${t.visitItems.amount}), 0)`.mapWith(Number),
    })
    .from(t.visitItems)
    .innerJoin(t.visits, eq(t.visits.id, t.visitItems.visitId))
    .where(and(eq(t.visitItems.storeId, storeId), eq(t.visitItems.businessDate, date), ne(t.visits.status, 'void')))
    .groupBy(t.visitItems.kind, t.visitItems.name, t.visitItems.dayPart)

  const [{ inside }] = await tx
    .select({ inside: sql<number>`count(*)`.mapWith(Number) })
    .from(t.visits)
    .where(and(eq(t.visits.storeId, storeId), eq(t.visits.businessDate, date), eq(t.visits.status, 'in')))

  // スタッフは users の自分の行しか読めない（RLS）ため、他のスタッフの名前は null になる
  const entries: DayEntry[] = await tx
    .select({
      id: t.expenses.id, kind: t.expenses.kind, name: t.expenses.name, amount: t.expenses.amount,
      staffId: t.expenses.staffId, staffName: t.users.name, createdAt: t.expenses.createdAt,
    })
    .from(t.expenses)
    .leftJoin(t.users, eq(t.users.id, t.expenses.staffId))
    .where(and(eq(t.expenses.storeId, storeId), eq(t.expenses.businessDate, date)))
    .orderBy(asc(t.expenses.createdAt))

  // 品目は名前ごとに昼・夜をまとめる（延長料金も含める）
  const byName = new Map<string, { kind: string; name: string; qtyDay: number; qtyNight: number; amount: number }>()
  for (const it of items) {
    const key = `${it.kind}|${it.name}`
    const cur = byName.get(key) ?? { kind: it.kind, name: it.name, qtyDay: 0, qtyNight: 0, amount: 0 }
    if (it.part === '昼') cur.qtyDay += it.qty
    else cur.qtyNight += it.qty
    cur.amount += it.amount
    byName.set(key, cur)
  }
  const itemList = [...byName.values()].sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'drink' ? -1 : 1))

  return { date, row, info, breakdown, items: itemList, entries, inside }
}

export type DayData = Awaited<ReturnType<typeof loadDay>>
