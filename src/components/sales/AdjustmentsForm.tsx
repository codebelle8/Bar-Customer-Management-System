'use client'

import { useActionState, useState } from 'react'
import { Loader2, Plus, Save, X } from 'lucide-react'
import { saveAdjustments, type AdjState } from '@/app/(app)/reports/actions'
import { Button, cx } from '@/components/ui'
import { ACCOUNT_MOVE, AMOUNT_MAX, adjustmentTotals, normalizeAmount } from './constants'

interface Item {
  key: string
  id: string | null
  label: string
  amount: string
  fixed: boolean
}

type Src = { id: string | null; label: string; amount: number; fixed: boolean }
const toItems = (rows: Src[]): Item[] => rows.map((r, i) => ({ key: r.id ?? `std-${i}`, id: r.id, label: r.label, amount: String(r.amount), fixed: r.fixed }))

const fmt = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`
const toNum = (s: string) => {
  const n = Number(normalizeAmount(s))
  return Number.isFinite(n) ? n : 0
}

/** 総括の調整グリッド（Excel：龍経費｜46経費｜経費合計／口座移動｜差引現金残｜差引現金合計） */
export function AdjustmentsForm({ month, cashLeft, rows }: { month: string; cashLeft: number; rows: Src[] }) {
  const [base, setBase] = useState(rows)
  const [items, setItems] = useState<Item[]>(() => toItems(rows))
  const [state, action, pending] = useActionState<AdjState, FormData>(saveAdjustments, { seq: 0 })
  // 保存後・月の切り替え後はサーバーの値に合わせる
  if (base !== rows) {
    setBase(rows)
    setItems(toItems(rows))
  }
  const initial = toItems(rows)

  const isMove = (x: Item) => x.fixed && x.label === ACCOUNT_MOVE
  const expenseItems = items.filter((x) => !isMove(x))
  const move = items.find(isMove)
  const totals = adjustmentTotals(cashLeft, items.map((x) => ({ label: x.label, amount: toNum(x.amount) })))
  const dirty = JSON.stringify(items.map((x) => [x.id, x.label, toNum(x.amount)])) !== JSON.stringify(initial.map((x) => [x.id, x.label, toNum(x.amount)]))
  const update = (key: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const add = () =>
    setItems((xs) => {
      const i = xs.findIndex(isMove)
      const row: Item = { key: `new-${Date.now()}`, id: null, label: '', amount: '0', fixed: false }
      return i < 0 ? [...xs, row] : [...xs.slice(0, i), row, ...xs.slice(i)]
    })

  // 送信順：経費の項目 → 口座移動
  const ordered = [...expenseItems, ...(move ? [move] : [])]
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="month" value={month} />
      {ordered.map((x) => (
        <span key={`h-${x.key}`} hidden>
          <input type="hidden" name="id" value={x.id ?? ''} />
          <input type="hidden" name="label" value={x.label} />
          <input type="hidden" name="amount" value={normalizeAmount(x.amount)} />
        </span>
      ))}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[12px] font-bold text-sub">経費（差引現金残から差し引く）</p>
          <button type="button" onClick={add} className="inline-flex h-9 items-center gap-1 rounded-lg border border-dashed border-brand/50 px-3 text-[12px] font-bold text-brand transition hover:bg-brand-soft">
            <Plus className="size-4" />項目を追加
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {expenseItems.map((x) => (
            <AmountCell key={x.key} item={x} onChange={(p) => update(x.key, p)} onRemove={x.fixed ? undefined : () => setItems((xs) => xs.filter((y) => y.key !== x.key))} />
          ))}
          <Result label="経費合計" value={totals.expenseSum} note={`${expenseItems.map((x) => x.label || '（未入力）').join('＋')}`} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[12px] font-bold text-sub">口座移動・差引</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {move && <AmountCell item={move} onChange={(p) => update(move.key, p)} />}
          <Result label="差引現金残" value={totals.net} note="現金残 − 口座移動" />
          <Result label="差引現金合計" value={totals.netTotal} note="差引現金残 − 経費合計" strong />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button variant="brand" size="lg" disabled={pending || !dirty}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}調整を保存
        </Button>
        {dirty && !pending && <span className="text-[12px] font-medium text-[#b7791f]">未保存の変更があります</span>}
        {state.error && <p role="alert" className="rounded-lg bg-[#fde7eb] px-3 py-2 text-[13px] text-up">{state.error}</p>}
        {state.ok && !dirty && <p role="status" className="rounded-lg bg-[#e3f6ea] px-3 py-2 text-[13px] text-ok">保存しました</p>}
        <span className="ml-auto text-[11px] text-mute">計算式は店舗のExcel（総括シート）と同じです</span>
      </div>
    </form>
  )
}

function AmountCell({ item, onChange, onRemove }: { item: Item; onChange: (p: Partial<Item>) => void; onRemove?: () => void }) {
  const [focus, setFocus] = useState(false)
  const digits = normalizeAmount(item.amount)
  // 入力中以外は 3 桁区切りで表示
  const shown = focus || !/^\d+$/.test(digits) ? item.amount : Number(digits).toLocaleString('ja-JP')
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="flex h-7 items-center gap-2">
        {item.fixed ? (
          <span className="text-[13px] font-bold">{item.label}</span>
        ) : (
          <input value={item.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={30} placeholder="項目名" aria-label="項目名"
            className="h-7 min-w-0 flex-1 rounded-md border border-line px-2 text-[13px] font-bold outline-none focus:border-brand" />
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`${item.label || '項目'}を削除`} className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-mute hover:bg-[#fff4f6] hover:text-up">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="relative mt-2">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-mute">¥</span>
        <input value={shown} onChange={(e) => onChange({ amount: e.target.value })} onFocus={() => { setFocus(true); onChange({ amount: digits }) }} onBlur={() => setFocus(false)}
          inputMode="numeric" type="text" autoComplete="off" maxLength={12} title={`0〜${AMOUNT_MAX.toLocaleString('ja-JP')}円`}
          aria-label={`${item.label}の金額`}
          className="h-11 w-full rounded-lg border border-line bg-white pr-3 pl-7 text-right text-[17px] font-bold tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
      </div>
    </div>
  )
}

function Result({ label, value, note, strong }: { label: string; value: number; note: string; strong?: boolean }) {
  return (
    <div className={cx('flex min-h-[86px] flex-col justify-between rounded-xl border p-3', strong ? 'border-brand/30 bg-brand-soft' : 'border-line bg-[#faf8fd]')}>
      <div className="text-[13px] font-bold">{label}</div>
      <div className={cx('mt-1 text-right font-bold tabular-nums', strong ? 'text-[22px] text-brand' : 'text-[20px]', value < 0 && 'text-up')}>{fmt(value)}</div>
      <div className="truncate text-right text-[11px] text-sub" title={note}>{note}</div>
    </div>
  )
}
