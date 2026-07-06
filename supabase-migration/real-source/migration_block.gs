// ============================================================
//  ย้ายข้อมูล Google Sheets → Supabase  (รันครั้งเดียวจาก editor)
//  *** วางบล็อกนี้ทับบล็อก migration เดิมทั้งหมด ***
//  (ตั้งแต่บรรทัด  // ===== ย้ายข้อมูลไป Supabase =====  จนจบไฟล์)
// ============================================================

var SUPABASE_URL = 'https://sfdahyvekfcxoprkshko.supabase.co';
var SUPABASE_KEY = 'วาง_service_role_key_ที่นี่';   // ใส่ service_role key (Supabase > Project Settings > API > service_role)

// ตั้งวันเริ่มต้นที่จะย้าย (ค.ศ. รูปแบบ yyyy-MM-dd)  เช่น พ.ศ.2569 = ค.ศ.2026
// จะย้ายเฉพาะแถวที่ "วันที่ >= ค่านี้" (ตารางไม่มีวันที่ เช่น สต๊อก_รายการ/พนักงาน/สาขา ย้ายทั้งหมด)
var MIGRATE_FROM = '2026-01-01';

// ---------- ตัวช่วยแปลงค่า ----------
function mgD_(v){
  if(v === '' || v == null) return null;
  if(v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m){ var dd = ('0'+m[1]).slice(-2), mm = ('0'+m[2]).slice(-2), y = parseInt(m[3], 10);
         if(y > 2500) y -= 543; return y + '-' + mm + '-' + dd; }
  return null;
}
function mgTs_(v){
  if(v === '' || v == null) return null;
  if(v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss'+07:00'");
  return String(v);
}
function mgN_(v){ if(v === '' || v == null) return null; var x = Number(v); return isNaN(x) ? null : x; }
function mgT_(v){ return (v === '' || v == null) ? null : String(v); }
function mgB_(v){
  if(v === true) return true; if(v === false) return false;
  var s = String(v).toLowerCase().trim();
  if(s === 'true' || s === '1' || s === 'ใช่' || s === 'yes') return true;
  if(s === 'false' || s === '0' || s === 'ไม่' || s === 'no' || s === '') return false;
  return null;
}
// normalize สำหรับสร้าง "ลายเซ็น" กันซ้ำ (ให้ฝั่งชีท + ฝั่ง Supabase ออกมาเท่ากัน)
function mgKn_(n){ return (n === null || n === undefined || n === '') ? '' : String(Number(n)); }
function mgKt_(t){ return t ? String(t).substring(0,5) : ''; }
function mgKd_(d){ return d ? String(d).substring(0,10) : ''; }

// ---------- ดึง "คีย์ที่มีอยู่แล้ว" จาก Supabase (กันซ้ำ) ----------
function mgExistingKeys_(table, selectCols, keyFn){
  var set = {}, offset = 0, PAGE = 1000;
  while(true){
    var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + table + '?select=' + selectCols, {
      method: 'get',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
                 'Range-Unit': 'items', Range: offset + '-' + (offset + PAGE - 1) },
      muteHttpExceptions: true
    });
    var arr = [];
    try { arr = JSON.parse(res.getContentText()); } catch(e){ break; }
    if(!arr || !arr.length) break;
    arr.forEach(function(o){ set[keyFn(o)] = 1; });
    if(arr.length < PAGE) break;
    offset += PAGE;
  }
  return set;
}

// ---------- ส่งเข้า Supabase แบบ insert ทีละก้อน ----------
function mgInsert_(table, rows){
  if(!rows.length) return { count: 0, errors: [] };
  var url = SUPABASE_URL + '/rest/v1/' + table, inserted = 0, errors = [], CHUNK = 300;
  for(var i = 0; i < rows.length; i += CHUNK){
    var batch = rows.slice(i, i + CHUNK);
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, Prefer: 'return=minimal' },
      payload: JSON.stringify(batch), muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if(code === 201 || code === 200){ inserted += batch.length; }
    else { errors.push('code ' + code + ': ' + res.getContentText().substring(0, 200)); }
  }
  return { count: inserted, errors: errors };
}

// ---------- อ่านชีท > map > กรองวันที่ > กันซ้ำ > ส่ง ----------
function mgTable_(sheetName, table, width, mapFn, keyCols, keyFn){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if(!sh) return table + ': ไม่พบชีต "' + sheetName + '"';
  var last = sh.getLastRow();
  if(last < 2) return table + ': ไม่มีข้อมูล';
  var values = sh.getRange(2, 1, last - 1, width).getValues(), rows = [];
  values.forEach(function(r){ var o = mapFn(r); if(o) rows.push(o); });
  var afterDate = rows.length;

  var skipped = 0;
  if(keyFn){
    var existing = mgExistingKeys_(table, keyCols, keyFn);
    rows = rows.filter(function(o){ if(existing[keyFn(o)]){ skipped++; return false; } return true; });
  }
  var res = mgInsert_(table, rows);
  return table + ': ผ่านตัวกรองวันที่ ' + afterDate + ' แถว · มีอยู่แล้ว(ข้าม) ' + skipped +
         ' · ส่งใหม่ ' + res.count + (res.errors.length ? (' [ERR] ' + res.errors.join(' | ')) : ' OK');
}

// ============================================================
//  ฟังก์ชันหลัก — กดรันอันนี้
// ============================================================
function migrateAllToSupabase(){
  if(SUPABASE_KEY.indexOf('วาง_') === 0) return 'ยังไม่ได้วาง service_role key ในตัวแปร SUPABASE_KEY';
  var out = [];
  var FROM = MIGRATE_FROM;

  // sales (รายงานยอดขาย) : คีย์ = วันที่
  out.push(mgTable_(SHEET_SALES, 'sales', 18, function(r){
    var d = mgD_(r[0]); if(d === null || d < FROM) return null;
    return { sale_date:d, cash:mgN_(r[1]), transfer:mgN_(r[2]), thaihelp:mgN_(r[3]), lineman:mgN_(r[4]),
      grab:mgN_(r[5]), shopee:mgN_(r[6]), robinhood:mgN_(r[7]), total:mgN_(r[8]), cash_open:mgN_(r[9]),
      cash_in:mgN_(r[10]), refund:mgN_(r[11]), cash_expected:mgN_(r[12]), cash_actual:mgN_(r[13]),
      cash_diff:mgN_(r[14]), closed_by:mgT_(r[15]), note:mgT_(r[16]), created_at:mgTs_(r[17]) }; },
    'sale_date', function(o){ return mgKd_(o.sale_date); }));

  // expenses (รายจ่าย) : คีย์ = วันที่+รายการ+ยอด+ประเภท
  out.push(mgTable_(SHEET_EXPENSES, 'expenses', 6, function(r){
    var d = mgD_(r[0]); if(d === null || d < FROM) return null;
    return { exp_date:d, item:mgT_(r[1]), amount:mgN_(r[2]), receipt_url:mgT_(r[3]), type:mgT_(r[4]), created_at:mgTs_(r[5]) }; },
    'exp_date,item,amount,type', function(o){ return mgKd_(o.exp_date)+'|'+(o.item||'')+'|'+mgKn_(o.amount)+'|'+(o.type||''); }));

  // stock_items (สต๊อก_รายการ) : ย้ายทั้งหมด · คีย์ = item_id
  out.push(mgTable_(SHEET_STOCK_ITEMS, 'stock_items', 9, function(r){
    if(!mgT_(r[0])) return null;
    return { item_id:mgT_(r[0]), name:mgT_(r[1]), category:mgT_(r[2]), unit:mgT_(r[3]), min_stock:mgN_(r[4]),
      sort_order:mgN_(r[5]), mode:mgT_(r[6]), active:mgB_(r[7]), edited_at:mgTs_(r[8]) }; },
    'item_id', function(o){ return o.item_id || ''; }));

  // stock_withdraw (สต๊อก_เบิก) : คีย์ = วันที่+เวลา+item+จำนวน+ผู้บันทึก
  out.push(mgTable_(SHEET_STOCK_WITHDRAW, 'stock_withdraw', 9, function(r){
    var d = mgD_(r[0]); if(d === null || d < FROM) return null;
    return { move_date:d, move_time:mgT_(r[1]), branch:mgT_(r[2]), recorded_by:mgT_(r[3]),
      item_id:mgT_(r[4]), item_name:mgT_(r[5]), qty:mgN_(r[6]), note:mgT_(r[7]), created_at:mgTs_(r[8]) }; },
    'move_date,move_time,item_id,qty,recorded_by',
    function(o){ return mgKd_(o.move_date)+'|'+mgKt_(o.move_time)+'|'+(o.item_id||'')+'|'+mgKn_(o.qty)+'|'+(o.recorded_by||''); }));

  // stock_receive (สต๊อก_รับเข้า) : คีย์ = วันที่+item+จำนวน+ผู้บันทึก
  out.push(mgTable_(SHEET_STOCK_RECEIVE, 'stock_receive', 9, function(r){
    var d = mgD_(r[0]); if(d === null || d < FROM) return null;
    return { move_date:d, branch:mgT_(r[1]), recorded_by:mgT_(r[2]), item_id:mgT_(r[3]),
      item_name:mgT_(r[4]), qty:mgN_(r[5]), receipt_url:mgT_(r[6]), note:mgT_(r[7]), created_at:mgTs_(r[8]) }; },
    'move_date,item_id,qty,recorded_by',
    function(o){ return mgKd_(o.move_date)+'|'+(o.item_id||'')+'|'+mgKn_(o.qty)+'|'+(o.recorded_by||''); }));

  // stock_daily (สต๊อก_สรุปวัน) : คีย์ = วันที่+item
  out.push(mgTable_(SHEET_STOCK_DAILY, 'stock_daily', 15, function(r){
    var d = mgD_(r[0]); if(d === null || d < FROM) return null;
    return { move_date:d, branch:mgT_(r[1]), closed_by:mgT_(r[2]), item_id:mgT_(r[3]), item_name:mgT_(r[4]),
      open_qty:mgN_(r[5]), receive_total:mgN_(r[6]), withdraw_total:mgN_(r[7]), waste:mgN_(r[8]), balance:mgN_(r[9]),
      used:mgN_(r[10]), diff:mgN_(r[11]), mode:mgT_(r[12]), note:mgT_(r[13]), created_at:mgTs_(r[14]) }; },
    'move_date,item_id', function(o){ return mgKd_(o.move_date)+'|'+(o.item_id||''); }));

  // stock_audit (สต๊อก_ออดิท) : คีย์ = วันที่+item
  out.push(mgTable_(SHEET_STOCK_AUDIT, 'stock_audit', 11, function(r){
    var d = mgD_(r[0]); if(d === null || d < FROM) return null;
    return { audit_date:d, branch:mgT_(r[1]), auditor:mgT_(r[2]), item_id:mgT_(r[3]), item_name:mgT_(r[4]),
      system_qty:mgN_(r[5]), actual_qty:mgN_(r[6]), diff:mgN_(r[7]), reason:mgT_(r[8]), adjusted:mgB_(r[9]), created_at:mgTs_(r[10]) }; },
    'audit_date,item_id', function(o){ return mgKd_(o.audit_date)+'|'+(o.item_id||''); }));

  // staff (พนักงาน) : ย้ายทั้งหมด · คีย์ = staff_id
  out.push(mgTable_(SHEET_ATT_STAFF, 'staff', 24, function(r){
    if(!mgT_(r[0])) return null;
    return { staff_id:mgT_(r[0]), name:mgT_(r[1]), nickname:mgT_(r[2]), position:mgT_(r[3]), pin:mgT_(r[4]),
      branch:mgT_(r[5]), line_user_id:mgT_(r[6]), ref_photo:mgT_(r[7]), face_descriptor:mgT_(r[8]), active:mgB_(r[9]),
      edited_at:mgTs_(r[10]), emp_type:mgT_(r[11]), start_date:mgD_(r[12]), bank:mgT_(r[13]), bank_account:mgT_(r[14]),
      account_name:mgT_(r[15]), wage:mgN_(r[16]), wage_unit:mgT_(r[17]), id_card_url:mgT_(r[18]), doc1_url:mgT_(r[19]),
      doc2_url:mgT_(r[20]), phone:mgT_(r[21]), line_id:mgT_(r[22]), wage_start_date:mgD_(r[23]) }; },
    'staff_id', function(o){ return o.staff_id || ''; }));

  // attendance (บันทึกเข้างาน) : คีย์ = วันที่+เวลา+staff+ประเภท
  out.push(mgTable_(SHEET_ATT_LOG, 'attendance', 14, function(r){
    var d = mgD_(r[0]); if(d === null || d < FROM) return null;
    return { att_date:d, att_time:mgT_(r[1]), type:mgT_(r[2]), staff_id:mgT_(r[3]), name:mgT_(r[4]),
      branch:mgT_(r[5]), lat:mgN_(r[6]), lng:mgN_(r[7]), address:mgT_(r[8]), photo_url:mgT_(r[9]),
      in_geofence:mgB_(r[10]), distance:mgN_(r[11]), note:mgT_(r[12]), created_at:mgTs_(r[13]) }; },
    'att_date,att_time,staff_id,type',
    function(o){ return mgKd_(o.att_date)+'|'+mgKt_(o.att_time)+'|'+(o.staff_id||'')+'|'+(o.type||''); }));

  // payments (การจ่ายเงิน) : กรองด้วย pay_date · คีย์ = staff_id+period
  out.push(mgTable_(SHEET_PAYMENTS, 'payments', 13, function(r){
    if(!mgT_(r[0])) return null;
    var pd = mgD_(r[9]); if(pd !== null && pd < FROM) return null;
    return { staff_id:mgT_(r[0]), name:mgT_(r[1]), type:mgT_(r[2]), period:mgT_(r[3]), period_start:mgD_(r[4]),
      period_end:mgD_(r[5]), paid_up_to:mgD_(r[6]), days:mgN_(r[7]), alone_days:mgN_(r[8]), pay_date:mgD_(r[9]),
      paid_by:mgT_(r[10]), note:mgT_(r[11]), created_at:mgTs_(r[12]) }; },
    'staff_id,period', function(o){ return (o.staff_id||'')+'|'+(o.period||''); }));

  // branches (สาขา) : ย้ายทั้งหมด · คีย์ = branch_id
  out.push(mgTable_(SHEET_ATT_BRANCH, 'branches', 5, function(r){
    if(!mgT_(r[0])) return null;
    return { branch_id:mgT_(r[0]), name:mgT_(r[1]), lat:mgN_(r[2]), lng:mgN_(r[3]), radius:mgN_(r[4]) }; },
    'branch_id', function(o){ return o.branch_id || ''; }));

  var summary = 'ย้ายข้อมูลตั้งแต่วันที่ ' + FROM + ' เป็นต้นไป\n\n' + out.join('\n');
  Logger.log('===== สรุปการย้ายข้อมูล =====\n' + summary);
  return summary;
}
