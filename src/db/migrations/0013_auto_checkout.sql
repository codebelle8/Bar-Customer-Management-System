-- 自動退店（2026-11-21 お客様と確認）
-- 退店処理をしないまま営業日の区切り（例 6:00）を過ぎた来店を、区切りの時刻で退店にする。延長料金などは加えない
alter table visits add column if not exists auto_checkout boolean not null default false;
-- 入店中のままの来店を探すための索引
create index if not exists visits_store_in_idx on visits (store_id, business_date) where status = 'in';
