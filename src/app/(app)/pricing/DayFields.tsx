'use client'

// 料金カレンダー：選択した日付の個別設定（料金区分・ラベル・個別料金・期間）
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Category, CustomPrices, DayPart, DayType } from '@/db/schema'
import { Button, Field, Input, Select, cx, inputCls } from '@/components/ui'
import { SubmitButton, useFormCtx } from '@/components/settings/form'
import { NO_SPIN } from '@/components/settings/fields'

const TYPES: DayType[] = ['平日', '週末', '祝日', 'イベント']
const PARTS: { key: DayPart; label: string }[] = [{ key: '昼', label: '昼の部' }, { key: '夜', label: '夜の部' }]
const CATS: Category[] = ['男性', '女性', 'カップル']
const CAT_TONE: Record<Category, string> = { 男性: 'text-info', 女性: 'text-[#c8457e]', カップル: 'text-brand' }

export type PriceTable = Record<DayType, Record<DayPart, Record<Category, number>>>

const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10)
}

export function DayFields({ date, override, autoType, autoLabel, table }: {
  date: string
  override: { dayType: DayType; label: string; customPrices: CustomPrices | null } | null
  autoType: DayType
  autoLabel: string
  table: PriceTable
}) {
  const [type, setType] = useState<DayType | 'auto'>(override?.dayType ?? 'auto')
  const auto = type === 'auto'
  const shown: DayType = auto ? autoType : type
  const { pending } = useFormCtx()
  return (
    <div className="space-y-4">
      <input type="hidden" name="from" value={date} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="料金区分">
          <Select name="dayType" value={type} onChange={(e) => setType(e.target.value as DayType | 'auto')}>
            <option value="auto">自動（祝日・曜日から判定）→ {autoType}{autoLabel ? `・${autoLabel}` : ''}</option>
            {TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        </Field>
        <Field label="ラベル（カレンダーに表示）" hint={auto ? '自動判定ではラベルは使いません' : '例：ビンゴイベント'}>
          <Input name="label" defaultValue={override?.label ?? ''} maxLength={40} disabled={auto} placeholder={auto ? '' : 'ビンゴイベント'} />
        </Field>
      </div>

      <div className={cx(auto && 'opacity-50')}>
        <p className="mb-1.5 text-[12px] font-medium text-sub">個別料金（任意）<span className="ml-2 font-normal text-mute">空欄は料金表の「{shown}」の金額になります</span></p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-[#f8f6fc]">
              <tr>
                <th className="w-16 px-3 py-2" />
                {CATS.map((c) => <th key={c} className={cx('px-2 py-2 text-left text-[12px] font-medium', CAT_TONE[c])}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {PARTS.map((p) => (
                <tr key={p.key} className="border-t border-line">
                  <td className="px-2 py-2 text-[12px] font-medium whitespace-nowrap text-sub">{p.label}</td>
                  {CATS.map((c) => (
                    <td key={c} className="px-1.5 py-2">
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[12px] text-mute">¥</span>
                        <input
                          type="number" inputMode="numeric" min={0} step={100}
                          name={`c_${p.key}_${c}`}
                          defaultValue={override?.customPrices?.[p.key]?.[c] ?? ''}
                          placeholder={table[shown][p.key][c].toLocaleString('ja-JP')}
                          disabled={auto}
                          aria-label={`${p.label}・${c}の個別料金`}
                          className={cx(inputCls, NO_SPIN, 'h-9 min-w-0 pr-2 pl-5 text-right text-[13px] tabular-nums placeholder:text-[#c9c3d6]')}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Field label="終了日（連日のイベントは同じ設定をまとめて適用）" hint="開始日〜終了日の各日に同じ設定を保存します（最大31日・既存の個別設定は上書き）">
        <Input type="date" name="to" defaultValue={date} min={date} max={addDays(date, 30)} className="max-w-56" />
      </Field>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SubmitButton size="lg">{auto ? '自動判定にする' : 'この設定を保存'}</SubmitButton>
        {override && (
          <Button type="submit" name="intent" value="clear" variant="danger" size="lg" disabled={pending}
            data-confirm="この日（終了日までの期間）の個別設定を削除し、祝日・曜日による自動判定に戻します。よろしいですか？">
            <RotateCcw className="size-4" />自動に戻す
          </Button>
        )}
      </div>
    </div>
  )
}
