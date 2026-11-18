-- 店舗オーナー（所属店舗だけを管理するオーナー）を追加する
--   owner       ：全店舗のオーナー（全店舗・全機能）
--   store_owner ：店舗オーナー（所属店舗のみ。料金設定・レポート・スタッフ管理・設定も所属店舗のみ）
--   staff       ：スタッフ（所属店舗のみ。料金・設定は参照のみ）

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('owner', 'store_owner', 'staff'));
-- 全店舗のオーナー以外は所属店舗が必須
alter table users drop constraint if exists users_store_check;
alter table users add constraint users_store_check check (role = 'owner' or store_id is not null);

create or replace function app_role() returns text language sql stable as $$
  select coalesce(current_setting('app.role', true), '')
$$;

-- その店舗を管理できるか（全店舗のオーナー、または所属店舗の店舗オーナー）
create or replace function app_can_manage(sid text) returns boolean language sql stable as $$
  select app_is_owner() or (app_role() = 'store_owner' and sid is not null and sid = app_store())
$$;

-- 料金表・カレンダー・メニュー・月次の調整額：変更は管理できる店舗のみ（スタッフは参照のみ）
do $$
declare t text;
begin
  foreach t in array array['price_rules','calendar_days','menu_items','monthly_adjustments']
  loop
    execute format('drop policy if exists owner_insert on %I', t);
    execute format('drop policy if exists owner_update on %I', t);
    execute format('drop policy if exists owner_delete on %I', t);
    execute format('create policy owner_insert on %I for insert with check (app_can_manage(store_id))', t);
    execute format('create policy owner_update on %I for update using (app_can_manage(store_id)) with check (app_can_manage(store_id))', t);
    execute format('create policy owner_delete on %I for delete using (app_can_manage(store_id))', t);
  end loop;
end
$$;

-- 店舗：店舗オーナーは自店舗の店舗情報のみ変更可。店舗の追加・削除は全店舗のオーナーのみ
drop policy if exists stores_write on stores;
drop policy if exists stores_insert on stores;
drop policy if exists stores_update on stores;
drop policy if exists stores_delete on stores;
create policy stores_insert on stores for insert with check (app_is_owner());
create policy stores_update on stores for update using (app_can_manage(id)) with check (app_can_manage(id));
create policy stores_delete on stores for delete using (app_is_owner());

-- アカウント
--   参照：全店舗のオーナーは全員、店舗オーナーは自店舗のアカウント、スタッフは自分のみ
--   追加・変更：店舗オーナーが扱えるのは自店舗のスタッフのみ（オーナー権限の付与・他店舗への移動は不可）
--   本人：名前・パスワードの変更のみ（権限・所属店舗は変えられない）
drop policy if exists users_read on users;
create policy users_read on users for select using (
  app_is_owner()
  or id::text = current_setting('app.user_id', true)
  or (app_role() = 'store_owner' and store_id = app_store())
);
drop policy if exists users_insert on users;
create policy users_insert on users for insert with check (
  app_is_owner()
  or (app_role() = 'store_owner' and role = 'staff' and store_id = app_store())
);
drop policy if exists users_write on users;
create policy users_write on users for update
  using (
    app_is_owner()
    or id::text = current_setting('app.user_id', true)
    or (app_role() = 'store_owner' and role = 'staff' and store_id = app_store())
  )
  with check (
    app_is_owner()
    or (id::text = current_setting('app.user_id', true) and role = app_role() and store_id = app_store())
    or (app_role() = 'store_owner' and role = 'staff' and store_id = app_store())
  );

-- 操作ログ：閲覧は管理できる店舗の分のみ（全店舗のオーナーは共通の記録も含めてすべて）
drop policy if exists audit_read on audit_logs;
create policy audit_read on audit_logs for select using (app_can_manage(store_id));
