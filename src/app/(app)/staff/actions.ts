'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import * as t from '@/db/schema'
import { audit, query, requireOwner } from '@/lib/dal'
import { isUniqueViolation, str, zodMessage } from '@/components/settings/action-utils'
import { generatePassword } from '@/components/settings/password'
import type { ActionState } from '@/components/settings/types'

const ROLE_LABEL = { owner: 'オーナー', staff: 'スタッフ' } as const

const nameSchema = z.string().min(1, '名前を入力してください').max(30, '名前は30文字以内で入力してください')
const roleSchema = z.enum(['staff', 'owner'], '権限を選択してください')

const createSchema = z
  .object({
    name: nameSchema,
    loginId: z.string().regex(/^[a-z0-9_-]{3,32}$/, 'ログインIDは半角英小文字・数字・「_」「-」の3〜32文字で入力してください'),
    role: roleSchema,
    storeId: z.string(),
    password: z.string().min(8, '初期パスワードは8文字以上にしてください').max(72, '初期パスワードは72文字以内にしてください'),
  })
  .refine((v) => v.role === 'owner' || v.storeId, { message: 'スタッフは所属店舗を選択してください', path: ['storeId'] })

export async function createStaff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = createSchema.safeParse({
    name: str(fd, 'name'),
    loginId: str(fd, 'loginId').toLowerCase(),
    role: str(fd, 'role'),
    storeId: str(fd, 'storeId'),
    password: String(fd.get('password') ?? ''),
  })
  if (!p.success) return { error: zodMessage(p.error) }
  const v = p.data
  const storeId = v.role === 'owner' ? null : v.storeId
  if (storeId && !ctx.stores.some((s) => s.id === storeId)) return { error: '所属店舗が見つかりません' }
  const passwordHash = await bcrypt.hash(v.password, 10)
  try {
    const dup = await query(async (tx) => {
      const [exists] = await tx.select({ id: t.users.id }).from(t.users).where(eq(t.users.loginId, v.loginId))
      if (exists) return true
      await tx.insert(t.users).values({ loginId: v.loginId, name: v.name, passwordHash, role: v.role, storeId })
      const store = ctx.stores.find((s) => s.id === storeId)
      await audit(tx, ctx, 'アカウントを追加', `${v.name}（${v.loginId}・${ROLE_LABEL[v.role]}${store ? `・${store.shortName}` : ''}）`)
      return false
    }, ctx)
    if (dup) return { error: `ログインID「${v.loginId}」はすでに使われています` }
  } catch (e) {
    if (isUniqueViolation(e)) return { error: `ログインID「${v.loginId}」はすでに使われています` }
    throw e
  }
  revalidatePath('/staff')
  return { ok: true, message: `${v.name}さんのアカウントを作成しました`, subject: v.loginId, secret: v.password }
}

const updateSchema = z.object({
  id: z.uuid(),
  name: nameSchema,
  role: roleSchema,
  storeId: z.string(),
  active: z.boolean(),
})

export async function updateStaff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const p = updateSchema.safeParse({
    id: str(fd, 'id'),
    name: str(fd, 'name'),
    role: str(fd, 'role'),
    storeId: str(fd, 'storeId'),
    active: fd.get('active') === '1',
  })
  if (!p.success) return { error: zodMessage(p.error) }
  const v = p.data
  const self = v.id === ctx.user.id
  // 自分自身の無効化・権限の変更はできない（管理者がいなくなるのを防ぐ）
  if (self && !v.active) return { error: '自分のアカウントは無効にできません' }
  if (self && v.role !== 'owner') return { error: '自分の権限は変更できません' }
  if (v.role === 'staff' && !v.storeId) return { error: 'スタッフは所属店舗を選択してください' }
  const storeId = v.role === 'owner' ? null : v.storeId
  if (storeId && !ctx.stores.some((s) => s.id === storeId)) return { error: '所属店舗が見つかりません' }

  const res = await query(async (tx) => {
    const [cur] = await tx.select().from(t.users).where(eq(t.users.id, v.id))
    if (!cur) return 'notfound' as const
    await tx.update(t.users).set({ name: v.name, role: v.role, storeId, active: v.active }).where(eq(t.users.id, v.id))
    const changes: string[] = []
    if (cur.name !== v.name) changes.push(`名前 ${cur.name}→${v.name}`)
    if (cur.role !== v.role) changes.push(`権限 ${ROLE_LABEL[cur.role]}→${ROLE_LABEL[v.role]}`)
    if ((cur.storeId ?? null) !== storeId) {
      const sn = (id: string | null) => ctx.stores.find((s) => s.id === id)?.shortName ?? 'なし'
      changes.push(`店舗 ${sn(cur.storeId)}→${sn(storeId)}`)
    }
    if (cur.active !== v.active) changes.push(v.active ? '有効化' : '無効化')
    if (changes.length) await audit(tx, ctx, 'アカウントを変更', `${v.name}（${cur.loginId}）${changes.join('・')}`)
    return changes.length ? ('ok' as const) : ('same' as const)
  }, ctx)
  if (res === 'notfound') return { error: 'アカウントが見つかりません' }
  revalidatePath('/staff')
  return { ok: true, message: res === 'same' ? '変更はありませんでした' : '保存しました' }
}

export async function resetPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireOwner()
  const id = z.uuid().safeParse(str(fd, 'id'))
  if (!id.success) return { error: 'アカウントが見つかりません' }
  if (id.data === ctx.user.id) return { error: '自分のパスワードは右上のメニューの「パスワード変更」から変更してください' }
  const password = generatePassword(10)
  const passwordHash = await bcrypt.hash(password, 10)
  const user = await query(async (tx) => {
    const [u] = await tx.update(t.users).set({ passwordHash }).where(eq(t.users.id, id.data)).returning({ name: t.users.name, loginId: t.users.loginId })
    if (u) await audit(tx, ctx, 'パスワードを再発行', `${u.name}（${u.loginId}）`)
    return u
  }, ctx)
  if (!user) return { error: 'アカウントが見つかりません' }
  revalidatePath('/staff')
  return { ok: true, message: `${user.name}さんのパスワードを再発行しました`, subject: user.loginId, secret: password }
}
