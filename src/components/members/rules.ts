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
  { key: 'kana', label: 'フリガナ', required: false, aliases: ['フリガナ', 'ふりがな', 'カナ', 'よみがな', '読み', 'kana'] },
  { key: 'realName', label: '本名', required: false, aliases: ['本名', '氏名', '実名', 'realname'] },
  { key: 'gender', label: '性別', required: true, aliases: ['性別', '男女', 'gender', 'sex'] },
  { key: 'birthday', label: '生年月日', required: false, aliases: ['生年月日', '誕生日', '生年', 'birthday', 'birthdate', 'dob'] },
  { key: 'joinedAt', label: '入会日', required: false, aliases: ['入会日', '入会年月日', '初回登録日', '登録日', '入会', 'joined', 'joinedat', 'joindate'] },
  { key: 'memo', label: 'メモ（紹介者・備考）', required: false, aliases: ['メモ', '紹介者備考', '紹介者', '備考', '注意事項', 'memo', 'note', 'notes'] },
  { key: 'ban', label: '出禁の印', required: false, aliases: ['特典割引', '出禁', '出入禁止'] },
] as const

/**
 * 店舗の会員名簿（会員名簿ハーネス.xls の月別シート）の列の並び。見出しが空欄の列があるため、ボタンで一括して対応付ける
 *   A 会員番号・B 登録日・C ハンドルネーム・D フリガナ・E 本名・F 生年月日・I 性別・L 特典 割引（出禁の印）・M 紹介者 備考
 *   H 列（保険証確認・会社・番号）は取り込まない
 */
export const ROSTER_PRESET: Record<ImportKey, number> = { memberNo: 0, joinedAt: 1, handleName: 2, kana: 3, realName: 4, birthday: 5, gender: 8, ban: 11, memo: 12 }
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
  kana: string
  realName: string
  gender: string
  birthday: string
  joinedAt: string
  memo: string
  ban: string
}

/** 8桁以上の数字の並び（ハイフン・空白区切りを含む）。マイナンバー・保険証・電話番号などを取り込まないため */
export const LONG_NUMBER = /\d(?:[\s-]?\d){7,}/g

/** 名前・性別がない行（名簿の空き番号・年齢計算用のセルだけの行など）は取り込みの対象にしない */
export const isBlankRow = (r: ImportRow) => ![r.handleName, r.kana, r.realName, r.gender].some((v) => norm(v))

export interface CheckedRow {
  line: number
  memberNo: string
  handleName: string
  kana: string
  realName: string
  gender: '男性' | '女性' | null
  birthday: string | null
  joinedAt: string
  memo: string
  banned: boolean
  errors: string[]
  warnings: string[]
}

/**
 * 取込時の重複の扱い（2026-11-20 お客様確認：同じ会員番号の別の会員は、そのまま取り込む）
 * - 会員番号とハンドルネームが同じ行は「同じ会員」とみなし、2行目以降・登録済みの会員は取り込まない
 * - 会員番号だけが同じ行は、別の会員として取り込む（注意として表示）
 */
export const DUP = {
  sameInFile: 'ファイル内で同じ会員が重複（会員番号・ハンドルネームが同じ）',
  registered: '既に登録済み（会員番号・ハンドルネームが同じ）',
  noInFile: 'ファイル内に同じ会員番号の行あり（別の会員として取り込みます）',
  noRegistered: '同じ会員番号の会員が登録済み（別の会員として取り込みます）',
} as const

/** 同じ会員かどうかの判定に使うキー（会員番号＋ハンドルネーム。空白・全角半角・大文字小文字の違いは無視） */
export const memberKey = (memberNo: string, handleName: string) =>
  `${memberNo}\u0000${norm(handleName).replace(/\s+/g, '').toLowerCase()}`

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
      else if (ageOn(birthday, today) > 100) errors.push(`生年月日「${birthday.replaceAll('-', '/')}」が古すぎます`)
    }
  } else warnings.push('生年月日なし')
  let joinedAt = joinDefault
  // 名簿の登録日が「2019年」のように年だけの会員は、その年の1月1日で登録して「注意」として一覧に残す
  const yearOnly = norm(r.joinedAt).match(/^(\d{4})年?$/)
  if (yearOnly && +yearOnly[1] >= 1990 && `${yearOnly[1]}-01-01` <= today) {
    joinedAt = `${yearOnly[1]}-01-01`
    warnings.push('登録日が年のみのため1月1日で登録')
  } else if (norm(r.joinedAt)) {
    const j = parseDateLoose(r.joinedAt)
    if (!j) errors.push(`入会日「${norm(r.joinedAt)}」を読み取れません`)
    else if (j > today) errors.push('入会日が未来の日付です')
    else if (j < '1990-01-01') errors.push(`入会日「${j.replaceAll('-', '/')}」が古すぎます`)
    else {
      joinedAt = j
      if (birthday && birthday < j && ageOn(birthday, j) < MIN_AGE) warnings.push(`入会日の時点で${MIN_AGE}歳未満`)
    }
  } else warnings.push('入会日なし（本日で登録）')
  const kana = norm(r.kana)
  if (kana.length > 40) errors.push('フリガナは40文字以内')
  const realName = norm(r.realName)
  if (realName.length > 40) errors.push('本名は40文字以内')
  // 備考に書かれた長い番号（マイナンバー・保険証・電話番号など。8桁以上）は保存しない
  const rawMemo = norm(r.memo)
  const memo = rawMemo.replace(LONG_NUMBER, '【番号は取り込みません】')
  if (memo !== rawMemo) warnings.push('備考の長い番号（8桁以上）は取り込みません')
  if (memo.length > 500) errors.push('メモは500文字以内')
  const banned = /出禁|出入禁止/.test(norm(r.ban))
  return { line: r.line, memberNo, handleName, kana, realName, gender, birthday, joinedAt, memo, banned, errors, warnings }
}
