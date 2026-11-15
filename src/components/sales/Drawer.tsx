'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** 右側から開く詳細パネル（URL の ?date= で開閉。Esc・背景クリックで閉じる） */
export function Drawer({ title, sub, closeHref, children }: { title: ReactNode; sub?: ReactNode; closeHref: string; children: ReactNode }) {
  const router = useRouter()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && router.replace(closeHref, { scroll: false })
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [closeHref, router])
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link href={closeHref} scroll={false} replace aria-label="閉じる" className="animate-fade-in absolute inset-0 bg-[#1e1830]/35 backdrop-blur-[1px]" />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true"
        className="relative flex h-full w-full max-w-[600px] flex-col bg-page shadow-[-12px_0_40px_rgba(30,24,48,0.18)] outline-none">
        <div className="flex items-center gap-3 border-b border-line bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold">{title}</h2>
            {sub && <div className="mt-0.5 text-[12px] text-sub">{sub}</div>}
          </div>
          <Link href={closeHref} scroll={false} replace className="ml-auto inline-flex size-10 items-center justify-center rounded-lg border border-line bg-white text-sub hover:bg-page hover:text-ink" aria-label="閉じる">
            <X className="size-5" />
          </Link>
        </div>
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
