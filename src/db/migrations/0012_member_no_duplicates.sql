-- 会員番号の重複を認める（お店の名簿では、同じ番号が別の会員に付いている行があり、そのまま取り込む：2026-11-20 お客様確認）
-- 新しく登録する会員は、これまでどおり画面側で使用済みの番号を使えないようにしている
do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'members' and con.contype = 'u'
      and (select array_agg(att.attname::text order by att.attname)
           from pg_attribute att
           where att.attrelid = con.conrelid and att.attnum = any (con.conkey)) = array['member_no', 'store_id']
  loop
    execute format('alter table members drop constraint %I', c);
  end loop;
end $$;
create index if not exists members_store_member_no_idx on members (store_id, member_no);
