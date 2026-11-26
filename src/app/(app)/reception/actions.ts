'use server'
// 来店受付の操作（新規入会・来店受付・ドリンク注文・退店精算・取消）。金額はすべてサーバーで再計算する
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Tx } from '@/db/client'
import * as t from '@/db/schema'
import { audit, query, requireCtx } from '@/lib/dal'
import { ageOn, yen } from '@/lib/format'
import { dayInfo, discountFor, extensionFor } from '@/lib/pricing'
import { PHOTO_ID_DOCS, REFERRALS, SUB_ID_DOCS } from '@/lib/terms'
import { addYear, buildQuote } from './_lib/quote'
import {
  assertCanEnter, discountCounts, isNewToday, loadToday, memberCards, memberLabel, nextFreeMemberNo, normalizeQuery, PART_LABEL,
  searchMembers, UserError, UUID_RE,
} from './_lib/server'
import type { ActionState, MemberCard } from './_lib/types'

type State = ActionState | undefined

const uuid = z.string().regex(UUID_RE, 'IDが正しくありません。')
const money = z.number().int().min(0).max(10_000_000)

function fail(e: unknown): ActionState {
  if (e instanceof UserError) return { error: e.message }
  console.error('[reception]', e)
  return { error: '処理中にエラーが発生しました。画面を再読み込みしてもう一度お試しください。' }
}

/** フォームの payload（JSON）を検証して取り出す */
function parsePayload<T>(schema: z.ZodType<T>, fd: FormData): T {
  let raw: unknown
  try {
    raw = JSON.parse(String(fd.get('payload') ?? ''))
  } catch {
    throw new UserError('入力内容を読み取れませんでした。')
  }
  const r = schema.safeParse(raw)
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? '入力内容に誤りがあります。')
  return r.data
}

function revalidateAll() {
  revalidatePath('/reception', 'layout')
  revalidatePath('/dashboard')
}

/* ------------------------------ 検索（パートナー選択・ハンドルネームの重複確認） ------------------------------ */

export async function searchMembersAction(q: string, exclude: string[] = []): Promise<{ results: MemberCard[]; error?: string }> {
  const ctx = await requireCtx()
  try {
    if (typeof q !== 'string' || !normalizeQuery(q)) return { results: [] }
    const ex = new Set(Array.isArray(exclude) ? exclude.filter((x) => typeof x === 'string') : [])
    return await query(async (tx) => {
      const today = await loadToday(tx, ctx.storeId)
      const ms = (await searchMembers(tx, ctx.storeId, q, 20)).filter((m) => !ex.has(m.id))
      return { results: await memberCards(tx, ctx.storeId, today.businessDate, today.settings, ms) }
    }, ctx)
  } catch (e) {
    return { results: [], error: fail(e).error }
  }
}

export async function checkHandleAction(name: string): Promise<{ matches: { memberNo: string; handle: string; gender: string; status: string }[] }> {
  const ctx = await requireCtx()
  const h = typeof name === 'string' ? name.trim().slice(0, 40) : ''
  if (!h) return { matches: [] }
  try {
    const rows = await query(
      (tx) =>
        tx
          .select({ memberNo: t.members.memberNo, handle: t.members.handleName, gender: t.members.gender, status: t.members.status })
          .from(t.members)
          .where(and(eq(t.members.storeId, ctx.storeId), sql`lower(${t.members.handleName}) = lower(${h})`))
          .limit(5),
      ctx,
    )
    return { matches: rows }
  } catch {
    return { matches: [] }
  }
}

/* ------------------------------ 新規入会・来店受付 ------------------------------ */

const RegisterSchema = z.object({
  termsSigned: z.literal(true, { error: '会員規約の内容確認にチェックしてください。' }),
  photoId: z.string().refine((v) => PHOTO_ID_DOCS.includes(v), '顔写真付きの身分証を選んでください。'),
  subId: z.string().refine((v) => SUB_ID_DOCS.includes(v), '2点目の確認書類を選んでください。'),
  copied: z.literal(true, { error: '本人確認書類のコピーを確認してください。' }),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '生年月日を入力してください。'),
  handle: z.string().trim().min(1, 'ハンドルネームを入力してください。').max(40, 'ハンドルネームは40文字以内にしてください。'),
  gender: z.enum(['男性', '女性'], { error: '性別を選んでください。' }),
  referral: z.string().refine((v) => v === '' || REFERRALS.includes(v), '来店のきっかけが正しくありません。'),
  memo: z.string().max(500, 'メモは500文字以内にしてください。'),
  category: z.enum(['男性', '女性', 'カップル']),
  partnerId: uuid.nullable(),
  registerOnly: z.boolean(),
  paid: money.nullable(),
})

const validDate = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`)
  return !Number.isNaN(x.getTime()) && x.toISOString().slice(0, 10) === d
}

export async function registerMemberAction(_prev: State, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  let dest: string
  try {
    const input = parsePayload(RegisterSchema, fd)
    dest = await query(async (tx) => {
      const now = new Date()
      // 会員番号の払い出し：設定行をロックして同時登録でも重複しないようにする
      const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId)).for('update')
      if (!s) throw new UserError('店舗の設定が見つかりません。')
      const today = await loadToday(tx, ctx.storeId, now)
      if (!validDate(input.birthday)) throw new UserError('生年月日が正しくありません。')
      const age = ageOn(input.birthday, today.businessDate)
      if (age < 20) throw new UserError(`20歳未満（${age}歳）のため入会できません。`)
      if (age > 110) throw new UserError('生年月日が正しくありません。')

      const no = await nextFreeMemberNo(tx, ctx.storeId, ctx.store.memberPrefix, s.nextMemberNo)
      const memberNo = `${ctx.store.memberPrefix}${no}`

      let partner: t.Member | null = null
      let partnerNew = false
      let quote: ReturnType<typeof buildQuote> | null = null
      if (!input.registerOnly) {
        if (input.category === 'カップル') {
          if (!input.partnerId) throw new UserError('カップルの場合はパートナーの会員を選んでください。')
          partner = await assertCanEnter(tx, ctx.storeId, input.partnerId, 'パートナー')
          partnerNew = await isNewToday(tx, ctx.storeId, partner, today.businessDate)
        }
        const partnerAnnual = partnerNew && s.annualFeeEnabled && (!partner?.feeExpiresAt || partner.feeExpiresAt < today.businessDate)
        quote = buildQuote({
          category: input.category,
          partLabel: PART_LABEL[today.part],
          base: today.prices[input.category],
          joinFee: s.joinFee * (partnerNew ? 2 : 1),
          annualFee: s.annualFeeEnabled ? s.annualFee * (partnerAnnual ? 2 : 1) : 0,
        })
        if (input.paid != null && input.paid < quote.total) throw new UserError(`預かり金が不足しています（合計 ${yen(quote.total)}）。`)
        if (partnerAnnual && partner) await tx.update(t.members).set({ feeExpiresAt: addYear(today.businessDate), updatedAt: now }).where(eq(t.members.id, partner.id))
      }

      const [m] = await tx
        .insert(t.members)
        .values({
          storeId: ctx.storeId, memberNo, handleName: input.handle, gender: input.gender, birthday: input.birthday,
          joinedAt: today.businessDate, referral: input.referral, idDocs: [input.photoId, input.subId],
          termsVersion: s.termsVersion, termsSignedAt: now, status: 'active', memo: input.memo.trim(),
          feeExpiresAt: quote && s.annualFeeEnabled ? addYear(today.businessDate) : null, createdBy: ctx.user.id,
        })
        .returning({ id: t.members.id })
      await tx.update(t.storeSettings).set({ nextMemberNo: no + 1 }).where(eq(t.storeSettings.storeId, ctx.storeId))

      if (quote) {
        await tx.insert(t.visits).values({
          storeId: ctx.storeId, memberId: m.id, partnerMemberId: partner?.id ?? null, businessDate: today.businessDate,
          dayPart: today.part, dayType: today.day.type, category: input.category, isNew: true,
          entranceFee: quote.fee, discount: 0, discountReason: '', joinFee: quote.joinFee, annualFee: quote.annualFee,
          entryTotal: quote.total, status: 'in', checkedInAt: now, staffId: ctx.user.id,
          note: partnerNew && partner ? `パートナー ${partner.memberNo} も本日入会（入会金を合算）` : '',
        })
        await audit(tx, ctx, '新規入会・来店受付',
          `${memberLabel(memberNo, input.handle, partner?.memberNo, partner?.handleName)} ${input.category} ${yen(quote.total)}`)
      } else {
        await audit(tx, ctx, '新規入会（登録のみ）', `${memberNo} ${input.handle}`)
      }
      return `/reception/new?done=${m.id}${quote && input.paid != null ? `&paid=${input.paid}` : ''}`
    }, ctx)
  } catch (e) {
    return fail(e)
  }
  revalidateAll()
  redirect(dest)
}

/* ------------------------------ 既存会員の来店受付 ------------------------------ */

const CheckinSchema = z.object({
  memberId: uuid,
  category: z.enum(['男性', '女性', 'カップル']),
  partnerId: uuid.nullable(),
  annualFor: z.array(uuid).max(2),
  joinFor: z.array(uuid).max(2),
  override: z.object({ fee: money, reason: z.string().trim().min(1, '料金調整の理由を入力してください。').max(200) }).nullable(),
  paid: money.nullable(),
})

export async function checkinAction(_prev: State, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  let dest: string
  try {
    const input = parsePayload(CheckinSchema, fd)
    if (input.override && !ctx.isOwner) throw new UserError('料金の変更はオーナーのみ行えます。')
    dest = await query(async (tx) => {
      const now = new Date()
      const today = await loadToday(tx, ctx.storeId, now)
      const s = today.settings
      const main = await assertCanEnter(tx, ctx.storeId, input.memberId, '会員')
      let partner: t.Member | null = null
      if (input.category === 'カップル') {
        if (!input.partnerId) throw new UserError('カップルの場合はパートナーの会員を選んでください。')
        if (input.partnerId === main.id) throw new UserError('パートナーに本人は選べません。')
        partner = await assertCanEnter(tx, ctx.storeId, input.partnerId, 'パートナー')
      }
      const people = [main, partner].filter((x): x is t.Member => !!x)
      // 年会費：有効で期限切れ・未設定の会員のみ
      const annualPeople = people.filter(
        (p) => input.annualFor.includes(p.id) && s.annualFeeEnabled && (!p.feeExpiresAt || p.feeExpiresAt < today.businessDate),
      )
      // 入会金：本日登録・来店歴なし（登録のみで登録済み）の会員のみ
      const joinPeople: t.Member[] = []
      for (const p of people) if (input.joinFor.includes(p.id) && (await isNewToday(tx, ctx.storeId, p, today.businessDate))) joinPeople.push(p)

      const base = today.prices[input.category]
      const fee = input.override?.fee ?? base
      const counts = await discountCounts(tx, ctx.storeId, main.id, today.businessDate)
      const d = discountFor({ settings: s, category: input.category, gender: main.gender, ...counts, fee })
      const quote = buildQuote({
        category: input.category, partLabel: PART_LABEL[today.part], base, override: input.override?.fee ?? null,
        discount: { eligible: d.amount > 0, cap: s.discountAmount, reason: d.reason },
        joinFee: s.joinFee * joinPeople.length, annualFee: s.annualFee * annualPeople.length,
      })
      if (input.paid != null && input.paid < quote.total) throw new UserError(`預かり金が不足しています（合計 ${yen(quote.total)}）。`)

      const adjust = input.override ? `料金調整：入場料 ${yen(base)}→${yen(fee)}（${input.override.reason}）` : ''
      const [v] = await tx
        .insert(t.visits)
        .values({
          storeId: ctx.storeId, memberId: main.id, partnerMemberId: partner?.id ?? null, businessDate: today.businessDate,
          dayPart: today.part, dayType: today.day.type, category: input.category, isNew: joinPeople.length > 0,
          entranceFee: quote.fee, discount: quote.discount, discountReason: quote.discountReason,
          joinFee: quote.joinFee, annualFee: quote.annualFee, entryTotal: quote.total, status: 'in', checkedInAt: now,
          staffId: ctx.user.id, note: adjust,
        })
        .returning({ id: t.visits.id })
      for (const p of annualPeople) {
        const from = p.feeExpiresAt && p.feeExpiresAt > today.businessDate ? p.feeExpiresAt : today.businessDate
        await tx.update(t.members).set({ feeExpiresAt: addYear(from), updatedAt: now }).where(eq(t.members.id, p.id))
      }
      const label = memberLabel(main.memberNo, main.handleName, partner?.memberNo, partner?.handleName)
      await audit(tx, ctx, '来店受付', `${label} ${input.category} ${yen(quote.total)}${quote.discount ? `（割引 −${yen(quote.discount)}）` : ''}`)
      if (input.override) await audit(tx, ctx, '料金調整（来店受付）', `${label} ${adjust}`)
      return `/reception/checkin?done=${v.id}${input.paid != null ? `&paid=${input.paid}` : ''}`
    }, ctx)
  } catch (e) {
    return fail(e)
  }
  revalidateAll()
  redirect(dest)
}

/* ------------------------------ ドリンク注文 ------------------------------ */

const ItemsSchema = z
  .array(z.object({ menuItemId: uuid, qty: z.number().int().min(1, '数量が正しくありません。').max(99, '数量が多すぎます。') }))
  .max(30)

/** 来店を行ロックして取得（入店中のみ操作可） */
async function lockVisit(tx: Tx, storeId: string, visitId: string) {
  const [v] = await tx.select().from(t.visits).where(and(eq(t.visits.id, visitId), eq(t.visits.storeId, storeId))).for('update')
  if (!v) throw new UserError('来店記録が見つかりません。')
  const [m] = await tx.select({ memberNo: t.members.memberNo, handle: t.members.handleName }).from(t.members).where(eq(t.members.id, v.memberId))
  return { v, label: `${m?.memberNo ?? ''} ${m?.handle ?? ''}`.trim() }
}

async function menuLines(
  tx: Tx, storeId: string, items: z.infer<typeof ItemsSchema>, kinds: ('drink' | 'extension' | 'other')[],
) {
  if (!items.length) return []
  const menu = await tx
    .select()
    .from(t.menuItems)
    .where(and(eq(t.menuItems.storeId, storeId), eq(t.menuItems.active, true), inArray(t.menuItems.id, items.map((i) => i.menuItemId))))
  return items.map((i) => {
    const m = menu.find((x) => x.id === i.menuItemId)
    if (!m || !kinds.includes(m.kind)) throw new UserError('メニューが見つかりません（販売停止の可能性があります）。画面を再読み込みしてください。')
    return { kind: m.kind, name: m.name, unitPrice: m.price, qty: i.qty, amount: m.price * i.qty }
  })
}

export async function addItemsAction(_prev: State, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  try {
    const input = parsePayload(z.object({ visitId: uuid, items: ItemsSchema.min(1, '商品を選んでください。') }), fd)
    const msg = await query(async (tx) => {
      const today = await loadToday(tx, ctx.storeId)
      const { v, label } = await lockVisit(tx, ctx.storeId, input.visitId)
      if (v.status !== 'in') throw new UserError('この来店はすでに精算済み・取消のため、注文を追加できません。')
      const lines = await menuLines(tx, ctx.storeId, input.items, ['drink', 'other'])
      await tx.insert(t.visitItems).values(
        lines.map((l) => ({ ...l, storeId: ctx.storeId, visitId: v.id, businessDate: v.businessDate, dayPart: today.part, staffId: ctx.user.id })),
      )
      const sum = lines.reduce((a, l) => a + l.amount, 0)
      await audit(tx, ctx, 'ドリンク注文', `${label}：${lines.map((l) => `${l.name}×${l.qty}`).join('、')}（${yen(sum)}）`)
      return `${lines.reduce((a, l) => a + l.qty, 0)}点（${yen(sum)}）の注文を登録しました`
    }, ctx)
    revalidateAll()
    return { ok: true, message: msg }
  } catch (e) {
    return fail(e)
  }
}

export async function removeItemAction(itemId: string): Promise<ActionState> {
  const ctx = await requireCtx()
  try {
    if (!UUID_RE.test(String(itemId))) throw new UserError('IDが正しくありません。')
    await query(async (tx) => {
      const [it] = await tx.select().from(t.visitItems).where(and(eq(t.visitItems.id, itemId), eq(t.visitItems.storeId, ctx.storeId)))
      if (!it) throw new UserError('注文が見つかりません（すでに削除された可能性があります）。')
      const { v, label } = await lockVisit(tx, ctx.storeId, it.visitId)
      if (v.status !== 'in') throw new UserError('精算済み・取消の来店の注文は削除できません。')
      await tx.delete(t.visitItems).where(eq(t.visitItems.id, it.id))
      await audit(tx, ctx, 'ドリンク注文の削除', `${label}：${it.name}×${it.qty}（${yen(it.amount)}）`)
    }, ctx)
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------ 退店・追加精算 ------------------------------ */

const CheckoutSchema = z.object({
  visitId: uuid,
  items: ItemsSchema,
  others: z
    .array(z.object({ name: z.string().trim().min(1, 'その他の項目名を入力してください。').max(40), amount: z.number().int().min(1, 'その他の金額を入力してください。').max(1_000_000) }))
    .max(10),
  paid: money.nullable(),
  /** 画面に表示した延長料金（確定時の計算と違う場合は確認し直してもらう） */
  extensionAmount: money.optional(),
})

export async function checkoutAction(_prev: State, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  let dest: string
  try {
    const input = parsePayload(CheckoutSchema, fd)
    if (input.others.length && !ctx.isOwner) throw new UserError('「その他」の金額入力はオーナーのみ行えます。')
    dest = await query(async (tx) => {
      const now = new Date()
      const today = await loadToday(tx, ctx.storeId, now)
      const { v, label } = await lockVisit(tx, ctx.storeId, input.visitId)
      if (v.status !== 'in')
        throw new UserError(
          v.status === 'void' ? 'この来店は取消されています。'
            : v.autoCheckout ? `この来店は、営業日の区切り（${today.settings.dayCutoff}）を過ぎたため自動で退店になっています。`
              : 'この来店はすでに精算済みです。',
        )
      // 延長料金（自動計算）。画面を開いたあとに時刻の区切りをまたいだ場合は、金額を確認し直してもらう
      const ext = extensionFor({
        settings: today.settings, dayPart: v.dayPart, businessDate: v.businessDate, day: dayInfo(v.businessDate, today.settings, today.overrides),
        category: v.category, rules: today.rules, at: now,
      })
      if (input.extensionAmount != null && input.extensionAmount !== (ext?.amount ?? 0)) throw new ExtensionChanged(ext?.amount ?? 0)
      const lines = [
        ...(ext ? [{ kind: 'extension' as const, name: ext.name, unitPrice: ext.unitPrice, qty: ext.qty, amount: ext.amount }] : []),
        ...(await menuLines(tx, ctx.storeId, input.items, ['drink', 'other'])),
        ...input.others.map((o) => ({ kind: 'other' as const, name: o.name, unitPrice: o.amount, qty: 1, amount: o.amount })),
      ]
      if (lines.length)
        await tx.insert(t.visitItems).values(
          lines.map((l) => ({ ...l, storeId: ctx.storeId, visitId: v.id, businessDate: v.businessDate, dayPart: today.part, staffId: ctx.user.id })),
        )
      const [{ sum }] = await tx
        .select({ sum: sql<number>`coalesce(sum(${t.visitItems.amount}), 0)`.mapWith(Number) })
        .from(t.visitItems)
        .where(eq(t.visitItems.visitId, v.id))
      if (input.paid != null && input.paid < sum) throw new UserError(`預かり金が不足しています（お会計 ${yen(sum)}）。`)
      await tx.update(t.visits).set({ status: 'out', checkedOutAt: now, outStaffId: ctx.user.id, extraTotal: sum }).where(eq(t.visits.id, v.id))
      await audit(tx, ctx, '退店・精算', `${label} 追加精算 ${yen(sum)}${lines.length ? `（${lines.map((l) => `${l.name}×${l.qty}`).join('、')}）` : ''}`)
      return `/reception/checkout?done=${v.id}${input.paid != null ? `&paid=${input.paid}` : ''}`
    }, ctx)
  } catch (e) {
    // 最新の延長料金で画面を表示し直す（入力中の内容はそのまま）
    if (e instanceof ExtensionChanged) revalidatePath('/reception/checkout')
    return fail(e)
  }
  revalidateAll()
  redirect(dest)
}

class ExtensionChanged extends UserError {
  constructor(amount: number) {
    super(`時刻が変わったため、延長料金が ${yen(amount)} になりました。金額を確認して、もう一度確定してください。`)
  }
}

/* ------------------------------ 取消（誤って登録した来店） ------------------------------ */

export async function voidVisitAction(_prev: State, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx()
  let dest: string
  try {
    const input = parsePayload(z.object({ visitId: uuid, reason: z.string().trim().min(1, '取消の理由を入力してください。').max(200) }), fd)
    dest = await query(async (tx) => {
      const now = new Date()
      const today = await loadToday(tx, ctx.storeId, now)
      const { v, label } = await lockVisit(tx, ctx.storeId, input.visitId)
      if (v.status === 'void') throw new UserError('この来店はすでに取消されています。')
      if (!ctx.isOwner && v.businessDate !== today.businessDate) throw new UserError('スタッフは本日の営業日の来店のみ取消できます。オーナーに依頼してください。')
      const line = `【取消】${input.reason}（${ctx.user.name}）`
      await tx.update(t.visits).set({ status: 'void', note: v.note ? `${v.note}\n${line}` : line }).where(eq(t.visits.id, v.id))
      await audit(tx, ctx, '来店取消', `${label} ${v.businessDate} ${yen(v.entryTotal)}：${input.reason}`)
      return `/reception?voided=${encodeURIComponent(label)}`
    }, ctx)
  } catch (e) {
    return fail(e)
  }
  revalidateAll()
  redirect(dest)
}
