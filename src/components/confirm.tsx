'use client'

// 確認・お知らせのメッセージ（ブラウザ標準の confirm／alert の代わりに、画面の中に表示する）
// 使い方：await confirmDialog('…を記録します。よろしいですか？') → 「はい」で true
import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleHelp } from 'lucide-react'
import { buttonCls, cx } from '@/components/ui'

type Req = { message: string; okLabel: string; cancelLabel: string | null; resolve: (ok: boolean) => void }

let show: ((r: Req) => void) | null = null

/** 確認メッセージを出し、「はい」を押したら true（画面の準備前はブラウザ標準の確認） */
export function confirmDialog(message: string, okLabel = 'はい'): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(message))
  const open = show
  return new Promise((resolve) => open({ message, okLabel, cancelLabel: 'やめる', resolve }))
}

/** お知らせ（「OK」のみ） */
export function alertDialog(message: string): Promise<void> {
  if (!show) {
    window.alert(message)
    return Promise.resolve()
  }
  const open = show
  return new Promise((resolve) => open({ message, okLabel: 'OK', cancelLabel: null, resolve: () => resolve() }))
}

/** 画面に1つだけ置く（アプリ全体のレイアウト） */
export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null)
  const current = useRef<Req | null>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  const close = useCallback((ok: boolean) => {
    const r = current.current
    current.current = null
    setReq(null)
    r?.resolve(ok)
  }, [])

  useEffect(() => {
    const open = (r: Req) => {
      current.current?.resolve(false)
      current.current = r
      setReq(r)
    }
    show = open
    return () => {
      if (show === open) show = null
    }
  }, [])

  useEffect(() => {
    if (!req) return
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [req, close])

  if (!req) return null
  const Icon = req.cancelLabel ? CircleHelp : CircleAlert
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-[#1e1830]/40 backdrop-blur-[1px]" onClick={() => close(false)} aria-hidden="true" />
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-message" data-testid="confirm-dialog"
        className="animate-fade-in relative w-full max-w-[440px] rounded-2xl border border-line bg-white p-6 shadow-[0_20px_60px_rgba(30,24,48,0.28)]">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Icon className="size-5" />
          </span>
          <p id="confirm-message" className="min-w-0 pt-1.5 text-[16px] leading-relaxed font-bold whitespace-pre-line text-ink">{req.message}</p>
        </div>
        <div className="mt-6 flex gap-2">
          {req.cancelLabel && (
            <button type="button" className={cx(buttonCls('default', 'lg'), 'flex-1')} onClick={() => close(false)} data-testid="confirm-cancel">{req.cancelLabel}</button>
          )}
          <button ref={okRef} type="button" className={cx(buttonCls('brand', 'lg'), 'flex-1')} onClick={() => close(true)} data-testid="confirm-ok">{req.okLabel}</button>
        </div>
      </div>
    </div>
  )
}
