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
  /** 割引の合計（U30割引＋リピーター割引） */
  discount: number
  /** 割引のうち U30割引 */
  u30Discount: number
  /** 割引のうちリピーター割引 */
  repeatDiscount: number
  discountReason: string
  joinFee: number
  annualFee: number
  total: number
  lines: QuoteLine[]
}

/** 割引の候補（eligible：対象か、cap：割引額の上限、reason：理由） */
export interface DiscountOffer {
  eligible: boolean
  cap: number
  reason: string
}

export function buildQuote(p: {
  category: Category
  partLabel: string
  base: number
  /** オーナーによる入場料の調整（null なら調整なし） */
  override?: number | null
  /** リピーター割引 */
  discount?: DiscountOffer
  /** U30割引 */
  u30?: DiscountOffer
  /** U30割引とリピーター割引を併用するか（しない場合は金額の大きい方。同額なら U30） */
  combine?: boolean
  joinFee?: number
  joinNote?: string
  annualFee?: number
  annualNote?: string
}): Quote {
  const fee = p.override ?? p.base
  const repeatOffer = p.discount?.eligible ? Math.min(fee, p.discount.cap) : 0
  const u30Offer = p.u30?.eligible ? Math.min(fee, p.u30.cap) : 0
  let u30Discount = 0
  let repeatDiscount = 0
  if (p.combine) {
    u30Discount = u30Offer
    repeatDiscount = Math.min(repeatOffer, fee - u30Offer)
  } else if (u30Offer > 0 && u30Offer >= repeatOffer) u30Discount = u30Offer
  else repeatDiscount = repeatOffer
  const discount = u30Discount + repeatDiscount
  // 併用しない設定で両方の対象だった場合は、適用しなかった方を注記する
  const both = !p.combine && u30Offer > 0 && repeatOffer > 0
  const joinFee = p.joinFee ?? 0
  const annualFee = p.annualFee ?? 0
  const lines: QuoteLine[] = [
    {
      label: `入場料（${p.category}・${p.partLabel}）`,
      amount: fee,
      note: p.override != null && p.override !== p.base ? `通常 ¥${p.base.toLocaleString('ja-JP')} から調整` : undefined,
    },
  ]
  if (u30Discount) lines.push({ label: 'U30割引', amount: -u30Discount, note: [p.u30?.reason, both && 'リピーター割引とは併用なし（大きい方を適用）'].filter(Boolean).join('・') })
  if (repeatDiscount) lines.push({ label: 'リピーター割引', amount: -repeatDiscount, note: [p.discount?.reason, both && 'U30割引とは併用なし（大きい方を適用）'].filter(Boolean).join('・') })
  if (joinFee) lines.push({ label: '入会金', amount: joinFee, note: p.joinNote })
  if (annualFee) lines.push({ label: '年会費', amount: annualFee, note: p.annualNote })
  return {
    base: p.base, fee, discount, u30Discount, repeatDiscount,
    discountReason: [u30Discount ? p.u30?.reason : '', repeatDiscount ? p.discount?.reason : ''].filter(Boolean).join('／'), joinFee, annualFee,
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
