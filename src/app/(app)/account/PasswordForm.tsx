'use client'

import { useActionState } from 'react'
import { changePassword } from '@/app/actions'
import { Button, Field, Input } from '@/components/ui'

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined)
  return (
    <form action={action} className="space-y-4">
      <Field label="現在のパスワード" required><Input name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="新しいパスワード" required hint="8文字以上"><Input name="next" type="password" autoComplete="new-password" minLength={8} required /></Field>
      <Field label="新しいパスワード（確認）" required><Input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></Field>
      {state?.error && <p role="alert" className="rounded-lg bg-[#fde7eb] px-3 py-2 text-[13px] text-up">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-[#e3f6ea] px-3 py-2 text-[13px] text-ok">パスワードを変更しました</p>}
      <Button variant="brand" disabled={pending}>変更する</Button>
    </form>
  )
}
