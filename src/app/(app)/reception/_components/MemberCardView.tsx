// 会員検索の結果カード（サーバー・クライアントどちらからも使える）
import type { ReactNode } from 'react'
import { StickyNote } from 'lucide-react'
import { Badge, cx } from '@/components/ui'
import { fmtDate } from '@/lib/format'
import type { MemberCard } from '../_lib/types'
import { BlockBanner, GenderBadge } from './bits'

export function MemberCardView({ m, action, compact, selected }: { m: MemberCard; action?: ReactNode; compact?: boolean; selected?: boolean }) {
  const blocked = m.block === 'banned' || m.block === 'withdrawn'
  return (
    <div
      data-member={m.memberNo}
      className={cx(
        'rounded-2xl border bg-white transition',
        compact ? 'p-3' : 'p-4',
        blocked ? 'border-[#f2c2cb] bg-[#fffafb]' : selected ? 'border-brand ring-2 ring-brand/20' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cx('font-bold', compact ? 'text-[17px]' : 'text-[20px]')}>{m.handle}</span>
        <GenderBadge gender={m.gender} />
        <span className="text-[15px] font-bold text-brand tabular-nums">{m.memberNo}</span>
        {m.status === 'active' && !m.inStore && <Badge tone="green">有効</Badge>}
        {m.inStore && <Badge tone="amber">入店中</Badge>}
        {m.status === 'banned' && <Badge tone="red">出入禁止</Badge>}
        {m.status === 'withdrawn' && <Badge tone="gray">退会</Badge>}
        {m.newToday && <Badge tone="purple">本日登録</Badge>}
      </div>
      <dl className={cx('mt-2 grid gap-x-4 gap-y-1 text-[13px]', compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3')}>
        <Item label="年齢">{m.age != null ? `${m.age}歳` : '—'}</Item>
        <Item label="入会日">{fmtDate(m.joinedAt)}</Item>
        <Item label="最終来店">{m.lastVisit ? fmtDate(m.lastVisit) : 'なし'}</Item>
        <Item label="今月">
          <b className="text-[15px] text-ink tabular-nums">{m.thisMonth}</b>回
        </Item>
        <Item label="先月">
          <b className="text-[15px] text-ink tabular-nums">{m.lastMonth}</b>回
        </Item>
        {m.feeExpiresAt !== null || m.feeDue ? (
          <Item label="年会費">{m.feeDue ? <span className="font-bold text-up">{m.feeExpiresAt ? `${fmtDate(m.feeExpiresAt)} 期限切れ` : '未納'}</span> : `${fmtDate(m.feeExpiresAt!)}まで`}</Item>
        ) : null}
      </dl>
      {m.memo && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#fffaeb] px-3 py-2 text-[13px] text-[#7a5410]">
          <StickyNote className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{m.memo}</span>
        </p>
      )}
      {m.block && (
        <div className="mt-3">
          <BlockBanner kind={m.block} reason={m.banReason} compact={compact} />
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="shrink-0 text-sub">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}
