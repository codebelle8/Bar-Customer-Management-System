'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import * as t from '@/db/schema'
import { audit, query, requireCtx } from '@/lib/dal'
import { yen } from '@/lib/format'
import { AMOUNT_MAX, KIND_LABEL, isYmd, normalizeAmount } from '@/components/sales/constants'
import { businessToday, staffDates } from './data'

export interface ExpenseState {
  seq: number
  ok?: boolean
  error?: string
  values?: { name: string; amount: string }
}

const amountSchema = z
  .string()
  .regex(/^\d+$/, `金額は0〜${AMOUNT_MAX.toLocaleString('ja-JP')}の整数で入力してください`)
  .transform(Number)
  .pipe(z.number().int().min(0).max(AMOUNT_MAX, `金額は${AMOUNT_MAX.toLocaleString('ja-JP')}円以下で入力してください`))

const ExpenseInput = z.object({
  date: z.string().refine(isYmd, '日付が正しくありません'),
  kind: z.enum(['expense', 'tax', 'parttime'], '種類を選んでください'),
  name: z.string().trim().max(100, '内容は100文字以内で入力してください'),
  amount: amountSchema,
})

/** 経費・税金・アルバイトの登録（スタッフは本日と前営業日のみ） */
export async function addExpense(prev: ExpenseState, fd: FormData): Promise<ExpenseState> {
  const raw = { date: String(fd.get('date') ?? ''), kind: String(fd.get('kind') ?? ''), name: String(fd.get('name') ?? ''), amount: normalizeAmount(fd.get('amount')) }
  const values = { name: raw.name, amount: String(fd.get('amount') ?? '') }
  const seq = prev.seq + 1
  const p = ExpenseInput.safeParse(raw)
  if (!p.success) return { seq, error: p.error.issues[0]?.message ?? '入力内容を確認してください', values }
  const { date, kind, name, amount } = p.data

  const ctx = await requireCtx()
  const error = await query(async (tx) => {
    const today = await businessToday(tx, ctx.storeId)
    if (date > today) return '未来の日付には登録できません'
    if (!ctx.isOwner && !staffDates(today).includes(date)) return 'スタッフは本日と前営業日の分のみ登録できます'
    await tx.insert(t.expenses).values({ storeId: ctx.storeId, businessDate: date, kind, name, amount, staffId: ctx.user.id })
    await audit(tx, ctx, `${KIND_LABEL[kind]}の登録`, `${date} ${name || KIND_LABEL[kind]} ${yen(amount)}`)
    return null
  }, ctx)
  if (error) return { seq, error, values }
  revalidatePath('/sales')
  return { seq, ok: true }
}

/** 経費などの削除（スタッフは本日・前営業日に自分が登録したものだけ） */
export async function deleteExpense(id: unknown): Promise<{ error?: string }> {
  const p = z.uuid().safeParse(id)
  if (!p.success) return { error: '対象が見つかりません' }
  const ctx = await requireCtx()
  const error = await query(async (tx) => {
    const [row] = await tx.select().from(t.expenses).where(and(eq(t.expenses.id, p.data), eq(t.expenses.storeId, ctx.storeId)))
    if (!row) return '対象が見つかりません（すでに削除された可能性があります）'
    if (!ctx.isOwner) {
      const today = await businessToday(tx, ctx.storeId)
      if (row.staffId !== ctx.user.id) return '他のスタッフが登録した項目は削除できません'
      if (!staffDates(today).includes(row.businessDate)) return 'スタッフは本日と前営業日の分のみ削除できます'
    }
    await tx.delete(t.expenses).where(and(eq(t.expenses.id, row.id), eq(t.expenses.storeId, ctx.storeId)))
    await audit(tx, ctx, `${KIND_LABEL[row.kind]}の削除`, `${row.businessDate} ${row.name || KIND_LABEL[row.kind]} ${yen(row.amount)}`)
    return null
  }, ctx)
  if (error) return { error }
  revalidatePath('/sales')
  return {}
}
