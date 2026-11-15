// SQL マイグレーション（./migrations）と同じ構造のテーブル定義（型付きクエリ用）
import { boolean, date, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export type DayType = '平日' | '週末' | '祝日' | 'イベント'
export type DayPart = '昼' | '夜'
export type Category = '男性' | '女性' | 'カップル'
export type Role = 'owner' | 'staff'
export type CustomPrices = Partial<Record<DayPart, Partial<Record<Category, number>>>>

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  status: text('status').notNull().default('active'),
  memberPrefix: text('member_prefix').notNull().default('H-'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  loginId: text('login_id').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<Role>().notNull(),
  storeId: text('store_id').references(() => stores.id),
  active: boolean('active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastLoginAt: ts('last_login_at'),
})

export const storeSettings = pgTable('store_settings', {
  storeId: text('store_id').primaryKey().references(() => stores.id),
  dayStart: text('day_start').notNull().default('12:00'),
  nightStart: text('night_start').notNull().default('19:00'),
  dayCutoff: text('day_cutoff').notNull().default('06:00'),
  weekendDays: jsonb('weekend_days').$type<number[]>().notNull().default([0, 6]),
  joinFee: integer('join_fee').notNull().default(0),
  annualFeeEnabled: boolean('annual_fee_enabled').notNull().default(false),
  annualFee: integer('annual_fee').notNull().default(0),
  discountEnabled: boolean('discount_enabled').notNull().default(true),
  discountMinVisits: integer('discount_min_visits').notNull().default(4),
  discountAmount: integer('discount_amount').notNull().default(2000),
  discountGender: text('discount_gender').notNull().default('男性'),
  discountScope: text('discount_scope').$type<'every' | 'once'>().notNull().default('every'),
  nextMemberNo: integer('next_member_no').notNull().default(10001),
  termsVersion: text('terms_version').notNull().default('1'),
  termsText: text('terms_text').notNull().default(''),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const priceRules = pgTable(
  'price_rules',
  {
    storeId: text('store_id').notNull().references(() => stores.id),
    dayType: text('day_type').$type<DayType>().notNull(),
    dayPart: text('day_part').$type<DayPart>().notNull(),
    category: text('category').$type<Category>().notNull(),
    price: integer('price').notNull(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.dayType, t.dayPart, t.category] })],
)

export const calendarDays = pgTable(
  'calendar_days',
  {
    storeId: text('store_id').notNull().references(() => stores.id),
    date: date('date', { mode: 'string' }).notNull(),
    dayType: text('day_type').$type<DayType>().notNull(),
    label: text('label').notNull().default(''),
    customPrices: jsonb('custom_prices').$type<CustomPrices | null>(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.date] })],
)

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: text('store_id').notNull().references(() => stores.id),
  memberNo: text('member_no').notNull(),
  handleName: text('handle_name').notNull(),
  gender: text('gender').$type<'男性' | '女性'>().notNull(),
  birthday: date('birthday', { mode: 'string' }),
  joinedAt: date('joined_at', { mode: 'string' }).notNull(),
  referral: text('referral').notNull().default(''),
  idDocs: jsonb('id_docs').$type<string[]>().notNull().default([]),
  termsVersion: text('terms_version').notNull().default(''),
  termsSignedAt: ts('terms_signed_at'),
  status: text('status').$type<'active' | 'banned' | 'withdrawn'>().notNull().default('active'),
  banReason: text('ban_reason').notNull().default(''),
  bannedAt: ts('banned_at'),
  feeExpiresAt: date('fee_expires_at', { mode: 'string' }),
  memo: text('memo').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const visits = pgTable('visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: text('store_id').notNull().references(() => stores.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  partnerMemberId: uuid('partner_member_id').references(() => members.id),
  businessDate: date('business_date', { mode: 'string' }).notNull(),
  dayPart: text('day_part').$type<DayPart>().notNull(),
  dayType: text('day_type').$type<DayType>().notNull(),
  category: text('category').$type<Category>().notNull(),
  isNew: boolean('is_new').notNull().default(false),
  entranceFee: integer('entrance_fee').notNull(),
  discount: integer('discount').notNull().default(0),
  discountReason: text('discount_reason').notNull().default(''),
  joinFee: integer('join_fee').notNull().default(0),
  annualFee: integer('annual_fee').notNull().default(0),
  entryTotal: integer('entry_total').notNull(),
  extraTotal: integer('extra_total').notNull().default(0),
  status: text('status').$type<'in' | 'out' | 'void'>().notNull().default('in'),
  checkedInAt: ts('checked_in_at').notNull().defaultNow(),
  checkedOutAt: ts('checked_out_at'),
  staffId: uuid('staff_id').references(() => users.id),
  outStaffId: uuid('out_staff_id').references(() => users.id),
  note: text('note').notNull().default(''),
})

export const visitItems = pgTable('visit_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: text('store_id').notNull().references(() => stores.id),
  visitId: uuid('visit_id').notNull().references(() => visits.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<'drink' | 'extension' | 'other'>().notNull(),
  name: text('name').notNull(),
  unitPrice: integer('unit_price').notNull(),
  qty: integer('qty').notNull().default(1),
  amount: integer('amount').notNull(),
  businessDate: date('business_date', { mode: 'string' }).notNull(),
  dayPart: text('day_part').$type<DayPart>().notNull(),
  staffId: uuid('staff_id').references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const menuItems = pgTable('menu_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: text('store_id').notNull().references(() => stores.id),
  kind: text('kind').$type<'drink' | 'extension' | 'other'>().notNull(),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  sort: integer('sort').notNull().default(0),
  active: boolean('active').notNull().default(true),
})

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: text('store_id').notNull().references(() => stores.id),
  businessDate: date('business_date', { mode: 'string' }).notNull(),
  kind: text('kind').$type<'expense' | 'tax' | 'parttime'>().notNull(),
  name: text('name').notNull().default(''),
  amount: integer('amount').notNull(),
  staffId: uuid('staff_id').references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const monthlyAdjustments = pgTable('monthly_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: text('store_id').notNull().references(() => stores.id),
  month: text('month').notNull(),
  label: text('label').notNull(),
  amount: integer('amount').notNull().default(0),
  sort: integer('sort').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: text('store_id').references(() => stores.id),
  userId: uuid('user_id').references(() => users.id),
  userName: text('user_name').notNull().default(''),
  action: text('action').notNull(),
  target: text('target').notNull().default(''),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export type Member = typeof members.$inferSelect
export type Visit = typeof visits.$inferSelect
export type VisitItem = typeof visitItems.$inferSelect
export type StoreSettings = typeof storeSettings.$inferSelect
export type PriceRule = typeof priceRules.$inferSelect
export type CalendarDay = typeof calendarDays.$inferSelect
export type MenuItem = typeof menuItems.$inferSelect
export type Expense = typeof expenses.$inferSelect
export type User = typeof users.$inferSelect
export type Store = typeof stores.$inferSelect
