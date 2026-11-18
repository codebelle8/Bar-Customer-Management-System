import type { Metadata } from 'next'
import { desc, eq, isNull, or } from 'drizzle-orm'
import { Database, Info, Lock, MapPin, ShieldCheck } from 'lucide-react'
import { Badge, Card, Empty, Field, Td, Th } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/settings/form'
import { NoteBox, Switch, Tabs, YenInput } from '@/components/settings/fields'
import * as t from '@/db/schema'
import { query, requireOwner } from '@/lib/dal'
import { fmtDateTime, yen } from '@/lib/format'
import { businessDateOf } from '@/lib/pricing'
import { DEFAULT_TERMS, DEFAULT_TERMS_VERSION } from '@/lib/terms'
import { saveFees } from './actions'
import { StoreForm, TermsEditor } from './SettingsForms'

export const metadata: Metadata = { title: '設定' }

const TABS = [
  { key: 'store', label: '店舗情報' },
  { key: 'fees', label: '料金・会費' },
  { key: 'terms', label: '会員規約' },
  { key: 'logs', label: '操作ログ' },
] as const
type TabKey = (typeof TABS)[number]['key']

export default async function SettingsPage({ searchParams }: PageProps<'/settings'>) {
  const ctx = await requireOwner()
  const sp = await searchParams
  const tab: TabKey = TABS.some((x) => x.key === sp.tab) ? (sp.tab as TabKey) : 'store'
  const data = await query(async (tx) => {
    const [s] = await tx.select().from(t.storeSettings).where(eq(t.storeSettings.storeId, ctx.storeId))
    const today = businessDateOf(new Date(), s)
    let maxUsed: number | null = null
    if (tab === 'store') {
      const nos = await tx.select({ no: t.members.memberNo }).from(t.members).where(eq(t.members.storeId, ctx.storeId))
      for (const { no } of nos) {
        if (!no.startsWith(ctx.store.memberPrefix)) continue
        const rest = no.slice(ctx.store.memberPrefix.length)
        if (/^\d+$/.test(rest)) maxUsed = Math.max(maxUsed ?? 0, Number(rest))
      }
    }
    const logs =
      tab === 'logs'
        ? await tx
            .select()
            .from(t.auditLogs)
            .where(or(eq(t.auditLogs.storeId, ctx.storeId), isNull(t.auditLogs.storeId)))
            .orderBy(desc(t.auditLogs.createdAt))
            .limit(100)
        : []
    return { s, today, maxUsed, logs }
  }, ctx)
  const { s } = data

  return (
    <div key={ctx.storeId} className="animate-fade-in space-y-5">
      <Tabs items={TABS} current={tab} hrefFor={(k) => (k === 'store' ? '/settings' : `/settings?tab=${k}`)} />
      <p className="flex items-center gap-2 text-[13px] text-sub">
        <Info className="size-4 text-brand" />
        対象店舗：<b className="text-ink">{ctx.store.name}</b>{ctx.store.status === 'preparing' && <Badge tone="amber">準備中</Badge>}{ctx.allStores && '（上部の店舗切り替えで変更できます）'}
      </p>

      {tab === 'store' && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card title="店舗情報">
            <StoreForm
              key={ctx.storeId}
              store={{ name: ctx.store.name, shortName: ctx.store.shortName, status: ctx.store.status, memberPrefix: ctx.store.memberPrefix }}
              nextMemberNo={s.nextMemberNo}
              maxUsed={data.maxUsed}
            />
          </Card>
          <Card title="データについて">
            <ul className="space-y-4 text-[13px] leading-relaxed">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-brand" />
                <span><b>保存場所</b><br />会員・来店・売上のデータは、東京リージョンのデータベースに保存されます。</span>
              </li>
              <li className="flex gap-3">
                <Lock className="mt-0.5 size-5 shrink-0 text-brand" />
                <span><b>アクセス制御</b><br />データベース側で店舗ごとに制御しており、店舗オーナー・スタッフは所属店舗のデータしか読み書きできません。</span>
              </li>
              <li className="flex gap-3">
                <Database className="mt-0.5 size-5 shrink-0 text-brand" />
                <span><b>バックアップ</b><br />データベースは自動でバックアップされています。</span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" />
                <span><b>個人情報</b><br />顔写真・住所は保存しません。本人確認書類は確認した種類のみを記録します。</span>
              </li>
            </ul>
          </Card>
        </div>
      )}

      {tab === 'fees' && (
        <div className="max-w-2xl">
          <Card title="入会金・年会費">
            <ActionForm action={saveFees} className="space-y-5">
              <Field label="入会金" required hint="新規入会の受付時に、入場料と一緒にお預かりします">
                <YenInput name="joinFee" defaultValue={s.joinFee} required className="max-w-56" />
              </Field>
              <div className="space-y-3 rounded-xl border border-line p-4">
                <Switch name="annualFeeEnabled" defaultChecked={s.annualFeeEnabled} label="年会費を徴収する" />
                <Field label="年会費" hint="徴収する場合のみ、入会時・更新時の受付で加算されます">
                  <YenInput name="annualFee" defaultValue={s.annualFee || ''} className="max-w-56" />
                </Field>
              </div>
              <NoteBox tone="info" className="text-[12px]">
                現在の設定：入会金 {yen(s.joinFee)}・年会費 {s.annualFeeEnabled ? yen(s.annualFee) : '徴収しない'}。入場料・延長料金は「料金設定・カレンダー」で設定します。
              </NoteBox>
              <SubmitButton>保存</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}

      {tab === 'terms' && (
        <Card title="会員規約" action={<span className="text-[12px] text-sub">現在の版：<b className="font-mono text-ink">{s.termsVersion}</b>{s.termsVersion === DEFAULT_TERMS_VERSION && s.termsText.trim() === DEFAULT_TERMS.trim() && <Badge tone="gray" className="ml-2">初期の規約</Badge>}</span>}>
          <TermsEditor version={s.termsVersion} text={s.termsText} isDefault={s.termsText.trim() === DEFAULT_TERMS.trim() && s.termsVersion === DEFAULT_TERMS_VERSION} today={data.today} />
        </Card>
      )}

      {tab === 'logs' && (
        <Card title="操作ログ" action={<span className="text-[12px] text-sub">最新{data.logs.length}件（{ctx.store.shortName}・共通）</span>} bodyClass="px-2 pt-2 pb-3">
          {data.logs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-[#f8f6fc]"><tr><Th>日時</Th><Th>担当者</Th><Th>操作</Th><Th>対象・内容</Th></tr></thead>
                <tbody>
                  {data.logs.map((l) => (
                    <tr key={l.id} className="border-t border-line align-top">
                      <Td className="text-sub tabular-nums">{fmtDateTime(l.createdAt)}</Td>
                      <Td>{l.userName || '—'}</Td>
                      <Td className="font-medium">{l.action}{!l.storeId && <Badge tone="gray" className="ml-1.5">共通</Badge>}</Td>
                      <Td className="max-w-[520px] whitespace-normal break-words text-sub">{l.target || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>操作ログはまだありません</Empty>}
        </Card>
      )}
    </div>
  )
}
