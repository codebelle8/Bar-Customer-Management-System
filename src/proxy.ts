import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

// 未ログインの場合はログイン画面へ（権限の最終確認は各ページ・各操作のデータアクセス層で行う）
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
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
