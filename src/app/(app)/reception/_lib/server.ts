// 来店受付のサーバー側の共通処理（料金・会員検索・入店中一覧・受付可否の判定）
import 'server-only'
import { and, asc, count, eq, gt, gte, ilike, inArray, like, lte, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Tx } from '@/db/client'
import * as t from '@/db/schema'
import type { Category, DayPart, StoreSettings } from '@/db/schema'
import { loadPricing } from '@/lib/dal'
import { addDays, addMonths, ageOn, jstParts } from '@/lib/format'
import { businessDateOf, CATEGORIES, DAY_PARTS, dayInfo, dayPartOf, discountFor, priceOf } from '@/lib/pricing'
import { visitCounts } from '@/lib/stats'
import type { InStoreRow, MemberCard } from './types'

/** 画面に表示してよい入力エラー */
export class UserError extends Error {}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s)

export const PART_LABEL: Record<DayPart, string> = { 昼: '昼の部', 夜: '夜の部' }

/** 現在時刻の営業日・昼夜・料金区分・料金 */
export async function loadToday(tx: Tx, storeId: string, now = new Date()) {
  const { settings, rules, overrides } = await loadPricing(tx, storeId)
  const businessDate = businessDateOf(now, settings)
  const part = dayPartOf(now, settings)
  const day = dayInfo(businessDate, settings, overrides)
  const table = Object.fromEntries(
    DAY_PARTS.map((p) => [p, Object.fromEntries(CATEGORIES.map((c) => [c, priceOf(c, p, day, rules)]))]),
  ) as Record<DayPart, Record<Category, number>>
  return { settings, rules, overrides, now, businessDate, part, day, table, prices: table[part] }
}
export type Today = Awaited<ReturnType<typeof loadToday>>

const monthStart = (date: string) => `${date.slice(0, 7)}-01`
const prevMonthRange = (date: string) => {
  const prev = addMonths(date.slice(0, 7), -1)
  return [`${prev}-01`, addDays(monthStart(date), -1)] as const
}

/** 入店中（status='in'）の一覧。未精算＝これまでの注文の合計 */
export async function inStoreRows(tx: Tx, storeId: string, today: string, now = new Date()): Promise<InStoreRow[]> {
  const partner = alias(t.members, 'partner')
  const rows = await tx
    .select({
      id: t.visits.id, checkedInAt: t.visits.checkedInAt, businessDate: t.visits.businessDate, category: t.visits.category,
      isNew: t.visits.isNew, entryTotal: t.visits.entryTotal,
      memberNo: t.members.memberNo, handle: t.members.handleName, gender: t.members.gender,
      partnerNo: partner.memberNo, partnerHandle: partner.handleName,
      unpaid: sql<number>`(select coalesce(sum(${t.visitItems.amount}), 0) from ${t.visitItems} where ${t.visitItems.visitId} = ${t.visits.id})`.mapWith(Number),
      itemCount: sql<number>`(select count(*) from ${t.visitItems} where ${t.visitItems.visitId} = ${t.visits.id})`.mapWith(Number),
    })
    .from(t.visits)
    .innerJoin(t.members, eq(t.members.id, t.visits.memberId))
    .leftJoin(partner, eq(partner.id, t.visits.partnerMemberId))
    .where(and(eq(t.visits.storeId, storeId), eq(t.visits.status, 'in')))
    .orderBy(asc(t.visits.checkedInAt))
  return rows.map((r) => ({
    id: r.id, time: jstParts(r.checkedInAt).time, businessDate: r.businessDate, stale: r.businessDate < today,
    minutes: Math.max(0, Math.round((now.getTime() - r.checkedInAt.getTime()) / 60000)),
    category: r.category, isNew: r.isNew, entryTotal: r.entryTotal, memberNo: r.memberNo, handle: r.handle, gender: r.gender,
    partnerNo: r.partnerNo, partnerHandle: r.partnerHandle, unpaid: r.unpaid, itemCount: r.itemCount,
  }))
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
const toKata = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

/** 検索語の正規化（全角英数→半角、前後の空白を除去） */
export const normalizeQuery = (q: string) => q.normalize('NFKC').trim().slice(0, 40)

/**
 * 会員検索：会員番号（接頭辞なしの一部でも可：10234 → H-10234）・ハンドルネーム。
 * 空白区切りで複数の語を指定すると、すべての語に一致する会員（番号＋名前の併用）。
 */
export async function searchMembers(tx: Tx, storeId: string, rawQ: string, limit = 30): Promise<t.Member[]> {
  const q = normalizeQuery(rawQ)
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 3)
  if (!tokens.length) return []
  const conds = tokens.map((tok) => {
    const variants = [...new Set([tok, toKata(tok), toHira(tok)])]
    return or(
      ilike(t.members.memberNo, `%${escapeLike(tok)}%`),
      ...variants.map((v) => ilike(t.members.handleName, `%${escapeLike(v)}%`)),
      ...variants.map((v) => ilike(t.members.kana, `%${escapeLike(v)}%`)),
      ilike(t.members.realName, `%${escapeLike(tok)}%`),
    )
  })
  const rows = await tx.select().from(t.members).where(and(eq(t.members.storeId, storeId), ...conds)).limit(200)
  // 並び順：番号の完全一致 → 名前の完全一致 → 番号の前方一致 → その他（番号順）
  const digits = (s: string) => s.replace(/\D/g, '')
  const score = (m: t.Member) => {
    for (const tok of tokens) {
      const lower = tok.toLowerCase()
      if (m.memberNo.toLowerCase() === lower || (digits(tok) === tok && digits(m.memberNo) === tok)) return 0
      if ([tok, toKata(tok), toHira(tok)].some((v) => m.handleName.toLowerCase() === v.toLowerCase())) return 1
      if (digits(tok) === tok && digits(m.memberNo).startsWith(tok)) return 2
    }
    return 3
  }
  return rows
    .map((m) => ({ m, s: score(m) }))
    .sort((a, b) => a.s - b.s || a.m.memberNo.localeCompare(b.m.memberNo, 'ja', { numeric: true }))
    .slice(0, limit)
    .map((x) => x.m)
}

/** 会員の行に、来店回数・最終来店・入店中などを付けて画面用のカードにする */
export async function memberCards(
  tx: Tx, storeId: string, today: string, settings: Pick<StoreSettings, 'annualFeeEnabled'>, ms: t.Member[],
): Promise<MemberCard[]> {
  if (!ms.length) return []
  const ids = ms.map((m) => m.id)
  const thisMonth = await visitCounts(tx, storeId, monthStart(today), today, ids)
  const [pf, pt] = prevMonthRange(today)
  const lastMonth = await visitCounts(tx, storeId, pf, pt, ids)
  const vs = await tx
    .select({ m: t.visits.memberId, p: t.visits.partnerMemberId, d: t.visits.businessDate, s: t.visits.status })
    .from(t.visits)
    .where(and(eq(t.visits.storeId, storeId), ne(t.visits.status, 'void'), or(inArray(t.visits.memberId, ids), inArray(t.visits.partnerMemberId, ids))))
  const last = new Map<string, string>()
  const inside = new Set<string>()
  for (const v of vs)
    for (const id of [v.m, v.p]) {
      if (!id) continue
      if (!last.has(id) || last.get(id)! < v.d) last.set(id, v.d)
      if (v.s === 'in') inside.add(id)
    }
  return ms.map((m) => {
    const inStore = inside.has(m.id)
    return {
      id: m.id, memberNo: m.memberNo, handle: m.handleName, gender: m.gender,
      age: m.birthday ? ageOn(m.birthday, today) : null, joinedAt: m.joinedAt,
      thisMonth: thisMonth.get(m.id) ?? 0, lastMonth: lastMonth.get(m.id) ?? 0, lastVisit: last.get(m.id) ?? null,
      memo: m.memo, status: m.status, banReason: m.banReason, inStore, feeExpiresAt: m.feeExpiresAt,
      feeDue: settings.annualFeeEnabled && (!m.feeExpiresAt || m.feeExpiresAt < today),
      block: m.status === 'banned' ? 'banned' : m.status === 'withdrawn' ? 'withdrawn' : inStore ? 'in' : null,
      newToday: m.joinedAt === today && !last.has(m.id),
    }
  })
}

export async function memberCardById(tx: Tx, storeId: string, today: string, settings: Pick<StoreSettings, 'annualFeeEnabled'>, id: string) {
  if (!isUuid(id)) return null
  const [m] = await tx.select().from(t.members).where(and(eq(t.members.id, id), eq(t.members.storeId, storeId)))
  if (!m) return null
  return (await memberCards(tx, storeId, today, settings, [m]))[0]
}

export const BLOCK_MESSAGE = {
  banned: '出入禁止の会員です。受付できません。',
  withdrawn: '退会済みの会員です。受付できません。',
  in: 'すでに入店中です（二重受付はできません）。',
} as const

/** 受付可否のサーバー側の再確認（行ロックして同時受付を防ぐ） */
export async function assertCanEnter(tx: Tx, storeId: string, memberId: string, who = '会員') {
  const [m] = await tx.select().from(t.members).where(and(eq(t.members.id, memberId), eq(t.members.storeId, storeId))).for('update')
  if (!m) throw new UserError(`${who}が見つかりません。`)
  if (m.status === 'banned') throw new UserError(`${who}「${m.handleName}」(${m.memberNo}) は出入禁止です：${m.banReason || '理由未記入'}`)
  if (m.status === 'withdrawn') throw new UserError(`${who}「${m.handleName}」(${m.memberNo}) は退会済みです。`)
  const [{ n }] = await tx
    .select({ n: count() })
    .from(t.visits)
    .where(and(eq(t.visits.storeId, storeId), eq(t.visits.status, 'in'), or(eq(t.visits.memberId, memberId), eq(t.visits.partnerMemberId, memberId))))
  if (n > 0) throw new UserError(`${who}「${m.handleName}」(${m.memberNo}) はすでに入店中です。`)
  return m
}

/** 本日登録・来店歴なしか（カップルの相手が「登録のみ」の新規会員の場合に入会金を合算する） */
export async function isNewToday(tx: Tx, storeId: string, m: t.Member, today: string) {
  if (m.joinedAt !== today) return false
  const [{ n }] = await tx
    .select({ n: count() })
    .from(t.visits)
    .where(and(eq(t.visits.storeId, storeId), ne(t.visits.status, 'void'), or(eq(t.visits.memberId, m.id), eq(t.visits.partnerMemberId, m.id))))
  return n === 0
}

/** リピーター割引の判定に使う回数：前月の来店回数・今月すでに割引を使った回数 */
export async function discountCounts(tx: Tx, storeId: string, memberId: string, today: string) {
  const [pf, pt] = prevMonthRange(today)
  const prevMonthVisits = (await visitCounts(tx, storeId, pf, pt, [memberId])).get(memberId) ?? 0
  const [{ n }] = await tx
    .select({ n: count() })
    .from(t.visits)
    .where(and(
      eq(t.visits.storeId, storeId), eq(t.visits.memberId, memberId), ne(t.visits.status, 'void'), gt(t.visits.discount, 0),
      gte(t.visits.businessDate, monthStart(today)), lte(t.visits.businessDate, today),
    ))
  return { prevMonthVisits, usedThisMonth: n }
}

/** 区分ごとのリピーター割引の可否（画面表示用。金額はサーバーで再計算する） */
export function discountByCategory(today: Today, gender: '男性' | '女性', counts: { prevMonthVisits: number; usedThisMonth: number }) {
  return Object.fromEntries(
    CATEGORIES.map((c) => {
      const d = discountFor({ settings: today.settings, category: c, gender, ...counts, fee: today.prices[c] })
      return [c, { eligible: d.amount > 0, reason: d.reason }]
    }),
  ) as Record<Category, { eligible: boolean; reason: string }>
}

/** 次に払い出す会員番号（既に使われている番号は飛ばす） */
export async function nextFreeMemberNo(tx: Tx, storeId: string, prefix: string, from: number) {
  const rows = await tx
    .select({ no: t.members.memberNo })
    .from(t.members)
    .where(and(eq(t.members.storeId, storeId), like(t.members.memberNo, `${escapeLike(prefix)}%`)))
  const taken = new Set(rows.map((r) => r.no))
  let n = from
  while (taken.has(`${prefix}${n}`)) n++
  return n
}

/** 指定の来店（自店舗）を会員情報つきで取得 */
export async function loadVisit(tx: Tx, storeId: string, id: string) {
  if (!isUuid(id)) return null
  const partner = alias(t.members, 'partner')
  const [r] = await tx
    .select({ v: t.visits, memberNo: t.members.memberNo, handle: t.members.handleName, gender: t.members.gender, partnerNo: partner.memberNo, partnerHandle: partner.handleName })
    .from(t.visits)
    .innerJoin(t.members, eq(t.members.id, t.visits.memberId))
    .leftJoin(partner, eq(partner.id, t.visits.partnerMemberId))
    .where(and(eq(t.visits.id, id), eq(t.visits.storeId, storeId)))
  if (!r) return null
  const items = await tx.select().from(t.visitItems).where(eq(t.visitItems.visitId, id)).orderBy(asc(t.visitItems.createdAt))
  return { ...r, items }
}

export const memberLabel = (no: string, handle: string, partnerNo?: string | null, partnerHandle?: string | null) =>
  `${no} ${handle}${partnerNo ? ` ＋ ${partnerNo} ${partnerHandle ?? ''}` : ''}`
