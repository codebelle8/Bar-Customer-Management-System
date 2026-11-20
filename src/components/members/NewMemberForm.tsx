'use client'

import Link from 'next/link'
import { useActionState, useState, startTransition } from 'react'
import { LoaderCircle, UserPlus, Wand2 } from 'lucide-react'
import { createMember, type FormState } from '@/app/(app)/members/actions'
import { Button, Field, Input, Select, Textarea, buttonCls, cx } from '@/components/ui'
import { REFERRALS } from '@/lib/terms'
import { FieldError, IdDocsField } from './IdDocsField'
import { BirthdayInput } from './BirthdayInput'
import { normalizeMemberNo } from './rules'

export function NewMemberForm(props: {
  prefix: string
  suggestNo: string
  initialNo: string
  joinDefault: string
  todayJst: string
  maxBirthday: string
  termsVersion: string
}) {
  const { prefix, suggestNo, initialNo, joinDefault, todayJst, termsVersion } = props
  const [state, dispatch, pending] = useActionState<FormState, FormData>(createMember, undefined)
  const [no, setNo] = useState(initialNo)
  const e = state?.errors ?? {}
  const normalized = normalizeMemberNo(no, prefix)

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault()
        const fd = new FormData(ev.currentTarget)
        startTransition(() => dispatch(fd))
      }}
      className="space-y-6"
    >
      <section className="space-y-4">
        <h3 className="text-[13px] font-bold text-brand">基本情報</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="会員番号" required>
            <Input name="memberNo" value={no} onChange={(ev) => setNo(ev.target.value)} required maxLength={30} autoFocus={!initialNo}
              placeholder={`紙の会員カードの番号（例：${suggestNo.slice(prefix.length)}）`} className="h-12 text-[18px] font-bold tabular-nums" inputMode="text" />
            <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
              {normalized && normalized !== no.trim() && <span className="text-sub">登録される番号：<b className="text-ink tabular-nums">{normalized}</b></span>}
              {normalized !== suggestNo && (
                <button type="button" onClick={() => setNo(suggestNo)} className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-1 font-medium text-brand hover:bg-[#e6dbfa]">
                  <Wand2 className="size-3.5" />自動採番 {suggestNo} を使う
                </button>
              )}
            </span>
            <FieldError msg={e.memberNo} />
          </Field>
          <Field label="ハンドルネーム" required>
            <Input name="handleName" required maxLength={40} autoFocus={!!initialNo} className="h-12 text-[16px]" placeholder="受付で呼ぶお名前" />
            <FieldError msg={e.handleName} />
          </Field>
          <Field label="性別" required>
            <div className="grid grid-cols-2 gap-2">
              {(['男性', '女性'] as const).map((g) => (
                <label key={g} className="cursor-pointer">
                  <input type="radio" name="gender" value={g} required className="peer sr-only" />
                  <span className={cx('flex h-12 items-center justify-center rounded-lg border border-line text-[15px] font-bold text-sub transition',
                    g === '男性' ? 'peer-checked:border-info peer-checked:bg-[#e6f0ff] peer-checked:text-info' : 'peer-checked:border-[#c8457e] peer-checked:bg-[#fdeaf2] peer-checked:text-[#c8457e]')}>{g}</span>
                </label>
              ))}
            </div>
            <FieldError msg={e.gender} />
          </Field>
          <Field label="生年月日" required>
            <BirthdayInput name="birthday" today={todayJst} />
            <FieldError msg={e.birthday} />
          </Field>
          <Field label="入会日" required hint="以前からの会員は、紙の会員カードの入会日を入力してください">
            <Input name="joinedAt" type="date" required defaultValue={joinDefault} max={todayJst} min="1990-01-01" className="h-12" />
            <FieldError msg={e.joinedAt} />
          </Field>
          <Field label="紹介元・きっかけ">
            <Select name="referral" defaultValue="" className="h-12">
              <option value="">未選択</option>
              {REFERRALS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
            <FieldError msg={e.referral} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-[13px] font-bold text-brand">本人確認・会員規約</h3>
        <IdDocsField hint="以前からの会員で記録がない場合は空欄のままで構いません（次回来店時に確認）" />
        <Field label="会員規約" className="max-w-md">
          <Select name="termsVersion" defaultValue="紙" className="h-12">
            <option value="紙">紙の規約に署名済み（以前からの会員）</option>
            <option value={termsVersion}>現行の規約（第{termsVersion}版）に同意済み</option>
            <option value="">未確認</option>
          </Select>
        </Field>
      </section>

      <section className="space-y-4">
        <h3 className="text-[13px] font-bold text-brand">メモ</h3>
        <Field label="スタッフ間の申し送り">
          <Textarea name="memo" maxLength={500} rows={3} placeholder="例：番号で呼ぶこと" />
          <FieldError msg={e.memo} />
        </Field>
      </section>

      {state?.error && <p role="alert" className="rounded-lg bg-[#fde7eb] px-4 py-2.5 text-[13px] font-medium text-up">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button variant="brand" size="lg" disabled={pending} className="min-w-48">
          {pending ? <LoaderCircle className="size-5 animate-spin" /> : <UserPlus className="size-5" />}会員を登録する
        </Button>
        <Link href="/members" className={buttonCls('default', 'lg')}>キャンセル</Link>
      </div>
    </form>
  )
}
