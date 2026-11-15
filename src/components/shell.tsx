'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  Bell, CalendarDays, ChartColumn, ChevronDown, FileText, Gift, House, KeyRound, LineChart, LogOut, Menu, Settings, UserCheck, UserCog, Users, X,
} from 'lucide-react'
import { logout, selectStore } from '@/app/actions'
import { cx } from './ui'

export const NAV = [
  { href: '/dashboard', label: 'ダッシュボード', icon: House, owner: false },
  { href: '/reception', label: '来店受付', icon: UserCheck, owner: false },
  { href: '/members', label: '会員管理', icon: Users, owner: false },
  { href: '/sales', label: '売上管理', icon: ChartColumn, owner: false },
  { href: '/pricing', label: '料金設定・カレンダー', icon: CalendarDays, owner: true },
  { href: '/discounts', label: '割引・特典', icon: Gift, owner: false },
  { href: '/reports', label: 'レポート', icon: LineChart, owner: true },
  { href: '/staff', label: 'スタッフ管理', icon: UserCog, owner: true },
  { href: '/settings', label: '設定', icon: Settings, owner: true },
  { href: '/terms', label: '会員規約', icon: FileText, owner: false },
] as const

function NavList({ isOwner, onNavigate }: { isOwner: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="space-y-1 px-3">
      {NAV.filter((n) => isOwner || !n.owner).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link key={href} href={href} onClick={onNavigate}
            className={cx(
              'flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium transition',
              active ? 'bg-gradient-to-r from-[#5b2aae] to-[#7c4ae0] text-white shadow-[0_6px_16px_rgba(109,53,201,0.35)]' : 'text-[#d9cff0] hover:bg-white/8 hover:text-white',
            )}>
            <Icon className="size-5" strokeWidth={1.8} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarBody({ isOwner, onNavigate }: { isOwner: boolean; onNavigate?: () => void }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-side via-side-2 to-side-3">
      <Link href="/dashboard" onClick={onNavigate} className="relative z-10 block px-6 pt-6 pb-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-white.png" alt="HARNES TOKYO" className="mx-auto w-[176px]" />
      </Link>
      <div className="relative z-10 scrollbar-thin flex-1 overflow-y-auto pb-40">
        <NavList isOwner={isOwner} onNavigate={onNavigate} />
      </div>
      {/* 下部の店内写真（店舗サイトの写真。上端はサイドバーの色になじませる） */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/sidebar.jpg" alt="" className="size-full object-cover object-[60%_50%] opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-b from-side-3 via-side-3/25 to-transparent" />
      </div>
    </div>
  )
}

export function Sidebar({ isOwner }: { isOwner: boolean }) {
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-[260px] shrink-0 lg:block">
      <SidebarBody isOwner={isOwner} />
    </aside>
  )
}

function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close()
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, close])
  return ref
}

export interface Notice {
  text: string
  href: string
}

export function Topbar(props: {
  isOwner: boolean
  stores: { id: string; name: string; status: string }[]
  storeId: string
  storeName: string
  userName: string
  roleLabel: string
  dateLabel: string
  notices: Notice[]
}) {
  const { isOwner, stores, storeId, storeName, userName, roleLabel, dateLabel, notices } = props
  const pathname = usePathname()
  const title = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))?.label ?? ''
  const [menu, setMenu] = useState(false)
  const [user, setUser] = useState(false)
  const [bell, setBell] = useState(false)
  const userRef = useOutside<HTMLDivElement>(user, () => setUser(false))
  const bellRef = useOutside<HTMLDivElement>(bell, () => setBell(false))
  return (
    <>
      <header className="no-print sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur lg:px-8">
        <button onClick={() => setMenu(true)} className="rounded-lg p-2 text-ink hover:bg-page lg:hidden" aria-label="メニュー">
          <Menu className="size-5" />
        </button>
        <h1 className="min-w-0 truncate text-[20px] font-bold whitespace-nowrap xl:text-[24px]">{title}</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3 xl:gap-4">
          <div className="hidden items-center gap-2 md:flex">
            <span className="hidden text-[13px] font-medium whitespace-nowrap text-sub xl:inline">店舗：</span>
            {isOwner ? (
              <form action={selectStore}>
                <input type="hidden" name="back" value={pathname} />
                <select name="storeId" defaultValue={storeId} onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  className="h-10 min-w-44 rounded-lg border border-line bg-white px-3 text-[14px] font-medium outline-none focus:border-brand" aria-label="店舗">
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.status === 'preparing' && !s.name.includes('準備中') ? '（準備中）' : ''}</option>
                  ))}
                </select>
              </form>
            ) : (
              <span className="flex h-10 items-center rounded-lg border border-line bg-page px-3 text-[14px] font-medium whitespace-nowrap">{storeName}</span>
            )}
          </div>
          <span className="hidden h-10 items-center gap-2 rounded-lg border border-line px-3 text-[14px] font-medium whitespace-nowrap lg:flex">
            <CalendarDays className="size-4 text-sub" />
            {dateLabel}
          </span>
          <div ref={bellRef} className="relative">
            <button onClick={() => setBell(!bell)} className="relative rounded-full p-2 hover:bg-page" aria-label="お知らせ">
              <Bell className="size-5" />
              {notices.length > 0 && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-[#c026d3] ring-2 ring-white" />}
            </button>
            {bell && (
              <div className="animate-fade-in absolute right-0 mt-2 w-72 rounded-xl border border-line bg-white py-2 shadow-xl">
                <p className="px-4 pb-1 text-[12px] font-bold text-sub">お知らせ</p>
                {notices.length ? notices.map((n) => (
                  <Link key={n.text} href={n.href} onClick={() => setBell(false)} className="block px-4 py-2 text-[13px] hover:bg-page">{n.text}</Link>
                )) : <p className="px-4 py-2 text-[13px] text-mute">新しいお知らせはありません</p>}
              </div>
            )}
          </div>
          <div ref={userRef} className="relative">
            <button onClick={() => setUser(!user)} className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-page">
              <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#3b2463] to-[#6d35c9] text-[14px] font-bold text-white">{userName.slice(0, 1)}</span>
              <span className="hidden text-[14px] font-medium whitespace-nowrap xl:inline">{roleLabel}</span>
              <ChevronDown className="hidden size-4 text-sub xl:block" />
            </button>
            {user && (
              <div className="animate-fade-in absolute right-0 mt-2 w-56 rounded-xl border border-line bg-white py-1 shadow-xl">
                <div className="border-b border-line px-4 py-3">
                  <p className="text-[14px] font-bold">{userName}</p>
                  <p className="text-[12px] text-sub">{roleLabel}・{storeName}</p>
                </div>
                <Link href="/account" onClick={() => setUser(false)} className="flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-page">
                  <KeyRound className="size-4 text-sub" /> パスワード変更
                </Link>
                <form action={logout}>
                  <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-up hover:bg-page">
                    <LogOut className="size-4" /> ログアウト
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </header>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenu(false)} />
          <div className="animate-fade-in absolute inset-y-0 left-0 w-[270px]">
            <button onClick={() => setMenu(false)} className="absolute top-4 right-3 z-20 p-1 text-white" aria-label="閉じる">
              <X className="size-5" />
            </button>
            <SidebarBody isOwner={isOwner} onNavigate={() => setMenu(false)} />
          </div>
        </div>
      )}
    </>
  )
}
