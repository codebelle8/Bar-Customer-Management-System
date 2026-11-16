import { NextResponse, type NextRequest } from 'next/server'
import { GATE_COOKIE, gateToken, safeEqual } from '@/lib/gate'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

// 1. 確認用の公開環境（SITE_PASSWORD 設定時）は、閲覧用パスワードを入力するまで全ページを閉じる
// 2. 未ログインの場合はログイン画面へ（権限の最終確認は各ページ・各操作のデータアクセス層で行う）
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const sitePassword = process.env.SITE_PASSWORD
  if (sitePassword && pathname !== '/gate' && pathname !== '/api/gate') {
    const cookie = request.cookies.get(GATE_COOKIE)?.value ?? ''
    if (!safeEqual(cookie, await gateToken(sitePassword))) {
      const url = new URL('/gate', request.url)
      if (pathname !== '/') url.searchParams.set('next', pathname + search)
      return NextResponse.redirect(url)
    }
  }
  if (pathname === '/gate' || pathname === '/api/gate') return NextResponse.next()

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value)
  if (pathname === '/login') {
    return session ? NextResponse.redirect(new URL('/dashboard', request.url)) : NextResponse.next()
  }
  if (!session) {
    const url = new URL('/login', request.url)
    if (pathname !== '/') url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|brand/|img/|favicon.ico|robots.txt).*)'],
}
