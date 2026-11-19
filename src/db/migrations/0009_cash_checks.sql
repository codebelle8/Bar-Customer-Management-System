-- レジ金管理（契約書の開発範囲 (5)）：店舗の「レジ金引継ぎシート」と同じ確認項目
--   cash_checks：営業日・確認項目ごとの確認者（勤怠の対象者）と確認日時（1 項目 1 件）
--   cash_notes ：引継ぎメモ
create table if not exists cash_checks (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  business_date date not null,
  item text not null,
  staff_member_id uuid not null references staff_members(id),
  checked_at timestamptz not null default now(),
  created_by uuid references users(id),
  unique (store_id, business_date, item)
);

create table if not exists cash_notes (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  business_date date not null,
  staff_member_id uuid references staff_members(id),
  body text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists cash_notes_store_date on cash_notes (store_id, business_date);

grant select, insert, update, delete on cash_checks, cash_notes to app_user;

-- 所属店舗のスタッフが記録する（過去の日の取消・削除はアプリ側でオーナーのみに制限）
do $$
declare t text;
begin
  foreach t in array array['cash_checks','cash_notes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists store_isolation on %I', t);
    execute format(
      'create policy store_isolation on %I using (app_is_owner() or store_id = app_store()) with check (app_is_owner() or store_id = app_store())', t);
  end loop;
end
$$;
