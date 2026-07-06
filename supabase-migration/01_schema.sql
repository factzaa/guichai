-- =====================================================================
-- กุยช่ายสวรรค์ (Guichai Pantip App) — Supabase Schema
-- ถอดจากโค้ด frontend (shared.js, sb-data.js, records.html ฯลฯ)
-- รันไฟล์นี้ใน: Supabase Dashboard → SQL Editor → New query → วาง → Run
-- รันไฟล์ตามลำดับ: 01_schema.sql → 02_storage_and_rls.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) sales — ยอดขายรายวัน (1 แถว / 1 วัน, upsert ตาม sale_date)
-- ---------------------------------------------------------------------
create table if not exists public.sales (
  id            bigint generated always as identity primary key,
  sale_date     date not null unique,
  -- ช่องทางขาย (SB_CH)
  cash          numeric default 0,
  transfer      numeric default 0,
  thaihelp      numeric default 0,
  lineman       numeric default 0,
  grab          numeric default 0,
  shopee        numeric default 0,
  robinhood     numeric default 0,
  total         numeric default 0,
  -- กระทบยอดเงินสด (reconcile)
  cash_open     numeric default 0,
  cash_in       numeric default 0,
  refund        numeric default 0,
  cash_expected numeric default 0,
  cash_actual   numeric default 0,
  cash_diff     numeric default 0,
  closed_by     text,
  note          text,
  created_at    timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2) expenses — ค่าใช้จ่าย (type: 'pos' = หักจากลิ้นชัก, 'biz' = ค่าใช้จ่ายกิจการ)
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id          bigint generated always as identity primary key,
  exp_date    date not null,
  item        text,
  amount      numeric default 0,
  receipt_url text,
  type        text default 'pos',
  created_at  timestamptz default now()
);
create index if not exists idx_expenses_date on public.expenses (exp_date);
create index if not exists idx_expenses_type on public.expenses (type);

-- ---------------------------------------------------------------------
-- 3) stock_items — รายการสินค้าในสต๊อก (item_id เป็น business key)
--    mode: 'withdraw' (นับเบิก) | 'count' (นับชิ้น)
-- ---------------------------------------------------------------------
create table if not exists public.stock_items (
  item_id    text primary key,
  name       text,
  category   text,
  unit       text,
  mode       text default 'withdraw',
  min_stock  numeric default 0,
  sort_order integer default 0,
  active     boolean default true,
  edited_at  timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 4) stock_withdraw — เบิกของออก
-- ---------------------------------------------------------------------
create table if not exists public.stock_withdraw (
  id          bigint generated always as identity primary key,
  move_date   date not null,
  move_time   time,
  branch      text,
  recorded_by text,
  item_id     text,
  item_name   text,
  qty         numeric default 0,
  note        text,
  created_at  timestamptz default now()
);
create index if not exists idx_withdraw_date on public.stock_withdraw (move_date);
create index if not exists idx_withdraw_item on public.stock_withdraw (item_id);

-- ---------------------------------------------------------------------
-- 5) stock_receive — รับของเข้า (แนบใบเสร็จได้)
-- ---------------------------------------------------------------------
create table if not exists public.stock_receive (
  id          bigint generated always as identity primary key,
  move_date   date not null,
  branch      text,
  recorded_by text,
  item_id     text,
  item_name   text,
  qty         numeric default 0,
  receipt_url text,
  note        text,
  created_at  timestamptz default now()
);
create index if not exists idx_receive_date on public.stock_receive (move_date);
create index if not exists idx_receive_item on public.stock_receive (item_id);

-- ---------------------------------------------------------------------
-- 6) stock_daily — สรุปปิดรอบสต๊อกสิ้นวัน
-- ---------------------------------------------------------------------
create table if not exists public.stock_daily (
  id             bigint generated always as identity primary key,
  move_date      date not null,
  branch         text,
  closed_by      text,
  item_id        text,
  item_name      text,
  open_qty       numeric default 0,
  receive_total  numeric default 0,
  withdraw_total numeric default 0,
  waste          numeric default 0,
  balance        numeric default 0,
  used           numeric default 0,
  diff           numeric default 0,
  mode           text default 'withdraw',
  note           text,
  created_at     timestamptz default now()
);
create index if not exists idx_daily_date on public.stock_daily (move_date);
create index if not exists idx_daily_item on public.stock_daily (item_id);

-- ---------------------------------------------------------------------
-- 7) stock_audit — ออดิทตรวจนับ + ปรับยอด
-- ---------------------------------------------------------------------
create table if not exists public.stock_audit (
  id          bigint generated always as identity primary key,
  audit_date  date not null,
  branch      text,
  auditor     text,
  item_id     text,
  item_name   text,
  system_qty  numeric default 0,
  actual_qty  numeric default 0,
  diff        numeric default 0,
  reason      text,
  adjusted    boolean default false,
  created_at  timestamptz default now()
);
create index if not exists idx_audit_date on public.stock_audit (audit_date);

-- ---------------------------------------------------------------------
-- 8) branches — สาขา (geofence สำหรับเช็คอิน)
-- ---------------------------------------------------------------------
create table if not exists public.branches (
  branch_id text primary key,
  name      text,
  address   text,
  lat       double precision default 0,
  lng       double precision default 0,
  radius    numeric default 100,
  active    boolean default true
);

-- ---------------------------------------------------------------------
-- 9) attendance — บันทึกเข้า/ออกงาน (type: 'in' | 'out')
-- ---------------------------------------------------------------------
create table if not exists public.attendance (
  id          bigint generated always as identity primary key,
  att_date    date not null,
  att_time    time,
  type        text default 'in',
  staff_id    text,
  name        text,
  branch      text,
  lat         double precision default 0,
  lng         double precision default 0,
  address     text,
  photo_url   text,
  in_geofence boolean default true,
  distance    numeric default 0,
  note        text,
  created_at  timestamptz default now()
);
create index if not exists idx_attendance_date on public.attendance (att_date);
create index if not exists idx_attendance_staff on public.attendance (staff_id);

-- ---------------------------------------------------------------------
-- 10) cash_remittance — เงินสดนำส่ง
--     included_dates เก็บเป็น jsonb (array ของ 'YYYY-MM-DD')
-- ---------------------------------------------------------------------
create table if not exists public.cash_remittance (
  id               bigint generated always as identity primary key,
  period_start     date,
  period_end       date,
  cash_total       numeric default 0,
  expense_total    numeric default 0,
  net_amount       numeric default 0,
  included_dates   jsonb default '[]'::jsonb,
  status           text default 'submitted',
  submitted_by     text,
  submitted_amount numeric default 0,
  slip_url         text,
  submitted_at     timestamptz,
  diff             numeric default 0,
  note             text,
  confirmed_by     text,           -- เซ็ตโดย edge action confirmRemit
  confirmed_at     timestamptz,
  created_at       timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 11) staff (ข้อมูลอ่อนไหว) + staff_safe (view PDPA)
--     ✅ คอลัมน์ตรงตาม Edge Function จริง (secure-api_index.ts) — ไม่ใช่การเดา
--     frontend อ่านจาก staff_safe เท่านั้น · PIN/ค่าจ้าง/บัญชี เข้าผ่าน edge (service_role)
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  staff_id        text primary key,
  name            text,
  nickname        text,
  position        text,
  branch          text,
  emp_type        text,               -- 'ประจำ' | 'พาร์ทไทม์'
  active          boolean default true,
  start_date      date,
  wage            numeric default 0,   -- อ่อนไหว
  wage_unit       text,                -- หน่วยค่าจ้าง (เดือน/วัน)
  wage_start_date date,                -- วันเริ่มนับค่าจ้าง
  bank            text,                -- อ่อนไหว
  bank_account    text,                -- อ่อนไหว
  account_name    text,                -- อ่อนไหว
  phone           text,                -- อ่อนไหว
  line_id         text,
  pin             text,                -- อ่อนไหว
  face_descriptor text,                -- เวกเตอร์ใบหน้า (จับคู่ตอนตอกบัตร)
  id_card_url     text,                -- อ่อนไหว (staff-docs, signed url)
  doc1_url        text,
  doc2_url        text,
  edited_at       timestamptz,         -- edge saveAttendStaff เขียนคอลัมน์นี้ (ห้ามลืม!)
  created_at      timestamptz default now()
);

-- view ปลอดภัย (PDPA) — คอลัมน์ตรงตาม edge (มี has_face = มีข้อมูลใบหน้าไหม, ไม่หลุด vector)
create or replace view public.staff_safe
  with (security_invoker = false) as
  select staff_id, name, nickname, position, branch, active, emp_type, start_date,
         (face_descriptor is not null) as has_face
  from public.staff;

-- ---------------------------------------------------------------------
-- 12) payments — ประวัติการจ่ายเงินเดือน (เขียนผ่าน Edge action markPaid เท่านั้น)
--     ✅ คอลัมน์ตรงตาม markPaid() ใน edge จริง · frontend ไม่ query ตรง
--     กันจ่ายซ้ำด้วย (staff_id, period)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id           bigint generated by default as identity primary key,
  staff_id     text,
  name         text,
  type         text,               -- 'ประจำ' | 'พาร์ทไทม์'
  period       text,               -- งวด: cycleKey (ประจำ) หรือ 'PT-YYYY-MM-DD' (พาร์ทไทม์)
  period_start date,
  period_end   date,
  paid_up_to   date,               -- จ่ายถึงวันที่ (พาร์ทไทม์)
  days         numeric default 0,
  alone_days   numeric default 0,  -- วันที่อยู่คนเดียว (พาร์ทไทม์)
  pay_date     date,
  paid_by      text,
  note         text,
  created_at   timestamptz default now()
);
create index if not exists idx_payments_staff  on public.payments (staff_id);
create index if not exists idx_payments_period on public.payments (staff_id, period);
