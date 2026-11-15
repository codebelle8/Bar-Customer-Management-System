'use client'

import type { SelectHTMLAttributes } from 'react'
import { Select } from '@/components/ui'

/** 選択したらすぐに絞り込む（検索フォーム内で使う） */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}
