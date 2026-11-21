import type { Metadata } from 'next'
import Link from 'next/link'
import { GlassWater, ReceiptText, Search, Sparkles, UserPlus, Users } from 'lucide-react'
import { Badge, Card, Empty, Td, Th, buttonCls, cx } from '@/components/ui'
import type { Category, DayPart } from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { fmtJaDate, fmtMD, yen } from '@/lib/format'
import { CATEGORIES, DAY_PARTS, DAY_TYPE_STYLE } from '@/lib/pricing'
import { GenderBadge, Notice } from './_components/bits'
import { elapsed } from './_lib/quote'
import { dailyRows } from '@/lib/stats'
import { inStoreRows, loadToday, PART_LABEL } from './_lib/server'

export const metadata: Metadata = { title: '来店受付' }

const TILES = [
  { href: '/reception/new', label: '新規入会・来店受付', sub: '規約署名・本人確認・会員登録', icon: UserPlus, cls: 'btn-brand' },
  { href: '/reception/checkin', label: '既存会員の来店受付', sub: '会員番号・ハンドルネームで検索', icon: Search, cls: 'btn-brand-soft' },
  { href: '/reception/checkout', label: '退店・追加精算', sub: '延長料金・ドリンクの精算', icon: ReceiptText, cls: 'tile-outline' },
  { href: '/reception/order', label: 'ドリンク注文', sub: '入店中のお客様の注文を登録', icon: GlassWater, cls: 'tile-outline' },
] as const

export default async function ReceptionPage({ searchParams }: PageProps<'/reception'>) {
  const sp = await searchParams
  const ctx = await requireCtx()
  const data = await query(async (tx) => {
    const today = await loadToday(tx, ctx.storeId)
    const rows = await inStoreRows(tx, ctx.storeId, today.businessDate, today.now)
    const [day] = await dailyRows(tx, ctx.storeId, today.businessDate, today.businessDate)
    return { today, rows, day }
  }, ctx)
  const { today, rows, day } = data
  const s = today.settings
  const style = DAY_TYPE_STYLE[today.day.type]
  const custom = today.day.customPrices
  const people = rows.reduce((a, r) => a + (r.category === 'カップル' ? 2 : 1), 0)
  const unpaid = rows.reduce((a, r) => a + r.unpaid, 0)
  const partHours: Record<DayPart, string> = { 昼: `${s.dayStart}〜${s.nightStart}`, 夜: `${s.nightStart}〜翌${s.dayCutoff}` }

  return (
    <div className="animate-fade-in space-y-5">
      {typeof sp.voided === 'string' && <Notice tone="ok">来店を取消しました：{sp.voided}</Notice>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {TILES.map(({ href, label, sub, icon: Icon, cls }) => (
          <Link key={href} href={href}
            className={cx(
              'flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl px-3 py-4 text-center transition active:scale-[0.99]',
              cls === 'tile-outline' ? 'card border-brand/30 text-brand hover:border-brand/60 hover:bg-brand-soft/40' : cls,
            )}>
            <Icon className="size-9" strokeWidth={1.8} />
            <span className="text-[17px] leading-tight font-bold">{label}</span>
            <span className={cx('text-[12px]', cls === 'tile-outline' ? 'text-sub' : 'text-white/85')}>{sub}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
        <Card title="本日の料金" action={<span className={cx('rounded-full px-3 py-1 text-[12px] font-bold', style.cell)}>{style.label}</span>}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[18px] font-bold">{fmtJaDate(today.businessDate)}</span>
            <span className="text-[12px] text-sub">営業日（{s.dayCutoff}までは前日扱い）</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-[13px] font-bold text-white">
              現在：{PART_LABEL[today.part]}（{partHours[today.part]}）
            </span>
            {today.day.label && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fff2bf] px-3 py-1 text-[13px] font-bold text-[#8a6a00]">
                <Sparkles className="size-3.5" />{today.day.label}
              </span>
            )}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="bg-[#f8f6fc]">
                  <Th className="w-24">区分</Th>
                  {DAY_PARTS.map((p) => (
                    <Th key={p} className={cx('text-right', p === today.part && 'bg-brand-soft text-brand')}>
                      {PART_LABEL[p]}{p === today.part && <span className="ml-1">●</span>}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {CATEGORIES.map((c) => (
                  <tr key={c} className="border-t border-line">
                    <Td><GenderBadge gender={c} /></Td>
                    {DAY_PARTS.map((p) => {
                      const isCustom = typeof custom?.[p]?.[c as Category] === 'number'
                      return (
                        <Td key={p} className={cx('text-right', p === today.part ? 'bg-brand-soft/40 text-[20px] font-bold' : 'text-[15px] text-sub')}>
                          {isCustom && <Badge tone="amber" className="mr-2 align-middle">特別料金</Badge>}
                          {yen(today.table[p][c])}
                        </Td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 grid gap-2 text-[13px] sm:grid-cols-3">
            <div className="rounded-lg bg-page px-3 py-2"><dt className="text-sub">入会金（新規）</dt><dd className="text-[15px] font-bold">{yen(s.joinFee)}</dd></div>
            <div className="rounded-lg bg-page px-3 py-2"><dt className="text-sub">年会費</dt><dd className="text-[15px] font-bold">{s.annualFeeEnabled ? yen(s.annualFee) : 'なし'}</dd></div>
            <div className="rounded-lg bg-page px-3 py-2">
              <dt className="text-sub">リピーター割引</dt>
              <dd className="text-[13px] font-bold">{s.discountEnabled ? `${s.discountGender}・前月${s.discountMinVisits}回以上 −${yen(s.discountAmount)}${s.discountScope === 'once' ? '（月1回）' : ''}` : 'なし'}</dd>
            </div>
          </dl>
        </Card>

        <Card title="入店状況">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="入店中" value={rows.length} unit="組" />
            <Stat label="人数" value={people} unit="名" />
            <Stat label="未精算の注文" value={yen(unpaid)} />
          </div>
          <h3 className="mt-5 mb-2 text-[13px] font-bold text-sub">本日（営業日）の受付</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-page px-4 py-3 text-[13px] sm:grid-cols-4 xl:grid-cols-2">
            <div><dt className="text-sub">来店</dt><dd className="text-[16px] font-bold tabular-nums">{day.people}名</dd></div>
            <div><dt className="text-sub">内訳</dt><dd className="font-bold tabular-nums">男{day.male}・女{day.female}・CP{day.cp}組</dd></div>
            <div><dt className="text-sub">新規入会</dt><dd className="text-[16px] font-bold tabular-nums">{day.newMembers}名</dd></div>
            <div><dt className="text-sub">入場料等</dt><dd className="text-[16px] font-bold tabular-nums">{yen(day.entrance)}</dd></div>
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-sub">
            退店時は「退店・精算」から延長料金・ドリンクを精算してください。追加がない場合も ¥0 で退店処理を行うと、入店中一覧から外れます。
            退店処理をしないまま営業日の区切り（{s.dayCutoff}）を過ぎた来店は、自動で退店になります（延長料金などは加算されません）。
          </p>
          {rows.some((r) => r.stale) && (
            <Notice tone="warn" className="mt-3">前営業日以前から入店中のままの来店があります。退店処理の漏れがないか確認してください。</Notice>
          )}
        </Card>
      </div>

      <Card title={<>入店中一覧<span className="ml-1 text-[14px] font-medium text-sub">（{rows.length}組）</span></>} bodyClass="px-2 pt-2 pb-3">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="bg-[#f8f6fc]">
                <tr><Th>入店</Th><Th>会員・区分</Th><Th className="text-right">入場時会計</Th><Th className="text-right">未精算</Th><Th className="text-right">操作</Th></tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <Td>
                      <div className="text-[16px] font-bold">{r.time}</div>
                      <div className="text-[11px] text-sub">{r.stale ? <span className="font-bold text-up">{fmtMD(r.businessDate)}から</span> : elapsed(r.minutes)}</div>
                    </Td>
                    <Td className="w-full max-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold text-brand">{r.memberNo}</span>
                        <GenderBadge gender={r.category} />
                        {r.isNew && <Badge tone="purple">新規</Badge>}
                      </div>
                      <div className="truncate text-[15px] font-bold">{r.handle}</div>
                      {r.partnerHandle && <div className="truncate text-[12px] text-sub">＋ {r.partnerNo} {r.partnerHandle}</div>}
                    </Td>
                    <Td className="text-right">{yen(r.entryTotal)}</Td>
                    <Td className="text-right">
                      <span className={cx('font-bold', r.unpaid ? 'text-up' : 'text-mute')}>{yen(r.unpaid)}</span>
                      {r.itemCount > 0 && <div className="text-[11px] text-sub">{r.itemCount}件</div>}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/reception/order?visit=${r.id}`} className={buttonCls('outline')}><GlassWater className="size-4" />ドリンク注文</Link>
                        <Link href={`/reception/checkout?visit=${r.id}`} className={buttonCls('brand')}><ReceiptText className="size-4" />退店・精算</Link>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            <Users className="mx-auto mb-2 size-8 text-line" />
            現在、入店中のお客様はいません
          </Empty>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-3 text-center">
      <div className="text-[12px] text-sub">{label}</div>
      <div className="mt-1 text-[26px] leading-none font-bold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-[13px]">{unit}</span>}
      </div>
    </div>
  )
}
