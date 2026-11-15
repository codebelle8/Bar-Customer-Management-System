'use client'
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cx } from '@/components/ui'

/** 大きなチェック項目（必須の確認事項に使う） */
export function CheckTile({ checked, onChange, children, sub, required, testId }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; sub?: ReactNode; required?: boolean; testId?: string }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} data-testid={testId} onClick={() => onChange(!checked)}
      className={cx(
        'flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-4 text-left transition',
        checked ? 'border-ok bg-[#effaf3]' : 'border-line bg-white hover:border-brand/40',
      )}
    >
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg border-2 transition', checked ? 'border-ok bg-ok text-white' : 'border-[#cfc6e2] bg-white text-transparent')}>
        <Check className="size-5" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold">
          {children}
          {required && <span className="ml-1 text-up">*</span>}
        </span>
        {sub && <span className="mt-0.5 block text-[12px] text-sub">{sub}</span>}
      </span>
    </button>
  )
}

/** 選択肢のボタン（ラジオボタンの代わり） */
export function Choice({ selected, onClick, children, className, tone = 'brand' }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string; tone?: 'brand' | 'male' | 'female' }) {
  const on = tone === 'male' ? 'border-info bg-[#e6f0ff] text-info' : tone === 'female' ? 'border-[#c8457e] bg-[#fdeaf2] text-[#c8457e]' : 'border-brand bg-brand-soft text-brand'
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className={cx('min-h-14 rounded-xl border-2 px-3 py-2 text-[15px] font-bold transition', selected ? on : 'border-line bg-white text-ink hover:border-brand/40', className)}>
      {children}
    </button>
  )
}
