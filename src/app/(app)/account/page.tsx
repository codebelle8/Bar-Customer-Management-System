import type { Metadata } from 'next'
import { Card } from '@/components/ui'
import { requireCtx } from '@/lib/dal'
import { PasswordForm } from './PasswordForm'

export const metadata: Metadata = { title: 'パスワード変更' }

export default async function AccountPage() {
  const ctx = await requireCtx()
  return (
    <div className="animate-fade-in max-w-xl space-y-5">
      <Card title="アカウント">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-[14px]">
          <dt className="text-sub">名前</dt><dd>{ctx.user.name}</dd>
          <dt className="text-sub">ログインID</dt><dd>{ctx.user.loginId}</dd>
          <dt className="text-sub">権限</dt><dd>{ctx.isOwner ? 'オーナー（全店舗）' : `スタッフ（${ctx.store.name}）`}</dd>
        </dl>
      </Card>
      <Card title="パスワード変更">
        <PasswordForm />
      </Card>
    </div>
  )
}
