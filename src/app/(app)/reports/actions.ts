'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import * as t from '@/db/schema'
import { audit, query, requireOwner } from '@/lib/dal'
import { yen } from '@/lib/format'
import { AMOUNT_MAX, STD_ADJ, isYm, normalizeAmount } from '@/components/sales/constants'

export interface AdjState {
  seq: number
  ok?: boolean
  error?: string
}

const Row = z.object({
  id: z.union([z.literal(''), z.uuid()]),
  label: z.string().trim().min(1, '項目名を入力してください').max(30, '項目名は30文字以内で入力してください'),
  amount: z
    .string()
    .regex(/^\d+$/, `金額は0〜${AMOUNT_MAX.toLocaleString('ja-JP')}の整数で入力してください`)
    .transform(Number)
    .pipe(z.number().int().min(0).max(AMOUNT_MAX, `金額は${AMOUNT_MAX.toLocaleString('ja-JP')}円以下で入力してください`)),
})
const Input = z.object({ month: z.string().refine(isYm, '年月が正しくありません'), rows: z.array(Row).max(30, '項目は30件までです') })

/** 総括の調整（龍経費・46経費・口座移動・任意の項目）をまとめて保存（オーナーのみ） */
export async function saveAdjustments(prev: AdjState, fd: FormData): Promise<AdjState> {
  const ctx = await requireOwner()
  const seq = prev.seq + 1
  const ids = fd.getAll('id').map(String)
  const labels = fd.getAll('label').map(String)
  const amounts = fd.getAll('amount').map(normalizeAmount)
  const p = Input.safeParse({ month: String(fd.get('month') ?? ''), rows: ids.map((id, i) => ({ id, label: labels[i] ?? '', amount: amounts[i] ?? '' })) })
  if (!p.success) return { seq, error: p.error.issues[0]?.message ?? '入力内容を確認してください' }
  const { month, rows } = p.data
  const names = rows.map((r) => r.label)
  if (new Set(names).size !== names.length) return { seq, error: '同じ名前の項目が重複しています' }

  const error = await query(async (tx) => {
    const where = and(eq(t.monthlyAdjustments.storeId, ctx.storeId), eq(t.monthlyAdjustments.month, month))
    const existing = await tx.select().from(t.monthlyAdjustments).where(where)
    const byId = new Map(existing.map((e) => [e.id, e]))
    for (const r of rows) if (r.id && !byId.has(r.id)) return '他の画面で変更された可能性があります。画面を再読み込みしてください'
    // 標準の項目は名前を変えない・削除しない
    for (const r of rows) {
      const cur = r.id ? byId.get(r.id) : undefined
      if (cur && (STD_ADJ as readonly string[]).includes(cur.label) && cur.label !== r.label) return `「${cur.label}」の名前は変更できません`
    }
    const kept = new Set(rows.map((r) => r.id).filter(Boolean))
    for (const e of existing) if (!kept.has(e.id) && (STD_ADJ as readonly string[]).includes(e.label) && names.includes(e.label)) return '同じ名前の項目が重複しています'
    for (const e of existing) {
      if (kept.has(e.id)) continue
      if ((STD_ADJ as readonly string[]).includes(e.label)) continue
      await tx.delete(t.monthlyAdjustments).where(and(where, eq(t.monthlyAdjustments.id, e.id)))
    }
    let sort = 0
    for (const r of rows) {
      if (r.id) await tx.update(t.monthlyAdjustments).set({ label: r.label, amount: r.amount, sort }).where(and(where, eq(t.monthlyAdjustments.id, r.id)))
      else await tx.insert(t.monthlyAdjustments).values({ storeId: ctx.storeId, month, label: r.label, amount: r.amount, sort })
      sort++
    }
    await audit(tx, ctx, '総括の調整を更新', `${month} ${rows.map((r) => `${r.label} ${yen(r.amount)}`).join('・')}`)
    return null
  }, ctx)
  if (error) return { seq, error }
  revalidatePath('/reports')
  return { seq, ok: true }
}
