'use client'
// 生年月日の入力：西暦／昭和／平成を選び、年・月・日を数字で入力する（新規入会の受付と同じ入力方法）
// 入力の途中では年齢を出さず、日付として正しいときだけ「〇〇歳」を表示する
import { useRef, useState, type Ref } from 'react'
import { cx } from '@/components/ui'
import { ageOn, fmtJaDate } from '@/lib/format'
import { MIN_AGE } from './rules'

export const ERAS = { 西暦: 0, 昭和: 1925, 平成: 1988 } as const
export type Era = keyof typeof ERAS

/** 年・月・日 → YYYY-MM-DD（入力の途中・ありえない日付は null） */
export function parseBirthday(era: Era, y: string, m: string, d: string) {
  if (!y || !m || !d) return null
  const yy = era === '西暦' ? +y : ERAS[era] + +y
  if (era === '西暦' && (y.length !== 4 || yy < 1900)) return null
  if (era === '昭和' && (+y < 1 || +y > 64)) return null
  if (era === '平成' && (+y < 1 || +y > 31)) return null
  const iso = `${yy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const x = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(x.getTime()) || x.toISOString().slice(0, 10) !== iso) return null
  return iso
}

/** 日付として読めない理由（画面に表示） */
function invalidReason(era: Era, y: string) {
  if (era === '西暦' && y.length !== 4) return '西暦は4桁で入力してください（例：1990）'
  if (era === '西暦' && +y < 1900) return '1900年以降の年を入力してください'
  if (era === '昭和' && (+y < 1 || +y > 64)) return '昭和は1〜64年で入力してください'
  if (era === '平成' && (+y < 1 || +y > 31)) return '平成は1〜31年で入力してください'
  return 'その日付はありません（月・日を確認してください）'
}

/** 数字だけの入力欄（全角数字も半角に直す） */
export function NumBox({ label, value, onChange, width, max, placeholder, ref, testId, size = 'lg' }: {
  label: string; value: string; onChange: (v: string) => void; width: string; max: number; placeholder?: string; ref?: Ref<HTMLInputElement>; testId?: string
  size?: 'lg' | 'md'
}) {
  return (
    <label className="flex items-end gap-1.5">
      <input ref={ref} inputMode="numeric" value={value} placeholder={placeholder} data-testid={testId}
        onChange={(e) => onChange(e.target.value.normalize('NFKC').replace(/\D/g, '').slice(0, max))}
        className={cx(
          'rounded-xl border border-line bg-white px-3 text-center font-bold tabular-nums outline-none placeholder:text-[#d5cfe2] focus:border-brand focus:ring-2 focus:ring-brand/15',
          size === 'lg' ? 'h-14 text-[22px]' : 'h-12 text-[18px]', width,
        )} />
      <span className={cx('font-bold text-sub', size === 'lg' ? 'pb-3 text-[15px]' : 'pb-2.5 text-[14px]')}>{label}</span>
    </label>
  )
}

/** 会員の登録・編集フォーム用。選んだ日付は hidden の name で送る（未入力・入力途中は空） */
export function BirthdayInput({ name, defaultValue, today }: { name: string; defaultValue?: string | null; today: string }) {
  const init = defaultValue && /^\d{4}-\d{2}-\d{2}$/.test(defaultValue) ? defaultValue.split('-') : null
  const [era, setEra] = useState<Era>('西暦')
  const [y, setY] = useState(init?.[0] ?? '')
  const [m, setM] = useState(init ? String(+init[1]) : '')
  const [d, setD] = useState(init ? String(+init[2]) : '')
  const yearRef = useRef<HTMLInputElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)
  const iso = parseBirthday(era, y, m, d)
  const future = !!iso && iso > today
  const age = iso && !future ? ageOn(iso, today) : null
  const complete = !!(y && m && d)
  return (
    <div>
      <input type="hidden" name={name} value={iso ?? ''} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex overflow-hidden rounded-xl border border-line">
          {(Object.keys(ERAS) as Era[]).map((e) => (
            <button key={e} type="button" onClick={() => { if (e !== era) { setEra(e); setY(''); yearRef.current?.focus() } }}
              className={cx('h-12 px-3 text-[14px] font-bold transition', era === e ? 'bg-brand text-white' : 'bg-white text-sub hover:bg-page')}>{e}</button>
          ))}
        </div>
        <NumBox ref={yearRef} size="md" label="年" value={y} width="w-24" max={era === '西暦' ? 4 : 2} placeholder={era === '西暦' ? '1990' : '2'} testId="birth-y"
          onChange={(v) => { setY(v); if (v.length === (era === '西暦' ? 4 : 2)) monthRef.current?.focus() }} />
        <NumBox ref={monthRef} size="md" label="月" value={m} width="w-16" max={2} placeholder="5" testId="birth-m"
          onChange={(v) => { setM(v); if (v.length === 2 || +v > 1) dayRef.current?.focus() }} />
        <NumBox ref={dayRef} size="md" label="日" value={d} width="w-16" max={2} placeholder="14" testId="birth-d" onChange={setD} />
      </div>
      <p className="mt-1.5 min-h-5 text-[12px]" data-testid="birth-note">
        {age != null && (
          <span className={age < MIN_AGE ? 'font-bold text-up' : 'text-sub'}>
            {fmtJaDate(iso!)}生まれ・<b className="text-[14px]">{age}歳</b>{age < MIN_AGE && '（20歳未満は登録できません）'}
          </span>
        )}
        {future && <span className="text-up">未来の日付です</span>}
        {complete && !iso && <span className="text-up">{invalidReason(era, y)}</span>}
        {!complete && (y || m || d) && <span className="text-sub">年・月・日を最後まで入力してください（和暦は「昭和」「平成」を選んでから年を入力）</span>}
      </p>
    </div>
  )
}
