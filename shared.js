// ============================================================
// กุยช่ายสวรรค์ — shared.js
// ใช้ร่วมกันในทุกไฟล์ stock-*.html
// ============================================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxM4wS8A69veJY-4YTXJg2nbQKC-AaG88VDLSfp_SHX9SsUf2yhd6xv4ICKJPyVHnLDeg/exec';

// ---- Utilities ----
function fmt(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function baht(n){return '฿'+Math.round(Number(n)||0).toLocaleString('en-US');}
function num(v){const n=parseFloat(v); return isNaN(n)?0:n;}
function escHtml(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

// ย่อ/บีบรูปก่อนอัปโหลด (กันไฟล์ใหญ่อัป ImgBB ล้ม) → คืน Promise {base64, mime, name, dataUrl}
// ใช้กับใบเสร็จ/บิล: maruCompressImage(file).then(function(r){ ... })
function maruCompressImage(file, maxDim, quality){
  maxDim = maxDim || 1280; quality = quality || 0.8;
  return new Promise(function(resolve){
    if(!file){ resolve(null); return; }
    var reader = new FileReader();
    reader.onload = function(){
      var raw = reader.result;
      function rawResult(){ return { base64: String(raw).split(',')[1] || '', mime: file.type || 'image/jpeg', name: file.name || 'receipt', dataUrl: raw }; }
      var img = new Image();
      img.onload = function(){
        try{
          var w = img.width, h = img.height;
          if(Math.max(w, h) > maxDim){ var sc = maxDim / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); }
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          var dataUrl = c.toDataURL('image/jpeg', quality);
          var base64 = dataUrl.split(',')[1] || '';
          if(!base64 || base64.length >= String(raw).length){ resolve(rawResult()); return; }  // รูปเล็กอยู่แล้ว ใช้ของเดิม
          resolve({ base64: base64, mime: 'image/jpeg', name: (file.name || 'receipt').replace(/\.[^.]+$/, '') + '.jpg', dataUrl: dataUrl });
        }catch(e){ resolve(rawResult()); }
      };
      img.onerror = function(){ resolve(rawResult()); };
      img.src = raw;
    };
    reader.onerror = function(){ resolve(null); };
    reader.readAsDataURL(file);
  });
}

function toast(msg){
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  setTimeout(function(){t.classList.remove('show');},2400);
}

// ============================================================
// SWR cache (localStorage) — stale-while-revalidate
// เปิดหน้าซ้ำ → วาดจาก cache ทันที แล้วดึงสดมาอัปเดตเบื้องหลัง
// ============================================================
const SWR_PREFIX = 'maru_swr:';
const SWR_TTL = 5 * 60 * 1000;   // 5 นาที — เก่ากว่านี้ไม่ใช้ cache (กันค้างนาน)

// read action ที่ cache ได้
const SWR_CACHEABLE = {
  getStockBalances:1, getStockItems:1, getHomeDashboard:1, getStockDashboard:1,
  getActivityFeed:1, getDashboardData:1, getExpensesReport:1,
  getAttendReport:1, getAttendStaff:1, getAttendBranches:1, getStockAuditHistory:1
};

// write action → กลุ่ม read ที่ต้องล้าง cache เมื่อบันทึกสำเร็จ
const WRITE_INVALIDATES = {
  addStockWithdraw:  ['getStockBalances','getStockItems','getStockDashboard','getHomeDashboard','getActivityFeed'],
  addStockReceive:   ['getStockBalances','getStockItems','getStockDashboard','getHomeDashboard','getActivityFeed'],
  closeDailyStock:   ['getStockBalances','getStockItems','getStockDashboard','getHomeDashboard','getActivityFeed'],
  addStockAudit:     ['getStockBalances','getStockItems','getStockDashboard','getHomeDashboard','getActivityFeed','getStockAuditHistory'],
  saveStockItem:     ['getStockBalances','getStockItems','getStockDashboard','getHomeDashboard'],
  addStockItem:      ['getStockBalances','getStockItems','getStockDashboard','getHomeDashboard'],
  deleteStockItem:   ['getStockBalances','getStockItems','getStockDashboard','getHomeDashboard'],
  saveMinStockBatch: ['getStockItems','getStockBalances','getStockDashboard','getHomeDashboard'],
  saveDailyReport:   ['getDashboardData','getHomeDashboard','getActivityFeed','getExpensesReport'],
  addBusinessExpense:['getExpensesReport','getHomeDashboard','getActivityFeed'],
  addAttendLog:      ['getAttendReport','getHomeDashboard','getActivityFeed'],
  saveAttendStaff:   ['getAttendStaff','getHomeDashboard'],
  saveAttendBranch:  ['getAttendBranches']
};

function swrKey(action, params){ return SWR_PREFIX + action + ':' + JSON.stringify(params || {}); }
function swrRead(key){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}
function swrWrite(key, value){
  try{ localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); }
  catch(e){ try{ swrClear(); localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); }catch(e2){} }
}
function swrClear(actionPrefix){
  try{
    const rm = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.indexOf(SWR_PREFIX)===0 && (!actionPrefix || k.indexOf(SWR_PREFIX+actionPrefix)===0)) rm.push(k);
    }
    rm.forEach(function(k){ localStorage.removeItem(k); });
  }catch(e){}
}
function invalidateCache(actions){ (actions||[]).forEach(function(a){ swrClear(a); }); }

// SWR call — onData(data, meta) อาจถูกเรียกได้ถึง 2 ครั้ง: cache ก่อน แล้ว fresh
// คืน Promise(fresh). ถ้า network ล้มแต่มี cache → ใช้ cache ต่อ (ไม่ throw)
function apiSWR(action, params, onData){
  const key = swrKey(action, params);
  const cached = swrRead(key);
  let served = false;
  if(cached && (Date.now() - cached.t) < SWR_TTL){
    served = true;
    try{ onData(cached.v, { fromCache:true, age: Date.now()-cached.t }); }catch(e){}
  }
  return api(action, params).then(function(fresh){
    swrWrite(key, fresh);
    try{ onData(fresh, { fromCache:false }); }
    catch(e){ console.error('apiSWR onData error ['+action+']', e); if(!served) throw e; }
    return fresh;
  }).catch(function(err){
    if(served) return cached.v;   // มี cache อยู่แล้ว — เงียบ ใช้ต่อ
    throw err;                     // ไม่มี cache — ให้ caller จัดการ (โชว์ error)
  });
}


// ================= Supabase data layer (v2) =================
// ============================================================
// ⚠️  กุยช่ายสวรรค์ — แก้ URL + KEY ตรงนี้เมื่อมี Supabase ของแบรนด์ใหม่
//    ตอนนี้ยังชี้ไปฐานข้อมูลเดิมของ Maru (ข้อมูลจะปนกัน)
// ============================================================
const SB_URL = 'https://sfdahyvekfcxoprkshko.supabase.co';
const SB_KEY = 'sb_publishable_632DkQ4uOHjIGWr-_c7hCA_WgFHe3jT';
const EDGE_URL = SB_URL + '/functions/v1/secure-api';   // Edge Function สำหรับ action อ่อนไหว (เงินเดือน/พนักงาน)
const EDGE_ACTIONS = { getPayrollStatus:1, markPaid:1, getStaffDetail:1, verifyStaffPin:1, saveAttendStaff:1, askAI:1, genPromoCaption:1, genPromoImage:1, confirmRemit:1, notifyLine:1, ttsSpeak:1, execStockWrite:1, editStockMovement:1 };
const SB_CH = [
  { key:'cash', label:'เงินสด', group:'store' },
  { key:'transfer', label:'เงินโอน', group:'store' },
  { key:'thaihelp', label:'ไทยช่วยไทย', group:'store' },
  { key:'lineman', label:'LineMan', group:'delivery' },
  { key:'grab', label:'Grab', group:'delivery' },
  { key:'shopee', label:'ShopeeFood', group:'delivery' },
  { key:'robinhood', label:'Robinhood', group:'delivery' }
];
const SB_DOW = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
 
async function sbFetch(path){
  const res = await fetch(SB_URL + '/rest/v1/' + path, { headers:{ apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY } });
  if(!res.ok) throw new Error('Supabase ' + res.status + ': ' + (await res.text()).slice(0,150));
  return res.json();
}
// ดึงครบทุกแถว (เลี่ยง cap ดีฟอลต์ ~1000 แถวของ PostgREST) — สำคัญกับ stock_daily ที่โตเกิน 1000
async function sbFetchAll(path){
  let all = [], from = 0; const page = 1000;
  for(let guard=0; guard<50; guard++){
    const res = await fetch(SB_URL + '/rest/v1/' + path, { headers:{ apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY, 'Range-Unit':'items', Range: from + '-' + (from + page - 1) } });
    if(!res.ok) throw new Error('Supabase ' + res.status + ': ' + (await res.text()).slice(0,150));
    const rows = await res.json();
    if(!rows || !rows.length) break;
    all = all.concat(rows);
    if(rows.length < page) break;
    from += page;
  }
  return all;
}
function sbFmtD(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function sbDM(s){ const p = String(s).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function sbTsMs(v){ if(!v) return 0; const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
function sbFmtTime(v){
  if(v == null || v === '') return '';
  const s = String(v), m = s.match(/^(\d{1,2}):(\d{2})/);
  if(m) return ('0'+m[1]).slice(-2) + ':' + m[2];
  const d = new Date(s);
  if(!isNaN(d.getTime())) return ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
  return '';
}
 
// ---- ดึงตารางสต๊อกทั้งหมด (ใช้คำนวณคงเหลือ) ----
async function sbStockTables(){
  const [items, daily, wd, rc] = await Promise.all([
    sbFetch('stock_items?select=*'),
    sbFetchAll('stock_daily?select=*&order=move_date.asc,created_at.asc'),
    sbFetchAll('stock_withdraw?select=*&order=move_date.asc'),
    sbFetchAll('stock_receive?select=*&order=move_date.asc')
  ]);
  return { items:items, daily:daily, wd:wd, rc:rc };
}
 
// ---- คำนวณคงเหลือ = port ของ getStockBalances เดิมเป๊ะ ----
function sbComputeBalances(asOfDate, category, T){
  let itemRows = T.items;
  if(category && category !== 'all') itemRows = itemRows.filter(function(r){ return r.category === category; });
  const items = itemRows.map(function(r){
    return { id:r.item_id, name:r.name, category:r.category, unit:r.unit, mode:r.mode || 'withdraw',
             minStock:Number(r.min_stock)||0, active:r.active !== false, order:Number(r.sort_order)||0 };
  });
  const map = {};
  items.forEach(function(it){ map[it.id] = { balance:0, lastClose:null, lastCloseTs:0, todayWithdraw:0, todayReceive:0, dayWithdraw:0, dayReceive:0, prevClose:0, closeBalance:0, sinceWithdraw:0, sinceReceive:0 }; });
 
  const d = T.daily.slice().sort(function(a,b){ return String(b.move_date).localeCompare(String(a.move_date)); });
  const seen = {}, seenPrev = {};
  d.forEach(function(r){
    const id = r.item_id; if(!id || !map[id]) return;
    const dt = r.move_date; if(dt > asOfDate) return;
    if(!seen[id]){ seen[id] = true; map[id].balance = Number(r.balance)||0; map[id].lastClose = dt; map[id].lastCloseTs = sbTsMs(r.created_at); }
    if(dt < asOfDate && !seenPrev[id]){ seenPrev[id] = true; map[id].prevClose = Number(r.balance)||0; }
  });
  items.forEach(function(it){ map[it.id].closeBalance = map[it.id].balance; });
 
  T.wd.forEach(function(r){
    const id = r.item_id; if(!map[id]) return;
    const dt = r.move_date; if(dt > asOfDate) return;
    if(dt === asOfDate) map[id].dayWithdraw += Number(r.qty)||0;
    if(map[id].lastClose){
      if(dt < map[id].lastClose) return;
      if(dt === map[id].lastClose){ if(!map[id].lastCloseTs) return; const ts = sbTsMs(r.created_at); if(!ts || ts <= map[id].lastCloseTs) return; }
    }
    map[id].balance -= Number(r.qty)||0;
    map[id].sinceWithdraw += Number(r.qty)||0;
    if(dt === asOfDate) map[id].todayWithdraw += Number(r.qty)||0;
  });
  T.rc.forEach(function(r){
    const id = r.item_id; if(!map[id]) return;
    const dt = r.move_date; if(dt > asOfDate) return;
    if(dt === asOfDate) map[id].dayReceive += Number(r.qty)||0;
    if(map[id].lastClose){
      if(dt < map[id].lastClose) return;
      if(dt === map[id].lastClose){ if(!map[id].lastCloseTs) return; const ts = sbTsMs(r.created_at); if(!ts || ts <= map[id].lastCloseTs) return; }
    }
    map[id].balance += Number(r.qty)||0;
    map[id].sinceReceive += Number(r.qty)||0;
    if(dt === asOfDate) map[id].todayReceive += Number(r.qty)||0;
  });
 
  const list = items.map(function(it){
    const b = map[it.id];
    return { id:it.id, name:it.name, category:it.category, unit:it.unit, mode:it.mode, minStock:it.minStock, active:it.active,
      balance: Math.round(b.balance*100)/100, lastClose:b.lastClose,
      todayWithdraw: Math.round(b.todayWithdraw*100)/100, todayReceive: Math.round(b.todayReceive*100)/100,
      dayWithdraw: Math.round(b.dayWithdraw*100)/100, dayReceive: Math.round(b.dayReceive*100)/100,
      prevClose: Math.round(b.prevClose*100)/100, order: it.order,
      closeBalance: Math.round(b.closeBalance*100)/100, sinceWithdraw: Math.round(b.sinceWithdraw*100)/100, sinceReceive: Math.round(b.sinceReceive*100)/100,
      lowStock: it.minStock > 0 && b.balance <= it.minStock };
  });
  var CR2 = { Waffle:0, KUFF:1, Drink:2, Other:3, Others:3 };
  list.sort(function(a,b){
    var ra = (CR2[a.category] !== undefined ? CR2[a.category] : 9), rb = (CR2[b.category] !== undefined ? CR2[b.category] : 9);
    if(ra !== rb) return ra - rb;
    if((a.order||0) !== (b.order||0)) return (a.order||0) - (b.order||0);
    return String(a.id||'').localeCompare(String(b.id||''), undefined, { numeric:true });
  });
  return { items:list,
    summary:{ total:list.length, lowStock:list.filter(function(x){return x.lowStock&&x.active;}).length, outOfStock:list.filter(function(x){return x.balance<=0&&x.active;}).length },
    asOfDate:asOfDate };
}
// ===== สูตรกลาง: พยากรณ์สต๊อกรายตัว (ใช้ร่วมกันทุกหน้า + กุยช่าย) =====
// status: out(หมด) / critical(เหลือ≤3วัน) / low(≤จุดสั่งซื้อ หรือ ≤7วัน) / ok
// ===== สูตรกลาง: พยากรณ์สต๊อกรายตัว (ใช้ร่วมกันทุกหน้า + กุยช่าย) =====
// avgDaily = เบิกรวมในหน้าต่าง ÷ "จำนวนวันที่ร้านมีการเบิกจริง" (ไม่ใช่วันปฏิทิน)
// status: out(หมด) / critical(เหลือ≤3วัน) / low(≤7วัน) / ok  — ใช้อัตราเป็นหลัก
function sbStockForecast(T, windowDays){
  windowDays = windowDays || 30;
  const today = sbLocalDate();
  const now = new Date();
  const startW = sbFmtD(new Date(now.getTime() - (windowDays-1)*86400000));
  const balMap = {}; sbComputeBalances(today,'all',T).items.forEach(function(b){ balMap[b.id]=b; });
  const wWin = {}, opSet = {};
  T.wd.forEach(function(r){ const id=r.item_id; if(!id) return; if(r.move_date>=startW && r.move_date<=today){ wWin[id]=(wWin[id]||0)+(Number(r.qty)||0); opSet[r.move_date]=1; } });
  const opDays = Math.max(1, Object.keys(opSet).length);   // วันที่มีการเบิกจริง = ตัวหาร
  const items = {};
  T.items.forEach(function(r){ if(!r.item_id) return; items[r.item_id]={ id:r.item_id, name:r.name, unit:r.unit, category:r.category, minStock:Number(r.min_stock)||0, mode:r.mode||'withdraw', active:r.active!==false }; });
  const list = [];
  Object.keys(items).forEach(function(id){
    const it=items[id]; if(!it.active) return;
    const b = balMap[id] ? balMap[id].balance : 0;
    const avgDaily = Math.round(((wWin[id]||0)/opDays)*100)/100;
    const daysLeft = avgDaily>0 ? Math.floor(b/avgDaily) : null;
    const suggestedMin = avgDaily>0 ? Math.ceil(avgDaily*3) : null;   // ค่าแนะนำ min stock = ใช้ ~3 วัน
    // สถานะหลัก = อัตราใช้/วันเบิกจริง (out / critical≤3วัน / low≤7วัน / ok)
    let status;
    if(b<=0) status='out';
    else if(daysLeft!=null && daysLeft<=3) status='critical';
    else if(daysLeft!=null && daysLeft<=7) status='low';
    else status='ok';
    const belowMin = (it.minStock>0 && b>0 && b<=it.minStock);   // กระดิ่งแยก: ต่ำกว่าจุดเตือนที่ตั้งเอง (ไม่เกี่ยวกับการคำนวณอัตรา)
    list.push({ id:id, name:it.name, unit:it.unit, category:it.category, balance:Math.round(b*100)/100, minStock:it.minStock, mode:it.mode, avgDaily:avgDaily, daysLeft:daysLeft, suggestedMin:suggestedMin, status:status, belowMin:belowMin, opDays:opDays });
  });
  const rank={out:0,critical:1,low:2,ok:3};
  list.sort(function(a,b){
    if(rank[a.status]!==rank[b.status]) return rank[a.status]-rank[b.status];
    var da=a.daysLeft==null?1e9:a.daysLeft, db=b.daysLeft==null?1e9:b.daysLeft;
    if(da!==db) return da-db;
    return a.balance-b.balance;
  });
  return list;
}

async function sbGetStockBalances(p){
  const T = await sbStockTables();
  return sbComputeBalances((p && p.date) || sbFmtD(new Date()), (p && p.category) || 'all', T);
}

async function sbGetHomeDashboard(){
  const now = new Date();
  const today = sbFmtD(now), yesterday = sbFmtD(new Date(now.getTime()-86400000)), start7 = sbFmtD(new Date(now.getTime()-6*86400000));
  const [salesRows, expRows, attRows, staffRows, T] = await Promise.all([
    sbFetch('sales?select=sale_date,total'),
    sbFetch('expenses?select=exp_date,item,amount,created_at'),
    sbFetch('attendance?select=att_date,att_time,type,staff_id,name'),
    sbFetch('staff_safe?select=staff_id,active'),
    sbStockTables()
  ]);

  // 1) ยอดขาย 7 วัน
  const salesByDate = {};
  salesRows.forEach(function(r){ const d=r.sale_date; if(d>=start7&&d<=today) salesByDate[d]=(salesByDate[d]||0)+(Number(r.total)||0); });
  const sales7days = [];
  for(let i=6;i>=0;i--){ const d=sbFmtD(new Date(now.getTime()-i*86400000)); sales7days.push({ date:d, dateDM:sbDM(d), sales:salesByDate[d]||0 }); }
  const salesYesterday = salesByDate[yesterday]||0;
  const nonZero = sales7days.filter(function(d){ return d.sales>0; });
  const salesAvg7 = nonZero.length ? nonZero.reduce(function(a,b){return a+b.sales;},0)/nonZero.length : 0;
  const compareYesterdayPct = salesAvg7>0 ? Math.round((salesYesterday-salesAvg7)/salesAvg7*100) : 0;

  // 2) สต๊อก — ใช้สูตรกลาง sbStockForecast (อัตราใช้/วันเบิกจริง, หน้าต่าง 30 วัน)
  const fc = sbStockForecast(T, 30);
  const activeCount = fc.length;
  const lowItems = fc.filter(function(x){ return x.status==='low' || x.status==='critical'; });
  const outItems = fc.filter(function(x){ return x.status==='out'; });
  const belowMinItems = fc.filter(function(x){ return x.belowMin; });
  const lowStockCount = lowItems.length, outOfStockCount = outItems.length;
  const outOfStockItems = outItems.map(function(x){ return { id:x.id, name:x.name, unit:x.unit }; });
  const criticalForecast = fc.filter(function(x){ return x.status==='critical'; })
    .map(function(x){ return { name:x.name, balance:x.balance, unit:x.unit, avgDaily:x.avgDaily, daysLeft:x.daysLeft }; }).slice(0,5);
  const lowStockList = lowItems.map(function(x){ return { name:x.name, balance:x.balance, unit:x.unit, minStock:x.minStock, avgDaily:x.avgDaily, daysLeft:x.daysLeft, suggestedMin:x.suggestedMin, status:x.status }; });
  const belowMinList = belowMinItems.map(function(x){ return { name:x.name, balance:x.balance, unit:x.unit, minStock:x.minStock }; });
 
  // 3) เข้างานวันนี้
  const inMap={}, outMap={};
  attRows.forEach(function(r){ if(r.att_date!==today) return; const id=r.staff_id, tm=sbFmtTime(r.att_time);
    if(r.type==='in'){ if(!inMap[id]||tm<inMap[id].time) inMap[id]={name:r.name,time:tm}; }
    else if(r.type==='out'){ if(!outMap[id]||tm>outMap[id].time) outMap[id]={name:r.name,time:tm}; } });
  const checkedIn=Object.keys(inMap).length, checkedOut=Object.keys(outMap).length;
  const present=Object.keys(inMap).filter(function(id){ return !outMap[id]; }).map(function(id){ return inMap[id]; });
  const totalStaff = staffRows.filter(function(r){ return r.staff_id && r.active!==false; }).length;
 
  // 4) ค่าใช้จ่ายวันนี้
  let expensesToday=0, expensesTodayCount=0;
  expRows.forEach(function(r){ if(r.exp_date===today){ expensesToday+=Number(r.amount)||0; expensesTodayCount++; } });
 
  // 5) ฟีดกิจกรรมวันนี้ (10 อันล่าสุด)
  const activities=[];
  attRows.forEach(function(r){ if(r.att_date!==today) return; const tm=sbFmtTime(r.att_time);
    activities.push({ time:tm, type:r.type==='in'?'attend_in':'attend_out', icon:r.type==='in'?'🟢':'🔴',
      text:r.name+' '+(r.type==='in'?'เช็คอิน':'เช็คเอาท์'), color:r.type==='in'?'#15803D':'#B91C1C', ts:today+' '+tm }); });
  T.wd.forEach(function(r){ if(r.move_date!==today) return; const tm=sbFmtTime(r.move_time);
    activities.push({ time:tm, type:'withdraw', icon:'📤', text:'เบิก '+r.item_name+' x'+r.qty, color:'#155E38', ts:today+' '+tm }); });
  T.rc.forEach(function(r){ if(r.move_date!==today) return; const tm=sbFmtTime(r.created_at);
    activities.push({ time:tm, type:'receive', icon:'📥', text:'รับเข้า '+r.item_name+' x'+r.qty, color:'#15803D', ts:today+' '+(tm||'z') }); });
  expRows.forEach(function(r){ if(r.exp_date!==today) return; const tm=sbFmtTime(r.created_at);
    activities.push({ time:tm, type:'expense', icon:'🧾', text:'จ่าย '+(r.item||'-')+' ฿'+Math.round(Number(r.amount)||0).toLocaleString('en-US'), color:'#6D28D9', ts:today+' '+(tm||'z') }); });
  activities.sort(function(a,b){ return b.ts.localeCompare(a.ts); });
 
  return {
    today:today, yesterday:yesterday,
    sales:{ yesterday:salesYesterday, avg7:Math.round(salesAvg7), sales7days:sales7days, compareYesterdayPct:compareYesterdayPct },
    stock:{ total:activeCount, lowStock:lowStockCount, outOfStock:outOfStockCount, belowMin:belowMinItems.length, outOfStockItems:outOfStockItems.slice(0,5), criticalForecast:criticalForecast, lowStockList:lowStockList, belowMinList:belowMinList, forecast:fc },
    attendance:{ total:totalStaff, checkedIn:checkedIn, checkedOut:checkedOut, present:present },
    expenses:{ todayTotal:expensesToday, todayCount:expensesTodayCount },
    activities:activities.slice(0,10)
  };
}
function sbDateTimeDM(v){
  if(!v) return '';
  const d = new Date(v); if(isNaN(d.getTime())) return '';
  const p = function(n){ return ('0'+n).slice(-2); };
  return p(d.getDate()) + '/' + p(d.getMonth()+1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
 
async function sbGetExpensesReport(p){
  const start = p.start || '0000-01-01', end = p.end || '9999-12-31', type = p.type || 'all';
  const [expRows, salesRows] = await Promise.all([
    sbFetch('expenses?select=exp_date,item,amount,receipt_url,type,created_at'),
    sbFetch('sales?select=sale_date,total')
  ]);
  const items = []; let total = 0, posTotal = 0, bizTotal = 0, totalExpAll = 0;
  expRows.forEach(function(r){
    const d = r.exp_date; if(d < start || d > end) return;
    const t = r.type || 'pos';
    totalExpAll += Number(r.amount) || 0;
    if(type !== 'all' && t !== type) return;
    const amt = Number(r.amount) || 0;
    items.push({ date:d, dateDM:sbDM(d), item:r.item || '', amount:amt, url:r.receipt_url || '', type:t, ts:sbDateTimeDM(r.created_at) });
    total += amt; if(t === 'biz') bizTotal += amt; else posTotal += amt;
  });
  items.sort(function(a,b){ return b.date.localeCompare(a.date); });
  let totalSales = 0, daysWithSales = 0;
  salesRows.forEach(function(r){ const d = r.sale_date; if(d < start || d > end) return; const t = Number(r.total)||0; if(t > 0){ totalSales += t; daysWithSales++; } });
  const sD = new Date(start+'T00:00:00'), eD = new Date(end+'T00:00:00');
  const daysInRange = Math.max(1, Math.round((eD - sD)/86400000) + 1);
  return { items:items,
    summary:{ count:items.length, total:total, byType:{ pos:posTotal, biz:bizTotal } },
    sales:{ total:totalSales, daysWithSales:daysWithSales, daysInRange:daysInRange, totalExpenseAll:totalExpAll } };
}
 
async function sbGetActivityFeed(p){
  const start = p.start || sbFmtD(new Date()), end = p.end || start;
  const inR = function(d){ return d >= start && d <= end; };
  const [att, wd, rc, dl, exp, audit, sales] = await Promise.all([
    sbFetch('attendance?select=att_date,att_time,type,name,in_geofence,distance'),
    sbFetch('stock_withdraw?select=move_date,move_time,item_name,qty,recorded_by'),
    sbFetch('stock_receive?select=move_date,item_name,qty,recorded_by,created_at'),
    sbFetchAll('stock_daily?select=move_date,closed_by,created_at&order=move_date.asc'),
    sbFetch('expenses?select=exp_date,item,amount,type,created_at'),
    sbFetch('stock_audit?select=audit_date,auditor,diff,created_at'),
    sbFetch('sales?select=sale_date,total,created_at')
  ]);
  const A = [];
  att.forEach(function(r){ if(!inR(r.att_date)) return; const d=r.att_date, tm=sbFmtTime(r.att_time);
    A.push({ date:d, dateDM:sbDM(d), time:tm, type:r.type==='in'?'attend_in':'attend_out', icon:r.type==='in'?'🟢':'🔴',
      title:r.name+' '+(r.type==='in'?'เช็คอิน':'เช็คเอาท์'),
      detail:(r.in_geofence!==false?'✓ ในเขต':'⚠️ นอกเขต '+Math.round(Number(r.distance)||0)+'m'),
      color:r.type==='in'?'#15803D':'#B91C1C', ts:d+' '+tm }); });
  wd.forEach(function(r){ if(!inR(r.move_date)) return; const d=r.move_date, tm=sbFmtTime(r.move_time);
    A.push({ date:d, dateDM:sbDM(d), time:tm, type:'withdraw', icon:'📤', title:'เบิก '+r.item_name+' x'+r.qty, detail:'โดย '+(r.recorded_by||'-'), color:'#155E38', ts:d+' '+tm }); });
  rc.forEach(function(r){ if(!inR(r.move_date)) return; const d=r.move_date, tm=sbFmtTime(r.created_at);
    A.push({ date:d, dateDM:sbDM(d), time:tm, type:'receive', icon:'📥', title:'รับเข้า '+r.item_name+' x'+r.qty, detail:'โดย '+(r.recorded_by||'-'), color:'#15803D', ts:d+' '+(tm||'z') }); });
  const closed = {};
  dl.forEach(function(r){ if(!inR(r.move_date)) return; const d=r.move_date, key=d+'|'+(r.closed_by||''); if(closed[key]) return; closed[key]=true; const tm=sbFmtTime(r.created_at);
    A.push({ date:d, dateDM:sbDM(d), time:tm, type:'close', icon:'🌙', title:'ปิดร้าน', detail:'โดย '+(r.closed_by||'-'), color:'#1E40AF', ts:d+' '+(tm||'y') }); });
  const ab = {};
  audit.forEach(function(r){ if(!inR(r.audit_date)) return; const d=r.audit_date, ts=sbTsMs(r.created_at), key=d+'|'+ts;
    if(!ab[key]) ab[key]={ d:d, tsRaw:r.created_at, staff:(r.auditor||'-'), count:0, diff:0 }; ab[key].count++; if(Math.abs(Number(r.diff)||0)>0.01) ab[key].diff++; });
  Object.keys(ab).forEach(function(k){ const b=ab[k], tm=sbFmtTime(b.tsRaw);
    A.push({ date:b.d, dateDM:sbDM(b.d), time:tm, type:'audit', icon:'🔍',
      title:'ออดิทสต๊อก'+(b.diff>0?' · ส่วนต่าง '+b.diff+' รายการ':' · ตรงทั้งหมด'),
      detail:'โดย '+b.staff+' · ตรวจ '+b.count+' รายการ', color:'#7C3AED', ts:b.d+' '+(tm||'y') }); });
  exp.forEach(function(r){ if(!inR(r.exp_date)) return; const d=r.exp_date, tm=sbFmtTime(r.created_at);
    A.push({ date:d, dateDM:sbDM(d), time:tm, type:'expense', icon:'🧾',
      title:'จ่าย '+(r.item||'-')+' ฿'+Math.round(Number(r.amount)||0).toLocaleString('en-US'),
      detail:r.type==='biz'?'ค่าใช้จ่ายร้าน':'ค่าวัตถุดิบ', color:'#6D28D9', ts:d+' '+(tm||'z') }); });
  sales.forEach(function(r){ if(!inR(r.sale_date)) return; const d=r.sale_date, tot=Number(r.total)||0; if(tot<=0) return; const tm=sbFmtTime(r.created_at);
    A.push({ date:d, dateDM:sbDM(d), time:tm, type:'sales', icon:'💰', title:'บันทึกยอดขายวันนี้', detail:'฿'+Math.round(tot).toLocaleString('en-US'), color:'#15803D', ts:d+' '+(tm||'y') }); });
  A.sort(function(a,b){ return b.ts.localeCompare(a.ts); });
  return { range:{ start:start, end:end }, activities:A, count:A.length };
}

async function sbGetStockItems(p){
  const rows = await sbFetch('stock_items?select=*');
  const items = rows.filter(function(r){ return r.item_id; }).map(function(r){
    return { id:r.item_id, name:r.name, category:r.category, unit:r.unit, minStock:Number(r.min_stock)||0,
             order:Number(r.sort_order)||0, mode:r.mode||'withdraw', active:r.active!==false };
  });
  const cat = p && p.category;
  const filtered = (cat && cat !== 'all') ? items.filter(function(x){ return x.category === cat; }) : items;
  var CR = { Waffle:0, KUFF:1, Drink:2, Other:3, Others:3 };
  filtered.sort(function(a,b){
    var ra = (CR[a.category] !== undefined ? CR[a.category] : 9), rb = (CR[b.category] !== undefined ? CR[b.category] : 9);
    if(ra !== rb) return ra - rb;
    if((a.order||0) !== (b.order||0)) return (a.order||0) - (b.order||0);
    return String(a.id||'').localeCompare(String(b.id||''), undefined, { numeric:true });
  });
  return { items:filtered };
}
 
async function sbGetStockDashboard(p){
  const start = (p && p.start) || '0000-01-01', end = (p && p.end) || '9999-12-31';
  const T = await sbStockTables();
  const itemsMap = {};
  T.items.filter(function(r){ return r.item_id; }).forEach(function(r){
    itemsMap[r.item_id] = { id:r.item_id, name:r.name, category:r.category, unit:r.unit, minStock:Number(r.min_stock)||0, mode:r.mode||'withdraw', active:r.active!==false };
  });
  const balanceMap = {}; sbComputeBalances(end,'all',T).items.forEach(function(it){ balanceMap[it.id]=it; });
  const inR = function(d){ return d>=start && d<=end; };
  const startD = new Date(start+'T00:00:00'), endD = new Date(end+'T00:00:00');
  const days = Math.max(1, Math.round((endD-startD)/86400000)+1);
  const stats = {}; function ensure(id){ if(!stats[id]) stats[id]={id:id,wdQty:0,wdTx:0,rcQty:0,rcTx:0,wasted:0,lastMove:''}; return stats[id]; }
  let totalWdTx=0, totalWdQty=0; const wdByDate={}, wdByDow=[0,0,0,0,0,0,0];
  T.wd.forEach(function(r){ if(!inR(r.move_date)) return; const id=r.item_id; if(!id) return; const qty=Number(r.qty)||0; const s=ensure(id); s.wdQty+=qty; s.wdTx++; totalWdTx++; totalWdQty+=qty; const dStr=r.move_date; wdByDate[dStr]=(wdByDate[dStr]||0)+qty; wdByDow[new Date(dStr+'T00:00:00').getDay()]++; if(dStr>s.lastMove) s.lastMove=dStr; });
  let totalRcTx=0, totalRcQty=0; const rcByDate={};
  T.rc.forEach(function(r){ if(!inR(r.move_date)) return; const id=r.item_id; if(!id) return; const qty=Number(r.qty)||0; const s=ensure(id); s.rcQty+=qty; s.rcTx++; totalRcTx++; totalRcQty+=qty; const dStr=r.move_date; rcByDate[dStr]=(rcByDate[dStr]||0)+qty; if(dStr>s.lastMove) s.lastMove=dStr; });
  let totalWasted=0;
  T.daily.forEach(function(r){ if(!inR(r.move_date)) return; const id=r.item_id; if(!id) return; const waste=Number(r.waste)||0; if(waste>0){ ensure(id).wasted+=waste; totalWasted+=waste; } });
  const allStats = Object.keys(stats).map(function(id){ const it=itemsMap[id]||{name:id,unit:'',category:''}; const bal=balanceMap[id]||{balance:0,lowStock:false}; return Object.assign({}, stats[id], { name:it.name, unit:it.unit, category:it.category, balance:bal.balance, lowStock:bal.lowStock }); });
  const topWithdrawn = allStats.filter(function(s){return s.wdQty>0;}).sort(function(a,b){return b.wdQty-a.wdQty;}).slice(0,10);
  const topReceived = allStats.filter(function(s){return s.rcQty>0;}).sort(function(a,b){return b.rcQty-a.rcQty;}).slice(0,10);
  const topWasted = allStats.filter(function(s){return s.wasted>0;}).sort(function(a,b){return b.wasted-a.wasted;}).slice(0,10);
  const movedIds={}; Object.keys(stats).forEach(function(id){ movedIds[id]=true; });
  const deadStock = Object.keys(itemsMap).filter(function(id){ return itemsMap[id].active!==false && !movedIds[id]; }).map(function(id){ const it=itemsMap[id]; const bal=balanceMap[id]||{balance:0}; return {id:id,name:it.name,unit:it.unit,category:it.category,balance:bal.balance}; }).filter(function(x){return x.balance>0;}).sort(function(a,b){return b.balance-a.balance;}).slice(0,10);
  const forecast = sbStockForecast(T, 30).filter(function(x){ return x.status==='critical' || x.status==='low'; }).slice(0,15);
  const allDates={}; Object.keys(wdByDate).forEach(function(d){allDates[d]=true;}); Object.keys(rcByDate).forEach(function(d){allDates[d]=true;});
  const dailyMovement = Object.keys(allDates).sort().map(function(d){ return { date:d, dateDM:sbDM(d), withdraws:wdByDate[d]||0, receives:rcByDate[d]||0 }; });
  const dowNames=['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
  const weekdayPattern = wdByDow.map(function(count,i){ return {dow:dowNames[i], count:count}; });
  let activeItems=0, lowStockItems=0, outOfStockItems=0;
  Object.keys(itemsMap).forEach(function(id){ if(itemsMap[id].active===false) return; activeItems++; const bal=balanceMap[id]; if(bal){ if(bal.balance<=0) outOfStockItems++; else if(bal.lowStock) lowStockItems++; } });
  return { range:{start:start,end:end,days:days},
    summary:{ totalWdTx:totalWdTx, totalWdQty:Math.round(totalWdQty*100)/100, totalRcTx:totalRcTx, totalRcQty:Math.round(totalRcQty*100)/100, totalWasted:Math.round(totalWasted*100)/100, activeItems:activeItems, movedItems:Object.keys(stats).length, deadItems:deadStock.length, lowStockItems:lowStockItems, outOfStockItems:outOfStockItems, avgWdPerDay:Math.round(totalWdTx/days*10)/10 },
    topWithdrawn:topWithdrawn, topReceived:topReceived, topWasted:topWasted, deadStock:deadStock, forecast:forecast, dailyMovement:dailyMovement, weekdayPattern:weekdayPattern };
}

async function sbGetAttendStaff(p){
  const rows = await sbFetch('staff_safe?select=*');
  const list = rows.filter(function(r){ return r.staff_id; }).map(function(r){
    return { id:r.staff_id, name:r.name, nickname:r.nickname, position:r.position, branch:r.branch,
             hasFace:!!r.has_face, active:r.active!==false, type:r.emp_type||'', startDate:r.start_date||'' };
  });
  const includeInactive = p && p.includeInactive;
  return { staff: includeInactive ? list : list.filter(function(x){ return x.active; }) };
}
 
async function sbGetAttendReport(p){
  const start = (p && p.start) || '0000-01-01', end = (p && p.end) || '9999-12-31';
  const staffId = p && p.staffId, type = p && p.type;
  const rows = await sbFetch('attendance?select=att_date,att_time,type,staff_id,name,branch,lat,lng,address,photo_url,in_geofence,distance,note&order=att_date.desc');
  const logs = [];
  rows.forEach(function(r){
    const d = r.att_date; if(d < start || d > end) return;
    if(staffId && r.staff_id !== staffId) return;
    if(type && type !== 'all' && r.type !== type) return;
    logs.push({ date:d, dateDM:sbDM(d), time:sbFmtTime(r.att_time), type:r.type,
      staffId:r.staff_id, staff:r.name, branch:r.branch,
      lat:Number(r.lat)||0, lng:Number(r.lng)||0, address:r.address,
      imgUrl:r.photo_url, inGeofence:r.in_geofence!==false, distance:Number(r.distance)||0, note:r.note });
  });
  logs.sort(function(a,b){ const k=b.date.localeCompare(a.date); return k!==0?k:String(b.time).localeCompare(String(a.time)); });
  return { logs:logs, summary:{ count:logs.length, inCount:logs.filter(function(x){return x.type==='in';}).length, outCount:logs.filter(function(x){return x.type==='out';}).length } };
}

async function sbGetConfig(){
  return { channels: SB_CH, today: sbFmtD(new Date()) };
}
 
async function sbGetDailyReport(p){
  const date = p.date;
  const [salesRows, expRows] = await Promise.all([
    sbFetch('sales?select=*&sale_date=eq.' + encodeURIComponent(date) + '&limit=1'),
    sbFetch('expenses?select=exp_date,item,amount,receipt_url,type&exp_date=eq.' + encodeURIComponent(date))
  ]);
  let sale = null;
  if(salesRows.length){
    const v = salesRows[0]; sale = {};
    SB_CH.forEach(function(c){ sale[c.key] = v[c.key]; });
    sale.openingCash = v.cash_open; sale.cashIn = v.cash_in; sale.refund = v.refund;
    sale.actualCash = v.cash_actual; sale.closeStaff = v.closed_by; sale.note = v.note;
  }
  const expenses = [];
  expRows.forEach(function(r){ if((r.type||'pos')==='pos') expenses.push({ item:r.item, amount:r.amount, existingUrl:r.receipt_url }); });
  return { date:date, sales:sale, expenses:expenses };
}
 
async function sbSuggestMinStock(p){
  const lookbackDays = (p && Number(p.lookbackDays)) || 7;
  const bufferDays = (p && Number(p.bufferDays)) || 3;
  const T = await sbStockTables();
  const items = T.items.filter(function(r){ return r.item_id; }).map(function(r){ return { id:r.item_id }; });
  const today = new Date(), startD = new Date(today); startD.setDate(startD.getDate() - (lookbackDays - 1));
  const startStr = sbFmtD(startD), todayStr = sbFmtD(today);
  const usedSum={}, usedDays={}, wdSum={}, wdDays={};
  items.forEach(function(it){ usedSum[it.id]=0; usedDays[it.id]={}; wdSum[it.id]=0; wdDays[it.id]={}; });
  T.daily.forEach(function(r){ const dt=r.move_date; if(dt<startStr||dt>todayStr) return; const id=r.item_id; if(!usedSum.hasOwnProperty(id)) return; const u=Number(r.used)||0; if(u>0){ usedSum[id]+=u; usedDays[id][dt]=1; } });
  T.wd.forEach(function(r){ const dt=r.move_date; if(dt<startStr||dt>todayStr) return; const id=r.item_id; if(!wdSum.hasOwnProperty(id)) return; const q=Number(r.qty)||0; if(q>0){ wdSum[id]+=q; wdDays[id][dt]=1; } });
  const suggestions={}, detail={};
  items.forEach(function(it){
    let base, nDays, src;
    if(usedSum[it.id]>0){ base=usedSum[it.id]; nDays=Math.max(1,Object.keys(usedDays[it.id]).length); src='used'; }
    else { base=wdSum[it.id]; nDays=Math.max(1,Object.keys(wdDays[it.id]).length); src='withdraw'; }
    const avgDaily=base/nDays;
    suggestions[it.id]=Math.ceil(avgDaily*bufferDays);
    detail[it.id]={ avgDaily:Math.round(avgDaily*100)/100, src:src, nDays:nDays };
  });
  return { suggestions:suggestions, detail:detail, lookbackDays:lookbackDays, bufferDays:bufferDays };
}
 
async function sbGetStockAuditHistory(p){
  const start = p && p.start, end = p && p.end;
  const rows = await sbFetch('stock_audit?select=audit_date,branch,auditor,item_id,item_name,system_qty,actual_qty,diff,reason,adjusted,created_at');
  const records = [];
  rows.forEach(function(r){
    if(!r.item_id) return;
    const d = r.audit_date; if(start && d < start) return; if(end && d > end) return;
    const ts = sbTsMs(r.created_at);
    records.push({ date:d, dateDM:sbDM(d), time:sbFmtTime(r.created_at), session:d+'|'+ts,
      staff:r.auditor||'-', id:r.item_id, name:r.item_name,
      system:Number(r.system_qty)||0, actual:Number(r.actual_qty)||0, diff:Number(r.diff)||0,
      reason:r.reason||'', adjusted:(r.adjusted===true) });
  });
  records.sort(function(a,b){ return a.session<b.session?1:(a.session>b.session?-1:0); });
  return { records:records };
}

// ---- เครื่องมือเขียน Supabase (insert + อัปรูปขึ้น Storage) ----
function sbB64ToBlob(b64, mime){
  const bin = atob(b64), len = bin.length, arr = new Uint8Array(len);
  for(let i=0;i<len;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'image/jpeg' });
}
async function sbUploadImage(bucket, receipt){
  if(!receipt || !receipt.base64) return '';
  const isPng = String(receipt.mime||'').indexOf('png') >= 0;
  const path = Date.now() + '_' + Math.random().toString(36).slice(2,8) + (isPng ? '.png' : '.jpg');
  const res = await fetch(SB_URL + '/storage/v1/object/' + bucket + '/' + path, {
    method:'POST',
    headers:{ apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY, 'Content-Type': receipt.mime || 'image/jpeg' },
    body: sbB64ToBlob(receipt.base64, receipt.mime)
  });
  if(!res.ok) throw new Error('อัปรูปไม่สำเร็จ (' + res.status + '): ' + (await res.text()).slice(0,150));
  return SB_URL + '/storage/v1/object/public/' + bucket + '/' + path;   // ลิงก์รูปสาธารณะ
}
async function sbInsert(table, row){
  const res = await fetch(SB_URL + '/rest/v1/' + table, {
    method:'POST',
    headers:{ apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY, 'Content-Type':'application/json', Prefer:'return=minimal' },
    body: JSON.stringify(row)
  });
  if(res.ok) return { ok:true };
  return { ok:false, error:'บันทึกไม่สำเร็จ (' + res.status + '): ' + (await res.text()).slice(0,150) };
}
 
async function sbAddBusinessExpense(p){
  const data = (p && p.data) || {};
  if(!data.date || !(Number(data.amount) > 0)) return { ok:false, error:'กรอกวันที่และยอดเงินให้ครบ' };
  let url = data.existingUrl || '';
  try{ if(data.receipt && data.receipt.base64) url = await sbUploadImage('receipts', data.receipt); }
  catch(e){ return { ok:false, error: String(e.message || e) }; }
  const row = { exp_date:data.date, item:data.item || '', amount:Number(data.amount) || 0,
                receipt_url:url, type:'biz', created_at:new Date().toISOString() };
  const res = await sbInsert('expenses', row);
  if(!res.ok) return res;
  return { ok:true, msg:'บันทึกค่าใช้จ่าย ✓', url:url };
}
// ========== เครื่องมือเขียนเพิ่ม: สต๊อก + เข้างาน (ย้ายจาก Apps Script) ==========
const SB_STOCK_BRANCH = 'Pantip Ngamwongwan';                 // ร้านเดียว — ใช้ค่านี้กับทุกการบันทึกสต๊อก
const SB_CAT_PREFIX   = { Waffle:'W', KUFF:'K', Drink:'D', Other:'O', Others:'O' };

function sbLocalDate(){ return sbFmtD(new Date()); }
function sbLocalTime(){ const d=new Date(); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2); }
async function sbItemsRaw(){ return sbFetch('stock_items?select=*'); }
function sbNameMap(rows){ const m={}; (rows||[]).forEach(function(r){ if(r.item_id) m[r.item_id]=r.name; }); return m; }

// ---- PATCH/DELETE helper (PostgREST) ----
async function sbPatch(table, query, row){
  const res = await fetch(SB_URL + '/rest/v1/' + table + '?' + query, {
    method:'PATCH',
    headers:{ apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY, 'Content-Type':'application/json', Prefer:'return=minimal' },
    body: JSON.stringify(row)
  });
  if(res.ok) return { ok:true };
  return { ok:false, error:'อัปเดตไม่สำเร็จ (' + res.status + '): ' + (await res.text()).slice(0,150) };
}
async function sbDelete(table, query){
  const res = await fetch(SB_URL + '/rest/v1/' + table + '?' + query, {
    method:'DELETE',
    headers:{ apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY, Prefer:'return=minimal' }
  });
  if(res.ok) return { ok:true };
  return { ok:false, error:'ลบไม่สำเร็จ (' + res.status + '): ' + (await res.text()).slice(0,150) };
}

// ---- เบิกของ ----
async function sbAddStockWithdraw(p){
  const data = (p && p.data) || {}, staff = (data.staff||'').trim(), items = data.items || [];
  if(!staff) return { ok:false, error:'กรุณากรอกชื่อผู้บันทึก' };
  if(!items.length) return { ok:false, error:'ยังไม่ได้เลือกรายการ' };
  const nm = sbNameMap(await sbItemsRaw()), today = sbLocalDate(), now = new Date().toISOString();
  const tm = sbLocalTime();
  const rows = items.map(function(it){ return { move_date:today, move_time:tm, branch:SB_STOCK_BRANCH, recorded_by:staff,
    item_id:it.id, item_name:nm[it.id]||'', qty:Number(it.amount)||0, note:null, created_at:now }; });
  const res = await sbInsert('stock_withdraw', rows);
  if(!res.ok) return res;
  return { ok:true, msg:'บันทึกเบิก ' + rows.length + ' รายการ ✓' };
}

// ---- รับเข้า (แนบบิลได้) ----
async function sbAddStockReceive(p){
  const data = (p && p.data) || {}, staff = (data.staff||'').trim(), items = data.items || [];
  if(!staff) return { ok:false, error:'กรุณากรอกชื่อผู้บันทึก' };
  if(!items.length) return { ok:false, error:'ยังไม่ได้เลือกรายการ' };
  let url = '';
  try{ if(data.receipt && data.receipt.base64) url = await sbUploadImage('receipts', data.receipt); }
  catch(e){ return { ok:false, error:String(e.message || e) }; }
  const nm = sbNameMap(await sbItemsRaw()), today = sbLocalDate(), now = new Date().toISOString();
  const rows = items.map(function(it){ return { move_date:today, branch:SB_STOCK_BRANCH, recorded_by:staff,
    item_id:it.id, item_name:nm[it.id]||'', qty:Number(it.amount)||0, receipt_url:url||null, note:null, created_at:now }; });
  const res = await sbInsert('stock_receive', rows);
  if(!res.ok) return res;
  return { ok:true, msg:'บันทึกรับเข้า ' + rows.length + ' รายการ ✓', url:url };
}

// ---- ปิดรอบสต๊อกสิ้นวัน (สูตรตรงกับหน้า stock-close) ----
async function sbCloseDailyStock(p){
  const data = (p && p.data) || {}, staff = (data.staff||'').trim();
  if(!staff) return { ok:false, error:'กรุณากรอกชื่อผู้ปิดรอบ' };
  const wastes = data.wastes || {}, closings = data.closings || {};
  const T = await sbStockTables();
  const today = sbLocalDate(), now = new Date().toISOString();
  const bal = sbComputeBalances(today, 'all', T);                 // ได้ prevClose/dayReceive/dayWithdraw ต่อรายการ
  const nm = sbNameMap(T.items);
  const autoWdRows = [];   // เบิกอัตโนมัติจาก diff (ใช้จริง > ที่คีย์เบิก)
  const tmNow = sbLocalTime();
  const rows = bal.items.filter(function(it){ return it.active !== false; }).map(function(it){
    const open  = Number(it.closeBalance) || 0;            // ยอดปิดล่าสุด (รวมการนับจริง)
    const recv  = Number(it.sinceReceive) || 0;            // รับเข้าหลังปิดล่าสุด
    const used  = Number(it.sinceWithdraw) || 0;           // เบิกหลังปิดล่าสุด
    const waste = parseFloat(wastes[it.id]) || 0;
    const autoClosing = Math.round((open + recv - used - waste) * 100) / 100;
    const hasInput = (closings[it.id] !== undefined && closings[it.id] !== '');
    const closeBal = hasInput ? (parseFloat(closings[it.id]) || 0) : autoClosing;
    const actUse = Math.round((open + recv - closeBal - waste) * 100) / 100;   // ใช้จริงโดยนัย
    const diff   = Math.round((actUse - used) * 100) / 100;
    let wTotal = used, dShown = diff;
    // ของนับชิ้น (ไม่ใช่ชั่งกรัม) ถ้าใช้จริงมากกว่าที่คีย์เบิก → สร้างรายการเบิกอัตโนมัติตามส่วนต่าง
    if((it.mode || 'withdraw') !== 'count' && diff > 0.001){
      autoWdRows.push({ move_date:today, move_time:tmNow, branch:SB_STOCK_BRANCH, recorded_by:staff,
        item_id:it.id, item_name:nm[it.id]||it.name||'', qty:Math.round(diff*100)/100,
        note:'เบิกอัตโนมัติจากการนับปิดรอบ', created_at:now });
      wTotal = actUse; dShown = 0;   // ตอนนี้ที่คีย์เบิก = ใช้จริงแล้ว
    }
    return { move_date:today, branch:SB_STOCK_BRANCH, closed_by:staff, item_id:it.id, item_name:nm[it.id]||it.name||'',
      open_qty:open, receive_total:recv, withdraw_total:wTotal, waste:waste, balance:closeBal, used:actUse, diff:dShown,
      mode:it.mode || 'withdraw', note:(data.note||'')||null, created_at:now };
  });
  if(!rows.length) return { ok:false, error:'ไม่มีรายการให้ปิดรอบ' };
  // บันทึกรายการเบิกอัตโนมัติก่อน (timestamp เดียวกับตอนปิด → ไม่ถูกนับซ้ำหลังปิดรอบ)
  if(autoWdRows.length){ const rw = await sbInsert('stock_withdraw', autoWdRows); if(!rw.ok) return rw; }
  const res = await sbInsert('stock_daily', rows);
  if(!res.ok) return res;
  var lineOk = false;
  try{
    var itemsArr = (T.items||[]).map(function(it){ return { id:it.item_id, name:it.name, category:it.category, unit:it.unit, minStock:Number(it.min_stock)||0, active:it.active!==false }; });
    var lr = await maruNotifyLine([ maruBuildStockFlex(today, SB_STOCK_BRANCH, staff, itemsArr, rows) ]);
    lineOk = !!(lr && lr.ok);
  }catch(e){}
  return { ok:true, msg:'ปิดรอบแล้ว ' + rows.length + ' รายการ ✓' + (autoWdRows.length ? (' · คีย์เบิกอัตโนมัติ ' + autoWdRows.length + ' รายการ') : '') + (lineOk ? ' · ส่ง LINE แล้ว' : '') };
}

// ---- ออดิทตรวจนับ + ปรับยอด ----
async function sbAddStockAudit(p){
  const data = (p && p.data) || {}, staff = (data.staff||'').trim(), items = data.items || [];
  if(!staff) return { ok:false, error:'กรุณากรอกชื่อผู้ตรวจนับ' };
  if(!items.length) return { ok:false, error:'ยังไม่ได้กรอกนับจริง' };
  const T = await sbStockTables();
  const today = sbLocalDate(), now = new Date().toISOString();
  const balMap = {}; sbComputeBalances(today, 'all', T).items.forEach(function(x){ balMap[x.id] = x; });
  const nm = sbNameMap(T.items);
  const auditRows = [], wdRows = [], rcRows = [];
  items.forEach(function(it){
    const sys = balMap[it.id] ? Number(balMap[it.id].balance) || 0 : 0;
    const act = Number(it.actualCount) || 0;
    const diff = Math.round((act - sys) * 100) / 100;
    auditRows.push({ audit_date:today, branch:SB_STOCK_BRANCH, auditor:staff, item_id:it.id, item_name:nm[it.id]||'',
      system_qty:sys, actual_qty:act, diff:diff, reason:(it.reason||'')||null, adjusted:!!it.adjust, created_at:now });
    // ปรับยอด: เขียน movement แก้ต่างให้คงเหลือเท่าที่นับจริง (sbComputeBalances อ่านจาก withdraw/receive)
    if(it.adjust && Math.abs(diff) > 0.001){
      const note = 'ปรับยอดจากออดิท' + (it.reason ? (' · ' + it.reason) : '');
      if(diff > 0) rcRows.push({ move_date:today, branch:SB_STOCK_BRANCH, recorded_by:staff, item_id:it.id, item_name:nm[it.id]||'', qty:diff, receipt_url:null, note:note, created_at:now });
      else         wdRows.push({ move_date:today, move_time:sbLocalTime(), branch:SB_STOCK_BRANCH, recorded_by:staff, item_id:it.id, item_name:nm[it.id]||'', qty:Math.abs(diff), note:note, created_at:now });
    }
  });
  const r1 = await sbInsert('stock_audit', auditRows);
  if(!r1.ok) return r1;
  if(rcRows.length){ const r = await sbInsert('stock_receive', rcRows); if(!r.ok) return r; }
  if(wdRows.length){ const r = await sbInsert('stock_withdraw', wdRows); if(!r.ok) return r; }
  const adj = rcRows.length + wdRows.length;
  try{ await maruNotifyLine([ maruBuildAuditFlex(today, SB_STOCK_BRANCH, staff, auditRows, adj) ]); }catch(e){}
  return { ok:true, msg:'บันทึกออดิท ' + auditRows.length + ' รายการ ✓' + (adj ? (' · ปรับยอด ' + adj) : '') };
}

// ---- แก้รายการสินค้า ----
async function sbSaveStockItem(p){
  const d = (p && p.data) || {};
  if(!d.id) return { ok:false, error:'ไม่พบรหัสรายการ' };
  const row = {};
  if(d.name !== undefined) row.name = d.name;
  if(d.category !== undefined) row.category = d.category;
  if(d.unit !== undefined) row.unit = d.unit;
  if(d.mode !== undefined) row.mode = d.mode;
  if(d.minStock !== undefined) row.min_stock = Number(d.minStock) || 0;
  if(d.active !== undefined) row.active = !!d.active;
  row.edited_at = new Date().toISOString();
  const res = await sbPatch('stock_items', 'item_id=eq.' + encodeURIComponent(d.id), row);
  if(!res.ok) return res;
  return { ok:true, msg:'บันทึกรายการแล้ว ✓' };
}

// ---- เพิ่มรายการสินค้าใหม่ (สร้าง item_id + sort_order อัตโนมัติ) ----
async function sbAddStockItem(p){
  const d = (p && p.data) || {};
  if(!d.name) return { ok:false, error:'กรุณากรอกชื่อรายการ' };
  const rows = await sbItemsRaw();
  const prefix = SB_CAT_PREFIX[d.category] || (String(d.category||'X').match(/[A-Za-z]/) ? String(d.category).match(/[A-Za-z]/)[0].toUpperCase() : 'X');
  let maxNum = 0, maxSort = 0;
  rows.forEach(function(r){
    if(r.item_id && r.item_id.indexOf(prefix) === 0){ const n = parseInt(String(r.item_id).slice(prefix.length), 10); if(!isNaN(n) && n > maxNum) maxNum = n; }
    const s = Number(r.sort_order) || 0; if(s > maxSort) maxSort = s;
  });
  const newId = prefix + ('00' + (maxNum + 1)).slice(-3);
  const row = { item_id:newId, name:d.name, category:d.category || 'Other', unit:d.unit || '',
    min_stock:Number(d.minStock) || 0, sort_order:maxSort + 1, mode:d.mode || 'withdraw',
    active:(d.active !== false), edited_at:new Date().toISOString() };
  const res = await sbInsert('stock_items', row);
  if(!res.ok) return res;
  return { ok:true, msg:'เพิ่มรายการแล้ว ✓ (' + newId + ')', id:newId };
}

// ---- ลบรายการ: soft = ปิดใช้งาน, hard = ลบถาวร ----
async function sbDeleteStockItem(p){
  const id = p && p.id;
  if(!id) return { ok:false, error:'ไม่พบรหัสรายการ' };
  if(p.hard){
    const res = await sbDelete('stock_items', 'item_id=eq.' + encodeURIComponent(id));
    if(!res.ok) return res;
    return { ok:true, msg:'ลบรายการถาวรแล้ว ✓' };
  }
  const res = await sbPatch('stock_items', 'item_id=eq.' + encodeURIComponent(id), { active:false, edited_at:new Date().toISOString() });
  if(!res.ok) return res;
  return { ok:true, msg:'ปิดใช้งานรายการแล้ว ✓' };
}

// ---- ตั้งค่าขั้นต่ำหลายรายการพร้อมกัน ----
async function sbSaveMinStockBatch(p){
  const items = (p && p.items) || [];
  if(!items.length) return { ok:false, error:'ไม่มีรายการให้บันทึก' };
  const now = new Date().toISOString();
  let okN = 0;
  for(let i = 0; i < items.length; i++){
    const it = items[i]; if(!it.id) continue;
    const res = await sbPatch('stock_items', 'item_id=eq.' + encodeURIComponent(it.id), { min_stock:Number(it.minStock) || 0, edited_at:now });
    if(!res.ok) return { ok:false, error:'รายการ ' + it.id + ': ' + res.error };
    okN++;
  }
  return { ok:true, msg:'บันทึกค่าขั้นต่ำ ' + okN + ' รายการ ✓' };
}

// ---- บันทึกเข้า/ออกงาน (อัปรูปขึ้น Storage bucket 'attendance') ----
async function sbAddAttendLog(p){
  const d = (p && p.data) || {};
  if(!d.staffId) return { ok:false, error:'ไม่พบรหัสพนักงาน' };
  // หา ชื่อ + สาขา จาก staff_safe
  let name = '', branch = '';
  try{
    const s = await sbFetch('staff_safe?select=name,branch&staff_id=eq.' + encodeURIComponent(d.staffId) + '&limit=1');
    if(s && s[0]){ name = s[0].name || ''; branch = s[0].branch || ''; }
  }catch(e){}
  let url = '';
  try{ if(d.photo && d.photo.base64) url = await sbUploadImage('attendance', { base64:d.photo.base64, mime:d.photo.mime || 'image/jpeg' }); }
  catch(e){ return { ok:false, error:'อัปรูปไม่สำเร็จ: ' + String(e.message || e) }; }
  const row = { att_date:sbLocalDate(), att_time:sbLocalTime(), type:d.type || 'in',
    staff_id:d.staffId, name:name, branch:branch,
    lat:Number(d.lat) || 0, lng:Number(d.lng) || 0, address:d.address || '',
    photo_url:url || null, in_geofence:(d.inGeofence !== false), distance:Number(d.distance) || 0,
    note:d.note || null, created_at:new Date().toISOString() };
  const res = await sbInsert('attendance', row);
  if(!res.ok) return res;
  var lineOk = false;
  try{
    var fd = { date:row.att_date, time:String(row.att_time||'').slice(0,5), type:row.type, name:name, nick:'',
      branch:branch, address:row.address||'', imgUrl:url||'', inGeofence:row.in_geofence!==false, distance:Number(row.distance)||0 };
    var lr = await maruNotifyLine([ maruBuildAttendFlex(fd) ]);
    lineOk = !!(lr && lr.ok);
  }catch(e){}
  return { ok:true, msg:'บันทึก' + (d.type === 'out' ? 'ออกงาน' : 'เข้างาน') + 'แล้ว ✓', imgUrl:url, lineStatus:lineOk };
}


// ---- สาขา (อ่าน/เขียน) — ย้ายจาก Apps Script ----
async function sbGetAttendBranches(){
  const rows = await sbFetch('branches?select=*');
  const list = (rows || []).filter(function(r){ return r.branch_id && r.active !== false; }).map(function(r){
    return { id:r.branch_id, name:r.name, address:r.address || '', lat:Number(r.lat) || 0, lng:Number(r.lng) || 0, radius:Number(r.radius) || 100 };
  });
  return { branches:list };
}
async function sbSaveAttendBranch(p){
  const d = (p && p.data) || {};
  if(!d.id || !d.name) return { ok:false, error:'ต้องระบุ ID และชื่อสาขา' };
  const row = { branch_id:d.id, name:d.name, address:d.address || '', lat:Number(d.lat) || 0, lng:Number(d.lng) || 0, radius:Number(d.radius) || 100, active:(d.active !== false) };
  const ex = await sbFetch('branches?select=branch_id&branch_id=eq.' + encodeURIComponent(d.id));
  const res = (ex && ex.length)
    ? await sbPatch('branches', 'branch_id=eq.' + encodeURIComponent(d.id), row)
    : await sbInsert('branches', row);
  if(!res.ok) return res;
  return { ok:true, msg:'บันทึกสาขาแล้ว ✓' };
}

// ===== กุยช่ายเฝ้าร้าน (getAlerts) — คำนวณจาก Supabase ทั้งหมด แทน Apps Script =====
async function sbGetAlerts(){
  var KPI_COST_RATIO_MAX = 30, KPI_DAILY_SALES_MIN = 3666.67;
  var alerts = [], now = new Date(), today = sbFmtD(now), hh = now.getHours();
  var hd = null; try{ hd = await api('getHomeDashboard', {}); }catch(e){}
  if(hd){
    if(hd.stock.outOfStock > 0){ var nm=(hd.stock.outOfStockItems||[]).map(function(x){return x.name;}).slice(0,5).join(', '); alerts.push({ id:'stock-out-'+today, level:'crit', icon:'🔴', title:'ของหมดสต๊อก '+hd.stock.outOfStock+' รายการ', msg:nm+(hd.stock.outOfStock>5?' และอื่นๆ':''), page:'stock-manage.html' }); }
    if(hd.stock.lowStock > 0){ var _ls=(hd.stock.lowStockList||[]); var lf=_ls.slice(0,8).map(function(x){ return x.name + (x.daysLeft!=null ? ' (เหลือ~'+x.daysLeft+'วัน)' : ' (เหลือ '+x.balance+(x.unit||'')+')'); }).join(', '); if(hd.stock.lowStock>8) lf += ' และอีก '+(hd.stock.lowStock-8)+' รายการ'; alerts.push({ id:'stock-low-'+today, level:'warn', icon:'🟡', title:'ของใกล้หมด '+hd.stock.lowStock+' รายการ', msg:lf||'ตรวจสอบและเตรียมสั่งเพิ่ม', page:'stock-manage.html' }); }
    if(hd.stock.belowMin > 0){ var _bm=(hd.stock.belowMinList||[]); var bmf=_bm.slice(0,8).map(function(x){ return x.name + ' (เหลือ '+x.balance+(x.unit||'')+' · เตือนที่ '+x.minStock+')'; }).join(', '); if(hd.stock.belowMin>8) bmf += ' และอีก '+(hd.stock.belowMin-8)+' รายการ'; alerts.push({ id:'stock-belowmin-'+today, level:'info', icon:'🔔', title:'ต่ำกว่าจุดเตือนที่ตั้งไว้ '+hd.stock.belowMin+' รายการ', msg:bmf||'มีรายการต่ำกว่าจุดเตือน', page:'stock-manage.html' }); }
    var ysd=hd.sales.yesterday||0, avg7=hd.sales.avg7||0;
    if(avg7>0 && ysd===0) alerts.push({ id:'sales-zero-'+today, level:'crit', icon:'🔴', title:'เมื่อวานยอดขายเป็น 0', msg:'ตรวจสอบว่าบันทึกยอดครบหรือยัง', page:'index.html' });
    else if(avg7>0 && ysd>0 && ysd<avg7*0.7) alerts.push({ id:'sales-low-'+today, level:'warn', icon:'🟡', title:'ยอดเมื่อวานตกผิดปกติ', msg:'เมื่อวาน '+Math.round(ysd)+' บาท ต่ำกว่าเฉลี่ย7วัน ('+Math.round(avg7)+') เกิน 30%', page:'index.html' });
    if(hh>=10 && hd.attendance.checkedIn===0 && hd.attendance.total>0) alerts.push({ id:'attend-none-'+today, level:'warn', icon:'🟡', title:'ยังไม่มีใครเช็คอิน', msg:'เลย 10:00 แล้วยังไม่มีพนักงานเช็คอินวันนี้', page:'attend.html' });
  }
  try{ var ar=await api('getAttendReport',{start:today,end:today,type:'all'}); var outN={}; (ar.logs||[]).forEach(function(l){ if(l.type==='in'&&l.inGeofence===false) outN[l.staff||l.staffId]=1; }); var on=Object.keys(outN); if(on.length) alerts.push({ id:'attend-geo-'+today, level:'warn', icon:'🟡', title:'เช็คอินนอกพื้นที่', msg:on.join(', ')+' เช็คอินนอกพื้นที่ร้านวันนี้', page:'attend-report.html' }); }catch(e){}
  try{
    var mStart=today.substring(0,8)+'01'; var dd=await api('getDashboardData',{start:mStart,end:today});
    if(dd&&dd.summary){ var su=dd.summary, sales=su.totalSales||0, exp=su.totalExpenses||0, avg=su.avgPerDay||0; var ratio=sales>0?exp/sales*100:0; var daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(); var daysLeft=daysInMonth-now.getDate();
      if(sales>0&&ratio>KPI_COST_RATIO_MAX) alerts.push({ id:'mgmt-cost-'+today, level:'crit', icon:'🔴', title:'ค่าใช้จ่ายเกินเป้า '+KPI_COST_RATIO_MAX+'%', msg:'เดือนนี้ค่าใช้จ่าย '+ratio.toFixed(1)+'% ของยอดขาย เสี่ยงหลุดอินเซนทีฟ', page:'expenses-report.html' });
      if(avg>0&&avg<KPI_DAILY_SALES_MIN) alerts.push({ id:'mgmt-avg-'+today, level:'warn', icon:'🟡', title:'ยอดเฉลี่ยต่ำกว่าเป้า', msg:'เฉลี่ย '+Math.round(avg)+'/วัน (เป้า '+Math.round(KPI_DAILY_SALES_MIN)+') เหลือ '+daysLeft+' วัน ต้องเร่งยอด', page:'expenses-report.html' });
      if(typeof su.cashDiff==='number'&&su.cashDiff<-1) alerts.push({ id:'cash-short-'+today, level:'warn', icon:'🟡', title:'เงินสดขาดสะสม', msg:'เดือนนี้เงินสดขาดรวม '+Math.round(Math.abs(su.cashDiff))+' บาท ตรวจสอบรายงานสิ้นวัน', page:'expenses-report.html' });
    }
  }catch(e){}
  // เงินเดือน — แสดงเฉพาะเจ้าของที่ปลดล็อกแล้ว (กันพนักงานเห็น)
  try{ var owner=''; try{ owner=sessionStorage.getItem('maruOwner')||''; }catch(e){}
    if(owner){ var ps=await api('getPayrollStatus',{ownerCode:owner});
      (ps.partTime||[]).forEach(function(sp){ if(sp.daysToPay>=7) alerts.push({ id:'pay-pt-'+sp.id+'-'+today, level:'warn', icon:'🟡', title:'ค้างจ่ายพาร์ทไทม์', msg:(sp.nickname||sp.name)+' ค้างจ่าย '+sp.daysToPay+' วัน', page:'payments.html' }); });
      (ps.fullTime||[]).forEach(function(sf){ (sf.cycles||[]).forEach(function(c){ if(c.due&&!c.paid) alerts.push({ id:'pay-ft-'+sf.id+'-'+c.key, level:'warn', icon:'🟡', title:'ถึงกำหนดจ่ายประจำ', msg:(sf.nickname||sf.name)+' '+c.label+' ถึงกำหนดแล้ว', page:'payments.html' }); }); });
    }
  }catch(e){}
  try{ var d60=sbFmtD(new Date(now.getTime()-60*86400000)); var ah=await api('getStockAuditHistory',{start:d60,end:today}); var recs=(ah&&ah.records)||[]; var lastA=recs.length?recs[0].date:null; var since=lastA?Math.floor((new Date(today+'T00:00:00')-new Date(lastA+'T00:00:00'))/86400000):999; if(since>=7) alerts.push({ id:'audit-old-'+today, level:'info', icon:'🔵', title:'ควรตรวจนับสต๊อก', msg:(lastA?'ตรวจนับล่าสุด '+sbDM(lastA)+' ('+since+' วันก่อน)':'ยังไม่เคยตรวจนับ')+' ควรตรวจนับเพื่อความแม่นยำ', page:'stock-audit.html' }); }catch(e){}
  try{ var rp=await api('getRemitPending',{}); if(rp && rp.netAmount>0 && rp.days && rp.days.length){ var sinceR=Math.floor((new Date(today+'T00:00:00')-new Date(rp.periodStart+'T00:00:00'))/86400000); alerts.push({ id:'remit-'+today, level:(sinceR>=7?'warn':'info'), icon:(sinceR>=7?'🟡':'🔵'), title:'มีเงินสดรอนำส่ง', msg:'ยอด '+Math.round(rp.netAmount).toLocaleString('en-US')+' บาท ('+rp.days.length+' วัน) ยังไม่ได้นำส่ง', page:'cash-remit.html' }); } }catch(e){}
  var order={crit:0,warn:1,info:2};
  alerts.sort(function(a,b){ return (order[a.level]||9)-(order[b.level]||9); });
  return { ok:true, alerts:alerts, count:alerts.length };
}

// ===== เช็คประวัติการใช้ของสินค้า (ก่อนลบ) — แทน Apps Script =====
async function sbCheckStockItemUsage(p){
  var id = p && p.id; if(!id) return { ok:false, error:'ต้องระบุ ID' };
  var items = await sbFetch('stock_items?select=item_id,name,category,unit,active&item_id=eq.'+encodeURIComponent(id)+'&limit=1');
  if(!items.length) return { ok:false, error:'ไม่พบ ID นี้' };
  var it = items[0];
  async function cnt(table){ try{ var r=await sbFetch(table+'?select=item_id&item_id=eq.'+encodeURIComponent(id)); return r.length; }catch(e){ return 0; } }
  var res = await Promise.all([cnt('stock_withdraw'), cnt('stock_receive'), cnt('stock_daily'), cnt('stock_audit')]);
  var wd=res[0], rc=res[1], dl=res[2], ad=res[3], total=wd+rc+dl+ad;
  var balance=0; try{ var bal=await api('getStockBalances',{date:sbFmtD(new Date()),category:'all'}); if(bal&&bal.items){ var fnd=bal.items.find(function(x){return x.id===id;}); if(fnd) balance=Number(fnd.balance)||0; } }catch(e){}
  return { ok:true, item:{ id:it.item_id, name:it.name, category:it.category, unit:it.unit, active:it.active!==false }, balance:balance,
           usage:{ withdraw:wd, receive:rc, daily:dl, audit:ad, total:total }, canHardDelete: total===0 };
}

// ===== ระบบเงินสดนำส่ง (cash remittance) =====
async function sbGetRemitPending(p){
  var endDate = (p && (p.endDate || p.end)) || null;
  var today = endDate || sbFmtD(new Date());
  var remits = await sbFetch('cash_remittance?select=period_end&order=period_end.desc&limit=1');
  var start = null;
  if(remits && remits.length && remits[0].period_end){ var d=new Date(remits[0].period_end+'T00:00:00'); d.setDate(d.getDate()+1); start=sbFmtD(d); }
  var salesQ = 'sales?select=sale_date,cash,closed_by&sale_date=lte.'+today+(start?('&sale_date=gte.'+start):'')+'&order=sale_date.asc';
  var expQ   = 'expenses?select=exp_date,item,amount,type&type=eq.pos&exp_date=lte.'+today+(start?('&exp_date=gte.'+start):'');   // หักเฉพาะ POS (เงินออกจากลิ้นชัก)
  var rr = await Promise.all([sbFetch(salesQ), sbFetch(expQ)]);
  var sales=rr[0]||[], exps=rr[1]||[];
  var days=[], cashTotal=0, notClosed=[];
  sales.forEach(function(s){
    var closed = (s.closed_by && String(s.closed_by).trim()!=='');
    if(closed){ var c=Number(s.cash)||0; days.push({ date:s.sale_date, dateDM:sbDM(s.sale_date), cash:c, closedBy:s.closed_by }); cashTotal+=c; }
    else if((Number(s.cash)||0)!==0 || true) notClosed.push(s.sale_date);
  });
  var expenseTotal=0, expList=[];
  exps.forEach(function(e){ var a=Number(e.amount)||0; if(a>0){ expenseTotal+=a; expList.push({ date:e.exp_date, dateDM:sbDM(e.exp_date), item:e.item||'', amount:a, type:e.type||'pos' }); } });
  var net = Math.round((cashTotal-expenseTotal)*100)/100;
  return { ok:true, periodStart:(start||(days.length?days[0].date:today)), periodEnd:today,
           days:days, cashTotal:cashTotal, expenseTotal:expenseTotal, expenses:expList,
           netAmount:net, notClosed:notClosed };
}
async function sbSubmitRemit(p){
  var d=(p&&p.data)||{};
  if(!d.submittedBy || !String(d.submittedBy).trim()) return { ok:false, error:'กรุณากรอกชื่อผู้นำส่ง' };
  var pend = await sbGetRemitPending({ endDate: (d.periodEnd || null) });
  if(!pend.days.length) return { ok:false, error:'ยังไม่มีวันที่ปิดรอบให้นำส่งในรอบนี้' };
  var slip='';
  try{ if(d.slip && d.slip.base64) slip = await sbUploadImage('remit-slips', d.slip); }
  catch(e){ return { ok:false, error:'อัปสลิปไม่สำเร็จ: '+String(e.message||e) }; }
  var amt = Number(d.submittedAmount)||0;
  var row = { period_start:pend.periodStart, period_end:pend.periodEnd, cash_total:pend.cashTotal, expense_total:pend.expenseTotal,
    net_amount:pend.netAmount, included_dates:pend.days.map(function(x){return x.date;}), status:'submitted',
    submitted_by:d.submittedBy, submitted_amount:amt, slip_url:slip||null, submitted_at:new Date().toISOString(),
    diff:Math.round((amt-pend.netAmount)*100)/100, note:d.note||null, created_at:new Date().toISOString() };
  var res = await sbInsert('cash_remittance', row);
  if(!res.ok) return res;
  return { ok:true, msg:'บันทึกการนำส่งแล้ว ✓ รอเจ้าของยืนยัน', net:pend.netAmount };
}
async function sbGetRemitHistory(){
  var rows = await sbFetch('cash_remittance?select=*&order=id.desc&limit=50');
  return { ok:true, remits: rows||[] };
}

// action ที่ย้ายมา Supabase แล้ว (เพิ่มทีละตัวได้)
async function sbGetStockMoveHistory(p){
  p = p || {};
  const start = p.start || '';
  const end = p.end || sbFmtD(new Date());
  const cat = p.category || 'all';
  const T = await sbStockTables();
  const meta = {};
  T.items.forEach(function(r){ meta[r.item_id] = { name:r.name, category:r.category, order:Number(r.sort_order)||0, unit:r.unit, mode:r.mode || 'withdraw' }; });
  const CR = { Waffle:0, KUFF:1, Drink:2, Other:3, Others:3 };
  const byDate = {};
  (T.daily || []).forEach(function(r){
    const id = r.item_id, m = meta[id]; if(!m) return;
    const dt = r.move_date; if(!dt) return;
    if(start && dt < start) return;
    if(end && dt > end) return;
    if(cat !== 'all' && m.category !== cat) return;
    const recv = Number(r.receive_total)||0, used = Number(r.used)||0, waste = Number(r.waste)||0, wdt = Number(r.withdraw_total)||0;
    if(!(recv>0 || used>0 || waste>0 || wdt>0)) return;   // เฉพาะที่มีความเคลื่อนไหว
    if(!byDate[dt]) byDate[dt] = [];
    byDate[dt].push({ id:id, name:m.name, category:m.category, unit:m.unit, order:m.order, mode:m.mode,
      open:Number(r.open_qty)||0, receive:recv, used:used, withdrawTotal:wdt, waste:waste, balance:Number(r.balance)||0 });
  });
  const dates = Object.keys(byDate).sort(function(a,b){ return String(b).localeCompare(String(a)); });
  const days = dates.map(function(dt){
    const items = byDate[dt].sort(function(a,b){
      const ra = (CR[a.category] !== undefined ? CR[a.category] : 9), rb = (CR[b.category] !== undefined ? CR[b.category] : 9);
      if(ra !== rb) return ra - rb;
      if((a.order||0) !== (b.order||0)) return (a.order||0) - (b.order||0);
      return String(a.id||'').localeCompare(String(b.id||''), undefined, { numeric:true });
    });
    let tRecv = 0, tUsed = 0, tWaste = 0;
    items.forEach(function(x){ tRecv += x.receive; tUsed += x.used; tWaste += x.waste; });
    const d = new Date(dt + 'T00:00:00');
    return { date:dt, dateDM:sbDM(dt), dow:SB_DOW[d.getDay()], count:items.length,
      totalReceive:Math.round(tRecv*100)/100, totalUsed:Math.round(tUsed*100)/100, totalWaste:Math.round(tWaste*100)/100, items:items };
  });
  return { ok:true, days:days, range:{ start:start, end:end } };
}

async function sbGetDashboardData(p){
  const start = p.start, end = p.end;
  const sD = new Date(start + 'T00:00:00'), eD = new Date(end + 'T00:00:00');
  const days = Math.round((eD - sD) / 86400000) + 1;
  const prevEnd = new Date(sD.getTime() - 86400000), prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  const prevStartStr = sbFmtD(prevStart), prevEndStr = sbFmtD(prevEnd);
  const [salesRows, expRows] = await Promise.all([
    sbFetch('sales?select=sale_date,total,cash,transfer,thaihelp,lineman,grab,shopee,robinhood,cash_diff&order=sale_date.asc'),
    sbFetch('expenses?select=exp_date,item,amount')
  ]);
  const chanTotal = {}; SB_CH.forEach(function (c) { chanTotal[c.key] = 0; });
  const byDay = {}, byDow = [0,0,0,0,0,0,0], byDowCnt = [0,0,0,0,0,0,0];
  let totalSales = 0, cash = 0, transfer = 0, thaihelp = 0, delivery = 0, dayCount = 0, prevTotal = 0, cashDiff = 0;
  salesRows.forEach(function (r) {
    const dd = r.sale_date, dayTotal = Number(r.total) || 0;
    if (dd >= start && dd <= end) {
      totalSales += dayTotal; dayCount++; byDay[dd] = dayTotal;
      var di = new Date(dd + 'T00:00:00').getDay(); byDow[di] += dayTotal; byDowCnt[di]++;
      cashDiff += Number(r.cash_diff) || 0;
      SB_CH.forEach(function (c) { const v = Number(r[c.key]) || 0; chanTotal[c.key] += v; if (c.group === 'store') { if (c.key === 'cash') cash += v; else if (c.key === 'transfer') transfer += v; else if (c.key === 'thaihelp') thaihelp += v; } else delivery += v; });
    } else if (dd >= prevStartStr && dd <= prevEndStr) prevTotal += dayTotal;
  });
  let totalExpenses = 0; const expByCat = {};
  expRows.forEach(function (r) { const dd = r.exp_date; if (dd >= start && dd <= end) { const a = Number(r.amount) || 0; totalExpenses += a; const c = r.item || 'อื่นๆ'; expByCat[c] = (expByCat[c] || 0) + a; } });
  const byDayArr = Object.keys(byDay).sort().map(function (k) { return { date: k, total: byDay[k] }; });
  const byChannelArr = SB_CH.map(function (c) { return { label: c.label, total: chanTotal[c.key] }; }).filter(function (o) { return o.total > 0; }).sort(function (a, b) { return b.total - a.total; });
  const expByCatArr = Object.keys(expByCat).map(function (k) { return { category: k, total: expByCat[k] }; }).sort(function (a, b) { return b.total - a.total; });
  let bestDay = null; byDayArr.forEach(function (o) { if (!bestDay || o.total > bestDay.total) bestDay = o; });
  function dowAvg(i) { return byDowCnt[i] > 0 ? byDow[i] / byDowCnt[i] : 0; }
  let bestDowIdx = 0; for (let i = 1; i < 7; i++) { if (dowAvg(i) > dowAvg(bestDowIdx)) bestDowIdx = i; }
  return { range: { start: start, end: end }, summary: { totalSales: totalSales, cash: cash, transfer: transfer, thaihelp: thaihelp, delivery: delivery, totalExpenses: totalExpenses, netProfit: totalSales - totalExpenses, dayCount: dayCount, avgPerDay: dayCount ? totalSales / dayCount : 0, prevTotal: prevTotal, growth: prevTotal > 0 ? ((totalSales - prevTotal) / prevTotal * 100) : null, bestDay: bestDay, bestDow: byDayArr.length ? SB_DOW[bestDowIdx] : null, bestDowAvg: byDayArr.length ? Math.round(dowAvg(bestDowIdx)) : 0, cashDiff: cashDiff }, byChannel: byChannelArr, byDay: byDayArr, byDow: byDow, byDowCount: byDowCnt, dowNames: SB_DOW, expByCat: expByCatArr };
}

const SB_ACTIONS = {
  getHomeDashboard: sbGetHomeDashboard,
  getDashboardData: sbGetDashboardData,
  getStockBalances: sbGetStockBalances,
  getExpensesReport: sbGetExpensesReport,
  getActivityFeed: sbGetActivityFeed,
  getStockItems: sbGetStockItems,
  getStockDashboard: sbGetStockDashboard,
  getStockMoveHistory: sbGetStockMoveHistory,
  getAttendStaff: sbGetAttendStaff,
  getAttendReport: sbGetAttendReport,
  getConfig: sbGetConfig,
  getDailyReport: sbGetDailyReport,
  suggestMinStock: sbSuggestMinStock,
  getStockAuditHistory: sbGetStockAuditHistory,
  addBusinessExpense: sbAddBusinessExpense,
  // ---- ฝั่งเขียนที่ย้ายมาใหม่ ----
  addStockWithdraw:  sbAddStockWithdraw,
  addStockReceive:   sbAddStockReceive,
  closeDailyStock:   sbCloseDailyStock,
  addStockAudit:     sbAddStockAudit,
  saveStockItem:     sbSaveStockItem,
  addStockItem:      sbAddStockItem,
  deleteStockItem:   sbDeleteStockItem,
  saveMinStockBatch: sbSaveMinStockBatch,
  addAttendLog:      sbAddAttendLog,
  getAttendBranches: sbGetAttendBranches,
  saveAttendBranch:  sbSaveAttendBranch,
  getAlerts:         sbGetAlerts,
  checkStockItemUsage: sbCheckStockItemUsage,
  getRemitPending:   sbGetRemitPending,
  submitRemit:       sbSubmitRemit,
  getRemitHistory:   sbGetRemitHistory
};
 
async function api(action, params){
  if(SB_ACTIONS[action]){ const _r = await SB_ACTIONS[action](params || {}); if(WRITE_INVALIDATES[action]) invalidateCache(WRITE_INVALIDATES[action]); return _r; }
  if(EDGE_ACTIONS[action]){
    const res = await fetch(EDGE_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', apikey:SB_KEY },   // publishable key ใส่ใน apikey เท่านั้น (ห้ามใส่ Authorization — จะโดน 401)
      body:JSON.stringify(Object.assign({action:action}, params||{}))
    });
    if(!res.ok) throw new Error('Edge HTTP ' + res.status);
    const data = await res.json();
    if(data.error) throw new Error(data.error);
    if(WRITE_INVALIDATES[action]) invalidateCache(WRITE_INVALIDATES[action]);
    return data;
  }
  try{
    const res = await fetch(APPS_SCRIPT_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(Object.assign({action:action}, params||{}))
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    if(data.error) throw new Error(data.error);
    if(WRITE_INVALIDATES[action]) invalidateCache(WRITE_INVALIDATES[action]);
    return data;
  }catch(err){ throw err; }
}

// ---- ICONS ----
const ICON_S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const ICONS = {
  edit:     ICON_S+'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  receipt:  ICON_S+'<path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>',
  dash:     ICON_S+'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  trend:    ICON_S+'<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
  store:    ICON_S+'<path d="M3 9l2-5h14l2 5"/><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M9 21V12h6v9"/></svg>',
  check:    ICON_S+'<polyline points="20 6 9 17 4 12"/></svg>',
  camera:   ICON_S+'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  image:    ICON_S+'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  chat:     ICON_S+'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>',
  book:     ICON_S+'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  home:     ICON_S+'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
  clipboard:ICON_S+'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 11h6"/><path d="M9 15h4"/></svg>',
  wallet:   ICON_S+'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14" r="1.1"/></svg>',
  pkgout:   ICON_S+'<path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/></svg>',
  pkgin:    ICON_S+'<path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/></svg>',
  clock:    ICON_S+'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  moon:     ICON_S+'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  bars:     ICON_S+'<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/><line x1="3" y1="20" x2="21" y2="20"/></svg>',
  pie:      ICON_S+'<path d="M21 12A9 9 0 1 0 12 21"/><path d="M12 3v9h9a9 9 0 0 0-9-9z"/></svg>',
  boxes:    ICON_S+'<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  history:  ICON_S+'<path d="M3.5 9a9 9 0 1 1-.5 5"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>',
  users:    ICON_S+'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3 3 0 0 1 0 5.8"/><path d="M18.5 20a5 5 0 0 0-2.8-4.5"/></svg>',
  listcheck:ICON_S+'<path d="M4 7h10"/><path d="M4 12h10"/><path d="M4 17h6"/><path d="M15 16.5l2 2 4-4.5"/></svg>',
  editlist: ICON_S+'<path d="M4 6h9"/><path d="M4 12h6"/><path d="M4 18h6"/><path d="M14.5 15.5 21 9l-2.2-2.2L12.3 13.3l-.3 2.5z"/></svg>',
  search:   ICON_S+'<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
  usercog:  ICON_S+'<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.6 5.6 0 0 1 9.5-4"/><circle cx="18" cy="17" r="2.3"/><path d="M18 13.6v1M18 19.4v1M21.1 17h-1M15.9 17h-1"/></svg>',
  card:     ICON_S+'<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>',
  cashsend: ICON_S+'<rect x="2" y="6" width="14" height="9" rx="1.5"/><circle cx="9" cy="10.5" r="2"/><path d="M18 11h4"/><path d="M20 9l2 2-2 2"/></svg>',
};

// ---- Render icons on data-icon attribute ----
function renderIcons(root){
  (root || document).querySelectorAll('[data-icon]').forEach(function(el){
    const name = el.dataset.icon;
    if(ICONS[name] && !el.querySelector('svg')) el.innerHTML = ICONS[name];
  });
}

// ---- Sidebar ----
function bindSidebar(){
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sbBackdrop');
  const ham = document.getElementById('hamburger');
  const cl = document.getElementById('sbClose');
  if(!sb) return;
  function open(){ sb.classList.add('show'); bd.classList.add('show'); }
  function close(){ sb.classList.remove('show'); bd.classList.remove('show'); }
  if(ham) ham.addEventListener('click', open);
  if(cl)  cl.addEventListener('click', close);
  if(bd)  bd.addEventListener('click', close);
}

// ---- Build standard sidebar (เรียกในทุกหน้า — มาร์ค active ตาม attr current) ----
function buildSidebar(currentPage){
  const items = [
    { page:'home',           href:'index.html',           icon:'home',      label:'หน้าแรก' },
    { group: '⭐ ทำประจำวัน' },
    { page:'report',         href:'records.html#report',  icon:'clipboard',  label:'บันทึกรายงานสิ้นวัน' },
    { page:'bizexp',         href:'records.html#bizexp',  icon:'wallet',     label:'บันทึกค่าใช้จ่าย' },
    { page:'stockWithdraw',  href:'stock-withdraw.html',  icon:'pkgout',    label:'เบิกของ' },
    { page:'stockReceive',   href:'stock-receive.html',   icon:'pkgin',     label:'รับของเข้า' },
    { page:'attend',         href:'attend.html',          icon:'clock',     label:'บันทึกเข้างาน' },
    { page:'stockClose',     href:'stock-close.html',     icon:'moon',      label:'ปิดร้าน (สรุปสต๊อก)' },
    { group: '📊 รายงาน' },
    { page:'dash',           href:'records.html#dash',    icon:'bars',      label:'แดชบอร์ดยอดขาย' },
    { page:'expreport',      href:'expenses-report.html', icon:'pie',       label:'รายงานสรุปค่าใช้จ่าย' },
    { page:'stockDashboard', href:'stock-dashboard.html', icon:'boxes',     label:'แดชบอร์ดสต๊อก' },
    { page:'stockHistory',   href:'stock-history.html',   icon:'history',   label:'ประวัติเคลื่อนไหวสต๊อก' },
    { page:'stockView',      href:'stock-view.html',      icon:'store',     label:'ตรวจสต๊อก' },
    { page:'attendReport',   href:'attend-report.html',   icon:'users',     label:'รายงานเข้า-ออกงาน' },
    { page:'stockAuditReport', href:'stock-audit-report.html', icon:'listcheck', label:'ประวัติออดิท' },
    { group: '⚙️ จัดการ / ตั้งค่า' },
    { page:'stockManage',    href:'stock-manage.html',    icon:'editlist',  label:'จัดการรายการสต๊อก' },
    { page:'stockAudit',     href:'stock-audit.html',     icon:'search',    label:'ออดิทสต๊อก' },
    { page:'attendSetup',    href:'attend-setup.html',    icon:'usercog',   label:'จัดการพนักงาน/สาขา' },
    { page:'payments',       href:'payments.html',        icon:'card',      label:'การจ่ายเงิน' },
    { page:'cashRemit',      href:'cash-remit.html',      icon:'cashsend',  label:'เงินสดนำส่ง' },
    { group: '🥟 อื่นๆ' },
    { page:'assistant',      href:'assistant.html',       icon:'chat',        label:'ผู้ช่วยกุยช่าย' },
    { page:'manual',         href:'manual.html',          icon:'book',    label:'คู่มือการใช้งาน' },
  ];
  function itemHtml(it){
    const active = it.page === currentPage ? ' active' : '';
    return '<a class="sb-item'+active+'" href="'+it.href+'"><span class="si" data-icon="'+it.icon+'"></span>'+it.label+'</a>';
  }
  var html = '', inCard = false;
  items.forEach(function(it){
    if(it.group){
      if(inCard) html += '</div>';
      html += '<div class="sb-card"><div class="sb-cap">'+it.group+'</div>';
      inCard = true;
    } else {
      html += itemHtml(it);
    }
  });
  if(inCard) html += '</div>';
  return html;
}

// ---- รายการล่าสุด (แก้ไข/ลบ) ใช้ร่วมหน้าเบิก/รับ ----
async function mountMoveLog(kind, mount){
  if(!mount) return;
  var table = kind==='receive' ? 'stock_receive' : 'stock_withdraw';
  var title = kind==='receive' ? 'รายการรับเข้าล่าสุด' : 'รายการเบิกล่าสุด';
  var today = sbLocalDate();
  mount.innerHTML = '<div class="mlog">'
    + '<div class="mlog-h"><span>🧾 '+title+'</span><div class="mlog-tools"><input type="date" class="mlog-date" value="'+today+'"><button type="button" class="mlog-print" title="พิมพ์สลิป">🖨️</button></div></div>'
    + '<div class="mlog-body"><div class="mlog-empty">กำลังโหลด...</div></div>'
    + '</div>';
  var dateEl = mount.querySelector('.mlog-date');
  var bodyEl = mount.querySelector('.mlog-body');
  var lastRows = [];
  async function loadRows(){
    var d = dateEl.value || today;
    bodyEl.innerHTML = '<div class="mlog-empty">กำลังโหลด...</div>';
    try{
      var sel = kind==='receive' ? 'id,item_name,qty,recorded_by,note,created_at' : 'id,item_name,qty,move_time,recorded_by,note,created_at';
      var rows = await sbFetch(table+'?select='+sel+'&move_date=eq.'+encodeURIComponent(d)+'&order=created_at.desc');
      lastRows = rows || [];
      if(!rows.length){ bodyEl.innerHTML = '<div class="mlog-empty">ไม่มีรายการในวันนี้</div>'; return; }
      bodyEl.innerHTML = rows.map(function(r){
        var isAuto = String(r.note||'').indexOf('เบิกอัตโนมัติจากการนับปิดรอบ')===0;
        var tm = (kind==='withdraw' && r.move_time) ? (String(r.move_time).slice(0,5)+' · ') : '';
        var act = isAuto
          ? '<span class="mlog-auto">อัตโนมัติ</span>'
          : '<button class="mlog-b edit" data-id="'+r.id+'" data-qty="'+r.qty+'" data-name="'+escHtml(r.item_name||'')+'">แก้</button>'
            + '<button class="mlog-b del" data-id="'+r.id+'" data-name="'+escHtml(r.item_name||'')+'">ลบ</button>';
        return '<div class="mlog-row"><div class="mlog-info"><div class="mlog-nm">'+escHtml(r.item_name||'')+'</div>'
          + '<div class="mlog-meta">'+tm+'จำนวน '+r.qty+'</div></div><div class="mlog-act">'+act+'</div></div>';
      }).join('');
    }catch(e){ bodyEl.innerHTML = '<div class="mlog-empty">โหลดไม่ได้: '+escHtml(e.message||e)+'</div>'; }
  }
  async function act(id, op, name, curQty){
    var qty;
    if(op==='edit'){
      var input = window.prompt('แก้จำนวน "'+name+'" (เดิม '+curQty+')', curQty);
      if(input===null) return;
      qty = parseFloat(input);
      if(!(qty>=0)){ toast('จำนวนไม่ถูกต้อง'); return; }
    } else {
      if(!confirm('ลบรายการ "'+name+'" ออกจากระบบ?')) return;
    }
    async function call(code){ return await api('editStockMovement', { kind:kind, id:id, op:op, qty:qty, ownerCode:code||'' }); }
    var res;
    try{ res = await call(''); }catch(e){ toast('ผิดพลาด: '+(e.message||e)); return; }
    if(res && res.needOwner){
      var code = window.prompt('รายการนี้เป็นของวันที่ปิดรอบ/วันก่อนหน้า — ใส่รหัสเจ้าของเพื่อยืนยัน');
      if(!code) return;
      try{ res = await call(code); }catch(e){ toast('ผิดพลาด: '+(e.message||e)); return; }
    }
    if(res && res.ok){ toast(res.msg||'สำเร็จ ✓'); loadRows(); }
    else { toast((res&&res.error)||'ไม่สำเร็จ'); }
  }
  bodyEl.addEventListener('click', function(e){
    var b = e.target.closest('.mlog-b'); if(!b) return;
    if(b.classList.contains('edit')) act(b.dataset.id, 'edit', b.dataset.name, b.dataset.qty);
    else act(b.dataset.id, 'delete', b.dataset.name);
  });
  var printBtn = mount.querySelector('.mlog-print');
  if(printBtn) printBtn.addEventListener('click', function(){
    if(!lastRows.length){ toast('ไม่มีรายการให้พิมพ์'); return; }
    var d = dateEl.value || today; var dp = String(d).split('-'); var ds = dp[2]+'/'+dp[1]+'/'+dp[0];
    var tot = 0;
    var prows = lastRows.map(function(r){
      tot += Number(r.qty)||0;
      var tm = (kind==='withdraw' && r.move_time) ? String(r.move_time).slice(0,5) : '';
      var sub = (tm?('เวลา '+tm):'') + (r.recorded_by?((tm?' · ':'')+'โดย '+r.recorded_by):'');
      return { l: r.item_name, r: String(r.qty), sub: sub };
    });
    maruPrintSlip({ title:(kind==='receive'?'สลิปรับเข้า':'สลิปเบิกออก'), meta:['วันที่ '+ds], rows:prows, summary:'รวม '+lastRows.length+' รายการ · จำนวนรวม '+(Math.round(tot*100)/100) });
  });
  dateEl.addEventListener('change', loadRows);
  mount._reload = loadRows;
  loadRows();
}

// ---- เครื่องพิมพ์กลาง: สลิป 58mm ผ่าน RawBT (เรนเดอร์เป็นภาพ ภาษาไทยครบ) ----
function maruPrintSlip(opts){
  opts = opts || {};
  var now = new Date();
  var dt = (typeof sbLocalDate==='function') ? sbLocalDate() : now.toISOString().slice(0,10);
  var p = String(dt).split('-'); var dstr = p[2]+'/'+p[1]+'/'+p[0];
  var tstr = now.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  function e(x){ return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var metaHtml = (opts.meta||[]).map(function(m){ return '<div class="meta center">'+e(m)+'</div>'; }).join('');
  var rowsHtml = (opts.rows||[]).map(function(r){
    if(r.head) return '<div class="rhead">'+e(r.head)+'</div>';
    var tag = r.tag ? ' '+e(r.tag) : '';
    var sub = r.sub ? '<div class="sub">'+e(r.sub)+'</div>' : '';
    return '<div class="row"><span class="l">'+e(r.l)+'</span><span class="r">'+e(r.r||'')+tag+'</span></div>'+sub;
  }).join('');
  var doc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    + '<style>'
    + '@page{size:58mm auto;margin:0;}'
    + '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + 'html,body{margin:0;padding:0;}'
    + 'body{width:58mm;padding:3mm 2.5mm;font-family:"Sarabun","Noto Sans Thai",sans-serif;color:#000;font-size:12px;line-height:1.35;}'
    + '.center{text-align:center;}'
    + '.shop{font-weight:800;font-size:16px;}'
    + '.branch{font-size:11px;margin-bottom:1px;}'
    + '.title{font-weight:800;font-size:14px;margin-top:5px;}'
    + '.meta{font-size:11px;}'
    + '.hr{border-top:1px dashed #000;margin:5px 0;}'
    + '.row{display:flex;justify-content:space-between;gap:6px;font-size:12px;padding:1.5px 0;}'
    + '.row .l{flex:1;word-break:break-word;}'
    + '.row .r{flex:none;text-align:right;white-space:nowrap;font-weight:700;}'
    + '.rhead{font-weight:800;font-size:11.5px;margin-top:5px;border-bottom:1px solid #000;padding-bottom:1px;}'
    + '.sub{font-size:10.5px;padding-left:3px;}'
    + '.sum{font-weight:700;font-size:12px;margin-top:3px;}'
    + '.foot{text-align:center;font-size:10.5px;margin-top:7px;}'
    + '</style></head><body>'
    + '<div class="center shop">กุยช่ายสวรรค์</div>'
    + '<div class="center branch">สาขา ปทุมวัน · งามวงศ์วาน</div>'
    + '<div class="center title">'+e(opts.title||'')+'</div>'
    + '<div class="center meta">'+dstr+'  '+tstr+'</div>'
    + metaHtml
    + '<div class="hr"></div>'
    + rowsHtml
    + '<div class="hr"></div>'
    + (opts.summary ? '<div class="sum">'+e(opts.summary)+'</div>' : '')
    + (opts.note ? '<div class="meta">'+e(opts.note)+'</div>' : '')
    + '<div class="foot">พิมพ์จากแอป กุยช่ายสวรรค์</div>'
    + '<div style="height:8mm;"></div>'
    + '</body></html>';
  // แสดงตัวอย่างสลิปบนจอ (กว้าง 58mm จริง) — ดูได้แม้ไม่มีเครื่องพิมพ์ แล้วค่อยกดพิมพ์
  var ov = document.createElement('div');
  ov.className = 'slip-ov';
  ov.innerHTML = '<div class="slip-card">'
    + '<div class="slip-ttl">ตัวอย่างสลิป · 58mm</div>'
    + '<div class="slip-wrap"><iframe class="slip-frame" title="ตัวอย่างสลิป"></iframe></div>'
    + '<div class="slip-btns"><button type="button" class="slip-print">🖨️ พิมพ์</button><button type="button" class="slip-close">ปิด</button></div>'
    + '</div>';
  document.body.appendChild(ov);
  var ifr = ov.querySelector('.slip-frame');
  var w = ifr.contentWindow;
  w.document.open(); w.document.write(doc); w.document.close();
  function fit(){ try{ ifr.style.height = (w.document.body.scrollHeight + 6) + 'px'; }catch(err){} }
  setTimeout(fit, 250); setTimeout(fit, 600);
  function close(){ try{ document.body.removeChild(ov); }catch(err){} }
  ov.querySelector('.slip-print').addEventListener('click', function(){ try{ w.focus(); w.print(); }catch(err){} });
  ov.querySelector('.slip-close').addEventListener('click', close);
  ov.addEventListener('click', function(ev){ if(ev.target===ov) close(); });
}

// ---- Service Worker ----
function registerSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  }
}

// ---- Receipt picker (bottom sheet) — ใช้ร่วม ----
// usage: setReceiptHandler(function(file){ ... }); openReceiptSheet();
let _rcptHandler = null;
function setReceiptHandler(fn){ _rcptHandler = fn; }
function openReceiptSheet(){ document.getElementById('rcptSheet').classList.add('show'); }
function closeReceiptSheet(){ document.getElementById('rcptSheet').classList.remove('show'); }
function bindReceiptSheet(){
  const sheet = document.getElementById('rcptSheet'); if(!sheet) return;
  document.getElementById('rcptCancel').addEventListener('click', closeReceiptSheet);
  sheet.addEventListener('click', function(e){ if(e.target===sheet) closeReceiptSheet(); });
  document.getElementById('rcptCam').addEventListener('click', function(){
    closeReceiptSheet();
    document.getElementById('rcptInputCam').click();
  });
  document.getElementById('rcptAlb').addEventListener('click', function(){
    closeReceiptSheet();
    document.getElementById('rcptInputAlb').click();
  });
  document.getElementById('rcptInputCam').addEventListener('change', function(){
    if(_rcptHandler && this.files[0]) _rcptHandler(this.files[0]);
    this.value = '';
  });
  document.getElementById('rcptInputAlb').addEventListener('change', function(){
    if(_rcptHandler && this.files[0]) _rcptHandler(this.files[0]);
    this.value = '';
  });
  // icons
  setTimeout(function(){
    const camIc = document.querySelector('#rcptCam .oc');
    const albIc = document.querySelector('#rcptAlb .oc');
    if(camIc) camIc.innerHTML = ICONS.camera;
    if(albIc) albIc.innerHTML = ICONS.image;
  }, 30);
}

// ---- HTML snippets (sidebar / hamburger / receipt sheet) ----
// แสดงเวอร์ชันแอป (อ่านจาก Service Worker cache จริง — รู้ว่าอัปเดตหรือยัง)
function maruShowVersion(){
  try{
    var put = function(v){
      var els = document.querySelectorAll('.sb-foot');
      for(var i=0;i<els.length;i++){
        if(els[i].querySelector('.appver')) continue;
        var d = document.createElement('div'); d.className='appver';
        d.style.cssText='margin-top:5px;opacity:.65;font-size:10.5px;';
        d.textContent = v ? ('เวอร์ชัน ' + v) : '';
        els[i].appendChild(d);
      }
    };
    if(!('caches' in window)){ put(''); return; }
    caches.keys().then(function(keys){
      var best=0, bv='';
      keys.forEach(function(k){ var m=String(k).match(/maru-waffle-v(\d+)/); if(m){ var n=parseInt(m[1],10); if(n>best){ best=n; bv='v'+n; } } });
      put(bv);
    }).catch(function(){ put(''); });
  }catch(e){}
}

// เรียก injectShell(currentPage) เพื่อใส่ HTML ส่วน sidebar + hamburger + toast + receipt sheet
function injectShell(currentPage){
  const html = ''
    + '<button class="hamburger" id="hamburger" aria-label="เมนู">'
    +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
    +     '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>'
    +   '</svg>'
    + '</button>'
    + '<div class="sidebar-backdrop" id="sbBackdrop"></div>'
    + '<aside class="sidebar" id="sidebar">'
    +   '<div class="sb-head">'
    +     '<img src="Logo.png" alt="">'
    +     '<div><div class="sb-title">กุยช่ายสวรรค์</div><div class="sb-sub">ระบบบริหารร้าน</div></div>'
    +     '<button class="sb-close" id="sbClose">✕</button>'
    +   '</div>'
    +   '<nav class="sb-nav">' + buildSidebar(currentPage) + '</nav>'
    +   '<div class="sb-foot">🥟 ข้อมูลเก็บใน Supabase</div>'
    + '</aside>'
    // Receipt sheet (ใช้เมื่อแนบรูป)
    + '<div class="rcpt-sheet" id="rcptSheet"><div class="panel">'
    +   '<h4>เพิ่มรูปใบบิล</h4>'
    +   '<div class="opt cam" id="rcptCam"><div class="oc"></div><div class="ot"><div class="tt">ถ่ายรูปใหม่</div><div class="sub">ใช้กล้องของอุปกรณ์</div></div></div>'
    +   '<div class="opt alb" id="rcptAlb"><div class="oc"></div><div class="ot"><div class="tt">เลือกจากอัลบั้ม</div><div class="sub">เลือกรูปที่ถ่ายไว้แล้ว</div></div></div>'
    +   '<div class="opt cancel" id="rcptCancel">ยกเลิก</div>'
    + '</div></div>'
    + '<input type="file" accept="image/*" capture="environment" id="rcptInputCam" style="display:none">'
    + '<input type="file" accept="image/*" id="rcptInputAlb" style="display:none">'
    + maruAlertMarkup()
    + maruAssistantMarkup(currentPage)
    + '<div class="toast" id="toast"></div>';
  document.body.insertAdjacentHTML('afterbegin', html);
  renderIcons();
  maruShowVersion();
  bindSidebar();
  bindReceiptSheet();
  bindMaruAssistant(currentPage);
  bindMaruAlerts(currentPage);
}

// ===== ผู้ช่วยกุยช่าย: ปุ่มลอย + กล่องแชท + เสียง (Web Speech API ฟรี ไม่กินเครดิต) =====
function maruAssistantMarkup(currentPage){
  if(currentPage === 'assistant') return ''; // หน้าเต็มมีแชทอยู่แล้ว ไม่ต้องมีปุ่มลอยซ้ำ
  return ''
   + '<style id="maruStyle">'
   + '.maru-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));width:60px;height:60px;border-radius:50%;'
   + 'border:0;background:transparent;color:#143D26;font-size:30px;box-shadow:0 6px 18px rgba(0,0,0,.28);cursor:pointer;z-index:900;'
   + 'display:flex;align-items:center;justify-content:center;transition:transform .15s;overflow:hidden;padding:0;animation:maruPulse 2.8s ease-out infinite;}'
   + '.maru-fab img{width:124%;height:124%;object-fit:cover;border-radius:50%;display:block;animation:maruBob 2.8s ease-in-out infinite;transform-origin:50% 92%;}'
   + '.maru-fab:active{transform:scale(.92);}'
   + '@keyframes maruBob{0%,100%{transform:translateY(0) rotate(0);}20%{transform:translateY(-3px) rotate(-5deg);}40%{transform:translateY(0) rotate(0);}50%{transform:translateY(-2px) rotate(4deg);}62%{transform:translateY(0) rotate(0);}}'
   + '@keyframes maruPulse{0%{box-shadow:0 6px 18px rgba(0,0,0,.28),0 0 0 0 rgba(230,184,60,.45);}70%{box-shadow:0 6px 18px rgba(0,0,0,.28),0 0 0 13px rgba(230,184,60,0);}100%{box-shadow:0 6px 18px rgba(0,0,0,.28),0 0 0 0 rgba(230,184,60,0);}}'
   + '.maru-ov{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1600;display:none;align-items:flex-end;justify-content:center;}'
   + '.maru-ov.show{display:flex;}'
   + '.maru-panel{background:#FAF8F1;width:100%;max-width:520px;height:78vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -6px 30px rgba(0,0,0,.25);}'
   + '.maru-head{display:flex;align-items:center;gap:8px;padding:13px 15px;background:#E6B83C;}'
   + '.maru-title{flex:1;font-family:"Kanit";font-weight:800;font-size:16px;color:#143D26;}'
   + '.maru-spk,.maru-x,.maru-set{border:0;background:rgba(0,0,0,.08);width:34px;height:34px;border-radius:50%;font-size:16px;cursor:pointer;color:#143D26;}'
   + '.maru-cfg{display:none;flex-direction:column;gap:9px;padding:12px 15px;background:#F6F0DB;border-bottom:1px solid #ECE6D6;}'
   + '.maru-cfg.show{display:flex;}'
   + '.maru-cfg .cfg-row{display:flex;align-items:center;gap:10px;font-size:13px;color:#143D26;font-family:"Sarabun";}'
   + '.maru-cfg .cfg-row span{width:62px;flex-shrink:0;}'
   + '.maru-cfg select{flex:1;padding:6px 8px;border:1px solid #ECE6D6;border-radius:8px;font-family:"Sarabun";font-size:13px;background:#fff;}'
   + '.maru-cfg input[type=range]{flex:1;}'
   + '.maru-cfg .cfg-mute{display:flex;align-items:center;gap:7px;font-size:13px;font-family:"Sarabun";color:#143D26;}'
   + '.maru-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;}'
   + '.maru-hi{text-align:center;color:#8A8170;font-size:13px;padding:10px;}'
   + '.maru-hi .mh-av{width:92px;height:auto;display:block;margin:4px auto 8px;filter:drop-shadow(0 4px 9px rgba(120,86,0,.16));}'
   + '.maru-hi .mh-t{font-family:"Kanit";font-weight:700;font-size:15px;color:#143D26;}'
   + '.maru-hi .mh-s{font-size:12px;color:#8A8170;margin-top:3px;}'
   + '.maru-hi .mq{text-align:left;margin:14px auto 0;max-width:330px;}'
   + '.maru-hi .mqg{font-family:"Kanit";font-weight:700;font-size:11.5px;color:#7A7264;margin:11px 2px 6px;}'
   + '.maru-hi .mqr{display:flex;flex-direction:column;gap:7px;}'
   + '.maru-hi .mqc{width:100%;box-sizing:border-box;text-align:center;background:#fff;border:1.5px solid #ECE6D6;border-radius:13px;padding:11px 13px;font-size:13px;color:#143D26;cursor:pointer;font-family:"Sarabun";font-weight:600;box-shadow:0 1px 3px rgba(120,86,0,.05);}'
   + '.maru-hi .mqc:active{background:#F1E9CE;}'
   + '.maru-b{max-width:84%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;font-family:"Sarabun";}'
   + '.maru-b.me{align-self:flex-end;background:#E6B83C;color:#143D26;border-bottom-right-radius:4px;}'
   + '.maru-b.ai{align-self:flex-start;background:#fff;border:1px solid #ECE6D6;color:#143D26;border-bottom-left-radius:4px;}'
   + '.maru-b.er{align-self:center;background:#FEF2F2;color:#B91C1C;font-size:12.5px;text-align:center;}'
   + '.maru-cap{align-self:flex-start;background:#FFFCEF;border:1px solid #F2E2A8;border-radius:14px;padding:10px 12px;max-width:90%;}'
   + '.maru-cap-h{font-weight:700;color:#B8891F;font-size:13px;margin-bottom:4px;font-family:"Kanit";}'
   + '.maru-cap-b{white-space:pre-wrap;color:#143D26;font-size:14px;line-height:1.5;font-family:"Sarabun";}'
   + '.maru-cap-copy{margin-top:8px;background:#E6B83C;border:none;border-radius:999px;padding:5px 14px;font-weight:700;font-size:13px;cursor:pointer;font-family:"Sarabun";color:#143D26;}'
   + '.maru-act{align-self:stretch;background:#fff;border:1.5px solid #F2D58A;border-radius:14px;padding:12px 14px;box-shadow:0 2px 8px rgba(120,86,0,.12);}'
   + '.maru-act .ah{font-family:"Kanit";font-weight:700;font-size:14px;color:#143D26;margin-bottom:6px;}'
   + '.maru-act .ab{font-size:14px;color:#143D26;margin-bottom:8px;}'
   + '.maru-act input{width:100%;box-sizing:border-box;border:1.5px solid #E8DFC4;border-radius:10px;padding:9px 11px;font-family:"Sarabun";font-size:14px;margin-bottom:9px;}'
   + '.maru-act .abtn{display:flex;gap:8px;}'
   + '.maru-act .abtn button{flex:1;border:0;border-radius:10px;padding:10px;font-family:"Kanit";font-weight:700;font-size:14px;cursor:pointer;}'
   + '.maru-act .aok{background:#15803D;color:#fff;}'
   + '.maru-act .acancel{background:#F2EEDD;color:#5A5247;}'
   + '.maru-act .amsg{font-size:12.5px;margin-top:7px;}'
   + '.maru-poster{align-self:flex-start;max-width:92%;display:flex;flex-direction:column;}'
   + '.maru-poster img{width:100%;max-width:300px;border-radius:12px;border:1px solid #ECE6D6;display:block;}'
   + '.maru-poster .pl{font-size:12px;color:#8A8170;margin:5px 2px 2px;font-family:"Sarabun";}'
   + '.maru-dl{display:inline-block;margin-top:6px;background:#143D26;color:#E6B83C;border-radius:999px;padding:7px 16px;font-weight:700;font-size:13px;text-decoration:none;font-family:"Sarabun";align-self:flex-start;}'
   + '.maru-dots{align-self:flex-start;background:#fff;border:1px solid #ECE6D6;border-radius:14px;padding:11px 14px;display:flex;gap:4px;}'
   + '.maru-dots span{width:7px;height:7px;border-radius:50%;background:#C9C1AE;animation:marubz 1.2s infinite;}'
   + '.maru-dots span:nth-child(2){animation-delay:.2s;}.maru-dots span:nth-child(3){animation-delay:.4s;}'
   + '@keyframes marubz{0%,60%,100%{opacity:.3;transform:translateY(0);}30%{opacity:1;transform:translateY(-4px);}}'
   + '.maru-attchip{display:none;align-items:center;gap:9px;margin:8px 12px 0;padding:6px 9px;background:#F6F0DB;border:1px solid #F2E2A8;border-radius:11px;}'
   + '.maru-attchip.show{display:flex;}'
   + '.maru-attchip img{width:40px;height:40px;object-fit:cover;border-radius:8px;}'
   + '.maru-attchip .nm{flex:1;font-size:12px;color:#6B6456;font-family:"Sarabun";overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
   + '.maru-attchip .rm{border:0;background:#F1E4BC;color:#7A6A2E;border-radius:8px;padding:5px 11px;font-size:12px;font-family:"Sarabun";cursor:pointer;}'
   + '.maru-in{display:flex;gap:7px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));align-items:flex-end;border-top:1px solid #ECE6D6;background:#FAF8F1;}'
   + '.maru-in textarea{flex:1;resize:none;border:1.5px solid #ECE6D6;border-radius:13px;padding:10px 13px;font-family:"Sarabun";font-size:14px;max-height:110px;line-height:1.4;background:#fff;color:#143D26;}'
   + '.maru-in textarea:focus{outline:none;border-color:#E6B83C;}'
   + '.maru-att{width:42px;height:42px;border-radius:50%;border:1.5px solid #ECE6D6;background:#fff;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;}'
   + '.maru-attthumbs{display:flex;gap:6px;flex-wrap:wrap;flex:1;min-width:0;}'
   + '.maru-attthumbs .athumb{position:relative;width:42px;height:42px;flex:none;}'
   + '.maru-attthumbs .athumb img{width:100%;height:100%;border-radius:8px;object-fit:cover;}'
   + '.maru-attthumbs .athumb button{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#143D26;color:#fff;border:0;font-size:10px;line-height:1;cursor:pointer;padding:0;}'
   + '.maru-mic{width:42px;height:42px;border-radius:50%;border:1.5px solid #ECE6D6;background:#fff;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;}'
   + '.maru-wave{display:inline-flex;align-items:center;gap:2.5px;height:18px;}'
   + '.maru-wave i{width:3px;height:7px;background:#143D26;border-radius:2px;animation:maruwv 1.1s infinite ease-in-out;}'
   + '.maru-wave i:nth-child(2){animation-delay:.15s;}.maru-wave i:nth-child(3){animation-delay:.3s;}.maru-wave i:nth-child(4){animation-delay:.45s;}'
   + '@keyframes maruwv{0%,100%{height:6px;}50%{height:16px;}}'
   + '.maru-mic.rec{background:#FEE2E2;border-color:#FCA5A5;}'
   + '.maru-mic.rec .maru-wave i{background:#DC2626;}'
   + '.maru-send{width:42px;height:42px;border-radius:50%;border:0;background:#143D26;color:#E6B83C;font-size:17px;cursor:pointer;flex-shrink:0;}'
   + '.maru-send:disabled{opacity:.4;}'
   + '</style>'
   + '<button class="maru-fab" id="maruFab" aria-label="ผู้ช่วยกุยช่าย"><img src="maru-chick.png" alt="กุยช่าย" onerror="this.replaceWith(document.createTextNode(\'🥟\'))"></button>'
   + '<div class="maru-ov" id="maruOv"><div class="maru-panel">'
   +   '<div class="maru-head"><div class="maru-title">🥟 ผู้ช่วยกุยช่าย</div>'
   +     '<button class="maru-set" id="maruSet" title="ตั้งค่าเสียง">⚙</button>'
   +     '<button class="maru-x" id="maruX">✕</button></div>'
   +   '<div class="maru-cfg" id="maruCfg">'
   +     '<div class="cfg-row"><span>เสียง</span><select id="maruVoiceSel"></select></div>'
   +     '<div class="cfg-row"><span>ความเร็ว</span><input type="range" id="maruRateSel" min="0.7" max="1.4" step="0.1"></div>'
   +     '<label class="cfg-mute"><input type="checkbox" id="maruMuteChk"> ปิดเสียงพูด</label>'
   +     '<label class="cfg-mute"><input type="checkbox" id="maruGemVoiceChk"> เสียง Gemini (เพราะกว่า · ช้านิด)</label>'
   +     '<div class="cfg-row"><span>โทนเสียง Gemini</span><select id="maruGemVoiceSel"><option value="Leda">สดใส วัยรุ่น (Leda)</option><option value="Puck">กระฉับกระเฉง (Puck)</option><option value="Zephyr">สดใส (Zephyr)</option><option value="Fenrir">มีพลัง (Fenrir)</option><option value="Sadachbia">มีชีวิตชีวา (Sadachbia)</option><option value="Aoede">สบายๆ ผู้ใหญ่ (Aoede)</option></select></div>'
   +   '</div>'
   +   '<div class="maru-msgs" id="maruMsgs"><div class="maru-hi" id="maruHi">'
   +     '<img class="mh-av" src="Logo.png" alt="กุยช่าย">'
   +     '<div class="mh-t">สวัสดีครับ ผมผู้ช่วยกุยช่าย 🥟</div>'
   +     '<div class="mh-s">ถามข้อมูลร้าน คุยเล่น หรือแนบรูปทำโพสต์ขายของก็ได้</div>'
   +     '<div class="mq">'
   +       '<div class="mqg">💰 ยอดขาย</div><div class="mqr">'
   +         '<button class="mqc" data-q="ยอดขายวันนี้รวมเท่าไหร่ แยกตามช่องทางด้วย">ยอดขายวันนี้</button>'
   +         '<button class="mqc" data-q="ยอด Grab เดือนนี้รวมเท่าไหร่ ขอแยกรายวันด้วย">ยอด Grab เดือนนี้</button>'
   +       '</div>'
   +       '<div class="mqg">📦 สต๊อก</div><div class="mqr">'
   +         '<button class="mqc" data-q="ตอนนี้มีสินค้าอะไรใกล้หมดหรือหมดสต๊อกบ้าง">ของใกล้หมด / หมด</button>'
   +         '<button class="mqc" data-q="เบิกของล่าสุดรายการอะไร เมื่อไหร่ กี่โมง ใครเบิก">เบิกล่าสุด</button>'
   +       '</div>'
   +       '<div class="mqg">🧾 ค่าใช้จ่าย</div><div class="mqr">'
   +         '<button class="mqc" data-q="ค่าใช้จ่ายเดือนนี้รวมเท่าไหร่ คิดเป็นกี่เปอร์เซ็นต์ของยอดขาย">ค่าใช้จ่ายเดือนนี้</button>'
   +         '<button class="mqc" data-q="ขอดูรายการค่าใช้จ่ายล่าสุด 5 รายการ พร้อมวันที่และมีใบเสร็จไหม">รายการล่าสุด</button>'
   +       '</div>'
   +       '<div class="mqg">⏰ เข้างาน / เงินสด</div><div class="mqr">'
   +         '<button class="mqc" data-q="วันนี้ใครเข้างานบ้าง กี่โมง อยู่ในเขตร้านไหม">ใครเข้างานวันนี้</button>'
   +         '<button class="mqc" data-q="ตอนนี้เงินสดรอนำส่งเท่าไหร่ คำนวณจากอะไรบ้าง">เงินสดรอนำส่ง</button>'
   +       '</div>'
   +       '<div class="mqg">🎨 ทำโพสต์ / การตลาด</div><div class="mqr">'
   +         '<button class="mqc" data-help="1">ℹ️ วิธีใช้โหมดการตลาด</button>'
   +         '<button class="mqc" data-q="ทำโพสต์โปรโมชั่นลด 20% ลงเฟสบุ๊ก">ตัวอย่าง: โพสต์ลดราคา</button>'
   +       '</div>'
   +     '</div>'
   +   '</div></div>'
   +   '<div class="maru-attchip" id="maruAttChip"><div class="maru-attthumbs" id="maruAttThumbs"></div><button class="rm" id="maruAttRm">ลบ</button></div>'
   +   '<div class="maru-in">'
   +     '<button class="maru-att" id="maruAtt" title="แนบรูปทำโพสต์">📎</button>'
   +     '<input type="file" accept="image/*" id="maruImgInput" multiple style="display:none">'
   +     '<textarea id="maruInp" rows="1" placeholder="พิมพ์ข้อความ..."></textarea>'
   +     '<button class="maru-send" id="maruSend">➤</button>'
   +   '</div>'
   + '</div></div>';
}

// ===== กระดิ่งแจ้งเตือน (กุยช่ายเฝ้าร้าน — ในแอป) =====
function maruAlertMarkup(){
  return ''
   + '<style id="maruAlStyle">'
   + '.maru-bell{position:fixed;top:calc(env(safe-area-inset-top) + 12px);right:14px;width:46px;height:46px;border-radius:50%;border:0;background:#fff;box-shadow:0 3px 12px rgba(0,0,0,.18);cursor:pointer;z-index:940;display:flex;align-items:center;justify-content:center;padding:0;}'
   + '.maru-bell svg{width:22px;height:22px;stroke:#143D26;fill:none;}'
   + '.maru-bell-badge{position:absolute;top:-3px;right:-3px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#DC2626;color:#fff;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;font-family:"Sarabun";box-shadow:0 0 0 2px #fff;}'
   + '.maru-al-ov{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1500;display:none;justify-content:center;align-items:flex-start;}'
   + '.maru-al-ov.show{display:flex;}'
   + '.maru-al-panel{background:#FAF8F1;width:100%;max-width:480px;max-height:82vh;margin-top:calc(env(safe-area-inset-top) + 8px);border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.3);}'
   + '.maru-al-head{display:flex;align-items:center;gap:8px;padding:14px 16px;background:#E6B83C;}'
   + '.maru-al-head .t{flex:1;font-family:"Kanit";font-weight:800;font-size:16px;color:#143D26;}'
   + '.maru-al-head button{border:0;background:rgba(0,0,0,.08);width:32px;height:32px;border-radius:50%;font-size:15px;cursor:pointer;color:#143D26;}'
   + '.maru-al-list{overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;}'
   + '.al-empty{text-align:center;color:#8A8170;font-size:14px;padding:30px 12px;font-family:"Sarabun";line-height:1.6;}'
   + '.al-item{display:flex;gap:11px;background:#fff;border:1px solid #ECE6D6;border-left-width:4px;border-radius:12px;padding:11px 12px;}'
   + '.al-item.crit{border-left-color:#DC2626;}.al-item.warn{border-left-color:#F59E0B;}.al-item.info{border-left-color:#2563EB;}'
   + '.al-ic{font-size:15px;line-height:1.5;}'
   + '.al-body{flex:1;min-width:0;}'
   + '.al-tt{font-family:"Kanit";font-weight:700;font-size:14px;color:#143D26;}'
   + '.al-ms{font-family:"Sarabun";font-size:13px;color:#6B6456;margin-top:2px;line-height:1.45;}'
   + '.al-act{display:flex;gap:8px;margin-top:9px;}'
   + '.al-act button{border:0;border-radius:8px;padding:6px 14px;font-family:"Sarabun";font-size:12.5px;cursor:pointer;}'
   + '.al-go{background:#143D26;color:#E6B83C;}'
   + '.al-ask{background:#FFF3CC;color:#143D26;border:1px solid #F0E2B0;}'
   + '</style>'
   + '<button class="maru-bell" id="maruBell" aria-label="แจ้งเตือน">'
   +   '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
   +   '<span class="maru-bell-badge" id="maruBellBadge"></span>'
   + '</button>'
   + '<div class="maru-al-ov" id="maruAlOv"><div class="maru-al-panel">'
   +   '<div class="maru-al-head"><div class="t">🔔 แจ้งเตือนจากกุยช่าย</div><button id="maruAlX">✕</button></div>'
   +   '<div class="maru-al-list" id="maruAlList"></div>'
   + '</div></div>';
}

async function bindMaruAlerts(currentPage){
  var bell = document.getElementById('maruBell');
  var badge = document.getElementById('maruBellBadge');
  var ov = document.getElementById('maruAlOv');
  var list = document.getElementById('maruAlList');
  var xb = document.getElementById('maruAlX');
  if(!bell || !ov) return;
  var seen = []; try{ seen = JSON.parse(localStorage.getItem('maruAlertsSeen') || '[]'); }catch(e){}
  var current = [];
  function unread(){ return current.filter(function(a){ return seen.indexOf(a.id) < 0; }).length; }
  function paint(){ var n = unread(); if(n > 0){ badge.textContent = n > 9 ? '9+' : String(n); badge.style.display = 'flex'; } else { badge.style.display = 'none'; } }
  function render(){
    if(!current.length){ list.innerHTML = '<div class="al-empty">🎉 ไม่มีแจ้งเตือน<br>ทุกอย่างปกติดีครับ</div>'; return; }
    list.innerHTML = current.map(function(a){
      return '<div class="al-item ' + (a.level || 'info') + '"><div class="al-ic">' + (a.icon || '🔔') + '</div>'
        + '<div class="al-body"><div class="al-tt">' + escHtml(a.title || '') + '</div>'
        + (a.msg ? '<div class="al-ms">' + escHtml(a.msg) + '</div>' : '')
        + '<div class="al-act">'
        + (a.page ? '<button class="al-go" data-pg="' + escHtml(a.page) + '">ดู</button>' : '')
        + '<button class="al-ask" data-q="' + escHtml((a.title || '') + '. ' + (a.msg || '')) + '">ถามกุยช่าย</button>'
        + '</div></div></div>';
    }).join('');
    list.querySelectorAll('.al-go').forEach(function(b){ b.addEventListener('click', function(){ var pg = b.getAttribute('data-pg'); if(pg) window.location.href = pg; }); });
    list.querySelectorAll('.al-ask').forEach(function(b){ b.addEventListener('click', function(){ askMaru(b.getAttribute('data-q')); }); });
  }
  function markSeen(){ current.forEach(function(a){ if(seen.indexOf(a.id) < 0) seen.push(a.id); }); if(seen.length > 200) seen = seen.slice(-200); try{ localStorage.setItem('maruAlertsSeen', JSON.stringify(seen)); }catch(e){} paint(); }
  bell.addEventListener('click', function(){ ov.classList.add('show'); render(); markSeen(); });
  xb.addEventListener('click', function(){ ov.classList.remove('show'); });
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.classList.remove('show'); });
  function askMaru(q){
    ov.classList.remove('show');
    var aov = document.getElementById('maruOv'), inp = document.getElementById('maruInp');
    if(aov && inp && window.maruSend){ aov.classList.add('show'); inp.value = 'เรื่องนี้ควรทำยังไงดี: ' + q; setTimeout(function(){ window.maruSend(); }, 180); }
    else { window.location.href = 'assistant.html'; }
  }
  try{ var r = await api('getAlerts'); if(r && r.alerts){ current = r.alerts; paint(); } }catch(e){}
}

var maruHistory = [];
var maruBusy = false;
var maruRec = null;

var maruVoices = [];
function maruLoadVoices(){
  try{ maruVoices = (window.speechSynthesis ? speechSynthesis.getVoices() : []) || []; }catch(e){ maruVoices = []; }
}
if(window.speechSynthesis){
  maruLoadVoices();
  speechSynthesis.onvoiceschanged = maruLoadVoices;
}
function maruThaiVoices(){
  // เสียงไทยก่อน ตามด้วยเสียงอื่นที่พูดไทยได้
  var th = maruVoices.filter(function(v){ return /th/i.test(v.lang); });
  return th.length ? th : maruVoices;
}
function maruCleanForSpeech(text){
  var t = String(text || '');
  t = t.replace(/https?:\/\/[^\s]+/g, ' ลิงก์ ');   // ลิงก์เปล่า → ไม่อ่านออกเสียง
  t = t.replace(/```[\s\S]*?```/g, ' ');      // โค้ดบล็อก
  t = t.replace(/`([^`]*)`/g, '$1');           // โค้ดอินไลน์
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');  // รูป
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // ลิงก์ → เก็บข้อความ
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');     // หัวข้อ #
  t = t.replace(/^\s*[-*•·]\s+/gm, '');         // bullet ต้นบรรทัด
  t = t.replace(/^\s*\d+\.\s+/gm, '');          // ลำดับเลข 1.
  t = t.replace(/[*_~>#|]+/g, ' ');             // สัญลักษณ์ markdown
  t = t.replace(/[-–—]{1,}/g, ' ');             // ขีด
  t = t.replace(/[\/\\]+/g, ' ');               // สแลช
  t = t.replace(/\s{2,}/g, ' ').trim();         // ช่องว่างซ้ำ
  return t;
}
// ===== แปลงข้อความกุยช่ายเป็น HTML: ลิงก์กดได้ + รูปจากลิงก์โชว์เป็นภาพ =====
function maruRich(text){
  var esc = escHtml(String(text == null ? '' : text));
  esc = esc.replace(/(https?:\/\/[^\s<]+)/g, function(u){
    var clean = u.replace(/[.,)\]]+$/, ''), trail = u.slice(clean.length);
    var isImg = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(clean) || /(i\.ibb\.co|googleusercontent\.com|\.supabase\.co\/storage|drive\.google\.com\/uc)/i.test(clean);
    if(isImg){
      return '<a href="'+clean+'" target="_blank" rel="noopener"><img src="'+clean+'" alt="รูป" loading="lazy" style="max-width:100%;max-height:260px;border-radius:11px;margin:6px 0;display:block;border:1px solid #ECE6D6;"></a>'+trail;
    }
    return '<a href="'+clean+'" target="_blank" rel="noopener" style="color:#1E9E50;word-break:break-all;">'+clean+'</a>'+trail;
  });
  return esc.replace(/\n/g, '<br>');
}

var maruTtsAudio = null;
async function maruTtsGemini(text, onReady){
  var revealed=false; var reveal=function(){ if(!revealed){ revealed=true; if(onReady) onReady(); } };
  var safety=setTimeout(reveal, 6000);   // กันค้าง: ถ้าเสียงช้ามาก ก็โชว์ข้อความก่อนได้
  try{
    if(maruTtsAudio){ try{ maruTtsAudio.pause(); }catch(e){} maruTtsAudio=null; }
    var voice = localStorage.getItem('maruGemVoice') || 'Leda';
    var res = await fetch(EDGE_URL, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:SB_KEY }, body: JSON.stringify({ action:'ttsSpeak', text:text, voice:voice }) });
    if(!res.ok){ clearTimeout(safety); reveal(); maruDeviceSpeak(text); return; }
    var d = await res.json();
    if(!(d && d.ok && d.audio)){ clearTimeout(safety); reveal(); maruDeviceSpeak(text); return; }
    var rate = 24000; var m = String(d.mime||'').match(/rate=(\d+)/); if(m) rate = parseInt(m[1],10);
    var blob = maruPcmToWav(d.audio, rate);
    var url = URL.createObjectURL(blob);
    maruTtsAudio = new Audio(url);
    clearTimeout(safety); reveal();   // โชว์ข้อความตอนเสียงพร้อมเล่น → มาพร้อมกัน
    maruTtsAudio.play().catch(function(){});
    maruTtsAudio.onended = function(){ try{ URL.revokeObjectURL(url); }catch(e){} };
  }catch(e){ clearTimeout(safety); reveal(); maruDeviceSpeak(text); }
}
function maruPcmToWav(b64, rate){
  var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
  for(var i=0;i<len;i++) bytes[i] = bin.charCodeAt(i);
  var numCh=1, bps=16, blockAlign=numCh*bps/8, byteRate=rate*blockAlign;
  var buf = new ArrayBuffer(44+len), dv = new DataView(buf);
  function ws(o,str){ for(var i=0;i<str.length;i++) dv.setUint8(o+i, str.charCodeAt(i)); }
  ws(0,'RIFF'); dv.setUint32(4,36+len,true); ws(8,'WAVE'); ws(12,'fmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,numCh,true);
  dv.setUint32(24,rate,true); dv.setUint32(28,byteRate,true); dv.setUint16(32,blockAlign,true);
  dv.setUint16(34,bps,true); ws(36,'data'); dv.setUint32(40,len,true);
  new Uint8Array(buf,44).set(bytes);
  return new Blob([buf], { type:'audio/wav' });
}
function maruDeviceSpeak(clean){
  try{
    if(!window.speechSynthesis) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(clean);
    u.lang = 'th-TH';
    u.rate = parseFloat(localStorage.getItem('maruRate') || '1') || 1;
    var want = localStorage.getItem('maruVoice') || '';
    var list = maruThaiVoices();
    var pick = want ? list.filter(function(v){ return v.name === want; })[0] : list[0];
    if(pick) u.voice = pick;
    speechSynthesis.speak(u);
  }catch(e){}
}
function maruPlay(text){
  try{
    if(localStorage.getItem('maruMute') === '1') return;   // ปิดเสียงไว้
    var clean = maruCleanForSpeech(text);
    if(!clean) return;
    if(localStorage.getItem('maruGeminiVoice') === '1'){ maruTtsGemini(clean); return; }
    maruDeviceSpeak(clean);
  }catch(e){}
}

// ===== เฟส 2: เครื่องมือวาดรูปโปสเตอร์ (Canvas — ฟรี ไม่กินเครดิต) =====
var maruLogoImg = null, maruLogoTried = false;
function maruEnsureLogo(cb){
  if(maruLogoImg) return cb(maruLogoImg);
  if(maruLogoTried) return cb(null);
  maruLogoTried = true;
  var lg = new Image();
  lg.onload = function(){ maruLogoImg = lg; cb(lg); };
  lg.onerror = function(){ cb(null); };
  lg.src = 'apple-touch-icon.png';   // โลโก้แบรนด์สำหรับโปสเตอร์ (คนละไฟล์กับปุ่มลอย maru-chick.png)
}
function maruRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function maruFitFont(ctx, text, maxW, startPx, weight, family, minPx){
  var px = startPx; minPx = minPx || 20;
  ctx.font = weight + ' ' + px + 'px ' + family;
  while(px > minPx && ctx.measureText(text).width > maxW){ px -= 2; ctx.font = weight + ' ' + px + 'px ' + family; }
  return px;
}
// ===== โปสเตอร์ Canvas — หลายแพทเทิร์น (ผู้ใช้เลือกสไตล์เอง) =====
var MARU_KANIT = 'Kanit, Sarabun, sans-serif', MARU_SARA = 'Sarabun, sans-serif';
function maruCoverRegion(ctx, im, x, y, w, h){
  var ir = im.width/im.height, cr = w/h, dw, dh, dx, dy;
  if(ir > cr){ dh = h; dw = h*ir; dx = x+(w-dw)/2; dy = y; } else { dw = w; dh = w/ir; dx = x; dy = y+(h-dh)/2; }
  ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); ctx.drawImage(im,dx,dy,dw,dh); ctx.restore();
}
function maruBadge(ctx, logo, x, y, size, bg){
  var rr = Math.round(size*0.18);
  ctx.save(); ctx.shadowColor='rgba(0,0,0,.3)'; ctx.shadowBlur=10; ctx.shadowOffsetY=2;
  ctx.fillStyle = bg || '#E6B83C'; maruRoundRect(ctx,x,y,size,size,rr); ctx.fill(); ctx.restore();
  ctx.save(); maruRoundRect(ctx,x,y,size,size,rr); ctx.clip();
  try{ ctx.drawImage(logo,x,y,size,size); }catch(e){} ctx.restore();
}
function maruPricePill(ctx, price, x, y, W){
  ctx.font='800 '+Math.round(W*0.058)+'px '+MARU_KANIT;
  var pw=ctx.measureText(price).width, ph=Math.round(W*0.135), pwid=pw+Math.round(W*0.10);
  ctx.fillStyle='#E63329'; maruRoundRect(ctx,x-pwid,y,pwid,ph,ph/2); ctx.fill();
  ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(price,x-pwid/2,y+ph/2); ctx.textAlign='left';
  return { w:pwid, h:ph };
}

// (1) คลาสสิก — รูปเต็ม + เฉดดำล่าง
function maruTpl_classic(ctx,W,H,im,logo,P){
  maruCoverRegion(ctx,im,0,0,W,H);
  var g=ctx.createLinearGradient(0,H*0.4,0,H); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.6,'rgba(0,0,0,.45)'); g.addColorStop(1,'rgba(0,0,0,.82)');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  var pad=Math.round(W*0.06);
  if(logo) maruBadge(ctx,logo,pad,pad,Math.round(W*0.18));
  if(P.price) maruPricePill(ctx,P.price,W-pad,pad,W);
  var y=H-pad; ctx.textBaseline='alphabetic'; ctx.textAlign='left';
  if(P.note){ ctx.font='500 '+Math.round(W*0.034)+'px '+MARU_SARA; ctx.fillStyle='#FFE7A3'; ctx.fillText(P.note,pad,y); y-=Math.round(W*0.058); }
  if(P.menu){ var mp=maruFitFont(ctx,P.menu,W-pad*2,Math.round(W*0.052),'600',MARU_KANIT,24); ctx.font='600 '+mp+'px '+MARU_KANIT; ctx.fillStyle='#fff'; ctx.shadowColor='rgba(0,0,0,.4)'; ctx.shadowBlur=8; ctx.fillText(P.menu,pad,y); ctx.shadowBlur=0; y-=Math.round(mp*1.2); }
  if(P.headline){ var hp=maruFitFont(ctx,P.headline,W-pad*2,Math.round(W*0.12),'800',MARU_KANIT,36); ctx.font='800 '+hp+'px '+MARU_KANIT; ctx.fillStyle='#E6B83C'; ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=12; ctx.fillText(P.headline,pad,y); ctx.shadowBlur=0; }
}

// (2) แถบบน — แถบดำด้านบน + ป้ายราคาวงกลม
function maruTpl_topbar(ctx,W,H,im,logo,P){
  maruCoverRegion(ctx,im,0,0,W,H);
  var pad=Math.round(W*0.05), barH=Math.round(H*0.19);
  ctx.fillStyle='#143D26'; ctx.fillRect(0,0,W,barH);
  var ls=Math.round(barH*0.6); if(logo) maruBadge(ctx,logo,pad,(barH-ls)/2,ls);
  if(P.headline){ ctx.textAlign='right'; ctx.textBaseline='middle'; var hp=maruFitFont(ctx,P.headline,W-pad*2-ls-Math.round(W*0.03),Math.round(barH*0.46),'800',MARU_KANIT,26); ctx.font='800 '+hp+'px '+MARU_KANIT; ctx.fillStyle='#E6B83C'; ctx.fillText(P.headline,W-pad,barH/2); ctx.textAlign='left'; }
  var sH=Math.round(H*0.16), sy=H-sH; ctx.fillStyle='rgba(20,61,38,.72)'; ctx.fillRect(0,sy,W,sH);
  ctx.textBaseline='middle';
  if(P.menu){ var mp=maruFitFont(ctx,P.menu,W*0.62,Math.round(sH*0.34),'600',MARU_KANIT,22); ctx.font='600 '+mp+'px '+MARU_KANIT; ctx.fillStyle='#fff'; ctx.fillText(P.menu,pad,sy+sH*0.37); }
  if(P.note){ ctx.font='500 '+Math.round(sH*0.21)+'px '+MARU_SARA; ctx.fillStyle='#FFE7A3'; ctx.fillText(P.note,pad,sy+sH*0.73); }
  if(P.price){ var r=Math.round(W*0.12), cx=W-pad-r, cy=sy-r*0.15; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle='#E63329'; ctx.fill(); ctx.lineWidth=Math.round(r*0.08); ctx.strokeStyle='#fff'; ctx.stroke(); ctx.fillStyle='#fff'; ctx.textAlign='center'; var pp=maruFitFont(ctx,P.price,r*1.5,Math.round(r*0.62),'800',MARU_KANIT,18); ctx.font='800 '+pp+'px '+MARU_KANIT; ctx.fillText(P.price,cx,cy); ctx.textAlign='left'; }
}

// (3) แผงข้าง — รูปขวา + แผงเหลืองซ้าย
function maruTpl_sidepanel(ctx,W,H,im,logo,P){
  var pw=Math.round(W*0.44);
  maruCoverRegion(ctx,im,pw,0,W-pw,H);
  ctx.fillStyle='#E6B83C'; ctx.fillRect(0,0,pw,H);
  var pad=Math.round(W*0.045), iw=pw-pad*2;
  var y=pad;
  var ls=Math.round(pw*0.34); if(logo){ maruBadge(ctx,logo,pad,y,ls,'#143D26'); } y+=ls+Math.round(H*0.04);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  if(P.headline){ var hp=maruFitFont(ctx,P.headline,iw,Math.round(W*0.075),'800',MARU_KANIT,30); ctx.font='800 '+hp+'px '+MARU_KANIT; ctx.fillStyle='#143D26'; y+=hp; ctx.fillText(P.headline,pad,y); y+=Math.round(hp*0.5); }
  if(P.menu){ var mp=maruFitFont(ctx,P.menu,iw,Math.round(W*0.042),'600',MARU_KANIT,20); ctx.font='600 '+mp+'px '+MARU_KANIT; ctx.fillStyle='#12351F'; y+=mp+Math.round(H*0.01); ctx.fillText(P.menu,pad,y); }
  if(P.price){ var ph=Math.round(W*0.11), pwid=iw; y+=Math.round(H*0.03); ctx.fillStyle='#E63329'; maruRoundRect(ctx,pad,y,pwid,ph,ph*0.32); ctx.fill(); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle'; var pp=maruFitFont(ctx,P.price,pwid*0.86,Math.round(ph*0.55),'800',MARU_KANIT,20); ctx.font='800 '+pp+'px '+MARU_KANIT; ctx.fillText(P.price,pad+pwid/2,y+ph/2); y+=ph; ctx.textAlign='left'; ctx.textBaseline='alphabetic'; }
  if(P.note){ ctx.font='500 '+Math.round(W*0.03)+'px '+MARU_SARA; ctx.fillStyle='#5A4A1E'; y+=Math.round(H*0.04); ctx.fillText(P.note,pad,y); }
}

// (4) การ์ดกลาง — รูปเต็ม + การ์ดขาวโปร่งล่าง
function maruTpl_card(ctx,W,H,im,logo,P){
  maruCoverRegion(ctx,im,0,0,W,H);
  var g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'rgba(0,0,0,.15)'); g.addColorStop(1,'rgba(0,0,0,.35)'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  var pad=Math.round(W*0.05);
  if(logo) maruBadge(ctx,logo,pad,pad,Math.round(W*0.16));
  var cw=Math.round(W*0.86), cx=(W-cw)/2;
  var ch=Math.round(H*0.34), cy=H-ch-Math.round(H*0.06);
  ctx.save(); ctx.shadowColor='rgba(0,0,0,.3)'; ctx.shadowBlur=24; ctx.shadowOffsetY=6; ctx.fillStyle='rgba(255,255,255,.94)'; maruRoundRect(ctx,cx,cy,cw,ch,Math.round(W*0.05)); ctx.fill(); ctx.restore();
  var ix=cx+Math.round(cw*0.07), iw=cw-Math.round(cw*0.14), y=cy+Math.round(ch*0.06);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  if(P.headline){ var hp=maruFitFont(ctx,P.headline,iw,Math.round(W*0.078),'800',MARU_KANIT,30); ctx.font='800 '+hp+'px '+MARU_KANIT; ctx.fillStyle='#143D26'; y+=hp; ctx.fillText(P.headline,ix,y); y+=Math.round(hp*0.45); }
  if(P.menu){ var mp=maruFitFont(ctx,P.menu,iw,Math.round(W*0.044),'600',MARU_KANIT,20); ctx.font='600 '+mp+'px '+MARU_KANIT; ctx.fillStyle='#444'; y+=mp+Math.round(H*0.008); ctx.fillText(P.menu,ix,y); }
  if(P.note){ ctx.font='500 '+Math.round(W*0.03)+'px '+MARU_SARA; ctx.fillStyle='#888'; ctx.fillText(P.note,ix,cy+ch-Math.round(ch*0.10)); }
  if(P.price){ ctx.font='800 '+Math.round(W*0.07)+'px '+MARU_KANIT; ctx.fillStyle='#E63329'; ctx.textAlign='right'; ctx.fillText(P.price,cx+cw-Math.round(cw*0.07),cy+ch-Math.round(ch*0.12)); ctx.textAlign='left'; }
}

// (5) โพลารอยด์ — กรอบรูป + พื้นครีม
function maruTpl_polaroid(ctx,W,H,im,logo,P){
  ctx.fillStyle='#FBF4E4'; ctx.fillRect(0,0,W,H);
  // dots texture
  ctx.fillStyle='rgba(230,184,60,.18)';
  for(var gx=0;gx<W;gx+=Math.round(W*0.09)){ for(var gy=0;gy<H;gy+=Math.round(W*0.09)){ ctx.beginPath(); ctx.arc(gx,gy,Math.round(W*0.006),0,Math.PI*2); ctx.fill(); } }
  var fw=Math.round(W*0.78), fx=(W-fw)/2, fy=Math.round(H*0.07), border=Math.round(fw*0.05);
  var photoH=Math.round(fw*0.82);
  ctx.save(); ctx.translate(W/2, fy+ (photoH+border*2)/2); ctx.rotate(-0.03); ctx.translate(-W/2, -(fy+(photoH+border*2)/2));
  ctx.shadowColor='rgba(0,0,0,.22)'; ctx.shadowBlur=20; ctx.shadowOffsetY=8;
  ctx.fillStyle='#fff'; ctx.fillRect(fx-border, fy-border, fw+border*2, photoH+border*3); ctx.shadowBlur=0;
  maruCoverRegion(ctx,im,fx,fy,fw,photoH);
  ctx.restore();
  var y=fy+photoH+border*3+Math.round(H*0.05); var pad=Math.round(W*0.11);
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  if(P.headline){ var hp=maruFitFont(ctx,P.headline,W-pad*2,Math.round(W*0.082),'800',MARU_KANIT,30); ctx.font='800 '+hp+'px '+MARU_KANIT; ctx.fillStyle='#143D26'; y+=hp; ctx.fillText(P.headline,W/2,y); y+=Math.round(hp*0.5); }
  if(P.menu){ var mp=maruFitFont(ctx,P.menu,W-pad*2,Math.round(W*0.044),'600',MARU_KANIT,20); ctx.font='600 '+mp+'px '+MARU_KANIT; ctx.fillStyle='#6B5836'; y+=mp; ctx.fillText(P.menu,W/2,y); y+=Math.round(mp*0.6); }
  if(P.price){ ctx.font='800 '+Math.round(W*0.075)+'px '+MARU_KANIT; ctx.fillStyle='#E63329'; y+=Math.round(W*0.07); ctx.fillText(P.price,W/2,y); }
  if(P.note){ ctx.font='500 '+Math.round(W*0.032)+'px '+MARU_SARA; ctx.fillStyle='#9A8A66'; ctx.fillText(P.note,W/2,H-Math.round(H*0.05)); }
  if(logo) maruBadge(ctx,logo,W-Math.round(W*0.20),H-Math.round(W*0.20),Math.round(W*0.13));
  ctx.textAlign='left';
}

// (6) ริบบิ้นทแยง — โปรช็อก
function maruTpl_ribbon(ctx,W,H,im,logo,P){
  maruCoverRegion(ctx,im,0,0,W,H);
  var g=ctx.createLinearGradient(0,H*0.45,0,H); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,.8)'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  var pad=Math.round(W*0.06);
  if(logo) maruBadge(ctx,logo,pad,pad,Math.round(W*0.17));
  // diagonal ribbon top-right
  if(P.price || P.headline){
    var rt = P.price || P.headline;
    ctx.save(); ctx.translate(W,0); ctx.rotate(Math.PI/4);
    var rw=Math.round(W*0.62), rh=Math.round(W*0.16);
    ctx.shadowColor='rgba(0,0,0,.3)'; ctx.shadowBlur=12; ctx.fillStyle='#E63329'; ctx.fillRect(-rw/2, Math.round(W*0.04), rw, rh); ctx.shadowBlur=0;
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    var rp=maruFitFont(ctx,rt,rw*0.9,Math.round(rh*0.5),'800',MARU_KANIT,22); ctx.font='800 '+rp+'px '+MARU_KANIT;
    ctx.fillText(rt, 0, Math.round(W*0.04)+rh/2); ctx.restore(); ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  }
  var y=H-pad;
  if(P.note){ ctx.font='500 '+Math.round(W*0.034)+'px '+MARU_SARA; ctx.fillStyle='#FFD9D5'; ctx.fillText(P.note,pad,y); y-=Math.round(W*0.06); }
  if(P.menu){ var mp=maruFitFont(ctx,P.menu,W-pad*2,Math.round(W*0.05),'600',MARU_KANIT,22); ctx.font='600 '+mp+'px '+MARU_KANIT; ctx.fillStyle='#fff'; ctx.shadowColor='rgba(0,0,0,.4)'; ctx.shadowBlur=8; ctx.fillText(P.menu,pad,y); ctx.shadowBlur=0; y-=Math.round(mp*1.2); }
  if(P.headline){ var hp=maruFitFont(ctx,P.headline,W-pad*2,Math.round(W*0.11),'800',MARU_KANIT,34); ctx.font='800 '+hp+'px '+MARU_KANIT; ctx.fillStyle='#E6B83C'; ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=12; ctx.fillText(P.headline,pad,y); ctx.shadowBlur=0; }
}

var MARU_POSTER_STYLES = [
  { id:'classic',   name:'คลาสสิก',   fn:maruTpl_classic },
  { id:'topbar',    name:'แถบบน',     fn:maruTpl_topbar },
  { id:'sidepanel', name:'แผงข้าง',   fn:maruTpl_sidepanel },
  { id:'card',      name:'การ์ดกลาง', fn:maruTpl_card },
  { id:'polaroid',  name:'โพลารอยด์', fn:maruTpl_polaroid },
  { id:'ribbon',    name:'ริบบิ้นโปร', fn:maruTpl_ribbon }
];
function maruDrawPoster(imgEl, logoEl, W, H, poster, styleId){
  var st = null; for(var i=0;i<MARU_POSTER_STYLES.length;i++){ if(MARU_POSTER_STYLES[i].id===styleId) st=MARU_POSTER_STYLES[i]; }
  if(!st) st = MARU_POSTER_STYLES[0];
  var cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  var ctx=cv.getContext('2d');
  var P = poster || {};
  P = { headline:String(P.headline||'').trim(), menu:String(P.menu||'').trim(), price:String(P.price||'').trim(), note:String(P.note||'').trim() };
  ctx.fillStyle='#FBF4E4'; ctx.fillRect(0,0,W,H);
  try{ st.fn(ctx, W, H, imgEl, logoEl, P); }catch(e){ try{ maruTpl_classic(ctx,W,H,imgEl,logoEl,P); }catch(_e){} }
  return cv.toDataURL('image/png');
}


// ===== สร้าง context ของร้านจาก Supabase ให้ผู้ช่วยกุยช่าย (เฉพาะข้อมูลไม่ลับ — เงินเดือน/พนักงานทำที่ Edge) =====
async function maruBuildContext(message){
  var m = String(message || '');
  var t = {
    sales:    /ยอด|ขาย|รายได้|กำไร|พยากรณ์|วิเคราะห์|แนวโน้ม|สรุป|เมื่อวาน|วันนี้|เดือนนี้|สัปดาห์|คาดการณ์|ประเมิน|ช่องทาง|เดลิเวอรี/i.test(m),
    stock:    /สต๊อก|สต็อก|ของหมด|ใกล้หมด|วัตถุดิบ|สั่งของ|ของขาด|เตรียมของ|คงเหลือ/i.test(m),
    stockDeep:/ของเสีย|ใช้เยอะ|เปลือง|เคลื่อนไหว|สิ้นเปลือง|ทิ้ง|waste|เบิกเยอะ/i.test(m),
    attend:   /เข้างาน|ใครมา|มาทำงาน|ลงเวลา|ใครอยู่|ใครเข้า/i.test(m),
    expense:  /ค่าใช้จ่าย|รายจ่าย|จ่ายค่า|ต้นทุน/i.test(m),
    cash:     /เงินสด|เงินขาด|เงินเกิน|ส่วนต่างเงิน|ปิดยอด|รายงานสิ้นวัน|ปิดร้าน/i.test(m)
  };
  var any=false, kk; for(kk in t) if(t[kk]) any=true;
  if(!any) return '';
  var now=new Date(), today=sbFmtD(now);
  var rangeDays=60;
  if(/90 ?วัน|3 ?เดือน|ไตรมาส/i.test(m)) rangeDays=90;
  else if(/7 ?วัน|สัปดาห์/i.test(m)) rangeDays=7;
  else if(/30 ?วัน|1 ?เดือน|รายเดือน/i.test(m)) rangeDays=30;
  var dStart=sbFmtD(new Date(now.getTime()-(rangeDays-1)*86400000)), rangeLabel=rangeDays+' วัน';
  var p=[], hd=null;
  if(t.sales||t.stock||t.attend||t.expense){ try{ hd=await api('getHomeDashboard',{}); }catch(e){} }
  if(hd && t.sales){
    p.push('ยอดขายเมื่อวาน '+Math.round(hd.sales.yesterday||0)+' บาท (เทียบเฉลี่ย7วัน '+(hd.sales.compareYesterdayPct>=0?'+':'')+hd.sales.compareYesterdayPct+'%), เฉลี่ย7วัน '+Math.round(hd.sales.avg7||0)+' บาท/วัน');
    if(hd.sales.sales7days) p.push('ยอดขาย7วันล่าสุด: '+hd.sales.sales7days.map(function(x){return x.dateDM+'='+Math.round(x.sales);}).join(', '));
  }
  if(hd && t.stock){
    p.push('วันนี้คือ '+today+' (ใช้คำนวณจำนวนวันถึงวันเป้าหมายได้)');
    p.push('สต๊อก: ทั้งหมด '+hd.stock.total+' รายการ · ใกล้หมด '+hd.stock.lowStock+' · หมด '+hd.stock.outOfStock);
    var _concern = (hd.stock.forecast||[]).filter(function(x){ return x.status!=='ok' || x.belowMin; });
    if(_concern.length){
      p.push('สถานะ "ใกล้หมด/วิกฤต" คำนวณจากอัตราใช้ต่อวันเบิกจริง (วิกฤต=เหลือ≤3วัน, ใกล้หมด=≤7วัน). ส่วน "จุดเตือน (min stock)" เป็นกระดิ่งแยกที่เจ้าของตั้งเอง — ต่ำกว่าค่านี้จะมีไอคอนเตือน 🔔 ไม่เกี่ยวกับการคำนวณอัตรา.');
      p.push('รายการที่ต้องสนใจ (ชื่อ | คงเหลือ | อัตราใช้/วัน | เหลือกี่วัน | สถานะ | จุดเตือน):');
      _concern.slice(0,50).forEach(function(x){
        var st = {out:'หมดแล้ว',critical:'วิกฤต',low:'ใกล้หมด'}[x.status]||x.status;
        p.push('- '+x.name+' | เหลือ '+x.balance+(x.unit?' '+x.unit:'')+' | ใช้ ~'+x.avgDaily+'/วัน | '+(x.daysLeft!=null?('เหลือ ~'+x.daysLeft+' วัน'):'ไม่มีการเบิกช่วงนี้')+' | '+st+(x.belowMin?' | 🔔ต่ำกว่าจุดเตือน('+(x.minStock||0)+')':''));
      });
      p.push('วิธีคำนวณจำนวนที่ควรสั่งให้พอถึงวันเป้าหมาย: จำนวนสั่ง = ceil(อัตราใช้/วัน × จำนวนวันจากวันนี้ถึงวันเป้าหมาย) − คงเหลือปัจจุบัน (ถ้าได้ค่าติดลบให้ตอบ 0 = ยังพอ). ของที่ไม่มีอัตราใช้ในช่วงนี้ ให้ถามผู้ใช้แทน. ตอบเป็นตารางรายตัวพร้อมจำนวนที่ควรสั่ง.');
    }
  }
  if(hd && t.attend){
    p.push('เข้างานวันนี้: เข้า '+hd.attendance.checkedIn+'/'+hd.attendance.total+' คน · ออกแล้ว '+hd.attendance.checkedOut+' · กำลังอยู่ '+hd.attendance.present.length);
    if(hd.attendance.present && hd.attendance.present.length) p.push('คนที่กำลังอยู่: '+hd.attendance.present.map(function(x){return x.name;}).join(', '));
  }
  if(t.expense){
    try{
      var s7=sbFmtD(new Date(now.getTime()-6*86400000));
      var er7=await api('getExpensesReport',{start:s7,end:today,type:'all'});
      p.push('ค่าใช้จ่าย 7 วันล่าสุด รวม '+Math.round((er7.summary&&er7.summary.total)||0)+' บาท');
      if(er7.items && er7.items.length) p.push('รายการค่าใช้จ่ายล่าสุด: '+er7.items.slice(0,15).map(function(x){return x.dateDM+' '+x.item+' '+Math.round(x.amount)+'บ.';}).join(', '));
      var mS=today.substring(0,8)+'01';
      var erM=await api('getExpensesReport',{start:mS,end:today,type:'all'});
      p.push('ค่าใช้จ่ายเดือนนี้ รวม '+Math.round((erM.summary&&erM.summary.total)||0)+' บาท');
    }catch(e){}
  }
  if((t.sales && /พยากรณ์|วิเคราะห์|แนวโน้ม|เดือน|คาดการณ์|ประเมิน|ช่องทาง|กำไร|สรุป|เดลิเวอรี|วันไหนขาย|รายวัน|เฉลี่ย/i.test(m)) || t.cash){
    try{
      var dd=await api('getDashboardData',{start:dStart,end:today});
      if(dd && dd.summary){ var su=dd.summary;
        p.push('สรุป '+rangeLabel+' ('+sbDM(dStart)+'–'+sbDM(today)+'): ยอดรวม '+Math.round(su.totalSales)+' · เฉลี่ย '+Math.round(su.avgPerDay)+'/วัน · เปิด '+su.dayCount+' วัน · กำไรสุทธิ '+Math.round(su.netProfit)+' (ค่าใช้จ่าย '+Math.round(su.totalExpenses)+')'+(su.growth!=null?' · เทียบช่วงก่อน '+(su.growth>=0?'+':'')+Math.round(su.growth)+'%':'')+(su.bestDow?' · วันขายดีสุด '+su.bestDow:''));
        if(dd.byChannel && dd.byChannel.length) p.push('แยกช่องทาง: '+dd.byChannel.map(function(c){return c.label+' '+Math.round(c.total);}).join(', '));
        if(typeof su.cashDiff==='number' && su.cashDiff!==0) p.push('ส่วนต่างเงินสดสะสม '+rangeLabel+': '+(su.cashDiff>0?'เกิน ':'ขาด ')+Math.round(Math.abs(su.cashDiff))+' บาท');
        if(dd.byDay && dd.byDay.length) p.push('ยอดรายวัน(21วันล่าสุด): '+dd.byDay.slice(-21).map(function(o){return sbDM(o.date)+'='+Math.round(o.total);}).join(', '));
      }
    }catch(e){}
  }
  if(t.stockDeep){
    try{ var sd=await api('getStockDashboard',{start:dStart,end:today});
      if(sd && sd.summary) p.push('สต๊อกเชิงลึก '+rangeLabel+': เบิกรวม '+sd.summary.totalWdQty+' · ของเสียรวม '+sd.summary.totalWasted);
      if(sd && sd.topWasted && sd.topWasted.length) p.push('ของเสียเยอะสุด: '+sd.topWasted.slice(0,5).map(function(x){return x.name+' '+x.wasted+(x.unit||'');}).join(', '));
      if(sd && sd.topWithdrawn && sd.topWithdrawn.length) p.push('เบิกเยอะสุด: '+sd.topWithdrawn.slice(0,5).map(function(x){return x.name+' '+x.wdQty+(x.unit||'');}).join(', '));
    }catch(e){}
  }
  return p.length ? ('ข้อมูลจริงของร้าน (วันนี้ '+today+'):\n- '+p.join('\n- ')) : '';
}
window.maruBuildContext = maruBuildContext;

function maruRenderActionCard(pa){
  var msgs = document.getElementById('maruMsgs'); if(!msgs) return;
  var kindTxt = pa.kind === 'receive' ? 'รับเข้า' : 'เบิก';
  function esc(x){ return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  var w = document.createElement('div'); w.className = 'maru-act';
  w.innerHTML = '<div class="ah">📋 ยืนยัน'+kindTxt+'</div>'
    + '<div class="ab"><b>'+esc(pa.item_name)+'</b> · จำนวน '+esc(pa.qty)+' '+esc(pa.unit||'')+'</div>'
    + '<input class="aname" type="text" placeholder="ชื่อผู้ทำรายการ" value="'+esc(pa.recordedBy||'')+'">'
    + '<div class="abtn"><button class="aok">✓ ยืนยัน'+kindTxt+'</button><button class="acancel">ยกเลิก</button></div>'
    + '<div class="amsg"></div>';
  msgs.appendChild(w); msgs.scrollTop = msgs.scrollHeight;
  var nameInp = w.querySelector('.aname'), okBtn = w.querySelector('.aok'), cancelBtn = w.querySelector('.acancel'), msg = w.querySelector('.amsg'), btns = w.querySelector('.abtn');
  cancelBtn.addEventListener('click', function(){ btns.style.display='none'; msg.style.color='#9A8C6E'; msg.textContent='ยกเลิกแล้ว'; });
  okBtn.addEventListener('click', function(){
    var by = (nameInp.value||'').trim(); if(!by){ msg.style.color='#B91C1C'; msg.textContent='กรุณากรอกชื่อผู้ทำรายการ'; return; }
    okBtn.disabled = true; cancelBtn.disabled = true; okBtn.textContent = 'กำลังบันทึก...';
    api('execStockWrite', { kind:pa.kind, itemId:pa.item_id, qty:pa.qty, recordedBy:by, note:pa.note||'' })
      .then(function(res){ if(res && res.ok){ btns.style.display='none'; msg.style.color='#15803D'; msg.textContent='✓ '+(res.msg||'บันทึกแล้ว'); } else { okBtn.disabled=false; cancelBtn.disabled=false; okBtn.textContent='✓ ยืนยัน'+kindTxt; msg.style.color='#B91C1C'; msg.textContent=(res&&res.error)||'บันทึกไม่สำเร็จ'; } })
      .catch(function(e){ okBtn.disabled=false; cancelBtn.disabled=false; okBtn.textContent='✓ ยืนยัน'+kindTxt; msg.style.color='#B91C1C'; msg.textContent='ผิดพลาด: '+(e.message||e); });
  });
}

function bindMaruAssistant(currentPage){
  if(currentPage === 'assistant') return;
  var fab = document.getElementById('maruFab');
  var ov = document.getElementById('maruOv');
  var msgs = document.getElementById('maruMsgs');
  var inp = document.getElementById('maruInp');
  var sendB = document.getElementById('maruSend');
  if(!fab || !ov) return;

  fab.addEventListener('click', function(){ ov.classList.add('show'); setTimeout(function(){ inp.focus(); }, 100); });
  document.getElementById('maruX').addEventListener('click', function(){ ov.classList.remove('show'); try{ speechSynthesis.cancel(); }catch(e){} });
  ov.addEventListener('click', function(e){ if(e.target === ov){ ov.classList.remove('show'); try{ speechSynthesis.cancel(); }catch(e){} } });

  // ===== ตั้งค่าเสียง =====
  var setBtn = document.getElementById('maruSet');
  var cfg = document.getElementById('maruCfg');
  var voiceSel = document.getElementById('maruVoiceSel');
  var rateSel = document.getElementById('maruRateSel');
  var muteChk = document.getElementById('maruMuteChk');
  // ตั้งค่าใช้ได้เสมอ (มีตัวเลือกเสียง Gemini แม้ไม่มีเสียงในเครื่อง)
  function fillVoices(){
    if(!voiceSel) return;
    var list = maruThaiVoices();
    if(!list.length){ voiceSel.innerHTML = '<option value="">(เสียงเริ่มต้นของเครื่อง)</option>'; return; }
    var saved = localStorage.getItem('maruVoice') || '';
    voiceSel.innerHTML = list.map(function(v){
      var sel = (v.name === saved) ? ' selected' : '';
      return '<option value="'+escHtml(v.name)+'"'+sel+'>'+escHtml(v.name)+' ('+escHtml(v.lang)+')</option>';
    }).join('');
  }
  fillVoices();
  if(window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', fillVoices);
  if(rateSel) rateSel.value = localStorage.getItem('maruRate') || '1';
  if(muteChk) muteChk.checked = localStorage.getItem('maruMute') === '1';
  var gemChk = document.getElementById('maruGemVoiceChk');
  if(gemChk){ gemChk.checked = localStorage.getItem('maruGeminiVoice') === '1'; gemChk.addEventListener('change', function(){ localStorage.setItem('maruGeminiVoice', gemChk.checked ? '1' : '0'); }); }
  var gemVoiceSel = document.getElementById('maruGemVoiceSel');
  if(gemVoiceSel){ gemVoiceSel.value = localStorage.getItem('maruGemVoice') || 'Leda'; gemVoiceSel.addEventListener('change', function(){ localStorage.setItem('maruGemVoice', gemVoiceSel.value); maruTtsGemini('สวัสดีครับ ผมกุยช่าย เสียงนี้เป็นยังไงบ้างครับ'); }); }

  if(setBtn) setBtn.addEventListener('click', function(){ cfg.classList.toggle('show'); fillVoices(); });
  if(voiceSel) voiceSel.addEventListener('change', function(){
    localStorage.setItem('maruVoice', voiceSel.value);
    maruPlay('สวัสดีครับ เสียงนี้เป็นยังไงบ้าง');  // ลองฟังเสียงที่เลือก
  });
  if(rateSel) rateSel.addEventListener('change', function(){ localStorage.setItem('maruRate', rateSel.value); });
  if(muteChk) muteChk.addEventListener('change', function(){
    localStorage.setItem('maruMute', muteChk.checked ? '1' : '0');
    if(muteChk.checked){ try{ speechSynthesis.cancel(); }catch(e){} }
  });

  inp.addEventListener('input', function(){ inp.style.height='auto'; inp.style.height=Math.min(inp.scrollHeight,110)+'px'; });
  inp.addEventListener('keydown', function(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); maruSend(); } });
  sendB.addEventListener('click', function(){ maruSend(); });

  // ===== เฟส 2: แนบรูปทำโพสต์ =====
  var attB = document.getElementById('maruAtt');
  var imgInput = document.getElementById('maruImgInput');
  var attChip = document.getElementById('maruAttChip');
  var attThumb = document.getElementById('maruAttThumb');
  var attName = document.getElementById('maruAttName');
  var attRm = document.getElementById('maruAttRm');
  var maruPromoImgs = [];   // [{ imgEl, dataURL, name }]
  var MARU_MAX_IMGS = 3;
  var attThumbs = document.getElementById('maruAttThumbs');
  function maruRenderThumbs(){
    if(!attThumbs) return; attThumbs.innerHTML = '';
    maruPromoImgs.forEach(function(p, idx){
      var w = document.createElement('div'); w.className = 'athumb';
      var im = document.createElement('img'); im.src = p.dataURL; w.appendChild(im);
      var b = document.createElement('button'); b.type='button'; b.textContent='✕';
      b.addEventListener('click', function(){ maruPromoImgs.splice(idx,1); maruRenderThumbs(); if(!maruPromoImgs.length && attChip) attChip.classList.remove('show'); });
      w.appendChild(b); attThumbs.appendChild(w);
    });
  }
  function clearAtt(){ maruPromoImgs = []; if(attChip) attChip.classList.remove('show'); if(attThumbs) attThumbs.innerHTML=''; }
  if(attB && imgInput){
    attB.addEventListener('click', function(){ imgInput.click(); });
    imgInput.addEventListener('change', function(){
      var files = Array.prototype.slice.call(this.files||[]); this.value = '';
      if(!files.length) return;
      files.forEach(function(f){
        if(maruPromoImgs.length >= MARU_MAX_IMGS) return;
        var rd = new FileReader();
        rd.onload = function(){
          var im = new Image();
          im.onload = function(){
            if(maruPromoImgs.length >= MARU_MAX_IMGS) return;
            maruPromoImgs.push({ imgEl: im, dataURL: rd.result, name: f.name || 'รูปแนบ' });
            if(attChip) attChip.classList.add('show'); maruRenderThumbs();
          };
          im.src = rd.result;
        };
        rd.readAsDataURL(f);
      });
    });
  }
  if(attRm) attRm.addEventListener('click', clearAtt);

  // ปุ่มคำถามด่วน (ให้สอดคล้องกับหน้าผู้ช่วยหลัก)
  if(msgs){
    msgs.addEventListener('click', function(e){
      var c = (e.target && e.target.closest) ? e.target.closest('.mqc') : null;
      if(!c) return;
      if(c.getAttribute('data-help')){ maruShowMktHelp(); return; }
      inp.value = c.getAttribute('data-q') || c.textContent; maruSend();
    });
  }
  function maruShowMktHelp(){
    var t = '🎨 โหมดการตลาด — วิธีใช้\n\n'
      + '1) อยากได้โปสเตอร์ กดปุ่ม 📎 แนบรูปสินค้าก่อน (ถ้าอยากได้แค่แคปชั่น ไม่ต้องแนบก็ได้)\n'
      + '2) พิมพ์สิ่งที่ต้องการ เช่น "ทำโพสต์ลด 20% ลงเฟส" หรือ "เขียนแคปชั่นเปิดเมนูใหม่ ลง LINE"\n'
      + '   • ระบุช่องทางได้: เฟส / LINE / IG / TikTok\n'
      + '3) กุยช่ายจะร่างแคปชั่นให้ กดคัดลอกได้ ถ้าแนบรูปจะมีสไตล์โปสเตอร์ 6 แบบให้เลือก + ดาวน์โหลด\n'
      + '4) อยากให้ AI แต่งภาพ พิมพ์ "แต่งรูป" (เฉพาะจากรูปที่แนบ)';
    maruAdd(t, 'ai');
  }


  function maruAdd(text, cls){
    var hi = msgs.querySelector('.maru-hi'); if(hi) hi.remove();
    var d = document.createElement('div'); d.className='maru-b '+cls;
    if(cls==='ai'){ d.innerHTML = maruRich(text); } else { d.textContent = text; }
    msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; return d;
  }
  function maruDots(){ var d=document.createElement('div'); d.className='maru-dots'; d.id='maruDots'; d.innerHTML='<span></span><span></span><span></span>'; msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; }
  function maruNoDots(){ var d=document.getElementById('maruDots'); if(d) d.remove(); }

  // ===== เฟส 1: สร้างแคปชั่นโพสต์การตลาด (แยกอิสระจาก askAI) =====
  function maruIsPromo(text){
    return /ทำโพสต์|สร้างโพสต์|ขอโพสต์|เขียนโพสต์|โพสต์ขาย|โพสต์โปร|โพสต์ลง|ลงโพสต์|แคปชั่น|caption|ทำโฆษณา|เขียนโฆษณา|ทำโปสเตอร์|ทำป้ายโปร|ลงเฟส|ลงเพจ|ลงไอจี|ลงไลน์|ลง ?ig|ลง ?fb/i.test(text);
  }
  function maruChannelsFrom(text){
    var c = [];
    if(/เฟส|เฟซ|facebook|\bfb\b/i.test(text)) c.push('facebook');
    if(/ไลน์|line/i.test(text)) c.push('line');
    if(/ไอจี|\big\b|instagram|อินสตา/i.test(text)) c.push('instagram');
    if(/ติ๊?กต็?อก|ติ้กต็อก|tiktok/i.test(text)) c.push('tiktok');
    return c;
  }
  // เฟส 3: ผู้ใช้ขอให้ AI วาด/แต่งภาพไหม
  function maruWantsAiImage(text){
    return /วาดรูป|วาดภาพ|สร้างภาพ|แต่งรูป|แต่งภาพ|ทำภาพใหม่|ภาพใหม่|ภาพ ?ai|ai ?image|เจน(เนอ)?เรท|ออกแบบภาพ|ครีเอทภาพ|แต่งฉาก/i.test(text);
  }
  // เฟส 3: ขอเฉพาะรูป — ไม่ใส่ข้อความ/ราคา/โลโก้ทับด้วย Canvas
  function maruWantsPlainImage(text){
    return /ไม่ใส่ข้อความ|ไม่ต้องใส่ข้อความ|ไม่ต้องข้อความ|ไม่เอาข้อความ|ไม่ใส่ตัวหนังสือ|รูปเปล่า|ภาพเปล่า|แค่แต่งรูป|แต่งรูปเฉย|เฉพาะรูป|เอาแต่รูป|ไม่ต้องโพสเตอร์|ไม่ต้องราคา|ไม่ต้องโลโก|ไม่.{0,15}canvas|plain|raw/i.test(text);
  }
  var MARU_CHAN_LABEL = { facebook:'Facebook', line:'LINE', instagram:'Instagram', tiktok:'TikTok' };
  function maruAddCaption(label, text){
    var hi = msgs.querySelector('.maru-hi'); if(hi) hi.remove();
    var wrap = document.createElement('div'); wrap.className = 'maru-cap';
    var head = document.createElement('div'); head.className = 'maru-cap-h'; head.textContent = label;
    var body = document.createElement('div'); body.className = 'maru-cap-b'; body.textContent = text;
    var btn = document.createElement('button'); btn.className = 'maru-cap-copy'; btn.textContent = 'คัดลอก';
    btn.addEventListener('click', function(){
      function done(){ btn.textContent='คัดลอกแล้ว ✓'; setTimeout(function(){ btn.textContent='คัดลอก'; }, 1500); }
      function fallbackCopy(){
        var ta=document.createElement('textarea'); ta.value=text;
        ta.style.cssText='position:fixed;left:-9999px;'; document.body.appendChild(ta);
        ta.select(); try{ document.execCommand('copy'); }catch(_){ } ta.remove(); done();
      }
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(done).catch(fallbackCopy);
      } else { fallbackCopy(); }
    });
    wrap.appendChild(head); wrap.appendChild(body); wrap.appendChild(btn);
    msgs.appendChild(wrap); msgs.scrollTop = msgs.scrollHeight;
  }
  function maruAddPoster(label, dataURL){
    var hi = msgs.querySelector('.maru-hi'); if(hi) hi.remove();
    var wrap = document.createElement('div'); wrap.className = 'maru-poster';
    var im = document.createElement('img'); im.src = dataURL; im.alt = 'โปสเตอร์';
    var pl = document.createElement('div'); pl.className = 'pl'; pl.textContent = label;
    var a = document.createElement('a'); a.className = 'maru-dl'; a.href = dataURL; a.download = 'maru-promo.png'; a.textContent = '⬇ ดาวน์โหลดรูป';
    wrap.appendChild(im); wrap.appendChild(pl); wrap.appendChild(a);
    msgs.appendChild(wrap); msgs.scrollTop = msgs.scrollHeight;
  }
  function maruRenderPosterStyle(imgEl, logo, poster, styleId, styleName, needSquare, needVert){
    function build(){
      if(needSquare){ try{ maruAddPoster(styleName + ' · 1:1', maruDrawPoster(imgEl, logo, 1080, 1080, poster, styleId)); }catch(e){} }
      if(needVert){ try{ maruAddPoster(styleName + ' · 9:16', maruDrawPoster(imgEl, logo, 1080, 1920, poster, styleId)); }catch(e){} }
    }
    if(document.fonts && document.fonts.ready){ document.fonts.ready.then(build).catch(build); } else build();
  }
  function maruShowPosterPicker(imgEl, poster, chans, isAi){
    var needSquare = chans.length === 0 || chans.indexOf('facebook') >= 0 || chans.indexOf('line') >= 0 || chans.indexOf('instagram') >= 0;
    var needVert = chans.indexOf('tiktok') >= 0;
    if(!needSquare && !needVert) needSquare = true;
    maruEnsureLogo(function(logo){
      var wrap = document.createElement('div'); wrap.className = 'maru-cap';
      var head = document.createElement('div'); head.className = 'maru-cap-h';
      head.textContent = '🎨 เลือกสไตล์โปสเตอร์ (กดได้หลายแบบ)' + (isAi ? ' · ภาพแต่ง AI' : '');
      wrap.appendChild(head);
      var row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-top:9px;';
      MARU_POSTER_STYLES.forEach(function(st){
        var b = document.createElement('button'); b.type = 'button'; b.textContent = st.name;
        b.style.cssText = 'border:1.5px solid #ECE6D6;background:#fff;color:#143D26;font-family:Kanit,sans-serif;font-weight:600;font-size:13px;padding:8px 13px;border-radius:10px;cursor:pointer;';
        b.addEventListener('click', function(){ b.style.background = '#E6B83C'; b.style.borderColor = '#E6B83C'; maruRenderPosterStyle(imgEl, logo, poster, st.id, st.name, needSquare, needVert); });
        row.appendChild(b);
      });
      wrap.appendChild(row);
      var hi = msgs.querySelector('.maru-hi'); if(hi) hi.remove();
      msgs.appendChild(wrap); msgs.scrollTop = msgs.scrollHeight;
    });
  }
  async function maruPromo(text){
    var chans = maruChannelsFrom(text);
    var imgs = maruPromoImgs;            // รูปที่แนบ (อาจหลายรูป)
    var wantAi = maruWantsAiImage(text);
    // แต่งรูปด้วย AI ได้เฉพาะ "จากรูปที่แนบ" เท่านั้น — ถ้าสั่งแต่งแต่ไม่มีรูป ให้เตือน (ไม่สร้างภาพขึ้นเอง)
    if(wantAi && !imgs.length){
      maruNoDots();
      maruAdd('แต่งรูปได้เฉพาะจากรูปที่แนบมานะครับ 🥟 แนบรูปสินค้าก่อน แล้วสั่ง "แต่งรูป" อีกครั้งได้เลย','er');
      return;
    }
    try{
      // 1) แคปชั่น — ทำงานเสมอ แม้ไม่มีรูป (โหมดคิดแคปชั่นอย่างเดียว)
      var r = await api('genPromoCaption', { brief:text, channels:chans });
      maruNoDots();
      if(!(r.ok && r.captions)){ maruAdd(r.error || 'สร้างไม่สำเร็จ ลองใหม่นะครับ','er'); clearAtt(); return; }
      maruAdd('นี่คือโพสต์ที่ร่างให้ครับ 🥟 คัดลอกแคปชั่นไปโพสต์ได้เลย' + (imgs.length ? ' · เลือกสไตล์โปสเตอร์ด้านล่างได้' : ''),'ai');
      var caps = r.captions;
      var order = (r.channels && r.channels.length) ? r.channels : Object.keys(caps);
      var shown = 0;
      order.forEach(function(ch){ if(ch === 'poster' || ch === 'raw') return; if(caps[ch]){ maruAddCaption(MARU_CHAN_LABEL[ch] || ch, String(caps[ch])); shown++; } });
      if(!shown && caps.raw) maruAdd(String(caps.raw),'ai');
      var poster = caps.poster || {};
      // 2) โปสเตอร์/แต่งรูป — เฉพาะเมื่อมีรูปแนบเท่านั้น
      if(imgs.length){
        if(wantAi){
          maruAdd(imgs.length>1?'🎨 กำลังรวมรูปที่แนบเป็นภาพเดียวด้วย AI สักครู่นะครับ...':'🎨 กำลังแต่งรูปจากภาพที่แนบด้วย AI สักครู่นะครับ...','ai'); maruDots();
          var payload = { prompt:text, images: imgs.map(function(p){ return { data:(p.dataURL.split(',')[1] || ''), mime:(p.dataURL.match(/^data:(.*?);/) || [])[1] || 'image/jpeg' }; }) };
          var ir; try{ ir = await maruWithTimeout(api('genPromoImage', payload), 60000); }catch(e){ ir = { ok:false, error:'แต่งรูปนานเกินไป/เชื่อมต่อไม่ได้' }; }
          maruNoDots();
          if(ir && ir.ok && ir.image){
            var aiImg = new Image();
            aiImg.onload = function(){ maruAddPoster('ภาพแต่งด้วย AI (จากรูปที่แนบ)', ir.image); maruShowPosterPicker(aiImg, poster, chans, true); };
            aiImg.onerror = function(){ maruAdd('โหลดภาพ AI ไม่ได้ ใช้รูปเดิมทำโปสเตอร์แทนนะครับ','er'); maruShowPosterPicker(imgs[0].imgEl, poster, chans, false); };
            aiImg.src = ir.image;
          } else {
            maruAdd((ir && ir.error) || 'แต่งรูปไม่สำเร็จ ใช้รูปเดิมทำโปสเตอร์ได้','er');
            maruShowPosterPicker(imgs[0].imgEl, poster, chans, false);
          }
        } else {
          maruShowPosterPicker(imgs[0].imgEl, poster, chans, false);
        }
      }
      // ไม่มีรูปแนบ → แคปชั่นอย่างเดียว (ไม่ทำโปสเตอร์)
    }catch(e){
      maruNoDots(); maruAdd('เชื่อมต่อไม่ได้ ลองใหม่นะครับ','er');
    }
    clearAtt();
  }

  function maruWithTimeout(p, ms){
    return new Promise(function(resolve, reject){
      var to = setTimeout(function(){ reject(new Error('__timeout__')); }, ms);
      Promise.resolve(p).then(function(v){ clearTimeout(to); resolve(v); }, function(e){ clearTimeout(to); reject(e); });
    });
  }

  window.maruSend = async function(forceText){
    var text = (typeof forceText === 'string') ? forceText : inp.value.trim();
    if(!text || maruBusy) return;
    maruBusy=true; sendB.disabled=true;
    var handedOff=false;
    if(typeof forceText !== 'string'){ maruAdd(text,'me'); inp.value=''; inp.style.height='auto'; }
    maruDots();
    try{
      if(maruIsPromo(text) || maruPromoImgs.length || maruWantsAiImage(text)){ await maruPromo(text); return; }
      var owner = '';
      try{ owner = sessionStorage.getItem('maruOwner') || ''; }catch(e){}
      // เรียก AI: มี timeout 45 วิ + ลองซ้ำอัตโนมัติ 1 ครั้ง (กัน server cold start / เน็ตสะดุด)
      var maruCtx = '';
      try{ maruCtx = await maruBuildContext(text); }catch(e){}
      var r = null, lastErr = null;
      for(var attempt=0; attempt<2; attempt++){
        try{ r = await maruWithTimeout(api('askAI', { message:text, history:maruHistory, context:maruCtx, ownerCode:owner }), 45000); lastErr=null; break; }
        catch(e){ lastErr=e; if(attempt===0){ await new Promise(function(res){ setTimeout(res,800); }); } }
      }
      maruNoDots();
      if(lastErr){
        maruAdd((lastErr && lastErr.message==='__timeout__') ? 'กุยช่ายคิดนานไปหน่อย ลองถามใหม่อีกครั้งนะครับ 🥟' : 'เชื่อมต่อไม่ได้ ลองใหม่นะครับ','er');
        return;
      }
      if(r.ok && r.needOwner){
        maruAdd(r.reply,'ai');
        var code = prompt('🔒 ใส่รหัสเจ้าของ เพื่อดูข้อมูลค่าจ้าง/เงินเดือน');
        if(code){
          try{ sessionStorage.setItem('maruOwner', code); }catch(e){}
          handedOff=true; maruBusy=false; sendB.disabled=false;
          return window.maruSend(text);   // ถามซ้ำพร้อมรหัส
        }
      } else if(r.ok){
        maruHistory.push({role:'user',text:text});
        maruHistory.push({role:'model',text:r.reply});
        if(maruHistory.length>24) maruHistory = maruHistory.slice(-24);
        var __show = function(){ maruAdd(r.reply,'ai'); if(r.pendingAction){ maruRenderActionCard(r.pendingAction); } };
        if(localStorage.getItem('maruMute') === '1'){ __show(); }
        else if(localStorage.getItem('maruGeminiVoice') === '1'){ maruDots(); maruTtsGemini(r.reply, function(){ maruNoDots(); __show(); }); }   // รอเสียงพร้อม แล้วโชว์ข้อความ+เล่นพร้อมกัน
        else { __show(); maruDeviceSpeak(maruCleanForSpeech(r.reply)); }
      } else {
        maruAdd(r.error || 'ขอโทษครับ ตอบไม่ได้ตอนนี้','er');
      }
    }catch(err){
      maruNoDots(); maruAdd('เชื่อมต่อไม่ได้ ลองใหม่นะครับ','er');
    }finally{
      if(!handedOff){ maruBusy=false; sendB.disabled=false; }
    }
  };
}


// ============================================================
//  LINE แจ้งเตือน (ฝั่ง client สร้าง Flex แล้วส่งผ่าน Edge notifyLine)
// ============================================================
function mwMoney(n){ return Math.round(Number(n) || 0).toLocaleString('en-US'); }
function mwNum(v){ return Number(v) || 0; }
function mwDateDM(s){ var p = String(s).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function mwNowStr(){
  try{
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Bangkok', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(new Date());
    var o = {}; parts.forEach(function(p){ o[p.type]=p.value; });
    return o.day + '/' + o.month + '/' + o.year + ' ' + o.hour + ':' + o.minute;
  }catch(e){ return ''; }
}

// ส่งข้อความ Flex เข้า LINE (fire-and-forget ปลอดภัย — ไม่ throw)
async function maruNotifyLine(messages){
  // ยิง Edge ตรง ๆ ไม่ผ่าน api() — เพราะบางหน้า (records) เขียนทับ api แล้วไม่รู้จัก EDGE_ACTIONS
  try{
    if(!messages || !messages.length) return { ok:false };
    const res = await fetch(EDGE_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', apikey:SB_KEY },
      body: JSON.stringify({ action:'notifyLine', messages: messages })
    });
    if(!res.ok) return { ok:false, error:'Edge HTTP ' + res.status };
    return await res.json();
  }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
}

// Flex: รายงานสรุปยอดขายสิ้นวัน (เหมือนของเดิมใน Apps Script)
function maruBuildDailyFlex(data, total, totalExp, recon){
  var ch = data.sales || {};
  var dow = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  var d = new Date(data.date + 'T00:00:00');
  var net = total - totalExp;

  function row(label, amount, opts){
    opts = opts || {};
    return { type:'box', layout:'horizontal', spacing:'sm', contents:[
      { type:'text', text:label, size:'sm', color: opts.muted ? '#9CA3AF' : '#4B5563', flex:5 },
      { type:'text', text:'฿' + mwMoney(amount), size:'sm', color: opts.color || '#111827',
        weight: opts.bold ? 'bold' : 'regular', align:'end', flex:4 }
    ]};
  }
  function sectionHeader(emoji, title, accent){
    return { type:'box', layout:'horizontal', spacing:'sm', margin:'md', contents:[
      { type:'text', text: emoji + ' ' + title, size:'sm', weight:'bold', color: accent || '#143D26', flex:0 }
    ]};
  }
  function separator(){ return { type:'separator', margin:'md', color:'#F0E4C4' }; }

  var header = { type:'box', layout:'vertical', spacing:'xs', backgroundColor:'#143D26', paddingAll:'lg', contents:[
    { type:'text', text:'🥟 กุยช่ายสวรรค์', size:'lg', weight:'bold', color:'#E6B83C' },
    { type:'text', text:'รายงานสรุปยอดขายสิ้นวัน', size:'xs', color:'#D4CFC4' },
    { type:'box', layout:'horizontal', margin:'sm', contents:[
      { type:'text', text:'📅 ' + mwDateDM(data.date), size:'sm', color:'#FFFFFF', flex:5 },
      { type:'text', text:'วัน' + dow[d.getDay()], size:'sm', color:'#E6B83C', align:'end', flex:4 }
    ]}
  ]};

  var bodyContents = [];
  bodyContents.push({ type:'box', layout:'vertical', spacing:'none', contents:[
    { type:'text', text:'ยอดขายรวม', size:'xs', color:'#9CA3AF' },
    { type:'text', text:'฿' + mwMoney(total), size:'3xl', weight:'bold', color:'#B8891F' }
  ]});

  bodyContents.push(separator());
  bodyContents.push(sectionHeader('🏪', 'ยอดขายหน้าร้าน', '#1E7A45'));
  bodyContents.push(row('เงินสด', ch.cash));
  bodyContents.push(row('เงินโอน', ch.transfer));
  bodyContents.push(row('ไทยช่วยไทย', ch.thaihelp));

  bodyContents.push(separator());
  bodyContents.push(sectionHeader('🛵', 'ยอดขาย Delivery', '#1B98A4'));
  bodyContents.push(row('LineMan', ch.lineman));
  bodyContents.push(row('Grab', ch.grab));
  bodyContents.push(row('ShopeeFood', ch.shopee));
  bodyContents.push(row('Robinhood', ch.robinhood));

  bodyContents.push(separator());
  bodyContents.push(row('🧾 ค่าใช้จ่ายรวม', totalExp, { color:'#D02C2C' }));
  bodyContents.push({ type:'box', layout:'horizontal', spacing:'sm', margin:'sm', paddingAll:'sm',
    backgroundColor: net >= 0 ? '#ECFDF5' : '#FEF2F2', cornerRadius:'md', contents:[
      { type:'text', text:'✨ กำไรสุทธิ', size:'md', weight:'bold', color:'#143D26', flex:5 },
      { type:'text', text:'฿' + mwMoney(net), size:'lg', weight:'bold', color: net >= 0 ? '#059669' : '#DC2626', align:'end', flex:4 }
  ]});

  if(recon && (mwNum(recon.openingCash) || mwNum(recon.actualCash))){
    var open = mwNum(recon.openingCash), cashIn = mwNum(recon.cashIn), refund = mwNum(recon.refund);
    var cashSales = mwNum(ch.cash);
    var expected = open + cashSales + cashIn - refund - totalExp;
    var actual = mwNum(recon.actualCash);
    var diff = actual - expected;
    bodyContents.push(separator());
    bodyContents.push(sectionHeader('💵', 'ปิดรอบเงินสด', '#1E9E50'));
    bodyContents.push(row('เงินสดเริ่มต้น', open, { muted:true }));
    if(cashIn) bodyContents.push(row('เงินเข้า', cashIn, { muted:true }));
    if(refund) bodyContents.push(row('คืนเงิน', -refund, { muted:true }));
    bodyContents.push(row('เงินที่ควรมี', expected, { bold:true }));
    bodyContents.push(row('เงินจริงในลิ้นชัก', actual, { bold:true }));
    var diffLabel, diffColor, diffBg;
    if(diff === 0){ diffLabel='พอดี ✓'; diffColor='#059669'; diffBg='#ECFDF5'; }
    else if(diff > 0){ diffLabel='เกิน ฿' + mwMoney(diff); diffColor='#059669'; diffBg='#ECFDF5'; }
    else { diffLabel='ขาด ฿' + mwMoney(Math.abs(diff)) + ' ⚠️'; diffColor='#DC2626'; diffBg='#FEF2F2'; }
    bodyContents.push({ type:'box', layout:'horizontal', spacing:'sm', margin:'sm', paddingAll:'sm',
      backgroundColor:diffBg, cornerRadius:'md', contents:[
        { type:'text', text:'ส่วนต่าง', size:'sm', weight:'bold', color:'#143D26', flex:4 },
        { type:'text', text:diffLabel, size:'sm', weight:'bold', color:diffColor, align:'end', flex:5 }
    ]});
  }

  if((recon && recon.closeStaff) || data.note){
    bodyContents.push(separator());
    if(recon && recon.closeStaff){
      bodyContents.push({ type:'box', layout:'horizontal', spacing:'sm', contents:[
        { type:'text', text:'👤 พนักงานปิดรอบ', size:'xs', color:'#9CA3AF', flex:5 },
        { type:'text', text:recon.closeStaff, size:'sm', weight:'bold', color:'#143D26', align:'end', flex:5, wrap:true }
      ]});
    }
    if(data.note){
      bodyContents.push({ type:'box', layout:'vertical', spacing:'xs', margin:'sm', paddingAll:'sm',
        backgroundColor:'#F6F0DB', cornerRadius:'md', contents:[
          { type:'text', text:'📝 หมายเหตุประจำวัน', size:'xs', color:'#8A6A00', weight:'bold' },
          { type:'text', text:String(data.note), size:'sm', color:'#143D26', wrap:true }
      ]});
    }
  }

  var footer = { type:'box', layout:'vertical', paddingAll:'sm', contents:[
    { type:'text', text:'บันทึกอัตโนมัติ · ' + mwNowStr(), size:'xxs', color:'#9CA3AF', align:'center' }
  ]};

  return {
    type:'flex',
    altText:'🥟 กุยช่ายสวรรค์ · รายงานสิ้นวัน ' + mwDateDM(data.date) + ' · ยอดขายรวม ฿' + mwMoney(total),
    contents:{ type:'bubble', size:'mega', header:header,
      body:{ type:'box', layout:'vertical', spacing:'sm', paddingAll:'lg', contents:bodyContents },
      footer:footer, styles:{ footer:{ separator:true, separatorColor:'#F0E4C4' } } }
  };
}


// ----- Flex: ปิดร้าน (สรุปเบิกประจำวัน) -----
function maruBuildStockFlex(date, branch, staff, itemsArr, dailyRows){
  var dow = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  var dd = new Date(date + 'T00:00:00');
  var itemsMap = {}; (itemsArr||[]).forEach(function(it){ itemsMap[it.id] = it; });
  var byCat = { Waffle:[], KUFF:[], Drink:[], Other:[] }, wasteList = [], lowStock = [];
  (dailyRows||[]).forEach(function(o){
    var id = o.item_id, cat = itemsMap[id] ? itemsMap[id].category : 'Other';
    var used = mwNum(o.used), waste = mwNum(o.waste), closing = mwNum(o.balance);
    var minS = itemsMap[id] ? mwNum(itemsMap[id].minStock) : 0;
    var unit = itemsMap[id] ? (itemsMap[id].unit || '') : '';
    if(!byCat[cat]) cat = 'Other';
    if(used > 0) byCat[cat].push({ name:o.item_name, used:used, unit:unit });
    if(waste > 0) wasteList.push({ name:o.item_name, waste:waste, unit:unit });
    if(minS > 0 && closing <= minS && itemsMap[id] && itemsMap[id].active) lowStock.push({ name:o.item_name, closing:closing, unit:unit, minS:minS });
  });
  var catIcons = { Waffle:'🧁', KUFF:'🥐', Drink:'🥤', Other:'📦' };
  var catNames = { Waffle:'Waffle', KUFF:'KUFF', Drink:'Drink', Other:'อื่นๆ' };
  var bodyContents = [], totalCount = 0;
  ['Waffle','KUFF','Drink','Other'].forEach(function(cat){
    if(!byCat[cat].length) return;
    bodyContents.push({ type:'text', text:catIcons[cat] + ' ' + catNames[cat], size:'sm', weight:'bold', color:'#1E7A45', margin:(totalCount ? 'md' : 'none') });
    byCat[cat].forEach(function(it){ totalCount++;
      bodyContents.push({ type:'box', layout:'horizontal', spacing:'sm', contents:[
        { type:'text', text:'  · ' + it.name, size:'sm', color:'#4B5563', flex:7, wrap:true },
        { type:'text', text:it.used + ' ' + it.unit, size:'sm', color:'#143D26', weight:'bold', align:'end', flex:3 }
      ]});
    });
  });
  if(totalCount === 0) bodyContents.push({ type:'text', text:'(ไม่มีการเบิก/ใช้ของในวันนี้)', size:'sm', color:'#9CA3AF', align:'center', margin:'md' });
  if(wasteList.length){
    bodyContents.push({ type:'separator', margin:'lg', color:'#F0E4C4' });
    bodyContents.push({ type:'text', text:'🗑️ ของเสีย', size:'sm', weight:'bold', color:'#D02C2C', margin:'md' });
    wasteList.forEach(function(w){
      bodyContents.push({ type:'box', layout:'horizontal', spacing:'sm', contents:[
        { type:'text', text:'  · ' + w.name, size:'sm', color:'#4B5563', flex:7, wrap:true },
        { type:'text', text:w.waste + ' ' + w.unit, size:'sm', color:'#D02C2C', weight:'bold', align:'end', flex:3 }
      ]});
    });
  }
  if(lowStock.length){
    var alertContents = [{ type:'text', text:'⚠️ ของใกล้หมด (' + lowStock.length + ' รายการ)', size:'sm', weight:'bold', color:'#92400E' }];
    lowStock.slice(0,10).forEach(function(lo){
      alertContents.push({ type:'box', layout:'horizontal', spacing:'sm', margin:'xs', contents:[
        { type:'text', text:'· ' + lo.name, size:'xs', color:'#78350F', flex:7, wrap:true },
        { type:'text', text:'เหลือ ' + lo.closing + ' ' + lo.unit, size:'xs', color:'#92400E', weight:'bold', align:'end', flex:4 }
      ]});
    });
    if(lowStock.length > 10) alertContents.push({ type:'text', text:'…และอีก ' + (lowStock.length - 10) + ' รายการ', size:'xs', color:'#92400E', margin:'xs', align:'center' });
    bodyContents.push({ type:'separator', margin:'lg', color:'#F0E4C4' });
    bodyContents.push({ type:'box', layout:'vertical', margin:'md', paddingAll:'md', backgroundColor:'#FEF3C7', cornerRadius:'md', contents:alertContents });
  }
  return { type:'flex', altText:'🥟 กุยช่ายสวรรค์ · สรุปเบิก ' + mwDateDM(date) + ' · ' + totalCount + ' รายการ',
    contents:{ type:'bubble', size:'mega',
      header:{ type:'box', layout:'vertical', spacing:'xs', backgroundColor:'#143D26', paddingAll:'lg', contents:[
        { type:'text', text:'🥟 กุยช่ายสวรรค์', size:'lg', weight:'bold', color:'#E6B83C' },
        { type:'text', text:'สรุปรายงานเบิกประจำวัน', size:'xs', color:'#D4CFC4' },
        { type:'box', layout:'horizontal', margin:'sm', contents:[
          { type:'text', text:'📅 ' + mwDateDM(date), size:'sm', color:'#FFFFFF', flex:5 },
          { type:'text', text:'วัน' + dow[dd.getDay()], size:'sm', color:'#E6B83C', align:'end', flex:4 }
        ]}
      ]},
      body:{ type:'box', layout:'vertical', spacing:'sm', paddingAll:'lg', contents:bodyContents },
      footer:{ type:'box', layout:'vertical', paddingAll:'sm', contents:[{ type:'text', text:'👤 ' + (staff || '-') + ' · ' + branch, size:'xxs', color:'#9CA3AF', align:'center' }] },
      styles:{ footer:{ separator:true, separatorColor:'#F0E4C4' } } } };
}

// ----- Flex: ออดิทสต๊อก -----
function maruBuildAuditFlex(date, branch, staff, auditRows, adjustedCount){
  var dow = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  var dd = new Date(date + 'T00:00:00');
  var disc = (auditRows||[]).filter(function(o){ return Math.abs(mwNum(o.diff)) > 0.01; });
  var ok = (auditRows||[]).length - disc.length;
  var body = [];
  body.push({ type:'box', layout:'horizontal', spacing:'sm', margin:'none', contents:[
    { type:'box', layout:'vertical', flex:1, backgroundColor:'#F0FDF4', paddingAll:'sm', cornerRadius:'md', contents:[
      { type:'text', text:'ตรงระบบ', size:'xxs', color:'#15803D' },
      { type:'text', text:String(ok), size:'xxl', weight:'bold', color:'#15803D' } ]},
    { type:'box', layout:'vertical', flex:1, backgroundColor:'#FEF2F2', paddingAll:'sm', cornerRadius:'md', contents:[
      { type:'text', text:'ส่วนต่าง', size:'xxs', color:'#B91C1C' },
      { type:'text', text:String(disc.length), size:'xxl', weight:'bold', color:'#B91C1C' } ]}
  ]});
  if(disc.length){
    body.push({ type:'separator', margin:'lg', color:'#F0E4C4' });
    body.push({ type:'text', text:'⚠️ รายการที่ไม่ตรง', size:'sm', weight:'bold', color:'#B91C1C', margin:'md' });
    disc.slice(0,10).forEach(function(o){
      var diff = mwNum(o.diff), sign = diff > 0 ? '+' : '';
      body.push({ type:'box', layout:'horizontal', spacing:'sm', margin:'xs', contents:[
        { type:'text', text:'· ' + o.item_name, size:'sm', color:'#4B5563', flex:7, wrap:true },
        { type:'text', text:sign + diff, size:'sm', color: diff > 0 ? '#15803D' : '#B91C1C', weight:'bold', align:'end', flex:3 }
      ]});
    });
    if(disc.length > 10) body.push({ type:'text', text:'…และอีก ' + (disc.length - 10) + ' รายการ', size:'xs', color:'#9CA3AF', margin:'xs', align:'center' });
  } else {
    body.push({ type:'text', text:'✓ ทุกรายการตรงกับระบบ', size:'sm', color:'#15803D', align:'center', margin:'lg', weight:'bold' });
  }
  if(adjustedCount > 0){
    body.push({ type:'separator', margin:'lg', color:'#F0E4C4' });
    body.push({ type:'box', layout:'vertical', margin:'md', paddingAll:'sm', backgroundColor:'#FEF3C7', cornerRadius:'md',
      contents:[{ type:'text', text:'🔧 ปรับคงเหลือ ' + adjustedCount + ' รายการ ตามที่นับจริง', size:'sm', weight:'bold', color:'#92400E', wrap:true }] });
  }
  return { type:'flex', altText:'🥟 กุยช่ายสวรรค์ · ออดิทสต๊อก ' + mwDateDM(date) + ' · ส่วนต่าง ' + disc.length + ' รายการ',
    contents:{ type:'bubble', size:'mega',
      header:{ type:'box', layout:'vertical', spacing:'xs', backgroundColor:'#143D26', paddingAll:'lg', contents:[
        { type:'text', text:'🥟 กุยช่ายสวรรค์', size:'lg', weight:'bold', color:'#E6B83C' },
        { type:'text', text:'🔍 ออดิทสต๊อก', size:'xs', color:'#D4CFC4' },
        { type:'box', layout:'horizontal', margin:'sm', contents:[
          { type:'text', text:'📅 ' + mwDateDM(date), size:'sm', color:'#FFFFFF', flex:5 },
          { type:'text', text:'วัน' + dow[dd.getDay()], size:'sm', color:'#E6B83C', align:'end', flex:4 }
        ]}
      ]},
      body:{ type:'box', layout:'vertical', spacing:'sm', paddingAll:'lg', contents:body },
      footer:{ type:'box', layout:'vertical', paddingAll:'sm', contents:[{ type:'text', text:'👤 ' + (staff || '-') + ' · ' + branch + ' · ตรวจ ' + (auditRows||[]).length + ' รายการ', size:'xxs', color:'#9CA3AF', align:'center' }] },
      styles:{ footer:{ separator:true, separatorColor:'#F0E4C4' } } } };
}

// ----- Flex: เข้า-ออกงาน -----
function maruBuildAttendFlex(d){
  var dow = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  var dt = new Date(d.date + 'T00:00:00');
  var typeLabel = d.type === 'in' ? '🟢 เข้างาน' : '🔴 ออกงาน';
  var typeColor = d.type === 'in' ? '#15803D' : '#D02C2C';
  var geofenceLabel = d.inGeofence ? '✓ ในเขตร้าน' : '⚠️ นอกเขตร้าน (' + Math.round(d.distance) + ' m)';
  var geofenceColor = d.inGeofence ? '#15803D' : '#1E7A45';
  var bubble = { type:'bubble', size:'mega',
    header:{ type:'box', layout:'vertical', spacing:'xs', backgroundColor:'#143D26', paddingAll:'lg', contents:[
      { type:'text', text:'🥟 กุยช่ายสวรรค์', size:'lg', weight:'bold', color:'#E6B83C' },
      { type:'text', text:'⏰ บันทึกเข้า-ออกงาน', size:'xs', color:'#D4CFC4' },
      { type:'box', layout:'horizontal', margin:'sm', contents:[
        { type:'text', text:'📅 ' + mwDateDM(d.date), size:'sm', color:'#FFFFFF', flex:5 },
        { type:'text', text:'วัน' + dow[dt.getDay()], size:'sm', color:'#E6B83C', align:'end', flex:4 }
      ]}
    ]},
    body:{ type:'box', layout:'vertical', spacing:'md', paddingAll:'lg', contents:[
      { type:'text', text:typeLabel + ' · ' + d.time, size:'xl', weight:'bold', color:typeColor, align:'center' },
      { type:'text', text:'👤 ' + d.name + (d.nick ? ' (' + d.nick + ')' : ''), size:'md', weight:'bold', color:'#143D26', align:'center' },
      { type:'separator', color:'#F0E4C4' },
      { type:'text', text:geofenceLabel, size:'sm', color:geofenceColor, weight:'bold' },
      { type:'text', text:'📍 ' + (d.address || '-'), size:'xs', color:'#6B5F4A', wrap:true }
    ]},
    footer:{ type:'box', layout:'vertical', paddingAll:'sm', contents:[{ type:'text', text:'🏪 ' + (d.branch || '-'), size:'xxs', color:'#9CA3AF', align:'center' }] },
    styles:{ footer:{ separator:true, separatorColor:'#F0E4C4' } } };
  if(d.imgUrl) bubble.hero = { type:'image', url:d.imgUrl, size:'full', aspectRatio:'1:1', aspectMode:'cover', action:{ type:'uri', uri:d.imgUrl } };
  return { type:'flex', altText:'🥟 ' + (d.type === 'in' ? 'เข้างาน' : 'ออกงาน') + ' · ' + d.name + ' · ' + d.time, contents:bubble };
}
