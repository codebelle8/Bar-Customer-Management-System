'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Tx } from '@/db/client'
import * as t from '@/db/schema'
import {
  birthdayError, checkImportRow, memberNoNumber, normalizeMemberNo, parseDateLoose, type CheckedRow, type ImportRow,
} from '@/components/members/rules'
import { audit, query, requireCtx, requireOwner, type Ctx } from '@/lib/dal'
import { jstParts } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'
import { PHOTO_ID_DOCS, REFERRALS, SUB_ID_DOCS } from '@/lib/terms'

export type FormState = { ok?: boolean; error?: string; errors?: Record<string, string> } | undefined

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID_DOCS = new Set([...PHOTO_ID_DOCS, ...SUB_ID_DOCS])
const jstToday = () => jstParts(new Date()).date
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '')

const baseSchema = z.object({
  handleName: z.string().trim().min(1, 'ハンドルネームを入力してください').max(40, 'ハンドルネームは40文字以内で入力してください'),
  gender: z.enum(['男性', '女性'], { error: '性別を選択してください' }),
  birthday: z.string().trim(),
  referral: z.string().trim().refine((v) => v === '' || REFERRALS.includes(v), '紹介元を一覧から選択してください'),
  memo: z.string().trim().max(500, 'メモは500文字以内で入力してください'),
  idDocs: z.array(z.string()).max(10).transform((a) => [...new Set(a.filter((d) => ID_DOCS.has(d)))]),
})

function issuesToErrors(issues: z.core.$ZodIssue[]) {
  const errors: Record<string, string> = {}
  for (const i of issues) {
    const k = String(i.path[0] ?? '_')
    errors[k] ??= i.message
  }
  return errors
}

/** 生年月日（必須かどうかを指定）をチェックして YYYY-MM-DD を返す */
function checkBirthday(v: string, required: boolean, errors: Record<string, string>): string | null {
  if (!v) {
    if (required) errors.birthday = '生年月日を入力してください'
    return null
  }
  const d = parseDateLoose(v)
  if (!d) {
    errors.birthday = '生年月日の形式が正しくありません'
    return null
  }
  const e = birthdayError(d, jstToday())
  if (e) errors.birthday = e
  return d
}

/** 番号が自動採番の範囲なら、次の番号を進めて衝突しないようにする（同じトランザクション内） */
async function bumpNextNo(tx: Tx, ctx: Ctx, nos: string[]) {
  const max = Math.max(0, ...nos.map((n) => memberNoNumber(n, ctx.store.memberPrefix) ?? 0))
  if (!max) return
  await tx
    .update(t.storeSettings)
    .set({ nextMemberNo: sql`greatest(${t.storeSettings.nextMemberNo}, ${max + 1}::int)` })
    .where(eq(t.storeSettings.storeId, ctx.storeId))
}

async function findByNo(tx: Tx, ctx: Ctx, memberNo: string) {
  const [m] = await tx
    .select({ id: t.members.id, handleName: t.members.handleName })
    .from(t.members)
    .where(and(eq(t.members.storeId, ctx.storeId), eq(t.members.memberNo, memberNo)))
  return m
}

const isUniqueViolation = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } }
  return x?.code === '23505' || x?.cause?.code === '23505'
}

/* ------------------------------ 手動登録 ------------------------------ */

export async function createMember(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx()
  const today = jstToday()
  const parsed = baseSchema
    .extend({
      memberNo: z.string().trim().min(1, '会員番号を入力してください'),
      joinedAt: z.string().trim(),
      termsVersion: z.string().trim().max(20),
    })
    .safeParse({
      memberNo: str(fd, 'memberNo'), handleName: str(fd, 'handleName'), gender: str(fd, 'gender'), birthday: str(fd, 'birthday'),
      referral: str(fd, 'referral'), memo: str(fd, 'memo'), idDocs: fd.getAll('idDocs').map(String),
      joinedAt: str(fd, 'joinedAt'), termsVersion: str(fd, 'termsVersion'),
    })
  const errors = parsed.success ? {} : issuesToErrors(parsed.error.issues)
  const birthday = checkBirthday(str(fd, 'birthday').trim(), true, errors)
  const joinedAt = parseDateLoose(str(fd, 'joinedAt')) ?? ''
  if (!joinedAt) errors.joinedAt = '入会日を入力してください'
  else if (joinedAt > today) errors.joinedAt = '入会日に未来の日付は指定できません'
  const memberNo = normalizeMemberNo(str(fd, 'memberNo'), ctx.store.memberPrefix)
  if (memberNo.length > 30) errors.memberNo = '会員番号は30文字以内で入力してください'
  if (!parsed.success || Object.keys(errors).length) return { errors, error: '入力内容を確認してください' }
  const v = parsed.data

  let res: { id?: string; dup?: { id: string; handleName: string } }
  try {
    res = await query(async (tx) => {
      const dup = await findByNo(tx, ctx, memberNo)
      if (dup) return { dup }
      const [row] = await tx
        .insert(t.members)
        .values({
          storeId: ctx.storeId, memberNo, handleName: v.handleName, gender: v.gender, birthday, joinedAt, referral: v.referral,
          idDocs: v.idDocs, termsVersion: v.termsVersion,
          termsSignedAt: v.termsVersion ? (joinedAt === today ? new Date() : new Date(`${joinedAt}T12:00:00+09:00`)) : null,
          memo: v.memo, createdBy: ctx.user.id,
        })
        .returning({ id: t.members.id })
      await bumpNextNo(tx, ctx, [memberNo])
      await audit(tx, ctx, '会員登録（手動）', `${memberNo} ${v.handleName}`)
      return { id: row.id }
    }, ctx)
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: { memberNo: `会員番号 ${memberNo} は既に使われています` }, error: '入力内容を確認してください' }
    throw e
  }
  if (res.dup) return { errors: { memberNo: `会員番号 ${memberNo} は既に使われています（${res.dup.handleName}）` }, error: '入力内容を確認してください' }
  revalidatePath('/members')
  redirect(`/members/${res.id}?created=1`)
}

/* ------------------------------ 会員情報の変更 ------------------------------ */

export async function updateMember(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx()
  const id = str(fd, 'id')
  if (!UUID.test(id)) return { error: '会員が見つかりません' }
  const parsed = baseSchema
    .extend({
      feeExpiresAt: z.string().trim(),
      kana: z.string().trim().max(40, 'フリガナは40文字以内で入力してください'),
      realName: z.string().trim().max(40, '本名は40文字以内で入力してください'),
    })
    .safeParse({
      handleName: str(fd, 'handleName'), gender: str(fd, 'gender'), birthday: str(fd, 'birthday'), referral: str(fd, 'referral'),
      memo: str(fd, 'memo'), idDocs: fd.getAll('idDocs').map(String), feeExpiresAt: str(fd, 'feeExpiresAt'),
      kana: str(fd, 'kana').normalize('NFKC'), realName: str(fd, 'realName').normalize('NFKC'),
    })
  const errors = parsed.success ? {} : issuesToErrors(parsed.error.issues)
  const birthday = checkBirthday(str(fd, 'birthday').trim(), false, errors)
  const feeRaw = str(fd, 'feeExpiresAt').trim()
  const feeExpiresAt = feeRaw ? parseDateLoose(feeRaw) : null
  if (feeRaw && !feeExpiresAt) errors.feeExpiresAt = '日付の形式が正しくありません'
  // 会員番号の変更はオーナーのみ
  const noRaw = fd.get('memberNo')
  const wantsNo = noRaw !== null
  if (wantsNo && !ctx.isOwner) return { error: '会員番号の変更はオーナーのみ行えます' }
  const memberNo = wantsNo ? normalizeMemberNo(noRaw, ctx.store.memberPrefix) : ''
  if (wantsNo && !memberNo) errors.memberNo = '会員番号を入力してください'
  if (memberNo.length > 30) errors.memberNo = '会員番号は30文字以内で入力してください'
  if (!parsed.success || Object.keys(errors).length) return { errors, error: '入力内容を確認してください' }
  const v = parsed.data

  try {
    const r = await query(async (tx) => {
      const [m] = await tx.select().from(t.members).where(and(eq(t.members.id, id), eq(t.members.storeId, ctx.storeId)))
      if (!m) return { error: '会員が見つかりません' } as FormState
      const [s] = await tx.select({ fee: t.storeSettings.annualFeeEnabled }).from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
      const next = {
        memberNo: wantsNo ? memberNo : m.memberNo,
        handleName: v.handleName, kana: v.kana, realName: v.realName, gender: v.gender, birthday, referral: v.referral, memo: v.memo, idDocs: v.idDocs,
        feeExpiresAt: s?.fee ? feeExpiresAt : m.feeExpiresAt,
      }
      if (next.memberNo !== m.memberNo) {
        const dup = await findByNo(tx, ctx, next.memberNo)
        if (dup) return { errors: { memberNo: `会員番号 ${next.memberNo} は既に使われています（${dup.handleName}）` }, error: '入力内容を確認してください' } as FormState
      }
      const LABELS: Record<keyof typeof next, string> = {
        memberNo: '会員番号', handleName: 'ハンドルネーム', kana: 'フリガナ', realName: '本名', gender: '性別', birthday: '生年月日', referral: '紹介元', memo: 'メモ', idDocs: '本人確認書類', feeExpiresAt: '年会費期限',
      }
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(m[k]))
      if (!changed.length) return { ok: true } as FormState
      await tx.update(t.members).set({ ...next, updatedAt: new Date() }).where(eq(t.members.id, m.id))
      if (next.memberNo !== m.memberNo) await bumpNextNo(tx, ctx, [next.memberNo])
      const noLabel = next.memberNo !== m.memberNo ? `${m.memberNo}→${next.memberNo}` : m.memberNo
      await audit(tx, ctx, '会員情報変更', `${noLabel} ${v.handleName}（${changed.map((k) => LABELS[k]).join('・')}）`)
      return { ok: true } as FormState
    }, ctx)
    if (r?.ok) {
      revalidatePath('/members')
      revalidatePath(`/members/${id}`)
    }
    return r
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: { memberNo: `会員番号 ${memberNo} は既に使われています` }, error: '入力内容を確認してください' }
    throw e
  }
}

/* ------------------------------ ステータス変更 ------------------------------ */

const OPS = {
  ban: { from: ['active', 'withdrawn'], to: 'banned', label: '出入禁止', owner: false },
  unban: { from: ['banned'], to: 'active', label: '出入禁止解除', owner: true },
  withdraw: { from: ['active'], to: 'withdrawn', label: '退会', owner: true },
  reactivate: { from: ['withdrawn'], to: 'active', label: '退会取消（有効に戻す）', owner: true },
} as const

export async function setMemberStatus(_prev: FormState, fd: FormData): Promise<FormState> {
  const op = str(fd, 'op') as keyof typeof OPS
  const def = OPS[op]
  if (!def) return { error: '不正な操作です' }
  // 出入禁止はスタッフも可。解除・退会・有効に戻すはオーナーのみ
  const ctx = def.owner ? await requireOwner() : await requireCtx()
  const id = str(fd, 'id')
  if (!UUID.test(id)) return { error: '会員が見つかりません' }
  const reason = str(fd, 'reason').trim()
  if (op === 'ban' && !reason) return { errors: { reason: '出入禁止の理由を入力してください' } }
  if (reason.length > 300) return { errors: { reason: '理由は300文字以内で入力してください' } }

  const r = await query(async (tx) => {
    const [m] = await tx.select().from(t.members).where(and(eq(t.members.id, id), eq(t.members.storeId, ctx.storeId)))
    if (!m) return { error: '会員が見つかりません' } as FormState
    if (!(def.from as readonly string[]).includes(m.status)) return { error: 'この会員の現在のステータスでは実行できません' } as FormState
    await tx
      .update(t.members)
      .set({
        status: def.to,
        updatedAt: new Date(),
        ...(op === 'ban' ? { banReason: reason, bannedAt: new Date() } : {}),
        ...(op === 'unban' ? { banReason: '', bannedAt: null } : {}),
      })
      .where(eq(t.members.id, m.id))
    const detail = op === 'ban' ? `：${reason}` : op === 'unban' && m.banReason ? `（理由：${m.banReason}）` : ''
    await audit(tx, ctx, def.label, `${m.memberNo} ${m.handleName}${detail}`)
    return { ok: true } as FormState
  }, ctx)
  if (r?.ok) {
    revalidatePath('/members')
    revalidatePath(`/members/${id}`)
  }
  return r
}

/* ------------------------------ Excel 取込 ------------------------------ */

/** 取込前の確認：すでに登録されている会員番号を返す */
export async function findExistingNumbers(nos: string[]): Promise<string[]> {
  const ctx = await requireCtx()
  const list = z.array(z.string().max(40)).max(30000).parse(nos)
  if (!list.length) return []
  return query(async (tx) => {
    const found: string[] = []
    for (let i = 0; i < list.length; i += 500) {
      const rows = await tx
        .select({ no: t.members.memberNo })
        .from(t.members)
        .where(and(eq(t.members.storeId, ctx.storeId), inArray(t.members.memberNo, list.slice(i, i + 500))))
      found.push(...rows.map((r) => r.no))
    }
    return found
  }, ctx)
}

const importRowSchema = z.object({
  line: z.number().int().min(1),
  memberNo: z.string().max(60),
  handleName: z.string().max(200),
  kana: z.string().max(200),
  realName: z.string().max(200),
  gender: z.string().max(20),
  birthday: z.string().max(40),
  joinedAt: z.string().max(40),
  memo: z.string().max(2000),
  ban: z.string().max(200),
})

export interface ImportResult {
  inserted: number
  skipped: { line: number; memberNo: string; reason: string }[]
}

/** 取込（画面から分割して呼ぶ。サーバー側でも全件チェックし直す） */
export async function importMembers(rowsIn: ImportRow[]): Promise<ImportResult> {
  const ctx = await requireCtx()
  const rows = z.array(importRowSchema).min(1).max(200).parse(rowsIn)
  const today = jstToday()
  const [settings] = await query((tx) => tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId)), ctx)
  const joinDefault = businessDateOf(new Date(), settings)
  const skipped: ImportResult['skipped'] = []
  const seen = new Set<string>()
  const valid: CheckedRow[] = []
  for (const r of rows) {
    const c = checkImportRow(r, ctx.store.memberPrefix, today, joinDefault)
    if (c.errors.length) skipped.push({ line: c.line, memberNo: c.memberNo, reason: c.errors.join('・') })
    else if (seen.has(c.memberNo)) skipped.push({ line: c.line, memberNo: c.memberNo, reason: 'ファイル内で会員番号が重複' })
    else {
      seen.add(c.memberNo)
      valid.push(c)
    }
  }
  if (!valid.length) return { inserted: 0, skipped }
  const inserted = await query(async (tx) => {
    const exists = new Set(
      (
        await tx
          .select({ no: t.members.memberNo })
          .from(t.members)
          .where(and(eq(t.members.storeId, ctx.storeId), inArray(t.members.memberNo, valid.map((v) => v.memberNo))))
      ).map((r) => r.no),
    )
    const toInsert = valid.filter((v) => {
      if (!exists.has(v.memberNo)) return true
      skipped.push({ line: v.line, memberNo: v.memberNo, reason: '既に登録済みの会員番号' })
      return false
    })
    if (!toInsert.length) return 0
    await tx.insert(t.members).values(
      toInsert.map((v) => ({
        storeId: ctx.storeId, memberNo: v.memberNo, handleName: v.handleName, kana: v.kana, realName: v.realName, gender: v.gender!, birthday: v.birthday, joinedAt: v.joinedAt,
        memo: v.memo, termsVersion: '紙', termsSignedAt: new Date(`${v.joinedAt}T12:00:00+09:00`), createdBy: ctx.user.id,
        // 名簿の「特典 割引」欄に出禁の印がある会員は出入禁止で登録する
        ...(v.banned ? { status: 'banned' as const, banReason: '会員名簿で出禁', bannedAt: new Date() } : {}),
      })),
    )
    await bumpNextNo(tx, ctx, toInsert.map((v) => v.memberNo))
    const first = toInsert[0].memberNo
    const last = toInsert[toInsert.length - 1].memberNo
    const bannedN = toInsert.filter((v) => v.banned).length
    await audit(tx, ctx, '会員一括取込', `${toInsert.length}件（${first}${toInsert.length > 1 ? `〜${last}` : ''}）${bannedN ? `・うち出禁${bannedN}件` : ''}`)
    return toInsert.length
  }, ctx)
  if (inserted) revalidatePath('/members')
  skipped.sort((a, b) => a.line - b.line)
  return { inserted, skipped }
}
