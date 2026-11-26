import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { and, desc, eq, ne } from 'drizzle-orm'
import { CircleCheckBig, GlassWater, Heart, House, UserPlus } from 'lucide-react'
import { Card, buttonCls, cx } from '@/components/ui'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { ageOn, fmtDate, fmtJaDate, fmtTime } from '@/lib/format'
import { DAY_TYPE_STYLE } from '@/lib/pricing'
import { DEFAULT_TERMS, parseTerms, PHOTO_ID_DOCS, REFERRALS, SUB_ID_DOCS, TERMS_PLEDGE } from '@/lib/terms'
import { MoneyRow, Notice } from '../_components/bits'
import { isUuid, loadToday, memberCardById, nextFreeMemberNo, PART_LABEL } from '../_lib/server'
import { NewMemberWizard } from './NewMemberWizard'

export const metadata: Metadata = { title: '新規入会・来店受付' }

export default async function NewMemberPage({ searchParams }: PageProps<'/reception/new'>) {
  const sp = await searchParams
  const ctx = await requireCtx()
  if (typeof sp.done === 'string') return <Done id={sp.done} paid={typeof sp.paid === 'string' ? +sp.paid : null} />

  const data = await query(async (tx) => {
    const today = await loadToday(tx, ctx.storeId)
    const no = await nextFreeMemberNo(tx, ctx.storeId, ctx.store.memberPrefix, today.settings.nextMemberNo)
    const partner = typeof sp.partner === 'string' ? await memberCardById(tx, ctx.storeId, today.businessDate, today.settings, sp.partner) : null
    return { today, no, partner }
  }, ctx)
  const { today, no } = data
  const s = today.settings
  return (
    <NewMemberWizard
      terms={parseTerms(s.termsText.trim() ? s.termsText : DEFAULT_TERMS)}
      pledge={TERMS_PLEDGE}
      termsVersion={s.termsVersion}
      nextMemberNo={`${ctx.store.memberPrefix}${no}`}
      today={{
        businessDate: today.businessDate, part: today.part, dayType: today.day.type, dayLabel: today.day.label, prices: today.prices,
        partLabel: PART_LABEL[today.part], dayTypeLabel: today.day.label || DAY_TYPE_STYLE[today.day.type].label,
      }}
      joinFee={s.joinFee}
      annual={{ enabled: s.annualFeeEnabled, fee: s.annualFee }}
      photoDocs={PHOTO_ID_DOCS}
      subDocs={SUB_ID_DOCS}
      referrals={REFERRALS}
      initialPartner={data.partner && !data.partner.block ? data.partner : null}
    />
  )
}

/** 完了画面：会員番号を大きく表示（用紙への記入用） */
async function Done({ id, paid }: { id: string; paid: number | null }) {
  const ctx = await requireCtx()
  const data = isUuid(id)
    ? await query(async (tx) => {
        const [m] = await tx.select().from(t.members).where(and(eq(t.members.id, id), eq(t.members.storeId, ctx.storeId)))
        if (!m) return null
        const [v] = await tx
          .select()
          .from(t.visits)
          .where(and(eq(t.visits.memberId, m.id), eq(t.visits.isNew, true), ne(t.visits.status, 'void')))
          .orderBy(desc(t.visits.checkedInAt))
          .limit(1)
        const [partner] = v?.partnerMemberId ? await tx.select().from(t.members).where(eq(t.members.id, v.partnerMemberId)) : []
        return { m, v, partner }
      }, ctx)
    : null
  if (!data) return <Notice tone="error">登録内容が見つかりません。<Link href="/reception" className="ml-2 font-bold underline">受付トップへ</Link></Notice>
  const { m, v, partner } = data
  const change = v && paid != null && Number.isFinite(paid) ? paid - v.entryTotal : null
  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-5">
      <section className="card overflow-hidden text-center">
        <div className="bg-gradient-to-br from-[#7b3fe0] to-[#5f2bb8] px-6 py-8 text-white">
          <p className="flex items-center justify-center gap-2 text-[17px] font-bold"><CircleCheckBig className="size-6" />{v ? '新規入会・入店受付が完了しました' : '会員登録が完了しました（入店なし）'}</p>
          <p className="mt-4 text-[14px] text-white/80">会員番号</p>
          <p className="text-[72px] leading-none font-bold tracking-wider tabular-nums" data-testid="done-no">{m.memberNo}</p>
          <p className="mx-auto mt-5 inline-block rounded-full bg-white px-5 py-2 text-[17px] font-bold text-brand">用紙に会員番号を記入してください</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-5 text-left text-[14px] sm:grid-cols-4">
          <Item label="ハンドルネーム"><b className="text-[17px]">{m.handleName}</b></Item>
          <Item label="性別">{m.gender}</Item>
          <Item label="年齢">{m.birthday ? `${ageOn(m.birthday, m.joinedAt)}歳` : '—'}</Item>
          <Item label="入会日">{fmtDate(m.joinedAt)}</Item>
          <Item label="確認書類" className="col-span-2">{m.idDocs.join('・')}</Item>
          <Item label="来店のきっかけ">{m.referral || '—'}</Item>
          <Item label="規約">v{m.termsVersion} 確認済</Item>
        </dl>
      </section>

      {v && (
        <Card title="お会計（入店時）" action={<span className="text-[12px] text-sub">{fmtJaDate(v.businessDate)}・{PART_LABEL[v.dayPart]}・{fmtTime(v.checkedInAt)} 入店</span>}>
          <div className="divide-y divide-line">
            <MoneyRow label={`入場料（${v.category}）`} amount={v.entranceFee} note={partner ? `パートナー：${partner.memberNo} ${partner.handleName}` : undefined} />
            {v.joinFee > 0 && <MoneyRow label="入会金" amount={v.joinFee} note={v.note || undefined} />}
            {v.annualFee > 0 && <MoneyRow label="年会費" amount={v.annualFee} />}
            <div className="flex items-end justify-between py-3">
              <span className="text-[16px] font-bold">合計</span>
              <span className="text-[36px] leading-none font-bold tabular-nums">¥{v.entryTotal.toLocaleString('ja-JP')}</span>
            </div>
            {change != null && (
              <div className="flex items-end justify-between py-3 text-[15px]">
                <span>預かり金 <b className="tabular-nums">¥{paid!.toLocaleString('ja-JP')}</b></span>
                <span className="font-bold text-ok">おつり <span className="text-[28px] tabular-nums">¥{change.toLocaleString('ja-JP')}</span></span>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {!v && (
          <Link href={`/reception/new?partner=${m.id}`} className={cx(buttonCls('brand', 'lg'), 'h-16 text-[16px] sm:col-span-2')}>
            <Heart className="size-5" />続けてパートナーを新規入会（カップルで受付）
          </Link>
        )}
        <Link href="/reception/new" className={cx(buttonCls(v ? 'brand' : 'outline', 'lg'), 'h-16 text-[16px]')}><UserPlus className="size-5" />次の新規受付</Link>
        {v ? (
          <Link href={`/reception/order?visit=${v.id}`} className={cx(buttonCls('outline', 'lg'), 'h-16 text-[16px]')}><GlassWater className="size-5" />ドリンク注文</Link>
        ) : null}
        <Link href="/reception" className={cx(buttonCls('default', 'lg'), 'h-16 text-[16px]', !v && 'sm:col-span-1')}><House className="size-5" />受付トップへ戻る</Link>
      </div>
    </div>
  )
}

function Item({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[12px] text-sub">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}
