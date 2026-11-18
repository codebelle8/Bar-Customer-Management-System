// 来店受付の小さな表示部品（サーバー・クライアントどちらからも使える）
import type { ReactNode } from 'react'
import { Ban, CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { cx } from '@/components/ui'

const TONE = {
  error: { box: 'border-[#f2c2cb] bg-[#fff4f6] text-up', icon: CircleAlert },
  warn: { box: 'border-[#f3dfa6] bg-[#fffaeb] text-[#9a6412]', icon: TriangleAlert },
  ok: { box: 'border-[#bfe6cf] bg-[#effaf3] text-ok', icon: CircleCheck },
  info: { box: 'border-line bg-brand-soft/60 text-brand', icon: Info },
} as const

export function Notice({ tone = 'info', children, className }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  const { box, icon: Icon } = TONE[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[14px] leading-relaxed', box, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** 出入禁止などで受付できない会員の大きな赤い表示 */
export function BlockBanner({ kind, reason, compact }: { kind: 'banned' | 'withdrawn' | 'in'; reason?: string; compact?: boolean }) {
  if (kind === 'in')
    return (
      <div className={cx('flex items-center gap-2 rounded-xl border border-[#f3dfa6] bg-[#fffaeb] font-bold text-[#9a6412]', compact ? 'px-3 py-2 text-[13px]' : 'px-4 py-3 text-[15px]')}>
        <TriangleAlert className="size-5 shrink-0" />すでに入店中です（二重受付はできません）
      </div>
    )
  return (
    <div className={cx('rounded-xl bg-up text-white shadow-[0_6px_16px_rgba(214,69,93,0.3)]', compact ? 'px-3 py-2' : 'px-5 py-4')}>
      <p className={cx('flex items-center gap-2 font-bold', compact ? 'text-[14px]' : 'text-[20px]')}>
        <Ban className={compact ? 'size-5' : 'size-7'} />
        {kind === 'banned' ? '出入禁止 — 受付できません' : '退会済み — 受付できません'}
      </p>
      {kind === 'banned' && <p className={cx('mt-1 font-medium', compact ? 'text-[12px]' : 'text-[15px]')}>理由：{reason || '（未記入）'}</p>}
    </div>
  )
}

/** 金額の明細行 */
export function MoneyRow({ label, amount, note, strong }: { label: ReactNode; amount: number; note?: ReactNode; strong?: boolean }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 py-2', strong && 'font-bold')}>
      <div className="min-w-0">
        <div className="text-[15px]">{label}</div>
        {note && <div className="text-[12px] text-sub">{note}</div>}
      </div>
      <div className={cx('shrink-0 text-[17px] tabular-nums', amount < 0 && 'text-up')}>
        {amount < 0 ? '−' : ''}¥{Math.abs(amount).toLocaleString('ja-JP')}
      </div>
    </div>
  )
}

export function GenderBadge({ gender }: { gender: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold', gender === '男性' ? 'bg-[#e6f0ff] text-info' : gender === '女性' ? 'bg-[#fdeaf2] text-[#c8457e]' : 'bg-brand-soft text-brand')}>
      {gender}
    </span>
  )
}

/** 来店記録の割引の行（U30割引・リピーター割引に分けて表示。discount は割引の合計） */
export function DiscountRows({ discount, u30Discount, reason }: { discount: number; u30Discount: number; reason: string }) {
  const repeat = discount - u30Discount
  const reasons = reason.split('／')
  const u30Reason = reasons.find((r) => r.includes('U30'))
  const repeatReason = reasons.filter((r) => !r.includes('U30')).join('／')
  return (
    <>
      {u30Discount > 0 && <MoneyRow label="U30割引" amount={-u30Discount} note={u30Reason || undefined} />}
      {repeat > 0 && <MoneyRow label="リピーター割引" amount={-repeat} note={repeatReason || undefined} />}
    </>
  )
}

export { U30Badge } from '@/components/members/U30Badge'
