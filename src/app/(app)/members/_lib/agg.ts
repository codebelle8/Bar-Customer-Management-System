// 会員ごとの来店集計（会員一覧で使用）
import 'server-only'
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import * as t from '@/db/schema'

/**
 * 会員ID ごとの 累計来店回数・指定日以降の回数・最終来店日 のサブクエリ。
 * 本人としての来店とカップルの同伴者としての来店をそれぞれ 1 回と数える（取消は除く）。
 * 使い方：.leftJoin(agg, eq(agg.mid, t.members.id))
 */
export function memberVisitAgg(tx: Tx, storeId: string, since: string) {
  const flat = tx
    .select({
      mid: sql<string>`unnest(array[${t.visits.memberId}, ${t.visits.partnerMemberId}])`.as('mid'),
      d: sql<string>`${t.visits.businessDate}`.as('d'),
    })
    .from(t.visits)
    .where(and(eq(t.visits.storeId, storeId), ne(t.visits.status, 'void')))
    .as('flat')
  return tx
    .select({
      mid: flat.mid,
      total: sql<number>`count(*)`.as('total_visits'),
      month: sql<number>`count(*) filter (where ${flat.d} >= ${since}::date)`.as('month_visits'),
      last: sql<string>`max(${flat.d})`.as('last_visit'),
    })
    .from(flat)
    .where(isNotNull(flat.mid))
    .groupBy(flat.mid)
    .as('agg')
}
