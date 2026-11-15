'use client'

// 画面の明るさ（ライト／ダーク／端末の設定に合わせる）の切り替え
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { THEME_COOKIE, type ThemePref } from '@/lib/theme'
import { cx } from './ui'

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'ライト', icon: Sun },
  { value: 'dark', label: 'ダーク', icon: Moon },
  { value: 'system', label: '端末の設定に合わせる', icon: Monitor },
]

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

/** 設定を <html> に反映（印刷用ページは常にライト） */
function apply(pref: ThemePref) {
  const root = document.documentElement
  root.dataset.themePref = pref
  const dark = pref === 'dark' || (pref === 'system' && systemDark())
  root.dataset.theme = dark && !location.pathname.startsWith('/print/') ? 'dark' : 'light'
}

/** 設定を Cookie に保存（次回のサーバー描画から反映） */
function persist(pref: ThemePref) {
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax`
}

export function ThemeToggle({ initial, className, align = 'right' }: { initial: ThemePref; className?: string; align?: 'left' | 'right' }) {
  const [pref, setPref] = useState<ThemePref>(initial)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dark = useIsDark()

  // 「端末の設定に合わせる」のときは OS の切り替えに追従
  useEffect(() => {
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => apply('system')
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [pref])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const choose = (v: ThemePref) => {
    setPref(v)
    setOpen(false)
    apply(v)
    persist(v)
  }

  const Icon = pref === 'system' ? Monitor : dark ? Moon : Sun
  return (
    <div ref={ref} className={cx('relative', className)}>
      <button type="button" onClick={() => setOpen(!open)} className="rounded-full p-2 text-ink hover:bg-page" aria-label="画面の明るさ" aria-haspopup="menu" aria-expanded={open} title="画面の明るさ">
        <Icon className="size-5" />
      </button>
      {open && (
        <div role="menu" className={cx('animate-fade-in absolute z-50 mt-2 w-56 rounded-xl border border-line bg-white py-1.5 shadow-xl', align === 'right' ? 'right-0' : 'left-0')}>
          <p className="px-4 pt-1 pb-1.5 text-[12px] font-bold text-sub">画面の明るさ</p>
          {OPTIONS.map(({ value, label, icon: I }) => (
            <button key={value} type="button" role="menuitemradio" aria-checked={pref === value} onClick={() => choose(value)}
              className={cx('flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] hover:bg-page', pref === value && 'font-bold text-brand')}>
              <I className="size-4" />
              <span className="flex-1">{label}</span>
              {pref === value && <Check className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 現在ダーク表示かどうか（グラフの色の切り替えなどに使う） */
export function useIsDark() {
  return useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb)
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      return () => mo.disconnect()
    },
    () => document.documentElement.dataset.theme === 'dark',
    () => false,
  )
}
