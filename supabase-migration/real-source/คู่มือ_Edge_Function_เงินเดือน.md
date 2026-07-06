# 🔐 คู่มือสเต็ป 2 — Edge Function เงินเดือน + พนักงาน

ทำ 6 ขั้นตามลำดับ (ทำผ่านเว็บ Supabase + GitHub ทั้งหมด ไม่ต้องใช้ terminal)

> ผลลัพธ์: หน้าเงินเดือนต้องใส่ "รหัสเจ้าของ" ก่อนเข้า · ข้อมูลเงินเดือน/PIN/บัญชี อยู่หลัง server · service_role key ไม่หลุดมาหน้าเว็บอีก

---

## ขั้น 0 — Reset service_role key (ตัวเก่าเคยหลุด)
1. Supabase → ⚙️ **Project Settings → API Keys** (หรือ Data API)
2. หา **service_role** (secret) → กด **Reset / Roll**
3. ยืนยัน — ระบบจะออกตัวใหม่ให้
> ไม่ต้องเอาตัวใหม่ไปแปะที่ไหน — Edge Function ดึง service_role ปัจจุบันให้อัตโนมัติ
> (ห้ามเอา service_role ใส่หน้าเว็บ/repo เด็ดขาด)

## ขั้น 1 — รัน SQL เตรียมฝั่ง server
SQL Editor → New query → วางไฟล์ **`Supabase_12_payroll_staff.sql`** → Run
(ล็อก RLS ตาราง staff/payments + สร้าง bucket `staff-docs` แบบส่วนตัว)

## ขั้น 2 — สร้าง Edge Function
1. เมนูซ้าย → **Edge Functions** → **Deploy a new function** → **Via Editor** (เขียนในเว็บ)
2. ตั้งชื่อฟังก์ชัน **ตรงเป๊ะ**: `secure-api`
3. ลบโค้ดตัวอย่างทิ้ง → เปิดไฟล์ **`secure-api_index.ts`** ที่ผมแนบ → ก๊อปทั้งหมดมาวาง
4. **สำคัญที่สุด — ต้องปิด "Verify JWT"** (ไม่งั้นหน้าเว็บโดน 401 เรียกไม่ได้)
   เพราะ key รุ่นใหม่ (sb_publishable_…) ไม่ใช่ JWT จึงผ่านด่าน verify_jwt ไม่ได้
   หาสวิตช์ได้ที่ (dashboard ปัจจุบัน):
   - ตอนกด **Deploy a new function → Via Editor** มองหา **"Verify JWT"** ใน option ก่อน deploy → ปิด
   - ถ้าไม่เห็นตอนนั้น: deploy ไปก่อน แล้วเปิดฟังก์ชัน → แท็บ/เมนู **Details** (หรือไอคอนเฟือง ⚙️ "Function settings") → toggle **"Enforce JWT Verification" / "Verify JWT"** → **ปิด** → Save
   - 🔎 ถ้าหาไม่เจอจริงๆ บอกผม เดี๋ยวผมเข้าไปดูหน้าจอ Supabase ให้ผ่านเบราว์เซอร์ (Claude in Chrome)
5. กด **Deploy**

## ขั้น 3 — ตั้ง Secret รหัสเจ้าของ
1. Edge Functions → **Secrets** (Manage secrets)
2. Add new secret:
   - Name: `OWNER_PASSCODE`
   - Value: `130324`  ← (รหัสเดิมจาก Code.gs · จะเปลี่ยนเป็นเลขอื่นก็ได้ จำให้ได้)
3. Save → (ถ้า deploy ไปแล้วก่อนตั้ง secret ให้กด **Deploy ซ้ำ 1 ครั้ง** ให้ฟังก์ชันเห็นค่าใหม่)

> URL ของฟังก์ชันจะเป็น: `https://sfdahyvekfcxoprkshko.supabase.co/functions/v1/secure-api`
> (shared.js ชี้ไป URL นี้ให้แล้ว ไม่ต้องแก้)

## ขั้น 4 — อัปไฟล์หน้าเว็บขึ้น GitHub (repo V2)
เอา 2 ไฟล์นี้ไปทับ:
- **`shared.js`** (เพิ่ม routing ไป Edge Function — getPayrollStatus/markPaid/getStaffDetail/verifyStaffPin/saveAttendStaff)
- **`payments.html`** (เพิ่มหน้าใส่รหัสเจ้าของก่อนเข้า)

## ขั้น 5 — ทดสอบ (เปิด Incognito กัน cache)
| หน้า | ทดสอบ | คาดหวัง |
|---|---|---|
| **payments** | เปิดหน้าเงินเดือน | เด้งถามรหัส → ใส่ `130324` → เข้าได้ · ใส่ผิด → แจ้งรหัสไม่ถูกต้อง |
| **payments** | กดจ่ายพาร์ทไทม์/ประจำ 1 รายการ | ตาราง `payments` มีแถวใหม่ · กลับมาขึ้น "จ่ายแล้ว" |
| **attend** | เลือกพนักงาน → ใส่ PIN | PIN ถูก = ผ่านไปถ่ายรูป · PIN ผิด = แจ้งเตือน (verifyStaffPin ผ่าน Edge) |
| **attend-setup** | กด "ดูข้อมูล" พนักงาน | โชว์ ธนาคาร/บัญชี ครบ (getStaffDetail ผ่าน Edge) |
| **attend-setup** | เพิ่ม/แก้พนักงาน | ตาราง `staff` อัปเดต (saveAttendStaff ผ่าน Edge · ไม่ต้องใส่รหัส) |

---

## ⚠️ หมายเหตุ
- **รหัสเจ้าของกันแค่หน้าเงินเดือน** (getPayrollStatus/markPaid) — แก้พนักงานไม่ต้องใส่รหัส ตามที่ตกลง
- **getStaffDetail ยังเปิดได้โดยไม่ต้องรหัส** (เหมือน Apps Script เดิม) ถ้าต้องการล็อกข้อมูลบัญชีพนักงานด้วยรหัสในอนาคต บอกได้ เพิ่ม gate ได้
- **เอกสารพนักงาน (บัตร ปชช.)** เก็บใน bucket ส่วนตัว `staff-docs` + เปิดดูผ่าน signed url (หมดอายุใน 1 ชม.) — ปลอดภัยกว่าเดิม
- **เงินเดือนยังไม่ผูก LINE** — ส่วนแจ้งเตือน LINE (ปิดรอบ/ออดิท/สิ้นวัน) เป็นอีกงานแยก (LINE token อยู่ใน Code.gs แล้ว พร้อมย้ายเข้า Edge Function เมื่อต้องการ)
- ตรรกะเงินเดือน port ตรงจาก Code.gs: พาร์ทไทม์นับวันหลังจ่ายล่าสุด + ธง "มาคนเดียว" · ประจำงวด 1–15 / 16–สิ้นเดือน เริ่มนับ 1 มิ.ย. 2026 (PAYROLL_START)

## ถ้าเรียกไม่ได้ / error
- เปิดไม่ได้ "Edge HTTP 401" → ยังไม่ได้ปิด **Verify JWT** (ขั้น 2.4) เป็นสาเหตุอันดับ 1 → ปิดแล้ว Deploy ซ้ำ
  (shared.js ส่ง key ผ่าน header `apikey` ให้ถูกแล้ว ไม่ได้ใส่ใน Authorization)
- "รหัสเจ้าของไม่ถูกต้อง" ทั้งที่ใส่ถูก → ยังไม่ได้ตั้ง secret `OWNER_PASSCODE` หรือยังไม่ Deploy ซ้ำหลังตั้ง (ขั้น 3)
- ดู log ได้ที่ Edge Functions → secure-api → **Logs**
