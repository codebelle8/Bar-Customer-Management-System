'use client'

import { useActionState, useState, startTransition } from 'react'
import { Ban, LoaderCircle, RotateCcw, ShieldCheck, UserMinus } from 'lucide-react'
import { setMemberStatus, type FormState } from '@/app/(app)/members/actions'
import { Button, Textarea } from '@/components/ui'
import { confirmDialog } from '@/components/confirm'
import type { MemberStatus } from './rules'
import { FieldError } from './IdDocsField'

type Op = 'ban' | 'unban' | 'withdraw' | 'reactivate'

/** ステータス変更（出入禁止はスタッフも可。解除・退会・有効に戻すはオーナーのみ） */
export function StatusActions({ id, status, isOwner, label }: { id: string; status: MemberStatus; isOwner: boolean; label: string }) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(setMemberStatus, undefined)
  const [banOpen, setBanOpen] = useState(false)
  const run = (op: Op, reason = '') => {
    const fd = new FormData()
    fd.set('id', id)
    fd.set('op', op)
    fd.set('reason', reason)
    startTransition(() => dispatch(fd))
  }
  const confirmRun = (op: Op, message: string) => {
    void confirmDialog(message).then((ok) => ok && run(op))
  }

  return (
    <div className="space-y-3">
      {status !== 'banned' && !banOpen && (
        <Button variant="danger" size="lg" className="w-full" onClick={() => setBanOpen(true)} disabled={pending}>
          <Ban className="size-4" />出入禁止にする
        </Button>
      )}
      {status !== 'banned' && banOpen && (
        <form
          className="space-y-3 rounded-xl border border-[#f2c2cb] bg-[#fff8f9] p-4"
          onSubmit={(e) => {
            e.preventDefault()
            const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim()
            if (reason) run('ban', reason)
          }}
        >
          <p className="text-[13px] font-bold text-up">{label} を出入禁止にします</p>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-sub">理由<span className="ml-1 text-up">*</span></span>
            <Textarea name="reason" required maxLength={300} rows={3} autoFocus placeholder="例：他のお客様への迷惑行為（2026/11/15）" />
          </label>
          <FieldError msg={state?.errors?.reason} />
          <div className="flex gap-2">
            <Button type="button" onClick={() => setBanOpen(false)} disabled={pending} className="flex-1" size="lg">やめる</Button>
            <button disabled={pending} className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg bg-up px-5 text-[15px] font-bold text-white transition hover:bg-[#c23a51] disabled:opacity-50">
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Ban className="size-4" />}出入禁止にする
            </button>
          </div>
        </form>
      )}

      {status === 'banned' && (isOwner ? (
        <Button variant="outline" size="lg" className="w-full" disabled={pending}
          onClick={() => confirmRun('unban', `${label} の出入禁止を解除しますか？\n解除すると受付で入店できるようになります。`)}>
          <ShieldCheck className="size-4" />出入禁止を解除
        </Button>
      ) : <p className="rounded-lg bg-page px-3 py-2.5 text-[12px] text-sub">出入禁止の解除はオーナーのみ行えます。</p>)}

      {isOwner && status === 'active' && (
        <Button size="lg" className="w-full" disabled={pending}
          onClick={() => confirmRun('withdraw', `${label} を退会にしますか？\n退会後は受付で入店できなくなります（来店履歴は残ります）。`)}>
          <UserMinus className="size-4" />退会にする
        </Button>
      )}
      {isOwner && status === 'withdrawn' && (
        <Button variant="outline" size="lg" className="w-full" disabled={pending}
          onClick={() => confirmRun('reactivate', `${label} を有効な会員に戻しますか？`)}>
          <RotateCcw className="size-4" />有効に戻す
        </Button>
      )}
      {!isOwner && status !== 'banned' && <p className="text-[11px] text-mute">退会・有効に戻す操作はオーナーのみ行えます。</p>}
      {state?.error && <p role="alert" className="rounded-lg bg-[#fde7eb] px-3 py-2 text-[13px] text-up">{state.error}</p>}
      {pending && <p className="flex items-center gap-1.5 text-[12px] text-sub"><LoaderCircle className="size-3.5 animate-spin" />処理中…</p>}
    </div>
  )
}
