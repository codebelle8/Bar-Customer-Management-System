import type { Metadata } from 'next'
import Link from 'next/link'
import { asc, eq } from 'drizzle-orm'
import { CalendarDays, ChevronRight, Clock, Info, MousePointerClick, Plus, Trash2 } from 'lucide-react'
import { CalendarLegend, PriceCalendar } from '@/components/PriceCalendar'
import { Badge, Card, Empty, Field, Input, Select, Td, Th, buttonCls, cx } from '@/components/ui'
import { ActionForm, FormMessage, SubmitButton } from '@/components/settings/form'
import { NoteBox, Switch, Tabs, YenInput } from '@/components/settings/fields'
import * as t from '@/db/schema'
import type { CalendarDay, Category, DayPart, DayType, MenuItem, PriceRule, StoreSettings } from '@/db/schema'
import { loadPricing, query, requireOwner } from '@/lib/dal'
import { fmtJaDate, monthDates, WEEK_JA, yen } from '@/lib/format'
import { businessDateOf, CATEGORIES, DAY_PARTS, DAY_TYPE_STYLE, DAY_TYPES, dayInfo, holidayName, priceOf, type DayInfo } from '@/lib/pricing'
import { saveCalendarDay, saveHours, saveMenuItem, savePriceRules } from './actions'
import { DayFields, type PriceTable } from './DayFields'
import { ScrollIntoView } from './ScrollIntoView'

export const metadata: Metadata = { title: '料金設定・カレンダー' }

const TABS = [
  { key: 'table', label: '料金表・営業時間' },
  { key: 'calendar', label: '料金カレンダー' },
  { key: 'menu', label: 'ドリンク・延長メニュー' },
] as const
type TabKey = (typeof TABS)[number]['key']

const ym = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) ? s : null)
const ymd = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)
const CAT_TONE: Record<Category, string> = { 男性: 'text-info', 女性: 'text-[#c8457e]', カップル: 'text-brand' }
const PART_LABEL: Record<DayPart, string> = { 昼: '昼の部', 夜: '夜の部' }

function priceTable(rules: PriceRule[]): PriceTable {
  const out = {} as PriceTable
  for (const dt of DAY_TYPES) {
    out[dt] = {} as PriceTable[DayType]
    for (const dp of DAY_PARTS) {
      out[dt][dp] = {} as Record<Category, number>
      for (const c of CATEGORIES) out[dt][dp][c] = rules.find((r) => r.dayType === dt && r.dayPart === dp && r.category === c)?.price ?? 0
    }
  }
  return out
}

export default async function PricingPage({ searchParams }: PageProps<'/pricing'>) {
  const ctx = await requireOwner()
  const sp = await searchParams
  const tab: TabKey = TABS.some((x) => x.key === sp.tab) ? (sp.tab as TabKey) : 'table'
  const data = await query(async (tx) => {
    const p = await loadPricing(tx, ctx.storeId)
    const menu = await tx.select().from(t.menuItems).where(eq(t.menuItems.storeId, ctx.storeId)).orderBy(asc(t.menuItems.sort), asc(t.menuItems.name))
    return { ...p, menu, today: businessDateOf(new Date(), p.settings) }
  }, ctx)

  return (
    <div key={ctx.storeId} className="animate-fade-in space-y-5">
      <Tabs items={TABS} current={tab} hrefFor={(k) => (k === 'table' ? '/pricing' : `/pricing?tab=${k}`)} />
      <p className="flex items-center gap-2 text-[13px] text-sub">
        <Info className="size-4 text-brand" />
        対象店舗：<b className="text-ink">{ctx.store.name}</b>（上部の店舗切り替えで変更できます）
      </p>
      {tab === 'table' && <TableTab settings={data.settings} rules={data.rules} overrides={data.overrides} today={data.today} />}
      {tab === 'calendar' && (
        <CalendarTab
          settings={data.settings} rules={data.rules} overrides={data.overrides} today={data.today}
          date={ymd(sp.date)} month={ym(sp.month) ?? ymd(sp.date)?.slice(0, 7) ?? data.today.slice(0, 7)}
        />
      )}
      {tab === 'menu' && <MenuTab menu={data.menu} />}
    </div>
  )
}

/* ------------------------------ 料金表・営業時間 ------------------------------ */

function TableTab({ settings, rules, overrides, today }: { settings: StoreSettings; rules: PriceRule[]; overrides: Map<string, CalendarDay>; today: string }) {
  const table = priceTable(rules)
  const di = dayInfo(today, settings, overrides)
  const partRange: Record<DayPart, string> = { 昼: `${settings.dayStart}〜${settings.nightStart}`, 夜: `${settings.nightStart}〜` }
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <Card title="料金表（入場料）" action={<Badge tone="amber">仮の料金</Badge>}>
        <NoteBox className="mb-4">
          現在の料金は仮の金額です。<b>正式な料金表を受領後に更新してください。</b>
        </NoteBox>
        <ActionForm action={savePriceRules} message="none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <Th className="w-28">料金区分</Th>
                  <Th className="w-24">時間帯</Th>
                  {CATEGORIES.map((c) => <Th key={c} className={cx('text-[13px] font-bold', CAT_TONE[c])}>{c}{c === 'カップル' && <span className="ml-1 text-[11px] font-normal text-mute">（1組）</span>}</Th>)}
                </tr>
              </thead>
              <tbody>
                {DAY_TYPES.map((dt) =>
                  DAY_PARTS.map((dp, i) => (
                    <tr key={`${dt}${dp}`} className={cx(i === 1 ? 'border-b border-line last:border-0' : '')}>
                      {i === 0 && (
                        <td rowSpan={2} className="px-3 py-2 align-middle">
                          <span className={cx('inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-bold whitespace-nowrap', dt === '平日' ? 'bg-[#efeaf9]' : DAY_TYPE_STYLE[dt].cell)}>
                            <span className={cx('size-2.5 rounded-full', DAY_TYPE_STYLE[dt].dot)} />{dt}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className="block font-medium">{PART_LABEL[dp]}</span>
                        <span className="block text-[11px] leading-tight text-mute tabular-nums">{partRange[dp]}</span>
                      </td>
                      {CATEGORIES.map((c) => (
                        <td key={c} className="px-2 py-1.5">
                          <YenInput name={`p_${dt}_${dp}_${c}`} defaultValue={table[dt][dp][c]} required aria-label={`${dt}・${PART_LABEL[dp]}・${c}`} className="min-w-[84px]" />
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <SubmitButton size="lg">料金表を保存</SubmitButton>
            <p className="text-[12px] text-sub">カップルは2名1組の料金です。祝日・イベント日の判定は「料金カレンダー」で確認できます。</p>
          </div>
          <FormMessage className="mt-3" />
        </ActionForm>
      </Card>

      <div className="space-y-5">
        <Card title="本日の料金" action={<span className="text-[12px] text-sub">{fmtJaDate(today)}</span>}>
          <DayPriceTable day={di} rules={rules} />
        </Card>
        <Card title="営業時間・曜日区分">
          <HoursForm settings={settings} />
        </Card>
      </div>
    </div>
  )
}

/** 指定日の実際の料金（個別料金を反映） */
function DayPriceTable({ day, rules }: { day: DayInfo; rules: PriceRule[] }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold', day.type === '平日' ? 'bg-[#efeaf9]' : DAY_TYPE_STYLE[day.type].cell)}>
          <span className={cx('size-2 rounded-full', DAY_TYPE_STYLE[day.type].dot)} />{DAY_TYPE_STYLE[day.type].label}
        </span>
        {day.label && <span className="font-medium">{day.label}</span>}
        {day.override && <Badge tone="purple">個別設定</Badge>}
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line"><Th className="pl-0" />{CATEGORIES.map((c) => <Th key={c} className={cx('text-right', CAT_TONE[c])}>{c}</Th>)}</tr>
        </thead>
        <tbody className="tabular-nums">
          {DAY_PARTS.map((p) => (
            <tr key={p} className="border-b border-line last:border-0">
              <Td className="pl-0 font-medium">{PART_LABEL[p]}</Td>
              {CATEGORIES.map((c) => {
                const custom = typeof day.customPrices?.[p]?.[c] === 'number'
                return (
                  <Td key={c} className="text-right">
                    <span className={cx('text-[15px] font-bold', custom && 'text-brand')}>{yen(priceOf(c, p, day, rules))}</span>
                    {custom && <span className="mt-0.5 block text-[10px] font-medium text-brand">個別料金</span>}
                  </Td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HoursForm({ settings }: { settings: StoreSettings }) {
  return (
    <ActionForm action={saveHours} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="昼の部 開始"><Input type="time" name="dayStart" defaultValue={settings.dayStart} required /></Field>
        <Field label="夜の部 開始"><Input type="time" name="nightStart" defaultValue={settings.nightStart} required /></Field>
        <Field label="営業日の区切り"><Input type="time" name="dayCutoff" defaultValue={settings.dayCutoff} required /></Field>
      </div>
      <p className="flex gap-2 rounded-lg bg-page px-3 py-2 text-[12px] leading-relaxed text-sub">
        <Clock className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>昼の部は {settings.dayStart}〜{settings.nightStart}、それ以外（深夜を含む）は夜の部です。{settings.dayCutoff} より前の来店・売上は前日の営業日として集計します。</span>
      </p>
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-sub">週末料金の曜日</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_JA.map((w, i) => (
            <label key={w} className="cursor-pointer">
              <input type="checkbox" name="weekendDays" value={i} defaultChecked={settings.weekendDays.includes(i)} className="peer sr-only" />
              <span className={cx(
                'flex size-10 items-center justify-center rounded-full border border-line bg-white text-[14px] font-bold transition select-none peer-checked:border-[#f6b6cb] peer-checked:bg-[#fde3ec] peer-focus-visible:ring-2 peer-focus-visible:ring-brand/30',
                i === 0 && 'text-up', i === 6 && 'text-info',
              )}>{w}</span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-mute">選んだ曜日は「週末料金」になります（祝日・カレンダーの個別設定が優先）。</p>
      </div>
      <SubmitButton>営業時間を保存</SubmitButton>
    </ActionForm>
  )
}

/* ------------------------------ 料金カレンダー ------------------------------ */

function CalendarTab({ settings, rules, overrides, today, month, date }: {
  settings: StoreSettings; rules: PriceRule[]; overrides: Map<string, CalendarDay>; today: string; month: string; date: string | null
}) {
  const days = monthDates(month).map((d) => dayInfo(d, settings, overrides))
  const monthOverrides = [...overrides.values()].filter((o) => o.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date))
  const holidays = days.filter((d) => holidayName(d.date))
  const href = (m: string, d?: string) => `/pricing?tab=calendar&month=${m}${d ? `&date=${d}` : ''}`
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr]">
      <Card className="xl:col-start-1" title="料金カレンダー" action={<span className="flex items-center gap-1.5 text-[12px] text-sub"><MousePointerClick className="size-4" />日付をクリックして設定</span>}>
        {/* 選択中の日付を枠で強調（共通カレンダーのリンクに合わせて指定） */}
        {date && <style>{`.pc-select a[href$="date=${date}"]{box-shadow:inset 0 0 0 3px #6d35c9;z-index:1}`}</style>}
        <div className="pc-select">
          <PriceCalendar month={month} days={days} today={today} hrefFor={(m) => href(m)} dayHref={(d) => href(month, d)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <CalendarLegend className="flex flex-wrap gap-x-5 gap-y-2 space-y-0" />
          <span className="flex items-center gap-1.5 text-[12px] text-sub"><span className="size-1.5 rounded-full bg-brand" />個別料金あり</span>
        </div>
      </Card>

      <div id="day-panel" className="scroll-mt-24 xl:sticky xl:top-24 xl:col-start-2 xl:row-span-2 xl:row-start-1">
        {date ? (
          <>
            <ScrollIntoView key={date} targetId="day-panel" />
            <DayPanel date={date} settings={settings} rules={rules} overrides={overrides} />
          </>
        ) : (
          <Card title="日付の設定">
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand"><CalendarDays className="size-7" /></span>
              <p className="text-[14px] font-medium">カレンダーの日付を選択してください</p>
              <p className="max-w-72 text-[12px] leading-relaxed text-sub">イベント日の料金区分・ラベル・個別料金を設定できます。連日のイベントは終了日を指定してまとめて設定できます。</p>
              <Link href={href(month, today.startsWith(month) ? today : `${month}-01`)} className={cx(buttonCls('outline'), 'mt-2')}>
                {today.startsWith(month) ? '本日を選択' : `${+month.slice(5, 7)}月1日を選択`}
              </Link>
            </div>
          </Card>
        )}
      </div>

      <Card className="xl:col-start-1" title={`${+month.slice(5, 7)}月の個別設定・祝日`}>
        {monthOverrides.length || holidays.length ? (
          <ul className="divide-y divide-line">
            {[...monthOverrides.map((o) => ({ date: o.date, o })), ...holidays.filter((h) => !overrides.has(h.date)).map((h) => ({ date: h.date, o: null }))]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(({ date: d, o }) => {
                const type: DayType = o?.dayType ?? '祝日'
                return (
                  <li key={d}>
                    <Link href={href(month, d)} className={cx('flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-page', d === date && 'bg-brand-soft/60')}>
                      <span className="w-32 shrink-0 text-[13px] font-medium tabular-nums">{fmtJaDate(d).slice(5)}</span>
                      <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold', type === '平日' ? 'bg-[#efeaf9]' : DAY_TYPE_STYLE[type].cell)}>
                        <span className={cx('size-2 rounded-full', DAY_TYPE_STYLE[type].dot)} />{type}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{o ? o.label || '—' : holidayName(d)}</span>
                      {o?.customPrices && <Badge tone="purple">個別料金</Badge>}
                      {!o && <span className="text-[11px] text-mute">自動</span>}
                      <ChevronRight className="size-4 shrink-0 text-mute" />
                    </Link>
                  </li>
                )
              })}
          </ul>
        ) : <Empty>この月の個別設定・祝日はありません</Empty>}
      </Card>

    </div>
  )
}

function DayPanel({ date, settings, rules, overrides }: { date: string; settings: StoreSettings; rules: PriceRule[]; overrides: Map<string, CalendarDay> }) {
  const info = dayInfo(date, settings, overrides)
  const auto = dayInfo(date, settings, new Map())
  const holiday = holidayName(date)
  const o = overrides.get(date) ?? null
  return (
    <Card title={fmtJaDate(date)} action={o ? <Badge tone="purple">個別設定あり</Badge> : <Badge tone="gray">自動判定</Badge>}>
      {holiday && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-lg bg-[#fdecef] px-3 py-1.5 text-[13px] font-medium text-up">
          <span className="size-2 rounded-full bg-[#e98d9c]" />祝日：{holiday}
        </p>
      )}
      <div className="rounded-xl border border-line bg-[#fcfbfe] p-4">
        <p className="mb-2 text-[12px] font-bold text-sub">この日の料金（現在の設定）</p>
        <DayPriceTable day={info} rules={rules} />
      </div>
      <h3 className="section-title mt-5 mb-3 text-[15px]">設定を変更</h3>
      <ActionForm action={saveCalendarDay} key={date}>
        <DayFields
          key={JSON.stringify(o)}
          date={date}
          override={o && { dayType: o.dayType, label: o.label, customPrices: o.customPrices }}
          autoType={auto.type}
          autoLabel={auto.label}
          table={priceTable(rules)}
        />
      </ActionForm>
    </Card>
  )
}

/* ------------------------------ ドリンク・延長メニュー ------------------------------ */

const KIND_LABEL: Record<MenuItem['kind'], string> = { extension: '延長', drink: 'ドリンク', other: 'その他' }
const KIND_ORDER: MenuItem['kind'][] = ['extension', 'drink', 'other']

function KindSelect({ value }: { value?: MenuItem['kind'] }) {
  return (
    <Select name="kind" defaultValue={value ?? 'drink'} aria-label="種類" required>
      {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
    </Select>
  )
}

function MenuTab({ menu }: { menu: MenuItem[] }) {
  const nextSort = menu.reduce((a, m) => Math.max(a, m.sort), -1) + 1
  const grid = 'grid items-center gap-2 md:grid-cols-[96px_minmax(0,1fr)_120px_64px_52px_88px]'
  return (
    <div className="space-y-5">
      <Card title="メニューを追加">
        <ActionForm action={saveMenuItem} resetOnSuccess message="none">
          <div className="grid items-end gap-3 sm:grid-cols-2 md:grid-cols-[120px_minmax(0,1fr)_150px_96px_auto]">
            <Field label="種類"><KindSelect /></Field>
            <Field label="メニュー名" required><Input name="name" maxLength={40} placeholder="例：ハイボール" required /></Field>
            <Field label="金額" required><YenInput name="price" required /></Field>
            <Field label="並び順"><Input type="number" name="sort" defaultValue={nextSort} min={0} max={9999} className="tabular-nums" /></Field>
            <SubmitButton size="md" pendingText="追加中…" className="h-10"><Plus className="size-4" />追加</SubmitButton>
          </div>
          <FormMessage className="mt-3" />
        </ActionForm>
      </Card>

      <Card title="メニュー一覧" action={<span className="text-[12px] text-sub">{menu.length}件</span>}>
        <p className="mb-4 text-[12px] leading-relaxed text-sub">
          退店・追加精算やドリンク注文で選べるメニューです。「表示」をオフにすると選択肢に出なくなります（過去の売上記録はそのまま残ります）。
        </p>
        {menu.length ? (
          <div className="space-y-5">
            {KIND_ORDER.filter((k) => menu.some((m) => m.kind === k)).map((k) => (
              <section key={k}>
                <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold">
                  <Badge tone={k === 'extension' ? 'blue' : k === 'drink' ? 'purple' : 'gray'}>{KIND_LABEL[k]}</Badge>
                  <span className="text-[12px] font-normal text-mute">{menu.filter((m) => m.kind === k).length}件</span>
                </h3>
                <div className={cx(grid, 'hidden border-b border-line px-2 pb-1.5 text-[12px] font-medium text-sub md:grid')}>
                  <span>種類</span><span>メニュー名</span><span>金額</span><span>並び順</span><span>表示</span><span />
                </div>
                <div className="divide-y divide-line">
                  {menu.filter((m) => m.kind === k).map((m) => (
                    <ActionForm key={m.id} action={saveMenuItem} message="none" className={cx('px-2 py-2', !m.active && 'bg-page/70')}>
                      <input type="hidden" name="id" value={m.id} />
                      <div className={grid}>
                        <KindSelect value={m.kind} />
                        <Input name="name" defaultValue={m.name} maxLength={40} required aria-label="メニュー名" className={cx(!m.active && 'text-mute')} />
                        <YenInput name="price" defaultValue={m.price} required aria-label="金額" />
                        <Input type="number" name="sort" defaultValue={m.sort} min={0} max={9999} aria-label="並び順" className="tabular-nums" />
                        <Switch name="active" defaultChecked={m.active} ariaLabel={`${m.name}を表示`} />
                        <div className="flex gap-1.5">
                          <SubmitButton size="sm" variant="outline" pendingText="…">保存</SubmitButton>
                          <button type="submit" name="intent" value="delete" data-confirm={`「${m.name}」を削除しますか？（過去の売上記録は残ります）`}
                            className={buttonCls('ghost', 'sm')} aria-label={`${m.name}を削除`} title="削除">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                      <FormMessage className="mt-2" />
                    </ActionForm>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : <Empty>メニューが登録されていません</Empty>}
      </Card>
    </div>
  )
}
