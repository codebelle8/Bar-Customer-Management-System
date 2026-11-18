import { cx } from '@/components/ui'

/** U30割引の対象の会員に付ける印（会員名簿の「特典割引」列の「U30」に相当） */
export function U30Badge({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-full bg-[#e3f6ea] px-2 py-0.5 text-[11px] font-bold text-ok', className)} title="U30割引の対象">
      U30
    </span>
  )
}
