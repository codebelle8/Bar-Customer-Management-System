-- 基本的な勤怠管理（契約書の開発範囲 (6)）
--   staff_members：勤怠の対象者（社員・アルバイト）。ログイン用のアカウントとは別（スタッフのアカウントは共用のため）
--   attendance   ：出勤・退勤の記録（営業日ごと。退勤前の記録は 1 人 1 件まで）
create table if not exists staff_members (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  name text not null,
  kind text not null check (kind in ('社員', 'アルバイト')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  staff_member_id uuid not null references staff_members(id),
  business_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);
create index if not exists attendance_store_date on attendance (store_id, business_date);
create unique index if not exists attendance_one_open on attendance (staff_member_id) where clock_out is null;

grant select, insert, update, delete on staff_members, attendance to app_user;

-- 対象者：参照は所属店舗、登録・変更は管理できる店舗のみ（スタッフは参照のみ）
alter table staff_members enable row level security;
drop policy if exists staff_members_read on staff_members;
drop policy if exists staff_members_insert on staff_members;
drop policy if exists staff_members_update on staff_members;
drop policy if exists staff_members_delete on staff_members;
create policy staff_members_read on staff_members for select using (app_is_owner() or store_id = app_store());
create policy staff_members_insert on staff_members for insert with check (app_can_manage(store_id));
create policy staff_members_update on staff_members for update using (app_can_manage(store_id)) with check (app_can_manage(store_id));
create policy staff_members_delete on staff_members for delete using (app_can_manage(store_id));

-- 出退勤：所属店舗のスタッフも打刻（追加・退勤の記録）できる。削除は管理できる店舗のみ
alter table attendance enable row level security;
drop policy if exists attendance_read on attendance;
drop policy if exists attendance_insert on attendance;
drop policy if exists attendance_update on attendance;
drop policy if exists attendance_delete on attendance;
create policy attendance_read on attendance for select using (app_is_owner() or store_id = app_store());
create policy attendance_insert on attendance for insert with check (app_is_owner() or store_id = app_store());
create policy attendance_update on attendance for update using (app_is_owner() or store_id = app_store()) with check (app_is_owner() or store_id = app_store());
create policy attendance_delete on attendance for delete using (app_can_manage(store_id));
