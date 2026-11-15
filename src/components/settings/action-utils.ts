// サーバーアクション用の小さな共通処理（入力チェックのエラー文・日付の検証）
import 'server-only'
import type { z } from 'zod'

/** zod のエラーを画面表示用の1行にまとめる */
export function zodMessage(err: z.ZodError): string {
  const first = err.issues[0]
  return first?.message || '入力内容を確認してください'
}

/** FormData の文字列値（未入力は空文字） */
export const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()

/** 金額の文字列（空・カンマ入り）を数値に。空なら null */
export function money(raw: string): number | null {
  const s = raw.replace(/[,，¥￥\s]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
export const isHm = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

/** Postgres の一意制約違反か */
export function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur === 'object' && cur && 'code' in cur && (cur as { code?: string }).code === '23505') return true
    cur = typeof cur === 'object' && cur && 'cause' in cur ? (cur as { cause?: unknown }).cause : undefined
  }
  return false
}
