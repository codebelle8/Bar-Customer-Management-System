'use client'

// 勤怠の画面部品：打刻ボタン・記録の追加／修正・対象者の追加／変更
import { useState } from 'react'
import { LogIn, LogOut, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, Field, Input, Select, Td, cx } from '@/components/ui'
import { ActionForm, FormMessage, SubmitButton, useFormCtx } from '@/components/settings/form'
import { Switch } from '@/components/settings/fields'
import type { StaffKind } from '@/db/schema'
import { STAFF_KINDS } from '@/lib/attendance'
import { addRecord, addStaffMember, punch, updateRecord, updateStaffMember } from './actions'

/* ------------------------------ 打刻 ------------------------------ */

export function PunchCard({ id, name, working, status, warn }: { id: string; name: string; working: boolean; status: string; warn?: string }) {
  return (
    <ActionForm action={punch} className="flex flex-col">
      <input type="hidden" name="staffMemberId" value={id} />
      <input type="hidden" name="mode" value={working ? 'out' : 'in'} />
      <PunchButton name={name} working={working} status={status} warn={warn} />
    </ActionForm>
  )
}

function PunchButton({ name, working, status, warn }: { name: string; working: boolean; status: string; warn?: string }) {
  const { pending } = useFormCtx()
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={`punch-${name}`}
      data-confirm={`${name}さんの${working ? '退勤' : '出勤'}を記録します。よろしいですか？`}
      className={cx(
        'flex w-full flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left transition disabled:cursor-wait disabled:opacity-60',
        working ? 'border-ok bg-[#effaf3] hover:bg-[#e2f5e9]' : 'border-line bg-white hover:border-brand-light',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[18px] font-bold text-ink">{name}</span>
        <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[13px] font-bold', working ? 'bg-white text-up ring-1 ring-[#f2c2cb]' : 'btn-brand')}>
          {working ? <LogOut className="size-4" /> : <LogIn className="size-4" />}
          {pending ? '記録中…' : working ? '退勤' : '出勤'}
        </span>
      </span>
      <span className={cx('text-[12px] font-medium', working ? 'text-ok' : 'text-sub')}>{status}</span>
      {warn && <span className="text-[11px] font-medium text-up">{warn}</span>}
    </button>
  )
}

/* ------------------------------ 記録の修正（月別集計の明細） ------------------------------ */

export interface RecordRowData {
  id: string
  date: string
  clockIn: string
  clockOut: string
  inValue: string
  outValue: string
  hm: string
  open: boolean
}

export function RecordRow({ r }: { r: RecordRowData }) {
  const [edit, setEdit] = useState(false)
  return (
    <>
      <tr className={cx('border-t border-line', edit && 'bg-brand-soft/40')}>
        <Td className="font-medium whitespace-nowrap">{r.date}</Td>
        <Td className="tabular-nums">{r.clockIn}</Td>
        <Td className="tabular-nums">{r.open ? <span className="font-bold text-up">未退勤</span> : r.clockOut}</Td>
        <Td className="text-right tabular-nums">{r.hm}</Td>
        <Td className="text-right">
          <Button size="sm" variant={edit ? 'soft' : 'default'} onClick={() => setEdit(!edit)} data-testid="record-edit">
            {edit ? <><X className="size-3.5" />閉じる</> : <><Pencil className="size-3.5" />修正</>}
          </Button>
        </Td>
      </tr>
      {edit && (
        <tr className="bg-brand-soft/40">
          <td colSpan={5} className="px-3 pb-3">
            <ActionForm action={updateRecord} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={r.id} />
              <Field label="出勤" required><Input type="datetime-local" name="clockIn" defaultValue={r.inValue} required className="w-56" /></Field>
              <Field label="退勤"><Input type="datetime-local" name="clockOut" defaultValue={r.outValue} className="w-56" /></Field>
              <SubmitButton>保存</SubmitButton>
              <SubmitButton variant="danger" name="intent" value="delete" pendingText="削除中…" data-confirm="この記録を削除します。よろしいですか？">
                <Trash2 className="size-4" />削除
              </SubmitButton>
            </ActionForm>
          </td>
        </tr>
      )}
    </>
  )
}

export function AddRecordForm({ staffMemberId, defaultIn }: { staffMemberId: string; defaultIn: string }) {
  return (
    <ActionForm action={addRecord} resetOnSuccess className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="staffMemberId" value={staffMemberId} />
      <Field label="出勤" required><Input type="datetime-local" name="clockIn" defaultValue={defaultIn} required className="w-56" /></Field>
      <Field label="退勤"><Input type="datetime-local" name="clockOut" className="w-56" /></Field>
      <SubmitButton><Plus className="size-4" />記録を追加</SubmitButton>
    </ActionForm>
  )
}

/* ------------------------------ 対象者 ------------------------------ */

function KindSelect({ value }: { value?: StaffKind }) {
  return (
    <Select name="kind" defaultValue={value ?? ''} required aria-label="区分">
      {!value && <option value="" disabled>選択</option>}
      {STAFF_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
    </Select>
  )
}

export function AddStaffMemberForm() {
  return (
    <ActionForm action={addStaffMember} resetOnSuccess className="flex flex-wrap items-end gap-3">
      <Field label="名前" required><Input name="name" maxLength={20} required className="w-48" placeholder="例：ケンケン" /></Field>
      <Field label="区分" required><KindSelect /></Field>
      <SubmitButton><Plus className="size-4" />追加</SubmitButton>
    </ActionForm>
  )
}

export function StaffMemberRow({ m }: { m: { id: string; name: string; kind: StaffKind; active: boolean } }) {
  return (
    <tr className={cx('border-t border-line', !m.active && 'bg-page')}>
      <td colSpan={4} className="px-3 py-2.5">
        <ActionForm action={updateStaffMember} message="none" className="grid grid-cols-[minmax(0,1fr)_8.5rem_auto_auto] items-center gap-3">
          <input type="hidden" name="id" value={m.id} />
          <Input name="name" defaultValue={m.name} maxLength={20} required aria-label="名前" />
          <KindSelect value={m.kind} />
          <Switch name="active" defaultChecked={m.active} label="有効" />
          <SubmitButton size="sm">保存</SubmitButton>
          <FormMessage className="col-span-4" />
        </ActionForm>
      </td>
    </tr>
  )
}
