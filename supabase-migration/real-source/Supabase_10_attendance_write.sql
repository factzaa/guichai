-- ============================================================
-- Supabase_10 — เปิดสิทธิ์ "เขียน" ฝั่งเข้างาน (addAttendLog) + bucket รูปเซลฟี่
-- ใช้คู่กับ shared.js เวอร์ชันที่ย้าย addAttendLog มา Supabase
-- รันใน Supabase → SQL Editor → New query → วาง → Run (รันซ้ำได้)
-- ============================================================

-- 1) ตาราง attendance: เปิด RLS + อนุญาต INSERT
alter table public.attendance enable row level security;

drop policy if exists v2_ins_attendance on public.attendance;
create policy v2_ins_attendance on public.attendance for insert to anon, authenticated with check (true);

-- 2) Storage bucket 'attendance' (เก็บรูปเซลฟี่ตอนตอกบัตร) — เปิดสาธารณะให้ดูรูปได้
insert into storage.buckets (id, name, public)
values ('attendance', 'attendance', true)
on conflict (id) do update set public = true;

-- 3) สิทธิ์ Storage: อัปโหลด (insert) + อ่าน (select) เฉพาะ bucket นี้
drop policy if exists v2_attendance_upload on storage.objects;
create policy v2_attendance_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'attendance');

drop policy if exists v2_attendance_read on storage.objects;
create policy v2_attendance_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'attendance');
