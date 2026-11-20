-- 延長料金の自動計算（昼の部のお客様が、夜の部の開始時刻を過ぎて残った場合）
--   対象の曜日（既定：月〜木）：夜の部の開始から、時計の区切りで1時間ごとに extension_unit_price 円（上限 extension_cap 円）
--   それ以外の曜日・祝日：夜の部の料金を退店時に請求
alter table store_settings add column if not exists extension_unit_price integer not null default 1000;
alter table store_settings add column if not exists extension_cap integer not null default 10000;
alter table store_settings add column if not exists extension_days jsonb not null default '[1,2,3,4]'::jsonb;

-- 手入力の延長メニュー（仮の「延長料金（1時間）」）は、自動計算に置き換えるため削除
delete from menu_items where kind = 'extension';
