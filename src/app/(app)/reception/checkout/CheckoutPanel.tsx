'use client'
// 退店・追加精算：延長料金・追加ドリンク・その他（オーナー）を加えて、未精算分をまとめて精算する
import { useActionState, useState } from 'react'
import { Check, ChevronDown, Hourglass, Loader2, Plus, Trash2 } from 'lucide-react'
import { Card, Input, cx } from '@/components/ui'
import { checkoutAction } from '../actions'
import { Notice } from '../_components/bits'
import { CashBox, paidOk } from '../_components/CashBox'
import { Stepper } from '../_components/Stepper'
import { elapsed, parseYen } from '../_lib/quote'
import { MenuGrid, RemoveButton, type MenuTile, type OrderedItem } from '../order/OrderPanel'

export function CheckoutPanel({ visitId, unpaid, extensions, drinks, isOwner, minutes }: {
  visitId: string
  unpaid: OrderedItem[]
  extensions: MenuTile[]
  drinks: MenuTile[]
  isOwner: boolean
  minutes: number
}) {
  const [cart, setCart] = useState<Record<string, number>>({})
  const [showDrinks, setShowDrinks] = useState(false)
  const [others, setOthers] = useState<{ name: string; amount: string }[]>([])
  const [paid, setPaid] = useState('')
  const [state, action, pending] = useActionState(checkoutAction, undefined)

  const menu = [...extensions, ...drinks]
  const added = menu.filter((m) => (cart[m.id] ?? 0) > 0).map((m) => ({ ...m, qty: cart[m.id] }))
  const otherLines = others.map((o) => ({ name: o.name.trim(), amount: parseYen(o.amount) ?? 0 }))
  const othersOk = otherLines.every((o) => o.name && o.amount > 0)
  const unpaidTotal = unpaid.reduce((a, i) => a + i.amount, 0)
  const addedTotal = added.reduce((a, l) => a + l.price * l.qty, 0) + otherLines.reduce((a, o) => a + o.amount, 0)
  const total = unpaidTotal + addedTotal
  const ok = othersOk && paidOk(paid, total)
  const payload = JSON.stringify({
    visitId, items: added.map((l) => ({ menuItemId: l.id, qty: l.qty })), others: isOwner ? otherLines : [], paid: parseYen(paid),
  })

  return (
    <div className="space-y-5">
      <Card title="延長料金" action={<span className="text-[12px] text-sub">滞在 {elapsed(minutes)}</span>}>
        {extensions.length ? (
          <div className="space-y-3">
            {extensions.map((m) => (
              <div key={m.id} className={cx('flex flex-wrap items-center gap-4 rounded-2xl border-2 px-4 py-3', cart[m.id] ? 'border-brand bg-brand-soft/40' : 'border-line')}>
                <Hourglass className="size-6 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-bold">{m.name}</div>
                  <div className="text-[14px] font-bold text-brand tabular-nums">¥{m.price.toLocaleString('ja-JP')}</div>
                </div>
                <Stepper value={cart[m.id] ?? 0} onChange={(v) => setCart({ ...cart, [m.id]: v })} label={`${m.name}の数量`} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-mute">延長料金のメニューが登録されていません</p>
        )}
      </Card>

      <Card title="追加のドリンク" action={
        <button type="button" onClick={() => setShowDrinks(!showDrinks)} className="flex items-center gap-1 text-[13px] font-bold text-brand" data-testid="toggle-drinks">
          {showDrinks ? '閉じる' : '追加する'}<ChevronDown className={cx('size-4 transition', showDrinks && 'rotate-180')} />
        </button>
      }>
        {showDrinks ? <MenuGrid menu={drinks} cart={cart} setCart={setCart} /> : (
          <button type="button" onClick={() => setShowDrinks(true)} className="w-full rounded-xl border border-dashed border-line py-4 text-[14px] text-sub hover:border-brand/40">
            退店時に追加のドリンクがあればタップして追加
          </button>
        )}
      </Card>

      {isOwner && (
        <Card title="その他（オーナーのみ）" action={
          <button type="button" onClick={() => setOthers([...others, { name: '', amount: '' }])} className="flex items-center gap-1 text-[13px] font-bold text-brand"><Plus className="size-4" />行を追加</button>
        }>
          {others.length ? (
            <div className="space-y-2">
              {others.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={o.name} placeholder="項目名（例：備品破損）" maxLength={40} className="h-12 flex-1"
                    onChange={(e) => setOthers(others.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                  <Input value={o.amount} placeholder="金額" inputMode="numeric" className="h-12 w-36 text-right font-bold"
                    onChange={(e) => setOthers(others.map((x, k) => (k === i ? { ...x, amount: e.target.value.replace(/[^\d０-９]/g, '') } : x)))} />
                  <button type="button" aria-label="削除" onClick={() => setOthers(others.filter((_, k) => k !== i))} className="grid size-12 place-items-center rounded-lg text-mute hover:text-up"><Trash2 className="size-4" /></button>
                </div>
              ))}
              {!othersOk && <p className="text-[12px] text-up">項目名と金額を入力してください</p>}
            </div>
          ) : <p className="text-[13px] text-mute">メニューにない請求（自由入力）が必要な場合に追加します</p>}
        </Card>
      )}

      <Card title="お会計の内訳">
        <ul className="divide-y divide-line text-[15px]">
          {unpaid.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2">
              <span className="w-11 shrink-0 text-[12px] text-sub tabular-nums">{i.time}</span>
              <span className="min-w-0 flex-1 truncate">{i.name}{i.qty > 1 && <b className="text-brand"> ×{i.qty}</b>}</span>
              <span className="font-bold tabular-nums">¥{i.amount.toLocaleString('ja-JP')}</span>
              <RemoveButton id={i.id} />
            </li>
          ))}
          {added.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2">
              <span className="w-11 shrink-0"><span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-bold text-brand">追加</span></span>
              <span className="min-w-0 flex-1 truncate">{l.name} <b className="text-brand">×{l.qty}</b></span>
              <span className="font-bold tabular-nums">¥{(l.price * l.qty).toLocaleString('ja-JP')}</span>
              <span className="w-9" />
            </li>
          ))}
          {otherLines.filter((o) => o.name && o.amount).map((o, i) => (
            <li key={`o${i}`} className="flex items-center gap-2 py-2">
              <span className="w-11 shrink-0"><span className="rounded bg-[#fff3d6] px-1.5 py-0.5 text-[11px] font-bold text-[#b7791f]">その他</span></span>
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <span className="font-bold tabular-nums">¥{o.amount.toLocaleString('ja-JP')}</span>
              <span className="w-9" />
            </li>
          ))}
          {!unpaid.length && !added.length && !otherLines.length && (
            <li className="py-4 text-center text-[14px] text-sub">追加のお会計はありません（¥0 で退店できます）</li>
          )}
        </ul>
      </Card>

      <CashBox total={total} paid={paid} onPaid={setPaid} label="退店時のお会計" />

      {state?.error && <Notice tone="error">{state.error}</Notice>}

      <form action={action} className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-[0_8px_28px_rgba(42,20,80,0.14)] backdrop-blur">
        <input type="hidden" name="payload" value={payload} />
        {!paidOk(paid, total) && <span className="text-[13px] text-up">預かり金が不足しています</span>}
        <button disabled={!ok || pending} data-testid="checkout-confirm"
          className="btn-brand inline-flex h-14 min-w-64 items-center justify-center gap-2 rounded-xl px-6 text-[17px] font-bold disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
          {total ? `退店・精算を確定（¥${total.toLocaleString('ja-JP')}）` : '¥0 で退店する'}
        </button>
      </form>
    </div>
  )
}
