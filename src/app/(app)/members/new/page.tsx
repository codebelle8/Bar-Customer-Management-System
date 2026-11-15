import type { Metadata } from 'next'
import Link from 'next/link'
import { and, eq, like } from 'drizzle-orm'
import { ChevronLeft, FileSpreadsheet, Info, TriangleAlert } from 'lucide-react'
import { NewMemberForm } from '@/components/members/NewMemberForm'
import { normalizeMemberNo } from '@/components/members/rules'
import { Card, buttonCls } from '@/components/ui'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { jstParts } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'

export const metadata: Metadata = { title: '会員の手動登録' }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function NewMemberPage({ searchParams }: PageProps<'/members/new'>) {
  const sp = await searchParams
  const ctx = await requireCtx()
  const prefix = ctx.store.memberPrefix
  const initialNo = normalizeMemberNo(one(sp.no).slice(0, 30), prefix)

  const data = await query(async (tx) => {
    const [settings] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    // 次の自動採番（使用済みの番号は飛ばす：受付の新規入会と同じ考え方）
    const taken = new Set(
      (await tx.select({ no: t.members.memberNo }).from(t.members)
        .where(and(eq(t.members.storeId, ctx.storeId), like(t.members.memberNo, `${prefix.replace(/[\\%_]/g, (c) => '\\' + c)}%`))))
        .map((r) => r.no),
    )
    let n = settings.nextMemberNo
    while (taken.has(`${prefix}${n}`)) n++
    const suggestNo = `${prefix}${n}`
    const existing = initialNo
      ? (await tx.select({ id: t.members.id, no: t.members.memberNo, handle: t.members.handleName }).from(t.members)
          .where(and(eq(t.members.storeId, ctx.storeId), eq(t.members.memberNo, initialNo))))[0]
      : undefined
    return { settings, today: businessDateOf(new Date(), settings), suggestNo, existing }
  }, ctx)

  const todayJst = jstParts(new Date()).date
  const maxBirthday = `${+todayJst.slice(0, 4) - 20}${todayJst.slice(4)}`

  return (
    <div className="animate-fade-in mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/members" className={buttonCls('ghost', 'sm')}><ChevronLeft className="size-4" />会員一覧</Link>
        <span className="text-[18px] font-bold">会員の手動登録</span>
        <Link href="/members/import" className={buttonCls('outline', 'sm') + ' ml-auto'}><FileSpreadsheet className="size-4" />Excelでまとめて取込</Link>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-brand-light/60 bg-brand-soft/60 px-4 py-3 text-[13px] leading-relaxed">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" />
        <p>
          紙の会員カードをお持ちの<b>以前からの会員</b>を登録する画面です。カードの会員番号をそのまま入力してください（数字だけでも「{prefix}」が付きます）。
          初めてのお客様は、来店受付の「新規入会」から登録すると入会金の会計まで続けて行えます。
        </p>
      </div>

      {data.existing && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#f1d264] bg-[#fffbea] px-4 py-3 text-[13px]">
          <TriangleAlert className="size-5 text-[#b7791f]" />
          <span className="flex-1">会員番号 <b>{data.existing.no}</b> は既に登録されています（{data.existing.handle}）。</span>
          <Link href={`/members/${data.existing.id}`} className={buttonCls('default', 'sm')}>この会員を開く</Link>
        </div>
      )}

      <Card title="会員情報">
        <NewMemberForm
          prefix={prefix}
          suggestNo={data.suggestNo}
          initialNo={initialNo}
          joinDefault={data.today}
          todayJst={todayJst}
          maxBirthday={maxBirthday}
          termsVersion={data.settings.termsVersion}
        />
      </Card>
    </div>
  )
}
