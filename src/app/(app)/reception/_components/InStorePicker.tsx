'use client'
// 入店中のお客様から選ぶ（会員番号・ハンドルネームで絞り込み）
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { Badge, cx } from '@/components/ui'
import { elapsed } from '../_lib/quote'
import type { InStoreRow } from '../_lib/types'
import { GenderBadge } from './bits'

export function InStorePicker({ rows, hrefBase, actionLabel }: { rows: InStoreRow[]; hrefBase: string; actionLabel: string }) {
  const [q, setQ] = useState('')
  const router = useRouter()
  const k = q.normalize('NFKC').trim().toLowerCase()
  const list = k
    ? rows.filter((r) => [r.memberNo, r.handle, r.partnerNo ?? '', r.partnerHandle ?? ''].some((s) => s.toLowerCase().includes(k)))
    : rows
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-mute" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" aria-label="入店中のお客様を検索"
          onKeyDown={(e) => { if (e.key === 'Enter' && list.length === 1) router.push(`${hrefBase}?visit=${list[0].id}`) }}
          placeholder="会員番号・ハンドルネームで絞り込み"
          className="h-14 w-full rounded-xl border border-line bg-white pr-4 pl-12 text-[17px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </div>
      <div className="mt-4 space-y-2.5">
        {list.length === 0 && (
          <p className="rounded-xl border border-dashed border-line py-10 text-center text-[14px] text-mute">
            {rows.length ? '該当するお客様がいません' : '現在、入店中のお客様はいません'}
          </p>
        )}
        {list.map((r) => (
          <Link key={r.id} href={`${hrefBase}?visit=${r.id}`}
            className="flex items-center gap-4 rounded-2xl border border-line bg-white px-4 py-3.5 transition hover:border-brand/50 hover:bg-brand-soft/30">
            <div className="w-16 shrink-0 text-center">
              <div className="text-[20px] font-bold tabular-nums">{r.time}</div>
              <div className="text-[11px] text-sub">{elapsed(r.minutes)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-bold text-brand tabular-nums">{r.memberNo}</span>
                <span className="truncate text-[17px] font-bold">{r.handle}</span>
                <GenderBadge gender={r.category} />
                {r.isNew && <Badge tone="purple">新規</Badge>}
                {r.stale && <Badge tone="red">{r.businessDate.slice(5).replace('-', '/')} から入店中</Badge>}
              </div>
              {r.partnerHandle && <div className="mt-0.5 truncate text-[13px] text-sub">＋ {r.partnerNo} {r.partnerHandle}</div>}
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-[11px] text-sub">未精算</div>
              <div className={cx('text-[16px] font-bold tabular-nums', r.unpaid ? 'text-up' : 'text-mute')}>¥{r.unpaid.toLocaleString('ja-JP')}</div>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-soft px-3 py-2.5 text-[14px] font-bold text-brand">
              {actionLabel}<ChevronRight className="size-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
