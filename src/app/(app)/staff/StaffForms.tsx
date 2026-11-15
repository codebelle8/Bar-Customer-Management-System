'use client'

// スタッフ管理：アカウント追加フォーム・一覧の行（編集・パスワード再発行）
import { useState } from 'react'
import { Eye, EyeOff, KeyRound, Pencil, Sparkles, X } from 'lucide-react'
import { Badge, Button, Field, Input, Select, cx } from '@/components/ui'
import { ActionForm, FormMessage, SecretBox, SubmitButton, useFormCtx } from '@/components/settings/form'
import { Switch } from '@/components/settings/fields'
import { generatePassword } from '@/components/settings/password'
import { createStaff, resetPassword, updateStaff } from './actions'

type StoreOpt = { id: string; name: string }

/* ------------------------------ 追加 ------------------------------ */

export function CreateStaffForm({ stores, defaultStoreId }: { stores: StoreOpt[]; defaultStoreId: string }) {
  return (
    <ActionForm action={createStaff} resetOnSuccess message="none" className="space-y-4">
      <CreateFields stores={stores} defaultStoreId={defaultStoreId} />
    </ActionForm>
  )
}

function CreateFields({ stores, defaultStoreId }: { stores: StoreOpt[]; defaultStoreId: string }) {
  const [role, setRole] = useState<'staff' | 'owner'>('staff')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const { state } = useFormCtx()
  // 作成に成功したら入力欄（パスワード）も空に戻す
  const [prev, setPrev] = useState(state)
  if (state !== prev) {
    setPrev(state)
    if (state?.ok) {
      setPassword('')
      setRole('staff')
    }
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="名前" required><Input name="name" maxLength={30} placeholder="例：上野スタッフC" required /></Field>
        <Field label="ログインID" required hint="半角英小文字・数字・「_」「-」の3〜32文字">
          <Input name="loginId" pattern="[a-z0-9_\-]{3,32}" minLength={3} maxLength={32} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="ueno03" required />
        </Field>
        <Field label="権限">
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value as 'staff' | 'owner')}>
            <option value="staff">スタッフ（所属店舗のみ）</option>
            <option value="owner">オーナー（全店舗・全機能）</option>
          </Select>
        </Field>
        <Field label="所属店舗" required={role === 'staff'} hint={role === 'owner' ? 'オーナーは全店舗を利用できます' : undefined}>
          <Select name="storeId" defaultValue={defaultStoreId} disabled={role === 'owner'} required={role === 'staff'}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="初期パスワード" required hint="8文字以上。作成後に本人へ伝え、ログイン後に変更してもらってください">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input name="password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              minLength={8} maxLength={72} autoComplete="new-password" required className="pr-10 font-mono" />
            <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-mute hover:text-ink" aria-label={show ? 'パスワードを隠す' : 'パスワードを表示'}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button type="button" variant="outline" onClick={() => { setPassword(generatePassword(10)); setShow(true) }}>
            <Sparkles className="size-4" />自動生成
          </Button>
        </div>
      </Field>
      <FormMessage />
      {state?.ok && state.secret && (
        <SecretBox label={`ログインID：${state.subject}　初期パスワード`} value={state.secret} note="この画面を離れると再表示できません。本人に伝えてください。" />
      )}
      <SubmitButton size="lg" pendingText="作成中…">アカウントを作成</SubmitButton>
    </>
  )
}

/* ------------------------------ 一覧の行 ------------------------------ */

export interface StaffRowData {
  id: string
  name: string
  loginId: string
  role: 'owner' | 'staff'
  storeId: string | null
  storeName: string
  active: boolean
  lastLogin: string
  created: string
}

export function StaffRow({ u, stores, self }: { u: StaffRowData; stores: StoreOpt[]; self: boolean }) {
  const [mode, setMode] = useState<'none' | 'edit' | 'reset'>('none')
  return (
    <>
      <tr className={cx('border-t border-line', !u.active && 'text-mute', mode !== 'none' && 'bg-[#fcfbfe]')}>
        <td className="px-2 py-3 xl:px-3 whitespace-nowrap">
          <span className="font-medium">{u.name}</span>
          {self && <Badge tone="purple" className="ml-2">あなた</Badge>}
        </td>
        <td className="px-2 py-3 xl:px-3 font-mono text-[13px] whitespace-nowrap">{u.loginId}</td>
        <td className="px-2 py-3 xl:px-3 whitespace-nowrap">{u.role === 'owner' ? <Badge tone="purple">オーナー</Badge> : <Badge tone="blue">スタッフ</Badge>}</td>
        <td className="px-2 py-3 xl:px-3 whitespace-nowrap">{u.role === 'owner' ? <span className="text-sub">全店舗</span> : u.storeName}</td>
        <td className="px-2 py-3 xl:px-3 whitespace-nowrap">{u.active ? <Badge tone="green">有効</Badge> : <Badge tone="gray">無効</Badge>}</td>
        <td className="px-2 py-3 xl:px-3 whitespace-nowrap text-sub tabular-nums">{u.lastLogin}</td>
        <td className="px-2 py-3 xl:px-3 text-right whitespace-nowrap">
          <div className="inline-flex flex-col items-stretch gap-1.5 xl:flex-row">
            <Button size="sm" variant={mode === 'edit' ? 'soft' : 'default'} onClick={() => setMode(mode === 'edit' ? 'none' : 'edit')}>
              <Pencil className="size-3.5" />編集
            </Button>
            {!self && (
              <Button size="sm" variant={mode === 'reset' ? 'soft' : 'default'} onClick={() => setMode(mode === 'reset' ? 'none' : 'reset')} title="パスワード再発行">
                <KeyRound className="size-3.5" /><span className="xl:hidden">再発行</span><span className="hidden xl:inline">パスワード再発行</span>
              </Button>
            )}
          </div>
        </td>
      </tr>
      {mode !== 'none' && (
        <tr className="bg-[#fcfbfe]">
          <td colSpan={7} className="px-3 pb-4">
            <div className="animate-fade-in relative rounded-xl border border-line bg-white p-4">
              <button type="button" onClick={() => setMode('none')} className="absolute top-3 right-3 rounded p-1 text-mute hover:bg-page hover:text-ink" aria-label="閉じる">
                <X className="size-4" />
              </button>
              {mode === 'edit' ? <EditForm u={u} stores={stores} self={self} /> : <ResetForm u={u} />}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function EditForm({ u, stores, self }: { u: StaffRowData; stores: StoreOpt[]; self: boolean }) {
  const [role, setRole] = useState(u.role)
  return (
    <ActionForm action={updateStaff} message="none" className="space-y-4">
      <p className="text-[13px] font-bold">{u.name}（{u.loginId}）を編集</p>
      <input type="hidden" name="id" value={u.id} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <Field label="名前" required><Input name="name" defaultValue={u.name} maxLength={30} required /></Field>
        <Field label="権限" hint={self ? '自分の権限は変更できません' : undefined}>
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value as 'staff' | 'owner')} disabled={self}>
            <option value="staff">スタッフ</option>
            <option value="owner">オーナー</option>
          </Select>
          {self && <input type="hidden" name="role" value="owner" />}
        </Field>
        <Field label="所属店舗">
          <Select name="storeId" defaultValue={u.storeId ?? stores[0]?.id} disabled={role === 'owner'}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="pb-2">
          {self ? (
            <>
              <Switch name="active_view" defaultChecked disabled label="有効" />
              <input type="hidden" name="active" value="1" />
            </>
          ) : (
            <Switch name="active" defaultChecked={u.active} label="有効" />
          )}
        </div>
      </div>
      {!self && <p className="text-[12px] text-sub">無効にするとログインできなくなります（来店記録などの履歴は残ります）。</p>}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>保存</SubmitButton>
        <FormMessage className="flex-1" />
      </div>
    </ActionForm>
  )
}

function ResetForm({ u }: { u: StaffRowData }) {
  return (
    <ActionForm action={resetPassword} message="none" className="space-y-3">
      <input type="hidden" name="id" value={u.id} />
      <p className="text-[13px] font-bold">{u.name}（{u.loginId}）のパスワードを再発行</p>
      <ResetBody name={u.name} />
    </ActionForm>
  )
}

function ResetBody({ name }: { name: string }) {
  const { state } = useFormCtx()
  if (state?.ok && state.secret)
    return (
      <>
        <SecretBox label="新しいパスワード" value={state.secret} note="この画面を離れると再表示できません。本人に伝え、ログイン後に変更してもらってください。" />
        <FormMessage />
      </>
    )
  return (
    <>
      <p className="text-[13px] text-sub">新しいパスワードを自動で作成します。今のパスワードは使えなくなります。</p>
      <FormMessage />
      <SubmitButton variant="danger" pendingText="発行中…" data-confirm={`${name}さんのパスワードを再発行します。よろしいですか？`}>
        <KeyRound className="size-4" />新しいパスワードを発行
      </SubmitButton>
    </>
  )
}
