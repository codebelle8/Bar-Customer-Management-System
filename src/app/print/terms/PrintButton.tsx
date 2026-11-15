'use client'

import { Printer } from 'lucide-react'

/** 印刷ダイアログを開く（自動では開かない） */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}
      className="btn-brand inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[14px] font-bold">
      <Printer className="size-4" />印刷する
    </button>
  )
}
