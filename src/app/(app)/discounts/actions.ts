'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import * as t from '@/db/schema'
import { audit, query, requireOwner } from '@/lib/dal'
import { yen } from '@/lib/format'
import { money, str, zodMessage } from '@/components/settings/action-utils'
import type { ActionState } from '@/components/settings/types'
import { u30RuleText } from '@/lib/u30'

const schema = z.object({
  discountEnabled: z.boolean(),
  discountMinVisits: z.number('規定回数を入力してください').int('規定回数は整数で入力してください').min(1, '規定回数は1回以上にしてください').max(31, '規定回数は31回以下にしてください'),
  discountAmount: z.number('割引額を入力してください').int('割引額は整数で入力してください').min(0, '割引額は0円以上にしてください').max(100000, '割引額が大きすぎます'),
  discountGender: z.enum(['男性', '女性'], '対象性別を選択してください'),
  discountScope: z.enum(['every', 'once'], '適用範囲を選択してください'),
})

/** リピーター割引のルール（オーナーのみ変更可） */
export async function saveDiscountRule(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = schema.safeParse({
    discountEnabled: fd.get('discountEnabled') === '1',
    discountMinVisits: money(str(fd, 'discountMinVisits')) ?? undefined,
    discountAmount: money(str(fd, 'discountAmount')) ?? undefined,
    discountGender: str(fd, 'discountGender'),
    discountScope: str(fd, 'discountScope'),
  })
  if (!p.success) return { error: zodMessage(p.error) }
  const v = p.data
  await query(async (tx) => {
    await tx.update(t.storeSettings).set({ ...v, updatedAt: new Date() }).where(eq(t.storeSettings.storeId, ctx.storeId))
    await audit(
      tx, ctx, '割引ルールを変更',
      v.discountEnabled
        ? `前月${v.discountMinVisits}回以上・${v.discountGender}・${yen(v.discountAmount)}引き・${v.discountScope === 'every' ? '毎回' : '月1回'}`
        : '割引を停止',
    )
  }, ctx)
  revalidatePath('/discounts')
  return { ok: true, message: '割引ルールを保存しました' }
}

const u30Schema = z.object({
  u30Enabled: z.boolean(),
  u30MaxAge: z.number('対象年齢を入力してください').int('対象年齢は整数で入力してください').min(20, '対象年齢は20歳以上にしてください').max(99, '対象年齢は99歳以下にしてください'),
  u30Amount: z.number('割引額を入力してください').int('割引額は整数で入力してください').min(0, '割引額は0円以上にしてください').max(100000, '割引額が大きすぎます'),
  u30Gender: z.enum(['男性', '女性', '両方'], '対象性別を選択してください'),
  u30Combine: z.boolean(),
})

/** U30割引のルール（オーナーのみ変更可） */
export async function saveU30Rule(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = u30Schema.safeParse({
    u30Enabled: fd.get('u30Enabled') === '1',
    u30MaxAge: money(str(fd, 'u30MaxAge')) ?? undefined,
    u30Amount: money(str(fd, 'u30Amount')) ?? undefined,
    u30Gender: str(fd, 'u30Gender'),
    u30Combine: fd.get('u30Combine') === '1',
  })
  if (!p.success) return { error: zodMessage(p.error) }
  const v = p.data
  await query(async (tx) => {
    await tx.update(t.storeSettings).set({ ...v, updatedAt: new Date() }).where(eq(t.storeSettings.storeId, ctx.storeId))
    await audit(tx, ctx, 'U30割引のルールを変更', v.u30Enabled ? u30RuleText(v) : 'U30割引を停止')
  }, ctx)
  revalidatePath('/discounts')
  return { ok: true, message: 'U30割引のルールを保存しました' }
}
