'use client'

// 勤怠の画面部品：打刻（名前のボタン）・記録の追加／修正・対象者の追加／変更
import { useEffect, useRef, useState } from 'react'
import { LogIn, LogOut, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, Field, Input, Select, Td, cx } from '@/components/ui'
import { ActionForm, FormMessage, SubmitButton, useFormCtx } from '@/components/settings/form'
import { Switch } from '@/components/settings/fields'
import type { StaffKind } from '@/db/schema'
import { STAFF_KINDS } from '@/lib/attendance'
import { addRecord, addStaffMember, punch, updateRecord, updateStaffMember } from './actions'

/* ------------------------------ 打刻 ------------------------------ */

export type PunchState = '未出勤' | '勤務中' | '退勤済'

export interface PunchItem {
  id: string
  name: string
  kind: StaffKind
  state: PunchState
  /** 本日の出勤・退勤の時刻（例「19:00」「翌2:10」。無ければ「—」） */
  clockIn: string
  clockOut: string
  /** 状態の説明（例「勤務中　19:00〜（1:20）」） */
  status: string
  warn?: string
}

const initial = (name: string) => Array.from(name.trim())[0] ?? '?'

/** 打刻：名前のボタンを選ぶ → 出勤・退勤のボタンを押す */
export function PunchBoard({ items, groups }: { items: PunchItem[]; groups: { kind: StaffKind; note: string }[] }) {
  const [sel, setSel] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const current = items.find((i) => i.id === sel) ?? null
  const choose = (id: string) => {
    setSel(id)
    // 画面が狭いときは、下に出るボタンが見えるようにする
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5">
        <p className="text-[14px] font-bold text-sub">お名前を選んでください</p>
        {groups.map(({ kind, note }) => {
          const list = items.filter((i) => i.kind === kind)
          if (!list.length) return null
          return (
            <section key={kind} data-testid={`punch-group-${kind}`}>
              <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
                {kind}<span className="text-[12px] font-medium text-sub">{note}</span>
              </h3>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
                {list.map((i) => <NameButton key={i.id} item={i} selected={i.id === sel} onClick={() => choose(i.id)} />)}
              </div>
            </section>
          )
        })}
      </div>
      <div ref={panelRef} className="scroll-mt-24 self-start xl:sticky xl:top-24">
        {current ? <PunchPanel key={current.id} item={current} /> : (
          <div className="grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-line px-5 py-8 text-center text-[14px] text-sub">
            お名前を選ぶと、ここに出勤・退勤のボタンが表示されます
          </div>
        )}
      </div>
    </div>
  )
}

function NameButton({ item, selected, onClick }: { item: PunchItem; selected: boolean; onClick: () => void }) {
  const working = item.state === '勤務中'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={`punch-${item.name}`}
      className={cx(
        'flex min-w-0 flex-col items-center gap-1.5 rounded-xl border-2 px-1.5 py-3 transition',
        selected ? 'border-brand bg-brand-soft' : working ? 'border-ok/60 bg-[#effaf3] hover:border-ok' : 'border-line bg-white hover:border-brand-light',
      )}
    >
      <span className={cx('grid size-12 place-items-center rounded-full text-[19px] font-bold',
        working ? 'bg-ok text-white' : item.state === '退勤済' ? 'bg-[#efeaf7] text-sub' : 'btn-brand')}>
        {initial(item.name)}
      </span>
      <span className="w-full truncate text-center text-[15px] font-bold text-ink">{item.name}</span>
      <span className={cx('rounded-md px-2 py-0.5 text-[11px] font-bold',
        working ? 'bg-white text-ok' : item.state === '退勤済' ? 'bg-page text-sub' : 'text-mute')}>
        {item.state}
      </span>
      {item.warn && <span className="text-[10px] leading-tight font-bold text-up">退勤の記録なし</span>}
    </button>
  )
}

function PunchPanel({ item }: { item: PunchItem }) {
  const working = item.state === '勤務中'
  return (
    <div className="animate-fade-in rounded-2xl border-2 border-brand/40 bg-white p-5" data-testid="punch-panel">
      <div className="flex items-center gap-3">
        <span className={cx('grid size-14 shrink-0 place-items-center rounded-full text-[22px] font-bold', working ? 'bg-ok text-white' : 'btn-brand')}>
          {initial(item.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[20px] font-bold text-ink">{item.name} さん</p>
          <p className="text-[12px] text-sub">{item.kind}</p>
        </div>
        <dl className="shrink-0 text-right text-[12px] text-sub">
          <div>出勤 <b className="text-[14px] text-ink tabular-nums">{item.clockIn}</b></div>
          <div>退勤 <b className="text-[14px] text-ink tabular-nums">{item.clockOut}</b></div>
        </dl>
      </div>
      <p className={cx('mt-4 text-center text-[13px] font-bold', working ? 'text-ok' : 'text-sub')} data-testid="punch-status">{item.status}</p>
      {item.warn && <p className="mt-1 text-center text-[12px] font-bold text-up">{item.warn}</p>}
      <ActionForm action={punch} className="mt-3">
        <input type="hidden" name="staffMemberId" value={item.id} />
        <input type="hidden" name="mode" value={working ? 'out' : 'in'} />
        <PunchSubmit name={item.name} working={working} />
      </ActionForm>
    </div>
  )
}

function PunchSubmit({ name, working }: { name: string; working: boolean }) {
  const { pending } = useFormCtx()
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="punch-submit"
      data-confirm={`${name}さんの${working ? '退勤' : '出勤'}を記録します。よろしいですか？`}
      className={cx(
        'flex h-16 w-full items-center justify-center gap-2 rounded-xl text-[19px] font-bold transition disabled:cursor-wait disabled:opacity-60',
        working ? 'border-2 border-up bg-white text-up hover:bg-[#fff4f6]' : 'btn-brand',
      )}
    >
      {working ? <LogOut className="size-5" /> : <LogIn className="size-5" />}
      {pending ? '記録中…' : working ? '退勤する' : '出勤する'}
    </button>
  )
}

/** 現在時刻（日本時間・画面の時計。記録はサーバーの時刻） */
export function LiveClock() {
  const [now, setNow] = useState('')
  useEffect(() => {
    const f = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false })
    const tick = () => setNow(f.format(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="text-[34px] leading-none font-bold tracking-wider text-ink tabular-nums" data-testid="live-clock">{now || '--:--'}</span>
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
