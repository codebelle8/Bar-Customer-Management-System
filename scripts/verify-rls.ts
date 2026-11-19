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

/** 拒否される（例外になる、または 1 行も変更されない）ことを確認する */
async function denied(fn: () => Promise<unknown[] | unknown>): Promise<boolean> {
  try {
    const r = await fn()
    return Array.isArray(r) ? r.length === 0 : false
  } catch {
    return true
  }
}

async function main() {
  const { getDb, withRls } = await import('../src/db/client')
  const t = await import('../src/db/schema')
  const { eq, sql } = await import('drizzle-orm')
  const db = await getDb()
  const users = await db.select().from(t.users)
  const by = (id: string) => users.find((u) => u.loginId === id)!
  const owner = by('owner')
  const storeOwner = by('harnes-owner')
  const staff = by('harnes-staff')
  const fresh = by('new01')
  const HARNES = staff.storeId!
  const NEW = fresh.storeId!
  const as = (u: typeof owner, store: string | null = u.storeId) => ({ role: u.role, storeId: store, userId: u.id })
  const [harnesMember] = await db.select().from(t.members).where(eq(t.members.storeId, HARNES)).limit(1)

  // 1. 新店スタッフ：ハーネスの会員・来店・経費は見えない
  const n1 = await withRls(as(fresh), async (tx) => ({
    members: (await tx.select().from(t.members)).length,
    visits: (await tx.select().from(t.visits)).length,
    expenses: (await tx.select().from(t.expenses)).length,
    byId: (await tx.select().from(t.members).where(eq(t.members.id, harnesMember.id))).length,
  }))
  check('新店スタッフはハーネスの会員を参照できない', n1.members === 0 && n1.byId === 0, JSON.stringify(n1))
  check('新店スタッフはハーネスの来店・経費を参照できない', n1.visits === 0 && n1.expenses === 0)

  // 2. 新店スタッフ：ハーネスの店舗 ID で書き込もうとしても拒否される
  check('他店舗への会員登録は拒否される', await denied(() => withRls(as(fresh), (tx) =>
    tx.insert(t.members).values({ storeId: HARNES, memberNo: 'X-1', handleName: 'test', gender: '男性', joinedAt: '2026-11-01' }))))
  const upd = await withRls(as(fresh), (tx) =>
    tx.update(t.members).set({ memo: 'hacked' }).where(eq(t.members.id, harnesMember.id)).returning({ id: t.members.id }),
  )
  check('他店舗の会員は更新できない', upd.length === 0)

  // 3. ハーネスのスタッフ：自店舗のデータのみ
  const n2 = await withRls(as(staff), async (tx) => {
    const stores = await tx.selectDistinct({ s: t.members.storeId }).from(t.members)
    return { stores: stores.map((s) => s.s), members: (await tx.select({ id: t.members.id }).from(t.members)).length }
  })
  check('ハーネスのスタッフはハーネスの会員のみ参照できる', n2.stores.length === 1 && n2.stores[0] === HARNES && n2.members > 0, JSON.stringify(n2))

  // 4. スタッフ：権限の昇格・他人のアカウント操作はできない
  await denied(() => withRls(as(staff), (tx) => tx.update(t.users).set({ role: 'owner' }).where(eq(t.users.id, staff.id))))
  const [after] = await db.select().from(t.users).where(eq(t.users.id, staff.id))
  check('スタッフは自分をオーナーに変更できない', after.role === 'staff', after.role)
  const other = await withRls(as(staff), (tx) => tx.update(t.users).set({ name: 'x' }).where(eq(t.users.id, owner.id)).returning({ id: t.users.id }))
  check('スタッフは他人のアカウントを変更できない', other.length === 0)
  const seeUsers = await withRls(as(staff), (tx) => tx.select().from(t.users))
  check('スタッフが参照できるアカウントは自分のみ', seeUsers.length === 1 && seeUsers[0].id === staff.id)
  const logs = await withRls(as(staff), (tx) => tx.select().from(t.auditLogs))
  check('スタッフは操作ログを参照できない', logs.length === 0)
  check('他店舗の料金は変更できない', await denied(() => withRls(as(fresh), (tx) => tx.update(t.priceRules).set({ price: 1 }).where(eq(t.priceRules.storeId, HARNES)).returning())))
  const ownPrice = await denied(() => withRls(as(staff), (tx) => tx.update(t.priceRules).set({ price: 1 }).where(eq(t.priceRules.storeId, HARNES)).returning()))
  const menuSeen = await withRls(as(staff), (tx) => tx.select().from(t.menuItems))
  check('スタッフは自店舗でも料金表を変更できない（参照は可）', ownPrice && menuSeen.length > 0 && menuSeen.every((m) => m.storeId === HARNES))

  // 5. 全店舗のオーナー：両店舗を参照できる
  const n3 = await withRls(as(owner, HARNES), async (tx) => {
    const stores = await tx.select().from(t.stores)
    const users = await tx.select().from(t.users)
    return { stores: stores.length, users: users.length }
  })
  check('オーナーは全店舗・全アカウントを参照できる', n3.stores === 2 && n3.users === users.length, JSON.stringify(n3))

  // 6. 店舗オーナー（ハーネスのみ）：自店舗は全機能、他店舗は見えない・変更できない
  await db.insert(t.auditLogs).values({ storeId: NEW, userId: owner.id, userName: owner.name, action: '確認用', target: '新店の記録' })
  const so = as(storeOwner)
  const n4 = await withRls(so, async (tx) => ({
    stores: (await tx.select().from(t.stores)).map((s) => s.id),
    memberStores: (await tx.selectDistinct({ s: t.members.storeId }).from(t.members)).map((s) => s.s),
    userStores: [...new Set((await tx.select().from(t.users)).map((u) => u.storeId))],
    logStores: [...new Set((await tx.select().from(t.auditLogs)).map((l) => l.storeId))],
  }))
  check('店舗オーナーは自店舗の店舗・会員のみ参照できる', n4.stores.join() === HARNES && n4.memberStores.join() === HARNES, JSON.stringify(n4))
  check('店舗オーナーが参照できるアカウント・操作ログは自店舗のみ', n4.userStores.join() === HARNES && n4.logStores.join() === HARNES, JSON.stringify({ users: n4.userStores, logs: n4.logStores }))
  const ownRule = await withRls(so, (tx) => tx.update(t.priceRules).set({ price: 7000 }).where(eq(t.priceRules.storeId, HARNES)).returning())
  check('店舗オーナーは自店舗の料金表を変更できる', ownRule.length > 0, `${ownRule.length}行`)
  check('店舗オーナーは他店舗の料金表・店舗情報を変更できない',
    (await denied(() => withRls(so, (tx) => tx.update(t.priceRules).set({ price: 1 }).where(eq(t.priceRules.storeId, NEW)).returning()))) &&
    (await denied(() => withRls(so, (tx) => tx.update(t.stores).set({ name: 'x' }).where(eq(t.stores.id, NEW)).returning()))))
  const added = await withRls(so, (tx) => tx.insert(t.users).values({ loginId: 'so-made', name: '追加', passwordHash: 'x', role: 'staff', storeId: HARNES }).returning())
  check('店舗オーナーは自店舗のスタッフを追加できる', added.length === 1)
  const noOwner = await denied(() => withRls(so, (tx) => tx.insert(t.users).values({ loginId: 'so-owner', name: 'x', passwordHash: 'x', role: 'owner' }).returning()))
  const noStoreOwner = await denied(() => withRls(so, (tx) => tx.insert(t.users).values({ loginId: 'so-so', name: 'x', passwordHash: 'x', role: 'store_owner', storeId: HARNES }).returning()))
  const noOtherStore = await denied(() => withRls(so, (tx) => tx.insert(t.users).values({ loginId: 'so-new', name: 'x', passwordHash: 'x', role: 'staff', storeId: NEW }).returning()))
  check('店舗オーナーはオーナー権限のアカウント・他店舗のスタッフを作成できない', noOwner && noStoreOwner && noOtherStore, JSON.stringify({ noOwner, noStoreOwner, noOtherStore }))
  await denied(() => withRls(so, (tx) => tx.update(t.users).set({ role: 'owner', storeId: null }).where(eq(t.users.id, storeOwner.id)).returning()))
  await denied(() => withRls(so, (tx) => tx.update(t.users).set({ role: 'store_owner' }).where(eq(t.users.id, staff.id)).returning()))
  const [soAfter] = await db.select().from(t.users).where(eq(t.users.id, storeOwner.id))
  const [staffAfter] = await db.select().from(t.users).where(eq(t.users.id, staff.id))
  check('店舗オーナーは自分・スタッフにオーナー権限を付けられない', soAfter.role === 'store_owner' && staffAfter.role === 'staff', `${soAfter.role}/${staffAfter.role}`)
  const ownerTouched = await withRls(so, (tx) => tx.update(t.users).set({ name: 'x' }).where(eq(t.users.id, owner.id)).returning())
  check('店舗オーナーは全店舗のオーナーのアカウントを変更できない', ownerTouched.length === 0)

  // 7. 勤怠：他店舗の対象者・記録は見えない。スタッフは打刻のみ（対象者の登録・記録の削除は不可）
  const [harnesStaffMember] = await db.select().from(t.staffMembers).where(eq(t.staffMembers.storeId, HARNES)).limit(1)
  const att = await withRls(as(fresh), async (tx) => ({
    staff: (await tx.select().from(t.staffMembers)).length,
    records: (await tx.select().from(t.attendance)).length,
  }))
  check('新店スタッフはハーネスの勤怠（対象者・記録）を参照できない', !!harnesStaffMember && att.staff === 0 && att.records === 0, JSON.stringify(att))
  check('他店舗の対象者で打刻できない', await denied(() => withRls(as(fresh), (tx) =>
    tx.insert(t.attendance).values({ storeId: HARNES, staffMemberId: harnesStaffMember.id, businessDate: '2026-11-01', clockIn: new Date() }).returning())))
  const noMember = await denied(() => withRls(as(staff), (tx) => tx.insert(t.staffMembers).values({ storeId: HARNES, name: 'rls-test', kind: 'アルバイト' }).returning()))
  const punched = await withRls(as(staff), (tx) =>
    tx.insert(t.attendance).values({ storeId: HARNES, staffMemberId: harnesStaffMember.id, businessDate: '2026-11-01', clockIn: new Date('2026-11-01T09:00:00Z'), clockOut: new Date('2026-11-01T10:00:00Z') }).returning())
  const noDelete = await withRls(as(staff), (tx) => tx.delete(t.attendance).where(eq(t.attendance.id, punched[0].id)).returning())
  check('スタッフは自店舗で打刻できるが、対象者の登録・記録の削除はできない', noMember && punched.length === 1 && noDelete.length === 0, JSON.stringify({ noMember, punched: punched.length, deleted: noDelete.length }))
  const soDelete = await withRls({ role: storeOwner.role, storeId: storeOwner.storeId, userId: storeOwner.id }, (tx) => tx.delete(t.attendance).where(eq(t.attendance.id, punched[0].id)).returning())
  check('店舗オーナーは自店舗の勤怠の記録を削除できる', soDelete.length === 1)

  // 8. app_user ロールで RLS が有効になっていること
  const flags = await db.execute(sql`select relname, relrowsecurity from pg_class where relname in ('members','visits','visit_items','expenses','users','price_rules','staff_members','attendance')`)
  const rows = (Array.isArray(flags) ? flags : (flags as unknown as { rows: { relname: string; relrowsecurity: boolean }[] }).rows) as { relname: string; relrowsecurity: boolean }[]
  check('主要テーブルで Row Level Security が有効', rows.length === 8 && rows.every((r) => r.relrowsecurity), rows.map((r) => r.relname).join(','))
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
