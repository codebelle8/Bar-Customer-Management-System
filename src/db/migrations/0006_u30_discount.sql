-- U30割引（会員名簿の「特典割引」列：年齢 30 歳以下に「U30」）
-- 金額は仮。店舗からの回答後に「割引・特典」画面で変更する
alter table store_settings add column if not exists u30_enabled boolean not null default true;
alter table store_settings add column if not exists u30_max_age integer not null default 30;      -- この年齢以下が対象
alter table store_settings add column if not exists u30_amount integer not null default 1000;     -- 入場料からの割引額（仮）
alter table store_settings add column if not exists u30_gender text not null default '男性';      -- 男性 / 女性 / 両方
alter table store_settings add column if not exists u30_combine boolean not null default false;   -- リピーター割引と併用するか（しない場合は大きい方）

-- 来店ごとの割引のうち U30割引の金額（discount は割引の合計。リピーター割引 = discount − u30_discount）
alter table visits add column if not exists u30_discount integer not null default 0;
