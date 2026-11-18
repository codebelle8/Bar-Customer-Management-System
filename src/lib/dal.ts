// データアクセス層：ログイン確認・権限確認・店舗の決定をここに集約する
import 'server-only'
import { createHash } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { getDb, withRls, type Tx } from '@/db/client'
import * as t from '@/db/schema'
import type { Role } from './roles'
import { SESSION_COOKIE, STORE_COOKIE, verifySession } from './session'

export interface CurrentUser {
  id: string
  name: string
  loginId: string
  role: Role
  storeId: string | null
}

export interface Ctx {
  user: CurrentUser
  /** 表示・操作の対象店舗（店舗オーナー・スタッフは所属店舗に固定） */
  storeId: string
  store: t.Store
  /** 利用できる店舗（全店舗のオーナーのみ複数） */
  stores: t.Store[]
  /** オーナー権限（全店舗のオーナー・店舗オーナー）：料金設定・レポート・スタッフ管理・設定など */
  isOwner: boolean
  /** 全店舗のオーナー：店舗の切り替え・オーナーアカウントの管理 */
  allStores: boolean
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
  // 並び順：営業中の店舗 → 準備中の店舗（それぞれ登録順）
  const all = (await db.select().from(t.stores).orderBy(asc(t.stores.createdAt), asc(t.stores.id)))
    .sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active'))
  const allStores = user.role === 'owner'
  let storeId: string
  if (allStores) {
    const wanted = (await cookies()).get(STORE_COOKIE)?.value
    storeId = all.find((s) => s.id === wanted)?.id ?? all.find((s) => s.status === 'active')?.id ?? all[0].id
  } else {
    if (!user.storeId || !all.some((s) => s.id === user.storeId)) redirect('/api/session-end')
    storeId = user.storeId
  }
  const stores = allStores ? all : all.filter((s) => s.id === storeId)
  return { user, storeId, store: all.find((s) => s.id === storeId)!, stores, isOwner: user.role !== 'staff', allStores }
})

/** オーナー専用ページ・操作（店舗オーナーは所属店舗のみ） */
export async function requireOwner(): Promise<Ctx> {
  const ctx = await requireCtx()
  if (!ctx.isOwner) redirect('/dashboard?denied=1')
  return ctx
}

/**
 * 権限制御（RLS）を有効にしたトランザクションでクエリを実行する。
 * 店舗オーナー・スタッフはデータベース側でも所属店舗の行しか読み書きできない。
 */
export async function query<T>(fn: (tx: Tx, ctx: Ctx) => Promise<T>, ctxIn?: Ctx): Promise<T> {
  const ctx = ctxIn ?? (await requireCtx())
  return withRls(
    { role: ctx.user.role, storeId: ctx.allStores ? ctx.storeId : ctx.user.storeId, userId: ctx.user.id },
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
