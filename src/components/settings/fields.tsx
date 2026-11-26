// 設定系フォームの入力部品（サーバーコンポーネントからも使える）
import type { InputHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import { cx, inputCls } from '@/components/ui'

/** number 入力の増減ボタンを隠す（金額は直接入力） */
export const NO_SPIN = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

/** 金額入力（¥ 付き・右寄せ） */
export function YenInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cx('relative', className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-mute">¥</span>
      <input type="number" inputMode="numeric" min={0} step={100} {...p} className={cx(inputCls, NO_SPIN, 'pl-7 text-right tabular-nums')} />
    </div>
  )
}

/** オン・オフのスイッチ（checkbox） */
export function Switch({ name, defaultChecked, label, disabled, value = '1', ariaLabel }: { name: string; defaultChecked?: boolean; label?: ReactNode; disabled?: boolean; value?: string; ariaLabel?: string }) {
  return (
    <label className={cx('inline-flex items-center gap-2.5 select-none', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} disabled={disabled} aria-label={ariaLabel} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-[#d9d3e6] transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/30 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
      {label && <span className="text-[14px] whitespace-nowrap">{label}</span>}
    </label>
  )
}

/** 注意書き（黄色） */
export function NoteBox({ children, tone = 'amber', className }: { children: ReactNode; tone?: 'amber' | 'info' | 'red'; className?: string }) {
  return (
    <div
      className={cx(
        'rounded-lg border px-4 py-2.5 text-[13px] leading-relaxed',
        tone === 'amber' && 'border-[#f3dc9b] bg-[#fff9e8] text-[#8a5a00]',
        tone === 'info' && 'border-[#cfe0fb] bg-[#f3f7ff] text-[#2b5cb8]',
        tone === 'red' && 'border-[#f2c2cb] bg-[#fff4f6] text-up',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** ページ上部のタブ（?tab=） */
export function Tabs({ items, current, hrefFor }: { items: readonly { key: string; label: string }[]; current: string; hrefFor: (key: string) => string }) {
  return (
    <nav className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line">
      {items.map((x) => (
        <Link key={x.key} href={hrefFor(x.key)}
          className={cx('-mb-px shrink-0 border-b-[3px] px-3 py-2.5 text-[14px] font-medium whitespace-nowrap transition sm:px-5 sm:py-3 sm:text-[15px]', current === x.key ? 'border-brand text-brand' : 'border-transparent text-sub hover:text-ink')}>
          {x.label}
        </Link>
      ))}
    </nav>
  )
}
