-- ============================================================
-- Supabase_12 — เตรียมฝั่ง server สำหรับ Edge Function (เงินเดือน + พนักงาน)
-- รันใน Supabase → SQL Editor → New query → วาง → Run (รันซ้ำได้)
-- ============================================================

-- 1) ล็อกตารางอ่อนไหวไม่ให้ publishable key อ่านตรงได้
--    (Edge Function ใช้ service_role → ข้าม RLS ได้อยู่แล้ว ไม่ต้องมี policy)
alter table public.staff    enable row level security;
alter table public.payments enable row level security;

-- เผื่อเคยเผลอเปิด policy อ่านสาธารณะของ staff ไว้ — ลบทิ้ง (คงไว้แค่ view staff_safe)
drop policy if exists v2_sel_staff_public on public.staff;

-- 2) Storage bucket เก็บเอกสารพนักงาน (บัตร ปชช./เอกสาร) — ส่วนตัว (private)
--    Edge Function อัปโหลด + เซ็น signed url ให้ตอนเปิดดู (ไม่เปิดสาธารณะ)
insert into storage.buckets (id, name, public)
values ('staff-docs', 'staff-docs', false)
on conflict (id) do update set public = false;

-- เช็ค
select 'staff RLS' as t, relrowsecurity from pg_class where relname='staff'
union all select 'payments RLS', relrowsecurity from pg_class where relname='payments';
