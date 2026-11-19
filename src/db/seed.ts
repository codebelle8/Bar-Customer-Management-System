import bcrypt from 'bcryptjs'
import { count, eq } from 'drizzle-orm'
import type { DB } from './client'
import * as t from './schema'
import type { CalendarDay, Category, DayPart, DayType } from './schema'
import { DEFAULT_TERMS, DEFAULT_TERMS_VERSION, REFERRALS } from '../lib/terms'
import { businessDateOf, dayInfo, priceOf } from '../lib/pricing'
import { addDays, addMonths, weekdayOf } from '../lib/format'
import october from './seed-data/october-2026.json'

// 店舗の内部ID（画面には表示しない。既存データとの互換のため値は変えない）
const HARNES = 'ueno'
const NEW_STORE = 'new'

// 料金表（仮）：店舗から正式な料金表を受領後、「料金設定・カレンダー」で変更してください
const PRICE_TABLE: Record<DayType, Record<DayPart, Record<Category, number>>> = {
  平日: { 昼: { 男性: 7000, 女性: 1000, カップル: 6000 }, 夜: { 男性: 9000, 女性: 1000, カップル: 8000 } },
  週末: { 昼: { 男性: 8500, 女性: 1000, カップル: 7000 }, 夜: { 男性: 12000, 女性: 2000, カップル: 10000 } },
  祝日: { 昼: { 男性: 8500, 女性: 1000, カップル: 7000 }, 夜: { 男性: 12000, 女性: 2000, カップル: 10000 } },
  イベント: { 昼: { 男性: 9000, 女性: 1000, カップル: 8000 }, 夜: { 男性: 13000, 女性: 2000, カップル: 11000 } },
}
const MENU: { kind: 'drink' | 'extension'; name: string; price: number }[] = [
  { kind: 'extension', name: '延長料金（1時間）', price: 3000 },
  { kind: 'drink', name: 'ソフトドリンク', price: 500 },
  { kind: 'drink', name: 'ビール', price: 700 },
  { kind: 'drink', name: 'エナジードリンク', price: 800 },
  { kind: 'drink', name: 'テキーラ', price: 1000 },
  { kind: 'drink', name: 'シャンパン（グラス）', price: 1500 },
  { kind: 'drink', name: 'シャンパン（ボトル）', price: 10000 },
]

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** 日本時間の日付＋分（24時以降は翌日）を Date に */
const jstAt = (date: string, minutes: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, minutes - 9 * 60))
}

async function chunked<T>(rows: T[], size: number, fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size))
}

export async function ensureSeed(db: DB) {
  const [{ n }] = await db.select({ n: count() }).from(t.stores)
  if (n > 0) return
  // 本番 DB（DATABASE_URL あり）は既定で clean：店舗・料金・初期オーナーのみ。デモデータは SEED_MODE=demo を明示した場合だけ
  const demo = (process.env.SEED_MODE ?? (process.env.DATABASE_URL ? 'clean' : 'demo')) === 'demo'
  await seedBase(db, demo)
  if (demo) await seedDemo(db)
}

async function seedBase(db: DB, demo: boolean) {
  await db.insert(t.stores).values([
    // 店舗名は「設定 → 店舗情報」で変更可能（新店舗は正式な屋号が決まりしだい変更）
    { id: HARNES, name: 'ハーネス東京', shortName: 'ハーネス', status: 'active', memberPrefix: 'H-' },
    { id: NEW_STORE, name: '新店', shortName: '新店', status: 'preparing', memberPrefix: 'N-' },
  ])
  for (const storeId of [HARNES, NEW_STORE]) {
    await db.insert(t.storeSettings).values({
      storeId, dayStart: '12:00', nightStart: '19:00', dayCutoff: '06:00', weekendDays: [0, 6], joinFee: 2000,
      discountEnabled: true, discountMinVisits: 4, discountAmount: 2000, discountGender: '男性', discountScope: 'every',
      termsVersion: DEFAULT_TERMS_VERSION, termsText: DEFAULT_TERMS,
    })
    const rules: (typeof t.priceRules.$inferInsert)[] = []
    for (const [dayType, parts] of Object.entries(PRICE_TABLE))
      for (const [dayPart, cats] of Object.entries(parts))
        for (const [category, price] of Object.entries(cats))
          rules.push({ storeId, dayType: dayType as DayType, dayPart: dayPart as DayPart, category: category as Category, price })
    await db.insert(t.priceRules).values(rules)
    await db.insert(t.menuItems).values(MENU.map((m, i) => ({ ...m, storeId, sort: i })))
  }
  // 祝日は日本の祝日データ（内閣府「国民の祝日」）から自動判定。カレンダーの個別設定は店舗が入力したイベントのみ
  if (demo) {
    // デモ：10月の Excel 備考にあるイベント（3日間ビンゴ・ネイルイベント）のみ。架空の予定は入れない
    await db.insert(t.calendarDays).values([
      { storeId: HARNES, date: '2026-10-09', dayType: 'イベント', label: 'ビンゴイベント（3日間）' },
      { storeId: HARNES, date: '2026-10-10', dayType: 'イベント', label: 'ビンゴイベント（3日間）' },
      { storeId: HARNES, date: '2026-10-11', dayType: 'イベント', label: 'ビンゴイベント（3日間）' },
      { storeId: HARNES, date: '2026-10-27', dayType: 'イベント', label: 'ネイルイベント' },
    ])
  }

  if (demo) {
    const hash = (p: string) => bcrypt.hashSync(p, 10)
    await db.insert(t.users).values([
      // 全店舗のオーナー・ハーネスの店舗オーナー・ハーネスのスタッフ（共用1つ）・新店のスタッフ
      { loginId: 'owner', name: 'オーナー', passwordHash: hash('owner1234'), role: 'owner' },
      { loginId: 'harnes-owner', name: 'ハーネス オーナー', passwordHash: hash('owner1234'), role: 'store_owner', storeId: HARNES },
      { loginId: 'harnes-staff', name: 'ハーネス スタッフ', passwordHash: hash('staff1234'), role: 'staff', storeId: HARNES },
      { loginId: 'new01', name: '新店スタッフ', passwordHash: hash('staff1234'), role: 'staff', storeId: NEW_STORE },
    ])
  } else {
    const pw = process.env.INITIAL_OWNER_PASSWORD ?? Math.random().toString(36).slice(2, 12)
    await db.insert(t.users).values({ loginId: 'owner', name: 'オーナー', passwordHash: bcrypt.hashSync(pw, 10), role: 'owner' })
    if (!process.env.INITIAL_OWNER_PASSWORD) console.log(`[seed] 初期オーナーアカウント owner / ${pw}（ログイン後に変更してください）`)
  }
}

const MALE_HANDLES = ['タカ', 'ケン', 'まさ', 'ジュン', 'ゆうき', 'ヒロ', 'カズ', 'Shin', 'トシ', 'ナオ', 'りょう', 'テツ', 'コウ', 'たけし', 'ヨシ',
  'アキラ', 'レン', 'ソウ', 'はやと', 'ダイ', 'ゴウ', 'セイ', 'リク', 'カイ', 'ノブ', 'ミツ', 'ヒデ', 'とも', 'ジン', 'マコト', 'Ken', 'Taku',
  'つよし', 'イサム', 'タイガ', 'ゆうま', 'コウジ', 'ヤス', 'さとる', 'ワタル', 'ハル', 'キョウ', 'シュウ', 'げん', 'ライ', 'ダン', 'エイジ', 'ソラ',
  'ハジメ', 'ミナト', 'イツキ', 'かける', 'ナギ', 'リュウ', 'タケ', 'ヨウ', 'ケンジ', 'マモル', 'ヒカル', 'アツシ', 'ユタカ', 'ひさし', 'コウタ', 'シンジ']
const FEMALE_HANDLES = ['ミキ', 'ゆい', 'マイ', 'ナナ', 'サキ', 'えみ', 'カナ', 'ミホ', 'アイ', 'レナ', 'もも', 'ハナ', 'ユキ', 'チカ', 'ノア', 'リサ',
  'みゆ', 'サラ', 'エリ', 'アン', 'ルナ', 'メイ', 'ミオ', 'ひな', 'ユズ', 'カエデ', 'ナツ', 'すず', 'ココ', 'リオ', 'マリ', 'アスカ', 'Yuri', 'Mio']
const EXPENSE_POOL: [string, number][] = [['まいばす', 6000], ['アマゾン', 12000], ['氷', 4000], ['代引き', 8000], ['朝活', 15000], ['アマギフ', 10000], ['たこ焼き', 3000], ['牛乳', 1000]]

async function seedDemo(db: DB) {
  const rand = rng(20261115)
  const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
  const [settings] = await db.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, HARNES))
  const rules = await db.select().from(t.priceRules)
  const ueRules = rules.filter((r) => r.storeId === HARNES)
  const overrides = new Map<string, CalendarDay>((await db.select().from(t.calendarDays)).filter((c) => c.storeId === HARNES).map((c) => [c.date, c]))
  const users = await db.select().from(t.users)
  const owner = users.find((u) => u.role === 'owner')!
  // デモの受付担当：ハーネスのアカウント（店舗オーナー・スタッフ）
  const staffIds = users.filter((u) => u.storeId === HARNES).map((u) => u.id)
  const now = new Date()
  const todayBiz = businessDateOf(now, settings)

  // ---------- 会員 ----------
  const used = new Map<string, number>()
  const handle = (gender: '男性' | '女性') => {
    const base = pick(gender === '男性' ? MALE_HANDLES : FEMALE_HANDLES)
    const k = (used.get(base) ?? 0) + 1
    used.set(base, k)
    return k === 1 ? base : `${base}${k}`
  }
  type M = typeof t.members.$inferInsert & { id: string; weight: number }
  const members: M[] = []
  let no = 10001
  const newJoinDates: string[] = []
  for (let d = '2026-10-01'; d < todayBiz; d = addDays(d, 1)) if (rand() < 0.75) newJoinDates.push(d)
  const total = 300 + newJoinDates.length
  for (let i = 0; i < total; i++) {
    const gender: '男性' | '女性' = rand() < 0.62 ? '男性' : '女性'
    const joinedAt = i >= 300 ? newJoinDates[i - 300] : addDays('2022-01-10', ri(0, 1700))
    members.push({
      id: crypto.randomUUID(), storeId: HARNES, memberNo: `H-${no++}`, handleName: handle(gender), gender,
      birthday: `${ri(1965, 2004)}-${String(ri(1, 12)).padStart(2, '0')}-${String(ri(1, 28)).padStart(2, '0')}`,
      joinedAt, referral: pick(REFERRALS), idDocs: [pick(['運転免許証', '運転免許証', 'マイナンバーカード', 'パスポート']), '健康保険証'],
      termsVersion: i >= 300 ? '2026.11' : '紙', termsSignedAt: jstAt(joinedAt, 20 * 60), status: 'active', createdBy: owner.id,
      weight: 0.2 + rand() * 1.8,
    })
  }
  const banned = members.filter((m) => m.gender === '男性' && m.joinedAt < '2026-01-01').slice(0, 3)
  const banReasons = ['他のお客様が不快に思う迷惑行為（2026/08）', '店外での待ち合わせ・連絡先の交換（2026/06）', '泥酔・スタッフへの暴言（2026/09）']
  banned.forEach((m, k) => {
    m.status = 'banned'
    m.banReason = banReasons[k]
    m.bannedAt = jstAt('2026-09-01', 0)
  })
  members.slice(0, 2).forEach((m) => (m.memo = 'プライバシー重視。番号で呼ぶこと。'))
  await chunked(members.map(({ weight: _w, ...m }) => m), 200, (rows) => db.insert(t.members).values(rows))
  // 次に発行する会員番号（デモ会員の続きから）
  await db.update(t.storeSettings).set({ nextMemberNo: no }).where(eq(t.storeSettings.storeId, HARNES))

  const active = members.filter((m) => m.status === 'active')
  const newOn = new Map<string, M>()
  members.slice(300).forEach((m) => newOn.set(m.joinedAt, m))

  // ---------- 来店 ----------
  type V = typeof t.visits.$inferInsert & { id: string }
  type I = typeof t.visitItems.$inferInsert
  const visits: V[] = []
  const items: I[] = []
  const monthCount = new Map<string, number>() // `${memberId}|${YYYY-MM}`
  const drinkMenu = MENU.filter((m) => m.kind === 'drink' && m.price < 5000)

  const pickMember = (gender: '男性' | '女性', date: string, usedToday: Set<string>) => {
    const cands = active.filter((m) => m.gender === gender && m.joinedAt <= date && !usedToday.has(m.id))
    if (!cands.length) return undefined
    let r = rand() * cands.reduce((a, m) => a + m.weight, 0)
    for (const m of cands) if ((r -= m.weight) <= 0) return m
    return cands[cands.length - 1]
  }

  /** 金額を来店に按分して品目として登録（100円単位、最後の1件で端数調整） */
  const spread = (targets: V[], total: number, kind: 'drink' | 'extension', name: string, date: string, part: DayPart) => {
    const list = targets.filter((v) => v.checkedInAt! <= now)
    if (!list.length || total <= 0) return
    let acc = 0
    list.forEach((v, k) => {
      const amount = k === list.length - 1 ? total - acc : Math.round(total / list.length / 100) * 100
      acc += amount
      if (amount <= 0) return
      items.push({ storeId: HARNES, visitId: v.id, kind, name, unitPrice: amount, qty: 1, amount, businessDate: date, dayPart: part, staffId: pick(staffIds), createdAt: new Date(v.checkedInAt!.getTime() + 3 * 3600000) })
      if (v.status === 'out') v.extraTotal = (v.extraTotal ?? 0) + amount
    })
  }
  let lastPart: V[] = []

  /** 1 日・1 部分の来店を作成（entranceTarget を指定すると合計を合わせる＝10月の実績から作成） */
  const makePart = (date: string, part: DayPart, counts: Record<Category, number>, drinks: number, entranceTarget: number | null, usedToday: Set<string>) => {
    if (part === '昼') lastPart = []
    // Excel では夜の部の人数が 0 でも昼夜で売上を分けている日がある（例 10/4）→ 昼の部のお客様の延長・ドリンクとして計上
    if (counts.男性 + counts.女性 + counts.カップル === 0) {
      if (entranceTarget) spread(lastPart, entranceTarget, 'extension', `延長料金（${part}の部）`, date, part)
      if (drinks) spread(lastPart, drinks, 'drink', '有料ドリンク', date, part)
      return
    }
    const day = dayInfo(date, settings, overrides)
    const list: { cat: Category; member: M; partner?: M; isNew: boolean }[] = []
    const fresh = newOn.get(date)
    for (const cat of ['男性', '女性', 'カップル'] as Category[]) {
      for (let k = 0; k < counts[cat]; k++) {
        if (cat === 'カップル') {
          const a = pickMember('男性', date, usedToday)
          const b = pickMember('女性', date, usedToday)
          if (!a || !b) continue
          usedToday.add(a.id).add(b.id)
          list.push({ cat, member: a, partner: b, isNew: false })
        } else {
          const g = cat as '男性' | '女性'
          let m: M | undefined
          let isNew = false
          if (fresh && fresh.gender === g && !usedToday.has(fresh.id) && part === '夜') {
            m = fresh
            isNew = true
          } else m = pickMember(g, date, usedToday)
          if (!m) continue
          usedToday.add(m.id)
          list.push({ cat, member: m, isNew })
        }
      }
    }
    if (!list.length) return
    const base = list.map((v) => priceOf(v.cat, part, day, ueRules))
    let fees = base.slice()
    let discounts = list.map(() => 0)
    const prevYm = addMonths(date.slice(0, 7), -1)
    if (entranceTarget !== null) {
      // 10月：実績の入場料合計に合わせて調整（女性以外の料金を按分）
      const fixedIdx = list.map((v, i) => (v.cat === '女性' ? i : -1)).filter((i) => i >= 0)
      const flexIdx = list.map((v, i) => (v.cat !== '女性' ? i : -1)).filter((i) => i >= 0)
      const idx = flexIdx.length ? flexIdx : fixedIdx
      const fixedSum = flexIdx.length ? fixedIdx.reduce((a, i) => a + fees[i], 0) : 0
      const target = entranceTarget - fixedSum
      const baseSum = idx.reduce((a, i) => a + base[i], 0) || 1
      let acc = 0
      idx.forEach((i, k) => {
        fees[i] = k === idx.length - 1 ? target - acc : Math.max(0, Math.round((base[i] * target) / baseSum / 100) * 100)
        acc += fees[i]
      })
    } else {
      // 11月以降：料金表どおり＋リピーター割引
      discounts = list.map((v, i) => {
        if (v.cat !== '男性') return 0
        return (monthCount.get(`${v.member.id}|${prevYm}`) ?? 0) >= settings.discountMinVisits ? Math.min(fees[i], settings.discountAmount) : 0
      })
      fees = base.slice()
    }
    const startMin = part === '昼' ? 12 * 60 : 19 * 60
    const span = part === '昼' ? 6 * 60 + 45 : 7 * 60 + 30
    const partVisits: V[] = []
    list.forEach((v, i) => {
      const inMin = startMin + ri(0, Math.floor(span / 5)) * 5
      const checkedInAt = jstAt(date, inMin)
      if (checkedInAt > now) return
      const outAt = jstAt(date, inMin + ri(18, 60) * 5)
      const join = v.isNew && entranceTarget === null ? settings.joinFee : 0
      const row: V = {
        id: crypto.randomUUID(), storeId: HARNES, memberId: v.member.id, partnerMemberId: v.partner?.id ?? null, businessDate: date,
        dayPart: part, dayType: day.type, category: v.cat, isNew: v.isNew, entranceFee: fees[i], discount: discounts[i],
        discountReason: discounts[i] ? `前月${settings.discountMinVisits}回以上来店 リピーター割引` : '', joinFee: join, annualFee: 0,
        entryTotal: fees[i] - discounts[i] + join, extraTotal: 0, status: outAt > now ? 'in' : 'out', checkedInAt,
        checkedOutAt: outAt > now ? null : outAt, staffId: pick(staffIds), outStaffId: outAt > now ? null : pick(staffIds),
      }
      partVisits.push(row)
      for (const id of [v.member.id, v.partner?.id]) if (id) monthCount.set(`${id}|${date.slice(0, 7)}`, (monthCount.get(`${id}|${date.slice(0, 7)}`) ?? 0) + 1)
    })
    // 有料ドリンク：合計額を品目に分けて、その部の来店に割り当て
    let rest = drinks
    while (rest > 0 && partVisits.length) {
      const v = pick(partVisits)
      const menu = drinkMenu.filter((m) => m.price <= rest)
      const m = menu.length ? pick(menu) : { name: '有料ドリンク', price: rest }
      const at = new Date(v.checkedInAt!.getTime() + ri(10, 80) * 60000)
      if (at > now) {
        rest -= m.price
        continue
      }
      items.push({ storeId: HARNES, visitId: v.id, kind: 'drink', name: m.name, unitPrice: m.price, qty: 1, amount: m.price, businessDate: date, dayPart: part, staffId: pick(staffIds), createdAt: at })
      if (v.status === 'out') v.extraTotal = (v.extraTotal ?? 0) + m.price
      rest -= m.price
    }
    visits.push(...partVisits)
    lastPart = partVisits
  }

  // 10月：Excel の実績（日報）から作成
  const expenseRows: (typeof t.expenses.$inferInsert)[] = []
  for (const r of october) {
    const usedToday = new Set<string>()
    makePart(r.date, '昼', { 男性: r.maleDay, 女性: r.femaleDay, カップル: r.cpDay }, r.drinkDay, r.salesDay - r.drinkDay, usedToday)
    makePart(r.date, '夜', { 男性: r.maleNight, 女性: r.femaleNight, カップル: r.cpNight }, r.drinkNight, r.salesNight - r.drinkNight, usedToday)
    if (r.expense) expenseRows.push({ storeId: HARNES, businessDate: r.date, kind: 'expense', name: r.memo || '経費', amount: r.expense, staffId: pick(staffIds) })
  }

  // 11月〜本日：10月の曜日別の平均をもとに作成（料金表・割引を適用）
  const avg = new Map<number, number[]>()
  for (const r of october) {
    const w = weekdayOf(r.date)
    const a = avg.get(w) ?? [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ;[r.maleDay, r.femaleDay, r.cpDay, r.maleNight, r.femaleNight, r.cpNight, r.drinkDay, r.drinkNight].forEach((x, i) => (a[i] += x))
    a[8]++
    avg.set(w, a)
  }
  for (let d = '2026-11-01'; d <= todayBiz; d = addDays(d, 1)) {
    const a = avg.get(weekdayOf(d))!
    const v = (i: number) => Math.max(0, Math.round((a[i] / a[8]) * (0.8 + rand() * 0.4)))
    const usedToday = new Set<string>()
    makePart(d, '昼', { 男性: v(0), 女性: v(1), カップル: v(2) }, Math.round(v(6) / 100) * 100, null, usedToday)
    makePart(d, '夜', { 男性: v(3), 女性: v(4), カップル: v(5) }, Math.round(v(7) / 100) * 100, null, usedToday)
    if (d < todayBiz && rand() < 0.7) {
      const [name, amt] = pick(EXPENSE_POOL)
      expenseRows.push({ storeId: HARNES, businessDate: d, kind: 'expense', name, amount: Math.round((amt * (0.6 + rand())) / 100) * 100, staffId: pick(staffIds) })
    }
    if (d < todayBiz && weekdayOf(d) === 6) expenseRows.push({ storeId: HARNES, businessDate: d, kind: 'parttime', name: 'アルバイト代', amount: 12000, staffId: pick(staffIds) })
  }

  await chunked(visits, 300, (rows) => db.insert(t.visits).values(rows))
  await chunked(items, 500, (rows) => db.insert(t.visitItems).values(rows))
  if (expenseRows.length) await chunked(expenseRows, 300, (rows) => db.insert(t.expenses).values(rows))
  await db.insert(t.monthlyAdjustments).values(
    ['龍経費', '46経費', '口座移動'].map((label, i) => ({ storeId: HARNES, month: '2026-10', label, amount: 0, sort: i })),
  )
  await db.insert(t.auditLogs).values({ storeId: HARNES, userId: owner.id, userName: owner.name, action: 'デモデータ作成', target: `会員 ${members.length}名・来店 ${visits.length}件` })
  await seedAttendanceDemo(db)
}

/**
 * 勤怠のデモデータ（ハーネス）：対象者は架空の名前（実際のスタッフ名は本番で画面から登録する）。
 * 2026-10-01 から前日までの出退勤を作る。対象者が登録済みの場合は何もしない（確認用 DB への追加にも使う）
 */
export async function seedAttendanceDemo(db: DB) {
  const [{ n }] = await db.select({ n: count() }).from(t.staffMembers).where(eq(t.staffMembers.storeId, HARNES))
  if (n > 0) return { added: 0 }
  const rand = rng(20261119)
  const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))
  const step = (a: number, b: number) => ri(a / 5, b / 5) * 5
  const employees = ['さくら', 'たける']
  const partTimers = ['あおい', 'いつき', 'うた', 'えま', 'かい', 'きらら', 'そら', 'ななみ', 'ひなた', 'みお', 'れん']
  const base = Date.UTC(2026, 9, 1)
  const staff = [
    ...employees.map((name, i) => ({ id: crypto.randomUUID(), storeId: HARNES, name, kind: '社員' as const, createdAt: new Date(base + i * 1000) })),
    ...partTimers.map((name, i) => ({ id: crypto.randomUUID(), storeId: HARNES, name, kind: 'アルバイト' as const, createdAt: new Date(base + (10 + i) * 1000) })),
  ]
  await db.insert(t.staffMembers).values(staff)
  const [settings] = await db.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, HARNES))
  const today = businessDateOf(new Date(), settings)
  const rows: (typeof t.attendance.$inferInsert)[] = []
  const add = (staffMemberId: string, date: string, from: number, to: number) =>
    rows.push({ storeId: HARNES, staffMemberId, businessDate: date, clockIn: jstAt(date, from), clockOut: jstAt(date, to), updatedAt: jstAt(date, to) })
  const emp = staff.filter((m) => m.kind === '社員')
  const pts = staff.filter((m) => m.kind === 'アルバイト')
  for (let d = '2026-10-01', i = 0; d < today; d = addDays(d, 1), i++) {
    const weekend = [0, 5, 6].includes(weekdayOf(d))
    // 社員：交代で夜の部（週末は2名）
    const onDuty = weekend ? emp : [emp[i % 2]]
    for (const m of onDuty) add(m.id, d, step(17 * 60 + 30, 18 * 60 + 30), step(26 * 60 + 30, 28 * 60))
    // アルバイト：昼の部 1名＋夜の部 1〜2名（週末は 2〜3名）
    const shuffled = [...pts].sort(() => rand() - 0.5)
    add(shuffled[0].id, d, step(12 * 60 + 45, 13 * 60 + 15), step(18 * 60, 19 * 60))
    const night = weekend ? ri(2, 3) : ri(1, 2)
    for (const m of shuffled.slice(1, 1 + night)) add(m.id, d, step(18 * 60 + 45, 19 * 60 + 30), step(25 * 60 + 30, 27 * 60 + 30))
  }
  await chunked(rows, 300, (part) => db.insert(t.attendance).values(part))
  return { added: rows.length }
}
