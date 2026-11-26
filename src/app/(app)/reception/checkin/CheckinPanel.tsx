'use client'
// 既存会員の来店受付：区分・パートナー・割引・年会費・料金調整（オーナー）・お会計
import { useActionState, useState } from 'react'
import { Check, Gift, Loader2, Pencil } from 'lucide-react'
import { Card, Input, cx } from '@/components/ui'
import type { Category } from '@/db/schema'
import { fmtDate, fmtJaDate } from '@/lib/format'
import { checkinAction } from '../actions'
import { MoneyRow, Notice } from '../_components/bits'
import { CashBox, paidOk } from '../_components/CashBox'
import { CheckTile, Choice } from '../_components/CheckTile'
import { MemberPicker } from '../_components/MemberPicker'
import { buildQuote, parseYen } from '../_lib/quote'
import type { MemberCard, TodayView } from '../_lib/types'

export interface CheckinPanelProps {
  member: MemberCard
  today: TodayView & { partLabel: string; dayTypeLabel: string }
  discount: Record<Category, { eligible: boolean; reason: string }>
  counts: { prevMonthVisits: number; usedThisMonth: number }
  rule: { enabled: boolean; minVisits: number; amount: number; gender: string; scope: 'every' | 'once' }
  joinFee: number
  annual: { enabled: boolean; fee: number }
  isOwner: boolean
}

export function CheckinPanel(p: CheckinPanelProps) {
  const m = p.member
  const [category, setCategory] = useState<Category>(m.gender)
  const [partner, setPartner] = useState<MemberCard | null>(null)
  const [annualMain, setAnnualMain] = useState(m.feeDue)
  const [annualPartner, setAnnualPartner] = useState(true)
  const [joinMain, setJoinMain] = useState(m.newToday)
  const [joinPartner, setJoinPartner] = useState(true)
  const [adjust, setAdjust] = useState(false)
  const [adjFee, setAdjFee] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [paid, setPaid] = useState('')
  const [state, action, pending] = useActionState(checkinAction, undefined)

  const couple = category === 'カップル'
  const ptn = couple ? partner : null
  const annualIds = [annualMain && m.feeDue ? m.id : null, ptn && ptn.feeDue && annualPartner ? ptn.id : null].filter((x): x is string => !!x)
  const joinIds = [joinMain && m.newToday ? m.id : null, ptn && ptn.newToday && joinPartner ? ptn.id : null].filter((x): x is string => !!x)
  const override = adjust && p.isOwner ? parseYen(adjFee) : null
  const d = p.discount[category]
  const quote = buildQuote({
    category, partLabel: p.today.partLabel, base: p.today.prices[category], override,
    discount: { eligible: d.eligible, cap: p.rule.amount, reason: d.reason },
    joinFee: p.joinFee * joinIds.length, joinNote: joinIds.length ? '本日登録の新規会員' : undefined,
    annualFee: p.annual.fee * annualIds.length, annualNote: annualIds.length ? `${annualIds.length}名分・期限を1年延長` : undefined,
  })
  const adjustOk = !adjust || (override != null && !!adjReason.trim())
  const ok = (!couple || !!partner) && adjustOk && paidOk(paid, quote.total)
  const why = couple && !partner ? 'パートナーの会員を選んでください' : !adjustOk ? '調整後の入場料と理由を入力してください' : !paidOk(paid, quote.total) ? '預かり金が不足しています' : ''

  // 割引が付かない理由（対象性別の会員のみ表示）
  const noDiscount = !d.eligible && p.rule.enabled && m.gender === p.rule.gender
    ? couple
      ? 'カップルはリピーター割引の対象外です'
      : category !== m.gender
        ? '区分が会員の性別と異なるため割引は適用されません'
        : p.counts.prevMonthVisits < p.rule.minVisits
          ? `前月の来店 ${p.counts.prevMonthVisits}回（${p.rule.minVisits}回以上で翌月 −¥${p.rule.amount.toLocaleString('ja-JP')}）`
          : p.rule.scope === 'once' && p.counts.usedThisMonth > 0
            ? '今月はすでに割引を利用済みです（月1回まで）'
            : ''
    : ''

  const payload = JSON.stringify({
    memberId: m.id, category, partnerId: couple ? (partner?.id ?? null) : null, annualFor: annualIds, joinFor: joinIds,
    override: adjust && p.isOwner && override != null ? { fee: override, reason: adjReason.trim() } : null, paid: parseYen(paid),
  })

  return (
    <div className="space-y-5">
      <Card title="区分・料金" action={<span className="text-[12px] font-bold text-sub">{fmtJaDate(p.today.businessDate)}・{p.today.dayTypeLabel}・{p.today.partLabel}</span>}>
        <div className="grid grid-cols-3 gap-3">
          {(['男性', '女性', 'カップル'] as Category[]).map((c) => (
            <Choice key={c} selected={category === c} tone={c === '男性' ? 'male' : c === '女性' ? 'female' : 'brand'} onClick={() => setCategory(c)} className="h-16 text-[17px]">
              {c}<span className="block text-[12px] font-medium opacity-80">¥{p.today.prices[c].toLocaleString('ja-JP')}</span>
            </Choice>
          ))}
        </div>

        {couple && (
          <div className="mt-4">
            <MemberPicker value={partner} onChange={setPartner} exclude={[m.id]} />
          </div>
        )}

        {d.eligible && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#bfe6cf] bg-[#effaf3] px-4 py-3 text-ok" data-testid="discount-applied">
            <Gift className="size-6 shrink-0" />
            <div>
              <p className="text-[16px] font-bold">リピーター割引 −¥{Math.min(quote.fee, p.rule.amount).toLocaleString('ja-JP')} を自動適用</p>
              <p className="text-[13px]">{d.reason}</p>
            </div>
          </div>
        )}
        {noDiscount && <p className="mt-3 text-[13px] text-sub">割引：{noDiscount}</p>}

        {p.annual.enabled && m.feeDue && (
          <div className="mt-4 space-y-2">
            <Notice tone="warn">
              <b>年会費の{m.feeExpiresAt ? `期限が切れています（${fmtDate(m.feeExpiresAt)}まで）` : '支払いが確認できません'}</b>：{m.handle}（{m.memberNo}）
            </Notice>
            <CheckTile checked={annualMain} onChange={setAnnualMain} sub="期限を1年延長します">今回、年会費 ¥{p.annual.fee.toLocaleString('ja-JP')} をいただく</CheckTile>
          </div>
        )}
        {p.annual.enabled && ptn?.feeDue && (
          <div className="mt-3">
            <CheckTile checked={annualPartner} onChange={setAnnualPartner} sub={`パートナー ${ptn.handle}（${ptn.memberNo}）の年会費が未納・期限切れです。期限を1年延長します`}>
              パートナーの年会費 ¥{p.annual.fee.toLocaleString('ja-JP')} もいただく
            </CheckTile>
          </div>
        )}
        {m.newToday && (
          <div className="mt-3">
            <CheckTile checked={joinMain} onChange={setJoinMain} sub="本日「登録のみ」で登録した会員の初回入店です">入会金 ¥{p.joinFee.toLocaleString('ja-JP')} をいただく</CheckTile>
          </div>
        )}
        {ptn?.newToday && (
          <div className="mt-3">
            <CheckTile checked={joinPartner} onChange={setJoinPartner} sub={`パートナー ${ptn.handle}（${ptn.memberNo}）は本日登録・初回入店です`}>パートナーの入会金 ¥{p.joinFee.toLocaleString('ja-JP')} もいただく</CheckTile>
          </div>
        )}

        {p.isOwner && (
          <div className="mt-4 rounded-xl border border-line px-4 py-3">
            <button type="button" onClick={() => setAdjust(!adjust)} className="flex items-center gap-2 text-[14px] font-bold text-brand">
              <Pencil className="size-4" />料金を調整する（オーナーのみ）
            </button>
            {adjust && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-sub">調整後の入場料 <span className="text-up">*</span></span>
                  <Input inputMode="numeric" value={adjFee} onChange={(e) => setAdjFee(e.target.value.replace(/[^\d０-９]/g, ''))} placeholder={String(p.today.prices[category])} className="h-12 text-right text-[18px] font-bold" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-sub">理由（来店記録と操作ログに残ります） <span className="text-up">*</span></span>
                  <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} maxLength={200} placeholder="例：イベント告知の特別招待" className="h-12" />
                </label>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 divide-y divide-line rounded-xl border border-line px-4">
          {quote.lines.map((l) => <MoneyRow key={l.label} label={l.label} amount={l.amount} note={l.note} />)}
          <MoneyRow label="合計" amount={quote.total} strong />
        </div>
      </Card>

      <CashBox total={quote.total} paid={paid} onPaid={setPaid} />

      {state?.error && <Notice tone="error">{state.error}</Notice>}

      <form action={action} className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-[0_8px_28px_rgba(42,20,80,0.14)] backdrop-blur">
        <input type="hidden" name="payload" value={payload} />
        {why && <span className="text-[13px] text-sub">{why}</span>}
        <button disabled={!ok || pending} data-testid="checkin-confirm"
          className={cx('btn-brand inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-[16px] font-bold whitespace-nowrap sm:w-auto sm:min-w-64 sm:px-6 sm:text-[17px] disabled:cursor-not-allowed disabled:opacity-50')}>
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
          <span className="sm:hidden">確定 ¥{quote.total.toLocaleString('ja-JP')}</span>
          <span className="hidden sm:inline">入店受付を確定（¥{quote.total.toLocaleString('ja-JP')}）</span>
        </button>
      </form>
    </div>
  )
}
