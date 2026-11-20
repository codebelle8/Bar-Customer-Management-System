import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { and, count, eq, lte, ne } from 'drizzle-orm'
import { ConfirmHost } from '@/components/confirm'
import { Sidebar, Topbar, type Notice } from '@/components/shell'
import * as t from '@/db/schema'
import { query, requireCtx } from '@/lib/dal'
import { addDays, fmtJaDate } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'
import { ROLE_LABEL } from '@/lib/roles'
import { THEME_COOKIE, parseThemePref } from '@/lib/theme'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx()
  const themePref = parseThemePref((await cookies()).get(THEME_COOKIE)?.value)
  const { today, notices } = await query(async (tx) => {
    const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    const today = businessDateOf(new Date(), s)
    const notices: Notice[] = []
    const [{ inside }] = await tx
      .select({ inside: count() })
      .from(t.visits)
      .where(and(eq(t.visits.storeId, ctx.storeId), eq(t.visits.status, 'in')))
    if (inside) notices.push({ text: `入店中のお客様：${inside}組（退店時に追加精算があれば入力してください）`, href: '/reception' })
    if (s.annualFeeEnabled) {
      const [{ due }] = await tx
        .select({ due: count() })
        .from(t.members)
        .where(and(eq(t.members.storeId, ctx.storeId), ne(t.members.status, 'withdrawn'), lte(t.members.feeExpiresAt, addDays(today, 14))))
      if (due) notices.push({ text: `年会費の期限が近い・切れている会員：${due}名`, href: '/members?fee=due' })
    }
    return { today, notices }
  }, ctx)
  return (
    <div className="flex min-h-screen">
      <Sidebar isOwner={ctx.isOwner} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          isOwner={ctx.isOwner}
          canSwitchStore={ctx.allStores}
          stores={ctx.stores.map((s) => ({ id: s.id, name: s.name, status: s.status }))}
          storeId={ctx.storeId}
          storeName={ctx.store.name}
          userName={ctx.user.name}
          roleLabel={ROLE_LABEL[ctx.user.role]}
          dateLabel={fmtJaDate(today)}
          notices={notices}
          themePref={themePref}
        />
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
      <ConfirmHost />
    </div>
  )
}
