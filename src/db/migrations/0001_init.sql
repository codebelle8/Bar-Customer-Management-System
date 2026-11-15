-- 店舗
create table if not exists stores (
  id text primary key,
  name text not null,
  short_name text not null,
  status text not null default 'active', -- active / preparing
  member_prefix text not null default 'H-',
  created_at timestamptz not null default now()
);

-- ログインアカウント（オーナー／スタッフ）
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  login_id text not null unique,
  name text not null,
  password_hash text not null,
  role text not null check (role in ('owner', 'staff')),
  store_id text references stores(id), -- スタッフの所属店舗（オーナーは null）
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 店舗ごとの設定（営業時間の区切り・入会金・割引ルール・会員規約など）
create table if not exists store_settings (
  store_id text primary key references stores(id),
  day_start text not null default '12:00',    -- 昼の部の開始
  night_start text not null default '19:00',  -- 夜の部の開始
  day_cutoff text not null default '06:00',   -- この時刻までは前日の営業日として扱う
  weekend_days jsonb not null default '[0,6]', -- 週末料金の曜日（0=日）
  join_fee integer not null default 0,
  annual_fee_enabled boolean not null default false,
  annual_fee integer not null default 0,
  discount_enabled boolean not null default true,
  discount_min_visits integer not null default 4,
  discount_amount integer not null default 2000,
  discount_gender text not null default '男性',
  discount_scope text not null default 'every', -- every：翌月の入店ごと / once：翌月1回のみ
  next_member_no integer not null default 10001,
  terms_version text not null default '1',
  terms_text text not null default '',
  updated_at timestamptz not null default now()
);

-- 料金表（区分 × 昼夜 × 曜日区分）
create table if not exists price_rules (
  store_id text not null references stores(id),
  day_type text not null check (day_type in ('平日', '週末', '祝日', 'イベント')),
  day_part text not null check (day_part in ('昼', '夜')),
  category text not null check (category in ('男性', '女性', 'カップル')),
  price integer not null,
  primary key (store_id, day_type, day_part, category)
);

-- カレンダーの個別設定（祝日・イベント日など）。custom_prices は {"夜":{"男性":7000}} のような上書き
create table if not exists calendar_days (
  store_id text not null references stores(id),
  date date not null,
  day_type text not null check (day_type in ('平日', '週末', '祝日', 'イベント')),
  label text not null default '',
  custom_prices jsonb,
  primary key (store_id, date)
);

-- 会員（店舗ごとに管理）
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  member_no text not null,
  handle_name text not null,
  gender text not null check (gender in ('男性', '女性')),
  birthday date,
  joined_at date not null,
  referral text not null default '',
  id_docs jsonb not null default '[]',
  terms_version text not null default '',
  terms_signed_at timestamptz,
  status text not null default 'active' check (status in ('active', 'banned', 'withdrawn')),
  ban_reason text not null default '',
  banned_at timestamptz,
  fee_expires_at date,
  memo text not null default '',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, member_no)
);
create index if not exists members_store_handle on members (store_id, handle_name);

-- 来店（入店時の会計と、退店時の追加精算）
create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  member_id uuid not null references members(id),
  partner_member_id uuid references members(id),
  business_date date not null,
  day_part text not null check (day_part in ('昼', '夜')),
  day_type text not null,
  category text not null check (category in ('男性', '女性', 'カップル')),
  is_new boolean not null default false,
  entrance_fee integer not null,      -- 料金表の金額
  discount integer not null default 0,
  discount_reason text not null default '',
  join_fee integer not null default 0,
  annual_fee integer not null default 0,
  entry_total integer not null,       -- 入店時に受け取った金額
  extra_total integer not null default 0, -- 退店時に受け取った金額（延長・有料ドリンク）
  status text not null default 'in' check (status in ('in', 'out', 'void')),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  staff_id uuid references users(id),
  out_staff_id uuid references users(id),
  note text not null default ''
);
create index if not exists visits_store_date on visits (store_id, business_date);
create index if not exists visits_member on visits (member_id, business_date);

-- 有料ドリンク・延長料金など（退店時に精算）
create table if not exists visit_items (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  visit_id uuid not null references visits(id) on delete cascade,
  kind text not null check (kind in ('drink', 'extension', 'other')),
  name text not null,
  unit_price integer not null,
  qty integer not null default 1,
  amount integer not null,
  business_date date not null,
  day_part text not null check (day_part in ('昼', '夜')),
  staff_id uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists visit_items_store_date on visit_items (store_id, business_date);

-- 有料ドリンク・延長のメニュー
create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  kind text not null check (kind in ('drink', 'extension', 'other')),
  name text not null,
  price integer not null,
  sort integer not null default 0,
  active boolean not null default true
);

-- 日々の出金（経費・税金・アルバイト代）
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  business_date date not null,
  kind text not null check (kind in ('expense', 'tax', 'parttime')),
  name text not null default '',
  amount integer not null,
  staff_id uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists expenses_store_date on expenses (store_id, business_date);

-- 月次総括の調整（龍経費・46経費・口座移動など）
create table if not exists monthly_adjustments (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  month text not null, -- YYYY-MM
  label text not null,
  amount integer not null default 0,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- 操作ログ
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id text references stores(id),
  user_id uuid references users(id),
  user_name text not null default '',
  action text not null,
  target text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created on audit_logs (created_at desc);
