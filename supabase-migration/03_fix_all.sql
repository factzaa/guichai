-- ============================================================
-- กุยช่ายสวรรค์ — FIX รวบยอด (แก้ปัญหา "บันทึกแล้วไม่แสดง")
-- สาเหตุ: Supabase_09/10 เปิด RLS + policy เฉพาะ INSERT แต่ไม่มี SELECT
--         (policy อ่านอยู่ในขั้น 01–08 ที่ backup ไม่มี)
-- รันใน SQL Editor → New query → วางทั้งไฟล์ → Run (รันซ้ำได้ ปลอดภัย)
-- ============================================================

-- 1) staff: เพิ่มคอลัมน์ edited_at ที่ edge saveAttendStaff เขียน (ไม่มี = เพิ่มพนักงานไม่ได้)
alter table public.staff add column if not exists edited_at timestamptz;

-- 2) เพิ่ม SELECT policy ให้ตารางที่อ่านไม่ได้ (RLS เปิด แต่ไม่มี policy อ่าน)
drop policy if exists v2_sel_attendance on public.attendance;
create policy v2_sel_attendance on public.attendance for select to anon, authenticated using (true);

drop policy if exists v2_sel_stock_withdraw on public.stock_withdraw;
create policy v2_sel_stock_withdraw on public.stock_withdraw for select to anon, authenticated using (true);

drop policy if exists v2_sel_stock_receive on public.stock_receive;
create policy v2_sel_stock_receive on public.stock_receive for select to anon, authenticated using (true);

drop policy if exists v2_sel_stock_daily on public.stock_daily;
create policy v2_sel_stock_daily on public.stock_daily for select to anon, authenticated using (true);

drop policy if exists v2_sel_stock_audit on public.stock_audit;
create policy v2_sel_stock_audit on public.stock_audit for select to anon, authenticated using (true);

drop policy if exists v2_sel_stock_items on public.stock_items;
create policy v2_sel_stock_items on public.stock_items for select to anon, authenticated using (true);

-- 3) sales / expenses: เปิด RLS + policy ครบ (ตอนนี้ RLS off = แดง 'Unrestricted')
alter table public.sales    enable row level security;
alter table public.expenses enable row level security;

drop policy if exists v2_all_sales on public.sales;
create policy v2_all_sales on public.sales for all to anon, authenticated using (true) with check (true);

drop policy if exists v2_all_expenses on public.expenses;
create policy v2_all_expenses on public.expenses for all to anon, authenticated using (true) with check (true);

-- 4) staff_safe view: ให้ anon อ่านรายชื่อพนักงาน (view แบบ definer ซ่อน PIN/เงินเดือน)
grant select on public.staff_safe to anon, authenticated;

-- 5) bucket receipts (ใบเสร็จ) ที่ยังขาด (อยู่ในขั้น 01–08 ที่ไม่มี)
insert into storage.buckets (id, name, public) values ('receipts','receipts',true)
on conflict (id) do update set public = true;

drop policy if exists v2_receipts_read on storage.objects;
create policy v2_receipts_read on storage.objects for select to anon, authenticated using (bucket_id='receipts');

drop policy if exists v2_receipts_upload on storage.objects;
create policy v2_receipts_upload on storage.objects for insert to anon, authenticated with check (bucket_id='receipts');

-- เสร็จ
select 'fix applied ✓' as status;
