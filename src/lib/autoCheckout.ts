// 自動退店（2026-11-21 お客様と確認）
// 退店処理をしないまま営業日の区切り（例 6:00）を過ぎた来店を、区切りの時刻で退店にする
// ・延長料金などは加えない（実際の退店時刻が分からないため）。入店時の料金と、滞在中に登録した注文は入店日の売上のまま
// ・画面を開いたとき（共通レイアウト・ダッシュボード・来店受付の画面と操作）に実行する。退店時刻は区切りの時刻で記録するため、実行が遅れても記録は同じ
import 'server-only'
import { and, eq, lt, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import * as t from '@/db/schema'
import type { StoreSettings } from '@/db/schema'
import { yen } from './format'
import { businessDateOf, businessDayEnd } from './pricing'

/** 前の営業日から入店中のままの来店を退店にし、その件数を返す */
export async function autoCheckout(
  tx: Tx, storeId: string, settings: Pick<StoreSettings, 'dayStart' | 'nightStart' | 'dayCutoff'>, now = new Date(),
): Promise<number> {
  const today = businessDateOf(now, settings)
  const stale = await tx
    .select({
      id: t.visits.id, businessDate: t.visits.businessDate, checkedInAt: t.visits.checkedInAt,
      memberNo: t.members.memberNo, handle: t.members.handleName,
      // 滞在中に登録した注文（退店時の精算と同じく、来店の追加分として記録する）
      items: sql<number>`(select coalesce(sum(${t.visitItems.amount}), 0) from ${t.visitItems} where ${t.visitItems.visitId} = ${t.visits.id})`.mapWith(Number),
    })
    .from(t.visits)
    .innerJoin(t.members, eq(t.members.id, t.visits.memberId))
    .where(and(eq(t.visits.storeId, storeId), eq(t.visits.status, 'in'), lt(t.visits.businessDate, today)))
  let done = 0
  for (const v of stale) {
    const end = businessDayEnd(v.businessDate, settings)
    const at = end < v.checkedInAt ? v.checkedInAt : end
    // 同時に開いた別の画面や、スタッフの退店処理と重なっても二重にならないよう、入店中のときだけ更新する
    const updated = await tx
      .update(t.visits)
      .set({ status: 'out', checkedOutAt: at, outStaffId: null, extraTotal: v.items, autoCheckout: true })
      .where(and(eq(t.visits.id, v.id), eq(t.visits.status, 'in')))
      .returning({ id: t.visits.id })
    if (!updated.length) continue
    done++
    await tx.insert(t.auditLogs).values({
      storeId, userId: null, userName: 'システム', action: '自動退店',
      target: `${v.memberNo} ${v.handle} ${v.businessDate}（営業日の区切り ${settings.dayCutoff} で退店・登録済みの注文 ${yen(v.items)}・延長料金なし）`,
    })
  }
  return done
}
