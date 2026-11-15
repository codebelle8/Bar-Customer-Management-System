// データアクセス層：ログイン確認・権限確認・店舗の決定をここに集約する
import 'server-only'
import { createHash } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { getDb, withRls, type Tx } from '@/db/client'
import * as t from '@/db/schema'
import { SESSION_COOKIE, STORE_COOKIE, verifySession } from './session'

export interface CurrentUser {
  id: string
  name: string
  loginId: string
  role: 'owner' | 'staff'
  storeId: string | null
}

export interface Ctx {
  user: CurrentUser
  /** 表示・操作の対象店舗（スタッフは所属店舗に固定） */
  storeId: string
  store: t.Store
  stores: t.Store[]
  isOwner: boolean
}

/** パスワードハッシュの指紋（セッションに含め、パスワードが変わったら既存のログインを無効にする） */
export const passwordFingerprint = (hash: string) => createHash('sha256').update(hash).digest('base64url').slice(0, 16)

/** セッションを検証し、有効なアカウントを返す（無効なら null） */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value)
  if (!s) return null
  const db = await getDb()
  const [u] = await db.select().from(t.users).where(and(eq(t.users.id, s.uid), eq(t.users.active, true)))
  if (!u || s.pwv !== passwordFingerprint(u.passwordHash)) return null
  return { id: u.id, name: u.name, loginId: u.loginId, role: u.role, storeId: u.storeId }
})

/** ログイン必須。店舗の決定まで行う */
export const requireCtx = cache(async (): Promise<Ctx> => {
  const user = await getCurrentUser()
  if (!user) redirect('/api/session-end')
  const db = await getDb()
  const all = await db.select().from(t.stores).orderBy(asc(t.stores.createdAt), asc(t.stores.id))
  let storeId: string
  if (user.role === 'owner') {
    const wanted = (await cookies()).get(STORE_COOKIE)?.value
    storeId = all.find((s) => s.id === wanted)?.id ?? all.find((s) => s.status === 'active')?.id ?? all[0].id
  } else {
    if (!user.storeId) redirect('/login')
    storeId = user.storeId
  }
  const stores = user.role === 'owner' ? all : all.filter((s) => s.id === storeId)
  return { user, storeId, store: all.find((s) => s.id === storeId)!, stores, isOwner: user.role === 'owner' }
})

/** オーナー専用ページ・操作 */
export async function requireOwner(): Promise<Ctx> {
  const ctx = await requireCtx()
  if (!ctx.isOwner) redirect('/dashboard?denied=1')
  return ctx
}

/**
 * 権限制御（RLS）を有効にしたトランザクションでクエリを実行する。
 * スタッフはデータベース側でも所属店舗の行しか読み書きできない。
 */
export async function query<T>(fn: (tx: Tx, ctx: Ctx) => Promise<T>, ctxIn?: Ctx): Promise<T> {
  const ctx = ctxIn ?? (await requireCtx())
  return withRls(
    { role: ctx.user.role, storeId: ctx.isOwner ? ctx.storeId : ctx.user.storeId, userId: ctx.user.id },
    (tx) => fn(tx, ctx),
  )
}

/** 操作ログ（同じトランザクション内で記録） */
export async function audit(tx: Tx, ctx: Ctx, action: string, target = '') {
  await tx.insert(t.auditLogs).values({ storeId: ctx.storeId, userId: ctx.user.id, userName: ctx.user.name, action, target })
}

/** 店舗の設定・料金表・カレンダー（来店受付や集計で共通に使う） */
export async function loadPricing(tx: Tx, storeId: string) {
  const [settings] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, storeId))
  const rules = await tx.select().from(t.priceRules).where(eq(t.priceRules.storeId, storeId))
  const days = await tx.select().from(t.calendarDays).where(eq(t.calendarDays.storeId, storeId))
  return { settings, rules, overrides: new Map(days.map((d) => [d.date, d])) }
}
