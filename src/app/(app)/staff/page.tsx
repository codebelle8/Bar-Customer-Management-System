import type { Metadata } from 'next'
import { asc } from 'drizzle-orm'
import { ShieldCheck } from 'lucide-react'
import { Card, Empty, Th } from '@/components/ui'
import * as t from '@/db/schema'
import { query, requireOwner } from '@/lib/dal'
import { fmtDateTime } from '@/lib/format'
import { CreateStaffForm, StaffRow, type StaffRowData } from './StaffForms'

export const metadata: Metadata = { title: 'スタッフ管理' }

/** 今年の日時は年を省略（一覧を狭い画面でも収める） */
function shortDateTime(d: Date) {
  const s = fmtDateTime(d)
  return s.startsWith(fmtDateTime(new Date()).slice(0, 5)) ? s.slice(5) : s
}

export default async function StaffPage() {
  const ctx = await requireOwner()
  const users = await query(
    (tx) =>
      tx
        .select({
          id: t.users.id, name: t.users.name, loginId: t.users.loginId, role: t.users.role, storeId: t.users.storeId,
          active: t.users.active, lastLoginAt: t.users.lastLoginAt, createdAt: t.users.createdAt,
        })
        .from(t.users)
        .orderBy(asc(t.users.loginId)),
    ctx,
  )
  const stores = ctx.stores.map((s) => ({ id: s.id, name: `${s.name}${s.status === 'preparing' ? '（準備中）' : ''}` }))
  const storeName = (id: string | null) => ctx.stores.find((s) => s.id === id)?.shortName ?? '—'
  // 並び順：有効 → オーナー → 店舗オーナー → 店舗（店舗切り替えと同じ順）→ ログインID
  // （店舗オーナーには、データベース側で所属店舗のアカウントだけが返る）
  const storeIdx = (id: string | null) => (id ? ctx.stores.findIndex((s) => s.id === id) : -1)
  const roleIdx = { owner: 0, store_owner: 1, staff: 2 } as const
  users.sort((a, b) => Number(b.active) - Number(a.active) || roleIdx[a.role] - roleIdx[b.role] || storeIdx(a.storeId) - storeIdx(b.storeId) || a.loginId.localeCompare(b.loginId))
  const rows: StaffRowData[] = users.map((u) => ({
    id: u.id, name: u.name, loginId: u.loginId, role: u.role, storeId: u.storeId, storeName: storeName(u.storeId), active: u.active,
    lastLogin: u.lastLoginAt ? shortDateTime(u.lastLoginAt) : '未ログイン',
    created: fmtDateTime(u.createdAt),
  }))
  const activeCount = rows.filter((r) => r.active).length

  return (
    <div className="animate-fade-in space-y-5">
      <Card title="アカウント一覧" action={<span className="text-[12px] text-sub">有効 {activeCount}件 / 全{rows.length}件</span>} bodyClass="px-2 pt-2 pb-3">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#f8f6fc]">
                <tr><Th>名前</Th><Th>ログインID</Th><Th>権限</Th><Th>所属店舗</Th><Th>状態</Th><Th>最終ログイン</Th><Th className="text-right">操作</Th></tr>
              </thead>
              <tbody>
                {rows.map((u) => <StaffRow key={u.id} u={u} stores={stores} self={u.id === ctx.user.id} allStores={ctx.allStores} />)}
              </tbody>
            </table>
          </div>
        ) : <Empty>アカウントがありません</Empty>}
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="アカウントを追加">
          <CreateStaffForm stores={stores} defaultStoreId={ctx.storeId} allStores={ctx.allStores} />
        </Card>
        <Card title="権限について">
          <ul className="space-y-3 text-[13px] leading-relaxed">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" />
              <span><b>オーナー（全店舗）</b>：全店舗のデータと、料金設定・レポート・スタッフ管理・設定を利用できます。画面上部で店舗を切り替えます。</span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#c026d3]" />
              <span><b>店舗オーナー</b>：所属店舗だけについて、オーナーと同じ機能（料金設定・レポート・スタッフ管理・設定）を利用できます。他店舗のデータは見えません。</span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-info" />
              <span><b>スタッフ</b>：所属店舗のデータのみ利用できます（来店受付・会員管理・売上管理・割引の確認・会員規約）。</span>
            </li>
          </ul>
          <ul className="mt-4 list-disc space-y-1 rounded-lg bg-page py-3 pr-3 pl-7 text-[12px] text-sub">
            <li>他店舗のデータは、データベース側で見えないよう制御されています。</li>
            {!ctx.allStores && <li>店舗オーナーが追加・変更できるのは、所属店舗のスタッフのアカウントのみです。</li>}
            <li>退職などでログインできなくする場合は「無効」にしてください（履歴は残ります）。</li>
            <li>パスワードを忘れた場合は「パスワード再発行」で新しいパスワードを発行できます。</li>
            <li>自分自身のアカウントは無効化・権限変更できません。</li>
            <li>追加・変更・再発行はすべて操作ログに記録されます。</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
