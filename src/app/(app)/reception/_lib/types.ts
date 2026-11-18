// 来店受付で画面（クライアント）に渡すデータの型（すべてシリアライズ可能な値のみ）
import type { Category, DayPart, DayType } from '@/db/schema'

export type Gender = '男性' | '女性'

/** 会員検索の結果カード */
export interface MemberCard {
  id: string
  memberNo: string
  handle: string
  gender: Gender
  age: number | null
  /** U30割引の対象（年齢・性別がルールに合う。カップルでの来店は対象外） */
  u30: boolean
  joinedAt: string
  /** 今月の来店回数（営業日基準・同伴を含む） */
  thisMonth: number
  /** 先月の来店回数 */
  lastMonth: number
  lastVisit: string | null
  memo: string
  status: 'active' | 'banned' | 'withdrawn'
  banReason: string
  inStore: boolean
  feeExpiresAt: string | null
  /** 年会費の徴収が必要（年会費が有効で期限切れ・未設定） */
  feeDue: boolean
  /** 受付できない理由（null なら受付可） */
  block: 'banned' | 'withdrawn' | 'in' | null
  /** 本日登録・来店歴なし（「登録のみ」で登録した新規会員） */
  newToday: boolean
}

/** 入店中一覧の行 */
export interface InStoreRow {
  id: string
  time: string
  businessDate: string
  /** 前営業日以前からの入店（退店処理の漏れ） */
  stale: boolean
  minutes: number
  category: Category
  isNew: boolean
  entryTotal: number
  memberNo: string
  handle: string
  gender: Gender
  partnerNo: string | null
  partnerHandle: string | null
  unpaid: number
  itemCount: number
}

export interface TodayView {
  businessDate: string
  part: DayPart
  dayType: DayType
  dayLabel: string
  prices: Record<Category, number>
}

export interface ActionState {
  error?: string
  ok?: boolean
  message?: string
}
