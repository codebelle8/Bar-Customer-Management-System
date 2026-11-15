// 会員データの書き出し（Excel）。個人情報をまとめて持ち出せるためオーナーのみ・操作ログに記録
import * as XLSX from 'xlsx'
import { asc, eq, sql } from 'drizzle-orm'
import * as t from '@/db/schema'
import { STATUS_LABEL } from '@/components/members/rules'
import { audit, query, requireOwner } from '@/lib/dal'
import { ageOn, jstParts } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'
import { memberVisitAgg } from '../_lib/agg'

export async function GET() {
  const ctx = await requireOwner()
  const { rows, feeOn, today } = await query(async (tx) => {
    const [settings] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    const today = businessDateOf(new Date(), settings)
    const agg = memberVisitAgg(tx, ctx.storeId, `${today.slice(0, 7)}-01`)
    const rows = await tx
      .select({
        m: t.members,
        total: sql<number>`coalesce(${agg.total}, 0)`.mapWith(Number),
        month: sql<number>`coalesce(${agg.month}, 0)`.mapWith(Number),
        last: sql<string | null>`${agg.last}::text`,
      })
      .from(t.members)
      .leftJoin(agg, eq(agg.mid, t.members.id))
      .where(eq(t.members.storeId, ctx.storeId))
      .orderBy(asc(sql`length(${t.members.memberNo})`), asc(t.members.memberNo))
    await audit(tx, ctx, '会員データ書き出し', `${ctx.store.name}・${rows.length}件`)
    return { rows, feeOn: settings.annualFeeEnabled, today }
  }, ctx)

  const now = jstParts(new Date()).date
  const header = ['会員番号', 'ハンドルネーム', '性別', '生年月日', '年齢', '入会日', '紹介元', '本人確認書類', '会員規約', 'ステータス', '出入禁止の理由',
    ...(feeOn ? ['年会費期限'] : []), '来店回数（累計）', '来店回数（今月）', '最終来店', 'メモ']
  const aoa = rows.map(({ m, total, month, last }) => [
    m.memberNo, m.handleName, m.gender, m.birthday ?? '', m.birthday ? ageOn(m.birthday, now) : '', m.joinedAt, m.referral, m.idDocs.join('・'),
    m.termsVersion, STATUS_LABEL[m.status], m.banReason, ...(feeOn ? [m.feeExpiresAt ?? ''] : []), total, month, last ?? '', m.memo,
  ])
  const ws = XLSX.utils.aoa_to_sheet([header, ...aoa])
  ws['!cols'] = header.map((h) => ({ wch: h === 'メモ' || h === '出入禁止の理由' ? 36 : h === '本人確認書類' ? 24 : Math.max(10, h.length * 2) }))
  ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '会員一覧')
  const body = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const name = `会員一覧_${ctx.store.shortName}_${today.replaceAll('-', '')}.xlsx`
  return new Response(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="members.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  })
}
