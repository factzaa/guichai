-- =====================================================================
-- กุยช่ายสวรรค์ — Storage buckets + Row Level Security (RLS)
-- รันหลังจาก 01_schema.sql
--
-- โมเดลสิทธิ์ (ตรงกับพฤติกรรม Maru เดิม):
--   • frontend ใช้ publishable/anon key ยิงตรงเข้า REST อ่าน+เขียนตารางปฏิบัติงาน
--   • ตาราง staff (อ่อนไหว) เข้าถึงผ่าน Edge Function (service_role) เท่านั้น
--   • staff_safe (view) อ่านได้ด้วย anon เพราะเป็น definer view
-- =====================================================================

-- ---------------------------------------------------------------------
-- STORAGE BUCKETS (4 buckets ตาม PROGRESS)
--   receipts     : ใบเสร็จค่าใช้จ่าย + รับของเข้า        → public
--   attendance   : รูปเช็คอิน/เช็คเอาต์                   → public
--   remit-slips  : สลิปเงินสดนำส่ง                        → public
--   staff-docs   : เอกสารพนักงาน (บัตร ปชช. ฯลฯ) อ่อนไหว → PRIVATE (เข้าผ่าน edge เท่านั้น)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts',    'receipts',    true),
       ('attendance',  'attendance',  true),
       ('remit-slips', 'remit-slips', true),
       ('staff-docs',  'staff-docs',  false)   -- อ่อนไหว: ไม่เปิดสาธารณะ
on conflict (id) do update set public = excluded.public;

-- policy: อ่านสาธารณะ (anon อ่านทุก object ใน 3 bucket)
drop policy if exists "public read app buckets" on storage.objects;
create policy "public read app buckets"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('receipts','attendance','remit-slips'));

-- policy: อัปโหลด (anon insert) — frontend อัปรูปด้วย publishable key
drop policy if exists "anon upload app buckets" on storage.objects;
create policy "anon upload app buckets"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id in ('receipts','attendance','remit-slips'));

-- ---------------------------------------------------------------------
-- RLS ตารางปฏิบัติงาน: เปิด RLS + อนุญาต anon ทำได้ครบ (select/insert/update/delete)
--   ⚠️  โมเดลนี้ = "ใครถือ publishable key ก็อ่าน/เขียนได้" (ตรงกับ Maru เดิม
--       ที่แอปเป็น internal tool หลังกำแพงรหัสเจ้าของ)  ถ้าต้องการเข้มขึ้น
--       ควรย้ายการเขียนไปหลัง Edge Function แล้วปิด insert/update/delete ของ anon
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'sales','expenses','stock_items','stock_withdraw','stock_receive',
    'stock_daily','stock_audit','branches','attendance','cash_remittance'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "anon all %1$s" on public.%1$I;', t);
    execute format(
      'create policy "anon all %1$s" on public.%1$I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- staff + payments (อ่อนไหว): เปิด RLS แต่ "ไม่สร้าง policy สำหรับ anon"
--   → anon เข้าถึงตรง ๆ ไม่ได้ (0 แถว)
--   → service_role (Edge Function) ข้าม RLS ได้อยู่แล้ว → markPaid/getPayrollStatus ทำงานได้
--   → staff_safe view (definer) ยังอ่านได้ด้วย anon
-- ---------------------------------------------------------------------
alter table public.staff    enable row level security;
alter table public.payments enable row level security;

-- ให้ anon/authenticated select ผ่าน view ได้
grant select on public.staff_safe to anon, authenticated;

-- =====================================================================
-- เสร็จ — ตรวจว่าตารางครบ 12 + view staff_safe + 4 buckets:
--   select table_name from information_schema.tables
--   where table_schema='public' order by table_name;
--   select id, public from storage.buckets order by id;
-- =====================================================================
