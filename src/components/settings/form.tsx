'use client'

// 設定系フォームの共通部品：サーバーアクションの結果表示・送信中表示
// （入力エラー時に入力内容が消えないよう、form の自動リセットを使わず onSubmit から送信する）
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, CircleAlert, Copy } from 'lucide-react'
import { Button, cx } from '@/components/ui'
import { confirmDialog } from '@/components/confirm'
import type { ActionState } from './types'

type Act = (prev: ActionState, fd: FormData) => Promise<ActionState>

const FormCtx = createContext<{ pending: boolean; state: ActionState }>({ pending: false, state: undefined })
export const useFormCtx = () => useContext(FormCtx)

export function ActionForm({
  action, children, className, id, resetOnSuccess, confirmText, message = 'end',
}: {
  action: Act
  children: ReactNode
  className?: string
  id?: string
  /** 成功したら入力欄を空に戻す（新規追加フォーム） */
  resetOnSuccess?: boolean
  /** 送信前の確認（ボタン側の data-confirm が優先） */
  confirmText?: string
  /** 結果メッセージの位置（none の場合は <FormMessage /> を任意の場所に置く） */
  message?: 'end' | 'none'
}) {
  const [state, dispatch, pending] = useActionState(action, undefined)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset()
  }, [state, resetOnSuccess])
  return (
    <FormCtx value={{ pending, state }}>
      <form
        ref={ref}
        id={id}
        className={className}
        onSubmit={(e) => {
          e.preventDefault()
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
          const msg = submitter?.dataset.confirm ?? confirmText
          const fd = new FormData(e.currentTarget, submitter)
          if (!msg) return startTransition(() => dispatch(fd))
          // 確認は画面内のメッセージで出す（「はい」を押したときだけ送信）
          void confirmDialog(msg).then((ok) => ok && startTransition(() => dispatch(fd)))
        }}
      >
        {children}
        {message === 'end' && <FormMessage className="mt-3" />}
      </form>
    </FormCtx>
  )
}

/** 送信ボタン（送信中は無効化） */
export function SubmitButton({ children, pendingText = '保存中…', ...p }: Parameters<typeof Button>[0] & { pendingText?: string }) {
  const { pending } = useFormCtx()
  return (
    <Button type="submit" variant="brand" {...p} disabled={pending || p.disabled}>
      {pending ? pendingText : children}
    </Button>
  )
}

/** 結果メッセージ（成功は数秒で消える） */
export function FormMessage({ className }: { className?: string }) {
  const { state } = useFormCtx()
  const [shown, setShown] = useState<ActionState>(undefined)
  const [prev, setPrev] = useState<ActionState>(undefined)
  if (state !== prev) {
    setPrev(state)
    setShown(state)
  }
  useEffect(() => {
    if (!shown?.ok || shown.secret) return
    const id = setTimeout(() => setShown(undefined), 5000)
    return () => clearTimeout(id)
  }, [shown])
  if (!shown || (!shown.error && !shown.message)) return null
  return shown.error ? (
    <p role="alert" className={cx('flex items-start gap-2 rounded-lg border border-[#f2c2cb] bg-[#fff4f6] px-3 py-2 text-[13px] text-up', className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="whitespace-pre-line">{shown.error}</span>
    </p>
  ) : (
    <p role="status" className={cx('animate-fade-in flex items-start gap-2 rounded-lg border border-[#bfe7cf] bg-[#effaf3] px-3 py-2 text-[13px] text-ok', className)}>
      <Check className="mt-0.5 size-4 shrink-0" />
      <span className="whitespace-pre-line">{shown.message}</span>
    </p>
  )
}

/** 一度だけ表示するパスワードなど（コピーボタン付き） */
export function SecretBox({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="animate-fade-in rounded-xl border border-brand-light bg-brand-soft/60 px-4 py-3">
      <p className="text-[12px] font-medium text-sub">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <code className="rounded-md bg-white px-3 py-1.5 font-mono text-[18px] font-bold tracking-wider text-ink">{value}</code>
        <Button type="button" size="sm" onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            /* クリップボードが使えない環境では手で控える */
          }
        }}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'コピーしました' : 'コピー'}
        </Button>
      </div>
      {note && <p className="mt-2 text-[12px] text-up">{note}</p>}
    </div>
  )
}
