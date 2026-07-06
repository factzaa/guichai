# กุยช่ายสวรรค์ — คู่มือย้าย Supabase (Migration Guide)

คู่มือนี้พาสร้าง Supabase project ใหม่ของ **กุยช่ายสวรรค์** แล้วชี้แอปมาที่ฐานใหม่
ทำตามลำดับ 1 → 7

---

## ภาพรวมสถาปัตยกรรม (สำคัญ — อ่านก่อน)

แอปนี้ **ไม่ได้พึ่ง Supabase อย่างเดียว** มี 3 backend ซ้อนกันใน `api()` (`shared.js`):

1. **`SB_ACTIONS`** — ยิง Supabase REST ตรงจาก browser ด้วย publishable key (อ่าน+เขียนตารางปฏิบัติงานเกือบทั้งหมด)
2. **`EDGE_ACTIONS`** — ยิง Edge Function `secure-api` (งานอ่อนไหว: เงินเดือน/พนักงาน/AI/LINE/TTS)
3. **`APPS_SCRIPT_URL`** — Google Apps Script เดิม (fallback) — **ยังชี้ไปบัญชี Google ของ Maru** (`shared.js` บรรทัด 6)

➡️ การ "ย้าย Supabase" ให้ครบ = ทำ **3 ส่วน**: ฐานข้อมูล/Storage (ข้อ 1–4), Edge Function (ข้อ 5), และเปลี่ยน credential ในโค้ด (ข้อ 6)

> ✅ **มี source จริงครบแล้ว** (จาก `E:\Backup Laptop Maru`) — อยู่ในโฟลเดอร์ `real-source/`:
> - **`secure-api_index.ts` (ตัวจริง 74KB)** → ใช้แล้วที่ `edge-function/secure-api/index.ts` (ไม่ใช่ scaffold แล้ว — scaffold เก่าเก็บไว้เป็น `index.SCAFFOLD-OLD.ts` อ้างอิงเฉยๆ)
> - **`Supabase_09..13.sql`** → สคริปต์ RLS/policy จริงของ Maru (stock/attendance/branches/payroll/cash-remittance)
> - **`migration_block.gs`** → โค้ดย้ายข้อมูล 11 ตารางจาก Google Sheet → Supabase (กันซ้ำ) ใช้ถ้าจะย้ายข้อมูลเก่ามาด้วย
> - **คู่มือ 3 ไฟล์** (Edge เงินเดือน / วิธีติดตั้ง / แผน cut-over)
>
> ⚠️ **หมายเหตุ schema:** ไฟล์ `Supabase_09..13.sql` เป็นสคริปต์ **ALTER/policy** (สมมติว่า base table มีแล้ว) — ตัว `CREATE TABLE` ของ 8 ตารางแรกอยู่ในขั้น 01–08 ที่**ไม่มีใน backup** ผมจึงเขียน `01_schema.sql` ครอบ base table ทั้งหมดให้ (คอลัมน์ staff/payments/cash_remittance ตรงกับ source จริง 100% ส่วนตารางปฏิบัติงานถอดจาก frontend + cross-check แล้ว) → **รัน `01_schema.sql` ก่อน แล้วค่อยรัน `real-source/Supabase_09..13.sql`**

---

## 1. สร้าง Supabase project ใหม่

1. ไป https://supabase.com/dashboard → **New project**
2. ตั้งชื่อเช่น `guichai-pantip` เลือก region ใกล้ไทย (Singapore) ตั้ง DB password (เก็บไว้)
3. รอ provision เสร็จ

## 2. สร้างตาราง (schema)

Dashboard → **SQL Editor** → **New query** → วางไฟล์ `01_schema.sql` ทั้งไฟล์ → **Run**
(สร้าง 12 ตาราง + view `staff_safe`)

## 3. Storage + สิทธิ์ (RLS)

SQL Editor → New query → วาง `02_storage_and_rls.sql` → **Run**
(สร้าง 4 bucket: `receipts`, `attendance`, `remit-slips` แบบ public + `staff-docs` แบบ private + policy อ่าน/อัปโหลด + เปิด RLS ตารางปฏิบัติงาน · staff/payments อ่อนไหวเข้าผ่าน edge เท่านั้น)

> 🔁 **ทางเลือกที่ตรงกับ Maru เป๊ะ:** หลังรัน `01_schema.sql` จะรัน `real-source/Supabase_09..13.sql` ตามลำดับแทน `02_storage_and_rls.sql` ก็ได้ (เป็น policy จริงของ Maru) — `Supabase_11_branches.sql` มี **พิกัดสาขา PTNGAM จริง** (lat 13.8574368, lng 100.5368125, radius 50 ม.) ถ้าสาขากุยช่ายอยู่คนละที่ ให้แก้พิกัด/รหัสสาขาก่อนรัน · `02_storage_and_rls.sql` เป็นเวอร์ชันรวบให้ครบในไฟล์เดียว เลือกอย่างใดอย่างหนึ่ง

ตรวจว่าตารางครบ:
```sql
select table_name from information_schema.tables where table_schema='public' order by 1;
```

## 4. เอา URL + publishable key ของ project ใหม่

Dashboard → **Project Settings → API**
- **Project URL** → เช่น `https://xxxxxxxx.supabase.co`  → ใช้แทน `SB_URL`
- **publishable key** (`sb_publishable_...` หรือ `anon` key) → ใช้แทน `SB_KEY`

## 5. Deploy Edge Function + ตั้ง Secrets

```bash
# ติดตั้ง CLI ครั้งแรก:  npm i -g supabase   แล้ว  supabase login
supabase link --project-ref <PROJECT_REF>
# วางโฟลเดอร์ edge-function/secure-api ไว้ที่ supabase/functions/secure-api
supabase functions deploy secure-api --no-verify-jwt
```

ตั้ง secrets (Dashboard → Edge Functions → secure-api → Secrets หรือ CLI):
```bash
supabase secrets set \
  LINE_CHANNEL_TOKEN=xxxx \
  LINE_GROUP_ID=Cxxxxxxxx \
  GEMINI_API_KEY=xxxx \
  GEMINI_MODEL=gemini-2.0-flash \
  OWNER_PASSCODE=รหัสเจ้าของ
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY มีให้อัตโนมัติใน edge runtime
```

| Secret (ชื่อตรงตาม edge จริง) | ใช้ทำอะไร | หาได้จาก |
|---|---|---|
| `LINE_CHANNEL_TOKEN` | ส่ง LINE แจ้งเตือน (ปิดรอบ/ออดิท/เช็คอิน) | LINE Developers → Messaging API |
| `LINE_GROUP_ID` | groupId กลุ่มปลายทาง | LINE |
| `GEMINI_API_KEY` | ผู้ช่วย AI / โปรโมชัน / TTS | Google AI Studio |
| `GEMINI_MODEL` | ชื่อโมเดล (เช่น `gemini-2.0-flash`) | ตั้งเอง |
| `OWNER_PASSCODE` | รหัสเจ้าของ (ปลดล็อกเงินเดือน) | ตั้งเอง |
| `SUPABASE_SERVICE_ROLE_KEY` | เขียนตารางอ่อนไหว (staff/payments) | อัตโนมัติใน edge |

> ✅ Edge Function ที่ deploy คือ **ตัวจริงของ Maru** — action เงินเดือน/พนักงาน/AI/LINE ทำงานได้ครบ ไม่ต้องเติม STUB เอง (ต่างจากรอบก่อน)

> ตราบที่ Edge Function ยังไม่พร้อม แอปยังใช้งานส่วนหลักได้ (ยอดขาย/สต๊อก/ค่าใช้จ่าย/เช็คอิน) แต่หน้าที่เรียก edge (payments, ผู้ช่วย AI, ปุ่มส่ง LINE, เงินเดือน) จะยัง error

## 6. เปลี่ยน credential ในโค้ด — 6 ไฟล์

แก้ `SB_URL`/`SB_KEY` (บางไฟล์ชื่อ `SUPABASE_URL`/`SUPABASE_KEY`) เป็นของ project ใหม่:

| ไฟล์ | บรรทัด | ตัวแปร |
|---|---|---|
| `shared.js` | 130–131 | `SB_URL`, `SB_KEY` |
| `sb-data.js` | 13–14 | `SB_URL`, `SB_KEY` |
| `records.html` | 881–882 | `SB_URL`, `SB_KEY` |
| `expenses-report.html` | 237–238 | `SB_URL`, `SB_KEY` |
| `dashboard.html` | 66–67 | `SUPABASE_URL`, `SUPABASE_KEY` |
| `pilot-sales.html` | 55–56 | `SUPABASE_URL`, `SUPABASE_KEY` |

ค่าเดิมที่ต้องถูกแทนที่ทุกจุด:
- URL เดิม: `https://sfdahyvekfcxoprkshko.supabase.co`
- KEY เดิม: `sb_publishable_632DkQ4uOHjIGWr-_c7hCA_WgFHe3jT`

> 💡 บอกผมค่า **Project URL + publishable key** ใหม่ได้เลย เดี๋ยวผมแก้ทั้ง 6 ไฟล์ให้ในครั้งเดียว (find-and-replace ปลอดภัยเพราะค่าเดิมเหมือนกันหมด)

### อย่าลืม: Google Apps Script (dependency ซ่อน)
`shared.js` บรรทัด **6** `APPS_SCRIPT_URL` ยังชี้ไป Google ของ Maru
ตอนนี้ทุก action ถูก route ผ่าน `SB_ACTIONS`/`EDGE_ACTIONS` แล้ว จึงไม่ได้ถูกเรียก —
แต่ควร **ลบทิ้งหรือชี้ไปของตัวเอง** กันหลุด (ถ้ามี action ใหม่ที่ไม่อยู่ใน 2 กลุ่มบน จะ fallback มาที่นี่)

## 7. ทดสอบ

1. เปิดแอปด้วย local server (อย่าเปิดไฟล์ `file://` ตรง ๆ — service worker/fetch จะพัง):
   ```bash
   cd "E:\Guichai Pantip App"
   python -m http.server 5500      # แล้วเปิด http://localhost:5500
   ```
2. บันทึกยอดขายทดสอบ 1 วัน → เช็คว่าขึ้นในตาราง `sales` (Table Editor)
3. อัปรูปใบเสร็จ → เช็ค bucket `receipts`
4. เปิด Console (F12) ดูว่าไม่มี error 401/404 จาก Supabase
5. ทดสอบเช็คอิน (attendance) + ปิดรอบสต๊อก (stock_daily)

---

## เช็คลิสต์ migration

- [ ] สร้าง project ใหม่
- [ ] รัน `01_schema.sql` (12 ตาราง + view staff_safe)
- [ ] รัน `02_storage_and_rls.sql` **หรือ** `real-source/Supabase_09..13.sql` (4 bucket + RLS)
- [ ] Deploy `secure-api` (ตัวจริง) + ตั้ง secrets 6 ตัว
- [ ] แก้ credential 6 ไฟล์ (SB_URL/SB_KEY → project ใหม่)
- [ ] จัดการ `APPS_SCRIPT_URL` (shared.js บรรทัด 6)
- [ ] (ถ้าต้องการข้อมูลเก่า) ย้ายข้อมูลด้วย `real-source/migration_block.gs` — วาง service_role key ใหม่ + ชี้ SUPABASE_URL ใหม่
- [ ] แก้พิกัด/รหัสสาขาให้ตรงร้านกุยช่าย (ถ้าไม่ใช่ PTNGAM เดิม)
- [ ] ทดสอบครบ flow
```
