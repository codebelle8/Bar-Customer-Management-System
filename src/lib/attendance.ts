// 勤怠の共通処理（画面・サーバー・Excel 出力で共通。画面側からも使うため重い依存は持たない）
import type { StaffKind } from '@/db/schema'
import { jstParts } from './format'

export const STAFF_KINDS: StaffKind[] = ['社員', 'アルバイト']

const collator = new Intl.Collator('ja')

/** 表示順：社員（登録順）→ アルバイト（名前順） */
export function sortStaff<T extends { kind: StaffKind; name: string; createdAt: Date }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      STAFF_KINDS.indexOf(a.kind) - STAFF_KINDS.indexOf(b.kind) ||
      (a.kind === 'アルバイト' ? collator.compare(a.name, b.name) : a.createdAt.getTime() - b.createdAt.getTime()),
  )
}

/** 勤務時間（分）＝退勤−出勤。休憩は差し引かない。退勤前は null */
export const workMinutes = (clockIn: Date, clockOut: Date | null) =>
  clockOut ? Math.max(0, Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000)) : null

/** 分 → 「7:05」 */
export const fmtHm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`

/** 分 → 時間（小数2桁。給与計算用） */
export const toHours = (min: number) => Math.round((min / 60) * 100) / 100

/** 時刻の表示（営業日の翌日にかかる場合は「翌」を付ける） */
export function fmtClock(d: Date | null, businessDate: string) {
  if (!d) return '—'
  const p = jstParts(d)
  return p.date > businessDate ? `翌${p.time}` : p.time
}

/** datetime-local の値（日本時間）→ Date。不正な値は null */
export function parseJstLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5]))
  return Number.isNaN(d.getTime()) || toJstLocal(d) !== s ? null : d
}

/** Date → datetime-local の値（日本時間） */
export function toJstLocal(d: Date) {
  const p = jstParts(d)
  return `${p.date}T${p.time}`
}
