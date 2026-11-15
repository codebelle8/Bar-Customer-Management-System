// セッション（HttpOnly Cookie に署名付きトークンを保存）。proxy からも使うため server-only は付けない
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'hs_session'
export const STORE_COOKIE = 'hs_store'
export const SESSION_HOURS = 14 // 営業1回分（昼〜深夜）を想定

export interface SessionPayload {
  uid: string
  role: 'owner' | 'staff'
  sid: string | null // スタッフの所属店舗
  /** パスワードの指紋（パスワード変更・再発行で既存のセッションを無効にする） */
  pwv?: string
}

function key() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET（32文字以上）を設定してください')
    return new TextEncoder().encode('dev-only-insecure-session-secret-change-me!!')
  }
  return new TextEncoder().encode(secret)
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    return { uid: String(payload.uid), role: payload.role === 'owner' ? 'owner' : 'staff', sid: (payload.sid as string | null) ?? null, pwv: typeof payload.pwv === 'string' ? payload.pwv : undefined }
  } catch {
    return null
  }
}
