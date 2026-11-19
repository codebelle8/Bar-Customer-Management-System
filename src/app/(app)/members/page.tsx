import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { and, asc, desc, eq, ilike, isNotNull, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { Ban, CalendarClock, ChevronRight, FileSpreadsheet, Search, UserPlus, Users, X } from 'lucide-react'
import { AutoSubmitSelect } from '@/components/members/AutoSubmitSelect'
import { Pager } from '@/components/members/Pager'
import { PAGE_SIZE, STATUS_LABEL, STATUS_TONE, kanaVariants, norm, type MemberStatus } from '@/components/members/rules'
import { Badge, Card, Empty, Td, Th, buttonCls, cx, inputCls } from '@/components/ui'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { addDays, ageOn, diffDays, fmtDate, num } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'
import { memberVisitAgg } from './_lib/agg'

export const metadata: Metadata = { title: '会員管理' }

const SORTS = { no_desc: '会員番号（新しい順）', no: '会員番号（古い順）', last: '最終来店が新しい順', visits: '来店回数が多い順' } as const
type SortKey = keyof typeof SORTS
const STATUSES: MemberStatus[] = ['active', 'banned', 'withdrawn']

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function MembersPage({ searchParams }: PageProps<'/members'>) {
  const sp = await searchParams
  const q = norm(one(sp.q)).slice(0, 40)
  const status = STATUSES.find((s) => s === one(sp.status)) ?? null
  const gender = (['男性', '女性'] as const).find((g) => g === one(sp.g)) ?? null
  const sort: SortKey = one(sp.sort) in SORTS ? (one(sp.sort) as SortKey) : 'no_desc'
  const pageIn = Math.max(1, Math.floor(Number(one(sp.page)) || 1))
  const ctx = await requireCtx()

  const data = await query(async (tx) => {
    const [settings] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    const today = businessDateOf(new Date(), settings)
    const monthStart = `${today.slice(0, 7)}-01`
    const feeOn = settings.annualFeeEnabled
    const feeDue = feeOn && one(sp.fee) === 'due'
    const feeLimit = addDays(today, 14)

    const [summary] = await tx
      .select({
        active: sql<number>`count(*) filter (where ${t.members.status} = 'active')`.mapWith(Number),
        banned: sql<number>`count(*) filter (where ${t.members.status} = 'banned')`.mapWith(Number),
        withdrawn: sql<number>`count(*) filter (where ${t.members.status} = 'withdrawn')`.mapWith(Number),
        fresh: sql<number>`count(*) filter (where ${t.members.joinedAt} >= ${monthStart}::date)`.mapWith(Number),
        due: sql<number>`count(*) filter (where ${t.members.status} <> 'withdrawn' and ${t.members.feeExpiresAt} <= ${feeLimit}::date)`.mapWith(Number),
      })
      .from(t.members)
      .where(eq(t.members.storeId, ctx.storeId))

    const conds: (SQL | undefined)[] = [eq(t.members.storeId, ctx.storeId)]
    if (status) conds.push(eq(t.members.status, status))
    if (gender) conds.push(eq(t.members.gender, gender))
    if (feeDue) conds.push(ne(t.members.status, 'withdrawn'), isNotNull(t.members.feeExpiresAt), lte(t.members.feeExpiresAt, feeLimit))
    if (q) {
      const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      // 会員番号は部分一致（接頭辞の有無を問わない）、ハンドルネームはひらがな・カタカナを区別しない
      const digits = q.match(/^[a-z]*-?(\d+)$/i)?.[1]
      conds.push(
        or(
          ilike(t.members.memberNo, like(q)),
          digits ? ilike(t.members.memberNo, like(digits)) : undefined,
          ...kanaVariants(q).map((v) => ilike(t.members.handleName, like(v))),
        ),
      )
    }
    const where = and(...conds)
    const [{ total }] = await tx.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(t.members).where(where)
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(pageIn, pages)

    const agg = memberVisitAgg(tx, ctx.storeId, monthStart)
    const totalV = sql`coalesce(${agg.total}, 0)`
    const byNo = (dir: typeof asc) => [dir(sql`length(${t.members.memberNo})`), dir(t.members.memberNo)]
    const order =
      sort === 'no' ? byNo(asc)
      : sort === 'last' ? [sql`${agg.last} desc nulls last`, ...byNo(desc)]
      : sort === 'visits' ? [desc(totalV), desc(sql`coalesce(${agg.month}, 0)`), ...byNo(asc)]
      : byNo(desc)

    const rows = await tx
      .select({
        id: t.members.id, memberNo: t.members.memberNo, handleName: t.members.handleName, gender: t.members.gender,
        birthday: t.members.birthday, joinedAt: t.members.joinedAt, status: t.members.status, feeExpiresAt: t.members.feeExpiresAt,
        total: sql<number>`${totalV}`.mapWith(Number),
        month: sql<number>`coalesce(${agg.month}, 0)`.mapWith(Number),
        last: sql<string | null>`${agg.last}::text`,
      })
      .from(t.members)
      .leftJoin(agg, eq(agg.mid, t.members.id))
      .where(where)
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)

    return { today, feeOn, feeDue, feeLimit, summary, total, pages, page, rows }
  }, ctx)

  const { today, feeOn, feeDue, feeLimit, summary, total, pages, page, rows } = data
  const params = { q, status: status ?? '', g: gender ?? '', sort: sort === 'no_desc' ? '' : sort, fee: feeDue ? 'due' : '' }
  const href = (patch: Partial<typeof params & { page: string }>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...params, page: '', ...patch })) if (v) u.set(k, v)
    const s = u.toString()
    return s ? `/members?${s}` : '/members'
  }
  const filtered = !!(q || status || gender || feeDue)
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-stretch gap-3">
        <SummaryChip href={href({ status: 'active', page: '' })} icon={<Users className="size-5" />} label="会員数" value={summary.active} sub={summary.withdrawn ? `退会 ${num(summary.withdrawn)}名を除く` : '有効な会員'} />
        <SummaryChip icon={<UserPlus className="size-5" />} label="今月の新規" value={summary.fresh} sub={`${+today.slice(5, 7)}月の入会`} />
        <SummaryChip href={href({ status: 'banned', page: '' })} icon={<Ban className="size-5" />} label="出入禁止" value={summary.banned} sub="受付で入店をお断り" tone="red" />
        {feeOn && (
          <SummaryChip href={href({ fee: 'due', page: '' })} icon={<CalendarClock className="size-5" />} label="年会費の期限" value={summary.due} sub="14日以内・期限切れ" tone="amber" />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2 self-center">
          <Link href="/members/import" className={buttonCls('outline', 'lg')}><FileSpreadsheet className="size-5" />Excelで取込</Link>
          <Link href="/members/new" className={buttonCls('brand', 'lg')}><UserPlus className="size-5" />会員を追加</Link>
        </div>
      </div>

      <Card bodyClass="p-0">
        <div className="space-y-3 border-b border-line px-5 py-4">
          <form action="/members" className="flex flex-wrap items-center gap-2">
            {status && <input type="hidden" name="status" value={status} />}
            {feeDue && <input type="hidden" name="fee" value="due" />}
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" />
              <input name="q" defaultValue={q} placeholder="会員番号・ハンドルネームで検索" className={cx(inputCls, 'h-11 pl-9')} aria-label="会員を検索" />
            </div>
            <div className="w-28 shrink-0">
              <AutoSubmitSelect name="g" defaultValue={gender ?? ''} className="h-11" aria-label="性別">
                <option value="">性別：全て</option>
                <option value="男性">男性</option>
                <option value="女性">女性</option>
              </AutoSubmitSelect>
            </div>
            <div className="w-44 shrink-0 xl:w-52">
              <AutoSubmitSelect name="sort" defaultValue={sort} className="h-11" aria-label="並び順">
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </AutoSubmitSelect>
            </div>
            <button className={cx(buttonCls('brand', 'md'), 'h-11 px-5')}><Search className="size-4" />検索</button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line bg-page p-0.5" role="tablist" aria-label="ステータス">
              {[{ k: '', label: 'すべて' }, ...STATUSES.map((s) => ({ k: s, label: STATUS_LABEL[s] }))].map((x) => (
                <Link key={x.k || 'all'} href={href({ status: x.k })} role="tab" aria-selected={(status ?? '') === x.k}
                  className={cx('rounded-md px-4 py-1.5 text-[13px] font-medium transition', (status ?? '') === x.k ? 'bg-white text-brand shadow-sm' : 'text-sub hover:text-ink')}>
                  {x.label}
                </Link>
              ))}
            </div>
            {feeOn && (
              <Link href={href({ fee: feeDue ? '' : 'due' })}
                className={cx('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition', feeDue ? 'border-[#f1d264] bg-[#fff3d6] text-[#b7791f]' : 'border-line text-sub hover:text-ink')}>
                <CalendarClock className="size-4" />年会費の期限が近い会員
              </Link>
            )}
            {filtered && (
              <Link href={href({ q: '', status: '', g: '', fee: '' })} className="flex items-center gap-1 px-2 text-[13px] text-sub hover:text-brand"><X className="size-4" />条件をクリア</Link>
            )}
            <span className="ml-auto text-[13px] text-sub">
              {total ? <><b className="text-ink">{num(total)}</b>件中 {num(from)}〜{num(from + rows.length - 1)}件</> : '0件'}
            </span>
          </div>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#f8f6fc]">
                <tr>
                  <Th>会員番号</Th><Th>ハンドルネーム</Th><Th>性別</Th><Th className="text-right">年齢</Th><Th className="hidden xl:table-cell">入会日</Th>
                  <Th className="text-right">来店回数<span className="block text-[10px] font-normal xl:inline xl:text-[12px]">（累計・今月）</span></Th><Th>最終来店</Th><Th>ステータス</Th><Th />
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((m) => {
                  const feeState = feeOn && m.status !== 'withdrawn' && m.feeExpiresAt && m.feeExpiresAt <= feeLimit ? (m.feeExpiresAt < today ? '年会費切れ' : '年会費期限間近') : null
                  return (
                    <tr key={m.id} className={cx('border-t border-line transition hover:bg-[#faf8fe]', m.status === 'withdrawn' && 'text-sub')}>
                      <Td><Link href={`/members/${m.id}`} className="font-bold hover:text-brand">{m.memberNo}</Link></Td>
                      <Td className="max-w-48 truncate"><Link href={`/members/${m.id}`} className="font-medium hover:text-brand">{m.handleName}</Link></Td>
                      <Td><span className={m.gender === '男性' ? 'text-info' : 'text-[#c8457e]'}>{m.gender}</span></Td>
                      <Td className="text-right">{m.birthday ? `${ageOn(m.birthday, today)}歳` : <span className="text-mute">—</span>}</Td>
                      <Td className="hidden xl:table-cell">{fmtDate(m.joinedAt)}</Td>
                      <Td className="text-right">
                        <b className="text-[14px]">{num(m.total)}</b><span className="text-sub">回</span>
                        <span className={cx('ml-1.5 inline-block rounded-md px-1.5 py-0.5 text-[12px]', m.month ? 'bg-brand-soft font-bold text-brand' : 'text-mute')}>今月 {m.month}</span>
                      </Td>
                      <Td>
                        {m.last ? <>{fmtDate(m.last)}<span className="ml-1 text-[11px] text-mute">{lastLabel(diffDays(today, m.last))}</span></> : <span className="text-mute">来店なし</span>}
                      </Td>
                      <Td>
                        <span className="flex items-center gap-1">
                          <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                          {feeState && <Badge tone={feeState === '年会費切れ' ? 'red' : 'amber'}>{feeState}</Badge>}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <Link href={`/members/${m.id}`} className={buttonCls('ghost', 'sm')} aria-label={`${m.memberNo} の詳細`}><span className="hidden xl:inline">詳細</span><ChevronRight className="size-4" /></Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {filtered ? '条件に一致する会員はいません' : 'まだ会員が登録されていません'}
            {q && /\d/.test(q) && (
              <span className="mt-4 block">
                <Link href={`/members/new?no=${encodeURIComponent(q)}`} className={buttonCls('outline')}><UserPlus className="size-4" />この番号（{q}）で会員を登録</Link>
              </span>
            )}
            {!filtered && (
              <span className="mt-2 block text-[12px]">
                紙の会員カードからの移行は、1件ずつの登録か Excel の一括取込で行えます。
                <span className="mt-4 flex justify-center gap-2">
                  <Link href="/members/import" className={buttonCls('outline', 'lg')}><FileSpreadsheet className="size-5" />Excelで取込</Link>
                  <Link href="/members/new" className={buttonCls('brand', 'lg')}><UserPlus className="size-5" />会員を追加</Link>
                </span>
              </span>
            )}
          </Empty>
        )}
        {pages > 1 && (
          <div className="border-t border-line px-5 py-4">
            <Pager page={page} pages={pages} hrefFor={(p) => href({ page: p > 1 ? String(p) : '' })} />
          </div>
        )}
      </Card>
    </div>
  )
}

function lastLabel(days: number) {
  if (days <= 0) return '（本日）'
  if (days < 31) return `（${days}日前）`
  if (days < 365) return `（${Math.floor(days / 30)}か月前）`
  return `（${Math.floor(days / 365)}年以上前）`
}

function SummaryChip({ icon, label, value, sub, href, tone = 'brand' }: { icon: ReactNode; label: string; value: number; sub: string; href?: string; tone?: 'brand' | 'red' | 'amber' }) {
  const color = tone === 'red' ? 'text-up bg-[#fde7eb]' : tone === 'amber' ? 'text-[#b7791f] bg-[#fff3d6]' : 'text-brand bg-brand-soft'
  const body = (
    <>
      <span className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl', color)}>{icon}</span>
      <span>
        <span className="block text-[12px] font-medium text-sub">{label}</span>
        <span className="block leading-tight"><b className="text-[24px] tabular-nums">{num(value)}</b><span className="ml-0.5 text-[13px] font-bold">名</span></span>
        <span className="block text-[11px] text-mute">{sub}</span>
      </span>
    </>
  )
  const cls = 'card flex min-w-44 items-center gap-3 px-4 py-3'
  return href ? <Link href={href} className={cx(cls, 'transition hover:border-brand-light')}>{body}</Link> : <div className={cls}>{body}</div>
}
