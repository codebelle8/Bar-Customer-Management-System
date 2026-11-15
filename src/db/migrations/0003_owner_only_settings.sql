-- 料金表・カレンダー・メニュー・月次の調整額は、データベース側でもオーナーのみ変更可能にする
-- （スタッフは自店舗の行を参照のみ。会員番号の採番があるため store_settings はスタッフも更新可）
do $$
declare t text;
begin
  foreach t in array array['price_rules','calendar_days','menu_items','monthly_adjustments']
  loop
    execute format('drop policy if exists store_isolation on %I', t);
    execute format('drop policy if exists store_read on %I', t);
    execute format('drop policy if exists owner_insert on %I', t);
    execute format('drop policy if exists owner_update on %I', t);
    execute format('drop policy if exists owner_delete on %I', t);
    execute format('create policy store_read on %I for select using (app_is_owner() or store_id = app_store())', t);
    execute format('create policy owner_insert on %I for insert with check (app_is_owner())', t);
    execute format('create policy owner_update on %I for update using (app_is_owner()) with check (app_is_owner())', t);
    execute format('create policy owner_delete on %I for delete using (app_is_owner())', t);
  end loop;
end
$$;
