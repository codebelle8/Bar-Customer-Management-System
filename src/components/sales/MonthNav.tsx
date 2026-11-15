// 月の切り替え（前月・翌月・年月を指定）
import Form from 'next/form'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonCls } from '@/components/ui'
import { addMonths, fmtJaMonth } from '@/lib/format'

export function MonthNav({ month, max, path, extra = {} }: { month: string; max: string; path: string; extra?: Record<string, string> }) {
  const href = (m: string) => `${path}?${new URLSearchParams({ ...extra, month: m })}`
  const next = addMonths(month, 1)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href(addMonths(month, -1))} className={buttonCls('default')} aria-label="前月"><ChevronLeft className="size-4" />前月</Link>
      <span className="min-w-[120px] text-center text-[18px] font-bold tabular-nums">{fmtJaMonth(month)}</span>
      {next <= max ? (
        <Link href={href(next)} className={buttonCls('default')} aria-label="翌月">翌月<ChevronRight className="size-4" /></Link>
      ) : (
        <span className={buttonCls('default')} aria-disabled="true" style={{ opacity: 0.4 }}>翌月<ChevronRight className="size-4" /></span>
      )}
      <Form action={path} className="ml-1 flex items-center gap-2">
        {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="month" name="month" defaultValue={month} max={max} aria-label="年月を指定"
          className="h-10 rounded-lg border border-line bg-white px-2 text-[13px] tabular-nums outline-none focus:border-brand" />
        <button className={buttonCls('soft')}>表示</button>
      </Form>
    </div>
  )
}
