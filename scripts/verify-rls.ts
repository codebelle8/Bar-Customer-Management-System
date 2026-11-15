// データベース側の権限制御（Row Level Security）の確認スクリプト
// 実行: npm run verify:rls   （一時フォルダに新しい DB を作って検証し、終了後に削除します）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harnes-rls-'))
process.env.PGLITE_DIR = dir
process.env.SEED_MODE = 'demo'
delete process.env.DATABASE_URL

const results: { check: string; ok: boolean; detail: string }[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ check: name, ok, detail })

async function main() {
  const { getDb, withRls } = await import('../src/db/client')
  const t = await import('../src/db/schema')
  const { eq, sql } = await import('drizzle-orm')
  const db = await getDb()
  const users = await db.select().from(t.users)
  const by = (id: string) => users.find((u) => u.loginId === id)!
  const owner = by('owner')
  const ueno = by('ueno01')
  const fresh = by('new01')
  const as = (u: typeof owner, store: string | null = u.storeId) => ({ role: u.role, storeId: store, userId: u.id })
  const [uenoMember] = await db.select().from(t.members).where(eq(t.members.storeId, 'ueno')).limit(1)

  // 1. 新店スタッフ：上野の会員・来店・経費は見えない
  const n1 = await withRls(as(fresh), async (tx) => ({
    members: (await tx.select().from(t.members)).length,
    visits: (await tx.select().from(t.visits)).length,
    expenses: (await tx.select().from(t.expenses)).length,
    byId: (await tx.select().from(t.members).where(eq(t.members.id, uenoMember.id))).length,
  }))
  check('新店スタッフは上野の会員を参照できない', n1.members === 0 && n1.byId === 0, JSON.stringify(n1))
  check('新店スタッフは上野の来店・経費を参照できない', n1.visits === 0 && n1.expenses === 0)

  // 2. 新店スタッフ：上野の店舗 ID で書き込もうとしても拒否される
  let blocked = false
  try {
    await withRls(as(fresh), (tx) =>
      tx.insert(t.members).values({ storeId: 'ueno', memberNo: 'X-1', handleName: 'test', gender: '男性', joinedAt: '2026-11-01' }),
    )
  } catch {
    blocked = true
  }
  check('他店舗への会員登録は拒否される', blocked)

  const upd = await withRls(as(fresh), (tx) =>
    tx.update(t.members).set({ memo: 'hacked' }).where(eq(t.members.id, uenoMember.id)).returning({ id: t.members.id }),
  )
  check('他店舗の会員は更新できない', upd.length === 0)

  // 3. 上野スタッフ：自店舗のデータのみ
  const n2 = await withRls(as(ueno), async (tx) => {
    const stores = await tx.selectDistinct({ s: t.members.storeId }).from(t.members)
    return { stores: stores.map((s) => s.s), members: (await tx.select({ id: t.members.id }).from(t.members)).length }
  })
  check('上野スタッフは上野の会員のみ参照できる', n2.stores.length === 1 && n2.stores[0] === 'ueno' && n2.members > 0, JSON.stringify(n2))

  // 4. 権限の昇格・他人のアカウント操作はできない
  let escalated = true
  try {
    await withRls(as(ueno), (tx) => tx.update(t.users).set({ role: 'owner' }).where(eq(t.users.id, ueno.id)))
  } catch {
    escalated = false
  }
  const [after] = await db.select().from(t.users).where(eq(t.users.id, ueno.id))
  check('スタッフは自分をオーナーに変更できない', !escalated || after.role === 'staff', after.role)
  const other = await withRls(as(ueno), (tx) => tx.update(t.users).set({ name: 'x' }).where(eq(t.users.id, owner.id)).returning({ id: t.users.id }))
  check('スタッフは他人のアカウントを変更できない', other.length === 0)
  const seeUsers = await withRls(as(ueno), (tx) => tx.select().from(t.users))
  check('スタッフが参照できるアカウントは自分のみ', seeUsers.length === 1 && seeUsers[0].id === ueno.id)
  const logs = await withRls(as(ueno), (tx) => tx.select().from(t.auditLogs))
  check('スタッフは操作ログを参照できない', logs.length === 0)
  let priceBlocked = false
  try {
    const r = await withRls(as(fresh), (tx) => tx.update(t.priceRules).set({ price: 1 }).where(eq(t.priceRules.storeId, 'ueno')).returning())
    priceBlocked = r.length === 0
  } catch {
    priceBlocked = true
  }
  check('他店舗の料金は変更できない', priceBlocked)
  let ownPrice = false
  try {
    const r = await withRls(as(ueno), (tx) => tx.update(t.priceRules).set({ price: 1 }).where(eq(t.priceRules.storeId, 'ueno')).returning())
    ownPrice = r.length === 0
  } catch {
    ownPrice = true
  }
  const menuSeen = await withRls(as(ueno), (tx) => tx.select().from(t.menuItems))
  check('スタッフは自店舗でも料金表を変更できない（参照は可）', ownPrice && menuSeen.length > 0 && menuSeen.every((m) => m.storeId === 'ueno'))

  // 5. オーナー：両店舗を参照できる
  const n3 = await withRls(as(owner, 'ueno'), async (tx) => {
    const stores = await tx.select().from(t.stores)
    const users = await tx.select().from(t.users)
    return { stores: stores.length, users: users.length }
  })
  check('オーナーは全店舗・全アカウントを参照できる', n3.stores === 2 && n3.users === users.length, JSON.stringify(n3))

  // 6. app_user ロールで RLS が有効になっていること
  const flags = await db.execute(sql`select relname, relrowsecurity from pg_class where relname in ('members','visits','visit_items','expenses','users','price_rules')`)
  const rows = (Array.isArray(flags) ? flags : (flags as unknown as { rows: { relname: string; relrowsecurity: boolean }[] }).rows) as { relname: string; relrowsecurity: boolean }[]
  check('主要テーブルで Row Level Security が有効', rows.length === 6 && rows.every((r) => r.relrowsecurity), rows.map((r) => r.relname).join(','))
}

main()
  .catch((e) => check('スクリプトの実行', false, String(e)))
  .finally(() => {
    console.table(results.map((r) => ({ 結果: r.ok ? 'OK' : 'NG', 確認項目: r.check, 詳細: r.detail })))
    const ng = results.filter((r) => !r.ok).length
    console.log(ng ? `NG: ${ng} 件` : `すべて OK（${results.length} 件）`)
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
    process.exit(ng ? 1 : 0)
  })
