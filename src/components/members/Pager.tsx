import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from '@/components/ui'

/** ページ送り（1 … 4 5 [6] 7 8 … 20） */
export function Pager({ page, pages, hrefFor, className }: { page: number; pages: number; hrefFor: (p: number) => string; className?: string }) {
  if (pages <= 1) return null
  const nums: (number | '…')[] = []
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) nums.push(p)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const cell = 'flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-[13px] font-medium tabular-nums transition'
  return (
    <nav className={cx('flex flex-wrap items-center justify-center gap-1', className)} aria-label="ページ送り">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={cx(cell, 'border border-line bg-white hover:bg-page')} aria-label="前のページ"><ChevronLeft className="size-4" /></Link>
      ) : <span className={cx(cell, 'border border-line text-mute')}><ChevronLeft className="size-4" /></span>}
      {nums.map((n, i) =>
        n === '…' ? (
          <span key={`e${i}`} className={cx(cell, 'text-mute')}>…</span>
        ) : (
          <Link key={n} href={hrefFor(n)} aria-current={n === page ? 'page' : undefined}
            className={cx(cell, n === page ? 'btn-brand' : 'border border-line bg-white hover:bg-page')}>
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={cx(cell, 'border border-line bg-white hover:bg-page')} aria-label="次のページ"><ChevronRight className="size-4" /></Link>
      ) : <span className={cx(cell, 'border border-line text-mute')}><ChevronRight className="size-4" /></span>}
    </nav>
  )
}
