import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'

// アカウント無効化などでセッションが使えなくなった場合に Cookie を消してログイン画面へ戻す
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', request.url))
  res.cookies.delete(SESSION_COOKIE)
  return res
}
