-- データベース側の権限制御（Row Level Security）
-- アプリはリクエストごとにトランザクション内で app_user ロールに切り替え、
-- app.role / app.store_id / app.user_id を設定する。スタッフは所属店舗の行しか読み書きできない。

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end
$$;

-- 接続ユーザーが SET ROLE app_user できるようにする
do $$
begin
  execute format('grant app_user to %I', current_user);
exception when others then
  null; -- 既に付与済み・スーパーユーザーなど
end
$$;

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;

create or replace function app_is_owner() returns boolean language sql stable as $$
  select coalesce(current_setting('app.role', true), '') = 'owner'
$$;
create or replace function app_store() returns text language sql stable as $$
  select coalesce(current_setting('app.store_id', true), '')
$$;

-- 店舗ごとのデータを持つテーブル
do $$
declare t text;
begin
  foreach t in array array['store_settings','price_rules','calendar_days','members','visits','visit_items','menu_items','expenses','monthly_adjustments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists store_isolation on %I', t);
    execute format(
      'create policy store_isolation on %I using (app_is_owner() or store_id = app_store()) with check (app_is_owner() or store_id = app_store())', t);
  end loop;
end
$$;

-- 店舗：スタッフは所属店舗のみ参照可、変更はオーナーのみ
alter table stores enable row level security;
drop policy if exists stores_read on stores;
create policy stores_read on stores for select using (app_is_owner() or id = app_store());
drop policy if exists stores_write on stores;
create policy stores_write on stores for all using (app_is_owner()) with check (app_is_owner());

-- アカウント：スタッフは自分自身のみ参照可、変更はオーナーのみ（パスワード変更は本人の行のみ）
alter table users enable row level security;
drop policy if exists users_read on users;
create policy users_read on users for select using (app_is_owner() or id::text = current_setting('app.user_id', true));
drop policy if exists users_write on users;
create policy users_write on users for update using (app_is_owner() or id::text = current_setting('app.user_id', true))
  with check (app_is_owner() or (id::text = current_setting('app.user_id', true) and role = 'staff' and store_id = app_store()));
drop policy if exists users_insert on users;
create policy users_insert on users for insert with check (app_is_owner());

-- 操作ログ：記録は全員、閲覧はオーナーのみ
alter table audit_logs enable row level security;
drop policy if exists audit_insert on audit_logs;
create policy audit_insert on audit_logs for insert with check (app_is_owner() or store_id = app_store());
drop policy if exists audit_read on audit_logs;
create policy audit_read on audit_logs for select using (app_is_owner());
