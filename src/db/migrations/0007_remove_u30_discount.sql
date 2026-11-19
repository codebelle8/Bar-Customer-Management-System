-- U30割引の削除（契約書の開発範囲に含まれないため。2026-11-19）
alter table store_settings drop column if exists u30_enabled;
alter table store_settings drop column if exists u30_max_age;
alter table store_settings drop column if exists u30_amount;
alter table store_settings drop column if exists u30_gender;
alter table store_settings drop column if exists u30_combine;
alter table visits drop column if exists u30_discount;
