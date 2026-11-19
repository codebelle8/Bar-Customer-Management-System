'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import * as t from '@/db/schema'
import type { Tx } from '@/db/client'
import { audit, query, requireCtx, type Ctx } from '@/lib/dal'
import { CASH_ITEMS, isCashItem } from '@/lib/cash'
import { businessDateOf } from '@/lib/pricing'
import { isUniqueViolation, isYmd, str } from '@/components/settings/action-utils'
import type { ActionState } from '@/components/settings/types'

const done = (r: ActionState) => {
  if (r?.ok) revalidatePath('/cash')
  return r
}

async function todayOf(tx: Tx, storeId: string) {
  const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, storeId))
  return businessDateOf(new Date(), s)
}

async function staffOf(tx: Tx, ctx: Ctx, id: string) {
  if (!z.uuid().safeParse(id).success) return undefined
  const [m] = await tx.select().from(t.staffMembers).where(and(eq(t.staffMembers.id, id), eq(t.staffMembers.storeId, ctx.storeId), eq(t.staffMembers.active, true)))
  return m
}

/** 過去の日の記録・取消はオーナー（店舗オーナー）のみ。当日はスタッフも可 */
function dateError(ctx: Ctx, date: string, today: string): string | null {
  if (!isYmd(date) || date > today) return '日付が正しくありません'
  if (date < today && !ctx.isOwner) return '過去の日の記録はオーナーのみ変更できます'
  return null
}

const itemLabel = (k: string) => {
  const i = CASH_ITEMS.find((x) => x.key === k)
  return i ? `${i.section}・${i.label}` : k
}

export async function checkItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  const date = str(fd, 'date')
  const item = str(fd, 'item')
  if (!isCashItem(item)) return { error: '確認項目が正しくありません' }
  try {
    return done(
      await query(async (tx) => {
        const err = dateError(ctx, date, await todayOf(tx, ctx.storeId))
        if (err) return { error: err }
        const m = await staffOf(tx, ctx, str(fd, 'staffMemberId'))
        if (!m) return { error: '確認した人を選んでください' }
        await tx.insert(t.cashChecks).values({ storeId: ctx.storeId, businessDate: date, item, staffMemberId: m.id, createdBy: ctx.user.id })
        await audit(tx, ctx, 'レジ金の確認', `${date} ${itemLabel(item)}（${m.name}）`)
        return { ok: true, message: `${m.name}さんの確認を記録しました` }
      }, ctx),
    )
  } catch (e) {
    if (isUniqueViolation(e)) return { error: 'すでに確認済みです。画面を更新してください' }
    throw e
  }
}

export async function clearItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  const id = str(fd, 'id')
  if (!z.uuid().safeParse(id).success) return { error: '記録が見つかりません' }
  return done(
    await query(async (tx) => {
      const [c] = await tx.select().from(t.cashChecks).where(and(eq(t.cashChecks.id, id), eq(t.cashChecks.storeId, ctx.storeId)))
      if (!c) return { error: '記録が見つかりません' }
      const err = dateError(ctx, c.businessDate, await todayOf(tx, ctx.storeId))
      if (err) return { error: err }
      await tx.delete(t.cashChecks).where(eq(t.cashChecks.id, c.id))
      await audit(tx, ctx, 'レジ金の確認を取消', `${c.businessDate} ${itemLabel(c.item)}`)
      return { ok: true, message: '確認を取り消しました' }
    }, ctx),
  )
}

export async function addNote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  const date = str(fd, 'date')
  const body = str(fd, 'body')
  if (!body) return { error: 'メモを入力してください' }
  if (body.length > 500) return { error: 'メモは500文字以内で入力してください' }
  return done(
    await query(async (tx) => {
      const err = dateError(ctx, date, await todayOf(tx, ctx.storeId))
      if (err) return { error: err }
      const raw = str(fd, 'staffMemberId')
      const m = raw ? await staffOf(tx, ctx, raw) : undefined
      if (raw && !m) return { error: '記入者が見つかりません' }
      await tx.insert(t.cashNotes).values({ storeId: ctx.storeId, businessDate: date, staffMemberId: m?.id ?? null, body, createdBy: ctx.user.id })
      await audit(tx, ctx, '引継ぎメモを追加', `${date}${m ? `（${m.name}）` : ''}`)
      return { ok: true, message: 'メモを追加しました' }
    }, ctx),
  )
}

export async function deleteNote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  const id = str(fd, 'id')
  if (!z.uuid().safeParse(id).success) return { error: 'メモが見つかりません' }
  return done(
    await query(async (tx) => {
      const [n] = await tx.select().from(t.cashNotes).where(and(eq(t.cashNotes.id, id), eq(t.cashNotes.storeId, ctx.storeId)))
      if (!n) return { error: 'メモが見つかりません' }
      const err = dateError(ctx, n.businessDate, await todayOf(tx, ctx.storeId))
      if (err) return { error: err }
      await tx.delete(t.cashNotes).where(eq(t.cashNotes.id, n.id))
      await audit(tx, ctx, '引継ぎメモを削除', n.businessDate)
      return { ok: true, message: 'メモを削除しました' }
    }, ctx),
  )
}
