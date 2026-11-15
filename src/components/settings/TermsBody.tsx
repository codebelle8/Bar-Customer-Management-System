// 会員規約の本文（原本の書式：文字は黒、「!!」太字・下線、「!」太字）
import { parseTerms } from '@/lib/terms'
import { cx } from '@/components/ui'

/** 原本に合わせた明朝体 */
export const MINCHO = '"Yu Mincho", YuMincho, "Hiragino Mincho ProN", "Hiragino Mincho Pro", "Noto Serif JP", "MS PMincho", serif'

export function TermsBody({ text, className }: { text: string; className?: string }) {
  const lines = parseTerms(text)
  return (
    <div className={className}>
      {lines.map((l, i) =>
        'blank' in l ? (
          <div key={i} aria-hidden className="h-[1em]" />
        ) : (
          <p
            key={i}
            className={cx(l.level >= 1 && 'font-bold', l.level === 2 && 'underline decoration-1 underline-offset-[3px]')}
          >
            {l.text}
          </p>
        ),
      )}
    </div>
  )
}
