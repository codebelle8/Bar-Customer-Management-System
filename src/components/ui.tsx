import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({ children, className, title, action, bodyClass }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; bodyClass?: string }) {
  return (
    <section className={cx('card', className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-5 pt-4">
          <h2 className="section-title min-w-0">{title}</h2>
          {action}
        </div>
      )}
      <div className={cx(title ? 'px-5 pt-3 pb-5' : 'p-5', bodyClass)}>{children}</div>
    </section>
  )
}

type Variant = 'brand' | 'soft' | 'outline' | 'ghost' | 'danger' | 'default'
export const buttonCls = (variant: Variant = 'default', size: 'sm' | 'md' | 'lg' = 'md') =>
  cx(
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'h-8 px-3 text-[12px]' : size === 'lg' ? 'h-12 px-5 text-[15px]' : 'h-10 px-4 text-[13px]',
    variant === 'brand' && 'btn-brand',
    variant === 'soft' && 'btn-brand-soft',
    variant === 'outline' && 'border border-brand/60 bg-white text-brand hover:bg-brand-soft',
    variant === 'default' && 'border border-line bg-white text-ink hover:bg-page',
    variant === 'ghost' && 'text-sub hover:bg-page hover:text-ink',
    variant === 'danger' && 'border border-[#f2c2cb] bg-white text-up hover:bg-[#fff4f6]',
  )

export function Button({ variant = 'default', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return <button {...p} className={cx(buttonCls(variant, size), className)} />
}

export const inputCls =
  'h-10 w-full rounded-lg border border-line bg-white px-3 text-[14px] text-ink placeholder:text-mute outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15'

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, className)} />
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, 'h-auto min-h-20 py-2 leading-relaxed', className)} />
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cx(inputCls, 'appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a29cb4' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  )
}

export function Field({ label, children, required, hint, className }: { label: string; children: ReactNode; required?: boolean; hint?: string; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[12px] font-medium text-sub">
        {label}
        {required && <span className="ml-1 text-up">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-mute">{hint}</span>}
    </label>
  )
}

type Tone = 'green' | 'blue' | 'purple' | 'gray' | 'red' | 'amber' | 'pink'
const TONE: Record<Tone, string> = {
  green: 'bg-[#e3f6ea] text-[#1f9d57]',
  blue: 'bg-[#e6f0ff] text-[#2f6fdc]',
  purple: 'bg-brand-soft text-brand',
  gray: 'bg-[#f0eef4] text-sub',
  red: 'bg-[#fde7eb] text-[#d6455d]',
  amber: 'bg-[#fff3d6] text-[#b7791f]',
  pink: 'bg-[#fdeaf2] text-[#c8457e]',
}
export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap', TONE[tone], className)}>{children}</span>
}

export function Kpi({ icon, label, value, unit, sub, className }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('card px-5 py-4', className)}>
      <div className="flex items-center gap-2.5 text-[14px] font-bold text-ink">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-[28px] leading-none font-bold tracking-tight">{value}</span>
        {unit && <span className="pb-0.5 text-[14px] font-bold">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-[12px] text-sub">{sub}</div>}
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx('px-3 py-2.5 text-left text-[12px] font-medium whitespace-nowrap text-sub', className)}>{children}</th>
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('px-3 py-2.5 whitespace-nowrap', className)}>{children}</td>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-[13px] text-mute">{children}</div>
}

export function PageHeader({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <h1 className="text-[22px] font-bold">{title}</h1>
      {children}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
