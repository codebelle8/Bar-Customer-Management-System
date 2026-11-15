// 料金の判定：営業日・昼夜・曜日区分（平日／週末／祝日／イベント）・割引
import holidayJp from '@holiday-jp/holiday_jp'
import type { CalendarDay, Category, CustomPrices, DayPart, DayType, PriceRule, StoreSettings } from '@/db/schema'
import { addDays, jstParts, weekdayOf } from './format'

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
