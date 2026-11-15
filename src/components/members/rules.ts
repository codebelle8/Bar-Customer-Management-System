// 会員管理の共通ルール（画面・サーバーの両方で使う純粋関数）
import { ageOn } from '@/lib/format'

export const MIN_AGE = 20
export const PAGE_SIZE = 50

export type MemberStatus = 'active' | 'banned' | 'withdrawn'
export const STATUS_LABEL: Record<MemberStatus, string> = { active: '有効', banned: '出入禁止', withdrawn: '退会' }
export const STATUS_TONE: Record<MemberStatus, 'green' | 'red' | 'gray'> = { active: 'green', banned: 'red', withdrawn: 'gray' }

/** 全角→半角・前後の空白除去 */
export const norm = (v: unknown) => String(v ?? '').normalize('NFKC').trim()

/**
 * 入力された会員番号を店舗の形式にそろえる
 *   "10234" / "H-10234" / "h10234" / "Ｈ－１０２３４" → "H-10234"（数字以外の番号はそのまま）
 */
export function normalizeMemberNo(input: unknown, prefix: string): string {
  const s = norm(input).replace(/\s+/g, '').replace(/[‐－―ー]/g, '-')
  if (!s) return ''
  if (/^\d+$/.test(s)) return prefix + s
  const up = s.toUpperCase()
  if (prefix && up.startsWith(prefix.toUpperCase())) return prefix + s.slice(prefix.length)
  const bare = prefix.replace(/[-_]+$/, '')
  if (bare && up.startsWith(bare.toUpperCase()) && /^\d+$/.test(s.slice(bare.length))) return prefix + s.slice(bare.length)
  return s
}

/** 店舗の接頭辞の後ろが数字だけなら、その数値（自動採番との衝突チェック用） */
export function memberNoNumber(no: string, prefix: string): number | null {
  if (!no.startsWith(prefix)) return null
  const rest = no.slice(prefix.length)
  return /^\d{1,9}$/.test(rest) ? Number(rest) : null
}

export function parseGender(v: unknown): '男性' | '女性' | null {
  const s = norm(v).toLowerCase()
  if (['男', '男性', 'm', 'male', 'man', '♂', 'おとこ', 'otoko'].includes(s)) return '男性'
  if (['女', '女性', 'f', 'female', 'woman', '♀', 'おんな', 'onna'].includes(s)) return '女性'
  return null
}

const ERA: Record<string, number> = { 明治: 1867, 大正: 1911, 昭和: 1925, 平成: 1988, 令和: 2018, m: 1867, t: 1911, s: 1925, h: 1988, r: 2018 }

function ymd(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

/**
 * 日付の読み取り（Excel のシリアル値・西暦・和暦に対応）
 *   1990/1/2・1990-01-02・1990年1月2日・19900102・昭和60年1月2日・H2.3.4 など
 */
export function parseDateLoose(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    // Excel のシリアル値（1900年方式）
    if (v < 61 || v > 80000) return null
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10)
  }
  if (v instanceof Date) return isNaN(+v) ? null : ymd(v.getFullYear(), v.getMonth() + 1, v.getDate())
  const s = norm(v).split(/[\sT]/)[0]
  let m = s.match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?$/)
  if (m) return ymd(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return ymd(+m[1], +m[2], +m[3])
  m = s.match(/^(明治|大正|昭和|平成|令和|[mtshr])(\d{1,2}|元)[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?$/i)
  if (m) return ymd(ERA[m[1].toLowerCase()] + (m[2] === '元' ? 1 : +m[2]), +m[3], +m[4])
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDateLoose(Number(s))
  return null
}

/** 生年月日のチェック（空欄は null を返す） */
export function birthdayError(birthday: string | null, today: string): string | null {
  if (!birthday) return null
  if (birthday > today) return '生年月日が未来の日付です'
  if (ageOn(birthday, today) < MIN_AGE) return `${MIN_AGE}歳未満は登録できません`
  return null
}

/** ひらがな・カタカナのどちらで入力しても検索できるように */
export function kanaVariants(q: string): string[] {
  const hira = q.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  const kata = q.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
  return [...new Set([q, hira, kata])]
}

/* ------------------------------ Excel 取込 ------------------------------ */

export const IMPORT_FIELDS = [
  { key: 'memberNo', label: '会員番号', required: true, aliases: ['会員番号', '会員no', '会員no.', '会員ナンバー', '番号', 'no', 'no.', 'id', '会員id', 'カード番号', 'memberno', 'member_no'] },
  { key: 'handleName', label: 'ハンドルネーム', required: true, aliases: ['ハンドルネーム', 'ハンドル名', 'ハンドル', 'ニックネーム', 'hn', '名前', '呼び名', 'handle', 'handlename', 'name', 'nickname'] },
  { key: 'gender', label: '性別', required: true, aliases: ['性別', '男女', 'gender', 'sex'] },
  { key: 'birthday', label: '生年月日', required: false, aliases: ['生年月日', '誕生日', '生年', 'birthday', 'birthdate', 'dob'] },
  { key: 'joinedAt', label: '入会日', required: false, aliases: ['入会日', '入会年月日', '登録日', '入会', 'joined', 'joinedat', 'joindate'] },
  { key: 'memo', label: 'メモ', required: false, aliases: ['メモ', '備考', '注意事項', 'memo', 'note', 'notes'] },
] as const
export type ImportKey = (typeof IMPORT_FIELDS)[number]['key']

export const headerKey = (v: unknown) => norm(v).toLowerCase().replace(/[\s_・:：()（）]/g, '')

/** 見出し行から列の対応を推定する */
export function detectColumns(header: unknown[]): Partial<Record<ImportKey, number>> {
  const keys = header.map(headerKey)
  const map: Partial<Record<ImportKey, number>> = {}
  for (const f of IMPORT_FIELDS) {
    const aliases = f.aliases.map(headerKey)
    let idx = keys.findIndex((k) => aliases.includes(k))
    if (idx < 0) idx = keys.findIndex((k) => k && aliases.some((a) => a.length >= 2 && k.includes(a)))
    if (idx >= 0 && !Object.values(map).includes(idx)) map[f.key] = idx
  }
  return map
}

export interface ImportRow {
  line: number
  memberNo: string
  handleName: string
  gender: string
  birthday: string
  joinedAt: string
  memo: string
}

export interface CheckedRow {
  line: number
  memberNo: string
  handleName: string
  gender: '男性' | '女性' | null
  birthday: string | null
  joinedAt: string
  memo: string
  errors: string[]
  warnings: string[]
}

/** 1行分のチェック（重複以外。重複は呼び出し側で確認） */
export function checkImportRow(r: ImportRow, prefix: string, today: string, joinDefault = today): CheckedRow {
  const errors: string[] = []
  const warnings: string[] = []
  const memberNo = normalizeMemberNo(r.memberNo, prefix)
  if (!memberNo) errors.push('会員番号がありません')
  else if (memberNo.length > 30) errors.push('会員番号が長すぎます')
  const handleName = norm(r.handleName)
  if (!handleName) errors.push('ハンドルネームがありません')
  else if (handleName.length > 40) errors.push('ハンドルネームは40文字以内')
  const gender = parseGender(r.gender)
  if (!gender) errors.push(norm(r.gender) ? `性別「${norm(r.gender)}」が不明` : '性別がありません')
  let birthday: string | null = null
  if (norm(r.birthday)) {
    birthday = parseDateLoose(r.birthday)
    if (!birthday) errors.push(`生年月日「${norm(r.birthday)}」を読み取れません`)
    else {
      const e = birthdayError(birthday, today)
      if (e) errors.push(e)
    }
  } else warnings.push('生年月日なし')
  let joinedAt = joinDefault
  if (norm(r.joinedAt)) {
    const j = parseDateLoose(r.joinedAt)
    if (!j) errors.push(`入会日「${norm(r.joinedAt)}」を読み取れません`)
    else if (j > today) errors.push('入会日が未来の日付です')
    else joinedAt = j
  } else warnings.push('入会日なし（本日で登録）')
  const memo = norm(r.memo)
  if (memo.length > 500) errors.push('メモは500文字以内')
  return { line: r.line, memberNo, handleName, gender, birthday, joinedAt, memo, errors, warnings }
}
