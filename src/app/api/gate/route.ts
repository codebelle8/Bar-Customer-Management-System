import { NextResponse, type NextRequest } from 'next/server'
import { GATE_COOKIE, GATE_DAYS, gateToken, safeEqual, safeNext } from '@/lib/gate'

// サイト全体のパスワードの確認（確認用の公開環境のみ）
export async function POST(request: NextRequest) {
  const expected = process.env.SITE_PASSWORD
  const form = await request.formData()
  const next = safeNext(String(form.get('next') ?? ''))
  if (!expected) return NextResponse.redirect(new URL(next, request.url), 303)
  const input = String(form.get('password') ?? '')
  if (!safeEqual(input, expected)) {
    await new Promise((r) => setTimeout(r, 700)) // 総当たり対策の待ち時間
    const back = new URL('/gate', request.url)
    back.searchParams.set('error', '1')
    back.searchParams.set('next', next)
    return NextResponse.redirect(back, 303)
  }
  const res = NextResponse.redirect(new URL(next, request.url), 303)
  res.cookies.set(GATE_COOKIE, await gateToken(expected), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: GATE_DAYS * 86400,
  })
  return res
}
