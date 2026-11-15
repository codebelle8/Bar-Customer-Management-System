'use client'

// 規約の本文が長くなっても A4 1枚に収まるよう、本文の文字サイズを自動で小さくする
import { useEffect, useRef, useState, type ReactNode } from 'react'

const MM = 96 / 25.4
/** A4（297mm）− 上下余白 12mm×2 */
const LIMIT_MM = 273

export function AutoFit({ children, base = 10, min = 8 }: { children: ReactNode; base?: number; min?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(base)
  useEffect(() => {
    let cancelled = false
    const fit = async () => {
      await document.fonts?.ready
      const el = ref.current
      if (!el || cancelled) return
      const body = el.querySelector<HTMLElement>('[data-fit]')
      if (!body) return
      let s = base
      body.style.fontSize = `${s}pt`
      while (el.scrollHeight > LIMIT_MM * MM && s > min) {
        s = Math.round((s - 0.25) * 100) / 100
        body.style.fontSize = `${s}pt`
      }
      if (!cancelled) setSize(s)
    }
    fit()
    return () => {
      cancelled = true
    }
  }, [base, min])
  return (
    <div ref={ref}>
      {children}
      {size < base && <p className="no-print mt-2 text-[9pt] text-[#b7791f]">※本文が長いため、1枚に収まるよう文字を小さくしています（{size}pt）</p>}
    </div>
  )
}
