'use client'
// お会計：合計・預かり金・おつり（現金のみ）。紙幣ボタンで入力を最小限に
import { cx } from '@/components/ui'
import { parseYen } from '../_lib/quote'

const BILLS = [1000, 5000, 10000]

export function CashBox({ total, paid, onPaid, label = 'お会計' }: { total: number; paid: string; onPaid: (v: string) => void; label?: string }) {
  const p = parseYen(paid)
  const change = p == null ? null : p - total
  return (
    <div className="rounded-2xl border border-line bg-[#fbfaff] p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <span className="text-[15px] font-bold text-sub">{label}</span>
        <span className="text-[40px] leading-none font-bold tracking-tight tabular-nums text-ink" data-testid="cash-total">¥{total.toLocaleString('ja-JP')}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-sub">預かり金</span>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[20px] font-bold text-mute">¥</span>
            <input
              name="paid-display" inputMode="numeric" autoComplete="off" value={paid} placeholder="0"
              onChange={(e) => onPaid(e.target.value.normalize('NFKC').replace(/[^\d]/g, '').slice(0, 8))}
              className="h-14 w-full rounded-xl border border-line bg-white pr-4 pl-10 text-right text-[26px] font-bold tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </div>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onPaid(String(total))} className="h-14 rounded-xl border border-brand/50 bg-white px-4 text-[14px] font-bold text-brand hover:bg-brand-soft">ちょうど</button>
          {BILLS.map((b) => (
            <button key={b} type="button" onClick={() => onPaid(String((p ?? 0) + b))} className="h-14 rounded-xl border border-line bg-white px-3 text-[14px] font-bold hover:bg-page">
              +{b.toLocaleString('ja-JP')}
            </button>
          ))}
          <button type="button" onClick={() => onPaid('')} className="h-14 rounded-xl px-3 text-[13px] text-sub hover:bg-page">クリア</button>
        </div>
      </div>
      <div className={cx('mt-4 flex items-end justify-between gap-3 rounded-xl px-4 py-3', change == null ? 'bg-white' : change >= 0 ? 'bg-[#effaf3]' : 'bg-[#fff4f6]')}>
        <span className={cx('text-[15px] font-bold', change == null ? 'text-mute' : change >= 0 ? 'text-ok' : 'text-up')}>{change != null && change < 0 ? '不足' : 'おつり'}</span>
        <span className={cx('text-[34px] leading-none font-bold tabular-nums', change == null ? 'text-mute' : change >= 0 ? 'text-ok' : 'text-up')} data-testid="cash-change">
          {change == null ? '—' : `¥${Math.abs(change).toLocaleString('ja-JP')}`}
        </span>
      </div>
    </div>
  )
}

/** 預かり金が足りているか（未入力はそのまま確定できる） */
export const paidOk = (paid: string, total: number) => {
  const p = parseYen(paid)
  return p == null || p >= total
}
