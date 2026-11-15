import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DayType } from '@/db/schema'
import { addMonths, fmtJaMonth, monthDates, weekdayOf } from '@/lib/format'
import { DAY_TYPE_STYLE, DAY_TYPES, type DayInfo } from '@/lib/pricing'
import { cx } from './ui'

const HEAD = ['月', '火', '水', '木', '金', '土', '日']

/** 料金カレンダー（月曜始まり）。日付の色で料金区分を表示する */
export function PriceCalendar({
  month, days, today, hrefFor, dayHref, compact = false,
}: {
  month: string
  /** month の各日の料金区分（dayInfo の結果） */
  days: DayInfo[]
  today: string
  /** 前月・翌月へのリンク */
  hrefFor?: (ym: string) => string
  /** 日付クリック時のリンク（料金設定画面で個別設定に使う） */
  dayHref?: (date: string) => string
  compact?: boolean
}) {
  const dates = monthDates(month)
  const lead = (weekdayOf(dates[0]) + 6) % 7
  const cells: (string | null)[] = [...Array(lead).fill(null), ...dates]
  while (cells.length % 7) cells.push(null)
  const info = new Map(days.map((d) => [d.date, d]))
  return (
    <div>
      {hrefFor && (
        <div className="mb-2 flex items-center justify-center gap-6">
          <Link href={hrefFor(addMonths(month, -1))} className="rounded-full p-1 text-sub hover:bg-page" aria-label="前の月"><ChevronLeft className="size-5" /></Link>
          <span className="min-w-28 text-center text-[15px] font-medium">{fmtJaMonth(month)}</span>
          <Link href={hrefFor(addMonths(month, 1))} className="rounded-full p-1 text-sub hover:bg-page" aria-label="次の月"><ChevronRight className="size-5" /></Link>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-7 border-b border-line bg-[#f6f3fb] text-center text-[12px] font-medium">
          {HEAD.map((h, i) => (
            <div key={h} className={cx('py-1.5', i === 5 && 'bg-[#e6eeff] text-info', i === 6 && 'text-up')}>{h}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className={cx('border-line', i % 7 !== 6 && 'border-r', i < cells.length - 7 && 'border-b', compact ? 'h-9' : 'h-16')} />
            const di = info.get(d)
            const type: DayType = di?.type ?? '平日'
            const isToday = d === today
            const label = di?.label && (di.override || type === '祝日') ? di.label : ''
            const body = (
              <>
                <span className={cx('leading-none font-medium tabular-nums', type === '祝日' || weekdayOf(d) === 0 ? 'text-up' : '')}>{+d.slice(8)}</span>
                {compact ? (
                  isToday ? <span className="text-[9px] leading-none text-brand">本日</span>
                    : type === 'イベント' ? <span className="text-[9px] leading-none">イベント</span>
                    : type === '祝日' && <span className="text-[9px] leading-none text-up">祝日</span>
                ) : (
                  <span className="mt-0.5 line-clamp-2 px-0.5 text-[10px] leading-tight text-sub">{isToday ? '本日' : label}</span>
                )}
              </>
            )
            const cls = cx(
              'relative flex flex-col items-center justify-center gap-0.5 border-line text-[13px]',
              i % 7 !== 6 && 'border-r', i < cells.length - 7 && 'border-b',
              compact ? 'h-9' : 'h-16',
              type !== '平日' && DAY_TYPE_STYLE[type].cell,
              isToday && 'ring-2 ring-brand ring-inset',
              dayHref && 'hover:brightness-95',
            )
            const title = `${d} ${DAY_TYPE_STYLE[type].label}${di?.label ? `（${di.label}）` : ''}${di?.customPrices ? '・個別料金あり' : ''}`
            return dayHref ? (
              <Link key={d} href={dayHref(d)} className={cls} title={title}>{body}{di?.customPrices && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-brand" />}</Link>
            ) : (
              <div key={d} className={cls} title={title}>{body}</div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function CalendarLegend({ className }: { className?: string }) {
  return (
    <ul className={cx('space-y-2 text-[12px]', className)}>
      {DAY_TYPES.map((t) => (
        <li key={t} className="flex items-center gap-2">
          <span className={cx('size-3.5 rounded-sm border border-black/5', t === '平日' ? 'bg-[#e4dcf5]' : DAY_TYPE_STYLE[t].cell)} />
          {DAY_TYPE_STYLE[t].label}
        </li>
      ))}
    </ul>
  )
}
