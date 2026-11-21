// 料金の判定：営業日・昼夜・曜日区分（平日／週末／祝日／イベント）・割引
import holidayJp from '@holiday-jp/holiday_jp'
import type { CalendarDay, Category, CustomPrices, DayPart, DayType, PriceRule, StoreSettings } from '@/db/schema'
import { addDays, jstParts, WEEK_JA, weekdayOf, yen } from './format'

export const CATEGORIES: Category[] = ['男性', '女性', 'カップル']
export const DAY_TYPES: DayType[] = ['平日', '週末', '祝日', 'イベント']
export const DAY_PARTS: DayPart[] = ['昼', '夜']

const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5)

type TimeSettings = Pick<StoreSettings, 'dayStart' | 'nightStart' | 'dayCutoff'>

/** 営業日：区切り時刻（例 6:00）より前は前日の営業日として扱う */
export function businessDateOf(at: Date, s: TimeSettings): string {
  const p = jstParts(at)
  return p.minutes < toMin(s.dayCutoff) ? addDays(p.date, -1) : p.date
}

/** 昼の部／夜の部：昼の部の開始〜夜の部の開始までが「昼」、それ以外（深夜を含む）は「夜」 */
export function dayPartOf(at: Date, s: TimeSettings): DayPart {
  const m = jstParts(at).minutes
  return m >= toMin(s.dayStart) && m < toMin(s.nightStart) ? '昼' : '夜'
}

export function holidayName(date: string): string | null {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  if (!holidayJp.isHoliday(day)) return null
  const hit = holidayJp.between(day, day)[0]
  return hit?.name ?? '祝日'
}

export interface DayInfo {
  date: string
  type: DayType
  label: string
  /** 個別設定（カレンダー）によるものか */
  override: boolean
  customPrices: CustomPrices | null
}

/** 日付の料金区分：個別設定 ＞ 祝日 ＞ 週末の曜日 ＞ 平日 */
export function dayInfo(date: string, settings: Pick<StoreSettings, 'weekendDays'>, overrides: Map<string, CalendarDay>): DayInfo {
  const o = overrides.get(date)
  if (o) return { date, type: o.dayType, label: o.label, override: true, customPrices: o.customPrices ?? null }
  const h = holidayName(date)
  if (h) return { date, type: '祝日', label: h, override: false, customPrices: null }
  if (settings.weekendDays.includes(weekdayOf(date))) return { date, type: '週末', label: '', override: false, customPrices: null }
  return { date, type: '平日', label: '', override: false, customPrices: null }
}

export function priceOf(category: Category, part: DayPart, day: DayInfo, rules: PriceRule[]): number {
  const custom = day.customPrices?.[part]?.[category]
  if (typeof custom === 'number') return custom
  const r = rules.find((x) => x.dayType === day.type && x.dayPart === part && x.category === category)
  return r?.price ?? 0
}

/** 日本時間の日付＋分（24時以降は翌日）を Date に */
const jstAt = (date: string, minutes: number) => new Date(Date.parse(`${date}T00:00:00+09:00`) + minutes * 60000)

/** 営業日の終わり＝翌日の区切り時刻（例：11/20 の営業日 → 11/21 6:00） */
export function businessDayEnd(businessDate: string, s: Pick<StoreSettings, 'dayCutoff'>): Date {
  return jstAt(addDays(businessDate, 1), toMin(s.dayCutoff))
}

export interface ExtensionCharge {
  name: string
  unitPrice: number
  qty: number
  amount: number
  /** 計算の内容（画面に表示） */
  note: string
}

type ExtensionSettings = Pick<StoreSettings, 'nightStart' | 'extensionDays' | 'extensionUnitPrice' | 'extensionCap'>

/** 延長料金のルールの説明（画面に表示） */
export function extensionRuleText(s: ExtensionSettings): string {
  const days = [...s.extensionDays].sort().map((d) => WEEK_JA[d]).join('・')
  const cap = s.extensionCap > 0 ? `・上限${yen(s.extensionCap)}` : ''
  return days
    ? `${days}は${s.nightStart}以降1時間ごとに${yen(s.extensionUnitPrice)}${cap}。それ以外の曜日と祝日は夜の部の料金`
    : `${s.nightStart}を過ぎた場合は夜の部の料金`
}

/**
 * 延長料金：昼の部のお客様が、夜の部の開始時刻（例 19:00）を過ぎて残った場合
 * ・対象の曜日（例 月〜木）：夜の部の開始から時計の区切りで1時間ごと（19:02 の退店でも1時間分）。上限あり
 * ・それ以外の曜日と祝日：夜の部の料金
 * 夜の部のお客様には延長料金はかからない
 */
export function extensionFor(p: {
  settings: ExtensionSettings
  dayPart: DayPart
  businessDate: string
  day: DayInfo
  category: Category
  rules: PriceRule[]
  at: Date
}): ExtensionCharge | null {
  const s = p.settings
  if (p.dayPart !== '昼') return null
  const over = Math.floor((p.at.getTime() - jstAt(p.businessDate, toMin(s.nightStart)).getTime()) / 60000)
  if (over <= 0) return null
  const wd = weekdayOf(p.businessDate)
  if (s.extensionDays.includes(wd) && p.day.type !== '祝日' && p.day.type !== '週末') {
    if (s.extensionUnitPrice <= 0) return null
    const hours = Math.ceil(over / 60)
    const full = hours * s.extensionUnitPrice
    if (s.extensionCap > 0 && full >= s.extensionCap)
      return { name: `延長料金（${s.nightStart}以降・上限）`, unitPrice: s.extensionCap, qty: 1, amount: s.extensionCap, note: `${s.nightStart}以降 ${hours}時間（上限 ${yen(s.extensionCap)}）` }
    return { name: `延長料金（${s.nightStart}以降）`, unitPrice: s.extensionUnitPrice, qty: hours, amount: full, note: `${s.nightStart}以降 ${hours}時間 × ${yen(s.extensionUnitPrice)}` }
  }
  const fee = priceOf(p.category, '夜', p.day, p.rules)
  if (fee <= 0) return null
  const dayLabel = p.day.type === '祝日' ? '祝日' : `${WEEK_JA[wd]}曜日`
  return { name: '夜の部の料金（延長）', unitPrice: fee, qty: 1, amount: fee, note: `${dayLabel}は時間ごとの延長料金の対象外のため、夜の部の料金（${p.category}）` }
}

/** リピーター割引：前月の来店回数が規定回数以上の対象性別の会員は、当月の入場料から割引 */
export function discountFor(params: {
  settings: Pick<StoreSettings, 'discountEnabled' | 'discountMinVisits' | 'discountAmount' | 'discountGender' | 'discountScope'>
  category: Category
  gender: '男性' | '女性'
  prevMonthVisits: number
  usedThisMonth: number
  fee: number
}): { amount: number; reason: string } {
  const { settings: s, category, gender, prevMonthVisits, usedThisMonth, fee } = params
  if (!s.discountEnabled) return { amount: 0, reason: '' }
  if (category === 'カップル' || gender !== s.discountGender) return { amount: 0, reason: '' }
  if (prevMonthVisits < s.discountMinVisits) return { amount: 0, reason: '' }
  if (s.discountScope === 'once' && usedThisMonth > 0) return { amount: 0, reason: '' }
  return { amount: Math.min(fee, s.discountAmount), reason: `前月${prevMonthVisits}回来店（${s.discountMinVisits}回以上）リピーター割引` }
}

export const DAY_TYPE_STYLE: Record<DayType, { cell: string; dot: string; label: string }> = {
  平日: { cell: 'bg-[#efeaf9]', dot: 'bg-[#c9b8ef]', label: '通常料金（平日）' },
  週末: { cell: 'bg-[#fde3ec]', dot: 'bg-[#f6b6cb]', label: '週末料金' },
  祝日: { cell: 'bg-[#f9cfd6]', dot: 'bg-[#e98d9c]', label: '祝日料金' },
  イベント: { cell: 'bg-[#fff2bf]', dot: 'bg-[#f1d264]', label: 'イベント料金' },
}
