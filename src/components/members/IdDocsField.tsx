import { PHOTO_ID_DOCS, SUB_ID_DOCS } from '@/lib/terms'
import { cx } from '@/components/ui'

/** 本人確認書類のチェック（どの書類を確認したかだけを記録。画像は保存しない） */
export function IdDocsField({ defaultValue = [], hint }: { defaultValue?: string[]; hint?: string }) {
  const group = (title: string, docs: string[]) => (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-mute">{title}</p>
      <div className="flex flex-wrap gap-2">
        {docs.map((d) => (
          <label key={d} className="cursor-pointer">
            <input type="checkbox" name="idDocs" value={d} defaultChecked={defaultValue.includes(d)} className="peer sr-only" />
            <span className={cx(
              'flex h-10 items-center rounded-lg border border-line bg-white px-3 text-[13px] text-sub transition select-none',
              'peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:font-bold peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/30',
            )}>
              {d}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
  return (
    <fieldset>
      <legend className="mb-1.5 block text-[12px] font-medium text-sub">本人確認書類（確認したもの）</legend>
      <div className="space-y-3 rounded-xl border border-line bg-page/60 p-3">
        {group('顔写真付き身分証', PHOTO_ID_DOCS)}
        {group('2点目（保険証など）', SUB_ID_DOCS)}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-mute">{hint}</span>}
    </fieldset>
  )
}

export function FieldError({ msg }: { msg?: string }) {
  return msg ? <span role="alert" className="mt-1 block text-[12px] font-medium text-up">{msg}</span> : null
}
