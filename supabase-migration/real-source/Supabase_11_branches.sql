-- ============================================================
-- Supabase_11 — ย้าย "สาขา" (getAttendBranches + saveAttendBranch) มา Supabase
-- + แก้บั๊กคอลัมน์ที่สคริปต์ migrate เดิม map ผิด (ลืมคอลัมน์ address เลยเลื่อน lat/lng/radius)
-- รันใน Supabase → SQL Editor → New query → วาง → Run (รันซ้ำได้)
-- ============================================================

-- 1) เพิ่มคอลัมน์ที่ตาราง branches ยังไม่มี (address, active)
alter table public.branches add column if not exists address text;
alter table public.branches add column if not exists active  boolean default true;

-- 2) RLS: อนุญาตอ่าน/เพิ่ม/แก้ (สาขาไม่ใช่ข้อมูลอ่อนไหว)
alter table public.branches enable row level security;

drop policy if exists v2_sel_branches on public.branches;
create policy v2_sel_branches on public.branches for select to anon, authenticated using (true);

drop policy if exists v2_ins_branches on public.branches;
create policy v2_ins_branches on public.branches for insert to anon, authenticated with check (true);

drop policy if exists v2_upd_branches on public.branches;
create policy v2_upd_branches on public.branches for update to anon, authenticated using (true) with check (true);

-- 3) แก้แถวสาขาที่ค่าเลื่อน (ตอน migrate: lat ได้ค่า address, lng ได้ค่า lat จริง, radius ได้ค่า lng จริง)
--    คืนค่าที่ถูกต้องให้สาขา PTNGAM (พันทิพย์ งามวงศ์วาน)
--    ⚠️ radius จริงหายไปตอน migrate — ใส่ค่าที่ร้านตั้งไว้ (เดิม default 100 ม.) ถ้าไม่ใช่ 100 แก้เลขด้านล่าง
update public.branches
set lat    = 13.8574368,     -- ละติจูดจริง
    lng    = 100.5368125,    -- ลองจิจูดจริง
    radius = 50,             -- รัศมีจริง 50 เมตร
    active = true
where branch_id = 'PTNGAM';

-- เช็คผล
select branch_id, name, lat, lng, radius, active from public.branches;
