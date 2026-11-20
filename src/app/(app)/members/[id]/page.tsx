import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Ban, CalendarCheck, ChevronLeft, CircleCheck, Gift, Receipt, ShieldAlert, Sparkles, UserCheck, Wallet } from 'lucide-react'
import { selectStore } from '@/app/actions'
import { EditMemberForm } from '@/components/members/EditMemberForm'
import { Pager } from '@/components/members/Pager'
import { STATUS_LABEL, STATUS_TONE } from '@/components/members/rules'
import { StatusActions } from '@/components/members/StatusActions'
import { Badge, Card, Empty, Td, Th, buttonCls, cx } from '@/components/ui'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { addDays, addMonths, ageOn, diffDays, fmtDate, fmtDateTime, fmtJaMonth, fmtTime, jstParts, num, WEEK_JA, weekdayOf, yen } from '@/lib/format'
import { businessDateOf, DAY_TYPE_STYLE } from '@/lib/pricing'
import { visitCounts } from '@/lib/stats'

export const metadata: Metadata = { title: '会員詳細' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HISTORY_SIZE = 20
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function MemberDetailPage({ params, searchParams }: PageProps<'/members/[id]'>) {
  const { id } = await params
  const sp = await searchParams
  if (!UUID.test(id)) notFound()
  const vpIn = Math.max(1, Math.floor(Number(one(sp.vp)) || 1))
  const ctx = await requireCtx()

  const data = await query(async (tx) => {
    // スタッフは RLS により他店舗の会員が見えない（見つからなければ 404）
    const [m] = await tx.select().from(t.members).where(eq(t.members.id, id))
    if (!m) return null
    if (m.storeId !== ctx.storeId) return { other: m.storeId } as const

    const [settings] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    const today = businessDateOf(new Date(), settings)
    const month = today.slice(0, 7)
    const monthStart = `${month}-01`
    const prevStart = `${addMonths(month, -1)}-01`
    const thisMonth = (await visitCounts(tx, ctx.storeId, monthStart, today, [id])).get(id) ?? 0
    const lastMonth = (await visitCounts(tx, ctx.storeId, prevStart, addDays(monthStart, -1), [id])).get(id) ?? 0

    const mine = and(eq(t.visits.storeId, ctx.storeId), or(eq(t.visits.memberId, id), eq(t.visits.partnerMemberId, id)))
    const [agg] = await tx
      .select({
        visits: sql<number>`count(*)`.mapWith(Number),
        last: sql<string | null>`max(${t.visits.businessDate})::text`,
        entry: sql<number>`coalesce(sum(${t.visits.entryTotal}), 0)`.mapWith(Number),
      })
      .from(t.visits)
      .where(and(mine, ne(t.visits.status, 'void')))
    const [items] = await tx
      .select({ amount: sql<number>`coalesce(sum(${t.visitItems.amount}), 0)`.mapWith(Number) })
      .from(t.visitItems)
      .innerJoin(t.visits, eq(t.visits.id, t.visitItems.visitId))
      .where(and(mine, ne(t.visits.status, 'void')))

    // 来店履歴（取消も含めて表示）
    const [{ n }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(t.visits).where(mine)
    const vpages = Math.max(1, Math.ceil(n / HISTORY_SIZE))
    const vp = Math.min(vpIn, vpages)
    const other = alias(t.members, 'other')
    const history = await tx
      .select({ v: t.visits, otherId: other.id, otherNo: other.memberNo, otherHandle: other.handleName })
      .from(t.visits)
      .leftJoin(other, sql`${other.id} = case when ${t.visits.memberId} = ${id} then ${t.visits.partnerMemberId} else ${t.visits.memberId} end`)
      .where(mine)
      .orderBy(desc(t.visits.businessDate), desc(t.visits.checkedInAt))
      .limit(HISTORY_SIZE)
      .offset((vp - 1) * HISTORY_SIZE)
    const ids = history.map((h) => h.v.id)
    const itemRows = ids.length
      ? await tx.select().from(t.visitItems).where(inArray(t.visitItems.visitId, ids)).orderBy(t.visitItems.createdAt)
      : []
    const itemsByVisit = new Map<string, t.VisitItem[]>()
    for (const it of itemRows) itemsByVisit.set(it.visitId, [...(itemsByVisit.get(it.visitId) ?? []), it])

    return {
      m, settings, today, month, thisMonth, lastMonth, n, vp, vpages, history, itemsByVisit,
      stats: { visits: agg.visits, last: agg.last, spent: agg.entry + items.amount },
    }
  }, ctx)

  if (!data) notFound()
  if ('other' in data) {
    const store = ctx.stores.find((s) => s.id === data.other)
    return (
      <Card title="別の店舗の会員です" className="animate-fade-in max-w-xl">
        <p className="text-[14px] text-sub">この会員は「{store?.name ?? '別の店舗'}」に登録されています。表示するには店舗を切り替えてください。</p>
        <form action={selectStore} className="mt-4 flex gap-2">
          <input type="hidden" name="storeId" value={data.other} />
          <input type="hidden" name="back" value={`/members/${id}`} />
          <button className={buttonCls('brand')}>{store?.name ?? '店舗'}に切り替えて表示</button>
          <Link href="/members" className={buttonCls('default')}>会員一覧へ</Link>
        </form>
      </Card>
    )
  }

  const { m, settings, today, month, thisMonth, lastMonth, stats } = data
  const label = `${m.memberNo} ${m.handleName}`
  const age = m.birthday ? ageOn(m.birthday, jstParts(new Date()).date) : null
  const avg = stats.visits ? Math.round(stats.spent / stats.visits) : 0
  const discountTarget = settings.discountEnabled && m.gender === settings.discountGender
  const eligible = discountTarget && thisMonth >= settings.discountMinVisits
  const appliedNow = discountTarget && lastMonth >= settings.discountMinVisits
  const nextMonth = addMonths(month, 1)
  const created = one(sp.created) === '1'

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/members" className={buttonCls('ghost', 'sm')}><ChevronLeft className="size-4" />会員一覧</Link>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-[20px] font-bold tabular-nums">{m.memberNo}</span>
          <span className="truncate text-[20px] font-bold">{m.handleName}</span>
          <Badge tone={STATUS_TONE[m.status]} className="text-[12px]">{STATUS_LABEL[m.status]}</Badge>
        </div>
        <div className="ml-auto">
          {m.status === 'active' ? (
            <Link href={`/reception/checkin?q=${encodeURIComponent(m.memberNo)}`} className={buttonCls('brand', 'lg')}><UserCheck className="size-5" />この会員の来店受付</Link>
          ) : (
            <span className="inline-flex h-12 items-center gap-1.5 rounded-lg border border-[#f2c2cb] bg-[#fff4f6] px-5 text-[14px] font-bold text-up">
              <Ban className="size-4" />{m.status === 'banned' ? '入店不可（出入禁止）' : '入店不可（退会済み）'}
            </span>
          )}
        </div>
      </div>

      {created && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#bfe8cf] bg-[#effaf3] px-5 py-4">
          <CircleCheck className="size-6 text-ok" />
          <div className="flex-1">
            <p className="text-[15px] font-bold text-ok">会員 {m.memberNo}（{m.handleName}）を登録しました</p>
            <p className="text-[12px] text-sub">ご来店中であれば、このまま来店受付に進めます。</p>
          </div>
          {m.status === 'active' && (
            <Link href={`/reception/checkin?q=${encodeURIComponent(m.memberNo)}`} className={buttonCls('brand', 'lg')}><UserCheck className="size-5" />来店受付へ進む</Link>
          )}
        </div>
      )}

      {m.status === 'banned' && (
        <div role="alert" className="flex items-start gap-4 rounded-xl border-2 border-up bg-[#fff4f6] px-5 py-4">
          <ShieldAlert className="mt-0.5 size-8 shrink-0 text-up" />
          <div>
            <p className="text-[17px] font-bold text-up">出入禁止の会員です。受付で入店をお断りしてください。</p>
            <p className="mt-1 text-[14px] text-ink"><span className="font-bold">理由：</span>{m.banReason || '（理由の記録なし）'}</p>
            {m.bannedAt && <p className="mt-0.5 text-[12px] text-sub">登録日時：{fmtDateTime(m.bannedAt)}</p>}
          </div>
        </div>
      )}
      {m.status === 'withdrawn' && (
        <div className="rounded-xl border border-line bg-[#f0eef4] px-5 py-3 text-[14px] text-sub">退会済みの会員です。受付では入店できません。</div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_1.35fr]">
        <Card title="プロフィール">
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 text-[14px] [&>dd]:border-b [&>dd]:border-line [&>dd]:py-2.5 [&>dt]:border-b [&>dt]:border-line [&>dt]:py-2.5">
            <dt className="text-sub">会員番号</dt><dd className="font-bold tabular-nums">{m.memberNo}</dd>
            <dt className="text-sub">ハンドルネーム</dt>
            <dd className="font-bold">{m.handleName}{m.kana && <span className="ml-2 text-[12px] font-medium text-sub">{m.kana}</span>}</dd>
            <dt className="text-sub">本名</dt><dd>{m.realName || <span className="text-mute">—</span>}</dd>
            <dt className="text-sub">性別</dt><dd><span className={m.gender === '男性' ? 'text-info' : 'text-[#c8457e]'}>{m.gender}</span></dd>
            <dt className="text-sub">生年月日</dt>
            <dd>{m.birthday ? <>{fmtDate(m.birthday)}<span className="ml-2 font-bold">{age}歳</span></> : <span className="text-mute">未登録</span>}</dd>
            <dt className="text-sub">入会日</dt>
            <dd>{fmtDate(m.joinedAt)}<span className="ml-2 text-[12px] text-sub">{memberFor(diffDays(today, m.joinedAt))}</span></dd>
            <dt className="text-sub">紹介元</dt><dd>{m.referral || <span className="text-mute">—</span>}</dd>
            <dt className="text-sub">本人確認書類</dt>
            <dd>
              {m.idDocs.length ? (
                <span className="flex flex-wrap gap-1.5">{m.idDocs.map((d) => <Badge key={d} tone="purple">{d}</Badge>)}</span>
              ) : <span className="text-[13px] text-mute">未記録（次回来店時に確認）</span>}
            </dd>
            <dt className="text-sub">会員規約</dt>
            <dd>
              {m.termsVersion ? (
                <>{m.termsVersion === '紙' ? '紙の規約に署名' : `第${m.termsVersion}版に同意`}
                  {m.termsSignedAt && <span className="ml-2 text-[12px] text-sub">{fmtDate(jstParts(m.termsSignedAt).date)}</span>}</>
              ) : <span className="text-mute">未確認</span>}
            </dd>
            {settings.annualFeeEnabled && (
              <>
                <dt className="text-sub">年会費の期限</dt>
                <dd>
                  {m.feeExpiresAt ? (
                    <>{fmtDate(m.feeExpiresAt)}
                      {m.feeExpiresAt < today ? <Badge tone="red" className="ml-2">期限切れ</Badge> : m.feeExpiresAt <= addDays(today, 14) ? <Badge tone="amber" className="ml-2">期限間近</Badge> : null}</>
                  ) : <span className="text-mute">未設定</span>}
                </dd>
              </>
            )}
            <dt className="text-sub">ステータス</dt><dd><Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge></dd>
          </dl>
          <div className="mt-4">
            <p className="mb-1.5 text-[12px] font-medium text-sub">メモ</p>
            {m.memo ? (
              <p className="rounded-lg border border-[#f1d264] bg-[#fffbea] px-3 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">{m.memo}</p>
            ) : <p className="rounded-lg bg-page px-3 py-2.5 text-[13px] text-mute">メモはありません</p>}
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="来店・利用状況">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat icon={<CalendarCheck className="size-4" />} label="累計来店" value={num(stats.visits)} unit="回" />
              <Stat icon={<CalendarCheck className="size-4" />} label={`今月（${+month.slice(5)}月）`} value={num(thisMonth)} unit="回" accent />
              <Stat icon={<CalendarCheck className="size-4" />} label={`先月（${+addMonths(month, -1).slice(5)}月）`} value={num(lastMonth)} unit="回" />
              <Stat icon={<Sparkles className="size-4" />} label="最終来店" value={stats.last ? fmtDate(stats.last).slice(5) : '—'}
                sub={stats.last ? `${stats.last.slice(0, 4)}年・${diffDays(today, stats.last) <= 0 ? '本日' : `${diffDays(today, stats.last)}日前`}` : '来店記録なし'} />
              <Stat icon={<Wallet className="size-4" />} label="累計利用額" value={yen(stats.spent)} sub="入場料＋追加（取消を除く）" />
              <Stat icon={<Receipt className="size-4" />} label="平均利用額" value={yen(avg)} sub="1来店あたり" />
            </div>
            <p className="mt-2 text-[11px] text-mute">※ 来店回数はカップルの同伴者としての来店を含みます。カップル来店の利用額は1組分の会計額です。</p>
          </Card>

          <Card title="リピーター割引">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={cx('rounded-xl border px-4 py-3', eligible ? 'border-[#bfe8cf] bg-[#effaf3]' : 'border-line')}>
                <p className="flex items-center gap-1.5 text-[13px] font-bold"><Gift className="size-4 text-brand" />翌月割引（{fmtJaMonth(nextMonth)}）</p>
                {!settings.discountEnabled ? (
                  <p className="mt-2 text-[13px] text-sub">リピーター割引は現在使われていません。</p>
                ) : !discountTarget ? (
                  <p className="mt-2 text-[13px] text-sub">対象外（{settings.discountGender}の会員が対象）</p>
                ) : eligible ? (
                  <>
                    <p className="mt-1.5 text-[20px] font-bold text-ok">対象</p>
                    <p className="text-[12px] text-sub">今月{thisMonth}回来店・翌月の入場料から{yen(settings.discountAmount)}引き{settings.discountScope === 'once' ? '（月1回）' : ''}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 text-[15px] font-bold">あと<span className="mx-0.5 text-[20px] text-brand">{settings.discountMinVisits - thisMonth}</span>回で対象</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-soft">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#6d35c9]" style={{ width: `${Math.min(100, (thisMonth / settings.discountMinVisits) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-[12px] text-sub">今月{thisMonth}回 / {settings.discountMinVisits}回以上で翌月{yen(settings.discountAmount)}引き</p>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-line px-4 py-3">
                <p className="text-[13px] font-bold">今月の割引（前月の来店で判定）</p>
                {discountTarget ? (
                  appliedNow ? (
                    <><p className="mt-1.5 text-[20px] font-bold text-brand">適用中</p><p className="text-[12px] text-sub">先月{lastMonth}回来店のため、今月の入場料から{yen(settings.discountAmount)}引き</p></>
                  ) : (
                    <><p className="mt-1.5 text-[20px] font-bold text-mute">なし</p><p className="text-[12px] text-sub">先月の来店 {lastMonth}回（{settings.discountMinVisits}回以上で適用）</p></>
                  )
                ) : <p className="mt-2 text-[13px] text-sub">対象外</p>}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div id="history" className="scroll-mt-24">
      <Card title={`来店履歴（${num(data.n)}件）`} bodyClass="px-2 pt-2 pb-3">
        {data.history.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-[#f8f6fc]">
                  <tr>
                    <Th>営業日</Th><Th className="hidden xl:table-cell">部</Th><Th className="hidden xl:table-cell">料金区分</Th><Th>区分</Th><Th className="hidden text-right xl:table-cell">入場料</Th><Th className="hidden text-right xl:table-cell">割引</Th>
                    <Th className="hidden text-right xl:table-cell">入会金・年会費</Th><Th className="text-right xl:hidden">入店時<span className="block text-[10px] font-normal">入場料・割引・入会金</span></Th>
                    <Th>追加<span className="hidden xl:inline">（延長・ドリンク）</span></Th><Th className="text-right">合計</Th><Th className="hidden xl:table-cell">状態</Th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.history.map(({ v, otherId, otherNo, otherHandle }) => {
                    const its = data.itemsByVisit.get(v.id) ?? []
                    const extra = its.reduce((a, i) => a + i.amount, 0)
                    const isPartner = v.partnerMemberId === m.id
                    return (
                      <tr key={v.id} className={cx('border-t border-line align-top', v.status === 'void' && 'text-mute [&_td]:line-through')}>
                        <Td>
                          <span className="font-medium">{fmtDate(v.businessDate)}</span>
                          <span className={cx('ml-1', weekdayOf(v.businessDate) === 0 && 'text-up', weekdayOf(v.businessDate) === 6 && 'text-info')}>({WEEK_JA[weekdayOf(v.businessDate)]})</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-sub">
                            {fmtTime(v.checkedInAt)}{v.checkedOutAt ? `–${fmtTime(v.checkedOutAt)}` : ''}
                            <span className="inline-flex items-center gap-1 xl:hidden">・{v.dayPart}<span className={cx('ml-1 size-2 rounded-full', DAY_TYPE_STYLE[v.dayType]?.dot)} />{v.dayType}</span>
                          </span>
                        </Td>
                        <Td className="hidden xl:table-cell">{v.dayPart === '昼' ? '昼の部' : '夜の部'}</Td>
                        <Td className="hidden xl:table-cell"><span className="inline-flex items-center gap-1.5"><span className={cx('size-2.5 rounded-full', DAY_TYPE_STYLE[v.dayType]?.dot)} />{v.dayType}</span></Td>
                        <Td className="max-w-36 whitespace-normal xl:max-w-none">
                          {v.category === 'カップル' ? (
                            <span>カップル{v.isNew && <Badge tone="purple" className="ml-1.5">入会</Badge>}
                              {otherId && <span className="mt-0.5 block text-[11px] text-sub">{isPartner ? '代表：' : '同伴：'}<Link href={`/members/${otherId}`} className="text-brand hover:underline">{otherHandle}（{otherNo}）</Link></span>}
                            </span>
                          ) : <>{v.category}{v.isNew && <Badge tone="purple" className="ml-1.5">入会</Badge>}</>}
                        </Td>
                        <Td className="hidden text-right xl:table-cell">{yen(v.entranceFee)}</Td>
                        <Td className="hidden text-right xl:table-cell">{v.discount ? <span className="text-up" title={v.discountReason}>−{yen(v.discount)}</span> : '—'}</Td>
                        <Td className="hidden text-right xl:table-cell">{v.joinFee + v.annualFee ? yen(v.joinFee + v.annualFee) : '—'}</Td>
                        <Td className="text-right xl:hidden">
                          <span className="font-medium">{yen(v.entryTotal)}</span>
                          {(v.discount > 0 || v.joinFee + v.annualFee > 0) && (
                            <span className="mt-0.5 block text-[11px] text-sub">
                              入場{yen(v.entranceFee)}
                              {v.discount > 0 && <span className="text-up"> −{yen(v.discount)}</span>}
                              {v.joinFee + v.annualFee > 0 && <> ＋入会{yen(v.joinFee + v.annualFee)}</>}
                            </span>
                          )}
                        </Td>
                        <Td className="max-w-32 whitespace-normal xl:max-w-72">
                          {its.length ? (
                            <>
                              <span className="font-medium">{yen(extra)}</span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-sub">
                                {its.map((i) => `${i.name}${i.qty > 1 ? `×${i.qty}` : ''}`).join('・')}
                              </span>
                            </>
                          ) : '—'}
                        </Td>
                        <Td className="text-right font-bold">
                          {yen(v.entryTotal + extra)}
                          <span className="mt-1 block xl:hidden"><VisitBadge status={v.status} /></span>
                        </Td>
                        <Td className="hidden xl:table-cell"><VisitBadge status={v.status} /></Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pager className="mt-3" page={data.vp} pages={data.vpages} hrefFor={(p) => `/members/${m.id}${p > 1 ? `?vp=${p}` : ''}#history`} />
          </>
        ) : <Empty>来店記録はまだありません</Empty>}
      </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card title="会員情報の編集">
          <EditMemberForm
            m={{ id: m.id, memberNo: m.memberNo, handleName: m.handleName, kana: m.kana, realName: m.realName, gender: m.gender, birthday: m.birthday, referral: m.referral, memo: m.memo, idDocs: m.idDocs, feeExpiresAt: m.feeExpiresAt }}
            isOwner={ctx.isOwner} feeOn={settings.annualFeeEnabled} today={jstParts(new Date()).date} />
        </Card>
        <Card title="ステータス" className="order-first self-start xl:order-none">
          <div className="mb-4 flex items-center gap-2 text-[13px] text-sub">現在：<Badge tone={STATUS_TONE[m.status]} className="text-[12px]">{STATUS_LABEL[m.status]}</Badge></div>
          <StatusActions key={m.status} id={m.id} status={m.status} isOwner={ctx.isOwner} label={label} />
          <p className="mt-4 text-[11px] leading-relaxed text-mute">ステータスの変更はすべて操作ログに記録されます。</p>
        </Card>
      </div>
    </div>
  )
}

function VisitBadge({ status }: { status: 'in' | 'out' | 'void' }) {
  return status === 'in' ? <Badge tone="blue">入店中</Badge> : status === 'out' ? <Badge tone="green">精算済</Badge> : <Badge tone="gray">取消</Badge>
}

function memberFor(days: number) {
  if (days < 1) return '（本日入会）'
  if (days < 31) return `（入会${days}日）`
  const months = Math.floor(days / 30.44)
  return months < 12 ? `（在籍${months}か月）` : `（在籍${Math.floor(months / 12)}年${months % 12 ? `${months % 12}か月` : ''}）`
}

function Stat({ icon, label, value, unit, sub, accent }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cx('rounded-xl border px-4 py-3', accent ? 'border-brand-light bg-brand-soft/60' : 'border-line')}>
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-sub"><span className="text-brand">{icon}</span>{label}</p>
      <p className="mt-1 flex items-end gap-0.5"><span className="text-[22px] leading-tight font-bold tabular-nums">{value}</span>{unit && <span className="pb-0.5 text-[13px] font-bold">{unit}</span>}</p>
      {sub && <p className="mt-0.5 text-[11px] text-mute">{sub}</p>}
    </div>
  )
}
