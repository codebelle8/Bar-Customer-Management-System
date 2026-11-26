'use client'

import { useActionState, useState, useTransition } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { addExpense, deleteExpense, type ExpenseState } from '@/app/(app)/sales/actions'
import { Button, Field, Input, cx } from '@/components/ui'
import { AMOUNT_MAX, EXPENSE_KINDS, type ExpenseKind } from './constants'
import { alertDialog, confirmDialog } from '@/components/confirm'

/** 経費・税金・アルバイトの入力フォーム */
export function ExpenseForm({ date }: { date: string }) {
  const [state, action, pending] = useActionState<ExpenseState, FormData>(addExpense, { seq: 0 })
  const [kind, setKind] = useState<ExpenseKind>('expense')
  const k = EXPENSE_KINDS.find((x) => x.key === kind)!
  return (
    <form key={state.seq} action={action} className="space-y-3">
      <input type="hidden" name="date" value={date} />
      <div role="radiogroup" aria-label="種類" className="grid grid-cols-3 gap-2">
        {EXPENSE_KINDS.map((x) => (
          <label key={x.key}
            className={cx(
              'flex h-11 cursor-pointer items-center justify-center rounded-lg border text-[14px] font-bold transition select-none',
              kind === x.key ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-sub hover:bg-page',
            )}>
            <input type="radio" name="kind" value={x.key} checked={kind === x.key} onChange={() => setKind(x.key)} className="sr-only" />
            {x.label}
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        <Field label={k.nameLabel}>
          <Input name="name" maxLength={100} placeholder={k.namePlaceholder} defaultValue={state.values?.name} autoComplete="off" />
        </Field>
        <Field label="金額（円）" required>
          <Input name="amount" type="number" inputMode="numeric" min={0} max={AMOUNT_MAX} step={1} required placeholder="0"
            defaultValue={state.values?.amount} className="text-right tabular-nums" />
        </Field>
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-[#fde7eb] px-3 py-2 text-[13px] text-up">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-[#e3f6ea] px-3 py-2 text-[13px] text-ok">登録しました</p>}
      <Button variant="brand" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {k.label}を登録
      </Button>
    </form>
  )
}

/** 削除ボタン（確認してから削除） */
export function DeleteExpenseButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition()
  return (
    <button type="button" disabled={pending} aria-label={`${label}を削除`}
      onClick={async () => {
        if (!(await confirmDialog(`「${label}」を削除しますか？`))) return
        start(async () => {
          const r = await deleteExpense(id)
          if (r.error) void alertDialog(r.error)
        })
      }}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-[#f2c2cb] bg-white text-up transition hover:bg-[#fff4f6] disabled:opacity-50">
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  )
}
