'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import * as t from '@/db/schema'
import { audit, query, requireOwner } from '@/lib/dal'
import { yen } from '@/lib/format'
import { DEFAULT_TERMS, DEFAULT_TERMS_VERSION } from '@/lib/terms'
import { money, str, zodMessage } from '@/components/settings/action-utils'
import type { ActionState } from '@/components/settings/types'

/* ------------------------------ 店舗情報 ------------------------------ */

const storeSchema = z.object({
  name: z.string().min(1, '店舗名を入力してください').max(60, '店舗名は60文字以内で入力してください'),
  shortName: z.string().min(1, '略称を入力してください').max(20, '略称は20文字以内で入力してください'),
  status: z.enum(['active', 'preparing'], '状態を選択してください'),
  memberPrefix: z.string().max(10, '会員番号の接頭辞は10文字以内で入力してください').regex(/^[A-Za-z0-9-]*$/, '会員番号の接頭辞は半角英数字と「-」で入力してください'),
  nextMemberNo: z.number('次の会員番号を入力してください').int('次の会員番号は整数で入力してください').min(1, '次の会員番号は1以上にしてください').max(99_999_999, '次の会員番号が大きすぎます'),
})

export async function saveStore(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = storeSchema.safeParse({
    name: str(fd, 'name'),
    shortName: str(fd, 'shortName'),
    status: str(fd, 'status'),
    memberPrefix: str(fd, 'memberPrefix'),
    nextMemberNo: money(str(fd, 'nextMemberNo')) ?? undefined,
  })
  if (!p.success) return { error: zodMessage(p.error) }
  const v = p.data
  const res = await query(async (tx) => {
    const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    if (v.nextMemberNo < s.nextMemberNo && fd.get('confirmLower') !== '1')
      return { error: `次の会員番号を${s.nextMemberNo}から${v.nextMemberNo}に下げます。既存の会員番号と重複しないことを確認し、確認欄にチェックを入れてください` }
    const no = `${v.memberPrefix}${v.nextMemberNo}`
    // 番号を変更したときだけ、使用済みかを確認する（受付側でも使用済みの番号は自動で飛ばす）
    const [taken] =
      v.nextMemberNo !== s.nextMemberNo || v.memberPrefix !== ctx.store.memberPrefix
        ? await tx.select({ id: t.members.id }).from(t.members).where(and(eq(t.members.storeId, ctx.storeId), eq(t.members.memberNo, no)))
        : []
    if (taken) return { error: `会員番号「${no}」はすでに使われています。未使用の番号を指定してください` }
    await tx.update(t.stores).set({ name: v.name, shortName: v.shortName, status: v.status, memberPrefix: v.memberPrefix }).where(eq(t.stores.id, ctx.storeId))
    await tx.update(t.storeSettings).set({ nextMemberNo: v.nextMemberNo, updatedAt: new Date() }).where(eq(t.storeSettings.storeId, ctx.storeId))
    const changes: string[] = []
    const st = ctx.store
    if (st.name !== v.name) changes.push(`店舗名 ${st.name}→${v.name}`)
    if (st.shortName !== v.shortName) changes.push(`略称 ${st.shortName}→${v.shortName}`)
    if (st.status !== v.status) changes.push(`状態 ${v.status === 'active' ? '営業中' : '準備中'}`)
    if (st.memberPrefix !== v.memberPrefix) changes.push(`接頭辞 ${st.memberPrefix}→${v.memberPrefix}`)
    if (s.nextMemberNo !== v.nextMemberNo) changes.push(`次の会員番号 ${s.nextMemberNo}→${v.nextMemberNo}`)
    if (changes.length) await audit(tx, ctx, '店舗情報を変更', changes.join('・'))
    return { ok: true, message: changes.length ? '店舗情報を保存しました' : '変更はありませんでした' }
  }, ctx)
  if (res.ok) revalidatePath('/', 'layout')
  return res
}

/* ------------------------------ 料金・会費 ------------------------------ */

const feeSchema = z.object({
  joinFee: z.number('入会金を入力してください').int('入会金は整数で入力してください').min(0, '入会金は0円以上にしてください').max(1_000_000, '入会金が大きすぎます'),
  annualFeeEnabled: z.boolean(),
  annualFee: z.number('年会費を入力してください').int('年会費は整数で入力してください').min(0, '年会費は0円以上にしてください').max(1_000_000, '年会費が大きすぎます'),
})

export async function saveFees(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = feeSchema.safeParse({
    joinFee: money(str(fd, 'joinFee')) ?? undefined,
    annualFeeEnabled: fd.get('annualFeeEnabled') === '1',
    annualFee: money(str(fd, 'annualFee')) ?? 0,
  })
  if (!p.success) return { error: zodMessage(p.error) }
  const v = p.data
  if (v.annualFeeEnabled && v.annualFee <= 0) return { error: '年会費を徴収する場合は金額を入力してください' }
  await query(async (tx) => {
    await tx.update(t.storeSettings).set({ ...v, updatedAt: new Date() }).where(eq(t.storeSettings.storeId, ctx.storeId))
    await audit(tx, ctx, '入会金・年会費を変更', `入会金${yen(v.joinFee)}・年会費${v.annualFeeEnabled ? yen(v.annualFee) : 'なし'}`)
  }, ctx)
  revalidatePath('/', 'layout')
  return { ok: true, message: '入会金・年会費を保存しました' }
}

/* ------------------------------ 会員規約 ------------------------------ */

export async function saveTerms(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const version = str(fd, 'termsVersion')
  // 行末の空白・改行コードだけを整える（行頭の「!」や空行はそのまま）
  const text = String(fd.get('termsText') ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim()
  if (!version) return { error: '版（バージョン）を入力してください' }
  if (version.length > 20) return { error: '版は20文字以内で入力してください' }
  if (!text) return { error: '規約の本文を入力してください' }
  if (text.length > 20000) return { error: '規約の本文が長すぎます' }
  const res = await query(async (tx) => {
    const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    const textChanged = s.termsText.trim() !== text
    if (textChanged && version === s.termsVersion)
      return { error: `本文を変更した場合は、新しい版を入力してください（現在の版：${s.termsVersion}）。会員がどの版に同意したかを区別するためです` }
    if (!textChanged && version === s.termsVersion) return { ok: true, message: '変更はありませんでした' }
    await tx.update(t.storeSettings).set({ termsVersion: version, termsText: text, updatedAt: new Date() }).where(eq(t.storeSettings.storeId, ctx.storeId))
    await audit(tx, ctx, '会員規約を変更', `版 ${s.termsVersion}→${version}${textChanged ? '（本文を変更）' : ''}`)
    return { ok: true, message: `会員規約（版 ${version}）を保存しました` }
  }, ctx)
  if (res.ok) {
    revalidatePath('/settings')
    revalidatePath('/terms')
  }
  return res
}

export async function restoreDefaultTerms(): Promise<ActionState> {
  const ctx = await requireOwner()
  await query(async (tx) => {
    await tx
      .update(t.storeSettings)
      .set({ termsVersion: DEFAULT_TERMS_VERSION, termsText: DEFAULT_TERMS, updatedAt: new Date() })
      .where(eq(t.storeSettings.storeId, ctx.storeId))
    await audit(tx, ctx, '会員規約を初期の内容に戻す', `版 ${DEFAULT_TERMS_VERSION}`)
  }, ctx)
  revalidatePath('/settings')
  revalidatePath('/terms')
  return { ok: true, message: `初期の会員規約（版 ${DEFAULT_TERMS_VERSION}）に戻しました` }
}
