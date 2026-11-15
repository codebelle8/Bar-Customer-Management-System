// 入店時の会計の計算（画面表示とサーバーの再計算で同じ式を使う）
import type { Category } from '@/db/schema'

export interface QuoteLine {
  label: string
  amount: number
  note?: string
}

export interface Quote {
  /** 料金表の入場料 */
  base: number
  /** 調整後の入場料（調整なしなら base） */
  fee: number
  discount: number
  discountReason: string
  joinFee: number
  annualFee: number
  total: number
  lines: QuoteLine[]
}

export function buildQuote(p: {
  category: Category
  partLabel: string
  base: number
  /** オーナーによる入場料の調整（null なら調整なし） */
  override?: number | null
  discount?: { eligible: boolean; cap: number; reason: string }
  joinFee?: number
  joinNote?: string
  annualFee?: number
  annualNote?: string
}): Quote {
  const fee = p.override ?? p.base
  const discount = p.discount?.eligible ? Math.min(fee, p.discount.cap) : 0
  const joinFee = p.joinFee ?? 0
  const annualFee = p.annualFee ?? 0
  const lines: QuoteLine[] = [
    {
      label: `入場料（${p.category}・${p.partLabel}）`,
      amount: fee,
      note: p.override != null && p.override !== p.base ? `通常 ¥${p.base.toLocaleString('ja-JP')} から調整` : undefined,
    },
  ]
  if (discount) lines.push({ label: 'リピーター割引', amount: -discount, note: p.discount?.reason })
  if (joinFee) lines.push({ label: '入会金', amount: joinFee, note: p.joinNote })
  if (annualFee) lines.push({ label: '年会費', amount: annualFee, note: p.annualNote })
  return {
    base: p.base, fee, discount, discountReason: discount ? (p.discount?.reason ?? '') : '', joinFee, annualFee,
    total: fee - discount + joinFee + annualFee, lines,
  }
}

/** 1年後の日付（2/29 は 2/28 に丸める） */
export function addYear(date: string): string {
  const y = +date.slice(0, 4) + 1
  const md = date.slice(5)
  if (md === '02-29') return `${y}-02-28`
  return `${y}-${md}`
}

/** 数字の入力（全角も可）を整数に。空・不正は null */
export function parseYen(s: string): number | null {
  const v = s.normalize('NFKC').replace(/[,\s¥円]/g, '')
  if (!/^\d{1,8}$/.test(v)) return null
  return +v
}

/** 経過時間の表示 */
export const elapsed = (min: number) => (min < 60 ? `${min}分` : `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}`)
