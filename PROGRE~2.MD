# 📋 Maru Waffle V2 — บันทึกความคืบหน้า + โครงสร้าง + แผนต่อยอด

> อัปเดตล่าสุด: 22 มิ.ย. 2026 · สถานะ: **พร้อม Cut-over (ใช้ Supabase 100%)**
> เก็บไฟล์นี้ไว้ใน repo `Maru-Waffle-V2` (เช่น `PROGRESS.md`) เปิดต่อจากเครื่องไหนก็ได้

---

## 1) ภาพรวม & สถานะปัจจุบัน

แอปจัดการร้าน Maru Waffle (สาขา Pantip Ngamwongwan) ย้ายจาก **Google Apps Script + Google Sheet**
มาเก็บข้อมูลที่ **Supabase (PostgreSQL + Storage)** เรียบร้อย — เป็น **PWA บน GitHub Pages** เหมือนเดิม (ไม่ขึ้น App Store)

สถานะ: เขียน-อ่านข้อมูลผ่าน Supabase ครบทุกหน้า · แจ้งเตือน LINE ครบ 4 แบบ (ฝั่ง Supabase) ·
ผู้ช่วย AI ตอบข้อมูลทุกตาราง + ทำโพสต์การตลาด · ระบบเงินสดนำส่ง · ดีไซน์ครีม-เหลืองทั้งแอป ·
สคริปต์ย้ายข้อมูลกันซ้ำพร้อม · เอกสารแผน cut-over พร้อม

---

## 2) ข้อมูลระบบ (สำคัญ)

**Repos**
- V1 production เดิม: `factzaa/Maru-Waffle` (Apps Script — กำลังจะเลิกใช้หลัง cut-over)
- V2: `factzaa/Maru-Waffle-V2` → https://factzaa.github.io/Maru-Waffle-V2/

**Supabase**
- Project URL: `https://sfdahyvekfcxoprkshko.supabase.co`
- Publishable key (ใส่ในหน้าเว็บได้): `sb_publishable_...` (อยู่ใน shared.js)
- ⚠️ **service_role / secret key**: ห้ามอยู่ในหน้าเว็บ/GitHub — เคยหลุดในภาพหน้าจอ + เคยฮาร์ดโค้ดใน Code.gs ตอนย้ายข้อมูล → **ต้อง rotate ใหม่หลัง cut-over**
- Edge Function: `secure-api` (Deno/TypeScript) — ปิด Verify JWT, เช็คสิทธิ์เองด้วย owner passcode

**Edge secrets ที่ต้องตั้ง:** `SUPABASE_SERVICE_ROLE_KEY` (อัตโนมัติ), `OWNER_PASSCODE`, `GEMINI_API_KEY`, `LINE_CHANNEL_TOKEN`, `LINE_GROUP_ID`

---

## 3) ทำเสร็จแล้ว (Done)

**ย้ายข้อมูล/สถาปัตยกรรม**
- ย้าย action เขียน-อ่านทั้งหมดไป Supabase (stock/attendance/sales/expenses/branches/staff)
- สคริปต์ `migrateAllToSupabase()` ใน Apps Script — ย้าย 11 ตาราง, กันซ้ำด้วย natural key, กรองตั้งแต่วันที่
- Edge Function สำหรับงานอ่อนไหว: เงินเดือน (owner passcode), ข้อมูลพนักงาน, ผู้ช่วย AI, การตลาด, ยืนยันเงินนำส่ง, แจ้งเตือน LINE

**ฟีเจอร์**
- ผู้ช่วยมารุ: ตอบข้อมูลจริงทุกตาราง (Gemini function-calling + query tool) + ดูใบเสร็จ/รูปแบบ inline + แนบรูปทำโพสต์ (แคปชั่น + โปสเตอร์ Canvas 6 สไตล์ + แต่งภาพ AI) + คำถามด่วน 4 หมวด + วิธีใช้โหมดการตลาด
- ระบบเงินสดนำส่ง: คำนวณ Σ เงินสด(วันปิดรอบ) − Σ ค่าใช้จ่าย POS, rolling จากครั้งก่อน, เลือก "ถึงวันที่" ได้, เจ้าของยืนยัน/ทักท้วงด้วยรหัส
- แจ้งเตือน LINE 4 แบบ (Supabase): รายงานสิ้นวัน / ปิดร้าน / ออดิท / เข้า-ออกงาน — Flex การ์ดเหมือนเดิม
- getAlerts (มารุเฝ้าร้าน): ของใกล้หมด/หมด, เงินสดรอนำส่ง ฯลฯ

**ดีไซน์/UX**
- โทนครีม-เหลือง-สว่างทั้งแอป (เลิกธีมดำ) · หัวทุกหน้าเป็นแถบเหลืองโค้ง · โลโก้โปร่งใส
- ไซด์บาร์ไอคอน SVG เส้น (สม่ำเสมอทุกหน้า รวม expenses-report)
- หน้าบันทึกสิ้นวัน: ช่องช่องทางเป็นแถวเดียวเรียงลง (ไม่ใช่การ์ดเทอะทะ)
- คู่มือ (manual.html) อัปเดตครบฟีเจอร์ใหม่

**เอกสาร/เครื่องมือ**
- แผน cut-over, สคริปต์ migration, หน้าทดสอบ LINE (test-line.html), ข้อความแจ้งพนักงานติดตั้งแอป

---

## 4) วิเคราะห์โครงสร้าง (Architecture)

### 4.1 ภาพรวมการไหลของข้อมูล
```
[ หน้าเว็บ PWA (GitHub Pages) ]
        │  api(action, params)            ← shared.js router
        ├──► Supabase REST (PostgREST)    ← อ่าน/เขียนตารางทั่วไป (publishable key + RLS)
        ├──► Supabase Storage             ← รูปใบเสร็จ/เข้างาน/สลิป
        ├──► Edge Function "secure-api"   ← งานอ่อนไหว + AI + LINE (service_role อยู่ฝั่ง server)
        │         ├──► Gemini API          (ผู้ช่วย/การตลาด)
        │         └──► LINE Messaging API  (แจ้งเตือนกลุ่ม)
        └──► (ยังมี APPS_SCRIPT_URL เป็น fallback แต่ไม่มี action วิ่งไปแล้ว)
```

### 4.2 เลเยอร์ฝั่งหน้าเว็บ (client)
- **shared.js** (~ไฟล์หลัก) = หัวใจ: ตัว router `api()` + `SB_ACTIONS` (อ่าน/เขียนตรง Supabase) + `EDGE_ACTIONS` (ยิงไป Edge) + fallback Apps Script + ICONS + buildSidebar + injectShell + ปุ่มลอยมารุ + Flex builders (maruBuildDailyFlex/StockFlex/AuditFlex/AttendFlex) + maruNotifyLine + poster engine (maruDrawPoster + 6 สไตล์)
- **sb-data.js** = override `window.api` เฉพาะหน้า records (saveDailyReport + read หน้ารายงาน) — เลเยอร์ข้อมูลของหน้าบันทึกสิ้นวัน/แดชบอร์ด
- **shared.css** = ธีมรวม (ตัวแปรสี, .head, sidebar, card)
- **sw.js** = service worker cache (เวอร์ชัน `maru-waffle-vNN` — บั๊มทุกครั้งที่แก้ไฟล์ client เพื่อให้เครื่องดึงใหม่)

### 4.3 หน้า (pages)
งานประจำวัน: index, records (บันทึกสิ้นวัน/แดชบอร์ด/ค่าใช้จ่าย), stock-withdraw/receive/close/audit, attend
รายงาน: expenses-report, stock-view, stock-dashboard, attend-report, stock-audit-report, activities
จัดการ: stock-manage, attend-setup, payments, cash-remit
อื่นๆ: assistant, manual
(legacy ไม่ใช้: dashboard.html, pilot-sales.html, home-*-preview, mockup-*)

### 4.4 ฐานข้อมูล Supabase (11 ตาราง + 1 view)
`sales` · `expenses` · `stock_items` · `stock_withdraw` · `stock_receive` · `stock_daily` · `stock_audit` ·
`staff` · `branches` · `attendance` · `payments` · `cash_remittance` (ฟีเจอร์ใหม่)
- view `staff_safe` = ข้อมูลพนักงานแบบปลอดภัย (PDPA) เปิดเฉพาะ name/nickname/position/branch
- Storage buckets: `receipts`, `attendance`, `staff-docs`, `remit-slips`

### 4.5 จุดแข็ง / จุดเปราะของโครงสร้าง
**แข็ง:** แยกข้อมูลอ่อนไหวไป Edge (key ไม่หลุด), reuse Flex/poster engine ตัวเดียว, PWA ออฟไลน์บางส่วนได้, RLS ป้องกันการเขียนมั่ว
**เปราะ/ควรปรับ:**
- ยังไม่มี **ระบบล็อกอินจริง** — ใครเปิดลิงก์ก็ใช้ได้ (เหมาะร้านเล็ก แต่เสี่ยงถ้าลิงก์หลุด) · Edge ป้องกันแค่งานเงิน
- **ไม่มี backup อัตโนมัติ** (free plan)
- **service_role key เคยหลุด** → ต้อง rotate
- พื้นที่ Storage ฟรี 1 GB จะเต็มจากรูปก่อน (ดูข้อ 6)
- โค้ดส่วนใหญ่รวมใน shared.js ไฟล์เดียว (ใหญ่) — ถ้าทีมโตควรแตกโมดูล

---

## 5) งานเก็บกวาดหลัง Cut-over (ค้างอยู่)
- [ ] ตั้ง Edge secrets `LINE_CHANNEL_TOKEN` + `LINE_GROUP_ID` (กลุ่มจริง) แล้ว Deploy Edge
- [ ] รัน migrate รอบสุดท้ายหลังพนักงานกรอกครบ → verify
- [ ] ประกาศให้พนักงานติดตั้งแอปใหม่ + หยุดระบบเดิม
- [ ] **ลบ service_role key ออกจาก Code.gs + Rotate key ใหม่** (ความปลอดภัย — สำคัญ)
- [ ] ลบ `test-line.html` ออกจาก repo (กันพนักงานเผลอกด)
- [ ] (ทำเมื่อมั่นใจ) ลบ fallback `APPS_SCRIPT_URL` ออกจาก shared.js
- [ ] เก็บ Google Sheet เป็น backup 1-2 เดือน + ปิดสิทธิ์แก้ไขพนักงาน

---

## 6) ข้อจำกัด Supabase ฟรี (ตัวที่ต้องเฝ้า)
- ฐานข้อมูล 500 MB (ข้อความ — ใช้ได้หลายปี) · **ไฟล์ 1 GB (รูป — เต็มก่อนเพื่อน ~2-4 ปี)** · แบนด์วิดท์ 10 GB/เดือน · Edge 500k ครั้ง/เดือน
- ฟรี = ไม่ถูกคิดเงิน แต่เต็มแล้วหยุดเขียน · Pro = $25/เดือน (~900฿)
- โปรเจกต์ฟรีพักถ้าไม่ใช้เกิน 1 สัปดาห์ (ร้านใช้ทุกวันไม่พัก)

---

## 7) แผนต่อยอดในอนาคต (Roadmap)

### 🟢 ทำง่าย ได้ผลไว (Quick wins)
1. **ปุ่มลบรูปเก่า** (เข้างานเกิน X เดือน) — คืนพื้นที่ Storage ให้อยู่ฟรีนานขึ้น
2. **สรุปอัตโนมัติทุกเช้าเข้า LINE** — ยอดเมื่อวาน + ของใกล้หมด + เงินสดรอนำส่ง (ใช้ Supabase `pg_cron` + scheduled Edge Function เพราะ PWA ตั้งเวลาเองไม่ได้)
3. **Export รายงาน PDF/Excel** — ส่งบัญชี/ภาษีได้ง่าย
4. **ค้นหา/กรองในประวัติ** ทุกหน้ารายงาน (ช่วงวันที่ + คำค้น)
5. **Backup รายสัปดาห์** — Edge/Action ทำ pg_dump → เก็บใน Storage หรือ Google Drive (กันข้อมูลหายเพราะฟรีไม่มี backup)

### 🟡 ระดับกลาง (เพิ่มคุณค่าธุรกิจ)
6. **ล็อกอินเบาๆ ต่อพนักงาน (PIN)** + **audit trail** (ใครทำอะไรเมื่อไหร่) — เพิ่มความปลอดภัย/ความรับผิดชอบ
7. **รองรับหลายสาขาเต็มรูปแบบ** (branches มีโครงแล้ว) — เลือกสาขา, แดชบอร์ดเทียบสาขา
8. **ต้นทุนต่อเมนู (recipe costing)** — ผูกสูตร → สต๊อก → รู้กำไรต่อจาน/เมนูไหนทำเงิน
9. **ระบบสั่งซื้อวัตถุดิบ (PO)** ต่อจากของใกล้หมด — กดสั่งซัพพลายเออร์ + ติดตามของเข้า
10. **เป้าหมาย/KPI + แจ้งเตือน** เมื่อยอดต่ำกว่าเป้า หรือค่าใช้จ่ายเกิน %
11. **เทียบเดือน/ปี + เทรนด์** บนแดชบอร์ด

### 🔵 ของใหญ่ / ใช้ AI (Big bets)
12. **มารุพยากรณ์** — คาดการณ์ยอดขาย/ของที่ควรเตรียมรายวันจากข้อมูลย้อนหลัง (เช่น วันฝนตก/วันหยุด)
13. **มารุเชิงรุก (proactive insights)** — เด้งเตือนเอง เช่น "ค่าวัตถุดิบสัปดาห์นี้สูงผิดปกติ 18%"
14. **มารุผ่าน LINE OA** — พนักงาน/เจ้าของถามข้อมูลร้านในแชต LINE ได้เลย ไม่ต้องเปิดแอป (เชื่อม webhook → Edge → Gemini)
15. **สรุปรายเดือนอัตโนมัติ** เป็น PDF/การ์ด ส่งเจ้าของทุกสิ้นเดือน
16. **ขยายเป็น SaaS หลายร้าน (multi-tenant)** ถ้าจะให้ร้านอื่นใช้ — ต้องมี auth/แยกข้อมูลต่อร้านจริงจัง

### 🔧 โครงสร้าง/ความปลอดภัย (ควรทำคู่กัน)
17. Rotate keys + security review (RLS ครบทุกตาราง, spend cap เปิด)
18. แตก shared.js เป็นโมดูลย่อย ถ้าโค้ดโตขึ้น
19. ตั้ง monitoring การใช้งาน Supabase (เตือนก่อนเต็มโควต้า)

---

## 8) แนะนำลำดับถัดไป (ความเห็น)
1. **ทำ cut-over ให้จบ + rotate key** (ปิดความเสี่ยง) ← ก่อนอื่นเลย
2. **ปุ่มลบรูปเก่า + backup รายสัปดาห์** (ยืดอายุฟรี + กันข้อมูลหาย)
3. **สรุปเช้าอัตโนมัติเข้า LINE** (คุณค่าสูง ใช้ทุกวัน ลงทุนน้อย)
4. แล้วค่อยเลือกของระดับกลางตามที่ธุรกิจอยากโต
