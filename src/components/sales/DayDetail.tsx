// 1日分の詳細（来店内訳・売上・品目・経費の入力）。オーナーの日別詳細とスタッフ画面で共通
import type { ReactNode } from 'react'
import { GlassWater, ReceiptText, Users } from 'lucide-react'
import type { DayData, DayEntry } from '@/app/(app)/sales/data'
import { Badge, Card, Td, Th, cx } from '@/components/ui'
import { fmtMD, jstParts, num, yen } from '@/lib/format'
import { discountParts } from '@/lib/u30'
import { DAY_TYPE_STYLE } from '@/lib/pricing'
import { KIND_LABEL, type ExpenseKind } from './constants'
import { DeleteExpenseButton, ExpenseForm } from './ExpenseForm'

const stamp = (d: Date) => {
  const p = jstParts(d)
  return `${fmtMD(p.date)} ${p.time}`
}

const KIND_TONE: Record<ExpenseKind, 'purple' | 'amber' | 'blue'> = { expense: 'purple', tax: 'amber', parttime: 'blue' }

/** 料金区分のバッジ（平日・週末・祝日・イベント） */
export function DayTypeBadge({ info }: { info: DayData['info'] }) {
  const st = DAY_TYPE_STYLE[info.type]
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-ink', st.cell)}>
      <span className={cx('size-2 rounded-full', st.dot)} />
      {info.type}
      {info.label && <span className="font-medium text-sub">・{info.label}</span>}
    </span>
  )
}

function Stat({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cx('rounded-xl border px-3 py-2.5', strong ? 'border-brand/30 bg-brand-soft' : 'border-line bg-white')}>
      <div className="text-[11px] font-medium text-sub">{label}</div>
      <div className={cx('mt-0.5 font-bold tabular-nums', strong ? 'text-[20px] text-brand' : 'text-[17px]')}>{value}</div>
    </div>
  )
}

/** 来店・売上（部×区分の内訳）とドリンク等の品目 */
export function DaySummary({ data }: { data: DayData }) {
  const r = data.row
  const cell = (part: '昼' | '夜', cat: '男性' | '女性' | 'カップル') => data.breakdown.find((b) => b.part === part && b.cat === cat)
  const fresh = data.breakdown.reduce((a, b) => a + b.fresh, 0)
  const discount = data.breakdown.reduce((a, b) => a + b.discount, 0)
  const u30Discount = data.breakdown.reduce((a, b) => a + b.u30Discount, 0)
  const parts = [
    { part: '昼' as const, label: '昼の部', people: r.maleDay + r.femaleDay + r.cpDay * 2, entrance: r.entranceDay, drink: r.drinkDay, sales: r.salesDay },
    { part: '夜' as const, label: '夜の部', people: r.maleNight + r.femaleNight + r.cpNight * 2, entrance: r.entranceNight, drink: r.drinkNight, sales: r.salesNight },
  ]
  const drinkTotal = data.items.reduce((a, b) => a + b.amount, 0)
  return (
    <>
      <Card title={<span className="flex items-center gap-2"><Users className="size-4 text-brand" />来店・売上</span>}
        action={<span className="flex items-center gap-1.5">{fresh > 0 && <Badge tone="purple">新規 {fresh}名</Badge>}{data.inside > 0 && <Badge tone="blue">入店中 {data.inside}組</Badge>}</span>}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="総売上" value={yen(r.total)} strong />
          <Stat label="昼売上" value={yen(r.salesDay)} />
          <Stat label="夜売上" value={yen(r.salesNight)} />
          <Stat label="入場料" value={yen(r.entrance)} />
          <Stat label="ドリンク" value={yen(r.drinkTotal)} />
          <Stat label="計人数" value={<>{num(r.people)}<span className="ml-0.5 text-[12px]">名</span></>} />
        </div>
        <div className="-mx-1 mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line">
                <Th className="px-2">部</Th>
                <Th className="px-2 text-right text-info">男性</Th>
                <Th className="px-2 text-right text-[#c8457e]">女性</Th>
                <Th className="px-2 text-right text-brand">カップル</Th>
                <Th className="px-2 text-right">人数</Th>
                <Th className="px-2 text-right">売上</Th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {parts.map((p) => (
                <tr key={p.part} className="border-b border-line align-top">
                  <Td className="px-2 font-medium">{p.label}</Td>
                  {(['男性', '女性', 'カップル'] as const).map((c) => {
                    const b = cell(p.part, c)
                    return (
                      <Td key={c} className="px-2 text-right">
                        <div className="font-bold">{b?.cnt ?? 0}<span className="ml-0.5 text-[11px] font-medium text-sub">{c === 'カップル' ? '組' : '名'}</span></div>
                        <div className="text-[11px] text-sub">{yen(b?.fee ?? 0)}</div>
                      </Td>
                    )
                  })}
                  <Td className="px-2 text-right font-bold">{p.people}名</Td>
                  <Td className="px-2 text-right">
                    <div className="font-bold">{yen(p.sales)}</div>
                    <div className="text-[11px] text-sub">入場料 {num(p.entrance)}・ドリンク {num(p.drink)}</div>
                  </Td>
                </tr>
              ))}
              <tr className="bg-[#faf8fd] font-bold">
                <Td className="px-2">合計</Td>
                <Td className="px-2 text-right">{r.male}名</Td>
                <Td className="px-2 text-right">{r.female}名</Td>
                <Td className="px-2 text-right">{r.cp}組</Td>
                <Td className="px-2 text-right">{r.people}名</Td>
                <Td className="px-2 text-right">{yen(r.total)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-mute">
          区分ごとの金額は入場時の会計（入場料・割引後＋入会金等）。売上の入場料には延長料金を含みます。
          {discount > 0 && <>割引 −{yen(discount)}（{discountParts(discount, u30Discount)}）。</>}
        </p>
      </Card>

      <Card title={<span className="flex items-center gap-2"><GlassWater className="size-4 text-brand" />ドリンク・追加料金</span>}
        action={<span className="text-[13px] text-sub">合計 <b className="text-ink tabular-nums">{yen(drinkTotal)}</b></span>}>
        {data.items.length ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line"><Th className="px-2">品目</Th><Th className="px-2 text-right">昼</Th><Th className="px-2 text-right">夜</Th><Th className="px-2 text-right">金額</Th></tr></thead>
              <tbody className="tabular-nums">
                {data.items.map((it) => (
                  <tr key={`${it.kind}|${it.name}`} className="border-b border-line last:border-0">
                    <Td className="max-w-56 truncate px-2">{it.name}{it.kind === 'extension' && <Badge tone="amber" className="ml-1.5">延長</Badge>}{it.kind === 'other' && <Badge className="ml-1.5">その他</Badge>}</Td>
                    <Td className="px-2 text-right">{it.qtyDay || <span className="text-mute">—</span>}</Td>
                    <Td className="px-2 text-right">{it.qtyNight || <span className="text-mute">—</span>}</Td>
                    <Td className="px-2 text-right font-medium">{yen(it.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="py-4 text-center text-[13px] text-mute">この日の注文はありません</p>}
      </Card>
    </>
  )
}

/** 経費・税金・アルバイトの入力と一覧 */
export function ExpensePanel({ data, canDelete, showNames }: { data: DayData; canDelete: (e: DayEntry) => boolean; showNames: boolean }) {
  const sums = (['expense', 'tax', 'parttime'] as const).map((k) => ({ k, v: data.entries.filter((e) => e.kind === k).reduce((a, b) => a + b.amount, 0) }))
  return (
    <Card title={<span className="flex items-center gap-2"><ReceiptText className="size-4 text-brand" />経費・税金・アルバイト</span>}>
      <ExpenseForm date={data.date} />
      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sub">
          <span className="font-bold text-ink">この日の入力（{data.entries.length}件）</span>
          {sums.map(({ k, v }) => <span key={k}>{KIND_LABEL[k]} <b className="text-ink tabular-nums">{yen(v)}</b></span>)}
        </div>
        {data.entries.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {data.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                <Badge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{e.name || <span className="text-mute">（内容なし）</span>}</div>
                  <div className="text-[11px] text-mute">
                    登録 {stamp(e.createdAt)}・{e.staffName ?? (showNames ? '—' : 'ほかのスタッフ')}
                  </div>
                </div>
                <div className="text-[15px] font-bold tabular-nums">{yen(e.amount)}</div>
                {canDelete(e) ? <DeleteExpenseButton id={e.id} label={`${KIND_LABEL[e.kind]} ${e.name || ''} ${yen(e.amount)}`.replace(/\s+/g, ' ')} /> : <span className="size-9" aria-hidden />}
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl border border-dashed border-line py-5 text-center text-[13px] text-mute">まだ入力はありません</p>}
      </div>
    </Card>
  )
}
