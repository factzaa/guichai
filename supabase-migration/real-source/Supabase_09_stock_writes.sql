-- ============================================================
-- Supabase_09 — เปิดสิทธิ์ "เขียน" ฝั่งสต๊อก (V2)
-- ใช้คู่กับ shared.js เวอร์ชันที่ย้าย addStockWithdraw/Receive/closeDailyStock/
-- addStockAudit/saveStockItem/addStockItem/deleteStockItem/saveMinStockBatch มา Supabase
-- รันใน Supabase → SQL Editor → New query → วาง → Run
-- ปลอดภัยต่อการรันซ้ำ (idempotent)
-- ============================================================

-- เปิด RLS (ถ้าเปิดอยู่แล้วไม่เป็นไร)
alter table public.stock_withdraw enable row level security;
alter table public.stock_receive  enable row level security;
alter table public.stock_daily    enable row level security;
alter table public.stock_audit    enable row level security;
alter table public.stock_items    enable row level security;

-- INSERT: เบิก / รับเข้า / ปิดรอบ / ออดิท
drop policy if exists v2_ins_stock_withdraw on public.stock_withdraw;
create policy v2_ins_stock_withdraw on public.stock_withdraw for insert to anon, authenticated with check (true);

drop policy if exists v2_ins_stock_receive on public.stock_receive;
create policy v2_ins_stock_receive on public.stock_receive for insert to anon, authenticated with check (true);

drop policy if exists v2_ins_stock_daily on public.stock_daily;
create policy v2_ins_stock_daily on public.stock_daily for insert to anon, authenticated with check (true);

drop policy if exists v2_ins_stock_audit on public.stock_audit;
create policy v2_ins_stock_audit on public.stock_audit for insert to anon, authenticated with check (true);

-- รายการสินค้า: เพิ่ม / แก้ / ลบ (addStockItem, saveStockItem, saveMinStockBatch, deleteStockItem)
drop policy if exists v2_ins_stock_items on public.stock_items;
create policy v2_ins_stock_items on public.stock_items for insert to anon, authenticated with check (true);

drop policy if exists v2_upd_stock_items on public.stock_items;
create policy v2_upd_stock_items on public.stock_items for update to anon, authenticated using (true) with check (true);

drop policy if exists v2_del_stock_items on public.stock_items;
create policy v2_del_stock_items on public.stock_items for delete to anon, authenticated using (true);
