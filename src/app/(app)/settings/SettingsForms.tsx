'use client'

// 設定：店舗情報（会員番号の引き下げ警告）・会員規約の編集（ライブプレビュー）
import { useState } from 'react'
import Link from 'next/link'
import { Printer, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button, Field, Input, Select, Textarea, buttonCls, cx } from '@/components/ui'
import { ActionForm, FormMessage, SubmitButton } from '@/components/settings/form'
import { MINCHO, TermsBody } from '@/components/settings/TermsBody'
import { TERMS_PLEDGE } from '@/lib/terms'
import { restoreDefaultTerms, saveStore, saveTerms } from './actions'

/* ------------------------------ 店舗情報 ------------------------------ */

export function StoreForm({ store, nextMemberNo, maxUsed }: {
  store: { name: string; shortName: string; status: string; memberPrefix: string }
  nextMemberNo: number
  maxUsed: number | null
}) {
  const [prefix, setPrefix] = useState(store.memberPrefix)
  const [no, setNo] = useState(String(nextMemberNo))
  const n = Number(no)
  const lowered = no !== '' && Number.isFinite(n) && n < nextMemberNo
  const clash = maxUsed !== null && Number.isFinite(n) && n <= maxUsed
  return (
    <ActionForm action={saveStore} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="店舗名" required><Input name="name" defaultValue={store.name} maxLength={60} required /></Field>
        <Field label="略称" required hint="一覧・帳票などの短い表示に使います"><Input name="shortName" defaultValue={store.shortName} maxLength={20} required /></Field>
      </div>
      <Field label="状態" hint="準備中の店舗も、オーナーは店舗切り替えで設定・確認できます">
        <Select name="status" defaultValue={store.status} className="max-w-xs">
          <option value="active">営業中</option>
          <option value="preparing">準備中</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="会員番号の接頭辞" hint="例：H-（半角英数字と「-」）">
          <Input name="memberPrefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={10} className="font-mono" />
        </Field>
        <Field label="次の会員番号（数字部分）" required>
          <Input type="number" name="nextMemberNo" value={no} onChange={(e) => setNo(e.target.value)} min={1} max={99999999} required className="tabular-nums" />
        </Field>
      </div>
      <div className="rounded-lg bg-page px-4 py-3 text-[13px]">
        <p>次に発行される会員番号：<b className="font-mono text-[15px] text-brand">{prefix}{no || '—'}</b></p>
        <p className="mt-1 text-[12px] text-sub">
          登録済みの最大番号：{maxUsed !== null ? <span className="font-mono">{store.memberPrefix}{maxUsed}</span> : 'なし'}
          （紙の会員証の番号は会員登録時に手入力できます）
        </p>
      </div>
      {!lowered && clash && maxUsed !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#f3dc9b] bg-[#fff9e8] px-4 py-3 text-[13px] text-[#8a5a00]">
          <TriangleAlert className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">次の会員番号が登録済みの最大番号（{maxUsed}）以下です。使用済みの番号は受付時に自動で飛ばしますが、最大番号の次に合わせておくと分かりやすくなります。</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setNo(String(maxUsed + 1))}>{maxUsed + 1} にする</Button>
        </div>
      )}
      {lowered && (
        <div className="rounded-lg border border-[#f3dc9b] bg-[#fff9e8] px-4 py-3 text-[13px] text-[#8a5a00]">
          <p className="flex items-start gap-2 font-bold"><TriangleAlert className="mt-0.5 size-4 shrink-0" />次の会員番号を現在の値（{nextMemberNo}）より小さくしようとしています</p>
          <p className="mt-1 pl-6 text-[12px]">
            {clash ? `登録済みの最大番号（${maxUsed}）以下のため、これから発行する番号が既存の会員と重複する可能性があります。` : '既存の会員番号と重複しないことを確認してください。'}
          </p>
          <label className="mt-2 flex items-center gap-2 pl-6 text-[13px] font-medium">
            <input type="checkbox" name="confirmLower" value="1" required className="size-4 accent-[#6d35c9]" />
            確認しました（番号を下げて保存する）
          </label>
        </div>
      )}
      <SubmitButton>店舗情報を保存</SubmitButton>
    </ActionForm>
  )
}

/* ------------------------------ 会員規約 ------------------------------ */

export function TermsEditor({ version, text, isDefault, today }: { version: string; text: string; isDefault: boolean; today: string }) {
  const [ver, setVer] = useState(version)
  const [body, setBody] = useState(text)
  const [prev, setPrev] = useState({ version, text })
  // 保存・初期化でサーバーの内容が変わったら編集欄も合わせる
  if (prev.version !== version || prev.text !== text) {
    setPrev({ version, text })
    setVer(version)
    setBody(text)
  }
  const changed = body.trim() !== text.trim()
  const needVersion = changed && ver.trim() === version
  const suggestion = today.replaceAll('-', '.')
  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <div>
        <ActionForm action={saveTerms} message="none" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="版（バージョン）" required hint={`現在の版：${version}`}>
              <Input name="termsVersion" value={ver} onChange={(e) => setVer(e.target.value)} maxLength={20} required className="w-44 font-mono" />
            </Field>
            {needVersion && (
              <Button type="button" variant="outline" size="sm" className="mb-6" onClick={() => setVer(suggestion === version ? `${suggestion}-2` : suggestion)}>
                版を「{suggestion === version ? `${suggestion}-2` : suggestion}」にする
              </Button>
            )}
          </div>
          <Field label="規約の本文" required>
            <Textarea name="termsText" value={body} onChange={(e) => setBody(e.target.value)} rows={22} required spellCheck={false}
              className="min-h-[420px] font-mono text-[13px] leading-[1.7]" />
          </Field>
          <div className="rounded-lg border border-line bg-[#fcfbfe] px-4 py-3 text-[12px] leading-relaxed">
            <p className="mb-1.5 font-bold text-sub">書き方</p>
            <ul className="space-y-1">
              <li><code className="rounded bg-page px-1.5 font-mono">!!・他のお客様が…</code> 行頭に「!!」→ <span className="font-bold underline">太字・下線</span>（原本の強調と同じ）</li>
              <li><code className="rounded bg-page px-1.5 font-mono">!・…</code> 行頭に「!」→ <span className="font-bold">太字</span></li>
              <li>空行 → 段落の区切り ／ 行頭の「・」→ 箇条書き（原本と同じ書き方）</li>
            </ul>
          </div>
          {needVersion && (
            <p className="flex items-start gap-2 rounded-lg border border-[#f3dc9b] bg-[#fff9e8] px-3 py-2 text-[12px] text-[#8a5a00]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              本文を変更したため、新しい版を入力してください。会員がどの版の規約に同意したかを区別するために使います。
            </p>
          )}
          <FormMessage />
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton size="lg" disabled={needVersion}>規約を保存</SubmitButton>
            {changed && <Button type="button" variant="ghost" onClick={() => { setBody(text); setVer(version) }}>編集を取り消す</Button>}
            <Button type="submit" form="terms-restore" variant="danger" className="ml-auto" disabled={isDefault && !changed}
              title={isDefault ? '現在、初期の規約が設定されています' : undefined}>
              <RotateCcw className="size-4" />初期の規約に戻す
            </Button>
          </div>
        </ActionForm>
        <ActionForm action={restoreDefaultTerms} id="terms-restore" confirmText="会員規約を初期の内容（店舗からご提供の原本）に戻します。編集中の内容は破棄されます。よろしいですか？">
          <></>
        </ActionForm>
      </div>

      <div className="xl:sticky xl:top-24">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[12px] font-bold text-sub">プレビュー{changed && <span className="ml-2 font-normal text-[#b7791f]">（未保存の変更を表示中）</span>}</p>
          <Link href="/print/terms" target="_blank" className={buttonCls('default', 'sm')}><Printer className="size-3.5" />印刷用の用紙</Link>
        </div>
        <div className="max-h-[760px] overflow-y-auto rounded-xl border border-line bg-white px-6 py-6 shadow-inner scrollbar-thin" style={{ fontFamily: MINCHO, fontFeatureSettings: 'normal' }}>
          <h3 className="mb-3 text-center text-[17px] font-bold underline underline-offset-4">会員規約</h3>
          <TermsBody text={body} className={cx('text-[12.5px] leading-[1.9] text-[#222]')} />
          <p className="mt-5 text-[14px] font-bold">{TERMS_PLEDGE}</p>
        </div>
      </div>
    </div>
  )
}
