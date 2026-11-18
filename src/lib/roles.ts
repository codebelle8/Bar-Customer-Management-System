// 権限の種類と表示名（サーバー・画面の両方から使う）
import type { Role } from '@/db/schema'

export type { Role }

/** 画面上部などの短い表示 */
export const ROLE_LABEL: Record<Role, string> = { owner: 'オーナー', store_owner: '店舗オーナー', staff: 'スタッフ' }

/** 権限の選択肢・説明 */
export const ROLE_DESC: Record<Role, string> = {
  owner: 'オーナー（全店舗・全機能）',
  store_owner: '店舗オーナー（所属店舗の全機能）',
  staff: 'スタッフ（所属店舗の受付・会員・売上）',
}

export const isRole = (v: unknown): v is Role => v === 'owner' || v === 'store_owner' || v === 'staff'
