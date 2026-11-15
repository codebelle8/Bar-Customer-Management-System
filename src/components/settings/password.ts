// 初期パスワード・再発行パスワードの生成（読み間違えやすい文字を除く）
const LOWER = 'abcdefghjkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGIT = '23456789'

export function generatePassword(length = 10): string {
  const all = LOWER + UPPER + DIGIT
  const rand = (n: number) => {
    const buf = new Uint32Array(1)
    // 偏りを避けるため範囲外の値は捨てる
    const limit = Math.floor(0x100000000 / n) * n
    do globalThis.crypto.getRandomValues(buf)
    while (buf[0] >= limit)
    return buf[0] % n
  }
  // 英小文字・英大文字・数字を最低1文字ずつ含める
  const chars = [LOWER[rand(LOWER.length)], UPPER[rand(UPPER.length)], DIGIT[rand(DIGIT.length)]]
  while (chars.length < length) chars.push(all[rand(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
