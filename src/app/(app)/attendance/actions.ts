'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, gt, isNull, lt, ne, or } from 'drizzle-orm'
import { z } from 'zod'
import * as t from '@/db/schema'
import type { Tx } from '@/db/client'
import { audit, query, requireCtx, requireOwner, type Ctx } from '@/lib/dal'
import { fmtHm, parseJstLocal, workMinutes } from '@/lib/attendance'
import { fmtTime } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'
import { isUniqueViolation, str, zodMessage } from '@/components/settings/action-utils'
import type { ActionState } from '@/components/settings/types'

const done = (r: ActionState) => {
  if (r?.ok) revalidatePath('/attendance')
  return r
}

async function settingsOf(tx: Tx, storeId: string) {
  const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, storeId))
  return s
}

async function staffOf(tx: Tx, ctx: Ctx, id: string) {
  if (!z.uuid().safeParse(id).success) return undefined
  const [m] = await tx.select().from(t.staffMembers).where(and(eq(t.staffMembers.id, id), eq(t.staffMembers.storeId, ctx.storeId)))
  return m
}

/* ------------------------------ 打刻（スタッフも利用） ------------------------------ */

/** 出勤・退勤の記録。時刻はサーバーの現在時刻 */
export async function punch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  const mode = str(fd, 'mode')
  if (mode !== 'in' && mode !== 'out') return { error: '操作が正しくありません' }
  try {
    return done(
      await query(async (tx) => {
        const m = await staffOf(tx, ctx, str(fd, 'staffMemberId'))
        if (!m || !m.active) return { error: '対象者が見つかりません' }
        const now = new Date()
        const [open] = await tx.select().from(t.attendance).where(and(eq(t.attendance.staffMemberId, m.id), isNull(t.attendance.clockOut)))
        if (mode === 'in') {
          if (open) return { error: `${m.name}さんはすでに出勤しています（${fmtTime(open.clockIn)}〜）` }
          const s = await settingsOf(tx, ctx.storeId)
          await tx.insert(t.attendance).values({ storeId: ctx.storeId, staffMemberId: m.id, businessDate: businessDateOf(now, s), clockIn: now, createdBy: ctx.user.id })
          await audit(tx, ctx, '出勤を記録', `${m.name}（${fmtTime(now)}）`)
          return { ok: true, message: `${m.name}さんの出勤を記録しました（${fmtTime(now)}）` }
        }
        if (!open) return { error: `${m.name}さんの出勤が記録されていません` }
        if (now <= open.clockIn) return { error: '出勤の時刻より後に退勤してください' }
        await tx.update(t.attendance).set({ clockOut: now, updatedAt: now }).where(eq(t.attendance.id, open.id))
        const min = workMinutes(open.clockIn, now) ?? 0
        await audit(tx, ctx, '退勤を記録', `${m.name}（${fmtTime(open.clockIn)}〜${fmtTime(now)}・${fmtHm(min)}）`)
        return { ok: true, message: `${m.name}さんの退勤を記録しました（${fmtTime(now)}・勤務 ${fmtHm(min)}）` }
      }, ctx),
    )
  } catch (e) {
    if (isUniqueViolation(e)) return { error: 'すでに出勤しています。画面を更新して確認してください' }
    throw e
  }
}

/* ------------------------------ 記録の追加・修正・削除（オーナーのみ） ------------------------------ */

const MAX_MIN = 24 * 60

/** 入力値の確認：出勤は必須・未来は不可、退勤は出勤より後で24時間以内 */
function readTimes(fd: FormData): { clockIn: Date; clockOut: Date | null } | { error: string } {
  const clockIn = parseJstLocal(str(fd, 'clockIn'))
  if (!clockIn) return { error: '出勤の日時を入力してください' }
  const rawOut = str(fd, 'clockOut')
  const clockOut = rawOut ? parseJstLocal(rawOut) : null
  if (rawOut && !clockOut) return { error: '退勤の日時が正しくありません' }
  const soon = Date.now() + 5 * 60000
  if (clockIn.getTime() > soon || (clockOut && clockOut.getTime() > soon)) return { error: 'これから先の日時は入力できません' }
  if (clockOut && clockOut <= clockIn) return { error: '退勤は出勤より後の日時にしてください' }
  if (clockOut && (workMinutes(clockIn, clockOut) ?? 0) > MAX_MIN) return { error: '勤務時間が24時間を超えています。日時を確認してください' }
  return { clockIn, clockOut }
}

/** 同じ人の他の記録と時間が重なっていないか */
async function overlaps(tx: Tx, staffMemberId: string, clockIn: Date, clockOut: Date | null, exceptId?: string) {
  const far = new Date(8640000000000000)
  const rows = await tx
    .select({ id: t.attendance.id })
    .from(t.attendance)
    .where(
      and(
        eq(t.attendance.staffMemberId, staffMemberId),
        exceptId ? ne(t.attendance.id, exceptId) : undefined,
        lt(t.attendance.clockIn, clockOut ?? far),
        or(isNull(t.attendance.clockOut), gt(t.attendance.clockOut, clockIn)),
      ),
    )
    .limit(1)
  return rows.length > 0
}

const range = (a: Date, b: Date | null) => `${fmtTime(a)}〜${b ? fmtTime(b) : '（退勤なし）'}`

export async function addRecord(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const v = readTimes(fd)
  if ('error' in v) return v
  try {
    return done(
      await query(async (tx) => {
        const m = await staffOf(tx, ctx, str(fd, 'staffMemberId'))
        if (!m) return { error: '対象者が見つかりません' }
        if (await overlaps(tx, m.id, v.clockIn, v.clockOut)) return { error: 'ほかの記録と時間が重なっています' }
        const s = await settingsOf(tx, ctx.storeId)
        const businessDate = businessDateOf(v.clockIn, s)
        await tx.insert(t.attendance).values({ storeId: ctx.storeId, staffMemberId: m.id, businessDate, clockIn: v.clockIn, clockOut: v.clockOut, createdBy: ctx.user.id })
        await audit(tx, ctx, '勤怠を追加', `${m.name} ${businessDate} ${range(v.clockIn, v.clockOut)}`)
        return { ok: true, message: '記録を追加しました' }
      }, ctx),
    )
  } catch (e) {
    if (isUniqueViolation(e)) return { error: '退勤していない記録がすでにあります。先に退勤の日時を入れてください' }
    throw e
  }
}

/** 記録の修正（intent=delete で削除） */
export async function updateRecord(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const id = str(fd, 'id')
  if (!z.uuid().safeParse(id).success) return { error: '記録が見つかりません' }
  const intent = str(fd, 'intent')
  const v = intent === 'delete' ? null : readTimes(fd)
  if (v && 'error' in v) return v
  try {
    return done(
      await query(async (tx) => {
        const [r] = await tx.select().from(t.attendance).where(and(eq(t.attendance.id, id), eq(t.attendance.storeId, ctx.storeId)))
        const m = r && (await staffOf(tx, ctx, r.staffMemberId))
        if (!r || !m) return { error: '記録が見つかりません' }
        if (!v) {
          await tx.delete(t.attendance).where(eq(t.attendance.id, r.id))
          await audit(tx, ctx, '勤怠を削除', `${m.name} ${r.businessDate} ${range(r.clockIn, r.clockOut)}`)
          return { ok: true, message: '記録を削除しました' }
        }
        if (await overlaps(tx, m.id, v.clockIn, v.clockOut, r.id)) return { error: 'ほかの記録と時間が重なっています' }
        const s = await settingsOf(tx, ctx.storeId)
        const businessDate = businessDateOf(v.clockIn, s)
        await tx.update(t.attendance).set({ businessDate, clockIn: v.clockIn, clockOut: v.clockOut, updatedAt: new Date() }).where(eq(t.attendance.id, r.id))
        await audit(tx, ctx, '勤怠を修正', `${m.name} ${r.businessDate} ${range(r.clockIn, r.clockOut)} → ${businessDate} ${range(v.clockIn, v.clockOut)}`)
        return { ok: true, message: '記録を修正しました' }
      }, ctx),
    )
  } catch (e) {
    if (isUniqueViolation(e)) return { error: '退勤していない記録がすでにあります' }
    throw e
  }
}

/* ------------------------------ 対象者（オーナーのみ） ------------------------------ */

const memberSchema = z.object({
  name: z.string().min(1, '名前を入力してください').max(20, '名前は20文字以内で入力してください'),
  kind: z.enum(['社員', 'アルバイト'], '区分を選んでください'),
})

export async function addStaffMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = memberSchema.safeParse({ name: str(fd, 'name'), kind: str(fd, 'kind') })
  if (!p.success) return { error: zodMessage(p.error) }
  try {
    return done(
      await query(async (tx) => {
        await tx.insert(t.staffMembers).values({ storeId: ctx.storeId, name: p.data.name, kind: p.data.kind })
        await audit(tx, ctx, '勤怠の対象者を追加', `${p.data.name}（${p.data.kind}）`)
        return { ok: true, message: `${p.data.name}さんを追加しました` }
      }, ctx),
    )
  } catch (e) {
    if (isUniqueViolation(e)) return { error: `「${p.data.name}」はすでに登録されています` }
    throw e
  }
}

export async function updateStaffMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = memberSchema.safeParse({ name: str(fd, 'name'), kind: str(fd, 'kind') })
  if (!p.success) return { error: zodMessage(p.error) }
  const active = fd.get('active') === '1'
  try {
    return done(
      await query(async (tx) => {
        const m = await staffOf(tx, ctx, str(fd, 'id'))
        if (!m) return { error: '対象者が見つかりません' }
        if (!active && m.active) {
          const [open] = await tx.select({ id: t.attendance.id }).from(t.attendance).where(and(eq(t.attendance.staffMemberId, m.id), isNull(t.attendance.clockOut)))
          if (open) return { error: `${m.name}さんは出勤中です。退勤を記録してから無効にしてください` }
        }
        await tx.update(t.staffMembers).set({ name: p.data.name, kind: p.data.kind, active }).where(eq(t.staffMembers.id, m.id))
        const changes = [
          m.name !== p.data.name && `名前 ${m.name}→${p.data.name}`,
          m.kind !== p.data.kind && `区分 ${m.kind}→${p.data.kind}`,
          m.active !== active && (active ? '有効に戻す' : '無効にする'),
        ].filter(Boolean)
        await audit(tx, ctx, '勤怠の対象者を変更', `${p.data.name}（${changes.join('・') || '変更なし'}）`)
        return { ok: true, message: '保存しました' }
      }, ctx),
    )
  } catch (e) {
    if (isUniqueViolation(e)) return { error: `「${p.data.name}」はすでに登録されています` }
    throw e
  }
}
