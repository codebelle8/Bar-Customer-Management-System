'use client'

// レジ金管理の画面部品：確認の記録・取消、引継ぎメモ
import { Check, Trash2, Undo2 } from 'lucide-react'
import { Select, Textarea, cx } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/settings/form'
import { addNote, checkItem, clearItem, deleteNote } from './actions'

export interface StaffOption {
  id: string
  name: string
  kind: string
}

function StaffSelect({ staff, name = 'staffMemberId', required, placeholder }: { staff: StaffOption[]; name?: string; required?: boolean; placeholder: string }) {
  return (
    <Select name={name} defaultValue="" required={required} aria-label={placeholder}>
      <option value="" disabled={required}>{placeholder}</option>
      {['社員', 'アルバイト'].map((k) => (
        <optgroup key={k} label={k}>
          {staff.filter((s) => s.kind === k).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </optgroup>
      ))}
    </Select>
  )
}

export function CheckRow({ date, item, label, checked, staff, canEdit }: {
  date: string
  item: string
  label: string
  checked: { id: string; name: string; time: string } | null
  staff: StaffOption[]
  canEdit: boolean
}) {
  return (
    <div className={cx('rounded-xl border px-4 py-3', checked ? 'border-ok/50 bg-[#effaf3]' : 'border-line')} data-testid={`cash-${item}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-bold">{label}</span>
        {checked ? (
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-ok"><Check className="size-4" />{checked.name}<span className="font-medium text-sub tabular-nums">{checked.time}</span></span>
        ) : <span className="text-[12px] font-medium text-up">未確認</span>}
      </div>
      {canEdit && (checked ? (
        <ActionForm action={clearItem} className="mt-2 flex justify-end">
          <input type="hidden" name="id" value={checked.id} />
          <SubmitButton size="sm" variant="ghost" pendingText="取消中…" data-confirm={`「${label}」の確認を取り消します。よろしいですか？`}><Undo2 className="size-3.5" />取り消す</SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={checkItem} className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="item" value={item} />
          <StaffSelect staff={staff} required placeholder="確認した人" />
          <SubmitButton pendingText="記録中…"><Check className="size-4" />確認</SubmitButton>
        </ActionForm>
      ))}
    </div>
  )
}

export function AddNoteForm({ date, staff }: { date: string; staff: StaffOption[] }) {
  return (
    <ActionForm action={addNote} resetOnSuccess className="space-y-2">
      <input type="hidden" name="date" value={date} />
      <Textarea name="body" rows={3} maxLength={500} required placeholder="例：1万円札の両替が必要です" aria-label="引継ぎメモ" />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <StaffSelect staff={staff} placeholder="記入者（任意）" />
        <SubmitButton>メモを追加</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function DeleteNoteButton({ id }: { id: string }) {
  return (
    <ActionForm action={deleteNote} message="none">
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="ghost" pendingText="…" aria-label="メモを削除" data-confirm="このメモを削除します。よろしいですか？"><Trash2 className="size-3.5" /></SubmitButton>
    </ActionForm>
  )
}
