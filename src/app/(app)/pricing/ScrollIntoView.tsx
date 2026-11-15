'use client'

import { useEffect } from 'react'

/** 日付を選んだとき、設定パネルが画面外（タブレットの縦並び）ならパネルまでスクロールする */
export function ScrollIntoView({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top > window.innerHeight * 0.6 || r.bottom < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [targetId])
  return null
}
