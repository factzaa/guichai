// ============================================================
// Maru Waffle V2 — Edge Function "secure-api"
// จัดการ action อ่อนไหว: เงินเดือน (ต้องใส่รหัสเจ้าของ) + ข้อมูลพนักงาน
// เก็บ service_role key + OWNER_PASSCODE ไว้ฝั่ง server (ไม่หลุดมาหน้าเว็บ)
//
// Secrets ที่ต้องตั้งใน Supabase (Edge Functions → Manage secrets):
//   OWNER_PASSCODE  = รหัสเจ้าของ (เช่น 130324)
//   LINE_CHANNEL_TOKEN = Channel access token ของ LINE Messaging API
//   LINE_GROUP_ID      = group id ที่จะส่งแจ้งเตือนเข้า
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY มีให้อัตโนมัติ)
//
// ตอน Deploy: ปิด "Verify JWT" (เราเช็คสิทธิ์เองด้วย passcode)
// ============================================================

const SB_URL  = Deno.env.get("SUPABASE_URL")!;
const SB_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;   // service_role — bypass RLS
const OWNER   = Deno.env.get("OWNER_PASSCODE") || "";
const PAYROLL_START = "2026-06-01";
const STAFF_BUCKET  = "staff-docs";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_TOKEN") || "";
const LINE_GROUP = Deno.env.get("LINE_GROUP_ID") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const H = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------- helper: REST (service_role) ----------
async function sbGet(path: string) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: H });
  if (!r.ok) throw new Error("GET " + path + " → " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}
async function sbInsert(table: string, row: unknown) {
  const r = await fetch(SB_URL + "/rest/v1/" + table, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: "insert " + table + " → " + r.status + ": " + (await r.text()).slice(0, 200) };
}
async function sbPatch(table: string, query: string, row: unknown) {
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?" + query, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: "patch " + table + " → " + r.status + ": " + (await r.text()).slice(0, 200) };
}
async function sbDelete(table: string, query: string) {
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?" + query, {
    method: "DELETE",
    headers: { ...H, Prefer: "return=minimal" },
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: "delete " + table + " → " + r.status + ": " + (await r.text()).slice(0, 200) };
}

// ---------- date helpers (Asia/Bangkok = UTC+7) ----------
function bkk(d = new Date()) { return new Date(d.getTime() + 7 * 3600 * 1000); }
function ymd(d: Date) {
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function todayStr() { return ymd(bkk()); }
function fmtDM(s: string) { const p = String(s).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
function num(v: unknown) { return Number(v) || 0; }

// ---------- b64 upload to private bucket ----------
function b64ToBytes(b64: string) {
  const bin = atob(b64); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
async function uploadDoc(photo: { base64: string; mime?: string }, name: string): Promise<string> {
  if (!photo || !photo.base64) return "";
  const isPng = String(photo.mime || "").indexOf("png") >= 0;
  const path = name + "_" + Date.now() + (isPng ? ".png" : ".jpg");
  const r = await fetch(SB_URL + "/storage/v1/object/" + STAFF_BUCKET + "/" + encodeURIComponent(path), {
    method: "POST",
    headers: { ...H, "Content-Type": photo.mime || "image/jpeg" },
    body: b64ToBytes(photo.base64),
  });
  if (!r.ok) throw new Error("upload doc → " + r.status + ": " + (await r.text()).slice(0, 150));
  return path; // เก็บ "path" ไว้ (ไม่ใช่ url) แล้วค่อยเซ็น signed url ตอนอ่าน
}
async function signDoc(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl; // ของเก่า (Google Drive) คืนตามเดิม
  const r = await fetch(SB_URL + "/storage/v1/object/sign/" + STAFF_BUCKET + "/" + encodeURIComponent(pathOrUrl), {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!r.ok) return "";
  const j = await r.json();
  return j.signedURL ? (SB_URL + "/storage/v1" + j.signedURL) : "";
}

// ============================================================
//  ACTIONS
// ============================================================

// ----- เงินเดือน (ต้องใส่รหัสเจ้าของ) -----
async function getPayrollStatus() {
  const today = todayStr();
  const [staffRows, attRows, payRows] = await Promise.all([
    sbGet("staff?select=staff_id,name,nickname,branch,emp_type,active,wage_start_date"),
    sbGet("attendance?select=att_date,staff_id,branch"),
    sbGet("payments?select=staff_id,type,period,paid_up_to,pay_date"),
  ]);

  const staffMap: Record<string, any> = {}, activeStaff: any[] = [];
  for (const r of staffRows) {
    if (!r.staff_id) continue;
    const o = { id: r.staff_id, name: r.name, nickname: r.nickname, branch: r.branch,
      type: r.emp_type || "ประจำ", active: r.active !== false, countFrom: r.wage_start_date || "" };
    staffMap[r.staff_id] = o;
    if (o.active) activeStaff.push(o);
  }

  const workDates: Record<string, Record<string, string>> = {};
  const dayBranch: Record<string, { ft: Record<string, number>; pt: Record<string, number> }> = {};
  for (const r of attRows) {
    const sid = r.staff_id; if (!sid) continue;
    const st = staffMap[sid]; if (!st) continue;
    const d = String(r.att_date).slice(0, 10), br = r.branch || "";
    if (!workDates[sid]) workDates[sid] = {};
    if (!workDates[sid][d]) workDates[sid][d] = br;
    const key = d + "|" + br;
    if (!dayBranch[key]) dayBranch[key] = { ft: {}, pt: {} };
    if (st.type === "พาร์ทไทม์") dayBranch[key].pt[sid] = 1; else dayBranch[key].ft[sid] = 1;
  }

  const paidCycles: Record<string, string> = {}, lastPaidUpTo: Record<string, string> = {};
  for (const r of payRows) {
    const sid = r.staff_id, type = r.type, cyc = r.period;
    const paidUpTo = r.paid_up_to ? String(r.paid_up_to).slice(0, 10) : "";
    const payDate  = r.pay_date ? String(r.pay_date).slice(0, 10) : "";
    if (type === "พาร์ทไทม์") {
      if (paidUpTo && (!lastPaidUpTo[sid] || paidUpTo > lastPaidUpTo[sid])) lastPaidUpTo[sid] = paidUpTo;
    } else if (cyc) {
      paidCycles[sid + "|" + cyc] = payDate || today;
    }
  }

  // พาร์ทไทม์
  const partTime: any[] = [];
  activeStaff.filter((s) => s.type === "พาร์ทไทม์").forEach((s) => {
    const paidUpTo = lastPaidUpTo[s.id] || "", countFrom = s.countFrom || "";
    const days: any[] = [], wd = workDates[s.id] || {};
    Object.keys(wd).sort().forEach((d) => {
      let include;
      if (paidUpTo) include = (d > paidUpTo);
      else if (countFrom) include = (d >= countFrom);
      else include = true;
      if (d > today) include = false;
      if (!include) return;
      const br = wd[d], pres = dayBranch[d + "|" + br] || { ft: {}, pt: {} };
      const alone = Object.keys(pres.ft).length === 0 && Object.keys(pres.pt).length === 1;
      days.push({ date: d, dateDM: fmtDM(d), branch: br, alone });
    });
    partTime.push({
      id: s.id, name: s.name, nickname: s.nickname, branch: s.branch,
      countFrom, lastPaidUpTo: paidUpTo,
      daysToPay: days.length, aloneDays: days.filter((x) => x.alone).length,
      firstDay: days.length ? days[0].date : "", days,
    });
  });

  // ประจำ
  const cycles = ftCycles(2);
  const fullTime: any[] = [];
  activeStaff.filter((s) => s.type !== "พาร์ทไทม์").forEach((s) => {
    const list = cycles.map((c) => {
      const paid = Object.prototype.hasOwnProperty.call(paidCycles, s.id + "|" + c.key);
      return { key: c.key, label: c.label, periodStart: c.start, periodEnd: c.end,
        payDate: c.payDate, payDateDM: fmtDM(c.payDate),
        due: today >= c.payDate, paid, paidDate: paid ? paidCycles[s.id + "|" + c.key] : "" };
    });
    fullTime.push({ id: s.id, name: s.name, nickname: s.nickname, cycles: list });
  });

  return { partTime, fullTime, today };
}

function ftCycles(monthsBack: number) {
  const today = bkk();
  const cycles: any[] = [];
  for (let m = monthsBack; m >= 0; m--) {
    const y = today.getUTCFullYear(), moIdx = today.getUTCMonth() - m;
    const base = new Date(Date.UTC(y, moIdx, 1));
    const by = base.getUTCFullYear(), mo = base.getUTCMonth();
    const mm = String(mo + 1).padStart(2, "0");
    const lastDay = new Date(Date.UTC(by, mo + 1, 0)).getUTCDate();
    cycles.push({ key: by + "-" + mm + "-A", label: "งวด 1 (1–15) " + (mo + 1) + "/" + by,
      start: by + "-" + mm + "-01", end: by + "-" + mm + "-15", payDate: by + "-" + mm + "-16" });
    const next = new Date(Date.UTC(by, mo + 1, 1));
    const ny = next.getUTCFullYear(), nmm = String(next.getUTCMonth() + 1).padStart(2, "0");
    cycles.push({ key: by + "-" + mm + "-B", label: "งวด 2 (16–" + lastDay + ") " + (mo + 1) + "/" + by,
      start: by + "-" + mm + "-16", end: by + "-" + mm + "-" + String(lastDay).padStart(2, "0"), payDate: ny + "-" + nmm + "-01" });
  }
  return cycles.filter((c) => c.start >= PAYROLL_START);
}

async function staffName(id: string) {
  const r = await sbGet("staff?select=name,nickname&staff_id=eq." + encodeURIComponent(id) + "&limit=1");
  return r && r[0] ? { name: r[0].name, nickname: r[0].nickname } : { name: id, nickname: "" };
}

async function markPaid(data: any) {
  if (!data || !data.staffId) return { ok: false, error: "ข้อมูลไม่ครบ" };
  const today = todayStr();
  const st = await staffName(data.staffId);
  const now = new Date().toISOString();

  if (data.type === "พาร์ทไทม์") {
    const res = await sbInsert("payments", {
      staff_id: data.staffId, name: st.name, type: "พาร์ทไทม์", period: "PT-" + today,
      period_start: data.periodStart || null, period_end: today, paid_up_to: today,
      days: num(data.days), alone_days: num(data.aloneDays), pay_date: today,
      paid_by: data.by || "", note: data.note || "", created_at: now,
    });
    if (!res.ok) return res;
    return { ok: true, msg: "บันทึกจ่าย " + (st.nickname || st.name) + " แล้ว ✓ (ถึง " + fmtDM(today) + " · " + num(data.days) + " วัน)" };
  }

  if (!data.cycleKey) return { ok: false, error: "ไม่ระบุงวด" };
  const dup = await sbGet("payments?select=staff_id&staff_id=eq." + encodeURIComponent(data.staffId) + "&period=eq." + encodeURIComponent(data.cycleKey) + "&limit=1");
  if (dup && dup.length) return { ok: false, error: "งวดนี้จ่ายไปแล้ว" };
  const res = await sbInsert("payments", {
    staff_id: data.staffId, name: st.name, type: "ประจำ", period: data.cycleKey,
    period_start: data.periodStart || null, period_end: data.periodEnd || null, paid_up_to: null,
    days: 0, alone_days: 0, pay_date: today, paid_by: data.by || "", note: data.note || "", created_at: now,
  });
  if (!res.ok) return res;
  return { ok: true, msg: "บันทึกจ่าย " + (st.nickname || st.name) + " งวดนี้แล้ว ✓" };
}

// ----- พนักงาน (ไม่ต้องใส่รหัส) -----
async function getStaffDetail(staffId: string) {
  if (!staffId) return { detail: null };
  const rows = await sbGet("staff?select=*&staff_id=eq." + encodeURIComponent(staffId) + "&limit=1");
  if (!rows || !rows[0]) return { detail: null };
  const r = rows[0];
  const [idCard, doc1, doc2] = await Promise.all([signDoc(r.id_card_url || ""), signDoc(r.doc1_url || ""), signDoc(r.doc2_url || "")]);
  return { detail: {
    id: r.staff_id, name: r.name, nickname: r.nickname, position: r.position, branch: r.branch,
    active: r.active !== false, type: r.emp_type || "", startDate: r.start_date || "",
    bank: r.bank || "", accountNo: r.bank_account == null ? "" : String(r.bank_account), accountName: r.account_name || "",
    idCard, doc1, doc2,
    phone: r.phone == null ? "" : String(r.phone), lineId: r.line_id == null ? "" : String(r.line_id),
    countFrom: r.wage_start_date || "",
  } };
}

async function verifyStaffPin(staffId: string, pin: string) {
  if (!staffId || pin === undefined || pin === null || pin === "") return { ok: false, error: "ต้องระบุพนักงานและ PIN" };
  const rows = await sbGet("staff?select=staff_id,name,nickname,position,branch,pin,active,face_descriptor&staff_id=eq." + encodeURIComponent(staffId) + "&limit=1");
  if (!rows || !rows[0]) return { ok: false, error: "ไม่พบพนักงาน" };
  const r = rows[0];
  if (r.active === false) return { ok: false, error: "พนักงานคนนี้หยุดใช้งาน" };
  if (String(r.pin) === String(pin)) {
    return { ok: true, staff: { id: r.staff_id, name: r.name, nickname: r.nickname, position: r.position, branch: r.branch, hasFace: !!r.face_descriptor } };
  }
  return { ok: false, error: "PIN ไม่ถูกต้อง" };
}

async function saveAttendStaff(data: any) {
  if (!data || !data.name) return { ok: false, error: "ต้องระบุชื่อ" };
  const now = new Date().toISOString();

  // อัปโหลดเอกสาร (ถ้ามี)
  let idCardPath, doc1Path, doc2Path;
  try {
    if (data.idCardPhoto && data.idCardPhoto.base64) idCardPath = await uploadDoc(data.idCardPhoto, (data.id || "new") + "_idcard");
    if (data.doc1Photo && data.doc1Photo.base64)     doc1Path   = await uploadDoc(data.doc1Photo,   (data.id || "new") + "_doc1");
    if (data.doc2Photo && data.doc2Photo.base64)     doc2Path   = await uploadDoc(data.doc2Photo,   (data.id || "new") + "_doc2");
  } catch (e) { return { ok: false, error: String((e as Error).message || e) }; }

  if (data.id) {
    const row: Record<string, unknown> = { edited_at: now };
    if (data.name !== undefined) row.name = data.name;
    if (data.nickname !== undefined) row.nickname = data.nickname;
    if (data.position !== undefined) row.position = data.position;
    if (data.pin !== undefined && data.pin !== "") row.pin = String(data.pin);
    if (data.branch !== undefined) row.branch = data.branch;
    if (data.active !== undefined) row.active = !!data.active;
    if (data.type !== undefined) row.emp_type = data.type;
    if (data.startDate !== undefined) row.start_date = data.startDate || null;
    if (data.bank !== undefined) row.bank = data.bank;
    if (data.accountNo !== undefined) row.bank_account = String(data.accountNo);
    if (data.accountName !== undefined) row.account_name = data.accountName;
    if (data.phone !== undefined) row.phone = String(data.phone);
    if (data.lineId !== undefined) row.line_id = String(data.lineId);
    if (data.countFrom !== undefined) row.wage_start_date = data.countFrom || null;
    if (idCardPath) row.id_card_url = idCardPath;
    if (doc1Path) row.doc1_url = doc1Path;
    if (doc2Path) row.doc2_url = doc2Path;
    const res = await sbPatch("staff", "staff_id=eq." + encodeURIComponent(data.id), row);
    if (!res.ok) return res;
    return { ok: true, msg: "แก้ไขพนักงานแล้ว ✓" };
  }

  // เพิ่มใหม่
  if (!data.pin) return { ok: false, error: "ต้องระบุ PIN" };
  const ids = await sbGet("staff?select=staff_id");
  let maxN = 0;
  for (const r of ids) { const m = String(r.staff_id).match(/E(\d+)/); if (m) maxN = Math.max(maxN, parseInt(m[1])); }
  const id = "E" + String(maxN + 1).padStart(3, "0");
  const res = await sbInsert("staff", {
    staff_id: id, name: data.name, nickname: data.nickname || "", position: data.position || "",
    pin: String(data.pin), branch: data.branch || "B001", active: true, edited_at: now,
    emp_type: data.type || "ประจำ", start_date: data.startDate || null,
    bank: data.bank || "", bank_account: String(data.accountNo || ""), account_name: data.accountName || "",
    id_card_url: idCardPath || "", doc1_url: doc1Path || "", doc2_url: doc2Path || "",
    phone: String(data.phone || ""), line_id: String(data.lineId || ""), wage_start_date: data.countFrom || null,
  });
  if (!res.ok) return res;
  return { ok: true, msg: "เพิ่มพนักงาน " + id + " (" + data.name + ") ✓", id };
}

// ============================================================
// ===== ผู้ช่วยมารุ (askAI) — Gemini key อยู่ฝั่ง server, context ลับดึงจาก Supabase =====
const SECRET_RE = /เงินเดือน|ค่าจ้าง|ค่าแรง|จ่ายพนักงาน|salary|wage|ได้เงินเท่า|เลขบัญชี|เลขที่บัญชี|บัญชีธนาคาร|เบอร์โทร|เบอร์ติดต่อ|ขอเบอร์|เบอร์ของ|line id|สำเนาบัตร|เอกสารพนักงาน/i;
const THINK_RE  = /วิเคราะห์|พยากรณ์|ประเมิน|คาดการณ์|แนวโน้ม|ควรสั่ง|สั่งเท่าไหร่|สั่งเท่าไร|คำนวณ|เปรียบเทียบ|สรุป|วางแผน|แนะนำ|อินเซนทีฟ|เป้า|ต้องทำ|ขาดอีก|กี่บาท|ถึงเกณฑ์|บริหาร|งบการตลาด|การตลาด|งบโฆษณา|งบโปรโม/i;
const PAYROLL_RE = /รอบจ่าย|ค้างจ่าย|จ่ายแล้ว|ยังไม่จ่าย|จ่ายเงิน|ค้างเงิน|จ่ายรอบ|งวดจ่าย|ถึงกำหนด|กำหนดจ่าย|วันจ่าย|จ่ายเมื่อ|งวด|เงินเดือน|ค่าจ้าง|ค่าแรง/i;
const STAFF_RE   = /พนักงาน|รายชื่อ|กี่คน|ลาออก|เริ่มงาน|อายุงาน|ตำแหน่ง|สาขา|เบอร์|บัญชี|ติดต่อ|ลูกทีม|ทีมงาน/i;
const WAGE_RE    = /เงินเดือน|ค่าจ้าง|ค่าแรง|จ่ายพนักงาน|salary|wage|ได้เงินเท่า/i;

async function buildSensitiveContext(message: string): Promise<string> {
  const m = String(message); const out: string[] = [];
  if (PAYROLL_RE.test(m)) {
    try {
      const pr = await getPayrollStatus();
      const ptOwe = pr.partTime.filter((s: any) => s.daysToPay > 0).map((s: any) => (s.nickname || s.name) + " ค้าง " + s.daysToPay + " วัน" + (s.aloneDays > 0 ? (" (มาคนเดียว " + s.aloneDays + ")") : ""));
      out.push("พาร์ทไทม์ค้างจ่าย: " + (ptOwe.length ? ptOwe.join(", ") : "ไม่มี"));
      const ftDue: string[] = [];
      pr.fullTime.forEach((s: any) => { (s.cycles || []).forEach((c: any) => { if (c.due && !c.paid) ftDue.push((s.nickname || s.name) + " " + c.label); }); });
      out.push("ประจำถึงกำหนดยังไม่จ่าย: " + (ftDue.length ? ftDue.join(", ") : "ไม่มี"));
    } catch (_e) { /* ignore */ }
  }
  if (STAFF_RE.test(m) || WAGE_RE.test(m)) {
    try {
      const wantWage = WAGE_RE.test(m);
      const cols = wantWage
        ? "staff_id,name,nickname,position,branch,emp_type,active,wage,wage_unit,bank,bank_account,account_name,phone"
        : "staff_id,name,nickname,position,branch,emp_type,active";
      const rows = await sbGet("staff?select=" + cols);
      const lines = rows.filter((r: any) => r.active !== false).map((r: any) => {
        let line = (r.nickname || r.name) + " (" + r.name + ") " + (r.position || "") + " ·" + (r.emp_type || "") + " สาขา" + (r.branch || "");
        if (wantWage) line += " · ค่าจ้าง " + (r.wage || "-") + "/" + (r.wage_unit || "") + " · " + (r.bank || "") + " " + (r.bank_account || "") + " " + (r.account_name || "") + (r.phone ? (" โทร " + r.phone) : "");
        return line;
      });
      out.push("พนักงาน (" + lines.length + " คน): " + lines.join(" | "));
    } catch (_e) { /* ignore */ }
  }
  return out.length ? ("ข้อมูลลับ (เจ้าของปลดล็อกแล้ว):\n- " + out.join("\n- ")) : "";
}

// ===== whitelist ตาราง/คอลัมน์ สำหรับเครื่องมือดึงข้อมูลของมารุ =====
const TABLE_WL: Record<string, { date?: string; sensitive?: boolean; cols: string[] }> = {
  sales:          { date: "sale_date",  cols: ["sale_date","total","cash","transfer","thaihelp","lineman","grab","shopee","robinhood","cash_open","cash_in","refund","cash_expected","cash_actual","cash_diff","closed_by","note"] },
  expenses:       { date: "exp_date",   cols: ["exp_date","item","amount","type","receipt_url","created_at"] },
  stock_withdraw: { date: "move_date",  cols: ["move_date","move_time","branch","recorded_by","item_id","item_name","qty","note","created_at"] },
  stock_receive:  { date: "move_date",  cols: ["move_date","branch","recorded_by","item_id","item_name","qty","receipt_url","note","created_at"] },
  stock_daily:    { date: "move_date",  cols: ["move_date","branch","closed_by","item_id","item_name","open_qty","receive_total","withdraw_total","waste","balance","used","diff","mode","note","created_at"] },
  stock_audit:    { date: "audit_date", cols: ["audit_date","branch","auditor","item_id","item_name","system_qty","actual_qty","diff","reason","adjusted","created_at"] },
  stock_items:    { cols: ["item_id","name","category","unit","min_stock","mode","active"] },
  attendance:     { date: "att_date",   cols: ["att_date","att_time","type","staff_id","name","branch","in_geofence","distance","address","photo_url","note"] },
  branches:       { cols: ["branch_id","name","address","lat","lng","radius"] },
  staff_safe:     { cols: ["staff_id","name","nickname","position","branch","active","emp_type","start_date","has_face"] },
  payments:       { date: "pay_date", sensitive: true, cols: ["staff_id","name","type","period","period_start","period_end","paid_up_to","days","alone_days","pay_date","paid_by","note"] },
  staff:          { sensitive: true, cols: ["staff_id","name","nickname","position","branch","emp_type","active","start_date","bank","bank_account","account_name","wage","wage_unit","phone","line_id","wage_start_date"] },
};

// แปลงปีพ.ศ.->ค.ศ. อัตโนมัติ ถ้าโมเดลเผลอส่งวันที่เป็นพ.ศ. (เช่น 2569-06-17) จะกรองข้อมูลออกหมด
function maruNormDate(d: any){
  if (d === undefined || d === null || d === "") return d;
  const s = String(d).trim();
  const m = s.match(/^(\d{4})(-\d{2}-\d{2})$/);
  if (m) { const y = parseInt(m[1], 10); if (y >= 2500) return String(y - 543) + m[2]; }
  return s;
}

async function queryShopData(args: any, unlocked: boolean) {
  const table = String(args.table || "");
  const wl = TABLE_WL[table];
  if (!wl) return { error: "ตารางไม่อยู่ในรายการที่อนุญาต: " + table };
  if (wl.sensitive && !unlocked) return { error: "ตาราง " + table + " เป็นข้อมูลลับ ต้องใส่รหัสเจ้าของก่อนถึงจะดูได้" };
  let cols = (Array.isArray(args.columns) && args.columns.length) ? args.columns.filter((c: string) => wl.cols.indexOf(c) >= 0) : wl.cols.slice();
  if (!cols.length) cols = wl.cols.slice();
  if (wl.date && cols.indexOf(wl.date) < 0) cols.unshift(wl.date);   // แนบคอลัมน์วันที่เสมอ เพื่อให้ตอบรายวันได้
  const qp: string[] = ["select=" + cols.join(",")];
  const _dFrom = maruNormDate(args.dateFrom), _dTo = maruNormDate(args.dateTo);
  if (wl.date && _dFrom) qp.push(wl.date + "=gte." + encodeURIComponent(String(_dFrom)));
  if (wl.date && _dTo)   qp.push(wl.date + "=lte." + encodeURIComponent(String(_dTo)));
  if (args.eqColumn && wl.cols.indexOf(args.eqColumn) >= 0 && args.eqValue !== undefined)
    qp.push(args.eqColumn + "=eq." + encodeURIComponent(String(args.eqValue)));
  if (args.searchColumn && wl.cols.indexOf(args.searchColumn) >= 0 && args.searchValue)
    qp.push(args.searchColumn + "=ilike.*" + encodeURIComponent(String(args.searchValue)) + "*");
  if (args.orderColumn && wl.cols.indexOf(args.orderColumn) >= 0)
    qp.push("order=" + args.orderColumn + "." + (args.orderDir === "asc" ? "asc" : "desc"));
  else if (wl.date) qp.push("order=" + wl.date + ".desc");
  const limit = Math.min(Math.max(parseInt(args.limit) || 50, 1), 200);
  qp.push("limit=" + limit);
  try {
    const rows = await sbGet(table + "?" + qp.join("&"));
    return { rowCount: rows.length, rows };
  } catch (e) { return { error: "ดึงข้อมูลไม่สำเร็จ: " + String((e as Error).message || e) }; }
}

async function maruResolveItem(q: string) {
  const query = String(q || "").trim();
  if (!query) return { found: false, candidates: [] as any[] };
  async function search(term: string) {
    return await sbGet("stock_items?select=item_id,name,unit,category&active=eq.true&name=ilike.*" + encodeURIComponent(term) + "*&limit=12");
  }
  try {
    let rows = await search(query);
    if ((!rows || !rows.length) && query.replace(/\s+/g, "").length > 3) rows = await search(query.replace(/\s+/g, "").slice(0, 4));
    if (!rows || !rows.length) return { found: false, candidates: [] as any[] };
    if (rows.length === 1) return { found: true, item: rows[0] };
    return { found: false, candidates: rows };
  } catch (e) { return { found: false, candidates: [] as any[], error: String((e as Error).message || e) }; }
}

async function recomputeCloseRow(itemId: string, date: string) {
  const closes = await sbGet("stock_daily?select=id,open_qty,waste,balance&item_id=eq." + encodeURIComponent(itemId) + "&move_date=eq." + date + "&limit=1");
  if (!closes.length) return; // วันนั้นยังไม่ปิดรอบ → ไม่ต้องคำนวณ
  const c = closes[0];
  const recs = await sbGet("stock_receive?select=qty&item_id=eq." + encodeURIComponent(itemId) + "&move_date=eq." + date);
  const wds  = await sbGet("stock_withdraw?select=id,qty,note&item_id=eq." + encodeURIComponent(itemId) + "&move_date=eq." + date);
  const recv = (recs as any[]).reduce((a, r) => a + num(r.qty), 0);
  let auto: any = null, nonAuto = 0;
  for (const w of (wds as any[])) {
    if (String(w.note || "").indexOf("เบิกอัตโนมัติจากการนับปิดรอบ") === 0) auto = w;
    else nonAuto += num(w.qty);
  }
  const open = num(c.open_qty), waste = num(c.waste), balance = num(c.balance);
  const used = Math.round((open + recv - balance - waste) * 100) / 100; // ใช้จริงโดยนัย (เพื่อให้ถึงยอดนับจริง)
  let totalWd = nonAuto;
  if (auto) {
    const newAuto = Math.max(0, Math.round((used - nonAuto) * 100) / 100);
    await sbPatch("stock_withdraw", "id=eq." + auto.id, { qty: newAuto });
    totalWd = Math.round((nonAuto + newAuto) * 100) / 100;
  }
  const diff = Math.round((used - totalWd) * 100) / 100;
  await sbPatch("stock_daily", "id=eq." + c.id, { receive_total: recv, withdraw_total: totalWd, used: used, diff: diff });
}

async function editStockMovement(body: any) {
  const kind = body.kind === "receive" ? "receive" : "withdraw";
  const table = kind === "receive" ? "stock_receive" : "stock_withdraw";
  const op = body.op === "delete" ? "delete" : "edit";
  const id = body.id;
  if (id === undefined || id === null || id === "") return { ok: false, error: "ไม่มี id รายการ" };
  const ownerOk = !!(OWNER && String(body.ownerCode || "") === String(OWNER));
  const rows = await sbGet(table + "?select=id,item_id,item_name,qty,move_date&id=eq." + encodeURIComponent(String(id)) + "&limit=1");
  if (!(rows as any[]).length) return { ok: false, error: "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)" };
  const row = (rows as any[])[0];
  const itemId = row.item_id, date = row.move_date;
  const closes = await sbGet("stock_daily?select=id&item_id=eq." + encodeURIComponent(itemId) + "&move_date=eq." + date + "&limit=1");
  const isClosed = (closes as any[]).length > 0;
  const isToday = date === todayStr();
  // สิทธิ์: วันนี้และยังไม่ปิดรอบ = พนักงานทำได้ · อื่นๆ ต้องรหัสเจ้าของ
  if (!(isToday && !isClosed) && !ownerOk) {
    return { ok: false, needOwner: true, error: "รายการนี้เป็นของวันที่ปิดรอบ/วันก่อนหน้า ต้องใส่รหัสเจ้าของเพื่อแก้ไข" };
  }
  if (op === "delete") {
    const d = await sbDelete(table, "id=eq." + encodeURIComponent(String(id)));
    if (!(d as any).ok) return d;
  } else {
    const qty = Number(body.qty);
    if (!(qty >= 0)) return { ok: false, error: "จำนวนไม่ถูกต้อง" };
    const p = await sbPatch(table, "id=eq." + encodeURIComponent(String(id)), { qty: qty });
    if (!(p as any).ok) return p;
  }
  if (isClosed) { try { await recomputeCloseRow(itemId, date); } catch (_e) { /* ignore */ } }
  return { ok: true, msg: (op === "delete" ? "ลบ" : "แก้ไข") + "รายการ" + (kind === "receive" ? "รับเข้า" : "เบิก") + " " + (row.item_name || "") + " แล้ว ✓" + (isClosed ? " (ปรับยอดปิดรอบให้แล้ว)" : "") };
}

async function execStockWrite(body: any) {
  const kind = body.kind === "receive" ? "receive" : "withdraw";
  const itemId = String(body.itemId || "").trim();
  const qty = Number(body.qty) || 0;
  const recordedBy = String(body.recordedBy || "").trim();
  const note = String(body.note || "").trim();
  if (!itemId || qty <= 0) return { ok: false, error: "ข้อมูลไม่ครบ (สินค้า/จำนวน)" };
  if (!recordedBy) return { ok: false, error: "กรุณาระบุชื่อผู้ทำรายการ" };
  let it: any[];
  try { it = await sbGet("stock_items?select=item_id,name,unit&item_id=eq." + encodeURIComponent(itemId) + "&limit=1"); }
  catch (_e) { return { ok: false, error: "อ่านข้อมูลสินค้าไม่สำเร็จ" }; }
  if (!it.length) return { ok: false, error: "ไม่พบสินค้า" };
  const name = it[0].name, unit = it[0].unit || "";
  const today = todayStr();
  const now = new Date().toISOString();
  const noteFinal = note || "บันทึกผ่านผู้ช่วยมารุ";
  let table: string, row: Record<string, unknown>;
  if (kind === "withdraw") {
    const tm = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
    table = "stock_withdraw";
    row = { move_date: today, move_time: tm, branch: "Pantip Ngamwongwan", recorded_by: recordedBy, item_id: itemId, item_name: name, qty: qty, note: noteFinal, created_at: now };
  } else {
    table = "stock_receive";
    row = { move_date: today, branch: "Pantip Ngamwongwan", recorded_by: recordedBy, item_id: itemId, item_name: name, qty: qty, receipt_url: null, note: noteFinal, created_at: now };
  }
  const r = await sbInsert(table, row);
  if (!(r as any).ok) return r;
  return { ok: true, msg: (kind === "receive" ? "รับเข้า" : "เบิก") + " " + name + " " + qty + " " + unit + " แล้ว ✓ (โดย " + recordedBy + ")" };
}

async function getItemMovements(args: any) {
  const res = await maruResolveItem(String(args.item || ""));
  if (!res.found) {
    if (res.candidates && res.candidates.length) return { ambiguous: true, candidates: res.candidates.map((c: any) => ({ item_id: c.item_id, name: c.name, unit: c.unit })), instruction: "พบหลายรายการใกล้เคียง ให้ผู้ใช้เลือกว่าหมายถึงตัวไหนก่อน" };
    return { found: false, instruction: "ไม่พบสินค้านี้ในระบบ ให้ถามผู้ใช้ระบุชื่อให้ชัดขึ้น" };
  }
  const it = res.item, id = it.item_id;
  const dFrom = maruNormDate(args.dateFrom), dTo = maruNormDate(args.dateTo);
  const range = (col: string) => { let c = ""; if (dFrom) c += "&" + col + "=gte." + encodeURIComponent(String(dFrom)); if (dTo) c += "&" + col + "=lte." + encodeURIComponent(String(dTo)); return c; };
  const rc = await sbGet("stock_receive?select=move_date,qty,recorded_by&item_id=eq." + encodeURIComponent(id) + range("move_date") + "&order=move_date.asc&limit=300");
  const wd = await sbGet("stock_withdraw?select=move_date,move_time,qty,recorded_by&item_id=eq." + encodeURIComponent(id) + range("move_date") + "&order=move_date.asc&limit=300");
  const sum = (a: any[]) => Math.round(a.reduce((s, r) => s + (Number(r.qty) || 0), 0) * 100) / 100;
  const allDates = [...rc.map((r: any) => r.move_date), ...wd.map((r: any) => r.move_date)].sort();
  return {
    item: { item_id: id, name: it.name, unit: it.unit || "" },
    receive: { count: rc.length, totalQty: sum(rc), rows: rc.map((r: any) => ({ date: r.move_date, qty: r.qty, by: r.recorded_by })) },
    withdraw: { count: wd.length, totalQty: sum(wd), rows: wd.map((r: any) => ({ date: r.move_date, time: r.move_time, qty: r.qty, by: r.recorded_by })) },
    firstDate: allDates[0] || null,
    lastDate: allDates.length ? allDates[allDates.length - 1] : null,
    instruction: "นำข้อมูลนี้มาวิเคราะห์: ความถี่ (กี่ครั้ง/เว้นกี่วัน), ยอดรวมรับเข้า vs เบิกออก, ความสอดคล้อง (รับเข้ามากกว่า/น้อยกว่าเบิก), และคงเหลือโดยนัย ตอบเป็นข้อความอ่านลื่น ไม่ใช้ Markdown"
  };
}

const MARU_TOOLS = [{
  functionDeclarations: [{
    name: "query_shop_data",
    description: "ดึงข้อมูลแถวจริงจากฐานข้อมูลร้าน Maru Waffle เพื่อตอบคำถามรายละเอียด เช่น รายการเบิก/รับเข้าล่าสุดของสินค้า, ยอดขายแยกช่องทาง (grab/lineman/cash...) รายวัน, ค่าใช้จ่ายแต่ละรายการ, การเข้างาน ฯลฯ ใช้เมื่อบริบทที่ให้มายังไม่มีตัวเลข/แถวที่ถาม แล้วรวม/นับ/หาค่าจากแถวที่ได้เอง ห้ามเดาตัวเลข",
    parameters: {
      type: "OBJECT",
      properties: {
        table: { type: "STRING", enum: Object.keys(TABLE_WL), description: "ตารางที่จะดึง" },
        columns: { type: "ARRAY", items: { type: "STRING" }, description: "คอลัมน์ที่ต้องการ (เว้นว่าง = ทั้งหมดของตารางนั้น)" },
        dateFrom: { type: "STRING", description: "วันเริ่ม YYYY-MM-DD (กรองตามคอลัมน์วันที่ของตาราง)" },
        dateTo: { type: "STRING", description: "วันสิ้นสุด YYYY-MM-DD" },
        eqColumn: { type: "STRING", description: "คอลัมน์สำหรับกรองแบบเท่ากับ เช่น type หรือ item_id" },
        eqValue: { type: "STRING", description: "ค่าที่ต้องการให้เท่ากับ" },
        searchColumn: { type: "STRING", description: "คอลัมน์ข้อความสำหรับค้นหาบางส่วน เช่น item_name" },
        searchValue: { type: "STRING", description: "คำค้นบางส่วน เช่น อัลมอนด์" },
        orderColumn: { type: "STRING", description: "คอลัมน์เรียงลำดับ (เช่น created_at เพื่อหาล่าสุด)" },
        orderDir: { type: "STRING", enum: ["asc", "desc"] },
        limit: { type: "INTEGER", description: "จำนวนแถวสูงสุด (<=200, ค่าเริ่ม 50)" },
      },
      required: ["table"],
    },
  }, {
    name: "propose_stock_action",
    description: "เสนอการบันทึกเบิกของหรือรับเข้าสินค้า (ยังไม่บันทึกจริง ระบบจะให้ผู้ใช้กดปุ่มยืนยันเอง) ใช้เมื่อผู้ใช้สั่งให้เบิกหรือรับเข้า เช่น เบิกแป้ง 5 ถุง / รับช็อกเข้า 3 ถุง",
    parameters: {
      type: "OBJECT",
      properties: {
        kind: { type: "STRING", enum: ["withdraw", "receive"], description: "withdraw=เบิกออก, receive=รับเข้า" },
        item: { type: "STRING", description: "ชื่อสินค้าตามที่ผู้ใช้พูด (ระบบจะหาตัวจริงเอง)" },
        qty: { type: "NUMBER", description: "จำนวน" },
        recordedBy: { type: "STRING", description: "ชื่อผู้ทำรายการ ถ้าผู้ใช้บอก" },
        note: { type: "STRING", description: "หมายเหตุ ถ้ามี" },
      },
      required: ["kind", "item", "qty"],
    },
  }, {
    name: "get_item_movements",
    description: "ดึงประวัติรับเข้า+เบิกออกทั้งหมดของสินค้า 1 รายการ (ค้นด้วยชื่อได้ ระบบหา item_id ให้เอง) พร้อมจำนวนครั้ง ยอดรวม และวันที่ ใช้เมื่อผู้ใช้ถามประวัติความเคลื่อนไหว/ความถี่/ความสอดคล้องของสินค้าตัวใดตัวหนึ่ง เครื่องมือนี้ดึงครบให้เอง ไม่ต้องใส่ช่วงวันที่ก็ได้",
    parameters: {
      type: "OBJECT",
      properties: {
        item: { type: "STRING", description: "ชื่อสินค้าที่ผู้ใช้พูด (ระบบจะหาตัวจริงเอง)" },
        dateFrom: { type: "STRING", description: "(ไม่บังคับ) วันเริ่ม YYYY-MM-DD ค.ศ." },
        dateTo: { type: "STRING", description: "(ไม่บังคับ) วันสิ้นสุด YYYY-MM-DD ค.ศ." },
      },
      required: ["item"],
    },
  }],
}];

async function askAI(body: any) {
  if (!GEMINI_KEY) return { ok: false, error: "ยังไม่ได้ตั้ง GEMINI_API_KEY ใน Edge Function" };
  const message = String(body.message || ""); if (!message) return { ok: false, error: "ไม่มีข้อความ" };
  const history = body.history || [];
  const unlocked = !!(OWNER && String(body.ownerCode || "") === String(OWNER));
  if (SECRET_RE.test(message) && !unlocked) {
    return { ok: true, needOwner: true, reply: "ข้อมูลค่าจ้าง/เงินเดือน และข้อมูลส่วนตัวพนักงาน (เบอร์โทร เลขบัญชี เอกสาร) เป็นความลับ ใส่รหัสเจ้าของก่อนนะครับ 🔒" };
  }
  let ctx = String(body.context || "");
  if (unlocked) { try { const sc = await buildSensitiveContext(message); if (sc) ctx = (ctx ? ctx + "\n" : "") + sc; } catch (_e) { /* ignore */ } }
  const today = todayStr();
  const system = [
    'คุณคือ "ผู้ช่วยมารุ" ผู้ช่วย AI ประจำร้าน Maru Waffle (ร้านวาฟเฟิลในไทย ย่านปั่นทิพย์ งามวงศ์วาน)',
    "คุณเป็นผู้ช่วยทั้งพนักงานและผู้จัดการ/เจ้าของ ช่วยดูข้อมูลร้าน วิเคราะห์เชิงบริหาร ให้คำแนะนำเชิงรุก และคุยเป็นกันเองได้",
    "พูดภาษาไทยเป็นหลัก น้ำเสียงเป็นกันเอง อบอุ่น สุภาพ เหมาะกับที่ทำงาน",
    "ตอบกระชับ ตรงประเด็น เวลาให้ตัวเลข/วิเคราะห์ให้สรุปสั้นๆ ที่นำไปใช้ได้จริง",
    "ตอบเป็นข้อความธรรมดาที่อ่านออกเสียงลื่น ห้ามใช้สัญลักษณ์ Markdown เช่น * ** _ # - หรือ bullet เพราะคำตอบจะถูกอ่านออกเสียง ถ้าจะแจกแจงให้ใช้ประโยคต่อเนื่องหรือขึ้นบรรทัดใหม่แทน",
    "คนที่คุยด้วยคือพนักงานหรือผู้จัดการ ไม่ใช่ลูกค้า — ห้ามเรียกว่าลูกค้าเด็ดขาด",
    "วันนี้คือ " + today + " (ค.ศ.) ซึ่งตรงกับ พ.ศ. " + (parseInt(today.slice(0,4))+543) + " เขตเวลาไทย ใช้คำนวณช่วงวันที่ เช่น เดือนนี้ = ตั้งแต่วันที่ 1 ของเดือนถึงวันนี้, เมื่อวาน, 7 วันล่าสุด ฯลฯ",
    "สำคัญเรื่องปี: ผู้ใช้มักพูดเป็น พ.ศ. ต้องแปลงเป็น ค.ศ. โดยลบ 543 ก่อนเสมอ (พ.ศ.2569 = ค.ศ.2026). ปีย่อ 2 หลัก เช่น 69 = พ.ศ.2569 = ค.ศ.2026, 68 = ค.ศ.2025. วันที่ที่ส่งให้ query_shop_data ต้องเป็น ค.ศ. รูปแบบ YYYY-MM-DD เท่านั้น เช่น 17/6/69 = 2026-06-17",
    "ถ้าผลลัพธ์ว่างหรือยังไม่พอ ให้เรียก query_shop_data ซ้ำทันทีด้วยพารามิเตอร์ที่แก้แล้ว (โดยเฉพาะตรวจการแปลงปี พ.ศ./ค.ศ. และชื่อคอลัมน์) ห้ามตอบว่า \"เดี๋ยวดึงใหม่\" แล้วจบโดยไม่เรียกจริง ถ้าดึงแล้วไม่มีข้อมูลจริงให้บอกตรงๆ ว่าวันนั้นไม่มีรายการ",
    'สำคัญ: ถ้าผู้ใช้ถามรายละเอียด/ตัวเลขเฉพาะที่ยังไม่มีในบริบท (เช่น "เบิกล่าสุดสินค้า A เมื่อไหร่ กี่โมง", "ยอด Grab เดือนนี้รวมเท่าไหร่ วันไหนบ้าง") ให้เรียกเครื่องมือ query_shop_data เพื่อดึงแถวจริงก่อนตอบ แล้วรวม/นับ/หาค่าจากแถวเอง ห้ามเดาตัวเลข',
    "เวลาในตาราง: stock_withdraw มีคอลัมน์ move_time (เวลาเบิก), attendance มี att_time, ส่วนตารางอื่นใช้ created_at เป็นเวลาบันทึก ยอดขายแยกช่องทางอยู่ในตาราง sales คอลัมน์ cash/transfer/thaihelp/lineman/grab/shopee/robinhood",
    "ถ้าคำถามเกี่ยวกับ \"วันไหน/รายวัน/แต่ละวัน\" ให้ดึงคอลัมน์วันที่ (เช่น sale_date) มาด้วยเสมอ แล้วไล่ลิสต์เฉพาะวันที่มียอด (>0) พร้อมตัวเลขของแต่ละวัน อย่าตอบว่าข้อมูลไม่ครบถ้าดึงข้อมูลมาได้แล้ว",
    "เวลา: move_time (เบิก) และ att_time (เข้างาน) เป็นเวลาไทยอยู่แล้ว ส่วน created_at เป็นเวลาสากล UTC ถ้าจะบอกเป็นเวลาไทยให้บวก 7 ชั่วโมง",
    "ใครเป็นคนทำ: เบิก/รับเข้า=recorded_by, ปิดยอดขายสิ้นวัน/ปิดรอบสต๊อก=closed_by, ออดิท=auditor, จ่ายเงิน=paid_by, เข้างาน=name",
    "ใบเสร็จ/รูป: ค่าใช้จ่ายและรับเข้ามีคอลัมน์ receipt_url, เข้างานมี photo_url ถ้าผู้ใช้ขอดูใบเสร็จ/รูป ให้ดึงคอลัมน์นั้นมาแล้วส่งลิงก์ให้ ถ้าค่าว่างให้บอกว่าไม่ได้แนบไว้",
    "ค้นหาสินค้าด้วยชื่อที่ไม่ตรง (สำคัญมาก): ถ้าผู้ใช้พูดชื่อสินค้าไม่ชัด/สะกดไม่ตรง/ใช้คำเล่น อย่าเดาและอย่าค้นตารางเคลื่อนไหวด้วยคำนั้นตรงๆ ให้เรียก query_shop_data ตาราง stock_items ด้วย searchColumn=name, searchValue=คำที่เป็นแก่นของชื่อแบบสั้นๆ (เช่น 'อัลมอนด์' แทน 'ผงอัลมอนด์อบ') เพื่อหาชื่อจริงและ item_id ก่อน แล้วค่อยดึง stock_receive/stock_withdraw/stock_daily/stock_audit ด้วย eqColumn=item_id ของรายการที่ตรงที่สุด",
    "ประวัติความเคลื่อนไหวของสินค้า: ถ้าผู้ใช้ถามว่าสินค้าตัวหนึ่งมีรับเข้า/เบิกออกเท่าไหร่ ความถี่ ความสอดคล้อง ให้เรียกเครื่องมือ get_item_movements ด้วยชื่อสินค้าโดยตรง (ไม่ต้องใส่ช่วงวันที่ เว้นแต่ผู้ใช้ระบุช่วงเอง) เครื่องมือนี้ดึงประวัติครบให้เอง ห้ามสรุปว่าไม่มีข้อมูลถ้ายังไม่ได้เรียกเครื่องมือนี้",
    "ถ้าค้นแล้วได้ผลว่าง ให้ลองคำที่สั้นลงหรือบางส่วนของชื่ออีกครั้ง (ตัดคำขยายออก) อย่าเพิ่งสรุปว่าไม่มี จนกว่าจะลองค้นด้วยคำที่ต่างกันอย่างน้อย 2 แบบแล้ว ถ้าไม่แน่ใจว่ามีสินค้าอะไรบ้าง ให้ดึง stock_items มาดูรายการทั้งหมดก่อนได้",
    "แม็พคำที่ผู้ใช้อาจใช้ไม่ตรงกับตาราง: รับเข้า/ของเข้า/รับของ/ซื้อของเข้าสต๊อก = stock_receive (วันที่รับเข้า=move_date) · เบิก/หยิบใช้/ตัดออก = stock_withdraw · ซื้อวัตถุดิบ/จ่ายค่าของ/ค่าใช้จ่าย/บิล = expenses · ปิดรอบ/คงเหลือสิ้นวัน/ของเสีย = stock_daily · ตรวจนับ/ออดิท/ส่วนต่าง = stock_audit · รายการสินค้า/ขั้นต่ำ/หมวด/หน่วย = stock_items",
    "ค่าใช้จ่าย (expenses) ชื่อรายการเป็นข้อความอิสระที่พนักงานพิมพ์เอง อาจรวมหลายอย่างในแถวเดียว สะกดต่าง หรือพิมพ์ผิด — อย่าพึ่งการค้นคำเดียวด้วย ilike อย่างเดียว ให้ดึงรายการ expenses ในช่วงที่เกี่ยวข้องมาหลายแถว (เช่น 30-60 วันล่าสุด หรือทั้งหมดถ้าไม่มาก) แล้วอ่านข้อความในคอลัมน์ item เองด้วยความเข้าใจภาษา จับคู่รายการที่หมายถึงสิ่งที่ผู้ใช้ถามแม้จะสะกดต่างหรือรวมกับของอื่น (เช่น ผู้ใช้ถาม 'ดาร์กช็อก' ให้ถือว่าตรงกับ 'ดาร์คช็อค', 'ดาร์กช็อกชิพ หมูหยอง', 'choc' ด้วย) ถ้าค้นด้วยคำเดียวไม่เจอให้ลองหลายคำหรือดึงช่วงกว้างขึ้นมาอ่านเอง แล้วสรุปวันล่าสุด/ยอดรวมให้",
    "ถ้าผู้ใช้อยากตรวจสอบสินค้าตัวหนึ่งแบบละเอียด (เช่น 'ตรวจสอบ X ทั้งหมด') ให้ดึงหลายตารางต่อเนื่องของสินค้านั้น เช่น รับเข้าล่าสุด (stock_receive) + เบิกล่าสุด (stock_withdraw) + คงเหลือ/ปิดรอบ (stock_daily) แล้วสรุปรวมเป็นภาพเดียว พร้อมวันที่/เวลา/ใครเป็นคนทำ",
    "สั่งให้บันทึก: ถ้าผู้ใช้สั่งให้เบิกของหรือรับเข้าสินค้า (เช่น 'เบิกแป้ง 5 ถุง', 'รับช็อกเข้า 3 ถุง') ให้เรียกเครื่องมือ propose_stock_action (kind=withdraw สำหรับเบิก, receive สำหรับรับเข้า) ห้ามบันทึกเองและห้ามบอกว่าบันทึกเรียบร้อย เพราะระบบจะแสดงปุ่มยืนยันให้ผู้ใช้กดเอง ถ้าพบหลายรายการให้ถามผู้ใช้ก่อนว่าตัวไหน ถ้าไม่พบให้บอกตรงๆ ฟังก์ชันบันทึกอื่น (เข้างาน เงินเดือน ปิดรอบ) ยังต้องทำในฟอร์มของแอป",
    "ห้ามให้ข้อมูลหรือเนื้อหาที่ไม่เหมาะสมกับที่ทำงาน",
  ];
  if (!unlocked) system.push("ห้ามเปิดเผยหรือคาดเดาตัวเลขค่าจ้าง/เงินเดือน และข้อมูลส่วนตัวพนักงาน (เบอร์โทร เลขบัญชี ชื่อบัญชี เอกสาร) เด็ดขาด ถ้าถูกถามให้บอกว่าต้องใส่รหัสเจ้าของก่อน (ตาราง payments/staff จะดึงไม่ได้จนกว่าจะปลดล็อก)");
  system.push("ห้ามเปิดเผย PIN เข้างาน หรือข้อมูลใบหน้า/ไบโอเมตริกของพนักงานเด็ดขาด ไม่ว่ากรณีใด");
  if (ctx) system.push("\nบริบทสรุปของร้าน ณ ตอนนี้ (ถ้าตอบได้จากนี่เลยก็ดี ถ้าไม่พอให้เรียกเครื่องมือ):\n" + ctx);
  const contents: any[] = [];
  (history || []).slice(-12).forEach((h: any) => { if (h && h.text) contents.push({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text) }] }); });
  contents.push({ role: "user", parts: [{ text: message }] });
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + GEMINI_KEY;
  try {
    let finalText = "";
    let pendingAction: any = null;
    for (let iter = 0; iter < 6; iter++) {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system.join("\n") }] },
          contents, tools: MARU_TOOLS,
          generationConfig: { temperature: 0.6, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!res.ok) return { ok: false, error: "เรียก AI ไม่สำเร็จ (code " + res.status + ")" };
      const b = await res.json();
      const cand = b.candidates && b.candidates[0];
      if (!cand || !cand.content || !cand.content.parts) return { ok: false, error: "AI ไม่ตอบกลับ (อาจถูกกรองเนื้อหา) ลองถามใหม่" };
      const parts = cand.content.parts;
      const fcPart = parts.find((p: any) => p.functionCall);
      if (fcPart && iter < 5) {
        contents.push({ role: "model", parts });
        const fname = fcPart.functionCall.name;
        const fargs = fcPart.functionCall.args || {};
        let fresp: any;
        if (fname === "propose_stock_action") {
          const kind = fargs.kind === "receive" ? "receive" : "withdraw";
          const qn = Number(fargs.qty) || 0;
          const res = await maruResolveItem(String(fargs.item || ""));
          if (res.found) {
            pendingAction = { kind, item_id: res.item.item_id, item_name: res.item.name, unit: res.item.unit || "", qty: qn, recordedBy: String(fargs.recordedBy || ""), note: String(fargs.note || "") };
            fresp = { ok: true, matched: res.item.name, item_id: res.item.item_id, unit: res.item.unit || "", qty: qn, kind, instruction: "พบสินค้าตรง 1 รายการ ให้ทวนสั้นๆ ว่าจะ" + (kind === "receive" ? "รับเข้า" : "เบิก") + " " + res.item.name + " " + qn + " " + (res.item.unit || "") + " แล้วบอกผู้ใช้ว่ากดปุ่มยืนยันด้านล่างได้เลย ห้ามบอกว่าบันทึกแล้วเพราะยังไม่ได้บันทึก" };
          } else if (res.candidates && res.candidates.length) {
            pendingAction = null;
            fresp = { ok: false, ambiguous: true, candidates: res.candidates.map((c: any) => ({ item_id: c.item_id, name: c.name, unit: c.unit })), instruction: "พบหลายรายการใกล้เคียง ให้ลิสต์ชื่อให้ผู้ใช้เลือกว่าหมายถึงตัวไหน" };
          } else {
            pendingAction = null;
            fresp = { ok: false, found: false, instruction: "ไม่พบสินค้าชื่อนี้ในระบบ ให้ถามผู้ใช้ให้ระบุชื่อชัดขึ้น หรือบอกว่ายังไม่มีสินค้านี้" };
          }
        } else if (fname === "get_item_movements") {
          fresp = await getItemMovements(fargs);
        } else {
          fresp = await queryShopData(fargs, unlocked);
        }
        contents.push({ role: "user", parts: [{ functionResponse: { name: fname, response: fresp } }] });
        continue;
      }
      finalText = parts.map((p: any) => p.text || "").join("");
      break;
    }
    if (!finalText) finalText = "ขอโทษครับ ตอนนี้ดึงข้อมูลมาตอบไม่ครบ ลองถามใหม่อีกครั้งหรือถามให้เจาะจงขึ้นนะครับ";
    return { ok: true, reply: finalText, pendingAction };
  } catch (e) { return { ok: false, error: "เกิดข้อผิดพลาด: " + String((e as Error).message || e) }; }
}

// ===== การตลาด: แคปชั่น + แต่งรูป (เฉพาะจากภาพแนบ) =====
async function genPromoCaption(body: any) {
  if (!GEMINI_KEY) return { ok: false, error: "ยังไม่ได้ตั้ง GEMINI_API_KEY ใน Edge Function" };
  const brief = String(body.brief || "").trim();
  if (!brief) return { ok: false, error: "ยังไม่มีรายละเอียดโปรโมชั่น (เช่น เมนู ราคา ส่วนลด)" };
  let channels = body.channels; if (typeof channels === "string") channels = channels.split(",");
  const allChan = ["facebook", "line", "instagram", "tiktok"];
  let chans = (channels && channels.length) ? channels.filter((c: string) => allChan.indexOf(c) >= 0) : allChan;
  if (!chans.length) chans = allChan;
  const sys = [
    "คุณคือทีมการตลาดของร้าน Maru Waffle (ร้านวาฟเฟิลในไทย ย่านพันทิพย์ งามวงศ์วาน)",
    "หน้าที่: เขียนแคปชั่นโพสต์ขายของให้น่ากินและกระตุ้นให้คนมาซื้อ ภาษาไทยเป็นหลัก โทนสดใสเป็นกันเอง",
    "เขียนแยกตามช่องทางที่ถูกขอ ปรับโทนและความยาวให้เหมาะแต่ละช่องทาง:",
    "- facebook: เล่าเรื่องได้ มีรายละเอียด ปิดท้ายด้วย call-to-action ชวนมาซื้อ ใส่แฮชแท็กพอประมาณ",
    "- line: สั้น กระชับ ตรงประเด็น มีอิโมจิเล็กน้อย",
    "- instagram: อารมณ์ดี น่ารัก ใส่แฮชแท็กเยอะหน่อย",
    "- tiktok: ฮุคสั้นๆ สะดุดตา ใส่แฮชแท็กเทรนด์",
    "ใส่อิโมจิได้ตามเหมาะสม ระบุราคา/ส่วนลดให้ชัดถ้ามีในบรีฟ",
    "ห้ามแต่งราคา เมนู หรือเงื่อนไขเกินจากบรีฟที่ได้รับเด็ดขาด",
    'นอกจากแคปชั่นแต่ละช่องทาง ให้ใส่ key พิเศษชื่อ poster เป็น object สำหรับทำข้อความบนรูปโปสเตอร์ มีฟิลด์: headline (ข้อความดึงดูดสั้นที่สุด เช่น "ลด 20%"), menu (ชื่อเมนูสั้นๆ), price (ราคา เช่น "49.-" ถ้ามี), note (เงื่อนไขสั้นๆ เช่น "เฉพาะวันอังคาร" ถ้ามี) ทุกฟิลด์สั้นกระชับ ถ้าไม่มีข้อมูลให้ใส่เป็นข้อความว่าง "" ห้ามเดา',
    "ตอบกลับเป็น JSON object เท่านั้น โดย key เป็นชื่อช่องทางตัวพิมพ์เล็ก เฉพาะที่ถูกขอ และ value เป็นข้อความแคปชั่น (ขึ้นบรรทัดใหม่ใน value ได้) ห้ามมีข้อความอื่นนอก JSON",
  ].join("\n");
  const userMsg = "รายละเอียดโปรโมชั่น/เมนู: " + brief + "\nช่องทางที่ต้องการ (ใส่ใน JSON เฉพาะเหล่านี้): " + chans.join(", ");
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + GEMINI_KEY;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return { ok: false, error: "เรียก AI ไม่สำเร็จ (code " + res.status + ")" };
    const b = await res.json(); const cand = b.candidates && b.candidates[0];
    if (!cand || !cand.content || !cand.content.parts) return { ok: false, error: "AI ไม่ตอบกลับ ลองใหม่" };
    const txt = cand.content.parts.map((p: any) => p.text || "").join("");
    let caps: any; try { caps = JSON.parse(txt); } catch (_e) { caps = { raw: txt }; }
    return { ok: true, captions: caps, channels: chans };
  } catch (e) { return { ok: false, error: "เกิดข้อผิดพลาด: " + String((e as Error).message || e) }; }
}

async function genPromoImage(body: any) {
  if (!GEMINI_KEY) return { ok: false, error: "ยังไม่ได้ตั้ง GEMINI_API_KEY ใน Edge Function" };
  // รองรับหลายรูป: body.images = [{data, mime}] หรือ single imageBase64/mime (ของเดิม)
  let imgs: { data: string; mime: string }[] = [];
  if (Array.isArray(body.images) && body.images.length) {
    imgs = body.images
      .map((x: any) => ({ data: String(x.data || x.imageBase64 || ""), mime: x.mime || "image/jpeg" }))
      .filter((x: any) => x.data);
  } else if (body.imageBase64) {
    imgs = [{ data: String(body.imageBase64), mime: body.mime || "image/jpeg" }];
  }
  if (!imgs.length) return { ok: false, error: "ต้องแนบรูปก่อน (โหมดแต่งรูปใช้ได้เฉพาะจากภาพที่แนบ)" };
  const prompt = String(body.prompt || "").trim();
  let instr = imgs.length > 1
    ? "นี่คือรูปสินค้าจริงหลายรูปของร้านวาฟเฟิล Maru Waffle ช่วยนำสินค้าจากทุกรูปมารวม/จัดวางไว้ในภาพโปรโมชั่นเดียวกันที่ดูน่ากิน จัดแสง พื้นหลัง และองค์ประกอบให้สวยแบบมืออาชีพ คงตัวสินค้าแต่ละชิ้นให้เหมือนเดิม ไม่เปลี่ยนชนิดอาหาร โทนภาพสว่างสดใส"
    : "นี่คือรูปสินค้าจริงของร้านวาฟเฟิล Maru Waffle ช่วยปรับให้เป็นภาพโปรโมชั่นที่ดูน่ากินขึ้น จัดแสง พื้นหลัง และองค์ประกอบให้สวยแบบมืออาชีพ โดยคงตัวสินค้า (วาฟเฟิล/ของในรูป) ให้เหมือนเดิม ไม่เปลี่ยนชนิดอาหาร โทนภาพสว่างสดใส";
  if (prompt) instr += " เพิ่มเติม: " + prompt;
  const parts: any[] = [{ text: instr }];
  for (const im of imgs) parts.push({ inlineData: { mimeType: im.mime, data: im.data } });
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=" + GEMINI_KEY;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });
    if (!res.ok) return { ok: false, error: "แต่งรูปไม่สำเร็จ (code " + res.status + ")" };
    const b = await res.json(); const cand = b.candidates && b.candidates[0]; const ps = (cand && cand.content && cand.content.parts) || [];
    for (const p of ps) { if (p.inlineData && p.inlineData.data) return { ok: true, image: "data:" + (p.inlineData.mimeType || "image/png") + ";base64," + p.inlineData.data }; }
    return { ok: false, error: "ไม่ได้ภาพกลับมา (อาจถูกกรองเนื้อหา) ลองใหม่" };
  } catch (e) { return { ok: false, error: "เกิดข้อผิดพลาด: " + String((e as Error).message || e) }; }
}

// ===== ยืนยันรับเงินสดนำส่ง (เจ้าของเท่านั้น) =====
async function confirmRemit(body: any) {
  if (!OWNER || String(body.ownerCode || "") !== String(OWNER)) return { ok: false, needOwner: true, error: "รหัสเจ้าของไม่ถูกต้อง" };
  const id = body.id; if (!id) return { ok: false, error: "ไม่พบรายการนำส่ง" };
  const flag = body.actionType === "flag";
  const row: Record<string, unknown> = { status: flag ? "flagged" : "confirmed", confirmed_by: body.confirmedBy || "เจ้าของ", confirmed_at: new Date().toISOString() };
  if (body.note !== undefined && body.note !== null) row.note = body.note;
  const res = await sbPatch("cash_remittance", "id=eq." + encodeURIComponent(String(id)), row);
  if (!res.ok) return res;
  return { ok: true, msg: flag ? "ทักท้วงรายการแล้ว" : "ยืนยันรับเงินแล้ว ✓" };
}

async function notifyLine(body: any) {
  if (!LINE_TOKEN || !LINE_GROUP) return { ok: false, error: "ยังไม่ได้ตั้ง LINE_CHANNEL_TOKEN / LINE_GROUP_ID ใน Edge secrets" };
  const messages = Array.isArray(body.messages) ? body.messages : (body.message ? [body.message] : []);
  if (!messages.length) return { ok: false, error: "ไม่มีข้อความที่จะส่ง" };
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_TOKEN },
      body: JSON.stringify({ to: LINE_GROUP, messages: messages.slice(0, 5) }),
    });
    const txt = await res.text();
    return { ok: res.ok, status: res.status, body: txt.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

async function ttsSpeak(body: any) {
  if (!GEMINI_KEY) return { ok: false, error: "ยังไม่ได้ตั้ง GEMINI_API_KEY ใน Edge Function" };
  const text = String(body.text || "").trim();
  if (!text) return { ok: false, error: "ไม่มีข้อความที่จะอ่าน" };
  const voice = String(body.voice || "Aoede");
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=" + GEMINI_KEY;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    });
    if (!res.ok) return { ok: false, error: "TTS code " + res.status + ": " + (await res.text()).slice(0, 200) };
    const b = await res.json();
    const part = b.candidates && b.candidates[0] && b.candidates[0].content && b.candidates[0].content.parts && b.candidates[0].content.parts[0];
    const data = part && part.inlineData && part.inlineData.data;
    const mime = (part && part.inlineData && part.inlineData.mimeType) || "audio/L16;rate=24000";
    if (!data) return { ok: false, error: "ไม่ได้เสียงกลับมา (อาจถูกกรอง) ลองใหม่" };
    return { ok: true, audio: data, mime: mime };
  } catch (e) { return { ok: false, error: String((e as Error).message || e) }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const action = body.action;

  try {
    if (action === "askAI") return json(await askAI(body));
    if (action === "confirmRemit") return json(await confirmRemit(body));
    if (action === "genPromoCaption") return json(await genPromoCaption(body));
    if (action === "genPromoImage") return json(await genPromoImage(body));
    if (action === "notifyLine") return json(await notifyLine(body));
    if (action === "ttsSpeak") return json(await ttsSpeak(body));
    if (action === "execStockWrite") return json(await execStockWrite(body));
    if (action === "editStockMovement") return json(await editStockMovement(body));

    // --- actions ที่ต้องใส่รหัสเจ้าของ ---
    if (action === "getPayrollStatus" || action === "markPaid") {
      if (!OWNER || String(body.ownerCode || "") !== String(OWNER)) {
        return json({ ok: false, locked: true, error: "รหัสเจ้าของไม่ถูกต้อง" });
      }
      if (action === "getPayrollStatus") return json(await getPayrollStatus());
      return json(await markPaid(body.data || {}));
    }

    // --- actions พนักงาน (ไม่ต้องใส่รหัส) ---
    if (action === "getStaffDetail")  return json(await getStaffDetail(body.staffId));
    if (action === "verifyStaffPin")  return json(await verifyStaffPin(body.staffId, body.pin));
    if (action === "saveAttendStaff") return json(await saveAttendStaff(body.data || {}));

    return json({ error: "unknown action: " + action }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
