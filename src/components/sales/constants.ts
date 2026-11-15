// 売上管理・レポートで共通に使う定数・計算（サーバー・クライアントの両方から使う）

export type ExpenseKind = 'expense' | 'tax' | 'parttime'

export const EXPENSE_KINDS: { key: ExpenseKind; label: string; namePlaceholder: string; nameLabel: string }[] = [
  { key: 'expense', label: '経費', nameLabel: '内容（備考）', namePlaceholder: '例：まいばす.アマゾン' },
  { key: 'tax', label: '税金', nameLabel: '税金名称', namePlaceholder: '例：酒税・消費税など' },
  { key: 'parttime', label: 'アルバイト', nameLabel: '氏名・メモ', namePlaceholder: '例：アルバイト代（〇〇さん）' },
]

export const KIND_LABEL: Record<ExpenseKind, string> = { expense: '経費', tax: '税金', parttime: 'アルバイト' }

/** 金額の上限（経費・調整とも） */
export const AMOUNT_MAX = 10_000_000

/** 総括の標準の調整項目（Excel と同じ）。口座移動は経費合計に含めない */
export const STD_ADJ = ['龍経費', '46経費', '口座移動'] as const
export const ACCOUNT_MOVE = '口座移動'

export const isYm = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
export const isYmd = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** 全角数字・カンマ・円記号を取り除いて半角の数字だけにする */
export const normalizeAmount = (s: unknown) =>
  String(s ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，、¥￥円\s]/g, '')

/** Excel のシート名・ファイル名用の年月表記（2026.10） */
export const dotMonth = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(5, 7)}`

/**
 * 総括の調整（stats.ts の summaryOf と同じ考え方）
 *   経費合計＝口座移動以外の調整（龍経費＋46経費＋任意の項目）
 *   差引現金残＝現金残 − 経費合計 − 口座移動
 *   差引現金合計＝計算方法は確認中（現在は差引現金残と同額）
 */
export function adjustmentTotals(cashLeft: number, adjs: { label: string; amount: number }[]) {
  const expenseItems = adjs.filter((a) => a.label !== ACCOUNT_MOVE)
  const expenseSum = expenseItems.reduce((a, b) => a + b.amount, 0)
  const move = adjs.filter((a) => a.label === ACCOUNT_MOVE).reduce((a, b) => a + b.amount, 0)
  const net = cashLeft - expenseSum - move
  return { expenseItems, expenseSum, move, net, netTotal: net }
}
