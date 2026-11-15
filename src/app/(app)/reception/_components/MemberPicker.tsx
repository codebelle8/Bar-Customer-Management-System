'use client'
// カップルのパートナー選択：会員番号・ハンドルネームで検索して選ぶ（受付できない会員は選べない）
import { useRef, useState, useTransition } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { Button, cx } from '@/components/ui'
import { searchMembersAction } from '../actions'
import type { MemberCard } from '../_lib/types'
import { MemberCardView } from './MemberCardView'

export function MemberPicker({
  value, onChange, exclude = [], label = 'パートナーの会員',
}: {
  value: MemberCard | null
  onChange: (m: MemberCard | null) => void
  exclude?: string[]
  label?: string
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MemberCard[] | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const search = () => {
    if (!q.trim()) return
    start(async () => {
      const r = await searchMembersAction(q, exclude)
      setResults(r.results)
      setError(r.error ?? '')
    })
  }

  if (value)
    return (
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-sub">{label}</p>
        <MemberCardView
          m={value} compact selected
          action={
            <Button type="button" variant="ghost" onClick={() => { onChange(null); setTimeout(() => inputRef.current?.focus(), 0) }}>
              <X className="size-4" />選び直す
            </Button>
          }
        />
      </div>
    )

  return (
    <div className="rounded-2xl border border-dashed border-brand/40 bg-brand-soft/30 p-4">
      <p className="mb-2 text-[14px] font-bold text-brand">{label}を検索して選んでください</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-mute" />
          <input
            ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }}
            placeholder="会員番号（例 10234）またはハンドルネーム" aria-label="パートナー検索"
            className="h-12 w-full rounded-xl border border-line bg-white pr-3 pl-11 text-[16px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>
        <Button type="button" variant="brand" size="lg" onClick={search} disabled={pending || !q.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}検索
        </Button>
      </div>
      {error && <p className="mt-2 text-[13px] text-up">{error}</p>}
      {results && (
        <div className="mt-3 space-y-2">
          {results.length === 0 && <p className="py-3 text-center text-[13px] text-sub">該当する会員が見つかりません</p>}
          {results.map((m) => (
            <MemberCardView
              key={m.id} m={m} compact
              action={
                !m.block && (
                  <Button type="button" variant="outline" className={cx('w-full')} size="lg" onClick={() => { onChange(m); setResults(null); setQ('') }}>
                    この会員をパートナーに選ぶ
                  </Button>
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
