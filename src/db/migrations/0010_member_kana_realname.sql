-- 既存会員名簿の移行（契約書の開発範囲 (2)）：名簿の「フリガナ」「本名」を保存する列
-- （名簿の「保険証確認・会社・番号」は取り込まない）
alter table members add column if not exists kana text not null default '';
alter table members add column if not exists real_name text not null default '';
