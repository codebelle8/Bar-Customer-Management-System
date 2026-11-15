'use client'
// ドリンク注文：メニューのタイルで数量を選んで登録（精算は退店時）
import { useActionState, useState, useTransition } from 'react'
import { Check, GlassWater, Loader2, Package, Trash2 } from 'lucide-react'
import { Card, cx } from '@/components/ui'
import { addItemsAction, removeItemAction } from '../actions'
import { Notice } from '../_components/bits'
import { Stepper } from '../_components/Stepper'
import type { ActionState } from '../_lib/types'

export interface MenuTile {
  id: string
  kind: 'drink' | 'extension' | 'other'
  name: string
  price: number
}
export interface OrderedItem {
  id: string
  name: string
  qty: number
  unitPrice: number
  amount: number
  time: string
  kind: string
}

const KIND_LABEL = { drink: 'ドリンク', other: 'その他', extension: '延長料金' } as const

/** メニューのタイル（タップで +1、数量は増減ボタンで調整） */
export function MenuGrid({ menu, cart, setCart }: { menu: MenuTile[]; cart: Record<string, number>; setCart: (c: Record<string, number>) => void }) {
  const kinds = (['drink', 'other', 'extension'] as const).filter((k) => menu.some((m) => m.kind === k))
  return (
    <div className="space-y-5">
      {kinds.map((k) => (
        <div key={k}>
          <h3 className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-sub">
            {k === 'drink' ? <GlassWater className="size-4" /> : <Package className="size-4" />}{KIND_LABEL[k]}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {menu.filter((m) => m.kind === k).map((m) => {
              const qty = cart[m.id] ?? 0
              return (
                <div key={m.id} className={cx('rounded-2xl border-2 bg-white p-3 transition', qty ? 'border-brand bg-brand-soft/40' : 'border-line')}>
                  <button type="button" onClick={() => setCart({ ...cart, [m.id]: Math.min(99, qty + 1) })} className="block w-full text-left" data-menu={m.name}>
                    <span className="block min-h-10 text-[16px] leading-tight font-bold">{m.name}</span>
                    <span className="mt-1 block text-[18px] font-bold text-brand tabular-nums">¥{m.price.toLocaleString('ja-JP')}</span>
                  </button>
                  <div className="mt-2 flex justify-end">
                    <Stepper value={qty} onChange={(v) => setCart({ ...cart, [m.id]: v })} label={`${m.name}の数量`} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {!kinds.length && <p className="py-6 text-center text-[13px] text-mute">販売中のメニューがありません（設定でメニューを登録してください）</p>}
    </div>
  )
}

export function OrderPanel({ visitId, menu, items, canEdit }: { visitId: string; menu: MenuTile[]; items: OrderedItem[]; canEdit: boolean }) {
  const [cart, setCart] = useState<Record<string, number>>({})
  const [state, action, pending] = useActionState(async (prev: ActionState | undefined, fd: FormData) => {
    const r = await addItemsAction(prev, fd)
    if (r.ok) setCart({})
    return r
  }, undefined)
  const lines = menu.filter((m) => (cart[m.id] ?? 0) > 0).map((m) => ({ ...m, qty: cart[m.id] }))
  const cartTotal = lines.reduce((a, l) => a + l.price * l.qty, 0)
  const orderedTotal = items.reduce((a, i) => a + i.amount, 0)
  const payload = JSON.stringify({ visitId, items: lines.map((l) => ({ menuItemId: l.id, qty: l.qty })) })

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card title="メニュー">
          {canEdit ? <MenuGrid menu={menu} cart={cart} setCart={setCart} /> : <Notice tone="warn">この来店は精算済み・取消のため、注文を追加できません。</Notice>}
        </Card>
        <div className="space-y-5">
          {canEdit && (
            <Card title="今回の注文">
              {lines.length ? (
                <ul className="divide-y divide-line text-[15px]">
                  {lines.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">{l.name} <b className="text-brand">×{l.qty}</b></span>
                      <span className="font-bold tabular-nums">¥{(l.price * l.qty).toLocaleString('ja-JP')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center text-[13px] text-mute">メニューをタップして追加してください</p>
              )}
              <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
                <span className="text-[14px] font-bold text-sub">小計</span>
                <span className="text-[28px] leading-none font-bold tabular-nums" data-testid="order-subtotal">¥{cartTotal.toLocaleString('ja-JP')}</span>
              </div>
              <p className="mt-2 text-[12px] text-sub">お支払いは退店時にまとめて精算します。</p>
            </Card>
          )}
          <Card title={canEdit ? 'これまでの注文（未精算）' : '注文履歴'}>
            {items.length ? (
              <ul className="divide-y divide-line text-[14px]">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 py-2">
                    <span className="w-11 shrink-0 text-[12px] text-sub tabular-nums">{i.time}</span>
                    <span className="min-w-0 flex-1 truncate">{i.name}{i.qty > 1 && <b className="text-brand"> ×{i.qty}</b>}</span>
                    <span className="font-bold tabular-nums">¥{i.amount.toLocaleString('ja-JP')}</span>
                    {canEdit && <RemoveButton id={i.id} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-[13px] text-mute">まだ注文はありません</p>
            )}
            <div className="mt-2 flex items-end justify-between border-t border-line pt-3">
              <span className="text-[14px] font-bold text-sub">合計</span>
              <span className="text-[22px] font-bold tabular-nums" data-testid="ordered-total">¥{orderedTotal.toLocaleString('ja-JP')}</span>
            </div>
          </Card>
        </div>
      </div>

      {canEdit && (
        <form action={action} className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-[0_8px_28px_rgba(42,20,80,0.14)] backdrop-blur">
          <input type="hidden" name="payload" value={payload} />
          <div className="min-w-0 flex-1">
            {state?.error ? (
              <p role="alert" className="text-[14px] font-bold text-up">{state.error}</p>
            ) : lines.length ? (
              <p className="text-[14px] text-sub">今回の注文 <b className="text-ink">{lines.reduce((a, l) => a + l.qty, 0)}点</b>
                <button type="button" onClick={() => setCart({})} className="ml-3 text-[13px] text-brand underline-offset-2 hover:underline">クリア</button>
              </p>
            ) : state?.ok && state.message ? (
              <p role="status" className="flex items-center gap-1.5 text-[14px] font-bold text-ok"><Check className="size-4" />{state.message}</p>
            ) : (
              <p className="text-[13px] text-mute">メニューをタップして数量を選んでください</p>
            )}
          </div>
          <button disabled={!lines.length || pending} data-testid="order-submit"
            className="btn-brand inline-flex h-14 min-w-64 items-center justify-center gap-2 rounded-xl px-6 text-[17px] font-bold disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}注文を登録（¥{cartTotal.toLocaleString('ja-JP')}）
          </button>
        </form>
      )}
    </div>
  )
}

/** 注文の削除（誤操作防止のため2回タップ） */
export function RemoveButton({ id }: { id: string }) {
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  if (pending) return <Loader2 className="size-4 animate-spin text-mute" />
  return (
    <span className="flex items-center gap-1">
      {error && <span className="text-[11px] text-up">{error}</span>}
      {armed ? (
        <>
          <button type="button" data-testid="remove-confirm" onClick={() => start(async () => { const r = await removeItemAction(id); if (r.error) setError(r.error); setArmed(false) })}
            className="h-9 rounded-lg bg-up px-3 text-[12px] font-bold text-white">削除</button>
          <button type="button" onClick={() => setArmed(false)} className="h-9 rounded-lg px-2 text-[12px] text-sub">戻す</button>
        </>
      ) : (
        <button type="button" aria-label="削除" data-testid="remove" onClick={() => setArmed(true)} className="grid size-9 place-items-center rounded-lg text-mute hover:bg-[#fff4f6] hover:text-up">
          <Trash2 className="size-4" />
        </button>
      )}
    </span>
  )
}
