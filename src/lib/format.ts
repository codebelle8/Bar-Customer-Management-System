// 日付・金額の表示（日本時間で統一）
export const TZ = 'Asia/Tokyo'
export const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

export const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`
export const num = (n: number) => Math.round(n).toLocaleString('ja-JP')

/** Date を日本時間の各要素に分解 */
export function jstParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, minutes: +p.hour * 60 + +p.minute }
}

const toUTC = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export const addDays = (s: string, n: number) => new Date(toUTC(s) + n * 86400000).toISOString().slice(0, 10)
export const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 86400000)
export const weekdayOf = (s: string) => new Date(toUTC(s)).getUTCDay()
export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}
export const monthDates = (ym: string) => Array.from({ length: daysInMonth(ym) }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)

export const fmtDate = (s: string) => s.replaceAll('-', '/')
export const fmtMD = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`
export const fmtJaDate = (s: string) => `${+s.slice(0, 4)}年${+s.slice(5, 7)}月${+s.slice(8, 10)}日（${WEEK_JA[weekdayOf(s)]}）`
export const fmtJaMonth = (ym: string) => `${+ym.slice(0, 4)}年${+ym.slice(5, 7)}月`
export const fmtTime = (d: Date | null | undefined) => (d ? jstParts(d).time : '—')
export const fmtDateTime = (d: Date) => {
  const p = jstParts(d)
  return `${fmtDate(p.date)} ${p.time}`
}

export const ageOn = (birthday: string, on: string) => {
  let a = +on.slice(0, 4) - +birthday.slice(0, 4)
  if (on.slice(5) < birthday.slice(5)) a--
  return a
}

export const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : 0)
