'use client'
// 来店の取消（誤って登録した来店）。理由は必須で、来店記録の備考と操作ログに残る
import { useActionState, useState } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import { voidVisitAction } from '../actions'
import { Notice } from '../_components/bits'

export function VoidPanel({ visitId, canVoid, deniedReason }: { visitId: string; canVoid: boolean; deniedReason?: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [state, action, pending] = useActionState(voidVisitAction, undefined)
  if (!canVoid) return <p className="text-[13px] text-sub">{deniedReason}</p>
  if (!open)
    return (
      <Button type="button" variant="danger" size="lg" onClick={() => setOpen(true)} data-testid="void-open">
        <Undo2 className="size-4" />この来店を取消する（誤登録）
      </Button>
    )
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="payload" value={JSON.stringify({ visitId, reason: reason.trim() })} />
      <Notice tone="warn">取消すると売上・人数の集計から除外されます。入店時にいただいた料金は返金してください。</Notice>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-bold">取消の理由 <span className="text-up">*</span></span>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} placeholder="例：別の会員で受付してしまったため" data-testid="void-reason" />
      </label>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <div className="flex gap-2">
        <button disabled={!reason.trim() || pending} data-testid="void-confirm"
          className="inline-flex h-12 items-center justify-center gap-1.5 rounded-lg bg-up px-5 text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(214,69,93,0.25)] transition hover:bg-[#c23a51] disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}取消を確定する
        </button>
        <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>やめる</Button>
      </div>
    </form>
  )
}
