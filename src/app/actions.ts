'use server'

import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import * as t from '@/db/schema'
import { audit, passwordFingerprint, query, requireCtx } from '@/lib/dal'
import { SESSION_COOKIE, SESSION_HOURS, STORE_COOKIE, signSession } from '@/lib/session'

const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const loginId = String(formData.get('loginId') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '')
  if (!loginId || !password) return { error: 'IDとパスワードを入力してください' }
  const db = await getDb()
  const [u] = await db.select().from(t.users).where(eq(t.users.loginId, loginId))
  const ok = u && u.active && (await bcrypt.compare(password, u.passwordHash))
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)) // 総当たり対策の待ち時間
    return { error: 'IDまたはパスワードが正しくありません' }
  }
  const token = await signSession({ uid: u.id, role: u.role, sid: u.storeId, pwv: passwordFingerprint(u.passwordHash) })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_HOURS * 3600 })
  await db.update(t.users).set({ lastLoginAt: new Date() }).where(eq(t.users.id, u.id))
  await db.insert(t.auditLogs).values({ storeId: u.storeId, userId: u.id, userName: u.name, action: 'ログイン', target: '' })
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard')
}

export async function logout() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/login')
}

/** 表示する店舗の切り替え（全店舗のオーナーのみ） */
export async function selectStore(formData: FormData) {
  const ctx = await requireCtx()
  if (!ctx.allStores) return
  const id = String(formData.get('storeId') ?? '')
  if (!ctx.stores.some((s) => s.id === id)) return
  ;(await cookies()).set(STORE_COOKIE, id, { ...cookieBase, maxAge: 60 * 60 * 24 * 365 })
  redirect(String(formData.get('back') ?? '/dashboard'))
}

export async function changePassword(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  const current = String(formData.get('current') ?? '')
  const next = String(formData.get('next') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (next.length < 8) return { error: '新しいパスワードは8文字以上にしてください' }
  if (next !== confirm) return { error: '確認用のパスワードが一致しません' }
  const ctx = await requireCtx()
  const db = await getDb()
  const [u] = await db.select().from(t.users).where(eq(t.users.id, ctx.user.id))
  if (!u || !(await bcrypt.compare(current, u.passwordHash))) return { error: '現在のパスワードが正しくありません' }
  const hash = await bcrypt.hash(next, 10)
  await query(async (tx, c) => {
    await tx.update(t.users).set({ passwordHash: hash }).where(eq(t.users.id, c.user.id))
    await audit(tx, c, 'パスワード変更', c.user.name)
  })
  // 自分のセッションは新しいパスワードで再発行（他の端末のログインは無効になる）
  const token = await signSession({ uid: u.id, role: u.role, sid: u.storeId, pwv: passwordFingerprint(hash) })
  ;(await cookies()).set(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_HOURS * 3600 })
  return { ok: true }
}
