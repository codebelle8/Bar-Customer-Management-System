'use client'
import { Minus, Plus } from 'lucide-react'
import { cx } from '@/components/ui'

/** 数量の増減（タブレットで押しやすい大きさ。スマートフォンでは置いた枠の幅いっぱいに伸び縮みする） */
export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string }) {
  return (
    <div className="flex w-full items-center rounded-xl border border-line bg-white sm:inline-flex sm:w-auto" aria-label={label}>
      <button type="button" aria-label="減らす" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}
        className="grid h-11 min-w-0 flex-1 place-items-center rounded-l-xl text-ink hover:bg-page disabled:opacity-30 sm:size-12 sm:flex-none">
        <Minus className="size-5" />
      </button>
      <span className={cx('w-8 shrink-0 text-center text-[20px] font-bold tabular-nums sm:w-10', value ? 'text-brand' : 'text-mute')}>{value}</span>
      <button type="button" aria-label="増やす" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}
        className="grid h-11 min-w-0 flex-1 place-items-center rounded-r-xl text-ink hover:bg-page disabled:opacity-30 sm:size-12 sm:flex-none">
        <Plus className="size-5" />
      </button>
    </div>
  )
}
