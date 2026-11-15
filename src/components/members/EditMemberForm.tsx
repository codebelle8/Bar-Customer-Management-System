'use client'

import { useActionState, useState, startTransition } from 'react'
import { CheckCircle2, LoaderCircle, Lock, Save } from 'lucide-react'
import { updateMember, type FormState } from '@/app/(app)/members/actions'
import { Button, Field, Input, Select, Textarea, cx } from '@/components/ui'
import { REFERRALS } from '@/lib/terms'
import { FieldError, IdDocsField } from './IdDocsField'

export interface EditableMember {
  id: string
  memberNo: string
  handleName: string
  gender: '男性' | '女性'
  birthday: string | null
  referral: string
  memo: string
  idDocs: string[]
  feeExpiresAt: string | null
}

export function EditMemberForm({ m, isOwner, feeOn, maxBirthday }: { m: EditableMember; isOwner: boolean; feeOn: boolean; maxBirthday: string }) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(updateMember, undefined)
  const [dirty, setDirty] = useState(false)
  const e = state?.errors ?? {}
  return (
    <form
      onChange={() => setDirty(true)}
      onSubmit={(ev) => {
        ev.preventDefault()
        const fd = new FormData(ev.currentTarget)
        setDirty(false)
        startTransition(() => dispatch(fd))
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={m.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="会員番号" hint={isOwner ? '変更すると会員カードの番号と合わなくなるため注意してください' : '会員番号の変更はオーナーのみ行えます'}>
          {isOwner ? (
            <Input name="memberNo" defaultValue={m.memberNo} required maxLength={30} className="font-bold tabular-nums" />
          ) : (
            <span className="flex h-10 items-center gap-2 rounded-lg border border-line bg-page px-3 text-[14px] font-bold tabular-nums text-sub">
              <Lock className="size-3.5" />{m.memberNo}
            </span>
          )}
          <FieldError msg={e.memberNo} />
        </Field>
        <Field label="ハンドルネーム" required>
          <Input name="handleName" defaultValue={m.handleName} required maxLength={40} />
          <FieldError msg={e.handleName} />
        </Field>
        <Field label="性別" required>
          <div className="grid grid-cols-2 gap-2">
            {(['男性', '女性'] as const).map((g) => (
              <label key={g} className="cursor-pointer">
                <input type="radio" name="gender" value={g} defaultChecked={m.gender === g} className="peer sr-only" />
                <span className={cx('flex h-10 items-center justify-center rounded-lg border border-line text-[14px] font-medium text-sub transition',
                  g === '男性' ? 'peer-checked:border-info peer-checked:bg-[#e6f0ff] peer-checked:text-info' : 'peer-checked:border-[#c8457e] peer-checked:bg-[#fdeaf2] peer-checked:text-[#c8457e]')}>{g}</span>
              </label>
            ))}
          </div>
          <FieldError msg={e.gender} />
        </Field>
        <Field label="生年月日" hint="20歳未満は登録できません">
          <Input name="birthday" type="date" defaultValue={m.birthday ?? ''} max={maxBirthday} min="1900-01-01" />
          <FieldError msg={e.birthday} />
        </Field>
        <Field label="紹介元・きっかけ">
          <Select name="referral" defaultValue={m.referral}>
            <option value="">未選択</option>
            {REFERRALS.map((r) => <option key={r} value={r}>{r}</option>)}
            {m.referral && !REFERRALS.includes(m.referral) && <option value={m.referral}>{m.referral}</option>}
          </Select>
          <FieldError msg={e.referral} />
        </Field>
        {feeOn && (
          <Field label="年会費の有効期限">
            <Input name="feeExpiresAt" type="date" defaultValue={m.feeExpiresAt ?? ''} />
            <FieldError msg={e.feeExpiresAt} />
          </Field>
        )}
      </div>
      <IdDocsField defaultValue={m.idDocs} />
      <Field label="メモ" hint="スタッフ間の申し送り（受付画面にも表示されます）">
        <Textarea name="memo" defaultValue={m.memo} maxLength={500} rows={3} />
        <FieldError msg={e.memo} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="brand" size="lg" disabled={pending} className="min-w-40">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}保存する
        </Button>
        {!pending && !dirty && state?.ok && <span role="status" className="flex items-center gap-1.5 text-[13px] font-medium text-ok"><CheckCircle2 className="size-4" />保存しました</span>}
        {!pending && state?.error && <span role="alert" className="text-[13px] font-medium text-up">{state.error}</span>}
      </div>
    </form>
  )
}
