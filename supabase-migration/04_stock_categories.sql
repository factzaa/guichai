-- ============================================================
-- กุยช่ายสวรรค์ — ตารางหมวดสต๊อก (จัดการเพิ่ม/แก้/ลบเองได้ในแอป)
-- แทนหมวดที่เคยฮาร์ดโค้ด (Waffle/KUFF/Drink/Others)
-- รันใน SQL Editor → New query → วาง → Run (รันซ้ำได้)
-- ============================================================

create table if not exists public.stock_categories (
  cat_key    text primary key,        -- คีย์ภายใน (ใช้เป็นค่า category ใน stock_items)
  label      text not null,           -- ชื่อแสดง เช่น "กุยช่าย"
  emoji      text default '📦',
  prefix     text default 'X',        -- ตัวย่อขึ้นต้น item_id (เช่น G → G001)
  sort_order integer default 0,
  active     boolean default true,
  created_at timestamptz default now()
);

-- RLS: อ่าน/เพิ่ม/แก้/ลบได้ด้วย publishable key (เหมือนตารางปฏิบัติงานอื่น)
alter table public.stock_categories enable row level security;
drop policy if exists v2_all_stock_categories on public.stock_categories;
create policy v2_all_stock_categories on public.stock_categories
  for all to anon, authenticated using (true) with check (true);

-- Seed หมวดเริ่มต้นสำหรับร้านกุยช่าย (แก้/ลบ/เพิ่มเองได้ภายหลังในหน้าจัดการสต๊อก)
insert into public.stock_categories (cat_key, label, emoji, prefix, sort_order) values
  ('guichai', 'กุยช่าย',      '🥟', 'G', 1),
  ('cooked',  'ของทอด-นึ่ง',  '🍢', 'C', 2),
  ('sauce',   'น้ำจิ้ม',       '🥫', 'S', 3),
  ('drink',   'เครื่องดื่ม',    '🥤', 'D', 4),
  ('package', 'บรรจุภัณฑ์',    '📦', 'P', 5),
  ('other',   'อื่นๆ',         '🧺', 'O', 6)
on conflict (cat_key) do nothing;

select cat_key, label, emoji, prefix, sort_order from public.stock_categories order by sort_order;
