// 日報（Excel の「年.月総括」シートの日別表と同じ列）
import Link from 'next/link'
import type { DailyRow } from '@/lib/stats'
import { cx } from '@/components/ui'
import { fmtMD, num, WEEK_JA, weekdayOf } from '@/lib/format'
import { holidayName } from '@/lib/pricing'

type NumKey = { [K in keyof DailyRow]: DailyRow[K] extends number ? K : never }[keyof DailyRow]
type Col =
  | { key: NumKey; label: string; group?: string; strong?: boolean; sep?: boolean; count?: boolean }
  | { key: 'memo' | 'taxNames'; label: string; text: true; sep?: boolean; group?: undefined; width: number }

export const DAILY_COLS: Col[] = [
  { key: 'drinkDay', label: '午前ドリンク', sep: true },
  { key: 'drinkNight', label: '午後ドリンク' },
  { key: 'drinkTotal', label: 'ドリンク合計' },
  { key: 'entrance', label: '入場料' },
  { key: 'salesDay', label: '昼売上', sep: true },
  { key: 'salesNight', label: '夜売上' },
  { key: 'total', label: '総売上', strong: true },
  { key: 'expense', label: '経費', sep: true },
  { key: 'memo', label: '備考', text: true, width: 180 },
  { key: 'tax', label: '税金金額', sep: true },
  { key: 'taxNames', label: '税金名称', text: true, width: 110 },
  { key: 'parttime', label: 'バイト', sep: true },
  { key: 'newMembers', label: '新規獲得', count: true },
  { key: 'maleDay', label: '昼部', group: '男性来店', sep: true, count: true },
  { key: 'maleNight', label: '夜部', group: '男性来店', count: true },
  { key: 'male', label: '合計', group: '男性来店', count: true, strong: true },
  { key: 'femaleDay', label: '昼部', group: '女性来店', sep: true, count: true },
  { key: 'femaleNight', label: '夜部', group: '女性来店', count: true },
  { key: 'female', label: '合計', group: '女性来店', count: true, strong: true },
  { key: 'cpDay', label: '昼部', group: 'CP来店', sep: true, count: true },
  { key: 'cpNight', label: '夜部', group: 'CP来店', count: true },
  { key: 'cp', label: '合計', group: 'CP来店', count: true, strong: true },
  { key: 'people', label: '計人数', sep: true, count: true, strong: true },
]

const GROUP_TONE: Record<string, string> = { 男性来店: 'text-info', 女性来店: 'text-[#c8457e]', CP来店: 'text-brand' }

/** 曜日の色：土＝青、日・祝日＝赤（Excel と同じ） */
export function weekdayTone(date: string) {
  const w = weekdayOf(date)
  const hol = holidayName(date)
  if (w === 0 || hol) return { cls: 'bg-[#fde7eb] text-[#d6455d]', hol }
  if (w === 6) return { cls: 'bg-[#e6f0ff] text-[#2f6fdc]', hol }
  return { cls: '', hol }
}

const STICKY_DATE = 'sticky left-0 w-[64px] min-w-[64px]'
const STICKY_WEEK = 'sticky left-[64px] w-[46px] min-w-[46px] border-r border-line'

export function DailyTable({ rows, total, hrefFor, selected }: { rows: DailyRow[]; total: DailyRow; hrefFor: (date: string) => string; selected?: string | null }) {
  // 見出し 1 段目：グループ（男性来店など）は横に結合、それ以外は縦に結合
  const head1: { label: string; span: number; group?: string; sep?: boolean }[] = []
  for (const c of DAILY_COLS) {
    const last = head1[head1.length - 1]
    if (c.group && last?.group === c.group) last.span++
    else head1.push({ label: c.group ?? c.label, span: 1, group: c.group, sep: c.sep })
  }
  const th = 'bg-[#f6f2fc] px-2.5 text-[12px] font-medium whitespace-nowrap text-sub border-b border-line'
  const renderNum = (v: number, c: Col, bold = false) => (
    <span className={cx(v === 0 && !bold && 'text-mute', ('strong' in c && c.strong) || bold ? 'font-bold' : '')}>{num(v)}</span>
  )
  return (
    <div className="scrollbar-thin max-h-[calc(100vh-250px)] min-h-[420px] overflow-auto rounded-b-[14px]">
      <table className="w-max min-w-full border-separate border-spacing-0 text-[13px] tabular-nums">
        <thead className="sticky top-0 z-20">
          <tr className="h-9">
            <th rowSpan={2} className={cx(th, STICKY_DATE, 'z-30 text-left')}>日付</th>
            <th rowSpan={2} className={cx(th, STICKY_WEEK, 'z-30 text-center')}>曜日</th>
            {head1.map((h, i) =>
              h.group ? (
                <th key={i} colSpan={h.span} className={cx(th, 'border-l border-line text-center font-bold', GROUP_TONE[h.group])}>{h.label}</th>
              ) : (
                <th key={i} rowSpan={2} className={cx(th, h.label === '備考' || h.label === '税金名称' ? 'text-left' : 'text-right', h.sep && 'border-l border-line')}>{h.label}</th>
              ),
            )}
          </tr>
          <tr className="h-8">
            {DAILY_COLS.filter((c) => c.group).map((c) => (
              <th key={c.key} className={cx(th, 'text-right text-[11px]', c.sep && 'border-l border-line')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const wk = weekdayTone(r.date)
            const sel = selected === r.date
            const bg = sel ? 'bg-brand-soft' : 'bg-white group-hover:bg-[#faf8fd]'
            const empty = r.visits === 0 && r.total === 0 && r.expense + r.tax + r.parttime === 0
            return (
              <tr key={r.date} className={cx('group', empty && 'text-mute')}>
                <td className={cx(STICKY_DATE, bg, 'z-10 border-b border-line px-0 py-0')}>
                  <Link href={hrefFor(r.date)} scroll={false} className="block px-2.5 py-2 font-bold text-brand hover:underline" title="日別の詳細・経費入力">
                    {fmtMD(r.date)}
                  </Link>
                </td>
                <td className={cx(STICKY_WEEK, bg, 'z-10 border-b px-1 py-1 text-center')}>
                  <span title={wk.hol ?? undefined} className={cx('inline-flex h-6 min-w-8 items-center justify-center rounded-md px-1 text-[12px] font-bold', wk.cls || 'text-sub', sel && !wk.cls && 'bg-white')}>
                    {WEEK_JA[weekdayOf(r.date)]}{wk.hol && <span className="text-[9px]">祝</span>}
                  </span>
                </td>
                {DAILY_COLS.map((c) => (
                  <td key={c.key} className={cx(sel ? 'bg-brand-soft' : 'group-hover:bg-[#faf8fd]', 'border-b border-line px-2.5 py-2 whitespace-nowrap', c.sep && 'border-l', 'text' in c ? 'text-left text-[12px]' : 'text-right')}>
                    {'text' in c ? (
                      <span className="block truncate" style={{ maxWidth: c.width, minWidth: c.width - 40 }} title={r[c.key] || undefined}>{r[c.key]}</span>
                    ) : renderNum(r[c.key], c)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        <tfoot className="sticky bottom-0 z-20">
          <tr className="font-bold">
            <td colSpan={2} className={cx('sticky left-0 z-30 border-t-2 border-r border-brand/40 border-r-line bg-[#efe7fb] px-2.5 py-2.5 text-brand')}>合計</td>
            {DAILY_COLS.map((c) => (
              <td key={c.key} className={cx('border-t-2 border-brand/40 bg-[#f4effc] px-2.5 py-2.5 whitespace-nowrap', c.sep && 'border-l border-l-line', 'text' in c ? 'text-left' : 'text-right')}>
                {'text' in c ? '' : renderNum(total[c.key], c, true)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
