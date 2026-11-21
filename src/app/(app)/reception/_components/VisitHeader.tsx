// 来店の見出し（注文・精算の画面上部）
import type { ReactNode } from 'react'
import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui'
import { VisitStatusBadge } from '@/components/VisitStatusBadge'
import { fmtMD } from '@/lib/format'
import { elapsed } from '../_lib/quote'
import { GenderBadge } from './bits'

export function VisitHeader(p: {
  memberNo: string
  handle: string
  partnerNo: string | null
  partnerHandle: string | null
  category: string
  time: string
  minutes: number
  businessDate: string
  today: string
  status: 'in' | 'out' | 'void'
  /** 自動退店した来店 */
  auto?: boolean
  isNew: boolean
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-brand tabular-nums">{p.memberNo}</span>
          <span className="truncate text-[24px] font-bold" data-testid="visit-handle">{p.handle}</span>
          <GenderBadge gender={p.category} />
          {p.isNew && <Badge tone="purple">新規</Badge>}
          <VisitStatusBadge status={p.status} auto={p.auto} />
        </div>
        {p.partnerHandle && <p className="mt-0.5 truncate text-[14px] text-sub">＋ {p.partnerNo} {p.partnerHandle}</p>}
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-page px-4 py-2">
        <Clock className="size-5 text-brand" />
        <div>
          <div className="text-[18px] leading-tight font-bold tabular-nums">
            {p.businessDate !== p.today && <span className="mr-1 text-[13px] text-up">{fmtMD(p.businessDate)}</span>}
            {p.time} 入店
          </div>
          {p.status === 'in' && <div className="text-[12px] text-sub">滞在 {elapsed(p.minutes)}</div>}
        </div>
      </div>
      {p.action}
    </div>
  )
}
