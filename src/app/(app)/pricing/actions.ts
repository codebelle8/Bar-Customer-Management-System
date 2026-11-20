'use server'

import { revalidatePath } from 'next/cache'
import { and, between, eq } from 'drizzle-orm'
import { z } from 'zod'
import * as t from '@/db/schema'
import type { Category, CustomPrices, DayPart, DayType } from '@/db/schema'
import { audit, query, requireOwner } from '@/lib/dal'
import { addDays, diffDays, fmtMD, yen } from '@/lib/format'
import { CATEGORIES, DAY_PARTS, DAY_TYPES } from '@/lib/pricing'
import { isHm, isUniqueViolation, isYmd, money, str, zodMessage } from '@/components/settings/action-utils'
import type { ActionState } from '@/components/settings/types'

const MAX_PRICE = 1_000_000
const priceKey = (dt: DayType, dp: DayPart, c: Category) => `p_${dt}_${dp}_${c}`
const PART_LABEL: Record<DayPart, string> = { 昼: '昼の部', 夜: '夜の部' }

/* ------------------------------ 料金表 ------------------------------ */

export async function savePriceRules(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const next: { dayType: DayType; dayPart: DayPart; category: Category; price: number }[] = []
  for (const dayType of DAY_TYPES)
    for (const dayPart of DAY_PARTS)
      for (const category of CATEGORIES) {
        const v = money(str(fd, priceKey(dayType, dayPart, category)))
        if (v === null) return { error: `${dayType}・${PART_LABEL[dayPart]}・${category}の料金を入力してください` }
        if (!Number.isInteger(v) || v < 0 || v > MAX_PRICE) return { error: `${dayType}・${PART_LABEL[dayPart]}・${category}の料金は0〜1,000,000円の整数で入力してください` }
        next.push({ dayType, dayPart, category, price: v })
      }
  const changed = await query(async (tx) => {
    const cur = await tx.select().from(t.priceRules).where(eq(t.priceRules.storeId, ctx.storeId))
    const diffs: string[] = []
    for (const r of next) {
      const old = cur.find((x) => x.dayType === r.dayType && x.dayPart === r.dayPart && x.category === r.category)
      if (old?.price === r.price) continue
      diffs.push(`${r.dayType}・${r.dayPart}・${r.category} ${old ? yen(old.price) : '未設定'}→${yen(r.price)}`)
      await tx
        .insert(t.priceRules)
        .values({ storeId: ctx.storeId, ...r })
        .onConflictDoUpdate({ target: [t.priceRules.storeId, t.priceRules.dayType, t.priceRules.dayPart, t.priceRules.category], set: { price: r.price } })
    }
    if (diffs.length) await audit(tx, ctx, '料金表を変更', diffs.length > 3 ? `${diffs.slice(0, 3).join('、')} ほか${diffs.length - 3}件` : diffs.join('、'))
    return diffs.length
  }, ctx)
  revalidatePath('/pricing')
  return changed ? { ok: true, message: `料金表を保存しました（${changed}件変更）` } : { ok: true, message: '変更はありませんでした' }
}

/* ------------------------------ 営業時間 ------------------------------ */

const hoursSchema = z
  .object({
    dayStart: z.string().refine(isHm, '昼の部の開始時刻を正しく入力してください'),
    nightStart: z.string().refine(isHm, '夜の部の開始時刻を正しく入力してください'),
    dayCutoff: z.string().refine(isHm, '営業日の区切り時刻を正しく入力してください'),
    weekendDays: z.array(z.coerce.number().int().min(0).max(6)).max(7),
  })
  .refine((v) => v.dayStart < v.nightStart, '夜の部の開始は昼の部の開始より後の時刻にしてください')
  .refine((v) => v.dayCutoff <= v.dayStart, '営業日の区切りは昼の部の開始より前の時刻にしてください（例 06:00）')

export async function saveHours(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = hoursSchema.safeParse({
    dayStart: str(fd, 'dayStart'),
    nightStart: str(fd, 'nightStart'),
    dayCutoff: str(fd, 'dayCutoff'),
    weekendDays: fd.getAll('weekendDays').map(String),
  })
  if (!p.success) return { error: zodMessage(p.error) }
  const weekendDays = [...new Set(p.data.weekendDays)].sort()
  await query(async (tx) => {
    await tx
      .update(t.storeSettings)
      .set({ dayStart: p.data.dayStart, nightStart: p.data.nightStart, dayCutoff: p.data.dayCutoff, weekendDays, updatedAt: new Date() })
      .where(eq(t.storeSettings.storeId, ctx.storeId))
    const W = ['日', '月', '火', '水', '木', '金', '土']
    await audit(tx, ctx, '営業時間を変更', `昼${p.data.dayStart}・夜${p.data.nightStart}・区切り${p.data.dayCutoff}・週末${weekendDays.map((d) => W[d]).join('') || 'なし'}`)
  }, ctx)
  revalidatePath('/pricing')
  return { ok: true, message: '営業時間・曜日区分を保存しました' }
}

/* ------------------------------ 延長料金 ------------------------------ */

const extensionSchema = z.object({
  extensionDays: z.array(z.coerce.number().int().min(0).max(6)).max(7),
  extensionUnitPrice: z.coerce.number({ error: '1時間あたりの金額を入力してください' }).int('金額は整数で入力してください').min(0).max(MAX_PRICE),
  extensionCap: z.coerce.number({ error: '上限の金額を入力してください' }).int('金額は整数で入力してください').min(0).max(MAX_PRICE),
})

export async function saveExtension(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = extensionSchema.safeParse({
    extensionDays: fd.getAll('extensionDays').map(String),
    extensionUnitPrice: str(fd, 'extensionUnitPrice'),
    extensionCap: str(fd, 'extensionCap'),
  })
  if (!p.success) return { error: zodMessage(p.error) }
  const extensionDays = [...new Set(p.data.extensionDays)].sort()
  await query(async (tx) => {
    await tx
      .update(t.storeSettings)
      .set({ extensionDays, extensionUnitPrice: p.data.extensionUnitPrice, extensionCap: p.data.extensionCap, updatedAt: new Date() })
      .where(eq(t.storeSettings.storeId, ctx.storeId))
    const W = ['日', '月', '火', '水', '木', '金', '土']
    await audit(tx, ctx, '延長料金を変更', `${extensionDays.map((d) => W[d]).join('') || 'なし'}・1時間${yen(p.data.extensionUnitPrice)}・上限${p.data.extensionCap ? yen(p.data.extensionCap) : 'なし'}`)
  }, ctx)
  revalidatePath('/pricing')
  return { ok: true, message: '延長料金を保存しました' }
}

/* ------------------------------ 料金カレンダー ------------------------------ */

const MAX_RANGE = 31

export async function saveCalendarDay(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const from = str(fd, 'from')
  const to = str(fd, 'to') || from
  if (!isYmd(from) || !isYmd(to)) return { error: '日付を正しく入力してください' }
  if (to < from) return { error: '終了日は開始日以降の日付にしてください' }
  if (diffDays(to, from) + 1 > MAX_RANGE) return { error: `まとめて設定できるのは${MAX_RANGE}日までです` }
  const intent = str(fd, 'intent')
  const typeRaw = str(fd, 'dayType')
  const clear = intent === 'clear' || typeRaw === 'auto'
  const range = from === to ? fmtMD(from) : `${fmtMD(from)}〜${fmtMD(to)}`

  if (clear) {
    const n = await query(async (tx) => {
      const del = await tx
        .delete(t.calendarDays)
        .where(and(eq(t.calendarDays.storeId, ctx.storeId), between(t.calendarDays.date, from, to)))
        .returning({ d: t.calendarDays.date })
      if (del.length) await audit(tx, ctx, '料金カレンダーを自動判定に戻す', range)
      return del.length
    }, ctx)
    revalidatePath('/pricing')
    return { ok: true, message: n ? `${range} を自動判定（祝日・曜日）に戻しました` : `${range} は自動判定のままです` }
  }

  const type = z.enum(DAY_TYPES as [DayType, ...DayType[]]).safeParse(typeRaw)
  if (!type.success) return { error: '料金区分を選択してください' }
  const label = str(fd, 'label')
  if (label.length > 40) return { error: 'ラベルは40文字以内で入力してください' }

  // 個別料金（空欄は料金表どおり）
  const custom: CustomPrices = {}
  for (const part of DAY_PARTS)
    for (const cat of CATEGORIES) {
      const v = money(str(fd, `c_${part}_${cat}`))
      if (v === null) continue
      if (!Number.isInteger(v) || v < 0 || v > MAX_PRICE) return { error: `個別料金（${PART_LABEL[part]}・${cat}）は0〜1,000,000円の整数で入力してください` }
      custom[part] = { ...custom[part], [cat]: v }
    }
  const customPrices = Object.keys(custom).length ? custom : null

  try {
    await query(async (tx) => {
      for (let d = from; d <= to; d = addDays(d, 1)) {
        await tx
          .insert(t.calendarDays)
          .values({ storeId: ctx.storeId, date: d, dayType: type.data, label, customPrices })
          .onConflictDoUpdate({ target: [t.calendarDays.storeId, t.calendarDays.date], set: { dayType: type.data, label, customPrices } })
      }
      const priceNote = customPrices
        ? `・個別料金 ${DAY_PARTS.flatMap((p) => CATEGORIES.filter((c) => customPrices[p]?.[c] !== undefined).map((c) => `${p}${c}${yen(customPrices[p]![c]!)}`)).join(' ')}`
        : ''
      await audit(tx, ctx, '料金カレンダーを設定', `${range} ${type.data}${label ? `（${label}）` : ''}${priceNote}`)
    }, ctx)
  } catch (e) {
    if (isUniqueViolation(e)) return { error: '同時に更新されました。もう一度保存してください' }
    throw e
  }
  revalidatePath('/pricing')
  return { ok: true, message: `${range} を「${type.data}」に設定しました` }
}

/* ------------------------------ ドリンク・延長メニュー ------------------------------ */

const menuSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(['drink', 'other'], '種類を選択してください'),
  name: z.string().min(1, 'メニュー名を入力してください').max(40, 'メニュー名は40文字以内で入力してください'),
  price: z.number('金額を入力してください').int('金額は整数で入力してください').min(0, '金額は0円以上にしてください').max(MAX_PRICE, '金額が大きすぎます'),
  sort: z.number().int().min(0).max(9999),
  active: z.boolean(),
})

export async function saveMenuItem(prev: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, 'intent') === 'delete') return deleteMenuItem(prev, fd)
  const ctx = await requireOwner()
  const price = money(str(fd, 'price'))
  const sort = money(str(fd, 'sort'))
  const p = menuSchema.safeParse({
    id: str(fd, 'id') || undefined,
    kind: str(fd, 'kind'),
    name: str(fd, 'name'),
    price: price === null ? undefined : price,
    sort: sort === null || Number.isNaN(sort) ? 0 : sort,
    active: fd.has('id') ? fd.get('active') === '1' : true,
  })
  if (!p.success) return { error: zodMessage(p.error) }
  const { id, ...v } = p.data
  const found = await query(async (tx) => {
    if (id) {
      const [row] = await tx
        .update(t.menuItems)
        .set(v)
        .where(and(eq(t.menuItems.id, id), eq(t.menuItems.storeId, ctx.storeId)))
        .returning({ id: t.menuItems.id })
      if (!row) return false
      await audit(tx, ctx, 'メニューを変更', `${v.name} ${yen(v.price)}${v.active ? '' : '（非表示）'}`)
    } else {
      await tx.insert(t.menuItems).values({ storeId: ctx.storeId, ...v })
      await audit(tx, ctx, 'メニューを追加', `${v.name} ${yen(v.price)}`)
    }
    return true
  }, ctx)
  if (!found) return { error: 'メニューが見つかりません（削除された可能性があります）' }
  revalidatePath('/pricing')
  return { ok: true, message: id ? '保存しました' : `「${v.name}」を追加しました` }
}

async function deleteMenuItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const id = z.uuid().safeParse(str(fd, 'id'))
  if (!id.success) return { error: 'メニューが見つかりません' }
  await query(async (tx) => {
    const [row] = await tx
      .delete(t.menuItems)
      .where(and(eq(t.menuItems.id, id.data), eq(t.menuItems.storeId, ctx.storeId)))
      .returning({ name: t.menuItems.name })
    if (row) await audit(tx, ctx, 'メニューを削除', row.name)
  }, ctx)
  revalidatePath('/pricing')
  return { ok: true, message: '削除しました' }
}
