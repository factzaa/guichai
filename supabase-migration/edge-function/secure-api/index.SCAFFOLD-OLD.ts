// =====================================================================
// กุยช่ายสวรรค์ — Edge Function "secure-api"  (Supabase Edge / Deno)
// ---------------------------------------------------------------------
// ⚠️  สำคัญ: นี่คือ "โครง (scaffold) ที่สร้างขึ้นใหม่" จากการอ่าน contract
//     ในฝั่ง frontend เท่านั้น — source จริงของ Maru อยู่บนเซิร์ฟเวอร์ Maru
//     ไม่ได้อยู่ในโปรเจกต์ ดังนั้น:
//       • action กลุ่มภายนอก (notifyLine / askAI / genPromo* / ttsSpeak)
//         มีตัวอย่าง implement ให้พอเริ่มได้
//       • action กลุ่มเงินเดือน/พนักงาน (getPayrollStatus / markPaid /
//         getStaffDetail / verifyStaffPin / saveAttendStaff) เป็น STUB
//         เพราะ business logic + schema staff จริง ไม่มีในโค้ด frontend
//     ต้องเติมตรรกะให้ตรงกับของเดิม หรือขอ source เดิมจากเจ้าของ Maru
//
// Deploy:
//   supabase functions deploy secure-api --no-verify-jwt
//   (ต้อง --no-verify-jwt เพราะ frontend ยิงด้วย publishable key ใน header apikey)
//
// Secrets ที่ต้องตั้ง (ชื่อตรงตาม PROGRESS ของ Maru — ดู SETUP_GUIDE.md ข้อ 5):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (อัตโนมัติ),
//   LINE_CHANNEL_TOKEN, LINE_GROUP_ID,
//   GEMINI_API_KEY, OWNER_PASSCODE
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// service_role client — ข้าม RLS ได้ ใช้กับตารางอ่อนไหว (staff) และ writes ที่ต้องคุม
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const OWNER_PASSCODE = Deno.env.get("OWNER_PASSCODE") || "";
const requireOwner = (code: string) => !!OWNER_PASSCODE && code === OWNER_PASSCODE;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      // ============ ภายนอก: LINE ============
      case "notifyLine": {
        // frontend ส่ง { messages: [ <LINE Flex/Text message object>, ... ] }
        const token = Deno.env.get("LINE_CHANNEL_TOKEN");
        const to = Deno.env.get("LINE_GROUP_ID");
        if (!token || !to) return json({ ok: false, error: "LINE not configured" });
        const r = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to, messages: body.messages || [] }),
        });
        return json({ ok: r.ok, status: r.status });
      }

      // ============ ภายนอก: Gemini (AI ผู้ช่วย / โปรโมชัน / TTS) ============
      case "askAI": {
        // { message, history, context, ownerCode }
        const key = Deno.env.get("GEMINI_API_KEY");
        if (!key) return json({ error: "GEMINI_API_KEY not set" });
        const contents = [
          ...(body.context ? [{ role: "user", parts: [{ text: "บริบท:\n" + body.context }] }] : []),
          ...((body.history || []) as any[]).map((h) => ({
            role: h.role === "assistant" ? "model" : "user",
            parts: [{ text: String(h.content ?? h.text ?? "") }],
          })),
          { role: "user", parts: [{ text: String(body.message || "") }] },
        ];
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }) },
        );
        const d = await r.json();
        const reply = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return json({ ok: true, reply, text: reply });
      }

      case "genPromoCaption": {
        // { brief, channels } → คืนแคปชันโปรโมชัน
        const key = Deno.env.get("GEMINI_API_KEY");
        if (!key) return json({ error: "GEMINI_API_KEY not set" });
        const prompt =
          `เขียนแคปชันโปรโมชันร้านกุยช่ายสวรรค์ ช่องทาง: ${(body.channels || []).join(", ")}\nโจทย์: ${body.brief || ""}`;
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }) },
        );
        const d = await r.json();
        return json({ ok: true, caption: d?.candidates?.[0]?.content?.parts?.[0]?.text || "" });
      }

      case "genPromoImage": {
        // TODO: เรียกโมเดลสร้างภาพ (เช่น Gemini image / Imagen) แล้วคืน { url } หรือ { base64 }
        return json({ ok: false, error: "genPromoImage ยังไม่ implement — เติมการเรียกโมเดลสร้างภาพ" });
      }

      case "ttsSpeak": {
        // { text, voice }  frontend คาดหวังไฟล์เสียงกลับ (ตรวจ Content-Type ฝั่ง client)
        // TODO: เรียก Gemini TTS (voice เช่น 'Leda') แล้วคืน audio/มปีเป็น base64
        return json({ ok: false, error: "ttsSpeak ยังไม่ implement — เติมการเรียก TTS" });
      }

      // ============ อ่อนไหว: พนักงาน / เงินเดือน (STUB — เติม logic เดิม) ============
      case "verifyStaffPin": {
        // { staffId, pin } → ตรวจ PIN กับ staff.pin (อย่าส่ง pin กลับ client)
        const { data } = await admin.from("staff").select("staff_id,pin,name").eq("staff_id", body.staffId).maybeSingle();
        const ok = !!data && String(data.pin) === String(body.pin);
        return json({ ok, name: ok ? data!.name : undefined });
      }
      case "getStaffDetail":   // { staffId }
      case "getPayrollStatus": // { ownerCode }
      case "markPaid":         // { data, ownerCode }
      case "saveAttendStaff":  // { data }
        if ((action === "getPayrollStatus" || action === "markPaid") && !requireOwner(body.ownerCode || ""))
          return json({ error: "unauthorized" }, 403);
        return json({ ok: false, error: `${action}: STUB — ต้องเติม business logic + schema staff จริงจาก Maru` });

      // ============ writes ที่คุมผ่าน edge ============
      case "confirmRemit": {
        // { id, ownerCode, actionType: 'confirm'|'flag' }
        if (!requireOwner(body.ownerCode || "")) return json({ error: "unauthorized" }, 403);
        const patch = body.actionType === "flag"
          ? { status: "flagged" }
          : { status: "confirmed", confirmed_by: "owner", confirmed_at: new Date().toISOString() };
        const { error } = await admin.from("cash_remittance").update(patch).eq("id", body.id);
        return error ? json({ error: error.message }) : json({ ok: true });
      }
      case "execStockWrite":    // { kind, itemId, qty, recordedBy, note }
      case "editStockMovement": // { kind, id, op, qty, ownerCode }
        return json({ ok: false, error: `${action}: STUB — เติม logic ให้ตรงกับ Maru (เขียน stock_* ด้วย service_role)` });

      default:
        return json({ error: "unknown action: " + action }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
