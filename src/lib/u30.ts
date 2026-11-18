// U30割引の判定（画面とサーバーで同じ式を使う。重い依存を持たないのでクライアントからも読み込める）
// 店舗の会員名簿では「特典割引」列が =IF(年齢<=30,"U30","") で、年齢 30 歳以下の会員に付いている
import type { Category, StoreSettings, U30Gender } from '@/db/schema'
import { addDays, ageOn, yen } from './format'

export type U30Rule = Pick<StoreSettings, 'u30Enabled' | 'u30MaxAge' | 'u30Amount' | 'u30Gender' | 'u30Combine'>
export const U30_GENDERS: U30Gender[] = ['男性', '女性', '両方']

const genderOk = (rule: Pick<U30Rule, 'u30Gender'>, gender: '男性' | '女性') => rule.u30Gender === '両方' || rule.u30Gender === gender
const genderLabel = (g: U30Gender) => (g === '両方' ? '男女とも' : `${g}のみ`)

/** U30割引の対象の会員か（年齢は営業日時点。生年月日が未登録なら対象外） */
export function isU30(rule: Omit<U30Rule, 'u30Combine' | 'u30Amount'>, gender: '男性' | '女性', age: number | null): boolean {
  return rule.u30Enabled && age != null && age <= rule.u30MaxAge && genderOk(rule, gender)
}

/** 来店時の U30割引：カップルは対象外（リピーター割引と同じ扱い）。金額は入場料が上限 */
export function u30DiscountFor(p: {
  rule: Omit<U30Rule, 'u30Combine'>
  category: Category
  gender: '男性' | '女性'
  age: number | null
  fee: number
}): { amount: number; reason: string } {
  const { rule, category, gender, age, fee } = p
  if (category === 'カップル' || !isU30(rule, gender, age)) return { amount: 0, reason: '' }
  return { amount: Math.min(fee, rule.u30Amount), reason: `${age}歳（${rule.u30MaxAge}歳以下）U30割引` }
}

/** U30割引の最終日（上限年齢＋1 歳の誕生日の前日。2/29 生まれは平年なら 2/28 まで） */
export function u30LastDay(birthday: string, maxAge: number): string {
  const y = +birthday.slice(0, 4) + maxAge + 1
  const md = birthday.slice(5)
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const next = md === '02-29' && !leap ? `${y}-03-01` : `${y}-${md}`
  return addDays(next, -1)
}

/** 会員の U30 の状態（会員詳細・受付の表示用） */
export function u30Status(rule: Omit<U30Rule, 'u30Combine' | 'u30Amount'>, gender: '男性' | '女性', birthday: string | null, today: string) {
  if (!rule.u30Enabled) return { kind: 'off' as const }
  if (!genderOk(rule, gender)) return { kind: 'gender' as const }
  if (!birthday) return { kind: 'nobirthday' as const }
  const age = ageOn(birthday, today)
  if (age > rule.u30MaxAge) return { kind: 'over' as const, age }
  return { kind: 'eligible' as const, age, until: u30LastDay(birthday, rule.u30MaxAge) }
}

/** ルールの説明文 */
export function u30RuleText(rule: U30Rule) {
  return `${rule.u30MaxAge}歳以下の会員（${genderLabel(rule.u30Gender)}）は、入場料から${yen(rule.u30Amount)}割引（${rule.u30Combine ? 'リピーター割引と併用' : 'リピーター割引とは併用せず、大きい方を適用'}）`
}

export const u30GenderLabel = genderLabel

/** 割引の合計の内訳（例：U30 ¥3,000・リピーター ¥4,000） */
export function discountParts(discount: number, u30Discount: number) {
  return [u30Discount > 0 && `U30 ${yen(u30Discount)}`, discount - u30Discount > 0 && `リピーター ${yen(discount - u30Discount)}`].filter(Boolean).join('・')
}
