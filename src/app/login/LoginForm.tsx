'use client'

import { useActionState } from 'react'
import { LoaderCircle, Lock, User } from 'lucide-react'
import { login } from '@/app/actions'
import { buttonCls, inputCls, cx } from '@/components/ui'

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined)
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-sub">ログインID</span>
        <span className="relative block">
          <User className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" />
          <input name="loginId" autoComplete="username" required autoFocus className={cx(inputCls, 'h-12 pl-10')} />
        </span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-sub">パスワード</span>
        <span className="relative block">
          <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" />
          <input name="password" type="password" autoComplete="current-password" required className={cx(inputCls, 'h-12 pl-10')} />
        </span>
      </label>
      {state?.error && <p role="alert" className="rounded-lg bg-[#fde7eb] px-3 py-2 text-[13px] text-up">{state.error}</p>}
      <button disabled={pending} className={cx(buttonCls('brand', 'lg'), 'w-full')}>
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        ログイン
      </button>
    </form>
  )
}
