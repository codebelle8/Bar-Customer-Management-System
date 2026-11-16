// 公開環境（確認用）のサイト全体のパスワード。環境変数 SITE_PASSWORD を設定した場合のみ有効
// proxy からも使うため Web Crypto で実装（server-only は付けない）
export const GATE_COOKIE = 'hs_gate'
export const GATE_DAYS = 30

export const gateEnabled = () => !!process.env.SITE_PASSWORD

/** Cookie に保存する値：パスワードそのものではなく、署名用の秘密鍵で作った HMAC */
export async function gateToken(password: string): Promise<string> {
  const secret = process.env.SESSION_SECRET || 'dev-only-insecure-session-secret-change-me!!'
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`gate:${password}`)))
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 長さに関係なく一定時間で比較 */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** 戻り先として安全な相対パスか */
export const safeNext = (next: string | null | undefined) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/login')
