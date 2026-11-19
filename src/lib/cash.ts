// レジ金管理の確認項目（店舗の「レジ金引継ぎシート」と同じ並び。画面・サーバーで共通）
export interface CashItem {
  key: string
  label: string
}
export interface CashSection {
  key: string
  label: string
  items: CashItem[]
}

/** シートの 3 つの表に対応（見出しは店舗に確認中） */
export const CASH_SECTIONS: CashSection[] = [
  {
    key: 'open',
    label: '開店時',
    items: [
      { key: 'open_cash', label: 'レジ金' },
      { key: 'open_gift', label: 'ギフトカード' },
    ],
  },
  {
    key: 'shift',
    label: '昼の部→夜の部の引継ぎ',
    items: [
      { key: 'shift_cash_early', label: 'レジ金（早）' },
      { key: 'shift_visits', label: '来店履歴' },
      { key: 'shift_gift_early', label: 'ギフトカード（早）' },
      { key: 'shift_cash_late', label: 'レジ金（遅）' },
      { key: 'shift_gift_late', label: 'ギフトカード（遅）' },
    ],
  },
  {
    key: 'close',
    label: '締め',
    items: [
      { key: 'close_cash', label: 'レジ金' },
      { key: 'close_visits', label: '来店履歴' },
      { key: 'close_gift', label: 'ギフトカード' },
    ],
  },
]

export const CASH_ITEMS = CASH_SECTIONS.flatMap((s) => s.items.map((i) => ({ ...i, section: s.label })))
export const isCashItem = (k: string) => CASH_ITEMS.some((i) => i.key === k)
