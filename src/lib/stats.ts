// 集計（ダッシュボード・売上管理の日報・レポートの総括で共通に使う）
// 列の考え方は店舗の Excel（年.月総括シート）と同じ：
//   午前ドリンク＝昼の部のドリンク、午後ドリンク＝夜の部のドリンク
//   入場料＝入場料（割引後）＋入会金・年会費＋延長料金
//   昼売上＝昼の部の入場料＋午前ドリンク、夜売上＝夜の部の入場料＋午後ドリンク、総売上＝昼売上＋夜売上
//   計人数＝男性＋女性＋カップル×2
import 'server-only'
import { and, between, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Tx } from '@/db/client'
import * as t from '@/db/schema'
import { addDays } from './format'

export interface DailyRow {
  date: string
  drinkDay: number
  drinkNight: number
  drinkTotal: number
  entranceDay: number
  entranceNight: number
  entrance: number
  salesDay: number
  salesNight: number
  total: number
  /** 経費（備品購入・イベント経費など） */
  expense: number
  /** 備考（経費の内容を「.」区切りで表示：Excel の備考欄と同じ書き方） */
  memo: string
  tax: number
  taxNames: string
  parttime: number
  /** 新規獲得（その日の新規入会数） */
  newMembers: number
  maleDay: number
  maleNight: number
  femaleDay: number
  femaleNight: number
  cpDay: number
  cpNight: number
  male: number
  female: number
  cp: number
  /** 計人数（カップルは2名） */
  people: number
  /** 来店受付の件数（カップルは1件） */
  visits: number
}

const n = (x: unknown) => Number(x ?? 0)

export function emptyRow(date: string): DailyRow {
  return {
    date, drinkDay: 0, drinkNight: 0, drinkTotal: 0, entranceDay: 0, entranceNight: 0, entrance: 0, salesDay: 0, salesNight: 0, total: 0,
    expense: 0, memo: '', tax: 0, taxNames: '', parttime: 0, newMembers: 0,
    maleDay: 0, maleNight: 0, femaleDay: 0, femaleNight: 0, cpDay: 0, cpNight: 0, male: 0, female: 0, cp: 0, people: 0, visits: 0,
  }
}

/** 指定期間の日別集計（期間内のすべての日付を返す。来店がない日も 0 の行） */
export async function dailyRows(tx: Tx, storeId: string, from: string, to: string): Promise<DailyRow[]> {
  const v = await tx
    .select({
      date: t.visits.businessDate,
      part: t.visits.dayPart,
      cat: t.visits.category,
      cnt: sql<number>`count(*)`.mapWith(Number),
      fee: sql<number>`coalesce(sum(${t.visits.entryTotal}), 0)`.mapWith(Number),
    })
    .from(t.visits)
    .where(and(eq(t.visits.storeId, storeId), between(t.visits.businessDate, from, to), ne(t.visits.status, 'void')))
    .groupBy(t.visits.businessDate, t.visits.dayPart, t.visits.category)

  const it = await tx
    .select({
      date: t.visitItems.businessDate,
      part: t.visitItems.dayPart,
      kind: t.visitItems.kind,
      amt: sql<number>`coalesce(sum(${t.visitItems.amount}), 0)`.mapWith(Number),
    })
    .from(t.visitItems)
    .innerJoin(t.visits, eq(t.visits.id, t.visitItems.visitId))
    .where(and(eq(t.visitItems.storeId, storeId), between(t.visitItems.businessDate, from, to), ne(t.visits.status, 'void')))
    .groupBy(t.visitItems.businessDate, t.visitItems.dayPart, t.visitItems.kind)

  const ex = await tx
    .select({
      date: t.expenses.businessDate,
      kind: t.expenses.kind,
      amt: sql<number>`coalesce(sum(${t.expenses.amount}), 0)`.mapWith(Number),
      names: sql<string>`coalesce(string_agg(nullif(${t.expenses.name}, ''), '.' order by ${t.expenses.createdAt}), '')`,
    })
    .from(t.expenses)
    .where(and(eq(t.expenses.storeId, storeId), between(t.expenses.businessDate, from, to)))
    .groupBy(t.expenses.businessDate, t.expenses.kind)

  // 新規獲得＝その日に入会した会員数（カップル2名同時の入会・登録のみも含む。紙の会員証からの移行登録は除く）
  const joined = await tx
    .select({ date: t.members.joinedAt, cnt: sql<number>`count(*)`.mapWith(Number) })
    .from(t.members)
    .where(and(eq(t.members.storeId, storeId), between(t.members.joinedAt, from, to), ne(t.members.termsVersion, '紙')))
    .groupBy(t.members.joinedAt)

  const map = new Map<string, DailyRow>()
  for (let d = from; d <= to; d = addDays(d, 1)) map.set(d, emptyRow(d))

  for (const r of v) {
    const row = map.get(r.date)
    if (!row) continue
    const day = r.part === '昼'
    if (day) row.entranceDay += r.fee
    else row.entranceNight += r.fee
    row.visits += r.cnt
    if (r.cat === '男性') day ? (row.maleDay += r.cnt) : (row.maleNight += r.cnt)
    else if (r.cat === '女性') day ? (row.femaleDay += r.cnt) : (row.femaleNight += r.cnt)
    else day ? (row.cpDay += r.cnt) : (row.cpNight += r.cnt)
  }
  for (const r of joined) {
    const row = map.get(r.date)
    if (row) row.newMembers += r.cnt
  }
  for (const r of it) {
    const row = map.get(r.date)
    if (!row) continue
    const day = r.part === '昼'
    if (r.kind === 'extension') day ? (row.entranceDay += r.amt) : (row.entranceNight += r.amt)
    else day ? (row.drinkDay += r.amt) : (row.drinkNight += r.amt)
  }
  for (const r of ex) {
    const row = map.get(r.date)
    if (!row) continue
    if (r.kind === 'expense') {
      row.expense += r.amt
      row.memo = r.names
    } else if (r.kind === 'tax') {
      row.tax += r.amt
      row.taxNames = r.names
    } else row.parttime += r.amt
  }
  for (const row of map.values()) finish(row)
  return [...map.values()]
}

function finish(row: DailyRow) {
  row.drinkTotal = row.drinkDay + row.drinkNight
  row.entrance = row.entranceDay + row.entranceNight
  row.salesDay = row.entranceDay + row.drinkDay
  row.salesNight = row.entranceNight + row.drinkNight
  row.total = row.salesDay + row.salesNight
  row.male = row.maleDay + row.maleNight
  row.female = row.femaleDay + row.femaleNight
  row.cp = row.cpDay + row.cpNight
  row.people = row.male + row.female + row.cp * 2
  return row
}

const SUM_KEYS = [
  'drinkDay', 'drinkNight', 'entranceDay', 'entranceNight', 'expense', 'tax', 'parttime', 'newMembers',
  'maleDay', 'maleNight', 'femaleDay', 'femaleNight', 'cpDay', 'cpNight', 'visits',
] as const

/** 合計行 */
export function sumRows(rows: DailyRow[], label = '合計'): DailyRow {
  const s = emptyRow(label)
  for (const r of rows) for (const k of SUM_KEYS) s[k] += r[k]
  return finish(s)
}

/**
 * 総括（Excel の左側の表と同じ）
 *   現金残（▲イベ経費）＝総売上 − 経費 − アルバイト
 *   差引現金残・差引現金合計は、月次の調整（龍経費・46経費・口座移動）を使って adjustmentTotals で計算する
 */
export function summaryOf(rows: DailyRow[]) {
  const s = sumRows(rows)
  return {
    total: s,
    day: { male: s.maleDay, female: s.femaleDay, cp: s.cpDay, cash: s.salesDay, sales: s.salesDay },
    night: { male: s.maleNight, female: s.femaleNight, cp: s.cpNight, cash: s.salesNight, sales: s.salesNight },
    cashLeft: s.total - s.expense - s.parttime,
  }
}

/** 会員ごとの期間内の来店回数（カップルの同伴者としての来店も含む・取消は除く） */
export async function visitCounts(tx: Tx, storeId: string, from: string, to: string, memberIds?: string[]) {
  const where = and(
    eq(t.visits.storeId, storeId),
    gte(t.visits.businessDate, from),
    lte(t.visits.businessDate, to),
    ne(t.visits.status, 'void'),
    memberIds?.length ? or(inArray(t.visits.memberId, memberIds), inArray(t.visits.partnerMemberId, memberIds)) : undefined,
  )
  const rows = await tx.select({ m: t.visits.memberId, p: t.visits.partnerMemberId }).from(t.visits).where(where)
  const counts = new Map<string, number>()
  for (const r of rows)
    for (const id of [r.m, r.p]) if (id && (!memberIds || memberIds.includes(id))) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

/* ------------------------------ 来店者内訳 ------------------------------ */

/** 来店者内訳の 1 部（店舗の Excel「来店者内訳」と同じ区分） */
export interface VisitorCounts {
  maleOld: number
  maleNew: number
  femaleOld: number
  femaleNew: number
}
export interface VisitorRow {
  date: string
  day: VisitorCounts
  night: VisitorCounts
}
export const emptyCounts = (): VisitorCounts => ({ maleOld: 0, maleNew: 0, femaleOld: 0, femaleNew: 0 })
export const countsTotal = (c: VisitorCounts) => ({ old: c.maleOld + c.femaleOld, new: c.maleNew + c.femaleNew, all: c.maleOld + c.maleNew + c.femaleOld + c.femaleNew })
export function addCounts(a: VisitorCounts, b: VisitorCounts): VisitorCounts {
  return { maleOld: a.maleOld + b.maleOld, maleNew: a.maleNew + b.maleNew, femaleOld: a.femaleOld + b.femaleOld, femaleNew: a.femaleNew + b.femaleNew }
}

/**
 * 日別・昼夜別の来店者内訳（人数）。取消は除く。
 *   男性・女性の来店は 1 名（区分のとおり）、カップルは 2 名（それぞれの会員の性別）。
 *   新規＝その営業日に入会した会員（紙の会員証からの移行登録は除く。日報の「新規獲得」と同じ考え方）、それ以外は既存。
 *   昼＋夜の総合計は日報の「計人数」と一致する。
 */
export async function visitorBreakdown(tx: Tx, storeId: string, from: string, to: string): Promise<VisitorRow[]> {
  const main = alias(t.members, 'main')
  const partner = alias(t.members, 'partner')
  const rows = await tx
    .select({
      date: t.visits.businessDate,
      part: t.visits.dayPart,
      cat: t.visits.category,
      mGender: main.gender,
      mJoined: main.joinedAt,
      mPaper: sql<boolean>`${main.termsVersion} = '紙'`,
      pGender: partner.gender,
      pJoined: partner.joinedAt,
      pPaper: sql<boolean>`coalesce(${partner.termsVersion} = '紙', false)`,
    })
    .from(t.visits)
    .innerJoin(main, eq(main.id, t.visits.memberId))
    .leftJoin(partner, eq(partner.id, t.visits.partnerMemberId))
    .where(and(eq(t.visits.storeId, storeId), between(t.visits.businessDate, from, to), ne(t.visits.status, 'void')))

  const map = new Map<string, VisitorRow>()
  for (let d = from; d <= to; d = addDays(d, 1)) map.set(d, { date: d, day: emptyCounts(), night: emptyCounts() })
  const put = (c: VisitorCounts, gender: string, isNew: boolean) => {
    if (gender === '女性') {
      if (isNew) c.femaleNew++
      else c.femaleOld++
    } else if (isNew) c.maleNew++
    else c.maleOld++
  }
  for (const r of rows) {
    const row = map.get(r.date)
    if (!row) continue
    const c = r.part === '昼' ? row.day : row.night
    const mNew = r.mJoined === r.date && !r.mPaper
    if (r.cat === 'カップル') {
      put(c, r.mGender, mNew)
      // 同伴者が未登録の古いデータは、主会員と異なる性別として数える
      put(c, r.pGender ?? (r.mGender === '女性' ? '男性' : '女性'), r.pJoined === r.date && !r.pPaper)
    } else {
      put(c, r.cat, mNew)
    }
  }
  return [...map.values()]
}
